import sharp from "sharp";
import { createExistingImageDifferenceProof } from "./existing-image-diff.js";

export interface ExistingImageInspectionProofResult {
  readonly png: Buffer;
  readonly evidence: Readonly<{
    width: number;
    height: number;
    changedPixelRatio: number;
    changeBounds: Readonly<{ left: number; top: number; right: number; bottom: number }> | null;
    inspectionBounds: Readonly<{ left: number; top: number; width: number; height: number }>;
    panels: readonly string[];
  }>;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;",
  })[char]!);
}

async function label(width: number, text: string): Promise<Buffer> {
  const safe = escapeXml(text);
  return Buffer.from(`<svg width="${width}" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#080808"/><text x="14" y="27" font-family="Arial,sans-serif" font-size="17" fill="#ffffff">${safe}</text></svg>`);
}

async function panel(encoded: Buffer, text: string, background: string, width = 560, height = 360): Promise<Buffer> {
  const image = await sharp(encoded, { failOn: "error" })
    .resize({ width, height, fit: "contain", background })
    .flatten({ background })
    .png()
    .toBuffer();
  return sharp({ create: { width, height: height + 40, channels: 4, background: "#080808" } })
    .composite([{ input: image, left: 0, top: 0 }, { input: await label(width, text), left: 0, top: height }])
    .png()
    .toBuffer();
}

async function cropPanel(
  encoded: Buffer,
  bounds: { left: number; top: number; width: number; height: number },
  text: string,
  background: string,
  width = 560,
  height = 360,
): Promise<Buffer> {
  const crop = await sharp(encoded, { failOn: "error" })
    .extract(bounds)
    .resize({ width, height, fit: "contain", kernel: sharp.kernel.nearest, background })
    .flatten({ background })
    .png()
    .toBuffer();
  return sharp({ create: { width, height: height + 40, channels: 4, background: "#080808" } })
    .composite([{ input: crop, left: 0, top: 0 }, { input: await label(width, text), left: 0, top: height }])
    .png()
    .toBuffer();
}

async function alphaPanel(encoded: Buffer, text: string, width = 560, height = 360): Promise<Buffer> {
  const alpha = await sharp(encoded, { failOn: "error" })
    .ensureAlpha()
    .extractChannel(3)
    .resize({ width, height, fit: "contain", kernel: sharp.kernel.nearest, background: "#000000" })
    .png()
    .toBuffer();
  return sharp({ create: { width, height: height + 40, channels: 4, background: "#080808" } })
    .composite([{ input: alpha, left: 0, top: 0 }, { input: await label(width, text), left: 0, top: height }])
    .png()
    .toBuffer();
}

/**
 * Creates a proof sheet designed for actual retouch review rather than just
 * bookkeeping: full-image hostile backgrounds, pixel-preserving zooms around
 * the changed region, and alpha-channel inspection are shown together.
 */
export async function createExistingImageEditInspectionProof(
  sourceEncoded: Buffer,
  editedEncoded: Buffer,
): Promise<ExistingImageInspectionProofResult> {
  const sourceMeta = await sharp(sourceEncoded, { failOn: "error" }).metadata();
  const editedMeta = await sharp(editedEncoded, { failOn: "error" }).metadata();
  if (!sourceMeta.width || !sourceMeta.height || !editedMeta.width || !editedMeta.height) {
    throw new Error("Inspection proof inputs must have dimensions.");
  }
  if (sourceMeta.width !== editedMeta.width || sourceMeta.height !== editedMeta.height) {
    throw new Error("Inspection proof requires source and edited images with identical dimensions.");
  }

  const diff = await createExistingImageDifferenceProof(sourceEncoded, editedEncoded);
  const changed = diff.evidence.changeBounds;
  const padding = 24;
  const inspectionBounds = changed
    ? {
        left: Math.max(0, changed.left - padding),
        top: Math.max(0, changed.top - padding),
        width: Math.min(sourceMeta.width, changed.right + padding + 1) - Math.max(0, changed.left - padding),
        height: Math.min(sourceMeta.height, changed.bottom + padding + 1) - Math.max(0, changed.top - padding),
      }
    : { left: 0, top: 0, width: sourceMeta.width, height: sourceMeta.height };

  const panels = await Promise.all([
    panel(sourceEncoded, "SOURCE • white background • runtime composition", "#ffffff"),
    panel(editedEncoded, "EDITED • white background • runtime composition", "#ffffff"),
    panel(sourceEncoded, "SOURCE • black hostile background", "#000000"),
    panel(editedEncoded, "EDITED • black hostile background", "#000000"),
    cropPanel(sourceEncoded, inspectionBounds, "SOURCE • changed-region pixel zoom", "#777777"),
    cropPanel(editedEncoded, inspectionBounds, "EDITED • changed-region pixel zoom", "#777777"),
    alphaPanel(sourceEncoded, "SOURCE • alpha channel"),
    alphaPanel(editedEncoded, "EDITED • alpha channel"),
  ]);

  const panelWidth = 560;
  const panelHeight = 400;
  const gap = 14;
  const sheetWidth = panelWidth * 2 + gap;
  const sheetHeight = panelHeight * 4 + gap * 3;
  const overlays = panels.map((input, index) => ({
    input,
    left: (index % 2) * (panelWidth + gap),
    top: Math.floor(index / 2) * (panelHeight + gap),
  }));
  const png = await sharp({ create: { width: sheetWidth, height: sheetHeight, channels: 4, background: "#151515" } })
    .composite(overlays)
    .png()
    .toBuffer();

  return {
    png,
    evidence: Object.freeze({
      width: sourceMeta.width,
      height: sourceMeta.height,
      changedPixelRatio: diff.evidence.changedPixelRatio,
      changeBounds: diff.evidence.changeBounds,
      inspectionBounds: Object.freeze(inspectionBounds),
      panels: Object.freeze([
        "source-white-runtime",
        "edited-white-runtime",
        "source-black-hostile",
        "edited-black-hostile",
        "source-changed-region-pixel-zoom",
        "edited-changed-region-pixel-zoom",
        "source-alpha-channel",
        "edited-alpha-channel",
      ]),
    }),
  };
}
