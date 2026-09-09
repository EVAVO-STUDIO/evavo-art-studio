import sharp from "sharp";
import type { ImageReviewProfileName } from "./image-review-profiles.js";

export const IMAGE_GENERATED_DETAIL_RISK_CONTRACT = "evavo.generated-detail-artifact-risk.v1" as const;

export interface ImageGeneratedDetailRiskSpec {
  readonly profile?: ImageReviewProfileName;
  readonly sampleSize?: number;
  readonly tileSize?: number;
  readonly alphaVisibleThreshold?: number;
  readonly minimumPatchStdDev?: number;
  readonly maximumPatchStructureDistance?: number;
  readonly maximumPatchToneDifference?: number;
  readonly minimumRepeatedPatchRatio?: number;
  readonly minimumRepeatedClusterSize?: number;
  readonly maximumDetailP90ToMedianRatio?: number;
}

export interface ImageGeneratedDetailRiskEvidence {
  readonly contract: typeof IMAGE_GENERATED_DETAIL_RISK_CONTRACT;
  readonly profile: ImageReviewProfileName | null;
  readonly sampleSize: number;
  readonly tileSize: number;
  readonly visibleTileCount: number;
  readonly eligibleRepeatedPatternTileCount: number;
  readonly repeatedPatchPairCount: number;
  readonly repeatedPatchRatio: number;
  readonly largestRepeatedCluster: number;
  readonly repeatedDetailRisk: boolean;
  readonly detailEnergyP10: number;
  readonly detailEnergyMedian: number;
  readonly detailEnergyP90: number;
  readonly detailEnergyP90ToMedianRatio: number;
  readonly detailImbalanceRisk: boolean;
  readonly repetitionSuppressedForProfile: boolean;
  readonly warnings: readonly string[];
  readonly interpretation: string;
  readonly visualChecks: readonly string[];
  readonly advisoryOnly: true;
  readonly aiOriginDetection: "not-claimed";
}

type Patch = Readonly<{
  gridX: number;
  gridY: number;
  mean: number;
  stdDev: number;
  detailEnergy: number;
  structure: readonly number[];
}>;

