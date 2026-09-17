#!/usr/bin/env node

import assert from "node:assert/strict";
import { lstatSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "scripts/layered-godot-runtime-validator.mjs",
  "scripts/test-layered-godot-runtime-validator.mjs",
  "scripts/check-layered-godot-runtime-validator.mjs",
  "config/layered-production-godot-runtime-validator.v1.json",
  "docs/LAYERED_GODOT_RUNTIME_VALIDATOR.md",
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

const implementation = source.get("scripts/layered-godot-runtime-validator.mjs");
for (const token of [
  "evavo.layered-production.godot-runtime-validation-receipt",
  'REQUIRED_GODOT_VERSION = "4.6.2"',
  "auditLayeredGodotWorkspace",
  "assertNoOutstandingTransactions",
  "inspectGodotExecutable",
  "spawn(executable, args, {",
  "shell: false",
  '"--version"',
  '"--headless"',
  '"--path"',
  '"--script"',
  "ResourceLoader.load",
  "PackedScene",
  "instantiate()",
  "evavo_layered_godot_runtime_validated",
  "ephemeral-exact-resource-copy",
  "targetWorkspaceMounted: false",
  "sceneTreeActivationPerformed: false",
  "targetRepositoryMutationPerformed: false",
  "gitCommitCreated: false",
  "gitPushPerformed: false",
  "forcePushPerformed: false",
  "assertAuditUnchanged(preAudit, postAudit)",
  "if (integrityError) throw integrityError",
]) {
  assert.ok(implementation.includes(token), `runtime validator is missing ${token}`);
}
for (const forbidden of [
  "shell: true",
  "exec(",
  "execSync(",
  "eval(",
  "new Function(",
  "git push",
  "git commit",
  "--force",
  "curl ",
  "wget ",
]) {
  assert.equal(implementation.includes(forbidden), false, `runtime validator contains forbidden ${forbidden}`);
}

const configuration = JSON.parse(source.get("config/layered-production-godot-runtime-validator.v1.json"));
assert.equal(configuration.schema, "evavo.layered-production.godot-runtime-validator.v1");
assert.equal(configuration.protocolVersion, "2026-08-12.1");
assert.equal(configuration.requirements.requiredEngineVersion, "4.6.2");
assert.equal(configuration.requirements.exactResourceCount, 7);
assert.equal(configuration.requirements.requiresCurrentAuditReceipt, true);
assert.equal(configuration.requirements.requiresNoOutstandingWorkspaceTransaction, true);
assert.equal(configuration.sandbox.targetWorkspaceMounted, false);
assert.equal(configuration.sandbox.cleanupRequired, true);
assert.equal(configuration.execution.shell, false);
assert.equal(configuration.execution.headless, true);
assert.equal(configuration.integrity.postExecutionAuditRunsAfterEngineFailure, true);
assert.equal(configuration.integrity.targetDriftOutranksEngineFailure, true);
assert.equal(configuration.ci.realEngineDownloadOnOrdinaryPush, false);
assert.equal(configuration.authority.targetRepositoryWrite, false);
assert.equal(configuration.authority.gitCommit, false);
assert.equal(configuration.authority.gitPush, false);
assert.equal(configuration.authority.forcePush, false);

const documentation = source.get("docs/LAYERED_GODOT_RUNTIME_VALIDATOR.md");
for (const token of [
  "Godot 4.6.2",
  "**not** passed to Godot as `--path`",
  "self-contained",
  "PackedScene",
  "target drift is authoritative",
  "do **not** download a full Godot distribution",
  "explicit Git commit and push",
]) {
  assert.ok(documentation.includes(token), `runtime validator documentation is missing ${token}`);
}

const workflow = source.get(".github/workflows/layered-godot-workspace-writer.yml");
for (const token of [
  "scripts/layered-godot-runtime-validator.mjs",
  "scripts/test-layered-godot-runtime-validator.mjs",
  "scripts/check-layered-godot-runtime-validator.mjs",
  "config/layered-production-godot-runtime-validator.v1.json",
  "docs/LAYERED_GODOT_RUNTIME_VALIDATOR.md",
  "node scripts/check-layered-godot-runtime-validator.mjs",
]) {
  assert.ok(workflow.includes(token), `focused workflow is missing ${token}`);
}

const tests = spawnSync(
  process.execPath,
  ["--test", path.join(root, "scripts/test-layered-godot-runtime-validator.mjs")],
  { cwd: root, encoding: "utf8", shell: false, windowsHide: true },
);
if (tests.stdout) process.stdout.write(tests.stdout);
if (tests.stderr) process.stderr.write(tests.stderr);
assert.equal(tests.status, 0, "layered Godot runtime validator tests failed");

console.log("Layered Godot runtime validator contract passed.");
console.log("- current audit and durable transaction state gate engine execution");
console.log("- exact Godot 4.6.2 executable identity and version are evidence-bound");
console.log("- seven exact resources run only in an isolated ephemeral sandbox");
console.log("- engine failures still trigger post-execution target integrity proof");
console.log("- Git, deployment, publication and target runtime activation remain separate");
