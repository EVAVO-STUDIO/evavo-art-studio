import { createHash } from "node:crypto";
import sharp, { type OverlayOptions } from "sharp";
import { reviewWorkHeaderImage } from "./work-header-quality.js";
import { compareImageSimilarity } from "./image-similarity.js";

export interface WorkHeaderCandidateInput {
  readonly id: string;
  readonly image: Buffer;
  readonly provenance?: string;
}

export interface WorkHeaderReviewBrief {
  readonly pageTitle: string;
  readonly projectSummary: string;
  readonly visualIntent?: string;
}

export interface WorkHeaderCandidateReviewSpec {
  readonly candidates: readonly WorkHeaderCandidateInput[];
  readonly currentHeader?: Buffer;
  readonly supportImage?: Buffer;
  readonly tileImage?: Buffer;
  readonly reviewBrief?: WorkHeaderReviewBrief;
  readonly maximumCandidates?: number;
}

export interface WorkHeaderCandidateReviewResult {
  readonly proofPng: Buffer;
  readonly evidence: Readonly<{
    reviewBrief: Readonly<{ pageTitle: string; projectSummary: string; visualIntent: string | null }> | null;
    semanticBriefRequiredForReplacement: true;
    currentHeader: Readonly<{
      imageSha256: string;
      technicalScore: number;
      technicalGrade: "pass" | "warn" | "fail";
      technicalIssues: readonly string[];
      minimumCropRetainedRatio: number;
      maximumUpscaleRatio: number;
    }> | null;
    supportImageSha256: string | null;
    tileImageSha256: string | null;
    candidates: readonly Readonly<{
      id: string;
      imageSha256: string;
      provenance: string | null;
      technicalScore: number;
      technicalGrade: "pass" | "warn" | "fail";
      technicalIssues: readonly string[];
      minimumCropRetainedRatio: number;
      maximumUpscaleRatio: number;
      similarityToCurrentHeader: number | null;
      similarityToSupportImage: number | null;
      similarityToTileImage: number | null;
      exactDuplicateOfSupport: boolean;
      nearDuplicateOfSupport: boolean;
      technicallyEligibleForVisualReview: boolean;
    }>[];
    technicalShortlist: readonly string[];
    creativeWinner: null;
    finalSelectionAllowed: false;
    visualCritiqueRequired: true;
    currentHeaderBaselineRequiredForReplacement: true;
    critiqueHashBindingRequired: true;
    surroundingMediaHashBindingRequired: true;
    visualCritiqueDimensions: readonly string[];
  }>;
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function safeLabel(value: string): string {
  return value.replace(/[&<>"']/gu, (token) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[token]!));
}

function cleanBrief(brief: WorkHeaderReviewBrief | undefined) {
  if (!brief) return null;
  const pageTitle = String(brief.pageTitle ?? "").trim();
  const projectSummary = String(brief.projectSummary ?? "").trim();
  const visualIntent = brief.visualIntent === undefined ? null : String(brief.visualIntent).trim();
  if (!pageTitle || pageTitle.length > 200) throw new Error("reviewBrief.pageTitle must contain 1-200 characters.");
  if (!projectSummary || projectSummary.length > 1200) throw new Error("reviewBrief.projectSummary must contain 1-1200 characters.");
  if (visualIntent !== null && (!visualIntent || visualIntent.length > 800)) throw new Error("reviewBrief.visualIntent must contain 1-800 characters when supplied.");
  return Object.freeze({ pageTitle, projectSummary, visualIntent });
}

async function briefPanel(brief: NonNullable<ReturnType<typeof cleanBrief>>): Promise<Buffer> {
  const width = 1418;
  const height = 128;
  const summary = brief.projectSummary.length > 150 ? `${brief.projectSummary.slice(0, 147)}…` : brief.projectSummary;
  const intent = brief.visualIntent ? (brief.visualIntent.length > 140 ? `${brief.visualIntent.slice(0, 137)}…` : brief.visualIntent) : "No extra visual intent supplied.";
  const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#050505"/><text x="20" y="30" font-family="Arial,sans-serif" font-size="22" fill="#ffffff">REVIEW BRIEF • ${safeLabel(brief.pageTitle)}</text><text x="20" y="62" font-family="Arial,sans-serif" font-size="16" fill="#dddddd">${safeLabel(summary)}</text><text x="20" y="92" font-family="Arial,sans-serif" font-size="15" fill="#aaaaaa">Visual intent: ${safeLabel(intent)}</text><text x="20" y="116" font-family="Arial,sans-serif" font-size="14" fill="#ff7b95">Judge semantic relevance against this brief; sharp but irrelevant imagery is a failure.</text></svg>`);
  return sharp(svg).png().toBuffer();
}

async function referencePanel(image: Buffer, label: string): Promise<Buffer> {
  const width = 700;
  const height = 440;
  const preview = await sharp(image, { failOn: "error" }).resize({ width, height: 380, fit: "contain", background: "#111111" }).flatten({ background: "#111111" }).png().toBuffer();
  const caption = Buffer.from(`<svg width="${width}" height="60" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#050505"/><text x="18" y="27" font-family="Arial,sans-serif" font-size="20" fill="#ffffff">${safeLabel(label)}</text><text x="18" y="49" font-family="Arial,sans-serif" font-size="13" fill="#aaaaaa">Context reference • SHA ${sha256(image).slice(0, 12)}</text></svg>`);
  return sharp({ create: { width, height, channels: 4, background: "#111111" } }).composite([{ input: preview, left: 0, top: 0 }, { input: caption, left: 0, top: 380 }]).png().toBuffer();
}

async function candidatePanel(id: string, proof: Buffer, score: number, grade: string, issues: readonly string[], current = false): Promise<Buffer> {
  const width = 700;
  const proofMeta = await sharp(proof).metadata();
  const proofHeight = proofMeta.height ?? 1000;
  const captionHeight = 92;
  const prefix = current ? "CURRENT • " : "";
  const caption = Buffer.from(`<svg width="${width}" height="${captionHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#050505"/><text x="18" y="30" font-family="Arial,sans-serif" font-size="21" fill="#ffffff">${safeLabel(prefix + id)}</text><text x="18" y="57" font-family="Arial,sans-serif" font-size="17" fill="#dddddd">technical ${score}/100 • ${safeLabel(grade)} • issues ${issues.length}</text><text x="18" y="80" font-family="Arial,sans-serif" font-size="14" fill="#aaaaaa">${current ? "Baseline to beat. Retain unless replacement proves a material advantage." : "Technical score is not creative approval. Inspect every crop."}</text></svg>`);
  const resizedProof = await sharp(proof).resize({ width, fit: "inside", withoutEnlargement: false }).png().toBuffer();
  const resizedMeta = await sharp(resizedProof).metadata();
  const actualHeight = resizedMeta.height ?? proofHeight;
  return sharp({ create: { width, height: actualHeight + captionHeight, channels: 4, background: "#111111" } })
    .composite([{ input: resizedProof, left: 0, top: 0 }, { input: caption, left: 0, top: actualHeight }])
    .png()
    .toBuffer();
}

function baselineEvidence(header: Awaited<ReturnType<typeof reviewWorkHeaderImage>>, image: Buffer) {
  return Object.freeze({
    imageSha256: sha256(image),
    technicalScore: header.evidence.score,
    technicalGrade: header.evidence.grade,
    technicalIssues: header.evidence.issues,
    minimumCropRetainedRatio: Math.min(...header.evidence.viewportEvidence.map((item) => item.cropRetainedRatio)),
    maximumUpscaleRatio: Math.max(...header.evidence.viewportEvidence.map((item) => item.effectiveUpscaleRatio)),
  });
}

export async function compareWorkHeaderCandidates(spec: WorkHeaderCandidateReviewSpec): Promise<WorkHeaderCandidateReviewResult> {
  const maximumCandidates = spec.maximumCandidates ?? 8;
  if (!Number.isInteger(maximumCandidates) || maximumCandidates < 2 || maximumCandidates > 12) throw new Error("maximumCandidates must be an integer from 2 through 12.");
  if (!Array.isArray(spec.candidates) || spec.candidates.length < 2) throw new Error("At least two Work-header candidates are required.");
  if (spec.candidates.length > maximumCandidates) throw new Error(`Work-header candidate count exceeds maximumCandidates (${maximumCandidates}).`);
  const ids = spec.candidates.map((candidate) => candidate.id.trim());
  if (ids.some((id) => !id)) throw new Error("Every Work-header candidate requires a non-empty id.");
  if (new Set(ids).size !== ids.length) throw new Error("Work-header candidate ids must be unique.");
  const reviewBrief = cleanBrief(spec.reviewBrief);

  const currentHeaderReview = spec.currentHeader ? await reviewWorkHeaderImage(spec.currentHeader) : null;
  const reviewed = await Promise.all(spec.candidates.map(async (candidate) => {
    const header = await reviewWorkHeaderImage(candidate.image);
    const current = spec.currentHeader ? await compareImageSimilarity(candidate.image, spec.currentHeader) : null;
    const support = spec.supportImage ? await compareImageSimilarity(candidate.image, spec.supportImage) : null;
    const tile = spec.tileImage ? await compareImageSimilarity(candidate.image, spec.tileImage) : null;
    const minimumCropRetainedRatio = Math.min(...header.evidence.viewportEvidence.map((item) => item.cropRetainedRatio));
    const maximumUpscaleRatio = Math.max(...header.evidence.viewportEvidence.map((item) => item.effectiveUpscaleRatio));
    const technicallyEligibleForVisualReview = header.evidence.grade !== "fail" && support?.recommendation !== "reject-duplicate";
    return {
      candidate,
      header,
      evidence: Object.freeze({
        id: candidate.id,
        imageSha256: sha256(candidate.image),
        provenance: candidate.provenance ?? null,
        technicalScore: header.evidence.score,
        technicalGrade: header.evidence.grade,
        technicalIssues: header.evidence.issues,
        minimumCropRetainedRatio,
        maximumUpscaleRatio,
        similarityToCurrentHeader: current?.perceptualSimilarity ?? null,
        similarityToSupportImage: support?.perceptualSimilarity ?? null,
        similarityToTileImage: tile?.perceptualSimilarity ?? null,
        exactDuplicateOfSupport: support?.recommendation === "reject-duplicate",
        nearDuplicateOfSupport: support?.nearDuplicate ?? false,
        technicallyEligibleForVisualReview,
      }),
    };
  }));

  const technicalShortlist = reviewed.filter((item) => item.evidence.technicallyEligibleForVisualReview).sort((a, b) => b.evidence.technicalScore - a.evidence.technicalScore).map((item) => item.evidence.id);

  const panels: Buffer[] = [];
  if (reviewBrief) panels.push(await briefPanel(reviewBrief));
  if (spec.supportImage) panels.push(await referencePanel(spec.supportImage, "CURRENT SUPPORT IMAGE"));
  if (spec.tileImage) panels.push(await referencePanel(spec.tileImage, "CURRENT WORK TILE"));
  if (currentHeaderReview && spec.currentHeader) panels.push(await candidatePanel("current-header", currentHeaderReview.proofPng, currentHeaderReview.evidence.score, currentHeaderReview.evidence.grade, currentHeaderReview.evidence.issues, true));
  panels.push(...await Promise.all(reviewed.map((item) => candidatePanel(item.evidence.id, item.header.proofPng, item.evidence.technicalScore, item.evidence.technicalGrade, item.evidence.technicalIssues))));

  const panelMeta = await Promise.all(panels.map((panel) => sharp(panel).metadata()));
  const gap = 18;
  const width = 1418;
  const composites: OverlayOptions[] = [];
  let top = 0;
  for (let index = 0; index < panels.length;) {
    const panelWidth = panelMeta[index]?.width ?? 700;
    if (panelWidth > 700) {
      composites.push({ input: panels[index], left: 0, top });
      top += (panelMeta[index]?.height ?? 0) + gap;
      index += 1;
      continue;
    }
    const leftHeight = panelMeta[index]?.height ?? 0;
    const rightHeight = panelMeta[index + 1]?.width && (panelMeta[index + 1]?.width ?? 0) <= 700 ? (panelMeta[index + 1]?.height ?? 0) : 0;
    composites.push({ input: panels[index], left: 0, top });
    if (rightHeight > 0) composites.push({ input: panels[index + 1], left: 718, top });
    top += Math.max(leftHeight, rightHeight) + gap;
    index += rightHeight > 0 ? 2 : 1;
  }
  const proofHeight = Math.max(1, top - gap);
  const proofPng = await sharp({ create: { width, height: proofHeight, channels: 4, background: "#171717" } }).composite(composites).png({ compressionLevel: 9 }).toBuffer();

  return {
    proofPng,
    evidence: Object.freeze({
      reviewBrief,
      semanticBriefRequiredForReplacement: true,
      currentHeader: currentHeaderReview && spec.currentHeader ? baselineEvidence(currentHeaderReview, spec.currentHeader) : null,
      supportImageSha256: spec.supportImage ? sha256(spec.supportImage) : null,
      tileImageSha256: spec.tileImage ? sha256(spec.tileImage) : null,
      candidates: Object.freeze(reviewed.map((item) => item.evidence)),
      technicalShortlist: Object.freeze(technicalShortlist),
      creativeWinner: null,
      finalSelectionAllowed: false,
      visualCritiqueRequired: true,
      currentHeaderBaselineRequiredForReplacement: true,
      critiqueHashBindingRequired: true,
      surroundingMediaHashBindingRequired: true,
      visualCritiqueDimensions: Object.freeze([
        "semantic relevance to the actual case study/project and supplied review brief",
        "focal-point strength and immediate readability",
        "desktop/laptop/mobile crop stability",
        "visual hierarchy with the page title and copy",
        "brand fit and EVAVO art direction",
        "authenticity versus generic/stock/AI-looking appearance",
        "texture/detail credibility without blur, plasticity or oversharpening",
        "relationship to the support image and tile without repetitive storytelling",
        "whether a senior designer would deliberately choose this over the current image",
      ]),
    }),
  };
}