function integer(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} through ${max}.`);
  return value;
}

function bounded(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
}

function positive(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  const resolved = bounded(value, fallback, min, max, label);
  if (resolved <= 0) throw new Error(`${label} must be greater than 0.`);
  return resolved;
}

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const clip = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

function percentile(values: readonly number[], fraction: number): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.round((ordered.length - 1) * fraction)));
  return ordered[index]!;
}

function structureDistance(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  if (!length) return 1;
  let total = 0;
  for (let index = 0; index < length; index += 1) total += Math.abs(a[index]! - b[index]!);
  return total / length / 4;
}

function nonLocal(a: Patch, b: Patch): boolean {
  return Math.max(Math.abs(a.gridX - b.gridX), Math.abs(a.gridY - b.gridY)) >= 2;
}

class UnionFind {
  readonly parent: number[];
  readonly rank: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
    this.rank = Array.from({ length: size }, () => 0);
  }

  find(value: number): number {
    const parent = this.parent[value]!;
    if (parent !== value) this.parent[value] = this.find(parent);
    return this.parent[value]!;
  }

  union(a: number, b: number): void {
    let rootA = this.find(a);
    let rootB = this.find(b);
    if (rootA === rootB) return;
    if (this.rank[rootA]! < this.rank[rootB]!) [rootA, rootB] = [rootB, rootA];
    this.parent[rootB] = rootA;
    if (this.rank[rootA] === this.rank[rootB]) this.rank[rootA] = this.rank[rootA]! + 1;
  }
}

function repetitionSuppressed(profile: ImageReviewProfileName | undefined): boolean {
  return profile === "pixel-art" || profile === "texture" || profile === "ui-screenshot" || profile === "logo-transparent";
}

/**
 * Advisory low-level triage for repeated nontrivial local patterns and abnormal
 * local detail distribution. These signals can occur in generated, cloned,
 * tiled or intentionally patterned artwork and therefore never prove origin.
 */
export async function detectGeneratedDetailArtifactRisk(
  encoded: Buffer,
  spec: ImageGeneratedDetailRiskSpec = {},
): Promise<ImageGeneratedDetailRiskEvidence> {
  if (!Buffer.isBuffer(encoded) || encoded.length === 0) throw new Error("Generated-detail artifact review input is empty.");
  const sampleSize = integer(spec.sampleSize, 96, 48, 192, "sampleSize");
  const tileSize = integer(spec.tileSize, 8, 4, 24, "tileSize");
  if (sampleSize % tileSize !== 0) throw new Error("sampleSize must be evenly divisible by tileSize.");
  const alphaVisibleThreshold = integer(spec.alphaVisibleThreshold, 24, 0, 254, "alphaVisibleThreshold");
  const minimumPatchStdDev = positive(spec.minimumPatchStdDev, 10, 1, 128, "minimumPatchStdDev");
  const maximumPatchStructureDistance = positive(spec.maximumPatchStructureDistance, 0.08, 0.005, 0.5, "maximumPatchStructureDistance");
  const maximumPatchToneDifference = positive(spec.maximumPatchToneDifference, 0.12, 0.005, 1, "maximumPatchToneDifference");
  const minimumRepeatedPatchRatio = positive(spec.minimumRepeatedPatchRatio, 0.22, 0.01, 1, "minimumRepeatedPatchRatio");
  const minimumRepeatedClusterSize = integer(spec.minimumRepeatedClusterSize, 4, 2, 64, "minimumRepeatedClusterSize");
  const maximumDetailP90ToMedianRatio = positive(spec.maximumDetailP90ToMedianRatio, 3.5, 1.1, 20, "maximumDetailP90ToMedianRatio");

  const decoded = await sharp(encoded, { failOn: "error" })
    .ensureAlpha()
    .resize(sampleSize, sampleSize, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer();
  const raw = decoded;
  const index = (x: number, y: number) => (y * sampleSize + x) * 4;
  const grid = sampleSize / tileSize;
  const repetitionPatches: Patch[] = [];
  const detailEnergies: number[] = [];
  let visibleTileCount = 0;

  for (let gridY = 0; gridY < grid; gridY += 1) {
    for (let gridX = 0; gridX < grid; gridX += 1) {
      const values: number[] = [];
      let visible = 0;
      let detailSum = 0;
      let detailSamples = 0;
      for (let localY = 0; localY < tileSize; localY += 1) {
        for (let localX = 0; localX < tileSize; localX += 1) {
          const x = gridX * tileSize + localX;
          const y = gridY * tileSize + localY;
          const i = index(x, y);
          if (raw[i + 3]! <= alphaVisibleThreshold) continue;
          visible += 1;
          const value = luma(raw[i]!, raw[i + 1]!, raw[i + 2]!);
          values.push(value);
          if (localX > 0) {
            const left = index(x - 1, y);
            if (raw[left + 3]! > alphaVisibleThreshold) {
              detailSum += Math.abs(value - luma(raw[left]!, raw[left + 1]!, raw[left + 2]!)) / 255;
              detailSamples += 1;
            }
          }
          if (localY > 0) {
            const top = index(x, y - 1);
            if (raw[top + 3]! > alphaVisibleThreshold) {
              detailSum += Math.abs(value - luma(raw[top]!, raw[top + 1]!, raw[top + 2]!)) / 255;
              detailSamples += 1;
            }
          }
        }
      }
      if (visible < tileSize * tileSize * 0.75 || values.length === 0) continue;
      visibleTileCount += 1;
      const detailEnergy = detailSamples ? detailSum / detailSamples : 0;
      detailEnergies.push(detailEnergy);
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
      const stdDev = Math.sqrt(variance);
      if (stdDev < minimumPatchStdDev) continue;

      const blocksPerSide = 4;
      const blockSize = tileSize / blocksPerSide;
      if (!Number.isInteger(blockSize)) continue;
      const structure: number[] = [];
      for (let blockY = 0; blockY < blocksPerSide; blockY += 1) {
        for (let blockX = 0; blockX < blocksPerSide; blockX += 1) {
          let blockSum = 0;
          let blockCount = 0;
          for (let y = 0; y < blockSize; y += 1) {
            for (let x = 0; x < blockSize; x += 1) {
              const px = gridX * tileSize + blockX * blockSize + x;
              const py = gridY * tileSize + blockY * blockSize + y;
              const i = index(px, py);
              if (raw[i + 3]! <= alphaVisibleThreshold) continue;
              blockSum += luma(raw[i]!, raw[i + 1]!, raw[i + 2]!);
              blockCount += 1;
            }
          }
          const blockMean = blockCount ? blockSum / blockCount : mean;
          structure.push(clip((blockMean - mean) / Math.max(1, stdDev), -2, 2));
        }
      }
      repetitionPatches.push(Object.freeze({ gridX, gridY, mean, stdDev, detailEnergy, structure: Object.freeze(structure) }));
    }
  }

  const union = new UnionFind(repetitionPatches.length);
  const repeatedMembers = new Set<number>();
  let repeatedPatchPairCount = 0;
  for (let left = 0; left < repetitionPatches.length; left += 1) {
    for (let right = left + 1; right < repetitionPatches.length; right += 1) {
      const a = repetitionPatches[left]!;
      const b = repetitionPatches[right]!;
      if (!nonLocal(a, b)) continue;
      const toneDifference = Math.abs(a.mean - b.mean) / 255;
      if (toneDifference > maximumPatchToneDifference) continue;
      if (structureDistance(a.structure, b.structure) > maximumPatchStructureDistance) continue;
      repeatedPatchPairCount += 1;
      repeatedMembers.add(left);
      repeatedMembers.add(right);
      union.union(left, right);
    }
  }

  const clusterSizes = new Map<number, number>();
  for (const member of repeatedMembers) {
    const root = union.find(member);
    clusterSizes.set(root, (clusterSizes.get(root) ?? 0) + 1);
  }
  const largestRepeatedCluster = clusterSizes.size ? Math.max(...clusterSizes.values()) : 0;
  const repeatedPatchRatio = repetitionPatches.length ? repeatedMembers.size / repetitionPatches.length : 0;
  const detailEnergyP10 = percentile(detailEnergies, 0.1);
  const detailEnergyMedian = percentile(detailEnergies, 0.5);
  const detailEnergyP90 = percentile(detailEnergies, 0.9);
  const detailEnergyP90ToMedianRatio = detailEnergyMedian > 0.002
    ? detailEnergyP90 / detailEnergyMedian
    : detailEnergyP90 > 0.02
      ? detailEnergyP90 / 0.002
      : 1;
  const suppressed = repetitionSuppressed(spec.profile);
  const repeatedDetailRisk = !suppressed
    && repetitionPatches.length >= 8
    && repeatedPatchRatio >= minimumRepeatedPatchRatio
    && largestRepeatedCluster >= minimumRepeatedClusterSize;
  const detailImbalanceRisk = !suppressed
    && visibleTileCount >= 12
    && detailEnergyP90 >= 0.05
    && detailEnergyP90ToMedianRatio >= maximumDetailP90ToMedianRatio;

  const warnings: string[] = [];
  if (repeatedDetailRisk) {
    warnings.push(`repeated-nontrivial-local-pattern-risk:cluster=${largestRepeatedCluster}:ratio=${repeatedPatchRatio.toFixed(3)}:pairs=${repeatedPatchPairCount}`);
  }
  if (detailImbalanceRisk) {
    warnings.push(`local-detail-density-imbalance:p90=${detailEnergyP90.toFixed(4)}:median=${detailEnergyMedian.toFixed(4)}:ratio=${detailEnergyP90ToMedianRatio.toFixed(3)}`);
  }

  return Object.freeze({
    contract: IMAGE_GENERATED_DETAIL_RISK_CONTRACT,
    profile: spec.profile ?? null,
    sampleSize,
    tileSize,
    visibleTileCount,
    eligibleRepeatedPatternTileCount: repetitionPatches.length,
    repeatedPatchPairCount,
    repeatedPatchRatio: round6(repeatedPatchRatio),
    largestRepeatedCluster,
    repeatedDetailRisk,
    detailEnergyP10: round6(detailEnergyP10),
    detailEnergyMedian: round6(detailEnergyMedian),
    detailEnergyP90: round6(detailEnergyP90),
    detailEnergyP90ToMedianRatio: round6(detailEnergyP90ToMedianRatio),
    detailImbalanceRisk,
    repetitionSuppressedForProfile: suppressed,
    warnings: Object.freeze(warnings),
    interpretation: "Advisory defect triage only. Repeated or uneven local detail can come from generated imagery, cloning, tiling, compression, intentional patterns or normal composition; these measurements do not identify authorship.",
    visualChecks: Object.freeze([
      "Inspect flagged repeated-detail areas for cloned motifs, doubled objects, duplicated texture fragments or nonsensical recurring micro-structures.",
      "Inspect high-detail and low-detail regions together to decide whether local complexity is intentional focus/depth-of-field or an inconsistent rendering artifact.",
      "Do not treat this signal as AI detection; use source provenance and semantic visual review for origin questions.",
    ]),
    advisoryOnly: true,
    aiOriginDetection: "not-claimed",
  });
}
