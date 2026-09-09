import sharp from "sharp";

export const ENHANCEMENT_STRUCTURE_RISK_CONTRACT = "evavo.enhancement-structure-risk.v1" as const;

export interface EnhancementStructureRiskSpec {
  readonly gridColumns?: number;
  readonly gridRows?: number;
  readonly blurSigma?: number;
  readonly patchLumaErrorThreshold?: number;
  readonly patchChromaErrorThreshold?: number;
  readonly patchAlphaErrorThreshold?: number;
}

export interface EnhancementStructureRiskResult {
  readonly contract: typeof ENHANCEMENT_STRUCTURE_RISK_CONTRACT;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly candidateWidth: number;
  readonly candidateHeight: number;
  readonly candidateScaleX: number;
  readonly candidateScaleY: number;
  readonly gridColumns: number;
  readonly gridRows: number;
  readonly blurSigma: number;
  readonly globalLumaError: number;
  readonly globalChromaError: number;
  readonly globalAlphaError: number;
  readonly structureRiskPatchFraction: number;
  readonly alphaRiskPatchFraction: number;
  readonly maximumPatchLumaError: number;
  readonly maximumPatchChromaError: number;
  readonly maximumPatchAlphaError: number;
  readonly patches: readonly Readonly<{
    column: number;
    row: number;
    lumaError: number;
    chromaError: number;
    alphaError: number;
    structureRisk: boolean;
    alphaRisk: boolean;
  }>[];
  readonly reviewRequired: true;
  readonly automaticRejectionAllowed: false;
}

