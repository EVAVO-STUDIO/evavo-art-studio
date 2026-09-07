import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("image quality doctor covers review through target-aware publication and postflight-gated rollback result", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'contract: "evavo.image-quality-pipeline-doctor.v1_29"',
    'SERVER_VERSION = "1.29.0"',
    'id: "alpha-aware-quality"',
    'id: "profile-aware-defects"',
    'id: "defect-regions"',
    'id: "finishing-plan"',
    'id: "artifact-signals"',
    'id: "enhancement-session"',
    'id: "work-preview-core-v8"',
    'id: "work-preview-mcp-v180"',
    'id: "work-page-review-input-safety"',
    'id: "work-page-review-v220"',
    'id: "work-explicit-approval-decision"',
    'id: "work-publication-preparation"',
    'id: "work-publication-transaction-plan"',
    'id: "work-publication-target-aware-recheck"',
    'id: "work-publication-execution-authorization"',
    'id: "work-publication-execution-claim"',
    'id: "work-publication-execution-result"',
    'id: "work-publication-rollback-readiness"',
    'id: "work-publication-postflight"',
    'id: "work-publication-rollback-authorization"',
    'id: "work-publication-rollback-execution-claim"',
    'id: "work-publication-rollback-execution-result"',
    'id: "mcp-registration"',
    "executionPerformed: false",
    "sourceMutationPerformed: false",
    "publicationAllowed: false",
  ]) assert.ok(source.includes(token), `missing doctor contract token: ${token}`);
});

test("doctor requires deterministic page-review input, evidence and proof reverification", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    "normalizedReviewInputsPersisted: true",
    "normalizedPageReviewInputsPersisted: true",
    "pageReviewEvidenceRecomputedDuringVerification: true",
    "pageReviewProofRecomputedDuringVerification: true",
    "tamperedPageReviewScoresFlagsOrNotesRejected: true",
    "Page-render evidence changed after review or no longer recomputes from persisted normalized review inputs.",
    "Page-render proof no longer recomputes from exact screenshots and normalized review inputs.",
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

test("doctor requires live target-aware authorization and claim for Cloudinary stable IDs", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'tools/lib/publication_target_recheck.mjs',
    'CLOUDINARY_HOST = "res.cloudinary.com"',
    'CLOUDINARY_CLOUD = "dntogqtey"',
    "unversioned stable delivery URL",
    'SERVER_VERSION = "1.1.0"',
    "targetAwareCurrentTargetRecheck: true",
    "cloudinaryUsesLiveRemoteRecheck: true",
    "cloudinaryUnversionedStableDeliveryUrlRequired: true",
    "cloudinaryCallerLocalRecheckRejected: true",
    "publicationTargetAwareRecheckChecked: true",
    "cloudinaryLiveStableTargetRecheckChecked: true",
  ]) assert.ok(source.includes(token), `missing target-aware publication token: ${token}`);
});

test("doctor requires explicit approval, rollback planning, authorization and single-use publication claim", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'CONTRACT = "evavo.work-header-approval-decision.v1"',
    "automaticDecisionAllowed: false",
    'CONTRACT = "evavo.work-header-publication-preparation.v1"',
    "backupRequiredBeforeExecution: true",
    'CONTRACT = "evavo.work-header-publication-transaction-plan.v1"',
    "exactRollbackByteMatchRequired: true",
    'CONTRACT = "evavo.work-header-publication-execution-authorization.v1"',
    "singleTransactionAuthorizationOnly: true",
    'CONTRACT = "evavo.work-header-publication-execution-claim.v1"',
    "createOnlySingleUseClaim: true",
    "secondClaimForSameAuthorizationRejected: true",
  ]) assert.ok(source.includes(token), `missing publication safety token: ${token}`);
});

test("doctor requires postflight before rollback authorization and single-use rollback evidence", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'CONTRACT = "evavo.work-header-publication-postflight.v1"',
    'SCHEMA_SHA256 = "5a1a2a9a329d3ce4eecd81981e3aa35cd2d6d2d3487f78b6b56672bacca99ae8"',
    "currentLiveTargetMustExactlyMatchReviewedCandidate: true",
    "rollbackBackupMustRemainReady: true",
    "postflightEvidenceOnly: true",
    'CONTRACT = "evavo.work-header-publication-rollback-authorization.v1"',
    'SCHEMA_SHA256 = "3f23166dc2901ba09f222682b2d6e2be4ab84e4d0ad4d469ae9c041e3bac211b"',
    "explicitRollbackConfirmationRequired: true",
    "publicationPostflightReverificationRequired: true",
    "singleRollbackTransactionAuthorizationOnly: true",
    "authorizationExpiresOnAnyEvidenceDrift: true",
    'CONTRACT = "evavo.work-header-publication-rollback-execution-claim.v1"',
    'SCHEMA_SHA256 = "2abc5c031803e2d29c40fe80dcc118ca4ee984e3f0a9a1fe7da17455acbf4e78"',
    "confirmSingleUseRollbackClaim=true is required",
    "claimInvalidOnAnyEvidenceDrift",
    'CONTRACT = "evavo.work-header-publication-rollback-execution-result.v1"',
    'SCHEMA_SHA256 = "2c963f8ba6adb05deb871e62c0803d78c55f68da551127c01b07c82df2480352"',
    "publicationPostflightReceiptPath",
    "rollback-claimed-unexecuted",
    "rollbackExecutionAllowed: false",
    "rollbackAuthorizationPostflightGateChecked: true",
    "rollbackSingleUseClaimBoundaryChecked: true",
    "rollbackExecutionResultEvidenceBoundaryChecked: true",
    "rollbackMutationAuthorityAbsent: true",
  ]) assert.ok(source.includes(token), `missing postflight/rollback doctor token: ${token}`);
});

test("MCP configuration exposes complete evidence chain but no mutation executor", async () => {
  const config = await read("../.mcp.json");
  for (const token of [
    '"evavo-image-quality-pipeline-doctor-v1"',
    '"evavo-work-header-publication-execution-authorization-v1"',
    '"evavo-work-header-publication-execution-claim-v1"',
    '"evavo-work-header-publication-execution-result-v1"',
    '"evavo-work-header-publication-rollback-readiness-v1"',
    '"evavo-work-header-publication-rollback-authorization-v1"',
    '"evavo-work-header-publication-rollback-execution-claim-v1"',
    '"evavo-work-header-publication-rollback-execution-result-v1"',
  ]) assert.ok(config.includes(token), `missing MCP registration token: ${token}`);
  assert.ok(!config.includes('"evavo-work-header-publication-executor-v1"'));
  assert.ok(!config.includes('"evavo-work-header-publication-rollback-executor-v1"'));
});
