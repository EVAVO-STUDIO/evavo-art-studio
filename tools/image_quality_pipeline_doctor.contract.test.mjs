import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("image quality doctor covers preservation enhancement and fully reverified Work preview/page review", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'contract: "evavo.image-quality-pipeline-doctor.v1_9"',
    'SERVER_VERSION = "1.9.0"',
    'id: "alpha-aware-quality"',
    'id: "profile-aware-defects"',
    'id: "defect-regions"',
    'id: "finishing-plan-core"',
    'id: "artifact-signals"',
    'id: "unified-orchestrator"',
    'id: "enhancement-review-schema"',
    'id: "enhancement-review-admission"',
    'id: "enhancement-session-fail-closed"',
    'id: "work-preview-admission-core"',
    'id: "work-preview-admission-mcp"',
    'id: "work-page-review-reverified-preview"',
    'id: "durable-review-session"',
    'id: "review-mcp-profile-policy"',
    'id: "defect-mcp-source-bound"',
    'id: "finishing-plan-mcp"',
    'id: "safe-output-bundle"',
    'id: "edit-mask-no-private-sharp"',
    'id: "mcp-registration"',
    "runtimeExecutionPerformed: false",
    "sourceMutationPerformed: false",
  ]) assert.ok(source.includes(token), `missing doctor contract token: ${token}`);
});

test("MCP configuration exposes quality doctor durable review finishing plan enhancement and preview admission", async () => {
  const config = await read("../.mcp.json");
  for (const token of [
    '"evavo-image-quality-pipeline-doctor-v1"',
    '"tools/image_quality_pipeline_doctor_mcp.mjs"',
    '"evavo-image-review-session-v1"',
    '"tools/image_review_session_mcp.mjs"',
    '"evavo-existing-image-finishing-plan-v1"',
    '"tools/existing_image_finishing_plan_mcp.mjs"',
    '"evavo-enhancement-review-session-v1"',
    '"tools/enhancement_review_session_mcp.mjs"',
    '"evavo-work-header-preview-admission-v1"',
    '"tools/work_header_preview_admission_mcp.mjs"',
  ]) assert.ok(config.includes(token), `missing MCP registration token: ${token}`);
});

test("doctor verifies enhancement schema geometry proof binding and stale evidence rejection", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    "contracts/art-studio-enhancement-review-v1.schema.json",
    "evavo.enhancement-art-review.v1",
    '"schema_sha256"',
    "candidateAspectRatioRelativeDrift",
    "ENHANCEMENT_MAXIMUM_ASPECT_RATIO_RELATIVE_DRIFT",
    "admitEnhancementStudioReviewManifest(manifest)",
    "manifestAdmissionBeforeManifestPathReads: true",
    "exactManifestSchemaDigestRequired: true",
    "proofSha256AndLengthBound: true",
    "enhancementReviewSessionReverificationAvailable: true",
    "evavo_verify_enhancement_review_session",
    "staleManifestSourceCandidateOrProofEvidenceRejected: true",
  ]) assert.ok(source.includes(token), `missing enhancement-schema/session doctor token: ${token}`);
});

test("doctor verifies Work preview v4 atomic bundle admission and read-only reverification", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    "evavo.work-header-candidate-preview-capture.v4",
    "evidenceBundle",
    "allScreenshotsAndManifestPublishedTogether",
    "atomicEvidenceBundlePublished",
    "atomicEvidenceBundleVerified: true",
    "atomicPreviewEvidenceBundleRequired: true",
    'acceptedPreviewContract: "evavo.work-header-candidate-preview-capture.v4"',
    "manifestSha256AndLengthBound: true",
    "previewAdmissionReverificationAvailable: true",
    "staleManifestOrScreenshotEvidenceRejected: true",
    "admissionRecomputedDuringReverification: true",
    "evavo_verify_work_header_preview_admission",
  ]) assert.ok(source.includes(token), `missing reverified preview-admission doctor token: ${token}`);
});

test("doctor verifies page review rechecks atomic preview SHA and lengths", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.5.0"',
    "previewAdmissionManifestSha256AndLengthReverified: true",
    "atomicPreviewEvidenceBundleReverifiedBeforePageReview: true",
    "screenshotSha256AndLengthBinding: true",
    "pageRenderProofSha256AndLengthBinding: true",
    "previewAdmissionFullyReverified: true",
  ]) assert.ok(source.includes(token), `missing page-review reverification doctor token: ${token}`);
});

test("doctor verifies profile-aware review and source-bound finishing evidence", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    "profileTransparentRgbMode",
    "strictWholeCanvasTransparentRgbProfiles",
    "rollbackSafeReviewOutputBundle: true",
    "sourceSha256AndLengthBound: true",
    "maskSha256AndLengthBound: true",
    "overlaySha256AndLengthBound: true",
    "exactSourceMaskOverlayBindingRequired: true",
    "staleDefectEvidenceRejected: true",
    "smallestPreservationFirstOperationPreferred: true",
  ]) assert.ok(source.includes(token), `missing resilient finishing token: ${token}`);
});

test("doctor verifies phase-aware upscale evidence and immutable review receipts", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    "horizontalPhaseSeparation",
    "verticalPhaseSeparation",
    "sourceSha256AndLengthBound: true",
    "comparisonSha256AndLengthBound: true",
    "staleEvidenceVerification: true",
  ]) assert.ok(source.includes(token), `missing resilient review token: ${token}`);
});
