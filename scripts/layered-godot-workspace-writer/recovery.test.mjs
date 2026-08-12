import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LAYERED_GODOT_INTEGRATION_PLAN_KIND,
  LAYERED_GODOT_INTEGRATION_PROTOCOL_VERSION,
  LAYERED_GODOT_WORKSPACE_WRITE_REQUEST_KIND,
  LayeredGodotWorkspaceSimulatedInterruption,
  LayeredGodotWorkspaceWriterError,
  applyLayeredGodotWorkspaceWriteRequest,
  canonicalSha256,
  recoverLayeredGodotWorkspace,
} from "../layered-godot-workspace-writer.mjs";

const REPOSITORY = "EVAVO-STUDIO/GodotGameFoundationKit";
const kinds = [
  ["scene-draft", "game/scenes/world/recovery.tscn", "text/plain"],
  ["route-graph", "game/assets/final/recovery.route.json", "application/json"],
  ["placements", "game/assets/final/recovery.placements.json", "application/json"],
  ["animations", "game/assets/final/recovery.animations.json", "application/json"],
  ["cameras", "game/assets/final/recovery.cameras.json", "application/json"],
  ["import-policy", "game/assets/final/recovery.import-policy.json", "application/json"],
  ["integration-manifest", "game/assets/final/recovery.integration.json", "application/json"],
];

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function buildPlan() {
  const resources = kinds.map(([kind, filePath, mediaType], index) => {
    const content =
      kind === "scene-draft"
        ? '[gd_scene load_steps=1 format=3]\n\n[node name="Recovery" type="Node2D"]\n'
        : `${JSON.stringify({ kind, index })}\n`;
    return { kind, path: filePath, mediaType, content, bytes: Buffer.byteLength(content), sha256: sha256(content) };
  });
  const plan = {
    schemaVersion: "1.0",
    kind: LAYERED_GODOT_INTEGRATION_PLAN_KIND,
    protocolVersion: LAYERED_GODOT_INTEGRATION_PROTOCOL_VERSION,
    integrationId: "recovery-godot",
    revision: "1.0.0",
    requestSha256: "a".repeat(64),
    productionPlan: { planId: "recovery", planSha256: "b".repeat(64), targetRepository: REPOSITORY, runtimeRoot: "game/assets/final", engine: "Godot", engineVersion: "4.6.2" },
    assembly: { assemblyId: "recovery-runtime", manifestSha256: "c".repeat(64), scope: "runtime-candidate", runtimeReady: true, candidateOnly: false },
    target: { engine: "Godot", engineVersion: "4.6.2", renderer: "gl_compatibility", runtimeRoot: "game/assets/final", rootNodeName: "Recovery", rootNodeType: "Node2D" },
    outputs: {
      scenePath: resources[0].path,
      routeResourcePath: resources[1].path,
      placementResourcePath: resources[2].path,
      animationResourcePath: resources[3].path,
      cameraResourcePath: resources[4].path,
      importPolicyPath: resources[5].path,
      integrationManifestPath: resources[6].path,
    },
    scene: { path: resources[0].path, rootNodeName: "Recovery", nodes: [], tscnDraft: resources[0].content, tscnSha256: resources[0].sha256, tscnBytes: resources[0].bytes },
    resources,
    writeIntents: resources.map((entry) => ({ operation: "create-or-replace", path: entry.path, mediaType: entry.mediaType, sha256: entry.sha256, bytes: entry.bytes, content: entry.content, requiresExplicitRepositoryWriter: true, expectedRepository: REPOSITORY })),
    readiness: { handoffReady: true, reviewOnly: false, requiresExplicitRepositoryWriter: true, runtimeActivationRequired: true, blockers: [] },
    authority: { planningOnly: true, artifactRead: false, fileWrite: false, targetRepositoryMutation: false, runtimeActivation: false, deployment: false, gitCommit: false, gitPush: false, publication: false },
  };
  plan.integrationSha256 = canonicalSha256(plan);
  return plan;
}
function request(workspace, plan = buildPlan()) {
  return { schemaVersion: "1.0", kind: LAYERED_GODOT_WORKSPACE_WRITE_REQUEST_KIND, requestId: "recovery-write", revision: "1.0.0", expectedRepository: REPOSITORY, workspaceRoot: workspace, integrationPlan: plan };
}
async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-recovery-"));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace);
  try { await run(workspace); } finally { await rm(root, { recursive: true, force: true }); }
}
async function interrupt(workspace, phase, plan = buildPlan()) {
  await assert.rejects(
    applyLayeredGodotWorkspaceWriteRequest(request(workspace, plan), { interruptAfterPhase: phase }),
    (error) => error instanceof LayeredGodotWorkspaceSimulatedInterruption,
  );
  return plan;
}

for (const phase of ["intent", "prepared", "target-linked:0"]) {
  test(`recovery safely rolls back interruption after ${phase}`, async () => {
    await fixture(async (workspace) => {
      const plan = await interrupt(workspace, phase);
      await assert.rejects(
        applyLayeredGodotWorkspaceWriteRequest(request(workspace, plan)),
        (error) => error instanceof LayeredGodotWorkspaceWriterError && error.code === "LAYERED_GODOT_WRITE_RECOVERY_REQUIRED",
      );
      const receipt = await recoverLayeredGodotWorkspace({ workspaceRoot: workspace, expectedRepository: REPOSITORY });
      assert.equal(receipt.totals.recovered, 1);
      assert.equal(receipt.authority.gitPushPerformed, false);
      if (phase === "target-linked:0") {
        await assert.rejects(readFile(path.join(workspace, ...plan.resources[0].path.split("/"))), { code: "ENOENT" });
      }
    });
  });
}

test("recovery restores a replacement interrupted after backup movement", async () => {
  await fixture(async (workspace) => {
    const plan = buildPlan();
    const target = path.join(workspace, ...plan.resources[0].path.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "prior-scene\n", "utf8");
    await interrupt(workspace, "backup-moved:0", plan);
    await recoverLayeredGodotWorkspace({ workspaceRoot: workspace, expectedRepository: REPOSITORY });
    assert.equal(await readFile(target, "utf8"), "prior-scene\n");
  });
});

test("post-finalizing recovery completes the approved transaction forward", async () => {
  await fixture(async (workspace) => {
    const plan = await interrupt(workspace, "finalizing");
    const receipt = await recoverLayeredGodotWorkspace({ workspaceRoot: workspace, expectedRepository: REPOSITORY });
    assert.equal(receipt.totals.completedForward, 1);
    for (const entry of plan.resources) {
      assert.equal(await readFile(path.join(workspace, ...entry.path.split("/")), "utf8"), entry.content);
    }
  });
});

test("recovery is repository-bound", async () => {
  await fixture(async (workspace) => {
    await interrupt(workspace, "prepared");
    await assert.rejects(
      recoverLayeredGodotWorkspace({ workspaceRoot: workspace, expectedRepository: "EVAVO-STUDIO/not-the-target" }),
      (error) => error instanceof LayeredGodotWorkspaceWriterError,
    );
    const receipt = await recoverLayeredGodotWorkspace({ workspaceRoot: workspace, expectedRepository: REPOSITORY });
    assert.equal(receipt.totals.recovered, 1);
  });
});
