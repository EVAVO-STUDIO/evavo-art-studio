import sharp from "sharp";
import { compareImageSimilarity } from "./image-similarity.js";
import { reviewExistingImageQuality } from "./existing-image-quality-review.js";
import { reviewWorkHeaderImage } from "./work-header-quality.js";

export interface WorkPageMediaReviewSpec {
  readonly pageSlug?: string;
  readonly header: Buffer;
  readonly support?: Buffer;
  readonly tile?: Buffer;
  readonly desktopScreenshot?: Buffer;
  readonly mobileScreenshot?: Buffer;
  readonly nearDuplicateThreshold?: number;
}

export interface WorkPageMediaReviewResult {
  readonly proofPng: Buffer;
  readonly evidence: Readonly<{
    pageSlug: string | null;
    header: Awaited<ReturnType<typeof reviewWorkHeaderImage>>["evidence"];
    support: Awaited<ReturnType<typeof reviewExistingImageQuality>> | null;
    tile: Awaited<ReturnType<typeof reviewExistingImageQuality>> | null;
    headerToSupportSimilarity: Awaited<ReturnType<typeof compareImageSimilarity>> | null;
    headerToTileSimilarity: Awaited<ReturnType<typeof compareImageSimilarity>> | null;
    desktopScreenshotProvided: boolean;
    mobileScreenshotProvided: boolean;
    blockers: readonly string[];
    warnings: readonly string[];
    decision: "reject" | "needs-finishing" | "requires-visual-page-review";
    publicationAllowed: false;
    visualPageReviewRequired: true;
  }>;
}

async function labelledPanel(input: Buffer, label: string, width = 720, maxHeight = 520): Promise<Buffer> {
  const meta = await sharp(input, { failOn: "error" }).metadata();
  if (!meta.width || !meta.height) throw new Error(`${label} has no image dimensions.`);
  const contentHeight = Math.max(96, Math.min(maxHeight, Math.round(width * meta.height / meta.width)));
  const preview = await sharp(input, { failOn: "error" })
    .flatten({ background: "#111111" })
    .resize({ width, height: contentHeight, fit: "contain", background: "#111111" })
    .png()
    .toBuffer();
  const safe = label.replace(/[&<>"']/gu, (value) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[value]!));
  const captionHeight = 48;
  const caption = Buffer.from(`<svg width="${width}" height="${captionHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#050505"/><text x="18" y="31" font-family="Arial,sans-serif" font-size="20" fill="#ffffff">${safe}</text></svg>`);
  return sharp({ create: { width, height: contentHeight + captionHeight, channels: 4, background: "#111111" } })
    .composite([{ input: preview, left: 0, top: 0 }, { input: caption, left: 0, top: contentHeight }])
    .png()
    .toBuffer();
}

async function stackPanels(panels: readonly Buffer[]): Promise<Buffer> {
  const gap = 16;
  const metas = await Promise.all(panels.map((panel) => sharp(panel).metadata()));
  const width = Math.max(...metas.map((meta) => meta.width ?? 1));
  const height = metas.reduce((sum, meta) => sum + (meta.height ?? 0), 0) + gap * Math.max(0, panels.length - 1);
  let top = 0;
  const composites: sharp.OverlayOptions[] = [];
  for (let index = 0; index < panels.length; index += 1) {
    composites.push({ input: panels[index], left: 0, top });
    top += (metas[index]?.height ?? 0) + gap;
  }
  return sharp({ create: { width, height, channels: 4, background: "#181818" } })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Builds one review bundle for the actual media relationship on an EVAVO Work
 * page. Metrics shortlist problems; the final decision intentionally remains a
 * visual page-context decision. Optional browser screenshots make it possible
 * for a vision-capable reviewer to judge the real composition in the same proof.
 */
export async function createWorkPageMediaReviewBundle(
  spec: WorkPageMediaReviewSpec,
): Promise<WorkPageMediaReviewResult> {
  if (!spec?.header?.length) throw new Error("Work page media review requires a header image.");
  const headerResult = await reviewWorkHeaderImage(spec.header);
  const support = spec.support ? await reviewExistingImageQuality(spec.support) : null;
  const tile = spec.tile ? await reviewExistingImageQuality(spec.tile) : null;
  const threshold = spec.nearDuplicateThreshold ?? 0.90;
  const headerToSupportSimilarity = spec.support
    ? await compareImageSimilarity(spec.header, spec.support, { nearDuplicateThreshold: threshold })
    : null;
  const headerToTileSimilarity = spec.tile
    ? await compareImageSimilarity(spec.header, spec.tile, { nearDuplicateThreshold: threshold })
    : null;

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (headerResult.evidence.grade === "fail") blockers.push("header-technical-quality-failed");
  if (support?.grade === "fail") warnings.push("support-image-technical-quality-failed");
  if (tile?.grade === "fail") warnings.push("tile-image-technical-quality-failed");
  if (headerToSupportSimilarity?.recommendation === "reject-duplicate") blockers.push("header-and-support-are-exact-duplicates");
  else if (headerToSupportSimilarity?.nearDuplicate) warnings.push("header-and-support-are-near-duplicates");
  if (headerToTileSimilarity?.nearDuplicate) warnings.push("header-and-tile-are-visually-similar");
  if (!spec.desktopScreenshot) warnings.push("desktop-page-screenshot-not-provided");
  if (!spec.mobileScreenshot) warnings.push("mobile-page-screenshot-not-provided");

  const finishSignals = [
    ...headerResult.evidence.issues,
    ...(support?.issues ?? []),
  ].some((issue) => /soft|blur|halo|contamination|pinhole|block|undersized/u.test(issue));
  const decision: WorkPageMediaReviewResult["evidence"]["decision"] = blockers.length
    ? "reject"
    : finishSignals
      ? "needs-finishing"
      : "requires-visual-page-review";

  const panels: Buffer[] = [];
  panels.push(await labelledPanel(headerResult.proofPng, "Header viewport crops: desktop / laptop / mobile", 720, 1500));
  if (spec.support) panels.push(await labelledPanel(spec.support, "Current/proposed support image"));
  if (spec.tile) panels.push(await labelledPanel(spec.tile, "Work catalogue tile image"));
  if (spec.desktopScreenshot) panels.push(await labelledPanel(spec.desktopScreenshot, "Actual desktop page context", 720, 900));
  if (spec.mobileScreenshot) panels.push(await labelledPanel(spec.mobileScreenshot, "Actual mobile page context", 720, 1200));
  const proofPng = await stackPanels(panels);

  return {
    proofPng,
    evidence: Object.freeze({
      pageSlug: spec.pageSlug ?? null,
      header: headerResult.evidence,
      support,
      tile,
      headerToSupportSimilarity,
      headerToTileSimilarity,
      desktopScreenshotProvided: Boolean(spec.desktopScreenshot),
      mobileScreenshotProvided: Boolean(spec.mobileScreenshot),
      blockers: Object.freeze(blockers),
      warnings: Object.freeze(warnings),
      decision,
      publicationAllowed: false,
      visualPageReviewRequired: true,
    }),
  };
}
