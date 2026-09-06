import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("image quality doctor covers fail-closed review through explicit execution authorization", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'contract: "evavo.image-quality-pipeline-doctor.v1_23"',
    'SERVER_VERSION = "1.23.0"',
    'id: "alpha-aware-quality"',
    'id: "profile-aware-defects"',
    'id: "defect-regions"',
    'id: "finishing-plan"',
    'id: "artifact-signals"',
    'id: "enhancement-session"',
    'id: "work-preview-core-v8"',
    'id: "work-preview-mcp-v180"',
    'id: "work-page-review-input-safety"',
    'id: "work-page-review-v210"',
    'id: "work-explicit-approval-decision"',
    'id: "work-publication-preparation"',
    'id: "work-publication-transaction-plan"',
    'id: "work-publication-transaction-schema"',
    'id: "work-publication-execution-authorization"',
    'id: "work-publication-execution-authorization-schema"',
    'id: "durable-review"',
    'id: "safe-bundle"',
    'id: "mcp-registration"',
    "runtimeExecutionPerformed: false",
    "sourceMutationPerformed: false",
  ]) assert.ok(source.includes(token), `missing doctor contract token: ${token}`);
});

test("doctor requires exact triggered Chrome candidate GET request lineage", async () => {
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
  ]) assert.ok(source.includes(token), `missing exact-trigger browser lineage token: ${token}`);
});

test("doctor requires exact trigger-bound browser lineage through page review and approval", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "2.1.0"',
    "exactTriggeredBrowserRequestBindingRequiredFromAdmission: true",
    "exactTriggeredBrowserRequestBindingPersistedInPageReceipt: true",
    "exactTriggeredBrowserRequestBindingReverifiedBeforeApprovalPacket: true",
    "exactTriggeredBrowserRequestCarriedThroughPageReviewChecked: true",
    "exactTriggeredBrowserRequestCarriedThroughApprovalChecked: true",
  ]) assert.ok(source.includes(token), `missing page/approval trigger-bound lineage token: ${token}`);
});

test("doctor requires bounded literal Work page review inputs", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    "MAX_SCREENSHOT_BYTES", "MAX_NOTES = 24", "MAX_NOTE_CHARACTERS = 500", "MAX_NOTES_CHARACTERS = 4_000",
    "pageSlug must be a canonical Work detail route under /work/.", "must be boolean.", "notes exceed the", "pageReviewInputSafetyChecked: true",
  ]) assert.ok(source.includes(token), `missing page-input safety token: ${token}`);
});

test("doctor requires read-only approval packet verification and recomputation", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "2.1.0"', "selectionReceiptShaAndLengthBound: true", "candidateReviewReceiptShaAndLengthBound: true",
    "previewAdmissionReceiptShaAndLengthBound: true", "previewManifestShaAndLengthBound: true", "pageSourceBindingsShaAndLengthReverified: true",
    "fullReceiptLineageVerifiedBeforeApprovalPacket: true", "approvalPacketReverificationAvailable: true", "approvalPacketCoreRecomputedDuringVerification: true",
    "staleApprovalPacketLineageRejected: true", "evavo_verify_work_header_approval_packet", "approvalPacketRecomputedAndMatched: true",
    "approvalPacketReverificationChecked: true",
  ]) assert.ok(source.includes(token), `missing approval verification token: ${token}`);
});

test("doctor requires a non-automatic explicit reviewer decision receipt", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'CONTRACT = "evavo.work-header-approval-decision.v1"', "explicitReviewerDecisionRequired: true", "automaticDecisionAllowed: false",
    "approvalPacketReverificationRequired: true", "fullReceiptLineageRequired: true", "evidenceIdentityDigestRequired: true",
    "approvedDecisionAllowsPublicationPreparationOnly: true", "evavo_record_work_header_approval_decision", "evavo_verify_work_header_approval_decision",
    "explicitReviewerDecisionBoundaryChecked: true",
  ]) assert.ok(source.includes(token), `missing explicit-decision doctor token: ${token}`);
});

test("doctor requires rollback-backed non-executing publication planning", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'CONTRACT = "evavo.work-header-publication-preparation.v1"', "backupRequiredBeforeExecution: true", "rollbackEvidenceRequiredBeforeExecution: true",
    'CONTRACT = "evavo.work-header-publication-transaction-plan.v1"', "currentTargetSnapshotRequired: true", "separateRollbackBackupRequired: true",
    "exactRollbackByteMatchRequired: true", "explicitExecutionConfirmationRequired: true", "publicationTransactionPlanBoundaryChecked: true",
  ]) assert.ok(source.includes(token), `missing publication planning doctor token: ${token}`);
});

test("doctor requires a second explicit single-transaction execution authorization without mutation authority", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'CONTRACT = "evavo.work-header-publication-execution-authorization.v1"',
    'SCHEMA_SHA256 = "f56a746773e4e08db8e2d22c5bcc0fa50f8416bbfedbc6f8c18c26326ea3dff4"',
    "confirmExecutionAuthorization=true is required", "currentTargetRecheckRequired: true", "rollbackBackupReverificationRequired: true",
    "singleTransactionAuthorizationOnly: true", "authorizationExpiresOnAnyEvidenceDrift: true",
    "evavo_authorize_work_header_publication_execution", "evavo_verify_work_header_publication_execution_authorization",
    "publicationExecutionAuthorizationBoundaryChecked: true", "secondExplicitExecutionConfirmationChecked: true", "currentTargetRecheckChecked: true",
    "executionAllowed: false", "publicationAllowed: false", "cloudOverwriteAllowed: false", "websiteMutationAllowed: false",
  ]) assert.ok(source.includes(token), `missing execution-authorization doctor token: ${token}`);
});

test("MCP configuration exposes hardened image-review chain without a publication executor", async () => {
  const config = await read("../.mcp.json");
  for (const token of [
    '"evavo-image-quality-pipeline-doctor-v1"', '"evavo-image-review-session-v1"', '"evavo-enhancement-review-session-v1"',
    '"evavo-work-header-preview-admission-v1"', '"evavo-work-header-page-render-review-v1"', '"evavo-work-header-approval-decision-v1"',
    '"evavo-work-header-publication-preparation-v1"', '"evavo-work-header-publication-transaction-plan-v1"',
    '"evavo-work-header-publication-execution-authorization-v1"',
  ]) assert.ok(config.includes(token), `missing MCP registration token: ${token}`);
  assert.ok(!config.includes('"evavo-work-header-publication-executor-v1"'));
});
