import sharp from "sharp";

export interface ExistingImageDiffOptions {
  readonly channelThreshold?: number;
  readonly alphaThreshold?: number;
  readonly maximumChangedPixelRatio?: number;
  readonly failOnDimensionMismatch?: boolean;
}

export interface ExistingImageDiffResult {
  readonly proofPng: Buffer;
  readonly evidence: Readonly<{
    width: number;
    height: number;
    changedPixels: number;
    changedPixelRatio: number;
    opaqueRgbChangedPixels: number;
    alphaChangedPixels: number;
    maxChannelDelta: number;
    maxAlphaDelta: number;
    changeBounds: Readonly<{ left: number; top: number; right: number; bottom: number }> | null;
    withinMaximumChangedPixelRatio: boolean;
  }>;
}

function boundedByte(value: number | undefined, label: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new Error(`${label} must be an integer from 0 through 255.`);
  }
  return value;
}

function boundedRatio(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("maximumChangedPixelRatio must be between 0 and 1.");
  }
  return value;
}

async function rawRgba(encoded: Buffer) {
  const meta = await sharp(encoded, { failOn: "error" }).metadata();
  if (!meta.width || !meta.height) throw new Error("Existing image diff input has no dimensions.");
  const raw = await sharp(encoded, { failOn: "error" }).ensureAlpha().raw().toBuffer();
  return { width: meta.width, height: meta.height, raw };
}

/**
 * Builds objective evidence showing exactly where an edited existing image
 * differs from its source. This is intentionally pixel based rather than
 * perceptual: it is a preservation gate for polishing/repair workflows.
 */
export async function createExistingImageDifferenceProof(
  sourceEncoded: Buffer,
  editedEncoded: Buffer,
  options: ExistingImageDiffOptions = {},
): Promise<ExistingImageDiffResult> {
  const source = await rawRgba(sourceEncoded);
  const edited = await rawRgba(editedEncoded);
  if (source.width !== edited.width || source.height !== edited.height) {
    if (options.failOnDimensionMismatch !== false) {
      throw new Error(`Existing image diff dimensions differ: source ${source.width}x${source.height}, edited ${edited.width}x${edited.height}.`);
    }
    throw new Error("Dimension-normalizing diff is not enabled for preservation proof.");
  }

  const channelThreshold = boundedByte(options.channelThreshold, "channelThreshold", 0);
  const alphaThreshold = boundedByte(options.alphaThreshold, "alphaThreshold", 0);
  const maximumChangedPixelRatio = boundedRatio(options.maximumChangedPixelRatio, 1);
  const width = source.width;
  const height = source.height;
  const mask = Buffer.alloc(width * height * 4);

  let changedPixels = 0;
  let opaqueRgbChangedPixels = 0;
  let alphaChangedPixels = 0;
  let maxChannelDelta = 0;
  let maxAlphaDelta = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const dr = Math.abs(source.raw[i]! - edited.raw[i]!);
      const dg = Math.abs(source.raw[i + 1]! - edited.raw[i + 1]!);
      const db = Math.abs(source.raw[i + 2]! - edited.raw[i + 2]!);
      const da = Math.abs(source.raw[i + 3]! - edited.raw[i + 3]!);
      const rgbDelta = Math.max(dr, dg, db);
      maxChannelDelta = Math.max(maxChannelDelta, rgbDelta);
      maxAlphaDelta = Math.max(maxAlphaDelta, da);
      const rgbChanged = rgbDelta > channelThreshold;
      const alphaChanged = da > alphaThreshold;
      const changed = rgbChanged || alphaChanged;

      if (alphaChanged) alphaChangedPixels += 1;
      if (source.raw[i + 3] === 255 && rgbChanged) opaqueRgbChangedPixels += 1;
      if (changed) {
        changedPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        // Red means RGB changed, blue means alpha changed, magenta means both.
        mask[i] = rgbChanged ? 255 : 0;
        mask[i + 1] = 0;
        mask[i + 2] = alphaChanged ? 255 : 0;
        mask[i + 3] = 255;
      } else {
        // Dim checker-like neutral field makes isolated changes easy to spot.
        const neutral = ((x >> 4) + (y >> 4)) % 2 === 0 ? 32 : 48;
        mask[i] = neutral;
        mask[i + 1] = neutral;
        mask[i + 2] = neutral;
        mask[i + 3] = 255;
      }
    }
  }

  const changedPixelRatio = changedPixels / (width * height);
  const proofPng = await sharp(mask, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return {
    proofPng,
    evidence: Object.freeze({
      width,
      height,
      changedPixels,
      changedPixelRatio,
      opaqueRgbChangedPixels,
      alphaChangedPixels,
      maxChannelDelta,
      maxAlphaDelta,
      changeBounds: changedPixels === 0
        ? null
        : Object.freeze({ left: minX, top: minY, right: maxX, bottom: maxY }),
      withinMaximumChangedPixelRatio: changedPixelRatio <= maximumChangedPixelRatio,
    }),
  };
}
