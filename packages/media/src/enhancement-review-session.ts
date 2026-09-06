import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  admitEnhancementStudioReviewManifest,
  type EnhancementStudioReviewManifest,
} from "./enhancement-review-bridge.js";
import { orchestrateImageReview } from "./image-review-orchestrator.js";
import { reviewExistingImageEdit } from "./existing-image-quality-review.js";
import { createWorkPageMediaReviewBundle } from "./work-page-media-review.js";

export interface EnhancementReviewSessionSpec {
  readonly manifest: EnhancementStudioReviewManifest;
  readonly source: Buffer;
  readonly candidate: Buffer;
  readonly header?: Buffer;
  readonly support?: Buffer;
  readonly tile?: Buffer;
  readonly desktopScreenshot?: Buffer;
  readonly mobileScreenshot?: Buffer;
}

export interface EnhancementReviewSessionResult {
  readonly qualityProofPng: Buffer;
  readonly differenceProofPng: Buffer;
  readonly pageProofPng?: Buffer;
  readonly evidence: Readonly<{
    profile: string;
    intendedRole: string;
    sourceBytesVerified: boolean;
    candidateBytesVerified: boolean;
    sourceDimensionsVerified: boolean;
    candidateDimensionsVerified: boolean;
    nativeCandidateReview: Awaited<ReturnType<typeof orchestrateImageReview>>;
    sourceSpaceEditReview: Awaited<ReturnType<typeof reviewExistingImageEdit>>["evidence"];
    pageContextReview: Awaited<ReturnType<typeof createWorkPageMediaReviewBundle>>["evidence"] | null;
    materialTechnicalBenefitFound: boolean;
    pageContextComplete: boolean;
    blockers: readonly string[];
    warnings: readonly string[];
    decision: "reject" | "needs-finishing" | "needs-page-context" | "ready-for-human-visual-review";
    publicationAllowed: false;
    cloudOverwriteAllowed: false;
    automaticCreativeApproval: false;
    finalVisualApprovalRequired: true;
  }>;
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function dimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(buffer, { failOn: "error" }).metadata();
  if (!meta.width || !meta.height) throw new Error("Enhancement review image has no dimensions.");
  return { width: meta.width, height: meta.height };
}

