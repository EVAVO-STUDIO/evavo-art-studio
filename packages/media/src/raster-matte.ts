import sharp from "sharp";

const MAX_MATTE_PIXELS = 16_777_216;
const MAX_MATTE_BYTES = 64 * 1024 * 1024;

/**
 * Apply coverage, not an opaque grayscale overlay. Alpha-bearing masks use
 * their alpha; masks without alpha use luminance (black hides, white keeps).
 * Existing subject alpha is multiplied, never replaced or made opaque.
 * The lossless boundary makes later trim/resize operate on the masked pixels.
 */
export async function applyRasterMatte(
  encoded: Buffer,
  mask: Buffer,
): Promise<Buffer> {
  for (const [label, input] of [["source", encoded], ["mask", mask]] as const) {
    if (!Buffer.isBuffer(input) || input.byteLength === 0 || input.byteLength > MAX_MATTE_BYTES) {
      throw new Error(`Raster matte ${label} must contain 1 through ${MAX_MATTE_BYTES} bytes.`);
    }
  }
  const options = { failOn: "error" as const, limitInputPixels: MAX_MATTE_PIXELS };
  const [sourceMetadata, maskMetadata] = await Promise.all([
    sharp(encoded, options).metadata(),
    sharp(mask, options).metadata(),
  ]);
  if (!sourceMetadata.width || !sourceMetadata.height) {
    throw new Error("Raster matte source has no dimensions.");
  }
  if (sourceMetadata.width !== maskMetadata.width || sourceMetadata.height !== maskMetadata.height) {
    throw new Error("Raster matte mask dimensions must exactly match the source image.");
  }
  if ((sourceMetadata.pages ?? 1) !== 1 || (maskMetadata.pages ?? 1) !== 1) {
    throw new Error("Raster mattes require single-frame images; process animation frames separately.");
  }
  const source = await sharp(encoded, options).toColourspace("srgb").ensureAlpha()
    .raw().toBuffer({ resolveWithObject: true });
  const coverage = await (maskMetadata.hasAlpha
    ? sharp(mask, options).extractChannel("alpha")
    : sharp(mask, options).greyscale())
    .raw().toBuffer({ resolveWithObject: true });
  if (source.info.channels !== 4 || coverage.info.channels !== 1) {
    throw new Error("Raster matte decoding requires RGBA pixels and single-channel coverage.");
  }
  for (let pixel = 0; pixel < source.info.width * source.info.height; pixel += 1) {
    const alphaOffset = pixel * 4 + 3;
    source.data[alphaOffset] = Math.round(source.data[alphaOffset]! * coverage.data[pixel]! / 255);
  }
  return sharp(source.data, {
    raw: { width: source.info.width, height: source.info.height, channels: 4 },
  }).png().toBuffer();
}
