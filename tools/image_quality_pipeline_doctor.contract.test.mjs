import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("image quality doctor covers exact-byte Work preview/page review lineage", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'contract: "evavo.image-quality-pipeline-doctor.v1_10"',
    'SERVER_VERSION = "1.10.0"',
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
    'id: "work-page-review-exact-preview-bytes"',
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

test("MCP configuration exposes hardened image-review chain", async () => {
  const config = await read("../.mcp.json");
  for (const token of [
    '"evavo-image-quality-pipeline-doctor-v1"',
    '"tools/image_quality_pipeline_doctor_mcp.mjs"',
    '"evavo-image-review-session-v1"',
    '"evavo-existing-image-finishing-plan-v1"',
    '"evavo-enhancement-review-session-v1"',
    '"evavo-work-header-preview-admission-v1"',
    '"tools/work_header_preview_admission_mcp.mjs"',
  ]) assert.ok(config.includes(token), `missing MCP registration token: ${token}`);
});

test("doctor verifies exact candidate response-byte admission and page matching", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    "evavo.work-header-candidate-preview-capture.v5",
    "contentSha256",
    "contentByteLength",
    "contentStableAcrossCapture",
    "candidateContentBytesVerified: true",
    'SERVER_VERSION = "1.4.0"',
    "exactCandidateResponseBytesRequired: true",
    "candidateContentSha256AndLengthBound: true",
    "candidateContentRefetchedDuringAdmission: true",
    "candidateContentRefetchedDuringReverification: true",
    "staleManifestScreenshotOrCandidateEvidenceRejected: true",
    'SERVER_VERSION = "1.6.0"',
    "exactPreviewedCandidateResponseSha256AndLengthRequired: true",
    "selectedLocalCandidateMustMatchPreviewedResponseBytes: true",
    "previewCandidateResponseRefetchedBeforePageReview: true",
    "exactPreviewedCandidateBytesMatchedSelectedCandidate: true",
  ]) assert.ok(source.includes(token), `missing exact-byte lineage doctor token: ${token}`);
});

test("doctor keeps enhancement schema and stale-evidence boundaries", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    "contracts/art-studio-enhancement-review-v1.schema.json",
    "evavo.enhancement-art-review.v1",
    "candidateAspectRatioRelativeDrift",
    "ENHANCEMENT_MAXIMUM_ASPECT_RATIO_RELATIVE_DRIFT",
    "manifestAdmissionBeforeManifestPathReads: true",
    "proofSha256AndLengthBound: true",
    "evavo_verify_enhancement_review_session",
    "staleManifestSourceCandidateOrProofEvidenceRejected: true",
  ]) assert.ok(source.includes(token), `missing enhancement doctor token: ${token}`);
});
