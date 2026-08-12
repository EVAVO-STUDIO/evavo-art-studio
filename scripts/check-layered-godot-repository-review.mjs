#!/usr/bin/env node

import assert from "node:assert/strict";
import { lstatSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "scripts/layered-godot-repository-review.mjs",
  "scripts/layered-godot-repository-review/contract.mjs",
  "scripts/layered-godot-repository-review/git-readonly.mjs",
  "scripts/test-layered-godot-repository-review.mjs",
  "scripts/check-layered-godot-repository-review.mjs",
  "config/layered-production-godot-repository-review.v1.json",
  "docs/LAYERED_GODOT_REPOSITORY_REVIEW.md",
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

const orchestration = source.get("scripts/layered-godot-repository-review.mjs");
for (const token of [
  'snapshotJsonValue(input, "repositoryReviewInput")',
  "captureDependencies",
  "captureWorkspaceRoot",
  "captureVerifiedWriteRequest",
  "dependenciesCapturedBeforeAsyncBoundary: true",
  "exactHandoffReceiptContract: true",
  "unsupportedInputFieldsRejected: true",
  "gateLayeredGodotHandoff",
  "verifyLayeredGodotWorkspaceWriteRequest",
  "commitRequired: changedExpectedResources > 0",
  "alreadyIntegrated: changedExpectedResources === 0",
  "gitCommitAuthorized: false",
  "gitPushAuthorized: false",
  "gitIndexMutationPerformed: false",
  "gitHookExecutionPerformed: false",
  "forcePushPerformed: false",
]) {
  assert.ok(orchestration.includes(token), `orchestration missing ${token}`);
}
for (const forbidden of [
  "git add ",
  "git commit ",
  "git push ",
  "--force-with-lease",
  "shell: true",
]) {
  assert.equal(
    orchestration.includes(forbidden),
    false,
    `orchestration contains forbidden ${forbidden}`,
  );
}

const contract = source.get("scripts/layered-godot-repository-review/contract.mjs");
for (const token of [
  'LAYERED_GODOT_REPOSITORY_REVIEW_PROTOCOL_VERSION = "2026-08-13.1"',
  "evavo.layered-production.godot-repository-review-receipt",
  "evavo.layered-production.godot-handoff-gate-receipt",
  "HANDOFF_RECEIPT_KEYS",
  "snapshotJsonValue",
  "utilTypes.isProxy",
  "contains unsupported field",
  "admissionAuditSha256",
  "immutableInputSnapshot",
  "exactAuditReceiptContract",
  "exactRuntimeReceiptContract",
  "unsupportedReceiptFieldsRejected",
  "targetStableAcrossGate",
  "admissionAuditSha256: _admissionAudit",
  "currentAuditSha256: _currentAudit",
  "HANDOFF_INVALID",
  "HANDOFF_DRIFT",
  "gitCommitAuthorized",
  "gitPushAuthorized",
]) {
  assert.ok(contract.includes(token), `contract missing ${token}`);
}

const git = source.get("scripts/layered-godot-repository-review/git-readonly.mjs");
for (const token of [
  "GIT_OPTIONAL_LOCKS",
  "core.fsmonitor",
  "--no-ext-diff",
  "--no-textconv",
  "check-attr",
  "working-tree-encoding",
  "GIT_TRANSFORM_ACTIVE",
  "STAGED_CHANGES_PRESENT",
  "UNRELATED_CHANGES_PRESENT",
  "ORIGIN_MISMATCH",
  "DETACHED_HEAD",
  "EXPECTED_PATH_NOT_ADMISSIBLE",
]) {
  assert.ok(git.includes(token), `Git reviewer missing ${token}`);
}
for (const forbidden of [
  'spawn("git", ["add"',
  'spawn("git", ["commit"',
  'spawn("git", ["push"',
  "git add ",
  "git commit ",
  "git push ",
  "git reset ",
  "git checkout ",
  "git restore ",
  "--force-with-lease",
  "shell: true",
]) {
  assert.equal(git.includes(forbidden), false, `Git reviewer contains forbidden ${forbidden}`);
}

const config = JSON.parse(
  source.get("config/layered-production-godot-repository-review.v1.json"),
);
assert.equal(config.schema, "evavo.layered-production.godot-repository-review.v1");
assert.equal(config.protocolVersion, "2026-08-13.1");
assert.equal(config.requirements.requiresImmutableInputSnapshotBeforeAsyncBoundary, true);
assert.equal(config.requirements.rejectsUnsupportedInputFields, true);
assert.equal(config.requirements.rejectsAccessorsAndProxyInputs, true);
assert.equal(config.requirements.capturesDependencyOverridesBeforeAsyncBoundary, true);
assert.equal(config.requirements.requiresExactHandoffReceiptContract, true);
assert.equal(config.requirements.requiresHandoffImmutableInputAdmissionEvidence, true);
assert.equal(config.requirements.rejectsUnsupportedHandoffReceiptFields, true);
assert.equal(config.requirements.treatsFreshAuditHashesAsVolatileSemanticEvidence, true);
assert.equal(config.requirements.requiresExactGitRepositoryRoot, true);
assert.equal(config.requirements.requiresEmptyGitIndex, true);
assert.equal(config.requirements.requiresRepeatedStableGitSnapshot, true);
assert.equal(config.requirements.gitOptionalLocksDisabled, true);
assert.equal(config.requirements.gitFsMonitorDisabled, true);
assert.equal(config.admission.immutableInputSnapshot, true);
assert.equal(config.admission.exactHandoffReceiptContract, true);
assert.equal(config.admission.unsupportedInputFieldsRejected, true);
assert.equal(config.admission.dependenciesCapturedBeforeAsyncBoundary, true);
assert.equal(config.readiness.gitCommitAuthorized, false);
assert.equal(config.readiness.gitPushAuthorized, false);
assert.equal(config.authority.gitStage, false);
assert.equal(config.authority.gitHookExecution, false);
assert.equal(config.authority.gitCommit, false);
assert.equal(config.authority.gitPush, false);
assert.equal(config.authority.forcePush, false);

const docs = source.get("docs/LAYERED_GODOT_REPOSITORY_REVIEW.md");
for (const token of [
  "does **not** prove",
  "bounded immutable JSON snapshot",
  "Getters are never invoked",
  "Exact handoff receipt re-admission",
  "immutableInputSnapshot: true",
  "admissionAuditSha256",
  "point-in-time evidence",
  "GIT_OPTIONAL_LOCKS=0",
  "--no-ext-diff --no-textconv",
  "prevents empty commits",
  "gitCommitAuthorized: false",
  "gitPushAuthorized: false",
  "separate explicit Git operator",
]) {
  assert.ok(docs.includes(token), `repository review docs missing ${token}`);
}

const workflow = source.get(".github/workflows/layered-godot-workspace-writer.yml");
for (const token of [
  "scripts/layered-godot-repository-review.mjs",
  "scripts/layered-godot-repository-review/**",
  "scripts/test-layered-godot-repository-review.mjs",
  "scripts/check-layered-godot-repository-review.mjs",
  "config/layered-production-godot-repository-review.v1.json",
  "docs/LAYERED_GODOT_REPOSITORY_REVIEW.md",
  "node scripts/check-layered-godot-repository-review.mjs",
]) {
  assert.ok(workflow.includes(token), `workflow missing ${token}`);
}

const tests = spawnSync(
  process.execPath,
  ["--test", path.join(root, "scripts/test-layered-godot-repository-review.mjs")],
  {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  },
);
if (tests.stdout) process.stdout.write(tests.stdout);
if (tests.stderr) process.stderr.write(tests.stderr);
assert.equal(tests.status, 0, "repository review tests failed");

console.log("Layered Godot repository review contract passed.");
console.log("- caller-owned review input is captured before asynchronous work");
console.log("- handoff receipts are admitted through one exact closed contract");
console.log("- fresh audit hashes do not create false semantic drift");
console.log("- repository review remains read-only and grants no Git authority");
