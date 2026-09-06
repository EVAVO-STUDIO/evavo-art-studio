import { createHash } from "node:crypto";
import sharp, { type OverlayOptions } from "sharp";

export const WORK_HEADER_PAGE_RENDER_REVIEW_CONTRACT = "evavo.work-header-page-render-review.v2" as const;
const MAX_SCREENSHOT_BYTES = 40 * 1024 * 1024;
const MAX_NOTES = 24;
const MAX_NOTE_CHARACTERS = 500;
const MAX_NOTES_CHARACTERS = 4_000;

export interface WorkHeaderPageRenderReviewSpec {
  readonly pageSlug: string;
  readonly pageTitle: string;
  readonly candidateId: string;
  readonly candidateSha256: string;
  readonly currentDesktop: Buffer;
  readonly candidateDesktop: Buffer;
  readonly currentMobile: Buffer;
  readonly candidateMobile: Buffer;
  readonly titleLegibility: number;
  readonly focalPointQuality: number;
  readonly hierarchyQuality: number;
  readonly responsiveConsistency: number;
  readonly overallPageQuality: number;
  readonly currentPageQuality: number;
  readonly minimumPageQualityAdvantage?: number;
  readonly titleObscured: boolean;
  readonly textContrastFailure: boolean;
  readonly importantSubjectCropped: boolean;
  readonly layoutOverflowOrBreakage: boolean;
  readonly candidateLooksWorseThanCurrent: boolean;
  readonly notes: readonly string[];
}

