import sharp from "sharp";

export interface AlphaCanvasNormalization {
  readonly png: Buffer;
  readonly evidence: Readonly<{
    sourceWidth: number;
    sourceHeight: number;
    visibleBounds: Readonly<{ left: number; top: number; width: number; height: number }>;
    padding: number;
    outputWidth: number;
    outputHeight: number;
  }>;
}

/** Crops unused transparent canvas and adds a guaranteed transparent border. */
export async function normalizeAlphaCanvas(
  encoded: Buffer,
  padding = 8,
  alphaThreshold = 0,
): Promise<AlphaCanvasNormalization> {
  if (!Number.isInteger(padding) || padding < 1 || padding > 4096) {
    throw new Error("Alpha-canvas padding must be an integer from 1 through 4096.");
  }
  if (!Number.isInteger(alphaThreshold) || alphaThreshold < 0 || alphaThreshold > 254) {
    throw new Error("Alpha threshold must be an integer from 0 through 254.");
  }
  const decoded = await sharp(encoded).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = decoded.info;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (decoded.data[(y * width + x) * channels + 3]! > alphaThreshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) throw new Error("Alpha canvas contains no visible pixels.");
  const visibleWidth = maxX - minX + 1;
  const visibleHeight = maxY - minY + 1;
  const png = await sharp(encoded)
    .ensureAlpha()
    .extract({ left: minX, top: minY, width: visibleWidth, height: visibleHeight })
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return {
    png,
    evidence: {
      sourceWidth: width,
      sourceHeight: height,
      visibleBounds: { left: minX, top: minY, width: visibleWidth, height: visibleHeight },
      padding,
      outputWidth: visibleWidth + padding * 2,
      outputHeight: visibleHeight + padding * 2,
    },
  };
}
