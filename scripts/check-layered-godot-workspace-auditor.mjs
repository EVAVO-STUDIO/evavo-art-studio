#!/usr/bin/env node

import assert from "node:assert/strict";
import { lstatSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "scripts/layered-godot-workspace-auditor.mjs",
  "scripts/test-layered-godot-workspace-auditor.mjs",
  "config/layered-production-godot-workspace-auditor.v1.json",
  "docs/LAYERED_GODOT_WORKSPACE_AUDITOR.md",
  ".github/workflows/layered-godot-workspace-writer.yml",
];

const source = new Map();
for (const relative of files) {
  const absolute = path.join(root, relative);
  const metadata = lstatSync(absolute);
  assert.equal(metadata.isFile(), true, `${relative} must be a regular file`);
  assert.equal(metadata.isSymbolicLink(), false, `${relative} must not be symbolic`);
  assert.ok(metadata.size > 0 && metadata.size < 2_000_000, `${relative} has invalid size`);
  const content = readFileSync(absolute, "utf8");
  assert.equal(content.startsWith("\uFEFF"), false, `${relative} has a BOM`);
  assert.equal(content.includes("\r"), false, `${relative} must use LF line endings`);
  source.set(relative, content);
}

for (const relative of files.filter((entry) => entry.endsWith(".mjs"))) {
  const syntax = spawnSync(process.execPath, ["--check", path.join(root, relative)], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
}

const implementation = source.get("scripts/layered-godot-workspace-auditor.mjs");
for (const token of [
  "evavo.layered-production.godot-workspace-audit-receipt",
  "verifyLayeredGodotWorkspaceWriteRequest",
  "receiptSha256",
  "requestSha256",
  "integrationSha256",
  "readStableRegularFile",
  "sameFilesystemPath",
  ".evavo-godot-stage-",
  ".evavo-godot-backup-",
  "LAYERED_GODOT_AUDIT_TARGET_DRIFT",
  "LAYERED_GODOT_AUDIT_RESIDUE_PRESENT",
  "fileWritePerformed: false",
  "gitCommitCreated: false",
  "gitPushPerformed: false",
  "forcePushPerformed: false",
]) {
  assert.ok(implementation.includes(token), `auditor implementation is missing ${token}`);
}
for (const forbidden of [
  "writeFile(",
  "mkdir(",
  "rename(",
  "unlink(",
  "link(",
  "shell: true",
  "git push",
  "git commit",
  "--force",
]) {
  assert.equal(implementation.includes(forbidden), false, `auditor implementation contains forbidden ${forbidden}`);
}

const configuration = JSON.parse(
  source.get("config/layered-production-godot-workspace-auditor.v1.json"),
);
assert.equal(configuration.schema, "evavo.layered-production.godot-workspace-auditor.v1");
assert.equal(configuration.protocolVersion, "2026-08-12.1");
assert.equal(configuration.requirements.exactResourceCount, 7);
assert.equal(configuration.requirements.requiresExactTargetBytes, true);
assert.equal(configuration.requirements.stageAndBackupResidueRejected, true);
assert.equal(configuration.authority.fileRead, true);
assert.equal(configuration.authority.fileWrite, false);
assert.equal(configuration.authority.gitCommit, false);
assert.equal(configuration.authority.gitPush, false);
assert.equal(configuration.authority.forcePush, false);

const documentation = source.get("docs/LAYERED_GODOT_WORKSPACE_AUDITOR.md");
for (const token of [
  "exactly seven operation records",
  "reconstructs the original write request",
  "no cleanup warning",
  ".evavo-godot-stage-",
  ".evavo-godot-backup-",
  "performs no write",
  "Godot import and runtime validation",
]) {
  assert.ok(documentation.includes(token), `auditor documentation is missing ${token}`);
}

const workflow = source.get(".github/workflows/layered-godot-workspace-writer.yml");
for (const token of [
  "scripts/layered-godot-workspace-auditor.mjs",
  "scripts/test-layered-godot-workspace-auditor.mjs",
  "scripts/check-layered-godot-workspace-auditor.mjs",
  "config/layered-production-godot-workspace-auditor.v1.json",
  "docs/LAYERED_GODOT_WORKSPACE_AUDITOR.md",
  "node scripts/check-layered-godot-workspace-auditor.mjs",
]) {
  assert.ok(workflow.includes(token), `focused workflow is missing ${token}`);
}

const tests = spawnSync(
  process.execPath,
  ["--test", path.join(root, "scripts/test-layered-godot-workspace-auditor.mjs")],
  {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  },
);
if (tests.stdout) process.stdout.write(tests.stdout);
if (tests.stderr) process.stderr.write(tests.stderr);
assert.equal(tests.status, 0, "layered Godot workspace auditor tests failed");

console.log("Layered Godot workspace auditor contract passed.");
console.log("- exact plan and write receipt are reconstructed and self-hash bound");
console.log("- seven live workspace resources are byte-for-byte revalidated");
console.log("- symlink, hard-link, target drift and transaction residue fail closed");
console.log("- audit receipts are self-hashed and retain read-only authority");
