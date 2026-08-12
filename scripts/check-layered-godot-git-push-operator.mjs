#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "scripts/layered-godot-git-push-operator.mjs",
  "scripts/layered-godot-git-push-operator/contract.mjs",
  "scripts/layered-godot-git-push-operator/git-exec.mjs",
  "scripts/layered-godot-git-push-operator/origin.mjs",
  "scripts/layered-godot-git-push-operator/local.mjs",
  "scripts/layered-godot-git-push-operator/receipt.mjs",
  "scripts/layered-godot-git-push-operator/runtime.mjs",
  "scripts/layered-godot-git-push-operator/test-fixture.mjs",
  "scripts/layered-godot-git-push-operator/test-push.mjs",
  "scripts/layered-godot-git-push-operator/test-adversarial.mjs",
  "scripts/test-layered-godot-git-push-operator.mjs",
  "scripts/check-layered-godot-git-push-operator.mjs",
  "config/layered-production-godot-git-push-operator.v1.json",
  "docs/LAYERED_GODOT_GIT_PUSH_OPERATOR.md",
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
  assert.equal(content.startsWith("\uFEFF"), false, `${relative} must not have BOM`);
  assert.equal(content.includes("\r"), false, `${relative} must use LF source line endings`);
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
  source.get("scripts/layered-godot-git-push-operator.mjs"),
  source.get("scripts/layered-godot-git-push-operator/contract.mjs"),
  source.get("scripts/layered-godot-git-push-operator/git-exec.mjs"),
  source.get("scripts/layered-godot-git-push-operator/origin.mjs"),
  source.get("scripts/layered-godot-git-push-operator/local.mjs"),
  source.get("scripts/layered-godot-git-push-operator/receipt.mjs"),
  source.get("scripts/layered-godot-git-push-operator/runtime.mjs"),
].join("\n");
for (const token of [
  'LAYERED_GODOT_GIT_PUSH_OPERATOR_PROTOCOL_VERSION = "2026-08-13.1"',
  "evavo.layered-production.godot-git-push-receipt",
  "validateCommitReceipt",
  "snapshotJsonValue",
  "remote.origin.pushurl",
  "remote.origin.receivepack",
  "remote.origin.mirror",
  ".pushinsteadof",
  "plain",
  '"push", "--porcelain", "--no-verify"',
  "push.followTags=false",
  "REMOTE_DRIFT",
  "PUSH_VERIFY_FAILED",
  'outcome: "already-pushed"',
  '"remote-confirmed-after-client-error"',
  "gitTagPushPerformed: false",
  "forcePushPerformed: false",
  "releasePublicationPerformed: false",
]) assert.ok(implementation.includes(token), `push operator missing ${token}`);
for (const forbidden of [
  '"--force"', '"--force-with-lease"', '"--tags"', '"--mirror"',
  "git reset", "git checkout", "git restore", "git merge", "git rebase", "shell: true",
]) assert.equal(implementation.includes(forbidden), false, `push operator contains forbidden ${forbidden}`);

const config = JSON.parse(source.get("config/layered-production-godot-git-push-operator.v1.json"));
assert.equal(config.schema, "evavo.layered-production.godot-git-push-operator.v1");
assert.equal(config.protocolVersion, "2026-08-13.1");
assert.equal(config.requirements.plainFastForwardPushOnly, true);
assert.equal(config.requirements.requiresRemoteBranchAlreadyExists, true);
assert.equal(config.requirements.requiresRemoteHeadEqualCommitParent, true);
assert.equal(config.requirements.forcePushDisabled, true);
assert.equal(config.requirements.tagPushDisabled, true);
assert.equal(config.authority.gitPush, true);
assert.equal(config.authority.gitTagPush, false);
assert.equal(config.authority.forcePush, false);
assert.equal(config.authority.deployment, false);
assert.equal(config.authority.releasePublication, false);

const docs = source.get("docs/LAYERED_GODOT_GIT_PUSH_OPERATOR.md");
for (const token of [
  "plain fast-forward branch push",
  "never uses force",
  "remote branch still equals the reviewed parent",
  "Pre-push hooks are disabled",
  "remote-confirmed-after-client-error",
  "not deployment or release publication",
]) assert.ok(docs.includes(token), `push docs missing ${token}`);

const workflow = source.get(".github/workflows/layered-godot-workspace-writer.yml");
for (const token of [
  "scripts/layered-godot-git-push-operator.mjs",
  "scripts/layered-godot-git-push-operator/**",
  "scripts/test-layered-godot-git-push-operator.mjs",
  "scripts/check-layered-godot-git-push-operator.mjs",
  "config/layered-production-godot-git-push-operator.v1.json",
  "docs/LAYERED_GODOT_GIT_PUSH_OPERATOR.md",
  "node scripts/check-layered-godot-git-push-operator.mjs",
]) assert.ok(workflow.includes(token), `workflow missing ${token}`);

const tests = spawnSync(process.execPath, ["--test", path.join(root, "scripts/test-layered-godot-git-push-operator.mjs")], {
  cwd: root,
  encoding: "utf8",
  shell: false,
  windowsHide: true,
});
if (tests.stdout) process.stdout.write(tests.stdout);
if (tests.stderr) process.stderr.write(tests.stderr);
assert.equal(tests.status, 0, "push operator tests failed");
console.log("Layered Godot Git push operator contract passed.");
console.log("- exact commit receipt and local Git state are independently re-verified");
console.log("- remote must equal the reviewed parent before a plain branch push");
console.log("- force, tags, hooks, URL rewrites and branch creation remain disabled");
console.log("- exact remote readback proves pushed and idempotent outcomes");
