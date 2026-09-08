import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("image quality doctor covers self-verifying review through target-aware publication and rollback", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'contract: "evavo.image-quality-pipeline-doctor.v1_35"',
    'SERVER_VERSION = "1.35.0"',
    'id: "alpha-aware-quality"',
    'id: "profile-aware-defects"',
    'id: "defect-regions"',
    'id: "finishing-plan"',
    'id: "artifact-signals"',
    'id: "enhancement-session"',
    'id: "durable-review"',
    'id: "work-preview-core-v8"',
    'id: "work-preview-mcp-v180"',
    'id: "work-page-review-input-safety"',
    'id: "work-page-review-v220"',
    'id: "work-explicit-approval-decision"',
    'id: "work-publication-preparation"',
    'id: "work-publication-transaction-plan"',
    'id: "work-publication-target-aware-recheck"',
    'id: "work-publication-postflight"',
    'id: "work-publication-rollback-authorization"',
    'id: "work-publication-rollback-execution-claim"',
    'id: "work-publication-rollback-execution-result"',
    'id: "work-publication-rollback-postflight"',
    'id: "work-publication-transaction-state"',
    "executionPerformed: false",
    "sourceMutationPerformed: false",
    "publicationAllowed: false",
  ]) assert.ok(source.includes(token), `missing doctor contract token: ${token}`);
});

test("doctor requires canonical durable review evidence and enhancement-side recomputation", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    "evavo.image-review-session.v1_2",
    "evavo.image-review-evidence-integrity.v1",
    "reviewEvidenceSha256",
    "reviewEvidenceRecomputedDuringVerification: true",
    "reviewEvidenceTamperRejected: true",
    'SERVER_VERSION = "1.8.0"',
    "imageReviewEvidenceSha256Required: true",
    "imageReviewEvidenceCanonicalDigestRequired: true",
    "imageReviewEvidenceRecomputedDuringEnhancementVerification: true",
    "imageReviewEvidenceTamperRejected: true",
    "durableReviewCanonicalEvidenceDigestChecked: true",
    "durableReviewDeterministicRecomputationChecked: true",
    "durableReviewTamperRejectionChecked: true",
    "enhancementReviewRequiresRecomputedDurableReviewEvidence: true",
  ]) assert.ok(source.includes(token), `missing self-verifying durable-review token: ${token}`);
});

test("doctor requires deterministic page-review input, evidence and proof reverification", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    "normalizedReviewInputsPersisted: true",
    "normalizedPageReviewInputsPersisted: true",
    "pageReviewEvidenceRecomputedDuringVerification: true",
    "pageReviewProofRecomputedDuringVerification: true",
    "tamperedPageReviewScoresFlagsOrNotesRejected: true",
    "pageReviewEvidenceRecomputedAndMatched: true",
    "pageReviewProofRecomputedAndMatched: true",
    'SERVER_VERSION = "2.2.0"',
    "fullReceiptLineageVerifiedBeforeApprovalPacket: true",
  ]) assert.ok(source.includes(token), `missing deterministic page-review token: ${token}`);
});

test("doctor retains exact trigger-bound Chrome lineage through review", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    "evavo.work-header-candidate-preview-capture.v8",
    "exactTriggeredBrowserRequestBindingVerified",
    "exactTriggeredRequestsBoundAcrossProfiles",
    "browserCandidateRequestBindingRequired",
    'SERVER_VERSION = "1.8.0"',
    "exactTriggeredBrowserRequestBindingRequired: true",
    'exactTriggeredBrowserRequestMethod: "GET"',
    "exactTriggeredBrowserRequestBindingChecked: true",
  ]) assert.ok(source.includes(token), `missing trigger-bound review token: ${token}`);
});

test("doctor requires target-aware postflight and rollback transaction state", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'CONTRACT = "evavo.work-header-publication-postflight.v1"',
    "targetAwareLiveRecheckRequired: true",
    "cloudinaryUsesLiveRemoteRecheck: true",
    'CONTRACT = "evavo.work-header-publication-rollback-authorization.v1"',
    "targetAwarePublicationPostflightRequired: true",
    'CONTRACT = "evavo.work-header-publication-rollback-execution-claim.v1"',
    "targetAwareCurrentPublishedTargetRecheckRequired: true",
    "publicationPostflightTargetAwareLiveRecheckChecked: true",
    "rollbackAuthorizationTargetAwarePostflightRecheckChecked: true",
    "rollbackSingleUseClaimTargetAwareRecheckChecked: true",
    "publicationTransactionStateTargetAwarePublishedRecheckChecked: true",
    "publishedStateRemainsRollbackReadyNotTerminal: true",
    "rolledBackStateIsTerminalClosed: true",
    "rollbackMutationAuthorityAbsent: true",
  ]) assert.ok(source.includes(token), `missing target-aware lifecycle token: ${token}`);
});

test("MCP configuration exposes complete evidence chain but no mutation executor", async () => {
  const config = await read("../.mcp.json");
  for (const token of [
    '"evavo-image-quality-pipeline-doctor-v1"',
    '"evavo-image-review-session-v1"',
    '"evavo-work-header-publication-postflight-v1"',
    '"evavo-work-header-publication-rollback-authorization-v1"',
    '"evavo-work-header-publication-rollback-execution-claim-v1"',
    '"evavo-work-header-publication-rollback-execution-result-v1"',
    '"evavo-work-header-publication-rollback-postflight-v1"',
    '"evavo-work-header-publication-transaction-state-v1"',
  ]) assert.ok(config.includes(token), `missing MCP registration token: ${token}`);
  assert.ok(!config.includes('"evavo-work-header-publication-executor-v1"'));
  assert.ok(!config.includes('"evavo-work-header-publication-rollback-executor-v1"'));
});
