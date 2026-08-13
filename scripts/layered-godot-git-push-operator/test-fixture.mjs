import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  LayeredGodotGitPushOperatorError,
  canonicalSha256,
  inspectOrigin,
  pushLayeredGodotCommit,
  runGit,
} from "../layered-godot-git-push-operator.mjs";
import {
  EXPECTED_GIT_COMMIT_OPERATOR_PROTOCOL_VERSION,
  EXPECTED_GIT_COMMIT_RECEIPT_KIND,
} from "./contract.mjs";

const REPOSITORY = "EVAVO-STUDIO/TestGame";
const SAFE_ORIGIN = `https://github.com/${REPOSITORY}.git`;
const MESSAGE = "feat(art): integrate approved district resources";
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
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
  }).trim();
}
function gitBuffer(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: null,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
  });
}
function bareGit(remote, ...args) {
  return execFileSync("git", ["--git-dir", remote, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
  }).trim();
}

function resourceEntries() {
  return RESOURCE_PATHS.map((resourcePath, index) => {
    const content = index === 0
      ? `[gd_scene format=3]\n[node name="Root" type="Node2D"]\n`
      : `${JSON.stringify({ index, approved: true })}\n`;
    const data = Buffer.from(content, "utf8");
    return { path: resourcePath, data, sha256: sha(data), bytes: data.byteLength };
  });
}

async function writeResources(root, resources) {
  for (const resource of resources) {
    const target = path.join(root, ...resource.path.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, resource.data);
  }
}

function commitMetadata(root, commit) {
  const fields = gitBuffer(
    root,
    "show",
    "-s",
    "--format=%P%x00%T%x00%an%x00%ae%x00%cn%x00%ce%x00%cI%x00",
    commit,
  ).toString("utf8").split("\0");
  return {
    parent: fields[0],
    tree: fields[1],
    author: { name: fields[2], email: fields[3] },
    committer: { name: fields[4], email: fields[5] },
    committedAt: fields[6],
  };
}

function makeCommitReceipt(fx, overrides = {}) {
  const metadata = commitMetadata(fx.root, fx.commit);
  const stagedResources = fx.resources.map((resource) => ({
    path: resource.path,
    oid: git(fx.root, "rev-parse", `${fx.commit}:${resource.path}`),
    sha256: resource.sha256,
    bytes: resource.bytes,
  }));
  const payload = {
    schemaVersion: "1.0",
    kind: EXPECTED_GIT_COMMIT_RECEIPT_KIND,
    protocolVersion: EXPECTED_GIT_COMMIT_OPERATOR_PROTOCOL_VERSION,
    requestSha256: "a".repeat(64),
    integrationSha256: "b".repeat(64),
    writeReceiptSha256: "c".repeat(64),
    handoffGateSha256: "d".repeat(64),
    repositoryReviewSha256: "e".repeat(64),
    target: { expectedRepository: REPOSITORY, workspaceRoot: fx.realRoot },
    reviewedGit: {
      head: fx.parent,
      branch: "main",
      originRepository: REPOSITORY,
      snapshotSha256: "f".repeat(64),
    },
    outcome: "committed",
    commitMessage: MESSAGE,
    stagedResources,
    commit: {
      commit: fx.commit,
      parent: metadata.parent,
      tree: metadata.tree,
      branch: "main",
      author: metadata.author,
      committer: metadata.committer,
      committedAt: metadata.committedAt,
    },
    committedAt: "2026-08-13T01:00:00.000Z",
    authority: {
      targetRepositoryReadPerformed: true,
      targetRepositoryWorkingTreeMutationPerformed: false,
      gitObjectWritePerformed: true,
      gitIndexMutationPerformed: true,
      gitHookExecutionPerformed: false,
      gitCommitCreated: true,
      gitRefUpdated: true,
      gitPushPerformed: false,
      deploymentPerformed: false,
      publicationPerformed: false,
      forcePushPerformed: false,
    },
    ...overrides,
  };
  return { ...payload, receiptSha256: canonicalSha256(payload) };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-git-push-"));
  const remote = await mkdtemp(path.join(os.tmpdir(), "evavo-git-push-remote-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "tests@evavo.invalid");
  git(root, "config", "user.name", "EVAVO Tests");
  await writeFile(path.join(root, "README.md"), "baseline\n", "utf8");
  git(root, "add", "README.md");
  git(root, "commit", "-q", "-m", "baseline");
  execFileSync("git", ["init", "--bare", "-q", remote]);
  git(root, "remote", "add", "origin", remote);
  git(root, "push", "-q", "-u", "origin", "main");
  const parent = git(root, "rev-parse", "HEAD");
  const resources = resourceEntries();
  await writeResources(root, resources);
  git(root, "add", ...RESOURCE_PATHS);
  git(root, "commit", "-q", "-m", MESSAGE);
  const commit = git(root, "rev-parse", "HEAD");
  const realRoot = await realpath(root);
  const fx = { root, remote, parent, commit, realRoot, resources };
  fx.receipt = makeCommitReceipt(fx);
  return fx;
}

function mappedArgs(fx, args) {
  return args.map((entry) => entry === SAFE_ORIGIN ? fx.remote : entry);
}

async function runFixtureGit(fx, root, args, settings) {
  return runGit(root, mappedArgs(fx, args), settings);
}

function dependencies(fx, options = {}) {
  return {
    complete: true,
    inspectWorkspaceRoot: async () => ({ path: fx.root, realPath: fx.realRoot }),
    sameFilesystemPath: (a, b) => path.resolve(a) === path.resolve(b),
    resolveOrigin: async () => ({ url: SAFE_ORIGIN, repository: REPOSITORY }),
    runGit: options.runGit ?? ((root, args, settings) => runFixtureGit(fx, root, args, settings)),
  };
}

function input(fx, overrides = {}) {
  return {
    commitReceipt: fx.receipt,
    workspaceRoot: fx.root,
    expectedRepository: REPOSITORY,
    authorization: { push: true, forcePush: false, tags: false },
    ...overrides,
  };
}

async function cleanup(t, fx) {
  t.after(async () => {
    await rm(fx.root, { recursive: true, force: true });
    await rm(fx.remote, { recursive: true, force: true });
  });
}

async function expectCode(promise, code) {
  await assert.rejects(
    promise,
    (error) => error instanceof LayeredGodotGitPushOperatorError && error.code === code,
  );
}

function competingRemoteCommit(fx) {
  const tree = bareGit(fx.remote, "rev-parse", `${fx.parent}^{tree}`);
  const commit = execFileSync("git", ["--git-dir", fx.remote, "commit-tree", tree, "-p", fx.parent], {
    input: "competing remote commit\n",
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Remote Actor",
      GIT_AUTHOR_EMAIL: "remote@evavo.invalid",
      GIT_COMMITTER_NAME: "Remote Actor",
      GIT_COMMITTER_EMAIL: "remote@evavo.invalid",
    },
  }).trim();
  bareGit(fx.remote, "update-ref", "refs/heads/main", commit);
  return commit;
}

export {
  assert, access, chmod, path, writeFile,
  canonicalSha256, inspectOrigin, pushLayeredGodotCommit, runGit,
  REPOSITORY, SAFE_ORIGIN, MESSAGE, RESOURCE_PATHS,
  sha, git, bareGit, fixture, dependencies, input, cleanup, expectCode,
  competingRemoteCommit, makeCommitReceipt, runFixtureGit,
};
