import { createHash } from "node:crypto";

import sharp from "sharp";

import { normalizeAlphaCanvas } from "./alpha-canvas.js";
import { createTransparencyProofSheet } from "./transparency-proof.js";

export interface FxResidueRasterEvidence {
  readonly schemaVersion: "1.0";
  readonly processorId: "sharp-exact-canvas-runtime";
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly alphaMode: "straight";
  readonly transparentPixels: number;
  readonly opaquePixels: number;
  readonly partialAlphaPixels: number;
  readonly visiblePixels: number;
  readonly meaningfulTransparency: true;
  readonly paintedCheckerboardDetected: false;
  readonly normalizedVisibleBounds: Readonly<{ left: number; top: number; width: number; height: number }>;
  readonly normalizedPadding: number;
  readonly pngSha256: string;
  readonly proofSha256: string;
}

export interface FxResidueRasterResult {
  readonly png: Buffer;
  readonly transparencyProofPng: Buffer;
  readonly evidence: FxResidueRasterEvidence;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Rasterizes an authored FX residue SVG through the Art Studio Sharp alpha path.
 * The source is normalized to guarantee transparent padding, then re-centred on
 * the exact requested delivery canvas. This produces candidate evidence only;
 * it does not approve visual quality or substrate integration.
 */
export async function rasterizeFxResidueSvgCandidate(
  svg: string | Buffer,
  width = 1024,
  height = 1024,
  padding = 12,
): Promise<FxResidueRasterResult> {
  if (!Number.isInteger(width) || width < 16 || width > 8192) throw new Error("FX residue width must be an integer from 16 through 8192.");
  if (!Number.isInteger(height) || height < 16 || height > 8192) throw new Error("FX residue height must be an integer from 16 through 8192.");
  const source = Buffer.isBuffer(svg) ? svg : Buffer.from(svg, "utf8");
  if (!source.byteLength || source.byteLength > 16 * 1024 * 1024) throw new Error("FX residue SVG input size is invalid.");

  const initial = await sharp(source, { density: 192, failOn: "error", limitInputPixels: width * height * 4 })
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  const normalized = await normalizeAlphaCanvas(initial, padding, 0);
  if (normalized.evidence.outputWidth > width || normalized.evidence.outputHeight > height) {
    throw new Error("FX residue normalized content exceeds exact delivery canvas.");
  }
  const left = Math.floor((width - normalized.evidence.outputWidth) / 2);
  const top = Math.floor((height - normalized.evidence.outputHeight) / 2);
  const png = await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: normalized.png, left, top }])
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();

  const decoded = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparentPixels = 0;
  let opaquePixels = 0;
  let partialAlphaPixels = 0;
  for (let pixel = 0; pixel < decoded.info.width * decoded.info.height; pixel += 1) {
    const alpha = decoded.data[pixel * decoded.info.channels + 3]!;
    if (alpha === 0) transparentPixels += 1;
    else if (alpha === 255) opaquePixels += 1;
    else partialAlphaPixels += 1;
  }
  const visiblePixels = opaquePixels + partialAlphaPixels;
  if (transparentPixels === 0 || visiblePixels === 0) throw new Error("FX residue PNG does not contain meaningful transparency.");

  const proof = await createTransparencyProofSheet(png, {
    backgrounds: ["#000000", "#ffffff", "#808080", "#00ff00", "#ff00ff"],
    maximumPreviewDimension: 256,
    maximumPixels: width * height,
  });
  if (proof.evidence.checkerboardUsed !== false || proof.evidence.includesAlphaMask !== true) {
    throw new Error("FX residue transparency proof is invalid.");
  }

  return {
    png,
    transparencyProofPng: proof.png,
    evidence: {
      schemaVersion: "1.0",
      processorId: "sharp-exact-canvas-runtime",
      outputWidth: width,
      outputHeight: height,
      alphaMode: "straight",
      transparentPixels,
      opaquePixels,
      partialAlphaPixels,
      visiblePixels,
      meaningfulTransparency: true,
      paintedCheckerboardDetected: false,
      normalizedVisibleBounds: normalized.evidence.visibleBounds,
      normalizedPadding: normalized.evidence.padding,
      pngSha256: sha256(png),
      proofSha256: sha256(proof.png),
    },
  };
}
