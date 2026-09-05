import sharp from "sharp";

export interface PreservationPolishSpec {
  /** Alpha values at or below this threshold are made fully transparent. */
  readonly transparentAlphaCutoff?: number;
  /** Alpha values at or above this threshold are made fully opaque. */
  readonly opaqueAlphaCutoff?: number;
  /** Remove hidden RGB from fully transparent pixels. */
  readonly clearTransparentRgb?: boolean;
  /** Repair colour contamination on semi-transparent silhouette pixels. */
  readonly decontaminateFringe?: boolean;
  /** Radius used to find nearby opaque source colour for fringe repair. */
  readonly fringeRadius?: number;
  /** Alpha at or above which pixels are considered trustworthy colour donors. */
  readonly donorAlphaThreshold?: number;
  /** Fail if any fully opaque source RGB pixel is changed. */
  readonly preserveOpaqueRgb?: boolean;
}

export interface PreservationPolishResult {
  readonly buffer: Buffer;
  readonly evidence: Readonly<{
    width: number;
    height: number;
    sourceHasAlpha: boolean;
    outputHasAlpha: boolean;
    totalPixels: number;
    changedPixels: number;
    changedAlphaPixels: number;
    clearedTransparentRgbPixels: number;
    fringeRepairedPixels: number;
    changedOpaqueRgbPixels: number;
    transparentAlphaCutoff: number;
    opaqueAlphaCutoff: number;
    fringeRadius: number;
    donorAlphaThreshold: number;
    preservationPassed: boolean;
    operations: readonly string[];
  }>;
}

function byte(value: number | undefined, label: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`${label} must be an integer from 0 through 255.`);
  }
  return value;
}

function radius(value: number | undefined): number {
  if (value === undefined) return 2;
  if (!Number.isInteger(value) || value < 1 || value > 8) {
    throw new Error("fringeRadius must be an integer from 1 through 8.");
  }
  return value;
}

function pixelOffset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

/**
 * Conservative cleanup for an EXISTING raster image. The goal is not to
 * redesign or regenerate anything: opaque source artwork remains immutable,
 * while transparent RGB contamination and semi-transparent matte halos can be
 * repaired deterministically.
 */
export async function polishExistingRasterPreservingArtwork(
  encoded: Buffer,
  spec: PreservationPolishSpec = {},
): Promise<PreservationPolishResult> {
  if (encoded.byteLength === 0) throw new Error("Preservation polish input is empty.");

  const transparentAlphaCutoff = byte(spec.transparentAlphaCutoff, "transparentAlphaCutoff", 2);
  const opaqueAlphaCutoff = byte(spec.opaqueAlphaCutoff, "opaqueAlphaCutoff", 253);
  const donorAlphaThreshold = byte(spec.donorAlphaThreshold, "donorAlphaThreshold", 245);
  const fringeRadius = radius(spec.fringeRadius);
  if (opaqueAlphaCutoff <= transparentAlphaCutoff) {
    throw new Error("opaqueAlphaCutoff must be greater than transparentAlphaCutoff.");
  }

  const decoded = await sharp(encoded, { failOn: "error" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = decoded.info.width;
  const height = decoded.info.height;
  const sourceMeta = await sharp(encoded).metadata();
  const source = Buffer.from(decoded.data);
  const output = Buffer.from(decoded.data);
  const operations: string[] = [];

  let changedPixels = 0;
  let changedAlphaPixels = 0;
  let clearedTransparentRgbPixels = 0;
  let fringeRepairedPixels = 0;
  let changedOpaqueRgbPixels = 0;

  // Alpha admission/snap is intentionally tiny and bounded to near-zero and
  // near-opaque values so anti-aliased edges are not destroyed.
  for (let i = 0; i < output.length; i += 4) {
    const sourceAlpha = source[i + 3]!;
    let targetAlpha = sourceAlpha;
    if (sourceAlpha <= transparentAlphaCutoff) targetAlpha = 0;
    else if (sourceAlpha >= opaqueAlphaCutoff) targetAlpha = 255;
    if (targetAlpha !== sourceAlpha) {
      output[i + 3] = targetAlpha;
      changedAlphaPixels += 1;
    }
  }
  if (changedAlphaPixels > 0) operations.push("bounded-alpha-snap");

  if (spec.clearTransparentRgb !== false) {
    for (let i = 0; i < output.length; i += 4) {
      if (output[i + 3] !== 0) continue;
      if (output[i] !== 0 || output[i + 1] !== 0 || output[i + 2] !== 0) {
        output[i] = 0;
        output[i + 1] = 0;
        output[i + 2] = 0;
        clearedTransparentRgbPixels += 1;
      }
    }
    operations.push("clear-transparent-rgb");
  }

  if (spec.decontaminateFringe !== false) {
    const donors = source; // colour donors always come from immutable source pixels.
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = pixelOffset(width, x, y);
        const alpha = output[offset + 3]!;
        if (alpha === 0 || alpha >= donorAlphaThreshold) continue;

        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let count = 0;
        for (let yy = Math.max(0, y - fringeRadius); yy <= Math.min(height - 1, y + fringeRadius); yy += 1) {
          for (let xx = Math.max(0, x - fringeRadius); xx <= Math.min(width - 1, x + fringeRadius); xx += 1) {
            if (xx === x && yy === y) continue;
            const donorOffset = pixelOffset(width, xx, yy);
            if (donors[donorOffset + 3]! < donorAlphaThreshold) continue;
            sumR += donors[donorOffset]!;
            sumG += donors[donorOffset + 1]!;
            sumB += donors[donorOffset + 2]!;
            count += 1;
          }
        }
        if (count === 0) continue;

        const r = Math.round(sumR / count);
        const g = Math.round(sumG / count);
        const b = Math.round(sumB / count);
        if (output[offset] !== r || output[offset + 1] !== g || output[offset + 2] !== b) {
          output[offset] = r;
          output[offset + 1] = g;
          output[offset + 2] = b;
          fringeRepairedPixels += 1;
        }
      }
    }
    operations.push("semi-transparent-fringe-decontamination");
  }

  // Compute the exact mutation surface and ensure fully opaque source artwork
  // did not change. This makes the operation safe for logos, UI, sprites and
  // existing photography where only silhouette cleanup is intended.
  for (let i = 0; i < output.length; i += 4) {
    const rgbChanged = output[i] !== source[i] || output[i + 1] !== source[i + 1] || output[i + 2] !== source[i + 2];
    const alphaChanged = output[i + 3] !== source[i + 3];
    if (rgbChanged || alphaChanged) changedPixels += 1;
    if (source[i + 3] === 255 && rgbChanged) changedOpaqueRgbPixels += 1;
  }

  const preserveOpaqueRgb = spec.preserveOpaqueRgb !== false;
  if (preserveOpaqueRgb && changedOpaqueRgbPixels > 0) {
    throw new Error(`Preservation polish changed ${changedOpaqueRgbPixels} fully opaque RGB pixels; refusing output.`);
  }

  const buffer = await sharp(output, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  return {
    buffer,
    evidence: Object.freeze({
      width,
      height,
      sourceHasAlpha: sourceMeta.hasAlpha ?? false,
      outputHasAlpha: true,
      totalPixels: width * height,
      changedPixels,
      changedAlphaPixels,
      clearedTransparentRgbPixels,
      fringeRepairedPixels,
      changedOpaqueRgbPixels,
      transparentAlphaCutoff,
      opaqueAlphaCutoff,
      fringeRadius,
      donorAlphaThreshold,
      preservationPassed: changedOpaqueRgbPixels === 0,
      operations: Object.freeze(operations),
    }),
  };
}