export interface WorkHeaderPageRenderReviewResult {
  readonly contract: typeof WORK_HEADER_PAGE_RENDER_REVIEW_CONTRACT;
  readonly proofPng: Buffer;
  readonly evidence: Readonly<{
    pageSlug: string;
    pageTitle: string;
    candidateId: string;
    candidateSha256: string;
    currentDesktopSha256: string;
    candidateDesktopSha256: string;
    currentMobileSha256: string;
    candidateMobileSha256: string;
    desktopViewport: Readonly<{
      currentWidth: number;
      currentHeight: number;
      candidateWidth: number;
      candidateHeight: number;
      dimensionsMatch: boolean;
      screenshotsDiffer: boolean;
    }>;
    mobileViewport: Readonly<{
      currentWidth: number;
      currentHeight: number;
      candidateWidth: number;
      candidateHeight: number;
      dimensionsMatch: boolean;
      screenshotsDiffer: boolean;
    }>;
    currentPageQuality: number;
    candidatePageQuality: number;
    pageQualityAdvantage: number;
    minimumPageQualityAdvantage: number;
    materialPageQualityAdvantageVerified: boolean;
    visualScore: number;
    disqualifiers: readonly string[];
    verdict: "reject" | "rework" | "page-shortlist";
    pageRenderReviewPerformed: true;
    exactScreenshotHashesBound: true;
    comparableViewportGeometryVerified: boolean;
    candidateRenderDifferenceVerified: boolean;
    automaticPublicationAllowed: false;
    automaticWebsiteMutationAllowed: false;
    finalApprovalRequired: true;
  }>;
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function rating(value: unknown, label: string): number {
  if (!Number.isFinite(value) || Number(value) < 0 || Number(value) > 5) throw new Error(`${label} must be a number from 0 through 5.`);
  return Number(value);
}

function bounded(value: unknown, fallback: number, min: number, max: number, label: string): number {
  if (value == null) return fallback;
  if (!Number.isFinite(value) || Number(value) < min || Number(value) > max) throw new Error(`${label} must be a number from ${min} through ${max}.`);
  return Number(value);
}

function flag(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean.`);
  return value;
}

function hash(value: string, label: string): string {
  if (!/^[0-9a-f]{64}$/u.test(value)) throw new Error(`${label} must be a lowercase SHA-256 hex digest.`);
  return value;
}

function text(value: string, label: string, maximum: number): string {
  const cleaned = String(value ?? "").trim();
  if (!cleaned || cleaned.length > maximum) throw new Error(`${label} must contain 1-${maximum} characters.`);
  return cleaned;
}

function reviewNotes(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > MAX_NOTES) throw new Error(`notes must be an array with at most ${MAX_NOTES} entries.`);
  let total = 0;
  const notes = value.map((note, index) => {
    if (typeof note !== "string") throw new Error(`notes[${index}] must be a string.`);
    const cleaned = note.trim();
    if (!cleaned || cleaned.length > MAX_NOTE_CHARACTERS) throw new Error(`notes[${index}] must contain 1-${MAX_NOTE_CHARACTERS} characters.`);
    total += cleaned.length;
    if (total > MAX_NOTES_CHARACTERS) throw new Error(`notes exceed the ${MAX_NOTES_CHARACTERS}-character review limit.`);
    return cleaned;
  });
  return Object.freeze(notes);
}

function safe(value: string): string {
  return value.replace(/[&<>"']/gu, (token) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[token]!));
}

async function dimensions(image: Buffer, label: string): Promise<{ width: number; height: number }> {
  const meta = await sharp(image, { failOn: "error" }).metadata();
  if (!meta.width || !meta.height) throw new Error(`${label} screenshot has no dimensions.`);
  return { width: meta.width, height: meta.height };
}

async function panel(image: Buffer, label: string, width: number): Promise<Buffer> {
  const meta = await dimensions(image, label);
  const contentHeight = Math.min(1000, Math.max(180, Math.round(width * meta.height / meta.width)));
  const preview = await sharp(image).resize({ width, height: contentHeight, fit: "contain", background: "#111111" }).flatten({ background: "#111111" }).png().toBuffer();
  const caption = Buffer.from(`<svg width="${width}" height="50" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#050505"/><text x="16" y="32" font-family="Arial,sans-serif" font-size="19" fill="#ffffff">${safe(label)}</text></svg>`);
  return sharp({ create: { width, height: contentHeight + 50, channels: 4, background: "#111111" } }).composite([{ input: preview, left: 0, top: 0 }, { input: caption, left: 0, top: contentHeight }]).png().toBuffer();
}

export async function reviewWorkHeaderPageRender(spec: WorkHeaderPageRenderReviewSpec): Promise<WorkHeaderPageRenderReviewResult> {
  const pageSlug = text(spec.pageSlug, "pageSlug", 240);
  if (!/^\/work\/[a-z0-9-]+$/u.test(pageSlug)) throw new Error("pageSlug must be a canonical Work detail route under /work/.");
  const pageTitle = text(spec.pageTitle, "pageTitle", 200);
  const candidateId = text(spec.candidateId, "candidateId", 160);
  const candidateSha256 = hash(spec.candidateSha256, "candidateSha256");
  for (const [label, image] of [["currentDesktop", spec.currentDesktop], ["candidateDesktop", spec.candidateDesktop], ["currentMobile", spec.currentMobile], ["candidateMobile", spec.candidateMobile]] as const) {
    if (!Buffer.isBuffer(image) || image.length === 0) throw new Error(`${label} screenshot is required.`);
    if (image.length > MAX_SCREENSHOT_BYTES) throw new Error(`${label} screenshot exceeds the ${MAX_SCREENSHOT_BYTES}-byte review limit.`);
  }
  reviewNotes(spec.notes);
  const titleObscured = flag(spec.titleObscured, "titleObscured");
  const textContrastFailure = flag(spec.textContrastFailure, "textContrastFailure");
  const importantSubjectCropped = flag(spec.importantSubjectCropped, "importantSubjectCropped");
  const layoutOverflowOrBreakage = flag(spec.layoutOverflowOrBreakage, "layoutOverflowOrBreakage");
  const candidateLooksWorseThanCurrent = flag(spec.candidateLooksWorseThanCurrent, "candidateLooksWorseThanCurrent");

  const [currentDesktopMeta, candidateDesktopMeta, currentMobileMeta, candidateMobileMeta] = await Promise.all([
    dimensions(spec.currentDesktop, "currentDesktop"),
    dimensions(spec.candidateDesktop, "candidateDesktop"),
    dimensions(spec.currentMobile, "currentMobile"),
    dimensions(spec.candidateMobile, "candidateMobile"),
  ]);
  const currentDesktopSha = sha256(spec.currentDesktop);
  const candidateDesktopSha = sha256(spec.candidateDesktop);
  const currentMobileSha = sha256(spec.currentMobile);
  const candidateMobileSha = sha256(spec.candidateMobile);
  const desktopDimensionsMatch = currentDesktopMeta.width === candidateDesktopMeta.width && currentDesktopMeta.height === candidateDesktopMeta.height;
  const mobileDimensionsMatch = currentMobileMeta.width === candidateMobileMeta.width && currentMobileMeta.height === candidateMobileMeta.height;
  const desktopScreenshotsDiffer = currentDesktopSha !== candidateDesktopSha;
  const mobileScreenshotsDiffer = currentMobileSha !== candidateMobileSha;

  const values = [
    rating(spec.titleLegibility, "titleLegibility"),
    rating(spec.focalPointQuality, "focalPointQuality"),
    rating(spec.hierarchyQuality, "hierarchyQuality"),
    rating(spec.responsiveConsistency, "responsiveConsistency"),
    rating(spec.overallPageQuality, "overallPageQuality"),
  ];
  const currentPageQuality = rating(spec.currentPageQuality, "currentPageQuality");
  const candidatePageQuality = values[4]!;
  const minimumPageQualityAdvantage = bounded(spec.minimumPageQualityAdvantage, 0.25, 0, 2, "minimumPageQualityAdvantage");
  const pageQualityAdvantage = candidatePageQuality - currentPageQuality;
  const materialPageQualityAdvantageVerified = pageQualityAdvantage >= minimumPageQualityAdvantage;

  const disqualifiers: string[] = [];
  if (!desktopDimensionsMatch) disqualifiers.push("desktop-current-candidate-viewport-mismatch");
  if (!mobileDimensionsMatch) disqualifiers.push("mobile-current-candidate-viewport-mismatch");
  if (!desktopScreenshotsDiffer) disqualifiers.push("desktop-candidate-render-identical-to-current");
  if (!mobileScreenshotsDiffer) disqualifiers.push("mobile-candidate-render-identical-to-current");
  if (!materialPageQualityAdvantageVerified) disqualifiers.push("candidate-page-lacks-material-advantage-over-current");
  if (titleObscured) disqualifiers.push("title-obscured");
  if (textContrastFailure) disqualifiers.push("text-contrast-failure");
  if (importantSubjectCropped) disqualifiers.push("important-subject-cropped");
  if (layoutOverflowOrBreakage) disqualifiers.push("layout-overflow-or-breakage");
  if (candidateLooksWorseThanCurrent) disqualifiers.push("candidate-looks-worse-than-current-page");

  const weighted = values[0]! * 1.25 + values[1]! * 1.15 + values[2]! * 1.15 + values[3]! * 1.25 + values[4]! * 1.35;
  const visualScore = Math.round((weighted / (5 * (1.25 + 1.15 + 1.15 + 1.25 + 1.35))) * 100);
  const verdict = disqualifiers.length || visualScore < 65 || values.some((value) => value < 2.5)
    ? "reject"
    : visualScore < 82
      ? "rework"
      : "page-shortlist";

  const [currentDesktopPanel, candidateDesktopPanel, currentMobilePanel, candidateMobilePanel] = await Promise.all([
    panel(spec.currentDesktop, `CURRENT PAGE • DESKTOP • quality ${currentPageQuality.toFixed(1)}/5`, 700),
    panel(spec.candidateDesktop, `CANDIDATE ${candidateId} • DESKTOP • quality ${candidatePageQuality.toFixed(1)}/5`, 700),
    panel(spec.currentMobile, "CURRENT PAGE • MOBILE", 700),
    panel(spec.candidateMobile, `CANDIDATE ${candidateId} • MOBILE`, 700),
  ]);
  const panels = [currentDesktopPanel, candidateDesktopPanel, currentMobilePanel, candidateMobilePanel];
  const metas = await Promise.all(panels.map((item) => sharp(item).metadata()));
  const gap = 18;
  const rowOne = Math.max(metas[0]?.height ?? 0, metas[1]?.height ?? 0);
  const rowTwo = Math.max(metas[2]?.height ?? 0, metas[3]?.height ?? 0);
  const composites: OverlayOptions[] = [
    { input: panels[0], left: 0, top: 0 },
    { input: panels[1], left: 718, top: 0 },
    { input: panels[2], left: 0, top: rowOne + gap },
    { input: panels[3], left: 718, top: rowOne + gap },
  ];
  const proofPng = await sharp({ create: { width: 1418, height: rowOne + gap + rowTwo, channels: 4, background: "#171717" } }).composite(composites).png({ compressionLevel: 9 }).toBuffer();

  return {
    contract: WORK_HEADER_PAGE_RENDER_REVIEW_CONTRACT,
    proofPng,
    evidence: Object.freeze({
      pageSlug,
      pageTitle,
      candidateId,
      candidateSha256,
      currentDesktopSha256: currentDesktopSha,
      candidateDesktopSha256: candidateDesktopSha,
      currentMobileSha256: currentMobileSha,
      candidateMobileSha256: candidateMobileSha,
      desktopViewport: Object.freeze({ currentWidth: currentDesktopMeta.width, currentHeight: currentDesktopMeta.height, candidateWidth: candidateDesktopMeta.width, candidateHeight: candidateDesktopMeta.height, dimensionsMatch: desktopDimensionsMatch, screenshotsDiffer: desktopScreenshotsDiffer }),
      mobileViewport: Object.freeze({ currentWidth: currentMobileMeta.width, currentHeight: currentMobileMeta.height, candidateWidth: candidateMobileMeta.width, candidateHeight: candidateMobileMeta.height, dimensionsMatch: mobileDimensionsMatch, screenshotsDiffer: mobileScreenshotsDiffer }),
      currentPageQuality,
      candidatePageQuality,
      pageQualityAdvantage,
      minimumPageQualityAdvantage,
      materialPageQualityAdvantageVerified,
      visualScore,
      disqualifiers: Object.freeze(disqualifiers),
      verdict,
      pageRenderReviewPerformed: true,
      exactScreenshotHashesBound: true,
      comparableViewportGeometryVerified: desktopDimensionsMatch && mobileDimensionsMatch,
      candidateRenderDifferenceVerified: desktopScreenshotsDiffer && mobileScreenshotsDiffer,
      automaticPublicationAllowed: false,
      automaticWebsiteMutationAllowed: false,
      finalApprovalRequired: true,
    }),
  };
}