async function sourceSpaceCandidate(source: Buffer, candidate: Buffer): Promise<Buffer> {
  const [sourceMeta, candidateMeta] = await Promise.all([dimensions(source), dimensions(candidate)]);
  if (sourceMeta.width === candidateMeta.width && sourceMeta.height === candidateMeta.height) return candidate;
  if (candidateMeta.width < sourceMeta.width || candidateMeta.height < sourceMeta.height) {
    throw new Error("Enhancement candidate cannot be source-space reviewed because it is smaller than the source canvas.");
  }
  return sharp(candidate, { failOn: "error" })
    .ensureAlpha()
    .resize(sourceMeta.width, sourceMeta.height, { fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();
}

export async function reviewEnhancementStudioCandidate(
  spec: EnhancementReviewSessionSpec,
): Promise<EnhancementReviewSessionResult> {
  const admitted = admitEnhancementStudioReviewManifest(spec.manifest);
  const sourceHash = sha256(spec.source);
  const candidateHash = sha256(spec.candidate);
  if (sourceHash !== admitted.sourceSha256) throw new Error("Physical source bytes do not match Enhancement Studio manifest SHA-256.");
  if (candidateHash !== admitted.candidateSha256) throw new Error("Physical candidate bytes do not match Enhancement Studio manifest SHA-256.");

  const [sourceMeta, candidateMeta] = await Promise.all([dimensions(spec.source), dimensions(spec.candidate)]);
  const sourceDimensionsVerified = sourceMeta.width === spec.manifest.source_width && sourceMeta.height === spec.manifest.source_height;
  const candidateDimensionsVerified = candidateMeta.width === spec.manifest.candidate_width && candidateMeta.height === spec.manifest.candidate_height;
  if (!sourceDimensionsVerified || !candidateDimensionsVerified) throw new Error("Enhancement Studio manifest dimensions do not match physical image dimensions.");

  const compareAgainst = [
    ...(spec.header ? [{ id: "current-header", image: spec.header }] : []),
    ...(spec.support ? [{ id: "support-image", image: spec.support }] : []),
    ...(spec.tile ? [{ id: "work-tile", image: spec.tile }] : []),
  ];
  const nativeCandidateReview = await orchestrateImageReview(spec.candidate, {
    intendedRole: admitted.intendedRole,
    declaredProfile: admitted.profile,
    compareAgainst,
  });

  const projected = await sourceSpaceCandidate(spec.source, spec.candidate);
  const sourceSpaceEdit = await reviewExistingImageEdit(spec.source, projected, {
    preserveOpaqueRgb: false,
    maximumChangedPixelRatio: 1,
    maximumSharpnessRegressionRatio: 0.08,
    maximumHaloRegression: 0.006,
    maximumPinholeRegression: 0.00003,
  });

  let pageContextReview: Awaited<ReturnType<typeof createWorkPageMediaReviewBundle>>["evidence"] | null = null;
  let pageProofPng: Buffer | undefined;
  if (admitted.pageContextReviewRequired) {
    if (admitted.intendedRole === "work-header") {
      const page = await createWorkPageMediaReviewBundle({
        pageSlug: "enhancement-review",
        header: spec.candidate,
        support: spec.support,
        tile: spec.tile,
        desktopScreenshot: spec.desktopScreenshot,
        mobileScreenshot: spec.mobileScreenshot,
      });
      pageContextReview = page.evidence;
      pageProofPng = page.proofPng;
    } else if (admitted.intendedRole === "support-image" && spec.header) {
      const page = await createWorkPageMediaReviewBundle({
        pageSlug: "enhancement-review",
        header: spec.header,
        support: spec.candidate,
        tile: spec.tile,
        desktopScreenshot: spec.desktopScreenshot,
        mobileScreenshot: spec.mobileScreenshot,
      });
      pageContextReview = page.evidence;
      pageProofPng = page.proofPng;
    } else if (admitted.intendedRole === "tile" && spec.header) {
      const page = await createWorkPageMediaReviewBundle({
        pageSlug: "enhancement-review",
        header: spec.header,
        support: spec.support,
        tile: spec.candidate,
        desktopScreenshot: spec.desktopScreenshot,
        mobileScreenshot: spec.mobileScreenshot,
      });
      pageContextReview = page.evidence;
      pageProofPng = page.proofPng;
    }
  }

  const blockers = [
    ...nativeCandidateReview.blockers,
    ...sourceSpaceEdit.evidence.regressions.map((item) => `source-space:${item}`),
    ...(pageContextReview?.blockers ?? []).map((item) => `page:${item}`),
  ];
  const warnings = [
    ...nativeCandidateReview.warnings,
    ...sourceSpaceEdit.evidence.improvements.map((item) => `improvement:${item}`),
    ...(pageContextReview?.warnings ?? []).map((item) => `page:${item}`),
  ];

  const materialTechnicalBenefitFound = sourceSpaceEdit.evidence.improvements.length > 0 ||
    nativeCandidateReview.quality.score >= sourceSpaceEdit.evidence.source.score + 3;
  if (!materialTechnicalBenefitFound) {
    warnings.push("no-material-technical-benefit-proved-over-source");
    if (admitted.learnedCandidate) blockers.push("learned-enhancement-has-no-proven-source-space-benefit");
  }

  const pageContextComplete = !admitted.pageContextReviewRequired || (
    Boolean(pageContextReview) &&
    Boolean(spec.desktopScreenshot) &&
    Boolean(spec.mobileScreenshot) &&
    (admitted.intendedRole === "work-header" || Boolean(spec.header))
  );
  if (admitted.pageContextReviewRequired) {
    if (!spec.desktopScreenshot) warnings.push("desktop-page-context-missing");
    if (!spec.mobileScreenshot) warnings.push("mobile-page-context-missing");
    if (admitted.intendedRole !== "work-header" && !spec.header) warnings.push("current-header-missing-for-page-media-context-review");
  }
  if (admitted.learnedCandidate) warnings.push("learned-enhancement-requires-invented-detail-and-texture-hallucination-review");

  const needsFinishing = nativeCandidateReview.decision === "needs-finishing" || sourceSpaceEdit.evidence.verdict === "warn" || pageContextReview?.decision === "needs-finishing";
  const decision: EnhancementReviewSessionResult["evidence"]["decision"] = blockers.length
    ? "reject"
    : needsFinishing
      ? "needs-finishing"
      : !pageContextComplete
        ? "needs-page-context"
        : "ready-for-human-visual-review";

  return {
    qualityProofPng: sourceSpaceEdit.proofPng,
    differenceProofPng: sourceSpaceEdit.differenceProofPng,
    ...(pageProofPng ? { pageProofPng } : {}),
    evidence: Object.freeze({
      profile: admitted.profile,
      intendedRole: admitted.intendedRole,
      sourceBytesVerified: true,
      candidateBytesVerified: true,
      sourceDimensionsVerified,
      candidateDimensionsVerified,
      nativeCandidateReview,
      sourceSpaceEditReview: sourceSpaceEdit.evidence,
      pageContextReview,
      materialTechnicalBenefitFound,
      pageContextComplete,
      blockers: Object.freeze([...new Set(blockers)]),
      warnings: Object.freeze([...new Set(warnings)]),
      decision,
      publicationAllowed: false,
      cloudOverwriteAllowed: false,
      automaticCreativeApproval: false,
      finalVisualApprovalRequired: true,
    }),
  };
}
