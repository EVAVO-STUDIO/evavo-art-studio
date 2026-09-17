#!/usr/bin/env node

import assert from "node:assert/strict";
import { lstatSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "scripts/layered-godot-workspace-writer.mjs",
  "scripts/layered-godot-workspace-writer/contract-base.mjs",
  "scripts/layered-godot-workspace-writer/contract.mjs",
  "scripts/layered-godot-workspace-writer/filesystem.mjs",
  "scripts/layered-godot-workspace-writer/journal.mjs",
  "scripts/layered-godot-workspace-writer/recovery.mjs",
  "scripts/layered-godot-workspace-writer/recovery.test.mjs",
  "scripts/layered-godot-workspace-writer/runtime.mjs",
  "scripts/check-layered-godot-workspace-writer.mjs",
  "scripts/test-layered-godot-workspace-writer.mjs",
  "config/layered-production-godot-workspace-writer.v1.json",
  "docs/LAYERED_GODOT_WORKSPACE_WRITER.md",
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

const implementation = [
  source.get("scripts/layered-godot-workspace-writer.mjs"),
  source.get("scripts/layered-godot-workspace-writer/contract-base.mjs"),
  source.get("scripts/layered-godot-workspace-writer/contract.mjs"),
  source.get("scripts/layered-godot-workspace-writer/filesystem.mjs"),
  source.get("scripts/layered-godot-workspace-writer/journal.mjs"),
  source.get("scripts/layered-godot-workspace-writer/recovery.mjs"),
  source.get("scripts/layered-godot-workspace-writer/runtime.mjs"),
].join("\n");

for (const token of [
  "evavo.layered-production.godot-integration-plan",
  "evavo.layered-production.godot-workspace-write-request",
  "evavo.layered-production.godot-workspace-write-receipt",
  "evavo.layered-production.godot-workspace-recovery-receipt",
  '"2026-08-11.1"',
  '"2026-08-12.2"',
  '".evavo-godot-transactions"',
  "JOURNAL_INTENT_KIND",
  "JOURNAL_PREPARED_KIND",
  "JOURNAL_FINALIZING_KIND",
  "writeImmutableRecord",
  "writePreparedJournal",
  "writeFinalizingJournal",
  "recoverLayeredGodotWorkspace",
  "rollbackPreparedTransaction",
  "completeFinalizingTransaction",
  "RECOVERY_REQUIRED",
  "recoveryReceiptSha256",
  "transactionId",
  "gitCommitCreated: false",
  "gitPushPerformed: false",
  "runtimeActivationPerformed: false",
  "forcePushPerformed: false",
]) {
  assert.ok(implementation.includes(token), `implementation is missing ${token}`);
}

for (const forbidden of [
  "shell: true",
  "eval(",
  "new Function(",
  "git push",
  "git commit",
  "--force",
  "child_process",
]) {
  assert.equal(
    implementation.includes(forbidden),
    false,
    `implementation contains forbidden ${forbidden}`,
  );
}

const configuration = JSON.parse(
  source.get("config/layered-production-godot-workspace-writer.v1.json"),
);
assert.equal(configuration.schema, "evavo.layered-production.godot-workspace-writer.v1");
assert.equal(configuration.protocolVersion, "2026-08-12.2");
assert.equal(configuration.input.requiredResources, 7);
assert.equal(configuration.filesystemSafety.durableTransactionJournal, true);
assert.equal(configuration.filesystemSafety.crashRecovery, true);
assert.equal(configuration.filesystemSafety.forwardCompletionAfterFinalizing, true);
assert.equal(configuration.authority.exactWorkspaceFileWrite, true);
assert.equal(configuration.authority.gitCommit, false);
assert.equal(configuration.authority.gitPush, false);
assert.equal(configuration.authority.forcePush, false);
assert.ok(configuration.commands.recover.includes(" recover "));

const documentation = source.get("docs/LAYERED_GODOT_WORKSPACE_WRITER.md");
for (const token of [
  "Godot 4.6.2",
  "2026-08-12.2",
  "Durable transaction journal",
  ".evavo-godot-transactions",
  "recover",
  "prepared",
  "finalizing",
  "process interruption",
  "does not:",
  "create a Git commit",
  "push Git history",
]) {
  assert.ok(documentation.includes(token), `documentation is missing ${token}`);
}

const workflow = source.get(".github/workflows/layered-godot-workspace-writer.yml");
for (const token of [
  "permissions:\n  contents: read",
  "fetch-depth: 1",
  "persist-credentials: false",
  "package-manager-cache: false",
  "node scripts/check-layered-godot-workspace-writer.mjs",
  "node scripts/check-layered-godot-workspace-auditor.mjs",
  "git diff --exit-code",
  "cancel-in-progress: true",
]) {
  assert.ok(workflow.includes(token), `workflow is missing ${token}`);
}
for (const forbidden of ["pnpm install", "npm install", "yarn install", "fetch-depth: 0"]) {
  assert.equal(workflow.includes(forbidden), false, `workflow contains ${forbidden}`);
}

const tests = spawnSync(
  process.execPath,
  [
    "--test",
    path.join(root, "scripts/test-layered-godot-workspace-writer.mjs"),
    path.join(root, "scripts/layered-godot-workspace-writer/recovery.test.mjs"),
  ],
  {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  },
);
if (tests.stdout) process.stdout.write(tests.stdout);
if (tests.stderr) process.stderr.write(tests.stderr);
assert.equal(tests.status, 0, "layered Godot workspace writer tests failed");

console.log("Layered Godot workspace writer contract passed.");
console.log("- seven exact Godot 4.6.2 drafts remain plan-hash and repository bound");
console.log("- protocol 2026-08-12.2 journals intent, prepared and finalizing boundaries");
console.log("- interrupted preparation and mutation can be recovered without the original plan file");
console.log("- pre-finalizing recovery rolls back; post-finalizing recovery completes forward");
console.log("- new writes fail closed until outstanding transactions are recovered");
console.log("- Git, activation, deployment and publication authority remain separate");
