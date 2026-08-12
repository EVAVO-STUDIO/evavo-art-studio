import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  EXPECTED_HANDOFF_GATE_RECEIPT_KIND,
  EXPECTED_HANDOFF_GATE_PROTOCOL_VERSION,
  LayeredGodotRepositoryReviewError,
  canonicalSha256,
  reviewLayeredGodotRepository,
  runGitReadOnly,
} from "./layered-godot-repository-review.mjs";

const REPOSITORY = "EVAVO-STUDIO/TestGame";
const REQUEST_SHA = "a".repeat(64);
const INTEGRATION_SHA = "b".repeat(64);
const WRITE_SHA = "c".repeat(64);
const AUDIT_SHA = "d".repeat(64);
const RUNTIME_SHA = "e".repeat(64);
const CURRENT_AUDIT_SHA = "f".repeat(64);
const RESOURCE_PATHS = [
  "game/generated/district.tscn",
  "game/generated/routes.json",
  "game/generated/placements.json",
  "game/generated/animations.json",
  "game/generated/cameras.json",
  "game/generated/import-policy.json",
  "game/generated/integration-manifest.json",
];

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

function authority() {
  return {
    targetRepositoryReadPerformed: true,
    targetRepositoryMutationPerformed: false,
    godotExecutionPerformed: false,
    runtimeActivationPerformed: false,
    gitCommitCreated: false,
    gitPushPerformed: false,
    deploymentPerformed: false,
    publicationPerformed: false,
    forcePushPerformed: false,
  };
}

function makeHandoff(root, overrides = {}) {
  const payload = {
    schemaVersion: "1.0",
    kind: EXPECTED_HANDOFF_GATE_RECEIPT_KIND,
    protocolVersion: EXPECTED_HANDOFF_GATE_PROTOCOL_VERSION,
    requestSha256: REQUEST_SHA,
    integrationSha256: INTEGRATION_SHA,
    writeReceiptSha256: WRITE_SHA,
    auditReceiptSha256: AUDIT_SHA,
    runtimeValidationSha256: RUNTIME_SHA,
    currentAuditSha256: CURRENT_AUDIT_SHA,
    target: { expectedRepository: REPOSITORY, workspaceRoot: root },
    readiness: {
      repositoryReviewReady: true,
      gitCommitAuthorized: false,
      gitPushAuthorized: false,
      requiresExplicitRepositoryReview: true,
      requiresExplicitGitOperator: true,
    },
    gatedAt: "2026-08-12T12:22:01.000Z",
    authority: authority(),
    ...overrides,
  };
  return { ...payload, gateSha256: canonicalSha256(payload) };
}

async function writeResources(root, resources) {
  for (const resource of resources) {
    const target = path.join(root, ...resource.path.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, resource.content, "utf8");
  }
}

function resources() {
  return RESOURCE_PATHS.map((entry, index) => ({
    path: entry,
    content: index === 0 ? `[gd_scene format=3]\n[node name="Root" type="Node2D"]\n` : `${JSON.stringify({ index, ok: true })}\n`,
  }));
}

async function fixture({ origin = `https://github.com/${REPOSITORY}.git`, ignorePath = null } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-repository-review-"));
  git(root, "init", "-q");
  git(root, "config", "user.email", "tests@evavo.invalid");
  git(root, "config", "user.name", "EVAVO Tests");
  await writeFile(path.join(root, "README.md"), "baseline\n", "utf8");
  if (ignorePath) await writeFile(path.join(root, ".gitignore"), `${ignorePath}\n`, "utf8");
  git(root, "add", "README.md", ...(ignorePath ? [".gitignore"] : []));
  git(root, "commit", "-q", "-m", "baseline");
  git(root, "remote", "add", "origin", origin);
  const realRoot = await realpath(root);
  return { root, realRoot, resources: resources() };
}

