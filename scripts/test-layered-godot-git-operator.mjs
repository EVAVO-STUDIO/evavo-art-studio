import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LayeredGodotGitOperatorError,
  canonicalSha256,
  commitLayeredGodotHandoff,
  runGit,
} from "./layered-godot-git-operator.mjs";
import {
  EXPECTED_REPOSITORY_REVIEW_PROTOCOL_VERSION,
  EXPECTED_REPOSITORY_REVIEW_RECEIPT_KIND,
} from "./layered-godot-git-operator/contract.mjs";

const REPOSITORY = "EVAVO-STUDIO/TestGame";
const REQUEST_SHA = "a".repeat(64);
const INTEGRATION_SHA = "b".repeat(64);
const WRITE_SHA = "c".repeat(64);
const HANDOFF_SHA = "d".repeat(64);
const SNAPSHOT_SHA = "e".repeat(64);
const ATTR_SHA = "f".repeat(64);
const RESOURCE_PATHS = [
  "game/generated/district.tscn",
  "game/generated/routes.json",
  "game/generated/placements.json",
  "game/generated/animations.json",
  "game/generated/cameras.json",
  "game/generated/import-policy.json",
  "game/generated/integration-manifest.json",
];

function sha(buffer) { return createHash("sha256").update(buffer).digest("hex"); }
function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
  }).trim();
}
function gitBuffer(cwd, ...args) {
  return execFileSync("git", args, {
    cwd, encoding: null, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
  });
}

function resources() {
  return RESOURCE_PATHS.map((resourcePath, index) => {
    const content = index === 0
      ? `[gd_scene format=3]\n[node name="Root" type="Node2D"]\n`
      : `${JSON.stringify({ index, approved: true })}\n`;
    const data = Buffer.from(content, "utf8");
    return { path: resourcePath, content, data, sha256: sha(data), bytes: data.byteLength };
  });
}

