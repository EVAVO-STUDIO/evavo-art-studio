import sharp from "sharp";
import { createExistingImageDifferenceProof } from "./existing-image-diff.js";

export type ExistingImageQualityGrade = "pass" | "warn" | "fail";
export type ExistingImageTransparentRgbMode = "off" | "edge-only" | "all";

export interface ExistingImageQualitySpec {
  readonly minimumSharpness?: number;
  readonly minimumLumaStdDev?: number;
  readonly transparentRgbDetectionMode?: ExistingImageTransparentRgbMode;
  readonly maximumTransparentRgbContaminationRatio?: number;
  readonly maximumEdgeHaloRiskRatio?: number;
  readonly maximumPinholeRatio?: number;
  readonly maximumBlockinessRatio?: number;
}

export interface ExistingImageQualityEvidence {
  readonly width: number;
  readonly height: number;
  readonly hasAlpha: boolean;
  readonly megapixels: number;
  readonly metricDomain: "alpha-weighted-visible-pixels";
  readonly transparentRgbDetectionMode: ExistingImageTransparentRgbMode;
  readonly visiblePixelRatio: number;
  readonly alphaWeightRatio: number;
  readonly lumaMean: number;
  readonly lumaStdDev: number;
  readonly shadowClipRatio: number;
  readonly highlightClipRatio: number;
  readonly sharpness: number;
  readonly detailEnergy: number;
  readonly semiTransparentPixelRatio: number;
  readonly transparentRgbContaminationRatio: number;
  readonly edgeHaloRiskRatio: number;
  readonly alphaPinholeRatio: number;
  readonly blockinessRatio: number;
  readonly score: number;
  readonly grade: ExistingImageQualityGrade;
  readonly issues: readonly string[];
}

export interface ExistingImageEditReviewSpec extends ExistingImageQualitySpec {
  readonly maximumChangedPixelRatio?: number;
  readonly maximumSharpnessRegressionRatio?: number;
  readonly maximumHaloRegression?: number;
  readonly maximumPinholeRegression?: number;
  readonly preserveOpaqueRgb?: boolean;
}

export interface ExistingImageEditReviewResult {
  readonly evidence: Readonly<{
    source: ExistingImageQualityEvidence;
    edited: ExistingImageQualityEvidence;
    changedPixelRatio: number;
    opaqueRgbChangedPixels: number;
    alphaChangedPixels: number;
    regressions: readonly string[];
    improvements: readonly string[];
    verdict: ExistingImageQualityGrade;
    approvedForPromotion: boolean;
  }>;
  readonly proofPng: Buffer;
  readonly differenceProofPng: Buffer;
}

function finite(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
}

