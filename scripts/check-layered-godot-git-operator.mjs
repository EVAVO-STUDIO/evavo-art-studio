#!/usr/bin/env node

import assert from "node:assert/strict";
import { lstatSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "scripts/layered-godot-git-operator.mjs",
  "scripts/layered-godot-git-operator-runtime-v1.mjs",
  "scripts/layered-godot-git-operator/contract.mjs",
  "scripts/layered-godot-git-operator/git-exec.mjs",
  "scripts/test-layered-godot-git-operator.mjs",
  "scripts/check-layered-godot-git-operator.mjs",
  "scripts/layered-godot-handoff-gate.mjs",
  "scripts/layered-godot-repository-review/contract.mjs",
  "config/layered-production-godot-git-operator.v1.json",
  "docs/LAYERED_GODOT_GIT_OPERATOR.md",
  ".github/workflows/layered-godot-workspace-writer.yml",
];
const source = new Map();
for (const relative of files) {
  const absolute = path.join(root, relative);
  const metadata = lstatSync(absolute);
  assert.equal(metadata.isFile(), true, `${relative} must be a regular file`);
  assert.equal(metadata.isSymbolicLink(), false, `${relative} must not be symbolic`);
  assert.ok(
    metadata.size > 0 && metadata.size < 2_000_000,
    `${relative} has invalid size`,
  );
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

function exportedString(relative, name) {
  const match = new RegExp(
    `export const ${name}\\s*=\\s*"([^"]+)"`,
    "u",
  ).exec(source.get(relative));
  assert.ok(match, `${relative} is missing exported ${name}`);
  return match[1];
}

const handoffProtocol = exportedString(
  "scripts/layered-godot-handoff-gate.mjs",
  "LAYERED_GODOT_HANDOFF_GATE_PROTOCOL_VERSION",
);
const reviewExpectedHandoff = exportedString(
  "scripts/layered-godot-repository-review/contract.mjs",
  "EXPECTED_HANDOFF_GATE_PROTOCOL_VERSION",
);
assert.equal(
  reviewExpectedHandoff,
  handoffProtocol,
  "repository review must admit the exact current handoff-gate protocol",
);
const reviewProtocol = exportedString(
  "scripts/layered-godot-repository-review/contract.mjs",
  "LAYERED_GODOT_REPOSITORY_REVIEW_PROTOCOL_VERSION",
);
const operatorExpectedReview = exportedString(
  "scripts/layered-godot-git-operator/contract.mjs",
  "EXPECTED_REPOSITORY_REVIEW_PROTOCOL_VERSION",
);
assert.equal(
  operatorExpectedReview,
  reviewProtocol,
  "Git operator must admit the exact current repository-review protocol",
);

const admission = source.get("scripts/layered-godot-git-operator.mjs");
const runtime = source.get("scripts/layered-godot-git-operator-runtime-v1.mjs");
const implementation = `${admission}\n${runtime}`;
for (const token of [
  "snapshotJsonValue",
  "captureDependencies",
  "utilTypes.isProxy",
  "captureWorkspaceRoot",
  "captureVerifiedWriteRequest",
  "copyStableBuffer",
  "SharedArrayBuffer",
  "currentRepositoryReviewReceipt",
  "captureStableFileRead",
  "captureGitResult",
  "hash-object",
  "update-index",
  "--cacheinfo",
  "check-attr",
  "working-tree-encoding",
  "captureIndexPreimages",
  "index-drift",
  "core.hooksPath",
  "core.fsmonitor=false",
  "commit.gpgSign=false",
  "--no-verify",
  "--no-gpg-sign",
  "--cleanup=verbatim",
  "COMMIT_STATE_UNCERTAIN",
  "gitPushPerformed: false",
  "forcePushPerformed: false",
]) {
  assert.ok(implementation.includes(token), `Git operator missing ${token}`);
}
for (const token of [
  "captureDependencies",
  "wrapDependencies",
  "commitRuntimeHandoff",
  "captureVerifiedWriteRequest",
  "currentRepositoryReviewReceipt",
]) {
  assert.ok(admission.includes(token), `Git operator admission missing ${token}`);
}
for (const forbidden of [
  "git add -A",
  "git add .",
  'deps.runGit(root.path, ["push"',
  'runGit(root.path, ["push"',
  'deps.runGit(root.path, ["fetch"',
  'deps.runGit(root.path, ["pull"',
  'deps.runGit(root.path, ["merge"',
  'deps.runGit(root.path, ["rebase"',
  "--force-with-lease",
  "shell: true",
]) {
  assert.equal(
    implementation.includes(forbidden),
    false,
    `Git operator contains forbidden ${forbidden}`,
  );
}

const config = JSON.parse(
  source.get("config/layered-production-godot-git-operator.v1.json"),
);
assert.equal(config.schema, "evavo.layered-production.godot-git-operator.v1");
assert.equal(config.protocolVersion, "2026-08-13.1");
assert.equal(config.requirements.requiresExplicitCommitAuthorization, true);
assert.equal(config.requirements.requiresPushAuthorizationFalse, true);
assert.equal(config.requirements.requiresForcePushAuthorizationFalse, true);
assert.equal(
  config.requirements.requiresSynchronousDependencyCaptureBeforeAsyncBoundary,
  true,
);
assert.equal(config.requirements.rejectsProxyDependencyObjects, true);
assert.equal(config.requirements.rejectsDependencyAccessorsWithoutInvocation, true);
assert.equal(config.requirements.rejectsUnsupportedDependencyFields, true);
assert.equal(config.requirements.requiresNonProxyDependencyFunctions, true);
assert.equal(config.requirements.requiresCapturedWorkspaceRootResult, true);
assert.equal(config.requirements.requiresVerifierResultCaptureBeforeReviewAwait, true);
assert.equal(config.requirements.requiresVerifierOwnedResourceBufferCopy, true);
assert.equal(config.requirements.rejectsSharedVerifierBuffers, true);
assert.equal(
  config.requirements.requiresVerifiedResourceContentByteHashAgreement,
  true,
);
assert.equal(config.requirements.requiresCurrentReviewImmutableSnapshot, true);
assert.equal(config.requirements.requiresCapturedStableFileReadResults, true);
assert.equal(config.requirements.requiresCapturedGitSubprocessResults, true);
assert.equal(config.requirements.requiresRawBlobStaging, true);
assert.equal(
  config.requirements.requiresIndexPreimageRollbackOnSafePreCommitFailure,
  true,
);
assert.equal(
  config.requirements.refusesRollbackOnConcurrentSamePathIndexDrift,
  true,
);
assert.equal(config.authority.gitCommit, true);
assert.equal(config.authority.gitPush, false);
assert.equal(config.authority.forcePush, false);

const docs = source.get("docs/LAYERED_GODOT_GIT_OPERATOR.md");
for (const token of [
  "commit: true",
  "push: false",
  "forcePush: false",
  "plain non-Proxy object",
  "Accessors are rejected without being invoked",
  "verifier-owned resource buffers are copied",
  "shared-memory buffers are rejected",
  "private exact-byte copies",
  "git hash-object -w --stdin",
  "git update-index --add --cacheinfo",
  "never uses `git add -A`",
  "index preimage",
  "separate push review / push authority",
]) {
  assert.ok(docs.includes(token), `Git operator docs missing ${token}`);
}

const workflow = source.get(".github/workflows/layered-godot-workspace-writer.yml");
for (const token of [
  "scripts/layered-godot-git-operator.mjs",
  "scripts/layered-godot-git-operator/**",
  "scripts/test-layered-godot-git-operator.mjs",
  "scripts/check-layered-godot-git-operator.mjs",
  "config/layered-production-godot-git-operator.v1.json",
  "docs/LAYERED_GODOT_GIT_OPERATOR.md",
  "node scripts/check-layered-godot-git-operator.mjs",
]) {
  assert.ok(workflow.includes(token), `workflow missing ${token}`);
}

const tests = spawnSync(
  process.execPath,
  ["--test", path.join(root, "scripts/test-layered-godot-git-operator.mjs")],
  {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 120_000,
  },
);
if (tests.stdout) process.stdout.write(tests.stdout);
if (tests.stderr) process.stderr.write(tests.stderr);
assert.equal(tests.status, 0, "Git operator tests failed");
console.log("Layered Godot Git operator contract passed.");
console.log("- handoff/repository-review/operator protocol seams are exact");
console.log("- caller dependencies are captured before asynchronous work");
console.log("- verifier-owned bytes are copied and cross-checked before mutation");
console.log("- exact approved bytes are staged without git add or clean filters");
console.log("- index preimages provide bounded rollback without worktree mutation");
console.log("- commit creation is explicit while push and force push remain false");
