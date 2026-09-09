import sharp from "sharp";

export type TextureTileProofSampling = "continuous" | "nearest";

export interface TextureTileProofResult {
  readonly png: Buffer;
  readonly evidence: Readonly<{
    tileWidth: number;
    tileHeight: number;
    proofWidth: number;
    proofHeight: number;
    sampling: TextureTileProofSampling;
    resized: boolean;
  }>;
}

/**
 * Produce a 3x3 diagnostic tile proof with an explicit sampling contract.
 * Continuous imagery defaults to Lanczos3; nearest-neighbour is opt-in for
 * pixel-art or exact texel inspection. This does not modify the source.
 */
export async function createTextureTileProofWithSampling(
  encoded: Buffer,
  maximumTileDimension = 512,
  sampling: TextureTileProofSampling = "continuous",
): Promise<TextureTileProofResult> {
  if (!encoded.byteLength) throw new Error("Texture tile proof input is empty.");
  if (!Number.isInteger(maximumTileDimension) || maximumTileDimension < 64 || maximumTileDimension > 2048) {
    throw new Error("maximumTileDimension must be an integer from 64 through 2048.");
  }
  if (sampling !== "continuous" && sampling !== "nearest") {
    throw new Error("Texture tile proof sampling must be continuous or nearest.");
  }

  const meta = await sharp(encoded, { failOn: "error" }).metadata();
  if (!meta.width || !meta.height) throw new Error("Texture tile proof input has no dimensions.");
  const scale = Math.min(1, maximumTileDimension / Math.max(meta.width, meta.height));
  const tileWidth = Math.max(1, Math.round(meta.width * scale));
  const tileHeight = Math.max(1, Math.round(meta.height * scale));
  const resized = tileWidth !== meta.width || tileHeight !== meta.height;

  let pipeline = sharp(encoded, { failOn: "error" });
  if (resized) {
    pipeline = pipeline.resize({
      width: tileWidth,
      height: tileHeight,
      fit: "fill",
      kernel: sampling === "nearest" ? sharp.kernel.nearest : sharp.kernel.lanczos3,
    });
  }
  const tile = await pipeline.png().toBuffer();
  const composites = [];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      composites.push({ input: tile, left: column * tileWidth, top: row * tileHeight });
    }
  }

  const proofWidth = tileWidth * 3;
  const proofHeight = tileHeight * 3;
  const png = await sharp({
    create: {
      width: proofWidth,
      height: proofHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  }).composite(composites).png().toBuffer();

  return Object.freeze({
    png,
    evidence: Object.freeze({
      tileWidth,
      tileHeight,
      proofWidth,
      proofHeight,
      sampling,
      resized,
    }),
  });
}