function resolveTransparentRgbMode(value: ExistingImageTransparentRgbMode | undefined): ExistingImageTransparentRgbMode {
  const mode = value ?? "edge-only";
  if (mode !== "off" && mode !== "edge-only" && mode !== "all") throw new Error("transparentRgbDetectionMode must be off, edge-only or all.");
  return mode;
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function sampleOffset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

async function rawRgba(encoded: Buffer) {
  const decoded = await sharp(encoded, { failOn: "error" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (!decoded.info.width || !decoded.info.height) throw new Error("Image quality review input has no dimensions.");
  const meta = await sharp(encoded, { failOn: "error" }).metadata();
  return { width: decoded.info.width, height: decoded.info.height, raw: decoded.data, hasAlpha: meta.hasAlpha ?? false };
}

function hasVisibleNeighbour(rgba: Buffer, width: number, height: number, x: number, y: number, radius = 2): boolean {
  for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy += 1) {
    for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx += 1) {
      if (xx === x && yy === y) continue;
      if (rgba[sampleOffset(width, xx, yy) + 3]! > 8) return true;
    }
  }
  return false;
}

function analysePixels(width: number, height: number, rgba: Buffer, transparentRgbDetectionMode: ExistingImageTransparentRgbMode) {
  const total = width * height;
  let visiblePixels = 0;
  let alphaWeightSum = 0;
  let lumaWeightedSum = 0;
  let lumaWeightedSq = 0;
  let shadowWeight = 0;
  let highlightWeight = 0;
  let semiTransparent = 0;
  let transparentRgbContaminated = 0;
  let edgePixels = 0;
  let haloRisk = 0;
  let pinholes = 0;
  let gradientWeightedSum = 0;
  let gradientWeightedSq = 0;
  let gradientWeight = 0;
  let boundaryWeightedDiff = 0;
  let boundaryWeight = 0;
  let interiorWeightedDiff = 0;
  let interiorWeight = 0;

  const rgbaAt = (x: number, y: number) => {
    const i = sampleOffset(width, x, y);
    return { luma: luminance(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!), alpha: rgba[i + 3]! };
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = sampleOffset(width, x, y);
      const r = rgba[i]!;
      const g = rgba[i + 1]!;
      const b = rgba[i + 2]!;
      const a = rgba[i + 3]!;
      const alphaWeight = a / 255;
      const l = luminance(r, g, b);
      if (a > 0) visiblePixels += 1;
      alphaWeightSum += alphaWeight;
      if (alphaWeight > 0) {
        lumaWeightedSum += l * alphaWeight;
        lumaWeightedSq += l * l * alphaWeight;
        if (l <= 5) shadowWeight += alphaWeight;
        if (l >= 250) highlightWeight += alphaWeight;
      }
      if (a > 0 && a < 255) semiTransparent += 1;
      if (a === 0 && (r !== 0 || g !== 0 || b !== 0) && transparentRgbDetectionMode !== "off") {
        if (transparentRgbDetectionMode === "all" || hasVisibleNeighbour(rgba, width, height, x, y)) transparentRgbContaminated += 1;
      }

      if (x > 0) {
        const neighbour = rgbaAt(x - 1, y);
        const pairWeight = Math.min(alphaWeight, neighbour.alpha / 255);
        if (pairWeight > 0) {
          const d = Math.abs(l - neighbour.luma);
          gradientWeightedSum += d * pairWeight;
          gradientWeightedSq += d * d * pairWeight;
          gradientWeight += pairWeight;
          if (x % 8 === 0) { boundaryWeightedDiff += d * pairWeight; boundaryWeight += pairWeight; }
          else { interiorWeightedDiff += d * pairWeight; interiorWeight += pairWeight; }
        }
      }
      if (y > 0) {
        const neighbour = rgbaAt(x, y - 1);
        const pairWeight = Math.min(alphaWeight, neighbour.alpha / 255);
        if (pairWeight > 0) {
          const d = Math.abs(l - neighbour.luma);
          gradientWeightedSum += d * pairWeight;
          gradientWeightedSq += d * d * pairWeight;
          gradientWeight += pairWeight;
          if (y % 8 === 0) { boundaryWeightedDiff += d * pairWeight; boundaryWeight += pairWeight; }
          else { interiorWeightedDiff += d * pairWeight; interiorWeight += pairWeight; }
        }
      }

      if (a > 0 && a < 245) {
        let donorR = 0;
        let donorG = 0;
        let donorB = 0;
        let donors = 0;
        for (let yy = Math.max(0, y - 2); yy <= Math.min(height - 1, y + 2); yy += 1) {
          for (let xx = Math.max(0, x - 2); xx <= Math.min(width - 1, x + 2); xx += 1) {
            if (xx === x && yy === y) continue;
            const di = sampleOffset(width, xx, yy);
            if (rgba[di + 3]! < 245) continue;
            donorR += rgba[di]!;
            donorG += rgba[di + 1]!;
            donorB += rgba[di + 2]!;
            donors += 1;
          }
        }
        if (donors > 0) {
          edgePixels += 1;
          const dr = donorR / donors;
          const dg = donorG / donors;
          const db = donorB / donors;
          const colourDistance = Math.sqrt((r - dr) ** 2 + (g - dg) ** 2 + (b - db) ** 2);
          const donorLuma = luminance(dr, dg, db);
          const lumaDeviation = Math.abs(l - donorLuma);
          const nearWhite = r > 230 && g > 230 && b > 230 && donorLuma < 205;
          const nearBlack = r < 24 && g < 24 && b < 24 && donorLuma > 50;
          if (colourDistance > 95 || lumaDeviation > 75 || nearWhite || nearBlack) haloRisk += 1;
        }
      }

      if (a <= 32 && x > 0 && y > 0 && x < width - 1 && y < height - 1) {
        let opaqueNeighbours = 0;
        for (let yy = y - 1; yy <= y + 1; yy += 1) {
          for (let xx = x - 1; xx <= x + 1; xx += 1) {
            if (xx === x && yy === y) continue;
            if (rgba[sampleOffset(width, xx, yy) + 3]! >= 223) opaqueNeighbours += 1;
          }
        }
        if (opaqueNeighbours >= 6) pinholes += 1;
      }
    }
  }

  const safeAlphaWeight = alphaWeightSum > 0 ? alphaWeightSum : 1;
  const mean = alphaWeightSum > 0 ? lumaWeightedSum / safeAlphaWeight : 0;
  const stdDev = alphaWeightSum > 0 ? Math.sqrt(Math.max(0, lumaWeightedSq / safeAlphaWeight - mean * mean)) : 0;
  const detailEnergy = gradientWeight ? gradientWeightedSum / gradientWeight : 0;
  const sharpness = gradientWeight ? Math.sqrt(gradientWeightedSq / gradientWeight) : 0;
  const boundaryMean = boundaryWeight ? boundaryWeightedDiff / boundaryWeight : 0;
  const interiorMean = interiorWeight ? interiorWeightedDiff / interiorWeight : 0;
  const blockinessRatio = interiorMean > 0 ? boundaryMean / interiorMean : 1;

  return {
    metricDomain: "alpha-weighted-visible-pixels" as const,
    transparentRgbDetectionMode,
    visiblePixelRatio: visiblePixels / total,
    alphaWeightRatio: alphaWeightSum / total,
    lumaMean: mean,
    lumaStdDev: stdDev,
    shadowClipRatio: shadowWeight / safeAlphaWeight,
    highlightClipRatio: highlightWeight / safeAlphaWeight,
    sharpness,
    detailEnergy,
    semiTransparentPixelRatio: semiTransparent / total,
    transparentRgbContaminationRatio: transparentRgbContaminated / total,
    edgeHaloRiskRatio: edgePixels ? haloRisk / edgePixels : 0,
    alphaPinholeRatio: pinholes / total,
    blockinessRatio,
  };
}