async function writeResources(root, entries) {
  for (const resource of entries) {
    const target = path.join(root, ...resource.path.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, resource.data);
  }
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-git-operator-"));
  const remote = await mkdtemp(path.join(os.tmpdir(), "evavo-git-operator-remote-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "tests@evavo.invalid");
  git(root, "config", "user.name", "EVAVO Tests");
  await writeFile(path.join(root, "README.md"), "baseline\n", "utf8");
  git(root, "add", "README.md");
  git(root, "commit", "-q", "-m", "baseline");
  execFileSync("git", ["init", "--bare", "-q", remote]);
  git(root, "remote", "add", "origin", remote);
  git(root, "push", "-q", "-u", "origin", "main");
  const realRoot = await realpath(root);
  const entries = resources();
  return { root, remote, realRoot, resources: entries, baselineHead: git(root, "rev-parse", "HEAD") };
}

function reviewAuthority() {
  return {
    targetRepositoryReadPerformed: true,
    targetRepositoryMutationPerformed: false,
    gitReadCommandsPerformed: true,
    gitIndexMutationPerformed: false,
    gitHookExecutionPerformed: false,
    gitCommitCreated: false,
    gitPushPerformed: false,
    deploymentPerformed: false,
    publicationPerformed: false,
    forcePushPerformed: false,
  };
}

function makeReview(fx, { modified = [], untracked = RESOURCE_PATHS, unchanged = [], reviewedAt = "2026-08-13T00:00:00.000Z", overrides = {} } = {}) {
  const changed = modified.length + untracked.length;
  const payload = {
    schemaVersion: "1.0",
    kind: EXPECTED_REPOSITORY_REVIEW_RECEIPT_KIND,
    protocolVersion: EXPECTED_REPOSITORY_REVIEW_PROTOCOL_VERSION,
    requestSha256: REQUEST_SHA,
    integrationSha256: INTEGRATION_SHA,
    writeReceiptSha256: WRITE_SHA,
    handoffGateSha256: HANDOFF_SHA,
    target: { expectedRepository: REPOSITORY, workspaceRoot: fx.realRoot },
    git: {
      version: git(fx.root, "--version"),
      repositoryRoot: fx.realRoot,
      objectFormat: "sha1",
      head: fx.baselineHead,
      branch: "main",
      originUrl: fx.remote,
      originRepository: REPOSITORY,
      attributesSha256: ATTR_SHA,
      snapshotSha256: SNAPSHOT_SHA,
    },
    workingTree: {
      stagedPaths: [],
      modifiedExpectedPaths: [...modified].sort(),
      untrackedExpectedPaths: [...untracked].sort(),
      unchangedExpectedPaths: [...unchanged].sort(),
      unrelatedPaths: [],
      expectedResources: 7,
      changedExpectedResources: changed,
    },
    readiness: {
      repositoryReviewPassed: true,
      commitRequired: changed > 0,
      commitCandidateReady: changed > 0,
      alreadyIntegrated: changed === 0,
      gitCommitAuthorized: false,
      gitPushAuthorized: false,
      requiresExplicitGitOperator: true,
    },
    reviewedAt,
    authority: reviewAuthority(),
    ...overrides,
  };
  return { ...payload, reviewSha256: canonicalSha256(payload) };
}

function operatorInput(fx, review, overrides = {}) {
  return {
    integrationPlan: { fixture: true },
    writeReceipt: { requestId: "write", revision: "1.0.0", receiptSha256: WRITE_SHA },
    auditReceipt: { fixture: true },
    runtimeValidationReceipt: { fixture: true },
    handoffReceipt: { gateSha256: HANDOFF_SHA },
    repositoryReviewReceipt: review,
    workspaceRoot: fx.root,
    expectedRepository: REPOSITORY,
    commitMessage: "feat(art): integrate approved district resources",
    authorization: { commit: true, push: false, forcePush: false },
    ...overrides,
  };
}

function dependencies(fx, currentReview, options = {}) {
  return {
    complete: true,
    writeRequestKind: "evavo.layered-production.godot-workspace-write-request",
    inspectWorkspaceRoot: async () => ({ path: fx.root, realPath: fx.realRoot }),
    sameFilesystemPath: (a, b) => path.resolve(a) === path.resolve(b),
    verifyWriteRequest: () => ({
      requestSha256: REQUEST_SHA,
      integration: { integrationSha256: INTEGRATION_SHA, resources: fx.resources },
    }),
    reviewRepository: async () => {
      if (options.beforeReviewReturn) await options.beforeReviewReturn(fx);
      return currentReview;
    },
    readStableRegularFile: async (filePath) => {
      if (options.beforeStableRead) await options.beforeStableRead(filePath, fx);
      const data = await readFile(filePath);
      return { data, bytes: data.byteLength, sha256: sha(data), identity: {} };
    },
    runGit: options.runGit ?? ((root, args, opts) => runGit(root, args, opts)),
  };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error instanceof LayeredGodotGitOperatorError && error.code === code);
}

async function cleanup(t, fx) {
  t.after(async () => {
    await rm(fx.root, { recursive: true, force: true });
    await rm(fx.remote, { recursive: true, force: true });
  });
}

test("creates one exact commit for seven reviewed untracked resources without pushing or hooks", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  await writeResources(fx.root, fx.resources);
  const hookSentinel = path.join(fx.root, "hook-ran.txt");
  const hook = path.join(fx.root, ".git", "hooks", "pre-commit");
  await writeFile(hook, `#!/usr/bin/env sh\nprintf hook > '${hookSentinel}'\n`, "utf8");
  await chmod(hook, 0o755);
  const review = makeReview(fx);
  const remoteBefore = git(fx.remote, "rev-parse", "refs/heads/main");
  const result = await commitLayeredGodotHandoff(operatorInput(fx, review), dependencies(fx, makeReview(fx, { reviewedAt: "2026-08-13T00:00:01.000Z" })));
  assert.equal(result.outcome, "committed");
  assert.equal(result.commit.parent, fx.baselineHead);
  assert.equal(result.commit.branch, "main");
  assert.equal(result.authority.gitCommitCreated, true);
  assert.equal(result.authority.gitPushPerformed, false);
  assert.equal(git(fx.root, "status", "--porcelain=v1"), "");
  assert.equal(git(fx.remote, "rev-parse", "refs/heads/main"), remoteBefore);
  await assert.rejects(access(hookSentinel));
  assert.deepEqual(git(fx.root, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").split("\n").filter(Boolean).sort(), [...RESOURCE_PATHS].sort());
  for (const resource of fx.resources) assert.deepEqual(gitBuffer(fx.root, "show", `HEAD:${resource.path}`), resource.data);
});

test("commits an exact mix of tracked modifications and new reviewed resources", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  await writeResources(fx.root, fx.resources);
  git(fx.root, "add", RESOURCE_PATHS[0], RESOURCE_PATHS[1]);
  git(fx.root, "commit", "-q", "-m", "seed resources");
  fx.baselineHead = git(fx.root, "rev-parse", "HEAD");
  await writeFile(path.join(fx.root, ...RESOURCE_PATHS[1].split("/")), Buffer.from('{"changed":true}\n'));
  const changedData = Buffer.from('{"changed":true}\n');
  fx.resources[1] = { ...fx.resources[1], content: changedData.toString(), data: changedData, sha256: sha(changedData), bytes: changedData.byteLength };
  const review = makeReview(fx, { modified: [RESOURCE_PATHS[1]], untracked: RESOURCE_PATHS.slice(2), unchanged: [RESOURCE_PATHS[0]] });
  const current = makeReview(fx, { modified: [RESOURCE_PATHS[1]], untracked: RESOURCE_PATHS.slice(2), unchanged: [RESOURCE_PATHS[0]], reviewedAt: "2026-08-13T00:00:02.000Z" });
  const result = await commitLayeredGodotHandoff(operatorInput(fx, review), dependencies(fx, current));
  assert.equal(result.commit.parent, fx.baselineHead);
  assert.deepEqual(git(fx.root, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD").split("\n").filter(Boolean).sort(), [RESOURCE_PATHS[1], ...RESOURCE_PATHS.slice(2)].sort());
});

test("returns a no-op receipt when all seven resources are already integrated", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  await writeResources(fx.root, fx.resources);
  git(fx.root, "add", ...RESOURCE_PATHS);
  git(fx.root, "commit", "-q", "-m", "integrated");
  fx.baselineHead = git(fx.root, "rev-parse", "HEAD");
  const review = makeReview(fx, { untracked: [], unchanged: RESOURCE_PATHS });
  const before = git(fx.root, "rev-parse", "HEAD");
  const result = await commitLayeredGodotHandoff(operatorInput(fx, review), dependencies(fx, makeReview(fx, { untracked: [], unchanged: RESOURCE_PATHS, reviewedAt: "2026-08-13T00:00:03.000Z" })));
  assert.equal(result.outcome, "already-integrated");
  assert.equal(result.commit, null);
  assert.equal(result.authority.gitCommitCreated, false);
  assert.equal(git(fx.root, "rev-parse", "HEAD"), before);
});

test("rejects push or force-push authority before touching Git", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  await writeResources(fx.root, fx.resources);
  const review = makeReview(fx);
  await expectCode(commitLayeredGodotHandoff(operatorInput(fx, review, { authorization: { commit: true, push: true, forcePush: false } }), dependencies(fx, review)), "LAYERED_GODOT_GIT_OPERATOR_AUTHORITY_INVALID");
  await expectCode(commitLayeredGodotHandoff(operatorInput(fx, review, { authorization: { commit: true, push: false, forcePush: true } }), dependencies(fx, review)), "LAYERED_GODOT_GIT_OPERATOR_AUTHORITY_INVALID");
  assert.equal(git(fx.root, "rev-parse", "HEAD"), fx.baselineHead);
});

test("rejects multiline commit messages before Git mutation", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  await writeResources(fx.root, fx.resources);
  const review = makeReview(fx);
  await expectCode(commitLayeredGodotHandoff(operatorInput(fx, review, { commitMessage: "bad\nmessage" }), dependencies(fx, review)), "LAYERED_GODOT_GIT_OPERATOR_INPUT_INVALID");
  assert.equal(git(fx.root, "diff", "--cached", "--name-only"), "");
});

