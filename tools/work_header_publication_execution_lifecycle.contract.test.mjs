import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root));
const readText = async (relative) => (await read(relative)).toString("utf8");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function policy() {
  return JSON.parse(await readText("contracts/work-header-publication-execution-lifecycle-policy-v1.json"));
}

function stages(value) {
  return [
    ["transactionPlan", value.transactionPlan],
    ["forward.authorization", value.forwardExecution.authorization],
    ["forward.claim", value.forwardExecution.claim],
    ["forward.result", value.forwardExecution.result],
    ["rollback.readiness", value.rollback.readiness],
    ["rollback.authorization", value.rollback.authorization],
    ["rollback.claim", value.rollback.claim],
    ["rollback.result", value.rollback.result],
  ];
}

test("execution lifecycle policy remains fail-closed and non-mutating", async () => {
  const value = await policy();
  assert.equal(value.contract, "evavo.work-header-publication-execution-lifecycle-policy.v1");
  assert.equal(value.schemaVersion, "1.0");
  for (const key of [
    "exactCandidateBytesRequired",
    "fullReceiptLineageRequired",
    "currentTargetRecheckRequiredBeforeClaim",
    "rollbackEvidenceRequiredBeforeForwardExecution",
    "automaticExecutionForbidden",
    "automaticRollbackForbidden",
    "reviewToolDirectMutationForbidden",
  ]) assert.equal(value.globalSafety[key], true, `expected global safety ${key}=true`);
  for (const key of ["executionAllowed", "rollbackExecutionAllowed", "publicationAllowed", "cloudOverwriteAllowed", "websiteMutationAllowed"]) {
    assert.equal(value.globalSafety[key], false, `expected global authority ${key}=false`);
  }
});

test("every lifecycle stage is bound to the exact local fail-closed schema bytes", async () => {
  const value = await policy();
  for (const [label, stage] of stages(value)) {
    const bytes = await read(stage.schemaPath);
    assert.equal(sha256(bytes), stage.schemaSha256, `${label} schema SHA-256 drifted`);
    const schema = JSON.parse(bytes.toString("utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema", `${label} schema draft drifted`);
    assert.equal(schema.additionalProperties, false, `${label} schema must fail closed`);
    assert.equal(schema.properties.contract.const, stage.contract, `${label} contract constant drifted`);
    for (const authority of ["publicationAllowed", "cloudOverwriteAllowed", "websiteMutationAllowed"]) {
      assert.equal(schema.properties[authority]?.const, false, `${label} grants forbidden ${authority}`);
    }
    if (schema.properties.executionAllowed) assert.equal(schema.properties.executionAllowed.const, false, `${label} grants executionAllowed`);
    if (schema.properties.rollbackExecutionAllowed) assert.equal(schema.properties.rollbackExecutionAllowed.const, false, `${label} grants rollbackExecutionAllowed`);
  }
});

test("forward execution remains explicit, single-use, evidence-only and externally executed", async () => {
  const value = await policy();
  assert.equal(value.forwardExecution.authorization.explicitConfirmationRequired, true);
  assert.equal(value.forwardExecution.authorization.singleTransactionOnly, true);
  assert.equal(value.forwardExecution.authorization.expiresOnEvidenceDrift, true);
  assert.equal(value.forwardExecution.claim.deterministicCreateOnlyPathRequired, true);
  assert.equal(value.forwardExecution.claim.singleUseClaimRequired, true);
  assert.equal(value.forwardExecution.claim.secondClaimRejected, true);
  assert.equal(value.forwardExecution.claim.expiresOnEvidenceDrift, true);
  assert.equal(value.forwardExecution.result.observedExternalExecutionOnly, true);
  assert.equal(value.forwardExecution.result.postExecutionTargetMustExactlyMatchCandidate, true);
  assert.equal(value.forwardExecution.result.postExecutionTargetMustDifferFromPreviousTarget, true);
  assert.equal(value.forwardExecution.result.rollbackBackupMustRemainPreserved, true);
  assert.equal(value.forwardExecution.result.resultIsEvidenceOnly, true);
});

test("rollback remains explicit, single-use and exact previous-target restoration evidence", async () => {
  const value = await policy();
  assert.equal(value.rollback.readiness.currentPublishedTargetMustStillMatchCandidate, true);
  assert.equal(value.rollback.readiness.rollbackBackupMustExactlyMatchPreviousTarget, true);
  assert.equal(value.rollback.readiness.separateRollbackBackupRequired, true);
  assert.equal(value.rollback.authorization.explicitConfirmationRequired, true);
  assert.equal(value.rollback.authorization.singleTransactionOnly, true);
  assert.equal(value.rollback.authorization.expiresOnEvidenceDrift, true);
  assert.equal(value.rollback.claim.deterministicCreateOnlyPathRequired, true);
  assert.equal(value.rollback.claim.singleUseClaimRequired, true);
  assert.equal(value.rollback.claim.secondClaimRejected, true);
  assert.equal(value.rollback.result.observedExternalRollbackOnly, true);
  assert.equal(value.rollback.result.postRollbackTargetMustExactlyMatchPreviousTarget, true);
  assert.equal(value.rollback.result.postRollbackTargetMustDifferFromCandidate, true);
  assert.equal(value.rollback.result.resultIsEvidenceOnly, true);
});

test("MCP registry exposes every governed lifecycle evidence tool", async () => {
  const config = await readText(".mcp.json");
  for (const token of [
    '"evavo-work-header-publication-transaction-plan-v1"',
    '"evavo-work-header-publication-execution-authorization-v1"',
    '"evavo-work-header-publication-execution-claim-v1"',
    '"evavo-work-header-publication-execution-result-v1"',
    '"evavo-work-header-publication-rollback-readiness-v1"',
    '"evavo-work-header-publication-rollback-authorization-v1"',
    '"evavo-work-header-publication-rollback-execution-claim-v1"',
    '"evavo-work-header-publication-rollback-execution-result-v1"',
  ]) assert.ok(config.includes(token), `missing lifecycle MCP registration: ${token}`);
});

test("forward and rollback result tools remain attestation-only with no mutation authority", async () => {
  const forward = await readText("tools/work_header_publication_execution_result_mcp.mjs");
  const rollback = await readText("tools/work_header_publication_rollback_execution_result_mcp.mjs");
  for (const [label, source, tokens] of [
    ["forward", forward, ["confirmObservedExternalExecution", "observedExternalExecutionOnly: true", "resultIsEvidenceOnly: true", "executionAllowed: false", "publicationAllowed: false", "cloudOverwriteAllowed: false", "websiteMutationAllowed: false"]],
    ["rollback", rollback, ["confirmObservedExternalRollback", "observedExternalRollbackOnly: true", "resultIsEvidenceOnly: true", "rollbackExecutionAllowed: false", "publicationAllowed: false", "cloudOverwriteAllowed: false", "websiteMutationAllowed: false"]],
  ]) for (const token of tokens) assert.ok(source.includes(token), `${label} result tool lost safety token: ${token}`);
});
