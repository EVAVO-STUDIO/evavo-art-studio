import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("publication recoverability schema remains exact, fail-closed and evidence-only", async () => {
  const bytes = await read("../contracts/work-header-publication-recoverability-v1.schema.json");
  assert.equal(sha256(bytes), "d382c2614e0315d6206bfa0ec0c3a5cc2f36600811031053eb0e4dc901d32370");
  const schema = JSON.parse(bytes.toString("utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.contract.const, "evavo.work-header-publication-recoverability.v1");
  assert.equal(schema.properties.recoverabilityState.const, "published-rollback-recovery-ready");
  for (const field of ["executionAllowed", "rollbackExecutionAllowed", "publicationAllowed", "cloudOverwriteAllowed", "websiteMutationAllowed"]) {
    assert.equal(schema.properties[field].const, false, `${field} must remain false`);
  }
  for (const field of ["transactionStateReverified", "sourcePostflightBindingReverified", "liveTargetReverified", "liveTargetMatchesCandidate", "rollbackBackupReverified", "rollbackBackupDiffersFromCandidate", "targetAwareLiveRecheckRequired", "recoverabilityEvidenceOnly"]) {
    assert.equal(schema.properties[field].const, true, `${field} must remain true`);
  }
});

test("recoverability MCP rechecks live candidate and distinct rollback backup without execution authority", async () => {
  const source = (await read("./work_header_publication_recoverability_mcp.mjs")).toString("utf8");
  for (const token of [
    'SERVER_VERSION = "1.0.0"',
    'CONTRACT = "evavo.work-header-publication-recoverability.v1"',
    'TRANSACTION_STATE_CONTRACT = "evavo.work-header-publication-transaction-state.v1"',
    'PUBLICATION_POSTFLIGHT_CONTRACT = "evavo.work-header-publication-postflight.v1"',
    'state.transactionState !== "published-verified-rollback-ready"',
    "recheckPublicationTarget",
    "Current live publication target no longer matches the exact reviewed candidate bytes.",
    "Rollback backup bytes drifted after publication.",
    "Rollback backup is not a distinct previous-target snapshot; recoverability cannot be proven.",
    "transactionStateReverified: true",
    "sourcePostflightBindingReverified: true",
    "liveTargetReverified: true",
    "rollbackBackupReverified: true",
    "recoverabilityEvidenceOnly: true",
    "executionAllowed: false",
    "rollbackExecutionAllowed: false",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
    "writeCreateOnlyBundle",
    "evavo_verify_work_header_publication_recoverability",
  ]) assert.ok(source.includes(token), `missing recoverability contract token: ${token}`);
});

test("recoverability MCP profile pins schema and forbids mutation authority", async () => {
  const profile = JSON.parse((await read("../.mcp.work-header-publication-recoverability-v1.json")).toString("utf8"));
  assert.equal(profile.contract, "evavo.work-header-publication-recoverability.v1");
  assert.equal(profile.schemaSha256, "d382c2614e0315d6206bfa0ec0c3a5cc2f36600811031053eb0e4dc901d32370");
  for (const value of Object.values(profile.authority)) assert.equal(value, false);
});
