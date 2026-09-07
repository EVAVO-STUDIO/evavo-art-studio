import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("image quality doctor covers review through rollback readiness", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'contract: "evavo.image-quality-pipeline-doctor.v1_26"',
    'SERVER_VERSION = "1.26.0"',
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
    'id: "work-publication-execution-authorization"',
    'id: "work-publication-execution-claim"',
    'id: "work-publication-execution-result"',
    'id: "work-publication-execution-result-schema"',
    'id: "work-publication-rollback-readiness"',
    'id: "work-publication-rollback-readiness-schema"',
    'id: "mcp-registration"',
    "executionPerformed: false",
    "sourceMutationPerformed: false",
    "publicationAllowed: false",
  ]) assert.ok(source.includes(token), `missing doctor contract token: ${token}`);
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
    'SERVER_VERSION = "2.1.0"',
    "fullReceiptLineageVerifiedBeforeApprovalPacket: true",
  ]) assert.ok(source.includes(token), `missing trigger-bound review token: ${token}`);
});

test("doctor requires explicit approval, rollback planning, authorization and single-use claim", async () => {
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

test("doctor requires evidence-only execution result and non-executing rollback readiness", async () => {
  const source = await read("./image_quality_pipeline_doctor_mcp.mjs");
  for (const token of [
    'CONTRACT = "evavo.work-header-publication-execution-result.v1"',
    'SCHEMA_SHA256 = "6d94ca926dea8c5c0fdc025c3d65a8692ae5c8c6e61db2d37a536ae352d52445"',
    "observedExternalExecutionOnly: true",
    "deterministicCreateOnlyResultPath: true",
    "postExecutionTargetMustExactlyMatchCandidate: true",
    "rollbackBackupMustRemainPreserved: true",
    "resultIsEvidenceOnly: true",
    'CONTRACT = "evavo.work-header-publication-rollback-readiness.v1"',
    'SCHEMA_SHA256 = "cc56d28b46f98cea1f97b46aa9988522c6b97424ee853a7c6c968a45ffd77f6d"',
    "currentPublishedTargetMustStillMatchCandidate: true",
    "rollbackBackupMustExactlyMatchPreviousTarget: true",
    "separateRollbackBackupRequired: true",
    "deterministicCreateOnlyReceipt: true",
    "rollbackPreparationOnly: true",
    "rollbackExecutionAllowed: false",
    "publicationRollbackReadinessBoundaryChecked: true",
    "rollbackReadinessCurrentPublishedTargetMatchChecked: true",
    "rollbackReadinessPreviousTargetBackupMatchChecked: true",
    "rollbackExecutionAuthorityAbsent: true",
  ]) assert.ok(source.includes(token), `missing execution/rollback doctor token: ${token}`);
});

test("MCP configuration exposes attestation and rollback readiness but no mutation executor", async () => {
  const config = await read("../.mcp.json");
  for (const token of [
    '"evavo-image-quality-pipeline-doctor-v1"',
    '"evavo-work-header-publication-execution-authorization-v1"',
    '"evavo-work-header-publication-execution-claim-v1"',
    '"evavo-work-header-publication-execution-result-v1"',
    '"tools/work_header_publication_execution_result_mcp.mjs"',
    '"evavo-work-header-publication-rollback-readiness-v1"',
    '"tools/work_header_publication_rollback_readiness_mcp.mjs"',
  ]) assert.ok(config.includes(token), `missing MCP registration token: ${token}`);
  assert.ok(!config.includes('"evavo-work-header-publication-executor-v1"'));
  assert.ok(!config.includes('"evavo-work-header-publication-rollback-executor-v1"'));
});
