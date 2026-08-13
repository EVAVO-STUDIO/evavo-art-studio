#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const preservedV1Sources = {
  "scripts/layered-godot-git-push-operator/contract.mjs":
    "06d3e2a486d81f4298f4d3f91451da998840f3a68146221db8221b5ffef23897",
  "scripts/layered-godot-git-push-operator/runtime.mjs":
    "35076be546dee9d073398e8bc0e642aea14561933a4bc63ee72f7795b6c42c3f",
  "scripts/layered-godot-git-push-operator/git-exec.mjs":
    "d914304d73e5c89ffe841f8b7c1c22ec8afe1c33a7c5d40d86c8ae7dbff7ec50",
  "scripts/layered-godot-git-push-operator/local.mjs":
    "0ca851389147a5fb27555f16288e1ecdc63945909e42bd9b202b0e68a9e53e5c",
  "scripts/layered-godot-git-push-operator/receipt.mjs":
    "826727835ceaf5c844503b20752728aad914f27793e44a6f274506989ba6b702",
};
for (const [relative, expected] of Object.entries(preservedV1Sources)) {
  assert.equal(
    sha256Text(source.get(relative)),
    expected,
    `${relative} must remain the exact validated v1 implementation behind admission`,
  );
}

const admission = source.get("scripts/layered-godot-git-push-operator.mjs");
const implementation = [
  admission,
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
  "captureDependencies",
  "utilTypes.isProxy",
  "captureWorkspaceRoot",
  "captureOrigin",
  "validateOriginIdentity",
  "captureGitResult",
  "MAXIMUM_GIT_OUTPUT_BYTES",
  "copyStableBuffer",
  "SharedArrayBuffer",
  "captureStableFileRead",
  "pushRuntimeCommit",
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
for (const token of [
  "captureDependencies",
  "wrapDependencies",
  "captureOrigin",
  "captureGitResult",
  "MAXIMUM_GIT_OUTPUT_BYTES",
  "pushRuntimeCommit",
]) assert.ok(admission.includes(token), `push admission missing ${token}`);
for (const forbidden of [
  'export { pushLayeredGodotCommit } from "./layered-godot-git-push-operator/runtime.mjs"',
  '"--force"', '"--force-with-lease"', '"--tags"', '"--mirror"',
  "git reset", "git checkout", "git restore", "git merge", "git rebase", "shell: true",
]) assert.equal(implementation.includes(forbidden), false, `push operator contains forbidden ${forbidden}`);

const config = JSON.parse(source.get("config/layered-production-godot-git-push-operator.v1.json"));
assert.equal(config.schema, "evavo.layered-production.godot-git-push-operator.v1");
assert.equal(config.protocolVersion, "2026-08-13.1");
assert.equal(config.requirements.requiresSynchronousDependencyCaptureBeforeAsyncBoundary, true);
assert.equal(config.requirements.rejectsProxyDependencyObjects, true);
assert.equal(config.requirements.rejectsDependencyAccessorsWithoutInvocation, true);
assert.equal(config.requirements.rejectsUnsupportedDependencyFields, true);
assert.equal(config.requirements.requiresNonProxyDependencyFunctions, true);
assert.equal(config.requirements.requiresCapturedWorkspaceRootResult, true);
assert.equal(config.requirements.requiresCapturedValidatedOriginResult, true);
assert.equal(config.requirements.rejectsInjectedOriginUrlIdentityMismatch, true);
assert.equal(config.requirements.requiresCapturedGitSubprocessResults, true);
assert.equal(config.requirements.rejectsInjectedGitOutputBeyondBoundedLimit, true);
assert.equal(config.requirements.rejectsSharedGitOutputBuffers, true);
assert.equal(config.requirements.requiresPushResultStatusAndBufferOwnershipBeforeRemoteReadback, true);
assert.equal(config.requirements.requiresCapturedStableFileReadResults, true);
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
  "plain non-Proxy object",
  "Accessors are rejected without being invoked",
  "private owned values",
  "shared-memory output buffers are rejected",
  "same 2 MiB limit",
  "privately owned before any post-push remote readback",
  "remote branch still equals the reviewed parent",
  "Pre-push hooks are disabled",
  "remote-confirmed-after-client-error",
  "not deployment or release publication",
]) assert.ok(docs.includes(token), `push docs missing ${token}`);

const adversarial = source.get("scripts/layered-godot-git-push-operator/test-adversarial.mjs");
for (const token of [
  "rejects dependency accessors without invoking them",
  "rejects Proxy dependency functions",
  "rejects Proxy workspace-root results",
  "rejects origin-result accessors without invoking them",
  "captures each validated origin result before later dependency mutation",
  "rejects Proxy Git subprocess results",
  "rejects shared-memory Git output buffers",
  "rejects injected Git output beyond the bounded byte limit",
  "owns push-result status and buffers before later dependency mutation",
]) assert.ok(adversarial.includes(token), `push adversarial tests missing ${token}`);

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
  timeout: 120_000,
});
if (tests.stdout) process.stdout.write(tests.stdout);
if (tests.stderr) process.stderr.write(tests.stderr);
assert.equal(tests.status, 0, "push operator tests failed");
console.log("Layered Godot Git push operator contract passed.");
console.log("- dependency overrides are captured before asynchronous work");
console.log("- workspace, origin and Git results become private owned evidence");
console.log("- exact commit receipt and local Git state are independently re-verified");
console.log("- remote must equal the reviewed parent before a plain branch push");
console.log("- force, tags, hooks, URL rewrites and branch creation remain disabled");
console.log("- exact remote readback proves pushed and idempotent outcomes");