test("rejects a correctly rehashed review receipt that escalates commit authority", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  await writeResources(fx.root, fx.resources);
  const bad = makeReview(fx, { overrides: { readiness: { ...makeReview(fx).readiness, gitCommitAuthorized: true } } });
  await expectCode(commitLayeredGodotHandoff(operatorInput(fx, bad), dependencies(fx, bad)), "LAYERED_GODOT_GIT_OPERATOR_REVIEW_INVALID");
});

test("rejects repository-review semantic drift before staging", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  await writeResources(fx.root, fx.resources);
  const review = makeReview(fx);
  const current = makeReview(fx, { untracked: RESOURCE_PATHS.slice(1), unchanged: [RESOURCE_PATHS[0]], reviewedAt: "2026-08-13T00:00:04.000Z" });
  await expectCode(commitLayeredGodotHandoff(operatorInput(fx, review), dependencies(fx, current)), "LAYERED_GODOT_GIT_OPERATOR_REVIEW_DRIFT");
  assert.equal(git(fx.root, "diff", "--cached", "--name-only"), "");
});

test("detects worktree drift after staging and restores the index only", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  await writeResources(fx.root, fx.resources);
  const review = makeReview(fx);
  let changed = false;
  const deps = dependencies(fx, makeReview(fx, { reviewedAt: "2026-08-13T00:00:05.000Z" }), {
    beforeStableRead: async (filePath) => {
      if (!changed && filePath.endsWith("district.tscn")) {
        changed = true;
        await writeFile(filePath, "external drift\n", "utf8");
      }
    },
  });
  await expectCode(commitLayeredGodotHandoff(operatorInput(fx, review), deps), "LAYERED_GODOT_GIT_OPERATOR_WORKTREE_DRIFT");
  assert.equal(git(fx.root, "rev-parse", "HEAD"), fx.baselineHead);
  assert.equal(git(fx.root, "diff", "--cached", "--name-only"), "");
  assert.equal(await readFile(path.join(fx.root, ...RESOURCE_PATHS[0].split("/")), "utf8"), "external drift\n");
});

