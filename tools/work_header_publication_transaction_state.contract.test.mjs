import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const SCHEMA_SHA256 = "0c88d1977075832287f9acf73500e7211687a594b0b0650f4dcadf367024583c";

test("transaction-state schema remains exact and fail closed", async () => {
  const bytes = await read("../contracts/work-header-publication-transaction-state-v1.schema.json");
  assert.equal(sha256(bytes), SCHEMA_SHA256);
  const source = bytes.toString("utf8");
  for (const token of [
    '"$id": "evavo.work-header-publication-transaction-state.v1"',
    '"additionalProperties": false',
    '"published-verified-rollback-ready"',
    '"rolled-back-verified-closed"',
    '"transactionStateEvidenceOnly": { "const": true }',
    '"executionAllowed": { "const": false }',
    '"rollbackExecutionAllowed": { "const": false }',
    '"publicationAllowed": { "const": false }',
    '"cloudOverwriteAllowed": { "const": false }',
    '"websiteMutationAllowed": { "const": false }',
  ]) assert.ok(source.includes(token), `missing transaction-state schema token: ${token}`);
});

test("transaction-state MCP distinguishes published rollback-ready from rolled-back closed", async () => {
  const source = (await read("./work_header_publication_transaction_state_mcp.mjs")).toString("utf8");
  for (const token of [
    'SERVER_VERSION = "1.0.0"',
    'CONTRACT = "evavo.work-header-publication-transaction-state.v1"',
    `SCHEMA_SHA256 = "${SCHEMA_SHA256}"`,
    'PUBLICATION_POSTFLIGHT_CONTRACT = "evavo.work-header-publication-postflight.v1"',
    'ROLLBACK_POSTFLIGHT_CONTRACT = "evavo.work-header-publication-rollback-postflight.v1"',
    'transactionState: "published-verified-rollback-ready"',
    'transactionState: "rolled-back-verified-closed"',
    "terminal: false",
    "terminal: true",
    "candidateLiveWhenPublished: true",
    "previousTargetLiveWhenRolledBack: true",
    "transactionStateEvidenceOnly: true",
    "executionAllowed: false",
    "rollbackExecutionAllowed: false",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
    "evavo_record_work_header_publication_transaction_state",
    "evavo_verify_work_header_publication_transaction_state",
  ]) assert.ok(source.includes(token), `missing transaction-state MCP token: ${token}`);
});

test("transaction-state ledger always re-reads live target and rollback backup", async () => {
  const source = (await read("./work_header_publication_transaction_state_mcp.mjs")).toString("utf8");
  assert.ok(source.includes("const live = await bound(value.liveTargetPath);"));
  assert.ok(source.includes("const backup = await bound(value.rollbackBackupPath);"));
  assert.ok(source.includes("Published transaction state no longer has the exact reviewed candidate live."));
  assert.ok(source.includes("Rolled-back transaction state no longer has the exact previous target live."));
  assert.ok(source.includes("Rolled-back transaction backup no longer matches restored live target."));
});