export async function reviewExistingImageQuality(encoded: Buffer, spec: ExistingImageQualitySpec = {}): Promise<ExistingImageQualityEvidence> {
  if (encoded.byteLength === 0) throw new Error("Image quality review input is empty.");
  const decoded = await rawRgba(encoded);
  const transparentRgbDetectionMode = resolveTransparentRgbMode(spec.transparentRgbDetectionMode);
  const metrics = analysePixels(decoded.width, decoded.height, decoded.raw, transparentRgbDetectionMode);
  const minimumSharpness = finite(spec.minimumSharpness, 10, 0, 255, "minimumSharpness");
  const minimumLumaStdDev = finite(spec.minimumLumaStdDev, 14, 0, 128, "minimumLumaStdDev");
  const maximumTransparentRgbContaminationRatio = finite(spec.maximumTransparentRgbContaminationRatio, 0.001, 0, 1, "maximumTransparentRgbContaminationRatio");
  const maximumEdgeHaloRiskRatio = finite(spec.maximumEdgeHaloRiskRatio, 0.08, 0, 1, "maximumEdgeHaloRiskRatio");
  const maximumPinholeRatio = finite(spec.maximumPinholeRatio, 0.0002, 0, 1, "maximumPinholeRatio");
  const maximumBlockinessRatio = finite(spec.maximumBlockinessRatio, 1.65, 1, 8, "maximumBlockinessRatio");

  const issues: string[] = [];
  let score = 100;
  if (metrics.alphaWeightRatio === 0) { issues.push("fully-transparent-no-visible-artwork"); score -= 55; }
  if (metrics.alphaWeightRatio > 0 && metrics.sharpness < minimumSharpness) { issues.push(`soft-or-blurry:${metrics.sharpness.toFixed(2)}<${minimumSharpness.toFixed(2)}`); score -= 24; }
  if (metrics.alphaWeightRatio > 0 && metrics.lumaStdDev < minimumLumaStdDev) { issues.push(`flat-low-contrast:${metrics.lumaStdDev.toFixed(2)}`); score -= 10; }
  if (metrics.shadowClipRatio > 0.45) { issues.push(`heavy-shadow-clipping:${(metrics.shadowClipRatio * 100).toFixed(2)}%`); score -= 8; }
  if (metrics.highlightClipRatio > 0.25) { issues.push(`heavy-highlight-clipping:${(metrics.highlightClipRatio * 100).toFixed(2)}%`); score -= 8; }
  if (metrics.transparentRgbContaminationRatio > maximumTransparentRgbContaminationRatio) { issues.push(`dirty-transparent-rgb:${(metrics.transparentRgbContaminationRatio * 100).toFixed(4)}%`); score -= 18; }
  if (metrics.edgeHaloRiskRatio > maximumEdgeHaloRiskRatio) { issues.push(`edge-halo-risk:${(metrics.edgeHaloRiskRatio * 100).toFixed(2)}%`); score -= 22; }
  if (metrics.alphaPinholeRatio > maximumPinholeRatio) { issues.push(`alpha-pinholes:${(metrics.alphaPinholeRatio * 100).toFixed(4)}%`); score -= 14; }
  if (metrics.blockinessRatio > maximumBlockinessRatio) { issues.push(`jpeg-blockiness-risk:${metrics.blockinessRatio.toFixed(2)}x`); score -= 12; }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade: ExistingImageQualityGrade = score < 72 || issues.some((issue) => issue.startsWith("edge-halo-risk") || issue.startsWith("soft-or-blurry") || issue === "fully-transparent-no-visible-artwork")
    ? "fail"
    : score < 88 || issues.length ? "warn" : "pass";

  return Object.freeze({
    width: decoded.width,
    height: decoded.height,
    hasAlpha: decoded.hasAlpha,
    megapixels: (decoded.width * decoded.height) / 1_000_000,
    ...metrics,
    score,
    grade,
    issues: Object.freeze(issues),
  });
}