test("stages exact raw bytes without invoking an active clean filter", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  const sentinel = path.join(fx.root, "filter-ran.txt");
  await writeFile(path.join(fx.root, ".gitattributes"), `${RESOURCE_PATHS[0]} filter=evil\n`, "utf8");
  git(fx.root, "config", "filter.evil.clean", `sh -c \"printf ran > '${sentinel}'; cat\"`);
  git(fx.root, "add", ".gitattributes");
  git(fx.root, "commit", "-q", "-m", "attributes");
  fx.baselineHead = git(fx.root, "rev-parse", "HEAD");
  await writeResources(fx.root, fx.resources);
  const review = makeReview(fx);
  await expectCode(commitLayeredGodotHandoff(operatorInput(fx, review), dependencies(fx, makeReview(fx, { reviewedAt: "2026-08-13T00:00:06.000Z" }))), "LAYERED_GODOT_GIT_OPERATOR_GIT_TRANSFORM_ACTIVE");
  await assert.rejects(access(sentinel));
  assert.equal(git(fx.root, "diff", "--cached", "--name-only"), "");
});

test("rolls back the staged index when commit identity is unavailable", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  await writeResources(fx.root, fx.resources);
  git(fx.root, "config", "--unset", "user.name");
  git(fx.root, "config", "--unset", "user.email");
  const review = makeReview(fx);
  await expectCode(commitLayeredGodotHandoff(operatorInput(fx, review), dependencies(fx, makeReview(fx, { reviewedAt: "2026-08-13T00:00:07.000Z" }))), "LAYERED_GODOT_GIT_OPERATOR_COMMIT_FAILED");
  assert.equal(git(fx.root, "rev-parse", "HEAD"), fx.baselineHead);
  assert.equal(git(fx.root, "diff", "--cached", "--name-only"), "");
});