function dependencies(fixtureValue, suppliedHandoff, options = {}) {
  let gateCalls = 0;
  return {
    complete: true,
    writeRequestKind: "evavo.layered-production.godot-workspace-write-request",
    inspectWorkspaceRoot: async () => ({ path: fixtureValue.root, realPath: fixtureValue.realRoot }),
    sameFilesystemPath: (left, right) => path.resolve(left) === path.resolve(right),
    verifyWriteRequest: () => ({
      requestSha256: REQUEST_SHA,
      integration: {
        integrationSha256: INTEGRATION_SHA,
        resources: fixtureValue.resources.map((entry) => ({ ...entry })),
      },
    }),
    gateHandoff: async () => {
      gateCalls += 1;
      if (options.onGateCall) await options.onGateCall(gateCalls, fixtureValue);
      const recomputed = makeHandoff(fixtureValue.realRoot, {
        currentAuditSha256: `${gateCalls}`.padStart(64, "0"),
        gatedAt: `2026-08-12T12:2${gateCalls}:01.000Z`,
      });
      return recomputed;
    },
    runGit: (workspaceRoot, args) => runGitReadOnly(workspaceRoot, args),
  };
}

function input(fixtureValue, handoffReceipt) {
  return {
    integrationPlan: { fixture: true },
    writeReceipt: { requestId: "write", revision: "1.0.0", receiptSha256: WRITE_SHA },
    auditReceipt: { fixture: true },
    runtimeValidationReceipt: { fixture: true },
    handoffReceipt,
    workspaceRoot: fixtureValue.root,
    expectedRepository: REPOSITORY,
  };
}

async function expectCode(promise, code) {
  await assert.rejects(
    promise,
    (error) => error instanceof LayeredGodotRepositoryReviewError && error.code === code,
  );
}

test("reviews an exact seven-file untracked handoff without staging or mutation", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  await writeResources(fx.root, fx.resources);
  const handoff = makeHandoff(fx.realRoot);
  const result = await reviewLayeredGodotRepository(input(fx, handoff), dependencies(fx, handoff));
  assert.equal(result.readiness.repositoryReviewPassed, true);
  assert.equal(result.readiness.commitCandidateReady, true);
  assert.equal(result.readiness.gitCommitAuthorized, false);
  assert.equal(result.readiness.gitPushAuthorized, false);
  assert.deepEqual(result.workingTree.modifiedExpectedPaths, []);
  assert.deepEqual(result.workingTree.untrackedExpectedPaths, [...RESOURCE_PATHS].sort());
  assert.deepEqual(result.workingTree.unchangedExpectedPaths, []);
  assert.equal(result.authority.gitIndexMutationPerformed, false);
  assert.equal(result.authority.gitHookExecutionPerformed, false);
  assert.equal(result.reviewSha256, canonicalSha256(Object.fromEntries(Object.entries(result).filter(([key]) => key !== "reviewSha256"))));
  assert.equal(git(fx.root, "diff", "--cached", "--name-only"), "");
  assert.equal(git(fx.root, "ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean).length, 7);
});

test("allows only exact expected tracked modifications, untracked files and unchanged resources", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  await writeResources(fx.root, fx.resources);
  git(fx.root, "add", RESOURCE_PATHS[0], RESOURCE_PATHS[1]);
  git(fx.root, "commit", "-q", "-m", "seed two resources");
  await writeFile(path.join(fx.root, ...RESOURCE_PATHS[1].split("/")), `${JSON.stringify({ index: 1, ok: true, changed: true })}\n`, "utf8");
  fx.resources[1] = { ...fx.resources[1], content: `${JSON.stringify({ index: 1, ok: true, changed: true })}\n` };
  const handoff = makeHandoff(fx.realRoot);
  const result = await reviewLayeredGodotRepository(input(fx, handoff), dependencies(fx, handoff));
  assert.deepEqual(result.workingTree.modifiedExpectedPaths, [RESOURCE_PATHS[1]]);
  assert.deepEqual(result.workingTree.unchangedExpectedPaths, [RESOURCE_PATHS[0]]);
  assert.equal(result.workingTree.untrackedExpectedPaths.length, 5);
});

