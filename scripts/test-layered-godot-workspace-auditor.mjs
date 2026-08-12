#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  rm,
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
} from "./layered-godot-workspace-writer.mjs";
import {
  LAYERED_GODOT_WORKSPACE_AUDIT_RECEIPT_KIND,
  auditLayeredGodotWorkspace,
} from "./layered-godot-workspace-auditor.mjs";

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
    resource("route-graph", "game/assets/final/layered_district.route.json", "application/json", '{"kind":"route-graph","nodes":[]}\n'),
    resource("placements", "game/assets/final/layered_district.placements.json", "application/json", '{"kind":"placements","placements":[]}\n'),
    resource("animations", "game/assets/final/layered_district.animations.json", "application/json", '{"kind":"animations","sets":[]}\n'),
    resource("cameras", "game/assets/final/layered_district.cameras.json", "application/json", '{"kind":"cameras","modes":[]}\n'),
    resource("import-policy", "game/assets/final/layered_district.import-policy.json", "application/json", '{"kind":"import-policy","filter":"nearest"}\n'),
    resource("integration-manifest", "game/assets/final/layered_district.integration.json", "application/json", '{"kind":"integration-manifest","engine":"Godot","version":"4.6.2"}\n'),
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
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-layered-godot-auditor-"));
  const workspace = path.join(root, "workspace");
  await mkdir(workspace);
  try {
    await run({ root, workspace });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function assertWriterErrorCode(error, code) {
  assert.ok(error instanceof LayeredGodotWorkspaceWriterError);
  assert.equal(error.code, code);
  return true;
}

async function writeAndAudit(workspace, plan = buildPlan()) {
  const receipt = await applyLayeredGodotWorkspaceWriteRequest(requestFor(workspace, plan));
  const audit = await auditLayeredGodotWorkspace({
    integrationPlan: plan,
    writeReceipt: receipt,
    workspaceRoot: workspace,
    expectedRepository: REPOSITORY,
  });
  return { receipt, audit };
}

test("audits the exact seven written resources and emits a self-hashed read-only receipt", async () => {
  await withWorkspace(async ({ workspace }) => {
    const plan = buildPlan();
    const { receipt, audit } = await writeAndAudit(workspace, plan);
    assert.equal(audit.kind, LAYERED_GODOT_WORKSPACE_AUDIT_RECEIPT_KIND);
    assert.equal(audit.files.length, 7);
    assert.equal(audit.totals.resources, 7);
    assert.equal(audit.totals.bytes, plan.resources.reduce((sum, entry) => sum + entry.bytes, 0));
    assert.equal(audit.writeReceiptSha256, receipt.receiptSha256);
    assert.equal(audit.authority.fileWritePerformed, false);
    assert.equal(audit.authority.gitCommitCreated, false);
    assert.equal(audit.authority.gitPushPerformed, false);
    const { auditSha256, ...payload } = audit;
    assert.equal(auditSha256, canonicalSha256(payload));
  });
});

test("fails when an approved target changes after the recorded write", async () => {
  await withWorkspace(async ({ workspace }) => {
    const plan = buildPlan();
    const receipt = await applyLayeredGodotWorkspaceWriteRequest(requestFor(workspace, plan));
    const target = path.join(workspace, ...plan.resources[2].path.split("/"));
    await writeFile(target, '{"kind":"drift"}\n', "utf8");
    await assert.rejects(
      auditLayeredGodotWorkspace({ integrationPlan: plan, writeReceipt: receipt, workspaceRoot: workspace, expectedRepository: REPOSITORY }),
      (error) => assertWriterErrorCode(error, "LAYERED_GODOT_AUDIT_TARGET_DRIFT"),
    );
  });
});

test("fails when a rehashed receipt operation no longer matches the integration plan", async () => {
  await withWorkspace(async ({ workspace }) => {
    const plan = buildPlan();
    const receipt = structuredClone(await applyLayeredGodotWorkspaceWriteRequest(requestFor(workspace, plan)));
    receipt.operations[0].sha256 = "0".repeat(64);
    delete receipt.receiptSha256;
    receipt.receiptSha256 = canonicalSha256(receipt);
    await assert.rejects(
      auditLayeredGodotWorkspace({ integrationPlan: plan, writeReceipt: receipt, workspaceRoot: workspace, expectedRepository: REPOSITORY }),
      (error) => assertWriterErrorCode(error, "LAYERED_GODOT_AUDIT_RECEIPT_INVALID"),
    );
  });
});

test("fails when a stage or backup residue file remains beside an approved target", async () => {
  await withWorkspace(async ({ workspace }) => {
    const plan = buildPlan();
    const receipt = await applyLayeredGodotWorkspaceWriteRequest(requestFor(workspace, plan));
    const target = path.join(workspace, ...plan.resources[0].path.split("/"));
    await writeFile(path.join(path.dirname(target), ".layered_district.tscn.evavo-godot-stage-residue"), "residue", "utf8");
    await assert.rejects(
      auditLayeredGodotWorkspace({ integrationPlan: plan, writeReceipt: receipt, workspaceRoot: workspace, expectedRepository: REPOSITORY }),
      (error) => assertWriterErrorCode(error, "LAYERED_GODOT_AUDIT_RESIDUE_PRESENT"),
    );
  });
});

test("fails when the explicitly selected repository differs from the recorded plan", async () => {
  await withWorkspace(async ({ workspace }) => {
    const plan = buildPlan();
    const receipt = await applyLayeredGodotWorkspaceWriteRequest(requestFor(workspace, plan));
    await assert.rejects(
      auditLayeredGodotWorkspace({ integrationPlan: plan, writeReceipt: receipt, workspaceRoot: workspace, expectedRepository: "EVAVO-STUDIO/another-repository" }),
      (error) => assertWriterErrorCode(error, "LAYERED_GODOT_WRITE_REPOSITORY_MISMATCH"),
    );
  });
});

test("fails when an approved target gains a second hard link", async () => {
  await withWorkspace(async ({ workspace }) => {
    const plan = buildPlan();
    const receipt = await applyLayeredGodotWorkspaceWriteRequest(requestFor(workspace, plan));
    const target = path.join(workspace, ...plan.resources[0].path.split("/"));
    await link(target, path.join(path.dirname(target), "second-link.tscn"));
    await assert.rejects(
      auditLayeredGodotWorkspace({ integrationPlan: plan, writeReceipt: receipt, workspaceRoot: workspace, expectedRepository: REPOSITORY }),
      (error) => assertWriterErrorCode(error, "LAYERED_GODOT_WRITE_HARDLINK_REJECTED"),
    );
  });
});

test("auditor does not rewrite exact target bytes", async () => {
  await withWorkspace(async ({ workspace }) => {
    const plan = buildPlan();
    const receipt = await applyLayeredGodotWorkspaceWriteRequest(requestFor(workspace, plan));
    const before = await Promise.all(plan.resources.map((entry) => readFile(path.join(workspace, ...entry.path.split("/")))));
    await auditLayeredGodotWorkspace({ integrationPlan: plan, writeReceipt: receipt, workspaceRoot: workspace, expectedRepository: REPOSITORY });
    const after = await Promise.all(plan.resources.map((entry) => readFile(path.join(workspace, ...entry.path.split("/")))));
    assert.deepEqual(after, before);
  });
});
