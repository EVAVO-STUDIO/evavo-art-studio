#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "scripts/layered-godot-handoff-gate.mjs",
  "scripts/layered-godot-workspace-writer/handoff-gate/common.mjs",
  "scripts/layered-godot-workspace-writer/handoff-gate/audit-contract.mjs",
  "scripts/layered-godot-workspace-writer/handoff-gate/runtime-contract.mjs",
  "scripts/test-layered-godot-handoff-gate.mjs",
  "scripts/check-layered-godot-handoff-gate.mjs",
  "config/layered-production-godot-handoff-gate.v1.json",
  "docs/LAYERED_GODOT_HANDOFF_GATE.md",
  ".github/workflows/layered-godot-workspace-writer.yml",
];

const source = new Map();
for (const relative of files) {
  const absolute = path.join(root, relative);
  const metadata = lstatSync(absolute);
  assert.equal(metadata.isFile(), true, `${relative} must be a file`);
  assert.equal(
    metadata.isSymbolicLink(),
    false,
    `${relative} must not be symbolic`,
  );
  assert.ok(
    metadata.size > 0 && metadata.size < 2_000_000,
    `${relative} has an invalid size`,
  );
  const content = readFileSync(absolute, "utf8");
  assert.equal(content.startsWith("\uFEFF"), false, `${relative} has a BOM`);
  assert.equal(content.includes("\r"), false, `${relative} must use LF`);
  source.set(relative, content);
}

for (const relative of files.filter((entry) => entry.endsWith(".mjs"))) {
  const syntax = spawnSync(
    process.execPath,
    ["--check", path.join(root, relative)],
    {
      cwd: root,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    },
  );
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
}

const implementation = [
  source.get("scripts/layered-godot-handoff-gate.mjs"),
  source.get(
    "scripts/layered-godot-workspace-writer/handoff-gate/common.mjs",
  ),
  source.get(
    "scripts/layered-godot-workspace-writer/handoff-gate/audit-contract.mjs",
  ),
  source.get(
    "scripts/layered-godot-workspace-writer/handoff-gate/runtime-contract.mjs",
  ),
].join("\n");

for (const token of [
  'LAYERED_GODOT_HANDOFF_GATE_PROTOCOL_VERSION = "2026-08-13.1"',
  "evavo.layered-production.godot-handoff-gate-receipt",
  "auditLayeredGodotWorkspace",
  "assertNoOutstandingTransactions",
  "LAYERED_GODOT_RUNTIME_VALIDATION_RECEIPT_KIND",
  "REQUIRED_GODOT_VERSION",
  "snapshotJsonValue",
  "immutableInputSnapshot: true",
  "could not be inspected safely",
  "must be an enumerable data property without accessors",
  "contains a cyclic object graph",
  "exactObject",
  "unsupported field",
  "admissionAuditSha256",
  "exactAuditReceiptContract: true",
  "exactRuntimeReceiptContract: true",
  "unsupportedReceiptFieldsRejected: true",
  "targetStableAcrossGate: true",
  "TARGET_DRIFT",
  "repositoryReviewReady: true",
  "gitCommitAuthorized: false",
  "gitPushAuthorized: false",
  "requiresExplicitGitOperator: true",
  "targetRepositoryMutationPerformed: false",
  "gitCommitCreated: false",
  "gitPushPerformed: false",
  "forcePushPerformed: false",
]) {
  assert.ok(implementation.includes(token), `handoff gate missing ${token}`);
}

for (const forbidden of [
  "spawn(",
  "exec(",
  "writeFile(",
  "git push",
  "git commit",
  "--force",
  "shell: true",
]) {
  assert.equal(
    implementation.includes(forbidden),
    false,
    `handoff gate contains forbidden ${forbidden}`,
  );
}

const config = JSON.parse(
  source.get("config/layered-production-godot-handoff-gate.v1.json"),
);
assert.equal(config.schema, "evavo.layered-production.godot-handoff-gate.v1");
assert.equal(config.protocolVersion, "2026-08-13.1");
assert.equal(config.requirements.requiresExactGodotVersion, "4.6.2");
assert.equal(config.requirements.requiresImmutableInputSnapshot, true);
assert.equal(config.requirements.rejectsAccessorAndProxyInputs, true);
assert.equal(config.requirements.requiresClosedTopLevelInputContract, true);
assert.equal(config.requirements.requiresExactAuditReceiptContract, true);
assert.equal(config.requirements.requiresExactRuntimeReceiptContract, true);
assert.equal(config.requirements.rejectsUnsupportedReceiptFields, true);
assert.equal(
  config.requirements.requiresFinalAuditAfterReceiptAdmission,
  true,
);
assert.equal(config.requirements.requiresTargetStableAcrossGate, true);
assert.equal(config.readiness.repositoryReviewReady, true);
assert.equal(config.readiness.gitCommitAuthorized, false);
assert.equal(config.readiness.gitPushAuthorized, false);
assert.equal(config.authority.targetRepositoryWrite, false);
assert.equal(config.authority.gitCommit, false);
assert.equal(config.authority.gitPush, false);
assert.equal(config.authority.forcePush, false);

const docs = source.get("docs/LAYERED_GODOT_HANDOFF_GATE.md");
for (const token of [
  "not Git authority",
  "immutable JSON snapshot",
  "first asynchronous boundary",
  "accessor properties",
  "post-call mutation",
  "self-hash is integrity evidence",
  "unsupported fields",
  "second fresh audit",
  "repositoryReviewReady: true",
  "gitCommitAuthorized: false",
  "gitPushAuthorized: false",
  "separate explicit Git operator",
]) {
  assert.ok(docs.includes(token), `handoff docs missing ${token}`);
}

const workflow = source.get(
  ".github/workflows/layered-godot-workspace-writer.yml",
);
for (const token of [
  "scripts/layered-godot-handoff-gate.mjs",
  "scripts/layered-godot-workspace-writer/**",
  "scripts/test-layered-godot-handoff-gate.mjs",
  "scripts/check-layered-godot-handoff-gate.mjs",
  "config/layered-production-godot-handoff-gate.v1.json",
  "docs/LAYERED_GODOT_HANDOFF_GATE.md",
  "node scripts/check-layered-godot-handoff-gate.mjs",
]) {
  assert.ok(workflow.includes(token), `workflow missing ${token}`);
}

const tests = spawnSync(
  process.execPath,
  ["--test", path.join(root, "scripts/test-layered-godot-handoff-gate.mjs")],
  {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  },
);
if (tests.stdout) process.stdout.write(tests.stdout);
if (tests.stderr) process.stderr.write(tests.stderr);
assert.equal(tests.status, 0, "handoff gate tests failed");

console.log("Layered Godot handoff gate contract passed.");
console.log("- complete handoff input is captured as one bounded immutable snapshot");
console.log("- accessors, proxies, cycles and unsupported top-level fields fail closed");
console.log("- self-hashes are re-admitted through exact receipt contracts");
console.log("- unsupported and missing receipt fields fail closed");
console.log("- target stability is re-audited after receipt admission");
console.log("- repository review readiness still grants no Git authority");
