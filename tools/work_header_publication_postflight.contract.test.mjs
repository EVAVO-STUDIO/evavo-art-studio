import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url), "utf8");

test("publication postflight is schema-bound, evidence-only and rollback-ready", async () => {
  const source = await read("./work_header_publication_postflight_mcp.mjs");
  for (const token of [
    'SERVER_VERSION = "1.0.0"',
    'CONTRACT = "evavo.work-header-publication-postflight.v1"',
    'SCHEMA_SHA256 = "5a1a2a9a329d3ce4eecd81981e3aa35cd2d6d2d3487f78b6b56672bacca99ae8"',
    'EXECUTION_RESULT_CONTRACT = "evavo.work-header-publication-execution-result.v1"',
    'ROLLBACK_READINESS_CONTRACT = "evavo.work-header-publication-rollback-readiness.v1"',
    'postflightState: "published-verified-rollback-ready"',
    "executionResultReverified: true",
    "rollbackReadinessReverified: true",
    "liveTargetReverified: true",
    "liveTargetMatchesReviewedCandidate: true",
    "rollbackBackupStillReady: true",
    "postflightEvidenceOnly: true",
    "deterministicCreateOnlyReceipt: true",
    "currentLiveTargetMustExactlyMatchReviewedCandidate: true",
    "rollbackBackupMustRemainReady: true",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
    "evavo_prepare_work_header_publication_postflight",
    "evavo_verify_work_header_publication_postflight",
  ]) assert.ok(source.includes(token), `missing publication-postflight token: ${token}`);
});

test("postflight schema remains fail closed", async () => {
  const schema = await read("../contracts/work-header-publication-postflight-v1.schema.json");
  for (const token of [
    '"$id": "evavo.work-header-publication-postflight.v1"',
    '"postflightState": { "const": "published-verified-rollback-ready" }',
    '"liveTargetMatchesReviewedCandidate": { "const": true }',
    '"rollbackBackupStillReady": { "const": true }',
    '"publicationAllowed": { "const": false }',
    '"cloudOverwriteAllowed": { "const": false }',
    '"websiteMutationAllowed": { "const": false }',
    '"additionalProperties": false',
  ]) assert.ok(schema.includes(token), `missing fail-closed postflight schema token: ${token}`);
});

test("supplemental MCP config exposes postflight verification without execution authority", async () => {
  const config = await read("../.mcp.work-header-publication-postflight-v1.json");
  assert.ok(config.includes('"evavo-work-header-publication-postflight-v1"'));
  assert.ok(config.includes('"tools/work_header_publication_postflight_mcp.mjs"'));
});