test("rejects unrelated tracked or untracked changes", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  await writeResources(fx.root, fx.resources);
  await writeFile(path.join(fx.root, "README.md"), "unrelated change\n", "utf8");
  const handoff = makeHandoff(fx.realRoot);
  await expectCode(
    reviewLayeredGodotRepository(input(fx, handoff), dependencies(fx, handoff)),
    "LAYERED_GODOT_REPOSITORY_REVIEW_UNRELATED_CHANGES_PRESENT",
  );
});

test("rejects any staged change, including an expected handoff path", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  await writeResources(fx.root, fx.resources);
  git(fx.root, "add", RESOURCE_PATHS[0]);
  const handoff = makeHandoff(fx.realRoot);
  await expectCode(
    reviewLayeredGodotRepository(input(fx, handoff), dependencies(fx, handoff)),
    "LAYERED_GODOT_REPOSITORY_REVIEW_STAGED_CHANGES_PRESENT",
  );
});

test("rejects an expected resource hidden by ignore rules", async (t) => {
  const fx = await fixture({ ignorePath: RESOURCE_PATHS[2] });
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  await writeResources(fx.root, fx.resources);
  const handoff = makeHandoff(fx.realRoot);
  await expectCode(
    reviewLayeredGodotRepository(input(fx, handoff), dependencies(fx, handoff)),
    "LAYERED_GODOT_REPOSITORY_REVIEW_EXPECTED_PATH_NOT_ADMISSIBLE",
  );
});

test("rejects a Git origin that is not the selected repository", async (t) => {
  const fx = await fixture({ origin: "git@github.com:EVAVO-STUDIO/OtherGame.git" });
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  await writeResources(fx.root, fx.resources);
  const handoff = makeHandoff(fx.realRoot);
  await expectCode(
    reviewLayeredGodotRepository(input(fx, handoff), dependencies(fx, handoff)),
    "LAYERED_GODOT_REPOSITORY_REVIEW_ORIGIN_MISMATCH",
  );
});

test("rejects detached HEAD", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  await writeResources(fx.root, fx.resources);
  git(fx.root, "checkout", "-q", "--detach", "HEAD");
  const handoff = makeHandoff(fx.realRoot);
  await expectCode(
    reviewLayeredGodotRepository(input(fx, handoff), dependencies(fx, handoff)),
    "LAYERED_GODOT_REPOSITORY_REVIEW_DETACHED_HEAD",
  );
});

test("detects branch drift during the review window", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  await writeResources(fx.root, fx.resources);
  const handoff = makeHandoff(fx.realRoot);
  await expectCode(
    reviewLayeredGodotRepository(
      input(fx, handoff),
      dependencies(fx, handoff, {
        onGateCall: async (count) => {
          if (count === 2) git(fx.root, "checkout", "-q", "-b", "review-race");
        },
      }),
    ),
    "LAYERED_GODOT_REPOSITORY_REVIEW_REPOSITORY_DRIFT",
  );
});

test("rejects a rehashed handoff receipt that escalates Git authority", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  await writeResources(fx.root, fx.resources);
  const handoff = makeHandoff(fx.realRoot, {
    readiness: {
      repositoryReviewReady: true,
      gitCommitAuthorized: true,
      gitPushAuthorized: false,
      requiresExplicitRepositoryReview: true,
      requiresExplicitGitOperator: true,
    },
  });
  await expectCode(
    reviewLayeredGodotRepository(input(fx, handoff), dependencies(fx, handoff)),
    "LAYERED_GODOT_REPOSITORY_REVIEW_HANDOFF_INVALID",
  );
});

test("read-only Git runner rejects mutating subcommands", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  await expectCode(
    runGitReadOnly(fx.root, ["commit", "-m", "nope"]),
    "LAYERED_GODOT_REPOSITORY_REVIEW_GIT_COMMAND_REJECTED",
  );
});

