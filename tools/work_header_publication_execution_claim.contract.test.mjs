import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("execution claim schema remains fail-closed and digest-bound", async () => {
  const bytes = await read("../contracts/work-header-publication-execution-claim-v1.schema.json");
  assert.equal(sha256(bytes), "0b7ee89628c1e55f057161d41f7cea4e3addcdefc442b51823ed507a1b612116");
  const schema = JSON.parse(bytes.toString("utf8"));
  assert.equal(schema.$id, "evavo.work-header-publication-execution-claim.v1");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.claimState.const, "claimed-unexecuted");
  assert.equal(schema.properties.deterministicClaimPathRequired.const, true);
  assert.equal(schema.properties.singleUseClaimEstablished.const, true);
  assert.equal(schema.properties.claimInvalidOnAnyEvidenceDrift.const, true);
  for (const field of ["executionAllowed", "publicationAllowed", "cloudOverwriteAllowed", "websiteMutationAllowed"]) assert.equal(schema.properties[field].const, false);
});

test("execution claim tool creates one deterministic create-only claim and grants no mutation authority", async () => {
  const source = (await read("./work_header_publication_execution_claim_mcp.mjs")).toString("utf8");
  for (const token of [
    'SERVER_VERSION = "1.0.1"',
    'CONTRACT = "evavo.work-header-publication-execution-claim.v1"',
    "deterministicClaimPath(review.authorizationFile.path)",
    'return `${authorizationPath}.execution-claim.json`',
    "writeCreateOnlyBundle",
    "confirmSingleUseClaim=true is required",
    "secondClaimForSameAuthorizationRejected: true",
    "claimInvalidOnAnyEvidenceDrift: true",
    "authorizationReverificationRequired: true",
    "transactionPlanReverificationRequired: true",
    "candidateBytesReverificationRequired: true",
    "currentTargetRecheckRequired: true",
    "rollbackBackupReverificationRequired: true",
    "executionAllowed: false",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
  ]) assert.ok(source.includes(token), `missing execution-claim token: ${token}`);
  for (const forbidden of ["cloudinary.uploader", "upload_stream", "renameSync(", "copyFileSync(", "writeFileSync(", "unlinkSync("]) assert.equal(source.includes(forbidden), false, `execution claim must not mutate target via ${forbidden}`);
});

test("MCP configuration exposes the execution claim after authorization", async () => {
  const config = (await read("../.mcp.json")).toString("utf8");
  const authorization = config.indexOf('"evavo-work-header-publication-execution-authorization-v1"');
  const claim = config.indexOf('"evavo-work-header-publication-execution-claim-v1"');
  assert.ok(authorization >= 0 && claim > authorization);
  assert.ok(config.includes('"tools/work_header_publication_execution_claim_mcp.mjs"'));
});
