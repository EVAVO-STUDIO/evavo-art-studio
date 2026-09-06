import sharp, { type OverlayOptions } from "sharp";
import { reviewWorkHeaderImage } from "./work-header-quality.js";
import { compareImageSimilarity } from "./image-similarity.js";

export interface WorkHeaderCandidateInput {
  readonly id: string;
  readonly image: Buffer;
  readonly provenance?: string;
}

export interface WorkHeaderCandidateReviewSpec {
  readonly candidates: readonly WorkHeaderCandidateInput[];
  readonly currentHeader?: Buffer;
  readonly supportImage?: Buffer;
  readonly tileImage?: Buffer;
  readonly maximumCandidates?: number;
}

export interface WorkHeaderCandidateReviewResult {
  readonly proofPng: Buffer;
  readonly evidence: Readonly<{
    currentHeader: Readonly<{
      technicalScore: number;
      technicalGrade: "pass" | "warn" | "fail";
      technicalIssues: readonly string[];
      minimumCropRetainedRatio: number;
      maximumUpscaleRatio: number;
    }> | null;
    candidates: readonly Readonly<{
      id: string;
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
    visualCritiqueDimensions: readonly string[];
  }>;
}

function safeLabel(value: string): string {
  return value.replace(/[&<>"']/gu, (token) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[token]!));
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

function baselineEvidence(header: Awaited<ReturnType<typeof reviewWorkHeaderImage>>) {
  return Object.freeze({
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

  const technicalShortlist = reviewed
    .filter((item) => item.evidence.technicallyEligibleForVisualReview)
    .sort((a, b) => b.evidence.technicalScore - a.evidence.technicalScore)
    .map((item) => item.evidence.id);

  const panels: Buffer[] = [];
  if (currentHeaderReview) {
    panels.push(await candidatePanel("current-header", currentHeaderReview.proofPng, currentHeaderReview.evidence.score, currentHeaderReview.evidence.grade, currentHeaderReview.evidence.issues, true));
  }
  panels.push(...await Promise.all(reviewed.map((item) => candidatePanel(
    item.evidence.id,
    item.header.proofPng,
    item.evidence.technicalScore,
    item.evidence.technicalGrade,
    item.evidence.technicalIssues,
  ))));

  const panelMeta = await Promise.all(panels.map((panel) => sharp(panel).metadata()));
  const gap = 18;
  const width = 700 * 2 + gap;
  const rows = Math.ceil(panels.length / 2);
  const rowHeights: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    const left = panelMeta[row * 2]?.height ?? 0;
    const right = panelMeta[row * 2 + 1]?.height ?? 0;
    rowHeights.push(Math.max(left, right));
  }
  const height = rowHeights.reduce((sum, value) => sum + value, 0) + gap * Math.max(0, rows - 1);
  const composites: OverlayOptions[] = [];
  let top = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      const index = row * 2 + column;
      if (panels[index]) composites.push({ input: panels[index], left: column * (700 + gap), top });
    }
    top += rowHeights[row]! + gap;
  }
  const proofPng = await sharp({ create: { width, height, channels: 4, background: "#171717" } })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();

  return {
    proofPng,
    evidence: Object.freeze({
      currentHeader: currentHeaderReview ? baselineEvidence(currentHeaderReview) : null,
      candidates: Object.freeze(reviewed.map((item) => item.evidence)),
      technicalShortlist: Object.freeze(technicalShortlist),
      creativeWinner: null,
      finalSelectionAllowed: false,
      visualCritiqueRequired: true,
      currentHeaderBaselineRequiredForReplacement: true,
      visualCritiqueDimensions: Object.freeze([
        "semantic relevance to the actual case study/project",
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
