import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("publication postflight is evidence-only and preserves rollback readiness", async () => {
  const source = await read("./work_header_publication_postflight_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.0.0"',
    'CONTRACT = "evavo.work-header-publication-postflight.v1"',
    'SCHEMA_SHA256 = "5a1a2a9a329d3ce4eecd81981e3aa35cd2d6d2d3487f78b6b56672bacca99ae8"',
    "executionResultReverificationRequired: true",
    "rollbackReadinessReverificationRequired: true",
    "currentLiveTargetMustExactlyMatchReviewedCandidate: true",
    "rollbackBackupMustRemainReady: true",
    "deterministicCreateOnlyReceipt: true",
    "postflightEvidenceOnly: true",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
  ]) assert.ok(source.includes(token), `missing postflight token: ${token}`);
});

test("rollback authorization requires explicit confirmation plus verified postflight", async () => {
  const source = await read("./work_header_publication_rollback_authorization_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.1.0"',
    'CONTRACT = "evavo.work-header-publication-rollback-authorization.v1"',
    'SCHEMA_SHA256 = "3f23166dc2901ba09f222682b2d6e2be4ab84e4d0ad4d469ae9c041e3bac211b"',
    'POSTFLIGHT_CONTRACT = "evavo.work-header-publication-postflight.v1"',
    "confirmRollbackAuthorization",
    "explicitRollbackConfirmationRequired: true",
    "publicationPostflightReverificationRequired: true",
    "postflightLiveTargetMustMatchCandidate: true",
    "postflightRollbackBackupMustRemainReady: true",
    "singleRollbackTransactionAuthorizationOnly: true",
    "authorizationExpiresOnAnyEvidenceDrift: true",
    "rollbackExecutionAllowed: false",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
  ]) assert.ok(source.includes(token), `missing rollback-authorization token: ${token}`);
});

test("rollback claim is deterministic, single-use and evidence-drift sensitive", async () => {
  const source = await read("./work_header_publication_rollback_execution_claim_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.1.0"',
    'CONTRACT = "evavo.work-header-publication-rollback-execution-claim.v1"',
    'SCHEMA_SHA256 = "2abc5c031803e2d29c40fe80dcc118ca4ee984e3f0a9a1fe7da17455acbf4e78"',
    "confirmSingleUseRollbackClaim=true is required",
    "deterministicClaimPath",
    "singleUseRollbackClaimEstablished",
    "claimInvalidOnAnyEvidenceDrift",
    "currentPublishedTargetRecheckedAtClaim",
    "rollbackBackupReverifiedAtClaim",
    "rollbackAuthorizationReverifiedAtClaim",
    "rollbackExecutionAllowed: false",
    "publicationAllowed: false",
  ]) assert.ok(source.includes(token), `missing rollback-claim token: ${token}`);
});

test("rollback result remains evidence-only and tied to postflight-authorized lineage", async () => {
  const source = await read("./work_header_publication_rollback_execution_result_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.1.0"',
    'CONTRACT = "evavo.work-header-publication-rollback-execution-result.v1"',
    'SCHEMA_SHA256 = "2c963f8ba6adb05deb871e62c0803d78c55f68da551127c01b07c82df2480352"',
    'CLAIM_CONTRACT = "evavo.work-header-publication-rollback-execution-claim.v1"',
    'AUTHORIZATION_CONTRACT = "evavo.work-header-publication-rollback-authorization.v1"',
    "publicationPostflightReceiptPath",
    "rollback-authorized-unexecuted",
    "rollback-claimed-unexecuted",
    "rollback backup no longer exactly matches the previous-target snapshot bytes",
    "rollbackExecutionAllowed: false",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
  ]) assert.ok(source.includes(token), `missing rollback-result token: ${token}`);
});

test("MCP exposes rollback evidence chain without a mutation executor", async () => {
  const config = await read("../.mcp.json");
  for (const token of [
    '"evavo-work-header-publication-rollback-readiness-v1"',
    '"evavo-work-header-publication-rollback-authorization-v1"',
    '"evavo-work-header-publication-rollback-execution-claim-v1"',
    '"evavo-work-header-publication-rollback-execution-result-v1"',
  ]) assert.ok(config.includes(token), `missing rollback MCP registration: ${token}`);
  assert.ok(!config.includes('"evavo-work-header-publication-rollback-executor-v1"'));
});
