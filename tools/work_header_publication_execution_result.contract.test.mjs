import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const SCHEMA_SHA256 = "6d94ca926dea8c5c0fdc025c3d65a8692ae5c8c6e61db2d37a536ae352d52445";

test("execution result schema is exact-byte pinned and fail closed", async () => {
  const bytes = await read("../contracts/work-header-publication-execution-result-v1.schema.json");
  assert.equal(sha256(bytes), SCHEMA_SHA256);
  const schema = JSON.parse(bytes.toString("utf8"));
  assert.equal(schema.$id, "evavo.work-header-publication-execution-result.v1");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.resultState.const, "executed-verified");
  for (const field of ["claimReverifiedBeforeAttestation", "candidateBytesReverified", "postExecutionTargetMatchesCandidate", "postExecutionTargetDiffersFromPreviousTarget", "rollbackBackupPreserved", "resultIsEvidenceOnly"]) assert.equal(schema.properties[field].const, true, field);
  for (const field of ["executionAllowed", "publicationAllowed", "cloudOverwriteAllowed", "websiteMutationAllowed"]) assert.equal(schema.properties[field].const, false, field);
});

test("execution result MCP is evidence-only and deterministic", async () => {
  const source = (await read("./work_header_publication_execution_result_mcp.mjs")).toString("utf8");
  for (const token of [
    'SERVER_VERSION = "1.0.0"',
    'CONTRACT = "evavo.work-header-publication-execution-result.v1"',
    `SCHEMA_SHA256 = "${SCHEMA_SHA256}"`,
    "confirmObservedExternalExecution=true is required",
    'return `${claimPath}.execution-result.json`',
    "writeCreateOnlyBundle",
    "postExecutionTargetMustExactlyMatchCandidate: true",
    "postExecutionTargetMustDifferFromPreviousTarget: true",
    "rollbackBackupMustRemainPreserved: true",
    "secondResultForSameClaimRejected: true",
    "resultIsEvidenceOnly: true",
    "executionPerformedByThisTool: false",
    "evavo_attest_work_header_publication_execution_result",
    "evavo_verify_work_header_publication_execution_result",
    "executionAllowed: false",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
  ]) assert.ok(source.includes(token), `missing execution-result contract token: ${token}`);
});

test("Art Studio MCP configuration registers execution-result attestation", async () => {
  const config = (await read("../.mcp.json")).toString("utf8");
  assert.ok(config.includes('"evavo-work-header-publication-execution-result-v1"'));
  assert.ok(config.includes('"tools/work_header_publication_execution_result_mcp.mjs"'));
});