test("detects HEAD drift between review and staged verification and rolls index back", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  await writeResources(fx.root, fx.resources);
  const review = makeReview(fx);
  let firstRun = true;
  const baseRun = (root, args, opts) => runGit(root, args, opts);
  const deps = dependencies(fx, makeReview(fx, { reviewedAt: "2026-08-13T00:00:08.000Z" }), {
    runGit: async (root, args, opts) => {
      if (firstRun && args[0] === "hash-object") {
        firstRun = false;
        await writeFile(path.join(fx.root, "race.txt"), "race\n", "utf8");
        git(fx.root, "add", "race.txt");
        git(fx.root, "commit", "-q", "-m", "race");
      }
      return baseRun(root, args, opts);
    },
  });
  await expectCode(commitLayeredGodotHandoff(operatorInput(fx, review), deps), "LAYERED_GODOT_GIT_OPERATOR_REPOSITORY_DRIFT");
  assert.equal(git(fx.root, "diff", "--cached", "--name-only"), "");
});

test("input snapshot rejects an accessor without invoking it", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  const review = makeReview(fx);
  let invoked = false;
  const input = operatorInput(fx, review);
  Object.defineProperty(input, "commitMessage", { enumerable: true, get() { invoked = true; return "bad"; } });
  await expectCode(commitLayeredGodotHandoff(input, dependencies(fx, review)), "LAYERED_GODOT_GIT_OPERATOR_INPUT_INVALID");
  assert.equal(invoked, false);
});

test("Git runner fails closed on output limits", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  const fake = path.join(fx.root, "fake-git.sh");
  await writeFile(fake, "#!/usr/bin/env sh\npython3 - <<'PY'\nprint('x'*10000)\nPY\n", "utf8");
  await chmod(fake, 0o755);
  await expectCode(runGit(fx.root, ["--version"], { gitExecutable: fake, maximumBytes: 128 }), "LAYERED_GODOT_GIT_OPERATOR_GIT_OUTPUT_LIMIT");
});

test("Git runner fails closed on timeout and terminates the process group", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  const fake = path.join(fx.root, "fake-git-timeout.sh");
  await writeFile(fake, "#!/usr/bin/env sh\nsleep 2\n", "utf8");
  await chmod(fake, 0o755);
  await expectCode(runGit(fx.root, ["--version"], { gitExecutable: fake, timeoutMs: 30 }), "LAYERED_GODOT_GIT_OPERATOR_GIT_TIMEOUT");
});

test("refuses rollback rather than overwriting a concurrent same-path index change", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  await writeResources(fx.root, fx.resources);
  const review = makeReview(fx);
  let injected = false;
  const baseRun = (root, args, opts) => runGit(root, args, opts);
  const externalData = Buffer.from("external index owner\n", "utf8");
  const deps = dependencies(fx, makeReview(fx, { reviewedAt: "2026-08-13T00:00:09.000Z" }), {
    runGit: async (root, args, opts) => {
      if (!injected && args[0] === "check-attr") {
        injected = true;
        const temp = path.join(fx.root, "external-index.bin");
        await writeFile(temp, externalData);
        const externalOid = git(fx.root, "hash-object", "-w", temp);
        git(fx.root, "update-index", "--add", "--cacheinfo", `100644,${externalOid},${RESOURCE_PATHS[0]}`);
        await rm(temp, { force: true });
      }
      return baseRun(root, args, opts);
    },
  });
  await expectCode(
    commitLayeredGodotHandoff(operatorInput(fx, review), deps),
    "LAYERED_GODOT_GIT_OPERATOR_ROLLBACK_FAILED",
  );
  assert.deepEqual(gitBuffer(fx.root, "show", `:${RESOURCE_PATHS[0]}`), externalData);
  assert.deepEqual(await readFile(path.join(fx.root, ...RESOURCE_PATHS[0].split("/"))), fx.resources[0].data);
});

test("preserves the exact authorized single-line commit message verbatim", async (t) => {
  const fx = await fixture();
  await cleanup(t, fx);
  await writeResources(fx.root, fx.resources);
  const review = makeReview(fx);
  const message = "# EVAVO exact governed handoff";
  const result = await commitLayeredGodotHandoff(
    operatorInput(fx, review, { commitMessage: message }),
    dependencies(fx, makeReview(fx, { reviewedAt: "2026-08-13T00:00:10.000Z" })),
  );
  assert.equal(result.commitMessage, message);
  assert.equal(git(fx.root, "show", "-s", "--format=%B", "HEAD"), message);
});