test("read-only Git runner fails closed on timeout", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  const fakeGit = path.join(fx.root, "fake-git.sh");
  await writeFile(fakeGit, "#!/usr/bin/env bash\nsleep 1\nprintf 'git version 2.0.0\\n'\n", { encoding: "utf8", mode: 0o755 });
  await expectCode(
    runGitReadOnly(fx.root, ["--version"], { gitExecutable: fakeGit, timeoutMs: 30 }),
    "LAYERED_GODOT_REPOSITORY_REVIEW_GIT_TIMEOUT",
  );
});

test("read-only Git runner rejects mutating argument forms of allowed subcommands", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  await expectCode(
    runGitReadOnly(fx.root, ["config", "--local", "user.name", "mutated"]),
    "LAYERED_GODOT_REPOSITORY_REVIEW_GIT_COMMAND_REJECTED",
  );
  await expectCode(
    runGitReadOnly(fx.root, ["branch", "-D", "main"]),
    "LAYERED_GODOT_REPOSITORY_REVIEW_GIT_COMMAND_REJECTED",
  );
  assert.equal(git(fx.root, "config", "user.name"), "EVAVO Tests");
});

test("rejects active Git clean-filter attributes on an expected resource", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  await writeFile(path.join(fx.root, ".gitattributes"), `${RESOURCE_PATHS[0]} filter=evil\n`, "utf8");
  git(fx.root, "add", ".gitattributes");
  git(fx.root, "commit", "-q", "-m", "add attributes");
  await writeResources(fx.root, fx.resources);
  const handoff = makeHandoff(fx.realRoot);
  await expectCode(
    reviewLayeredGodotRepository(input(fx, handoff), dependencies(fx, handoff)),
    "LAYERED_GODOT_REPOSITORY_REVIEW_GIT_TRANSFORM_ACTIVE",
  );
});

test("rejects carriage-return resource content before exact-byte staging claims", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  fx.resources[0] = { ...fx.resources[0], content: "[gd_scene format=3]\r\n[node name=\"Root\" type=\"Node2D\"]\r\n" };
  await writeResources(fx.root, fx.resources);
  const handoff = makeHandoff(fx.realRoot);
  await expectCode(
    reviewLayeredGodotRepository(input(fx, handoff), dependencies(fx, handoff)),
    "LAYERED_GODOT_REPOSITORY_REVIEW_NONCANONICAL_LINE_ENDINGS",
  );
});

test("read-only Git runner fails closed on output overflow", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  const fakeGit = path.join(fx.root, "fake-git-output.sh");
  await writeFile(fakeGit, "#!/usr/bin/env bash\nprintf '%04096d\\n' 0\n", { encoding: "utf8", mode: 0o755 });
  await expectCode(
    runGitReadOnly(fx.root, ["--version"], { gitExecutable: fakeGit, maximumOutputBytes: 128 }),
    "LAYERED_GODOT_REPOSITORY_REVIEW_GIT_OUTPUT_LIMIT",
  );
});

test("marks an idempotent fully committed handoff as already integrated instead of commit-ready", async (t) => {
  const fx = await fixture();
  t.after(() => rm(fx.root, { recursive: true, force: true }));
  await writeResources(fx.root, fx.resources);
  git(fx.root, "add", ...RESOURCE_PATHS);
  git(fx.root, "commit", "-q", "-m", "integrate handoff");
  const handoff = makeHandoff(fx.realRoot);
  const result = await reviewLayeredGodotRepository(input(fx, handoff), dependencies(fx, handoff));
  assert.equal(result.readiness.repositoryReviewPassed, true);
  assert.equal(result.readiness.commitRequired, false);
  assert.equal(result.readiness.commitCandidateReady, false);
  assert.equal(result.readiness.alreadyIntegrated, true);
  assert.equal(result.workingTree.changedExpectedResources, 0);
  assert.equal(result.workingTree.unchangedExpectedPaths.length, 7);
});
