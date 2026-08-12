#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LAYERED_GODOT_INTEGRATION_PLAN_KIND,
  LAYERED_GODOT_INTEGRATION_PROTOCOL_VERSION,
  LAYERED_GODOT_WORKSPACE_WRITE_REQUEST_KIND,
  LayeredGodotWorkspaceWriterError,
  applyLayeredGodotWorkspaceWriteRequest,
  canonicalSha256,
  verifyLayeredGodotWorkspaceWriteRequest,
} from "./layered-godot-workspace-writer.mjs";

const REPOSITORY = "EVAVO-STUDIO/GodotGameFoundationKit";

function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function resource(kind, filePath, mediaType, content) {
  return {
    kind,
    path: filePath,
    mediaType,
    content,
    bytes: Buffer.byteLength(content, "utf8"),
    sha256: sha256(content),
  };
}

function rehash(plan) {
  const copy = structuredClone(plan);
  delete copy.integrationSha256;
  copy.integrationSha256 = canonicalSha256(copy);
  return copy;
}

function buildPlan(repository = REPOSITORY) {
  const resources = [
    resource(
      "scene-draft",
      "game/scenes/world/layered_district.tscn",
      "text/plain",
      '[gd_scene load_steps=1 format=3]\n\n[node name="LayeredDistrict" type="Node2D"]\n',
    ),
    resource(
      "route-graph",
      "game/assets/final/layered_district.route.json",
      "application/json",
      '{"kind":"route-graph","nodes":[]}\n',
    ),
    resource(
      "placements",
      "game/assets/final/layered_district.placements.json",
      "application/json",
      '{"kind":"placements","placements":[]}\n',
    ),
    resource(
      "animations",
      "game/assets/final/layered_district.animations.json",
      "application/json",
      '{"kind":"animations","sets":[]}\n',
    ),
    resource(
      "cameras",
      "game/assets/final/layered_district.cameras.json",
      "application/json",
      '{"kind":"cameras","modes":[]}\n',
    ),
    resource(
      "import-policy",
      "game/assets/final/layered_district.import-policy.json",
      "application/json",
      '{"kind":"import-policy","filter":"nearest"}\n',
    ),
    resource(
      "integration-manifest",
      "game/assets/final/layered_district.integration.json",
      "application/json",
      '{"kind":"integration-manifest","engine":"Godot","version":"4.6.2"}\n',
    ),
  ];
  const plan = {
    schemaVersion: "1.0",
    kind: LAYERED_GODOT_INTEGRATION_PLAN_KIND,
    protocolVersion: LAYERED_GODOT_INTEGRATION_PROTOCOL_VERSION,
    integrationId: "layered-district-godot",
    revision: "1.0.0",
    requestSha256: "a".repeat(64),
    productionPlan: {
      planId: "layered-district",
      planSha256: "b".repeat(64),
      targetRepository: repository,
      runtimeRoot: "game/assets/final",
      engine: "Godot",
      engineVersion: "4.6.2",
    },
    assembly: {
      assemblyId: "layered-district-runtime",
      manifestSha256: "c".repeat(64),
      scope: "runtime-candidate",
      runtimeReady: true,
      candidateOnly: false,
    },
    target: {
      engine: "Godot",
      engineVersion: "4.6.2",
      renderer: "gl_compatibility",
      runtimeRoot: "game/assets/final",
      rootNodeName: "LayeredDistrict",
      rootNodeType: "Node2D",
    },
    outputs: {
      scenePath: resources[0].path,
      routeResourcePath: resources[1].path,
      placementResourcePath: resources[2].path,
      animationResourcePath: resources[3].path,
      cameraResourcePath: resources[4].path,
      importPolicyPath: resources[5].path,
      integrationManifestPath: resources[6].path,
    },
    scene: {
      path: resources[0].path,
      rootNodeName: "LayeredDistrict",
      nodes: [],
      tscnDraft: resources[0].content,
      tscnSha256: resources[0].sha256,
      tscnBytes: resources[0].bytes,
    },
    resources,
    writeIntents: resources.map((entry) => ({
      operation: "create-or-replace",
      path: entry.path,
      mediaType: entry.mediaType,
      sha256: entry.sha256,
      bytes: entry.bytes,
      content: entry.content,
      requiresExplicitRepositoryWriter: true,
      expectedRepository: repository,
    })),
    readiness: {
      handoffReady: true,
      reviewOnly: false,
      requiresExplicitRepositoryWriter: true,
      runtimeActivationRequired: true,
      blockers: [],
    },
    authority: {
      planningOnly: true,
      artifactRead: false,
      fileWrite: false,
      targetRepositoryMutation: false,
      runtimeActivation: false,
      deployment: false,
      gitCommit: false,
      gitPush: false,
      publication: false,
    },
  };
  return rehash(plan);
}

