import sharp from "sharp";
import { createExistingImageDifferenceProof } from "./existing-image-diff.js";
import { segmentDefectMaskRegions, type DefectRegionComponent } from "./defect-region-components.js";

export interface ExistingImageInspectionProofResult {
  readonly png: Buffer;
  readonly evidence: Readonly<{
    width: number;
    height: number;
    changedPixelRatio: number;
    changeBounds: Readonly<{ left: number; top: number; right: number; bottom: number }> | null;
    inspectionBounds: Readonly<{ left: number; top: number; width: number; height: number }>;
    changeRegions: readonly DefectRegionComponent[];
    panels: readonly string[];
  }>;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]!);
}

async function label(width: number, text: string): Promise<Buffer> {
  const safe = escapeXml(text);
  return Buffer.from(`<svg width="${width}" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#080808"/><text x="14" y="27" font-family="Arial,sans-serif" font-size="17" fill="#ffffff">${safe}</text></svg>`);
}

async function panel(encoded: Buffer, text: string, background: string, width = 560, height = 360): Promise<Buffer> {
  const image = await sharp(encoded, { failOn: "error" }).resize({ width, height, fit: "contain", background }).flatten({ background }).png().toBuffer();
  return sharp({ create: { width, height: height + 40, channels: 4, background: "#080808" } })
    .composite([{ input: image, left: 0, top: 0 }, { input: await label(width, text), left: 0, top: height }]).png().toBuffer();
}

async function cropPanel(encoded: Buffer, bounds: { left: number; top: number; width: number; height: number }, text: string, background: string, width = 560, height = 360): Promise<Buffer> {
  const crop = await sharp(encoded, { failOn: "error" }).extract(bounds).resize({ width, height, fit: "contain", kernel: sharp.kernel.nearest, background }).flatten({ background }).png().toBuffer();
  return sharp({ create: { width, height: height + 40, channels: 4, background: "#080808" } })
    .composite([{ input: crop, left: 0, top: 0 }, { input: await label(width, text), left: 0, top: height }]).png().toBuffer();
}

async function alphaPanel(encoded: Buffer, text: string, width = 560, height = 360): Promise<Buffer> {
  const alpha = await sharp(encoded, { failOn: "error" }).ensureAlpha().extractChannel(3).resize({ width, height, fit: "contain", kernel: sharp.kernel.nearest, background: "#000000" }).png().toBuffer();
  return sharp({ create: { width, height: height + 40, channels: 4, background: "#080808" } })
    .composite([{ input: alpha, left: 0, top: 0 }, { input: await label(width, text), left: 0, top: height }]).png().toBuffer();
}

function paddedRegionBounds(region: DefectRegionComponent, imageWidth: number, imageHeight: number, padding = 18) {
  const left = Math.max(0, region.bounds.left - padding);
  const top = Math.max(0, region.bounds.top - padding);
  const right = Math.min(imageWidth - 1, region.bounds.right + padding);
  const bottom = Math.min(imageHeight - 1, region.bounds.bottom + padding);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** Creates hostile-background, alpha and top connected change-region proof panels. */
export async function createExistingImageEditInspectionProof(sourceEncoded: Buffer, editedEncoded: Buffer): Promise<ExistingImageInspectionProofResult> {
  const sourceMeta = await sharp(sourceEncoded, { failOn: "error" }).metadata();
  const editedMeta = await sharp(editedEncoded, { failOn: "error" }).metadata();
  if (!sourceMeta.width || !sourceMeta.height || !editedMeta.width || !editedMeta.height) throw new Error("Inspection proof inputs must have dimensions.");
  if (sourceMeta.width !== editedMeta.width || sourceMeta.height !== editedMeta.height) throw new Error("Inspection proof requires source and edited images with identical dimensions.");

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

  const segmented = await segmentDefectMaskRegions(diff.changeMaskPng, { minimumPixelCount: 1, maximumRegions: 3, mergeGap: 2 });
  const changeRegions = segmented.regions;
  const panelInputs: Array<{ buffer: Promise<Buffer>; id: string }> = [
    { buffer: panel(sourceEncoded, "SOURCE • white background • runtime composition", "#ffffff"), id: "source-white-runtime" },
    { buffer: panel(editedEncoded, "EDITED • white background • runtime composition", "#ffffff"), id: "edited-white-runtime" },
    { buffer: panel(sourceEncoded, "SOURCE • black hostile background", "#000000"), id: "source-black-hostile" },
    { buffer: panel(editedEncoded, "EDITED • black hostile background", "#000000"), id: "edited-black-hostile" },
    { buffer: alphaPanel(sourceEncoded, "SOURCE • alpha channel"), id: "source-alpha-channel" },
    { buffer: alphaPanel(editedEncoded, "EDITED • alpha channel"), id: "edited-alpha-channel" },
  ];

  for (const region of changeRegions) {
    const bounds = paddedRegionBounds(region, sourceMeta.width, sourceMeta.height);
    const summary = `${region.id} • ${region.pixelCount}px • ${(region.pixelRatio * 100).toFixed(3)}%`;
    panelInputs.push(
      { buffer: cropPanel(sourceEncoded, bounds, `SOURCE • ${summary}`, "#777777"), id: `source-${region.id}-pixel-zoom` },
      { buffer: cropPanel(editedEncoded, bounds, `EDITED • ${summary}`, "#777777"), id: `edited-${region.id}-pixel-zoom` },
    );
  }

  if (changeRegions.length === 0) {
    panelInputs.push(
      { buffer: cropPanel(sourceEncoded, inspectionBounds, "SOURCE • no pixel changes detected", "#777777"), id: "source-no-change-pixel-zoom" },
      { buffer: cropPanel(editedEncoded, inspectionBounds, "EDITED • no pixel changes detected", "#777777"), id: "edited-no-change-pixel-zoom" },
    );
  }

  const panels = await Promise.all(panelInputs.map((entry) => entry.buffer));
  const panelWidth = 560;
  const panelHeight = 400;
  const gap = 14;
  const rows = Math.ceil(panels.length / 2);
  const sheetWidth = panelWidth * 2 + gap;
  const sheetHeight = panelHeight * rows + gap * Math.max(0, rows - 1);
  const overlays = panels.map((input, index) => ({ input, left: (index % 2) * (panelWidth + gap), top: Math.floor(index / 2) * (panelHeight + gap) }));
  const png = await sharp({ create: { width: sheetWidth, height: sheetHeight, channels: 4, background: "#151515" } }).composite(overlays).png().toBuffer();

  return {
    png,
    evidence: Object.freeze({
      width: sourceMeta.width,
      height: sourceMeta.height,
      changedPixelRatio: diff.evidence.changedPixelRatio,
      changeBounds: diff.evidence.changeBounds,
      inspectionBounds: Object.freeze(inspectionBounds),
      changeRegions: Object.freeze(changeRegions),
      panels: Object.freeze(panelInputs.map((entry) => entry.id)),
    }),
  };
}
