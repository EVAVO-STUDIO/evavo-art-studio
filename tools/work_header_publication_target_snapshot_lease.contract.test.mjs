import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("target-snapshot lease schema is byte-pinned and fail-closed", async () => {
  const schemaBytes = await read("../contracts/work-header-publication-target-snapshot-lease-v1.schema.json");
  assert.equal(sha256(schemaBytes), "652a7d5fcbc2c44fb4edffb9d93f8305110c74c3b39ece7e4eca76c5d2c7bdc6");
  const schema = JSON.parse(schemaBytes.toString("utf8"));
  assert.equal(schema.$id, "evavo.work-header-publication-target-snapshot-lease.v1");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.singleActiveLeasePerTargetSnapshot.const, true);
  assert.equal(schema.properties.publicationAndRollbackMutuallyExclusiveForSameTargetSnapshot.const, true);
  for (const field of ["executionAllowed", "rollbackExecutionAllowed", "publicationAllowed", "cloudOverwriteAllowed", "websiteMutationAllowed"]) assert.equal(schema.properties[field].const, false);
});

test("target-snapshot lease consumes both publication and rollback claims and serializes by target plus live bytes", async () => {
  const source = (await read("./work_header_publication_target_snapshot_lease_mcp.mjs")).toString("utf8");
  for (const token of [
    'SERVER_VERSION = "1.0.0"',
    'CONTRACT = "evavo.work-header-publication-target-snapshot-lease.v1"',
    'PUBLICATION_CLAIM_CONTRACT = "evavo.work-header-publication-execution-claim.v1"',
    'ROLLBACK_CLAIM_CONTRACT = "evavo.work-header-publication-rollback-execution-claim.v1"',
    "singleActiveLeasePerTargetSnapshot: true",
    "publicationAndRollbackMutuallyExclusiveForSameTargetSnapshot: true",
    "deterministicLeasePathFromTargetAndCurrentBytes: true",
    "writeCreateOnlyBundle",
    "currentTargetReverificationRequired: true",
    "cloudinaryUsesLiveRemoteRecheck: true",
    "websiteSourceUsesGovernedLocalRecheck: true",
    "A target-snapshot lease already exists for these exact live target bytes",
    "executionAllowed: false",
    "rollbackExecutionAllowed: false",
    "publicationAllowed: false",
  ]) assert.ok(source.includes(token), `missing target-snapshot lease token: ${token}`);
});

test("target-snapshot lease sidecar uses one shared workstation lease root", async () => {
  const sidecar = JSON.parse((await read("../.mcp.work-header-publication-target-snapshot-lease-v1.json")).toString("utf8"));
  const server = sidecar.mcpServers["evavo-work-header-publication-target-snapshot-lease-v1"];
  assert.equal(server.args[0], "tools/work_header_publication_target_snapshot_lease_mcp.mjs");
  assert.equal(server.env.EVAVO_WORK_HEADER_PUBLICATION_LEASE_ROOT, "%LOCALAPPDATA%\\EVAVO\\ArtStudio\\publication-target-leases");
  assert.equal(server.singleActiveLeasePerTargetSnapshot, true);
  assert.equal(server.publicationAndRollbackMutuallyExclusiveForSameTargetSnapshot, true);
  assert.equal(server.publicationAllowed, false);
});
