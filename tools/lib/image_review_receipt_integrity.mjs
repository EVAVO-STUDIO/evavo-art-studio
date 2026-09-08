import { createHash } from "node:crypto";

const IMAGE_REVIEW_RECEIPT_CONTRACT = "evavo.image-review-session.v1_2";
const IMAGE_REVIEW_ENGINE_CONTRACT = "evavo_image_review_orchestrator_v1_3";
const IMAGE_REVIEW_EVIDENCE_INTEGRITY_CONTRACT = "evavo.image-review-evidence-integrity.v1";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function canonicalizeImageReviewEvidence(value) {
  if (Array.isArray(value)) return value.map(canonicalizeImageReviewEvidence);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeImageReviewEvidence(value[key])]));
  }
  return value;
}

function canonicalImageReviewEvidenceJson(value) {
  return JSON.stringify(canonicalizeImageReviewEvidence(value));
}

function digestImageReviewEvidence(value) {
  return sha256(Buffer.from(canonicalImageReviewEvidenceJson(value), "utf8"));
}

function imageReviewEvidenceFromResult({ result, intendedRole = null, declaredProfile = null, filename }) {
  if (!result || typeof result !== "object") throw new Error("Image review result is required for evidence integrity.");
  if (typeof filename !== "string" || !filename.trim()) throw new Error("filename is required for image review evidence integrity.");
  return Object.freeze({
    integrityContract: IMAGE_REVIEW_EVIDENCE_INTEGRITY_CONTRACT,
    reviewEngineContract: IMAGE_REVIEW_ENGINE_CONTRACT,
    intendedRole: intendedRole ?? null,
    declaredProfile: declaredProfile ?? null,
    filename,
    resolvedProfile: result.profile,
    profileReason: result.profileReason,
    quality: result.quality,
    defectReview: result.defectReview,
    finishingPlan: result.finishingPlan,
    artifactSignals: result.artifactSignals,
    header: result.header ?? null,
    similarity: result.similarity,
    decision: result.decision,
    blockers: result.blockers,
    warnings: result.warnings,
    visualReviewRequired: true,
    visualChecklist: result.visualChecklist,
  });
}

function imageReviewEvidenceFromReceipt(value) {
  if (!value || typeof value !== "object") throw new Error("Image review receipt is required for evidence integrity.");
  return Object.freeze({
    integrityContract: value.reviewEvidenceIntegrityContract,
    reviewEngineContract: value.reviewEngineContract,
    intendedRole: value.intendedRole ?? null,
    declaredProfile: value.declaredProfile ?? null,
    filename: value.filename,
    resolvedProfile: value.resolvedProfile,
    profileReason: value.profileReason,
    quality: value.quality,
    defectReview: value.defectReview,
    finishingPlan: value.finishingPlan,
    artifactSignals: value.artifactSignals,
    header: value.header ?? null,
    similarity: value.similarity,
    decision: value.decision,
    blockers: value.blockers,
    warnings: value.warnings,
    visualReviewRequired: value.visualReviewRequired,
    visualChecklist: value.visualChecklist,
  });
}

function assertImageReviewEvidenceDigest(value) {
  if (value?.reviewEvidenceIntegrityContract !== IMAGE_REVIEW_EVIDENCE_INTEGRITY_CONTRACT) throw new Error("Image-review receipt uses an unsupported evidence-integrity contract.");
  if (value?.reviewEngineContract !== IMAGE_REVIEW_ENGINE_CONTRACT) throw new Error("Image-review receipt uses an unsupported review engine contract.");
  if (!/^[0-9a-f]{64}$/u.test(String(value?.reviewEvidenceSha256 ?? ""))) throw new Error("Image-review receipt is missing a valid reviewEvidenceSha256.");
  const actual = digestImageReviewEvidence(imageReviewEvidenceFromReceipt(value));
  if (actual !== value.reviewEvidenceSha256) throw new Error("Image-review receipt review evidence was modified after review.");
  return Object.freeze({ ok: true, reviewEvidenceSha256: actual });
}

export {
  IMAGE_REVIEW_RECEIPT_CONTRACT,
  IMAGE_REVIEW_ENGINE_CONTRACT,
  IMAGE_REVIEW_EVIDENCE_INTEGRITY_CONTRACT,
  assertImageReviewEvidenceDigest,
  canonicalImageReviewEvidenceJson,
  canonicalizeImageReviewEvidence,
  digestImageReviewEvidence,
  imageReviewEvidenceFromReceipt,
  imageReviewEvidenceFromResult,
};
