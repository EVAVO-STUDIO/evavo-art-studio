import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url));
const text = async (name) => (await read(name)).toString("utf8");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const CLAIM_SCHEMA_SHA256 = "2abc5c031803e2d29c40fe80dcc118ca4ee984e3f0a9a1fe7da17455acbf4e78";
const RESULT_SCHEMA_SHA256 = "2c963f8ba6adb05deb871e62c0803d78c55f68da551127c01b07c82df2480352";

test("rollback execution schemas are exact, fail-closed and non-mutating", async () => {
  const claimBytes = await read("../contracts/work-header-publication-rollback-execution-claim-v1.schema.json");
  const resultBytes = await read("../contracts/work-header-publication-rollback-execution-result-v1.schema.json");
  assert.equal(sha256(claimBytes), CLAIM_SCHEMA_SHA256);
  assert.equal(sha256(resultBytes), RESULT_SCHEMA_SHA256);
  const claim = JSON.parse(claimBytes.toString("utf8"));
  const result = JSON.parse(resultBytes.toString("utf8"));
  assert.equal(claim.$id, "evavo.work-header-publication-rollback-execution-claim.v1");
  assert.equal(claim.additionalProperties, false);
  assert.equal(claim.properties.claimState.const, "rollback-claimed-unexecuted");
  assert.equal(claim.properties.singleUseRollbackClaimEstablished.const, true);
  assert.equal(claim.properties.claimInvalidOnAnyEvidenceDrift.const, true);
  assert.equal(result.$id, "evavo.work-header-publication-rollback-execution-result.v1");
  assert.equal(result.additionalProperties, false);
  assert.equal(result.properties.resultState.const, "rollback-executed-verified");
  assert.equal(result.properties.observedExternalRollbackOnly.const, true);
  assert.equal(result.properties.postRollbackTargetMatchesPreviousTarget.const, true);
  assert.equal(result.properties.postRollbackTargetDiffersFromCandidate.const, true);
  for (const schema of [claim, result]) {
    for (const field of ["rollbackExecutionAllowed", "publicationAllowed", "cloudOverwriteAllowed", "websiteMutationAllowed"]) assert.equal(schema.properties[field].const, false, `${field} must remain false`);
  }
});

test("rollback execution claim is deterministic, single-use and re-verifies authorization/readiness/target/backup", async () => {
  const source = await text("./work_header_publication_rollback_execution_claim_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.0.0"',
    'evavo.work-header-publication-rollback-execution-claim.v1',
    CLAIM_SCHEMA_SHA256,
    'deterministicClaimPath',
    '.rollback-execution-claim.json',
    'confirmSingleUseRollbackClaim=true is required',
    'rollbackAuthorizationReverifiedAtClaim: true',
    'currentPublishedTargetRecheckedAtClaim: true',
    'rollbackBackupReverifiedAtClaim: true',
    'singleUseRollbackClaimEstablished: true',
    'claimInvalidOnAnyEvidenceDrift: true',
    'writeCreateOnlyBundle',
    'rollbackExecutionAllowed: false',
    'publicationAllowed: false',
    'cloudOverwriteAllowed: false',
    'websiteMutationAllowed: false',
  ]) assert.ok(source.includes(token), `missing rollback claim token: ${token}`);
});

test("rollback result only attests an already external rollback and proves exact previous-target restoration", async () => {
  const source = await text("./work_header_publication_rollback_execution_result_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.0.0"',
    'evavo.work-header-publication-rollback-execution-result.v1',
    RESULT_SCHEMA_SHA256,
    'confirmObservedExternalRollback=true is required',
    'Post-rollback target does not exactly match the previous-target backup bytes.',
    'Post-rollback target still matches the published candidate; rollback was not observed.',
    'postRollbackTargetMatchesPreviousTarget: true',
    'postRollbackTargetDiffersFromCandidate: true',
    'observedExternalRollbackOnly: true',
    'secondResultForSameClaimRejected: true',
    'resultIsEvidenceOnly: true',
    'writeCreateOnlyBundle',
    'rollbackExecutionAllowed: false',
    'publicationAllowed: false',
    'cloudOverwriteAllowed: false',
    'websiteMutationAllowed: false',
  ]) assert.ok(source.includes(token), `missing rollback result token: ${token}`);
});
