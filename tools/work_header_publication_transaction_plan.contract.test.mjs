import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("publication transaction planner requires exact backup and remains non-executing", async () => {
  const source = await read("./work_header_publication_transaction_plan_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.0.0"',
    'CONTRACT = "evavo.work-header-publication-transaction-plan.v1"',
    'SCHEMA_SHA256 = "f9e11403cabe947e50f0681300527fc164d551e2a8c4615f16bd723e2550d73f"',
    "explicitApprovedPreparationRequired: true",
    "preparationReverificationRequired: true",
    "exactCandidateBytesRequired: true",
    "currentTargetSnapshotRequired: true",
    "separateRollbackBackupRequired: true",
    "exactRollbackByteMatchRequired: true",
    "explicitExecutionConfirmationRequired: true",
    "backupCapturedBeforeExecution: true",
    "rollbackEvidenceVerifiedBeforeExecution: true",
    "evavo_plan_work_header_publication_transaction",
    "evavo_verify_work_header_publication_transaction_plan",
    "executionAllowed: false",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
  ]) assert.ok(source.includes(token), `missing publication transaction token: ${token}`);
});

test("publication transaction schema remains fail-closed and non-authorizing", async () => {
  const source = await read("../contracts/work-header-publication-transaction-plan-v1.schema.json");
  const schema = JSON.parse(source);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.contract.const, "evavo.work-header-publication-transaction-plan.v1");
  assert.equal(schema.properties.transactionState.const, "planned-unexecuted");
  assert.equal(schema.properties.executionAllowed.const, false);
  assert.equal(schema.properties.publicationAllowed.const, false);
  assert.equal(schema.properties.cloudOverwriteAllowed.const, false);
  assert.equal(schema.properties.websiteMutationAllowed.const, false);
  assert.equal(schema.properties.explicitExecutionConfirmationRequired.const, true);
  assert.equal(schema.properties.backupCapturedBeforeExecution.const, true);
  assert.equal(schema.properties.rollbackEvidenceVerifiedBeforeExecution.const, true);
});

test("MCP configuration registers publication transaction planner", async () => {
  const config = await read("../.mcp.json");
  assert.ok(config.includes('"evavo-work-header-publication-transaction-plan-v1"'));
  assert.ok(config.includes('"tools/work_header_publication_transaction_plan_mcp.mjs"'));
});
