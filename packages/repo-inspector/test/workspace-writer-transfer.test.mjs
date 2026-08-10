import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ArtWorkspaceWriterError,
  compileArtWorkspaceTransferBundle,
  writeArtWorkspaceTransferBundle,
} from "../dist/workspace-writer.js";

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lz7l4QAAAABJRU5ErkJggg==",
  "base64",
);

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-art-transfer-"));
  const workspace = path.join(root, "workspace");
  await mkdir(path.join(workspace, "reviewed"), { recursive: true });
  await writeFile(path.join(workspace, "reviewed/eva.png"), PNG_BYTES);
  return {
    root,
    workspace,
    policy: {
      allowedWorkspaceRoots: [root],
      allowWrites: true,
      maximumFileBytes: 32 * 1024 * 1024,
    },
  };
}

function baseRequest(workspace) {
  return {
    workspaceRoot: workspace,
    projectId: "evavo-avatar-runtime",
    sessionId: "eva-review-001",
    idempotencyKey: "eva-transfer-001",
    repository: {
      repositoryRoot: "C:\\GitRepos\\evavo-avatar-runtime",
      expectedHead: "1".repeat(40),
      branch: "agent/eva-reviewed-frames-001",
      commitMessage: "feat(avatar): add reviewed EVA frame",
      pushRequested: true,
    },
    storage: {
      vaultId: "evavo-art-source",
      logicalPrefix: "Avatar Runtime/EVA",
    },
    assets: [
      {
        assetId: "eva-reviewed-frame",
        source: "reviewed/eva.png",
        route: "auto",
        repositoryTarget: "assets/eva-female/reviewed/eva.png",
      },
    ],
  };
}

test("small reviewed assets compile to a path-only governed repository request", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const bundle = await compileArtWorkspaceTransferBundle(
    baseRequest(f.workspace),
    f.policy,
  );
  assert.deepEqual(bundle.decisions[0].selectedRoutes, ["repository"]);
  assert.equal(bundle.storageRequest, undefined);
  assert.equal(
    bundle.repositoryRequest.schema,
    "evavo.repository-asset-write-request.v1",
  );
  assert.equal(bundle.repositoryRequest.authority.repositoryWrite, false);
  assert.equal(bundle.repositoryRequest.authority.mainMutation, false);
  assert.equal(bundle.repositoryRequest.authority.forcePush, false);
  assert.equal(bundle.repositoryRequest.bytesFlowThroughMcp, false);
  assert.match(bundle.repositoryRequest.requestSha256, /^[a-f0-9]{64}$/u);
  assert.equal(bundle.compilePerformedWrites, false);
});

test("automatic routing sends oversized ordinary Git assets to EVAVO Storage", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const request = baseRequest(f.workspace);
  request.repositoryFileLimitBytes = 16;
  const bundle = await compileArtWorkspaceTransferBundle(request, f.policy);
  assert.deepEqual(bundle.decisions[0].selectedRoutes, ["storage"]);
  assert.equal(bundle.repositoryRequest, undefined);
  assert.equal(
    bundle.storageRequest.schema,
    "evavo.storage-art-ingest-request.v1",
  );
  assert.equal(bundle.storageRequest.authority.storageWrite, false);
  assert.equal(bundle.storageRequest.authority.repositoryMutation, false);
  assert.equal(bundle.storageRequest.bytesFlowThroughMcp, false);
  const receipt = await writeArtWorkspaceTransferBundle(bundle, f.policy);
  assert.equal(receipt.storageMutationPerformed, false);
  assert.equal(receipt.repositoryMutationPerformed, false);
  assert.equal(receipt.gitCommitCreated, false);
  assert.equal(receipt.gitPushPerformed, false);
  const storage = JSON.parse(
    await readFile(path.join(f.workspace, receipt.storageManifest), "utf8"),
  );
  assert.equal(storage.items[0].sha256, bundle.decisions[0].sha256);
  const firstBundleBytes = await readFile(
    path.join(f.workspace, receipt.bundleManifest),
  );
  await assert.rejects(
    writeArtWorkspaceTransferBundle(bundle, f.policy),
    (error) => {
      assert.ok(error instanceof ArtWorkspaceWriterError);
      assert.equal(error.code, "ART_WORKSPACE_TARGET_EXISTS");
      return true;
    },
  );
  assert.deepEqual(
    await readFile(path.join(f.workspace, receipt.bundleManifest)),
    firstBundleBytes,
  );
});

test("explicit repository routing never silently bypasses Git size limits", async (t) => {
  const f = await fixture();
  t.after(() => rm(f.root, { recursive: true, force: true }));
  const request = baseRequest(f.workspace);
  request.assets[0].route = "repository";
  request.repositoryFileLimitBytes = 16;
  await assert.rejects(
    compileArtWorkspaceTransferBundle(request, f.policy),
    (error) => {
      assert.ok(error instanceof ArtWorkspaceWriterError);
      assert.equal(
        error.code,
        "ART_WORKSPACE_TRANSFER_REPOSITORY_FILE_TOO_LARGE",
      );
      return true;
    },
  );
});
