import sharp from "sharp";

export interface RasterImageDimensions {
  readonly width: number;
  readonly height: number;
  readonly pages: number;
  readonly hasAlpha: boolean;
  readonly format: string | null;
}

/** Read raster dimensions through the media package so standalone tools never depend on package-internal node_modules paths. */
export async function readRasterImageDimensions(encoded: Buffer): Promise<RasterImageDimensions> {
  if (!Buffer.isBuffer(encoded) || encoded.length === 0) throw new Error("Image dimension input is empty.");
  const metadata = await sharp(encoded, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Image has no dimensions.");
  return Object.freeze({
    width: metadata.width,
    height: metadata.height,
    pages: metadata.pages ?? 1,
    hasAlpha: metadata.hasAlpha ?? false,
    format: metadata.format ?? null,
  });
}
