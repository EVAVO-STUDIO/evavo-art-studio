import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("rollback readiness schema is fail closed and digest pinned", async () => {
  const bytes = await read("../contracts/work-header-publication-rollback-readiness-v1.schema.json");
  assert.equal(sha256(bytes), "cc56d28b46f98cea1f97b46aa9988522c6b97424ee853a7c6c968a45ffd77f6d");
  const schema = JSON.parse(bytes.toString("utf8"));
  assert.equal(schema.$id, "evavo.work-header-publication-rollback-readiness.v1");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.rollbackState.const, "rollback-ready-unexecuted");
  assert.equal(schema.properties.rollbackPreparationOnly.const, true);
  assert.equal(schema.properties.rollbackExecutionAllowed.const, false);
  assert.equal(schema.properties.publicationAllowed.const, false);
  assert.equal(schema.properties.cloudOverwriteAllowed.const, false);
  assert.equal(schema.properties.websiteMutationAllowed.const, false);
});

test("rollback readiness tool reverifies published target and exact backup without mutation authority", async () => {
  const source = (await read("./work_header_publication_rollback_readiness_mcp.mjs")).toString("utf8");
  for (const token of [
    'SERVER_VERSION = "1.0.0"',
    'evavo.work-header-publication-rollback-readiness.v1',
    'cc56d28b46f98cea1f97b46aa9988522c6b97424ee853a7c6c968a45ffd77f6d',
    "reverifyExecutionResult",
    "Current published target no longer exactly matches the executed reviewed candidate bytes.",
    "Rollback backup no longer exactly matches the previous-target snapshot.",
    "backup.path === snapshot.path",
    "executionResultReverified: true",
    "currentPublishedTargetReverified: true",
    "rollbackBackupReverified: true",
    "currentPublishedTargetMatchesCandidate: true",
    "rollbackBackupMatchesPreviousTarget: true",
    "rollbackPreparationOnly: true",
    "rollbackExecutionAllowed: false",
    "evavo_prepare_work_header_publication_rollback",
    "evavo_verify_work_header_publication_rollback_readiness",
    "writeCreateOnlyBundle",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
  ]) assert.ok(source.includes(token), `missing rollback-readiness token: ${token}`);
});

test("MCP registration exposes rollback readiness without an executor", async () => {
  const config = (await read("../.mcp.json")).toString("utf8");
  assert.ok(config.includes('"evavo-work-header-publication-rollback-readiness-v1"'));
  assert.ok(config.includes('"tools/work_header_publication_rollback_readiness_mcp.mjs"'));
});