function integer(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} through ${max}.`);
  return value;
}

function finite(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
}

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

async function imageInfo(buffer: Buffer) {
  const meta = await sharp(buffer, { failOn: "error" }).metadata();
  if (!meta.width || !meta.height) throw new Error("Enhancement structure review image has no dimensions.");
  return { width: meta.width, height: meta.height, hasAlpha: meta.hasAlpha ?? false };
}

async function sourceSpaceRgba(buffer: Buffer, width: number, height: number, blurSigma: number): Promise<Buffer> {
  let pipeline = sharp(buffer, { failOn: "error" })
    .ensureAlpha()
    .resize(width, height, { fit: "fill", kernel: "lanczos3" });
  if (blurSigma > 0.3) pipeline = pipeline.blur(blurSigma);
  return pipeline.raw().toBuffer();
}

function patchMetrics(
  source: Buffer,
  candidate: Buffer,
  width: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
) {
  let lumaSum = 0;
  let chromaSum = 0;
  let alphaSum = 0;
  let weightSum = 0;
  let count = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const i = (y * width + x) * 4;
      const sr = source[i]!;
      const sg = source[i + 1]!;
      const sb = source[i + 2]!;
      const sa = source[i + 3]! / 255;
      const cr = candidate[i]!;
      const cg = candidate[i + 1]!;
      const cb = candidate[i + 2]!;
      const ca = candidate[i + 3]! / 255;
      const weight = Math.max(sa, ca, 0.05);
      const sourceLuma = luminance(sr, sg, sb);
      const candidateLuma = luminance(cr, cg, cb);
      const lumaError = Math.abs(sourceLuma - candidateLuma);
      const chromaError = Math.sqrt((sr - cr) ** 2 + (sg - cg) ** 2 + (sb - cb) ** 2) / (255 * Math.sqrt(3));
      lumaSum += lumaError * weight;
      chromaSum += chromaError * weight;
      alphaSum += Math.abs(sa - ca);
      weightSum += weight;
      count += 1;
    }
  }
  return {
    lumaError: weightSum ? lumaSum / weightSum : 0,
    chromaError: weightSum ? chromaSum / weightSum : 0,
    alphaError: count ? alphaSum / count : 0,
  };
}

export async function reviewEnhancementStructureRisk(
  source: Buffer,
  candidate: Buffer,
  spec: EnhancementStructureRiskSpec = {},
): Promise<EnhancementStructureRiskResult> {
  if (!source?.length || !candidate?.length) throw new Error("Source and candidate image buffers are required.");
  const gridColumns = integer(spec.gridColumns, 6, 2, 12, "gridColumns");
  const gridRows = integer(spec.gridRows, 6, 2, 12, "gridRows");
  const blurSigma = finite(spec.blurSigma, 1.6, 0.3, 8, "blurSigma");
  const patchLumaErrorThreshold = finite(spec.patchLumaErrorThreshold, 0.18, 0.02, 0.8, "patchLumaErrorThreshold");
  const patchChromaErrorThreshold = finite(spec.patchChromaErrorThreshold, 0.20, 0.02, 0.8, "patchChromaErrorThreshold");
  const patchAlphaErrorThreshold = finite(spec.patchAlphaErrorThreshold, 0.04, 0.001, 0.5, "patchAlphaErrorThreshold");

  const [sourceMeta, candidateMeta] = await Promise.all([imageInfo(source), imageInfo(candidate)]);
  if (candidateMeta.width < sourceMeta.width || candidateMeta.height < sourceMeta.height) {
    throw new Error("Enhancement candidate cannot be smaller than source for structure review.");
  }

  const [sourceRgba, candidateRgba] = await Promise.all([
    sourceSpaceRgba(source, sourceMeta.width, sourceMeta.height, blurSigma),
    sourceSpaceRgba(candidate, sourceMeta.width, sourceMeta.height, blurSigma),
  ]);

  const patches = [];
  let structureRiskCount = 0;
  let alphaRiskCount = 0;
  let weightedLuma = 0;
  let weightedChroma = 0;
  let weightedAlpha = 0;
  let pixelCount = 0;
  let maximumPatchLumaError = 0;
  let maximumPatchChromaError = 0;
  let maximumPatchAlphaError = 0;

  for (let row = 0; row < gridRows; row += 1) {
    const top = Math.round(row * sourceMeta.height / gridRows);
    const bottom = Math.max(top + 1, Math.round((row + 1) * sourceMeta.height / gridRows));
    for (let column = 0; column < gridColumns; column += 1) {
      const left = Math.round(column * sourceMeta.width / gridColumns);
      const right = Math.max(left + 1, Math.round((column + 1) * sourceMeta.width / gridColumns));
      const metrics = patchMetrics(sourceRgba, candidateRgba, sourceMeta.width, left, top, right, bottom);
      const patchPixels = Math.max(1, (right - left) * (bottom - top));
      const structureRisk = metrics.lumaError > patchLumaErrorThreshold || metrics.chromaError > patchChromaErrorThreshold;
      const alphaRisk = sourceMeta.hasAlpha && metrics.alphaError > patchAlphaErrorThreshold;
      if (structureRisk) structureRiskCount += 1;
      if (alphaRisk) alphaRiskCount += 1;
      weightedLuma += metrics.lumaError * patchPixels;
      weightedChroma += metrics.chromaError * patchPixels;
      weightedAlpha += metrics.alphaError * patchPixels;
      pixelCount += patchPixels;
      maximumPatchLumaError = Math.max(maximumPatchLumaError, metrics.lumaError);
      maximumPatchChromaError = Math.max(maximumPatchChromaError, metrics.chromaError);
      maximumPatchAlphaError = Math.max(maximumPatchAlphaError, metrics.alphaError);
      patches.push(Object.freeze({
        column,
        row,
        lumaError: metrics.lumaError,
        chromaError: metrics.chromaError,
        alphaError: metrics.alphaError,
        structureRisk,
        alphaRisk,
      }));
    }
  }

  const totalPatches = Math.max(1, patches.length);
  const totalPixels = Math.max(1, pixelCount);
  return Object.freeze({
    contract: ENHANCEMENT_STRUCTURE_RISK_CONTRACT,
    sourceWidth: sourceMeta.width,
    sourceHeight: sourceMeta.height,
    candidateWidth: candidateMeta.width,
    candidateHeight: candidateMeta.height,
    candidateScaleX: candidateMeta.width / sourceMeta.width,
    candidateScaleY: candidateMeta.height / sourceMeta.height,
    gridColumns,
    gridRows,
    blurSigma,
    globalLumaError: weightedLuma / totalPixels,
    globalChromaError: weightedChroma / totalPixels,
    globalAlphaError: weightedAlpha / totalPixels,
    structureRiskPatchFraction: structureRiskCount / totalPatches,
    alphaRiskPatchFraction: alphaRiskCount / totalPatches,
    maximumPatchLumaError,
    maximumPatchChromaError,
    maximumPatchAlphaError,
    patches: Object.freeze(patches),
    reviewRequired: true,
    automaticRejectionAllowed: false,
  });
}
