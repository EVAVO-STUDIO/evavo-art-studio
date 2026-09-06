import sharp from "sharp";
import type { ImageReviewProfileName } from "./image-review-profiles.js";

export const IMAGE_ARTIFACT_SIGNALS_CONTRACT = "evavo.image-artifact-signals.v1" as const;

export interface ImageArtifactSignalSpec {
  readonly profile?: ImageReviewProfileName;
  readonly ringingContrastThreshold?: number;
  readonly minimumPosterizationPixels?: number;
}

export interface ImageArtifactSignals {
  readonly contract: typeof IMAGE_ARTIFACT_SIGNALS_CONTRACT;
  readonly width: number;
  readonly height: number;
  readonly visiblePixels: number;
  readonly ringingCandidatePixels: number;
  readonly ringingRiskRatio: number;
  readonly occupiedLumaBins: number;
  readonly posterizationRisk: boolean;
  readonly nearestNeighbourUpscaleRisk: boolean;
  readonly nearestNeighbourPairAgreement: number;
  readonly warnings: readonly string[];
}

function finite(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
}

function integer(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be ${min}..${max}.`);
  return value;
}

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Advisory artifact signals. They never authorize rejection without profile/context review. */
export async function detectImageArtifactSignals(encoded: Buffer, spec: ImageArtifactSignalSpec = {}): Promise<ImageArtifactSignals> {
  if (!Buffer.isBuffer(encoded) || encoded.length === 0) throw new Error("Artifact signal input is empty.");
  const decoded = await sharp(encoded, { failOn: "error" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = decoded.info.width;
  const height = decoded.info.height;
  const raw = decoded.data;
  const contrastThreshold = finite(spec.ringingContrastThreshold, 34, 1, 255, "ringingContrastThreshold");
  const minimumPosterizationPixels = integer(spec.minimumPosterizationPixels, 10_000, 64, 100_000_000, "minimumPosterizationPixels");
  const bins = new Uint32Array(256);
  let visiblePixels = 0;
  let ringingCandidatePixels = 0;
  let lumaSum = 0;
  let lumaSq = 0;
  let horizontalPairMatches = 0;
  let horizontalPairCount = 0;
  let verticalPairMatches = 0;
  let verticalPairCount = 0;

  const index = (x: number, y: number) => (y * width + x) * 4;
  const sampleLuma = (x: number, y: number) => {
    const i = index(x, y);
    return luma(raw[i]!, raw[i + 1]!, raw[i + 2]!);
  };
  const visible = (x: number, y: number) => raw[index(x, y) + 3]! >= 128;
  const sameRgb = (x1: number, y1: number, x2: number, y2: number) => {
    const a = index(x1, y1);
    const b = index(x2, y2);
    return raw[a] === raw[b] && raw[a + 1] === raw[b + 1] && raw[a + 2] === raw[b + 2] && raw[a + 3] === raw[b + 3];
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = index(x, y);
      if (raw[i + 3]! < 128) continue;
      visiblePixels += 1;
      const lum = luma(raw[i]!, raw[i + 1]!, raw[i + 2]!);
      lumaSum += lum;
      lumaSq += lum * lum;
      bins[Math.max(0, Math.min(255, Math.round(lum)))] += 1;

      if (x > 0 && x + 1 < width && visible(x - 1, y) && visible(x + 1, y)) {
        const left = sampleLuma(x - 1, y);
        const right = sampleLuma(x + 1, y);
        const neighbourMean = (left + right) / 2;
        const edgeSpan = Math.abs(left - right);
        if (edgeSpan >= contrastThreshold && Math.abs(lum - neighbourMean) >= contrastThreshold * 0.55 && (lum < Math.min(left, right) || lum > Math.max(left, right))) ringingCandidatePixels += 1;
      }
      if (y > 0 && y + 1 < height && visible(x, y - 1) && visible(x, y + 1)) {
        const top = sampleLuma(x, y - 1);
        const bottom = sampleLuma(x, y + 1);
        const neighbourMean = (top + bottom) / 2;
        const edgeSpan = Math.abs(top - bottom);
        if (edgeSpan >= contrastThreshold && Math.abs(lum - neighbourMean) >= contrastThreshold * 0.55 && (lum < Math.min(top, bottom) || lum > Math.max(top, bottom))) ringingCandidatePixels += 1;
      }

      if (x % 2 === 1 && visible(x - 1, y)) {
        horizontalPairCount += 1;
        if (sameRgb(x - 1, y, x, y)) horizontalPairMatches += 1;
      }
      if (y % 2 === 1 && visible(x, y - 1)) {
        verticalPairCount += 1;
        if (sameRgb(x, y - 1, x, y)) verticalPairMatches += 1;
      }
    }
  }

  const occupiedLumaBins = bins.reduce((count, amount) => count + (amount > 0 ? 1 : 0), 0);
  const mean = visiblePixels ? lumaSum / visiblePixels : 0;
  const stdDev = visiblePixels ? Math.sqrt(Math.max(0, lumaSq / visiblePixels - mean * mean)) : 0;
  const ringingRiskRatio = visiblePixels ? ringingCandidatePixels / visiblePixels : 0;
  const pairAgreement = Math.max(
    horizontalPairCount ? horizontalPairMatches / horizontalPairCount : 0,
    verticalPairCount ? verticalPairMatches / verticalPairCount : 0,
  );
  const photographicProfile = spec.profile === "photo" || spec.profile === "web-hero" || spec.profile === "ui-screenshot";
  const posterizationRisk = photographicProfile && visiblePixels >= minimumPosterizationPixels && stdDev >= 15 && occupiedLumaBins < 56;
  const nearestNeighbourUpscaleRisk = photographicProfile && width >= 128 && height >= 128 && pairAgreement > 0.82;
  const warnings: string[] = [];
  if (ringingRiskRatio > 0.012 && spec.profile !== "pixel-art") warnings.push(`ringing-or-oversharpen-risk:${(ringingRiskRatio * 100).toFixed(3)}%`);
  if (posterizationRisk) warnings.push(`posterization-risk:${occupiedLumaBins}-luma-bins`);
  if (nearestNeighbourUpscaleRisk) warnings.push(`nearest-neighbour-upscale-fingerprint:${pairAgreement.toFixed(3)}`);

  return Object.freeze({
    contract: IMAGE_ARTIFACT_SIGNALS_CONTRACT,
    width,
    height,
    visiblePixels,
    ringingCandidatePixels,
    ringingRiskRatio,
    occupiedLumaBins,
    posterizationRisk,
    nearestNeighbourUpscaleRisk,
    nearestNeighbourPairAgreement: pairAgreement,
    warnings: Object.freeze(warnings),
  });
}
