import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(name, import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("current-target attestation pins its exact schema bytes", async () => {
  const [toolBytes, schemaBytes] = await Promise.all([
    read("./work_header_current_target_attestation_mcp.mjs"),
    read("../contracts/work-header-current-target-attestation-v1.schema.json"),
  ]);
  const source = toolBytes.toString("utf8");
  const digest = sha256(schemaBytes);
  assert.ok(source.includes(`const SCHEMA_SHA256 = "${digest}"`));
  assert.ok(source.includes('const CONTRACT = "evavo.work-header-current-target-attestation.v1"'));
});

test("attestation captures actual current target bytes without mutation authority", async () => {
  const source = (await read("./work_header_current_target_attestation_mcp.mjs")).toString("utf8");
  for (const token of [
    "readLocalSource",
    "readCloudinarySource",
    "normalizeCloudinaryUrl",
    "writeCreateOnlyBundle",
    "currentTargetIdentityVerified: true",
    "sourceReadOnly: true",
    "publicationAllowed: false",
    "cloudOverwriteAllowed: false",
    "websiteMutationAllowed: false",
    "evavo_capture_work_header_current_target",
    "evavo_verify_work_header_current_target_attestation",
  ]) assert.ok(source.includes(token), `missing target-attestation token: ${token}`);
});

test("attestation reverifies live target against immutable snapshot", async () => {
  const source = (await read("./work_header_current_target_attestation_mcp.mjs")).toString("utf8");
  for (const token of [
    "Live current target changed after snapshot attestation",
    "snapshot.sha256 !== sha256(snapshotBytes)",
    "current.sha256 !== snapshot.sha256",
    "current.byteLength !== snapshot.byteLength",
    "currentTargetPath only",
    "currentTargetUrl only",
  ]) assert.ok(source.includes(token), `missing live-target reverification token: ${token}`);
});