function requestFor(workspaceRoot, plan = buildPlan(), repository = REPOSITORY) {
  return {
    schemaVersion: "1.0",
    kind: LAYERED_GODOT_WORKSPACE_WRITE_REQUEST_KIND,
    requestId: "layered-district-write",
    revision: "1.0.0",
    expectedRepository: repository,
    workspaceRoot,
    integrationPlan: plan,
  };
}

async function withWorkspace(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-layered-godot-writer-"));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace);
  try {
    await run({ root, workspace });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function seedWorkspace(workspace, resources, transform = (entry) => entry.content) {
  for (const entry of resources) {
    const target = path.join(workspace, ...entry.path.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, transform(entry), "utf8");
  }
}

async function hiddenTransactionFiles(root) {
  const found = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const current = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(current);
      } else if (
        entry.name.includes(".evavo-godot-stage-") ||
        entry.name.includes(".evavo-godot-backup-")
      ) {
        found.push(current);
      }
    }
  }
  await visit(root);
  return found;
}

function assertWriterError(error, code) {
  assert.ok(error instanceof LayeredGodotWorkspaceWriterError);
  assert.equal(error.code, code);
  return true;
}

test("writes seven exact drafts, replays idempotently, and replaces stale ordinary files", async () => {
  await withWorkspace(async ({ workspace }) => {
    const plan = buildPlan();
    const request = requestFor(workspace, plan);

    const first = await applyLayeredGodotWorkspaceWriteRequest(request);
    assert.deepEqual(first.totals, {
      resources: 7,
      created: 7,
      replaced: 0,
      unchanged: 0,
      bytes: plan.resources.reduce((total, entry) => total + entry.bytes, 0),
    });
    assert.equal(first.authority.exactFileWritePerformed, true);
    assert.equal(first.authority.gitCommitCreated, false);
    assert.equal(first.authority.gitPushPerformed, false);
    assert.equal(first.authority.runtimeActivationPerformed, false);
    const { receiptSha256, ...receiptPayload } = first;
    assert.equal(receiptSha256, canonicalSha256(receiptPayload));

    for (const entry of plan.resources) {
      const target = path.join(workspace, ...entry.path.split("/"));
      assert.equal(await readFile(target, "utf8"), entry.content);
    }

    const replay = await applyLayeredGodotWorkspaceWriteRequest(request);
    assert.equal(replay.totals.created, 0);
    assert.equal(replay.totals.replaced, 0);
    assert.equal(replay.totals.unchanged, 7);
    assert.equal(replay.authority.exactFileWritePerformed, false);

    const stale = plan.resources[2];
    const staleTarget = path.join(workspace, ...stale.path.split("/"));
    await writeFile(staleTarget, '{"kind":"stale"}\n', "utf8");
    const repaired = await applyLayeredGodotWorkspaceWriteRequest(request);
    assert.equal(repaired.totals.created, 0);
    assert.equal(repaired.totals.replaced, 1);
    assert.equal(repaired.totals.unchanged, 6);
    assert.equal(await readFile(staleTarget, "utf8"), stale.content);
    assert.deepEqual(await hiddenTransactionFiles(workspace), []);
  });
});

