import sharp from "sharp";

export type ExistingImageDefectKind =
  | "transparent-rgb-contamination"
  | "edge-halo-risk"
  | "alpha-pinhole"
  | "isolated-alpha-speck"
  | "hard-alpha-stair-step";

export interface ExistingImageDefectDetectionSpec {
  readonly haloLumaThreshold?: number;
  readonly pinholeAlphaMaximum?: number;
  readonly speckAlphaMinimum?: number;
  readonly stairStepMinimumTransitions?: number;
  readonly maskPadding?: number;
  readonly maximumMaskCoverageRatio?: number;
}

export interface ExistingImageDefectDetectionResult {
  readonly maskPng: Buffer;
  readonly overlayPng: Buffer;
  readonly evidence: Readonly<{
    width: number;
    height: number;
    totalPixels: number;
    defectPixels: number;
    defectPixelRatio: number;
    maskCoverageRatio: number;
    withinMaximumMaskCoverageRatio: boolean;
    defectCounts: Readonly<Record<ExistingImageDefectKind, number>>;
    bounds: Readonly<{ left: number; top: number; right: number; bottom: number }> | null;
    suggestedAction: "none" | "polish" | "localized-repair" | "manual-review";
  }>;
}

function boundedByte(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error(`${label} must be 0..255.`);
  return value;
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be ${min}..${max}.`);
  return value;
}

function boundedRatio(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("maximumMaskCoverageRatio must be between 0 and 1.");
  return value;
}

function idx(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function alphaAt(raw: Buffer, width: number, x: number, y: number): number {
  return raw[idx(width, x, y) + 3]!;
}

function countOpaqueNeighbours(raw: Buffer, width: number, height: number, x: number, y: number, threshold = 220): number {
  let count = 0;
  for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy += 1) {
    for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) {
      if (xx === x && yy === y) continue;
      if (alphaAt(raw, width, xx, yy) >= threshold) count += 1;
    }
  }
  return count;
}

function countTransparentNeighbours(raw: Buffer, width: number, height: number, x: number, y: number, threshold = 8): number {
  let count = 0;
  for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy += 1) {
    for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) {
      if (xx === x && yy === y) continue;
      if (alphaAt(raw, width, xx, yy) <= threshold) count += 1;
    }
  }
  return count;
}

function dilateMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask;
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy += 1) {
        for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx += 1) {
          out[yy * width + xx] = 255;
        }
      }
    }
  }
  return out;
}

/**
 * Deterministic defect proposal for existing raster artwork. It does not alter
 * the source. Instead it finds suspicious alpha/transparency edge pixels and
 * returns a conservative repair-mask proposal plus an inspection overlay.
 */
export async function detectExistingImageDefects(
  encoded: Buffer,
  spec: ExistingImageDefectDetectionSpec = {},
): Promise<ExistingImageDefectDetectionResult> {
  if (encoded.byteLength === 0) throw new Error("Defect detection input is empty.");
  const decoded = await sharp(encoded, { failOn: "error" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = decoded.info.width;
  const height = decoded.info.height;
  const raw = decoded.data;

  const haloLumaThreshold = boundedByte(spec.haloLumaThreshold, 220, "haloLumaThreshold");
  const pinholeAlphaMaximum = boundedByte(spec.pinholeAlphaMaximum, 70, "pinholeAlphaMaximum");
  const speckAlphaMinimum = boundedByte(spec.speckAlphaMinimum, 80, "speckAlphaMinimum");
  const stairStepMinimumTransitions = boundedInteger(spec.stairStepMinimumTransitions, 3, 2, 8, "stairStepMinimumTransitions");
  const maskPadding = boundedInteger(spec.maskPadding, 2, 0, 24, "maskPadding");
  const maximumMaskCoverageRatio = boundedRatio(spec.maximumMaskCoverageRatio, 0.2);

  const counts: Record<ExistingImageDefectKind, number> = {
    "transparent-rgb-contamination": 0,
    "edge-halo-risk": 0,
    "alpha-pinhole": 0,
    "isolated-alpha-speck": 0,
    "hard-alpha-stair-step": 0,
  };
  const defectMask = new Uint8Array(width * height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  const mark = (x: number, y: number, kind: ExistingImageDefectKind) => {
    counts[kind] += 1;
    defectMask[y * width + x] = 255;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = idx(width, x, y);
      const r = raw[i]!;
      const g = raw[i + 1]!;
      const b = raw[i + 2]!;
      const a = raw[i + 3]!;
      const opaqueN = countOpaqueNeighbours(raw, width, height, x, y);
      const transparentN = countTransparentNeighbours(raw, width, height, x, y);

      if (a === 0 && (r !== 0 || g !== 0 || b !== 0)) mark(x, y, "transparent-rgb-contamination");

      if (a > 0 && a < 230 && opaqueN > 0 && luma(r, g, b) >= haloLumaThreshold) {
        let donorLuma = 0;
        let donorCount = 0;
        for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy += 1) {
          for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) {
            if (xx === x && yy === y) continue;
            const di = idx(width, xx, yy);
            if (raw[di + 3]! < 220) continue;
            donorLuma += luma(raw[di]!, raw[di + 1]!, raw[di + 2]!);
            donorCount += 1;
          }
        }
        if (donorCount && luma(r, g, b) - donorLuma / donorCount > 45) mark(x, y, "edge-halo-risk");
      }

      if (a > 0 && a <= pinholeAlphaMaximum && opaqueN >= 5) mark(x, y, "alpha-pinhole");
      if (a >= speckAlphaMinimum && a < 255 && transparentN >= 7) mark(x, y, "isolated-alpha-speck");

      if (a > 0 && a < 255) {
        let transitions = 0;
        const neighbours = [
          x > 0 ? alphaAt(raw, width, x - 1, y) : a,
          x + 1 < width ? alphaAt(raw, width, x + 1, y) : a,
          y > 0 ? alphaAt(raw, width, x, y - 1) : a,
          y + 1 < height ? alphaAt(raw, width, x, y + 1) : a,
        ];
        for (const n of neighbours) if ((n <= 8 && a >= 220) || (n >= 220 && a <= 8)) transitions += 1;
        if (transitions >= stairStepMinimumTransitions) mark(x, y, "hard-alpha-stair-step");
      }
    }
  }

  const defectPixels = defectMask.reduce((sum, v) => sum + (v ? 1 : 0), 0);
  const padded = dilateMask(defectMask, width, height, maskPadding);
  const maskPixels = padded.reduce((sum, v) => sum + (v ? 1 : 0), 0);
  const totalPixels = width * height;
  const maskCoverageRatio = maskPixels / totalPixels;

  const maskRaw = Buffer.alloc(totalPixels * 4);
  const overlayRaw = Buffer.from(raw);
  for (let p = 0; p < totalPixels; p += 1) {
    const m = padded[p]!;
    const mi = p * 4;
    maskRaw[mi] = m;
    maskRaw[mi + 1] = m;
    maskRaw[mi + 2] = m;
    maskRaw[mi + 3] = 255;
    if (m) {
      overlayRaw[mi] = 255;
      overlayRaw[mi + 1] = Math.round(overlayRaw[mi + 1]! * 0.25);
      overlayRaw[mi + 2] = Math.round(overlayRaw[mi + 2]! * 0.25);
      overlayRaw[mi + 3] = Math.max(overlayRaw[mi + 3]!, 180);
    }
  }

  const maskPng = await sharp(maskRaw, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  const overlayPng = await sharp(overlayRaw, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();

  const severeKinds = counts["alpha-pinhole"] + counts["isolated-alpha-speck"] + counts["hard-alpha-stair-step"];
  const suggestedAction = defectPixels === 0
    ? "none"
    : maskCoverageRatio > maximumMaskCoverageRatio
      ? "manual-review"
      : severeKinds > 0
        ? "localized-repair"
        : "polish";

  return {
    maskPng,
    overlayPng,
    evidence: Object.freeze({
      width,
      height,
      totalPixels,
      defectPixels,
      defectPixelRatio: defectPixels / totalPixels,
      maskCoverageRatio,
      withinMaximumMaskCoverageRatio: maskCoverageRatio <= maximumMaskCoverageRatio,
      defectCounts: Object.freeze({ ...counts }),
      bounds: defectPixels === 0 ? null : Object.freeze({ left: minX, top: minY, right: maxX, bottom: maxY }),
      suggestedAction,
    }),
  };
}