async function labelledPreview(encoded: Buffer, label: string, background: string): Promise<Buffer> {
  const width = 640;
  const height = 420;
  const preview = await sharp(encoded, { failOn: "error" }).resize({ width, height, fit: "contain", background }).flatten({ background }).png().toBuffer();
  const labelSvg = Buffer.from(`<svg width="${width}" height="42" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#080808"/><text x="16" y="28" font-family="Arial,sans-serif" font-size="18" fill="#ffffff">${label}</text></svg>`);
  return sharp({ create: { width, height: height + 42, channels: 4, background: "#080808" } }).composite([{ input: preview, left: 0, top: 0 }, { input: labelSvg, left: 0, top: height }]).png().toBuffer();
}

export async function reviewExistingImageEdit(sourceEncoded: Buffer, editedEncoded: Buffer, spec: ExistingImageEditReviewSpec = {}): Promise<ExistingImageEditReviewResult> {
  const source = await reviewExistingImageQuality(sourceEncoded, spec);
  const edited = await reviewExistingImageQuality(editedEncoded, spec);
  const maximumChangedPixelRatio = finite(spec.maximumChangedPixelRatio, 0.35, 0, 1, "maximumChangedPixelRatio");
  const diff = await createExistingImageDifferenceProof(sourceEncoded, editedEncoded, { maximumChangedPixelRatio });
  const regressions: string[] = [];
  const improvements: string[] = [];

  if (source.width !== edited.width || source.height !== edited.height) regressions.push("dimensions-changed");
  if ((spec.preserveOpaqueRgb ?? true) && diff.evidence.opaqueRgbChangedPixels > 0) regressions.push(`opaque-rgb-changed:${diff.evidence.opaqueRgbChangedPixels}`);
  if (!diff.evidence.withinMaximumChangedPixelRatio) regressions.push(`change-surface-too-large:${(diff.evidence.changedPixelRatio * 100).toFixed(2)}%`);

  const maximumSharpnessRegressionRatio = finite(spec.maximumSharpnessRegressionRatio, 0.12, 0, 1, "maximumSharpnessRegressionRatio");
  if (source.sharpness > 0 && edited.sharpness < source.sharpness * (1 - maximumSharpnessRegressionRatio)) regressions.push(`sharpness-regressed:${source.sharpness.toFixed(2)}->${edited.sharpness.toFixed(2)}`);
  else if (source.sharpness > 0 && edited.sharpness > source.sharpness * 1.06) improvements.push(`sharpness-improved:${source.sharpness.toFixed(2)}->${edited.sharpness.toFixed(2)}`);

  const maximumHaloRegression = finite(spec.maximumHaloRegression, 0.01, 0, 1, "maximumHaloRegression");
  if (edited.edgeHaloRiskRatio > source.edgeHaloRiskRatio + maximumHaloRegression) regressions.push("edge-halo-risk-increased");
  else if (edited.edgeHaloRiskRatio + 0.005 < source.edgeHaloRiskRatio) improvements.push("edge-halo-risk-reduced");

  const maximumPinholeRegression = finite(spec.maximumPinholeRegression, 0.00005, 0, 1, "maximumPinholeRegression");
  if (edited.alphaPinholeRatio > source.alphaPinholeRatio + maximumPinholeRegression) regressions.push("alpha-pinholes-increased");
  else if (edited.alphaPinholeRatio < source.alphaPinholeRatio) improvements.push("alpha-pinholes-reduced");

  if (edited.transparentRgbContaminationRatio > source.transparentRgbContaminationRatio + 0.00005) regressions.push("transparent-rgb-contamination-increased");
  else if (edited.transparentRgbContaminationRatio < source.transparentRgbContaminationRatio) improvements.push("transparent-rgb-contamination-reduced");
  if (edited.blockinessRatio > Math.max(1.65, source.blockinessRatio * 1.15)) regressions.push("compression-blockiness-increased");
  if (edited.score > source.score) improvements.push(`quality-score-improved:${source.score}->${edited.score}`);
  if (edited.score + 8 < source.score) regressions.push(`quality-score-regressed:${source.score}->${edited.score}`);

  const verdict: ExistingImageQualityGrade = regressions.length > 0 || edited.grade === "fail" ? "fail" : edited.grade === "warn" ? "warn" : "pass";
  const approvedForPromotion = verdict === "pass" && regressions.length === 0;

  const previews = await Promise.all([
    labelledPreview(sourceEncoded, `SOURCE • quality ${source.score}/100`, "#ffffff"),
    labelledPreview(editedEncoded, `EDITED • quality ${edited.score}/100`, "#ffffff"),
    labelledPreview(sourceEncoded, "SOURCE • hostile black background", "#000000"),
    labelledPreview(editedEncoded, "EDITED • hostile black background", "#000000"),
  ]);
  const previewHeight = (await sharp(previews[0]).metadata()).height ?? 462;
  const proofPng = await sharp({ create: { width: 1280, height: previewHeight * 2 + 16, channels: 4, background: "#111111" } })
    .composite([
      { input: previews[0], left: 0, top: 0 },
      { input: previews[1], left: 640, top: 0 },
      { input: previews[2], left: 0, top: previewHeight + 16 },
      { input: previews[3], left: 640, top: previewHeight + 16 },
    ]).png().toBuffer();

  return {
    evidence: Object.freeze({
      source,
      edited,
      changedPixelRatio: diff.evidence.changedPixelRatio,
      opaqueRgbChangedPixels: diff.evidence.opaqueRgbChangedPixels,
      alphaChangedPixels: diff.evidence.alphaChangedPixels,
      regressions: Object.freeze(regressions),
      improvements: Object.freeze(improvements),
      verdict,
      approvedForPromotion,
    }),
    proofPng,
    differenceProofPng: diff.proofPng,
  };
}