test("verification rejects tampering, review-only plans, and repository drift", async () => {
  await withWorkspace(async ({ workspace }) => {
    const plan = buildPlan();

    const tampered = structuredClone(plan);
    tampered.resources[1].content = '{"kind":"tampered"}\n';
    assert.throws(
      () => verifyLayeredGodotWorkspaceWriteRequest(requestFor(workspace, tampered)),
      (error) => assertWriterError(error, "LAYERED_GODOT_WRITE_PLAN_INVALID"),
    );

    const reviewOnly = structuredClone(plan);
    reviewOnly.assembly.scope = "style-proof-review";
    reviewOnly.assembly.runtimeReady = false;
    reviewOnly.assembly.candidateOnly = true;
    reviewOnly.readiness.handoffReady = false;
    reviewOnly.readiness.reviewOnly = true;
    reviewOnly.readiness.blockers = ["approval required"];
    const reviewOnlyHashed = rehash(reviewOnly);
    assert.throws(
      () =>
        verifyLayeredGodotWorkspaceWriteRequest(
          requestFor(workspace, reviewOnlyHashed),
        ),
      (error) => assertWriterError(error, "LAYERED_GODOT_WRITE_NOT_READY"),
    );

    assert.throws(
      () =>
        verifyLayeredGodotWorkspaceWriteRequest(
          requestFor(workspace, plan, "EVAVO-STUDIO/another-repository"),
        ),
      (error) =>
        assertWriterError(error, "LAYERED_GODOT_WRITE_REPOSITORY_MISMATCH"),
    );
  });
});

test("rejects traversal, symbolic parents, and multiply-linked targets", async () => {
  await withWorkspace(async ({ root, workspace }) => {
    const traversal = structuredClone(buildPlan());
    traversal.resources[0].path = "../outside.tscn";
    traversal.outputs.scenePath = "../outside.tscn";
    traversal.scene.path = "../outside.tscn";
    traversal.writeIntents[0].path = "../outside.tscn";
    const traversalHashed = rehash(traversal);
    assert.throws(
      () =>
        verifyLayeredGodotWorkspaceWriteRequest(
          requestFor(workspace, traversalHashed),
        ),
      (error) => assertWriterError(error, "LAYERED_GODOT_WRITE_PATH_INVALID"),
    );

    const external = path.join(root, "external");
    await mkdir(external);
    await symlink(external, path.join(workspace, "game"), "dir");
    await assert.rejects(
      applyLayeredGodotWorkspaceWriteRequest(requestFor(workspace)),
      (error) => assertWriterError(error, "LAYERED_GODOT_WRITE_SYMLINK_REJECTED"),
    );
    assert.deepEqual(await readdir(external), []);
  });

  await withWorkspace(async ({ workspace }) => {
    const plan = buildPlan();
    const target = path.join(workspace, ...plan.resources[0].path.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "old scene\n", "utf8");
    await link(target, path.join(path.dirname(target), "second-link.tscn"));
    await assert.rejects(
      applyLayeredGodotWorkspaceWriteRequest(requestFor(workspace, plan)),
      (error) => assertWriterError(error, "LAYERED_GODOT_WRITE_HARDLINK_REJECTED"),
    );
    assert.equal(await readFile(target, "utf8"), "old scene\n");
  });
});

test("a late target change rolls back every earlier replacement", async () => {
  await withWorkspace(async ({ workspace }) => {
    const plan = buildPlan();
    const oldContent = new Map(
      plan.resources.map((entry, index) => [entry.path, `old-${index}\n`]),
    );
    await seedWorkspace(workspace, plan.resources, (entry) => oldContent.get(entry.path));

    let caught;
    try {
      await applyLayeredGodotWorkspaceWriteRequest(requestFor(workspace, plan), {
        beforeCommitOperation: async ({ index, target }) => {
          if (index === plan.resources.length - 1) {
            await writeFile(target, "external-race\n", "utf8");
          }
        },
      });
    } catch (error) {
      caught = error;
    }
    assertWriterError(caught, "LAYERED_GODOT_WRITE_ROLLED_BACK");
    assert.equal(caught.details.originalCode, "LAYERED_GODOT_WRITE_STALE_TARGET");

    for (const [index, entry] of plan.resources.entries()) {
      const target = path.join(workspace, ...entry.path.split("/"));
      assert.equal(
        await readFile(target, "utf8"),
        index === plan.resources.length - 1
          ? "external-race\n"
          : oldContent.get(entry.path),
      );
    }
    assert.deepEqual(await hiddenTransactionFiles(workspace), []);
  });
});
