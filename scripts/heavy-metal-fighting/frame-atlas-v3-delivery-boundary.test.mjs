import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  HMF_FRAME_ATLAS_V3_PLAN_SCHEMA,
  HMF_FRAME_ATLAS_V3_PROTOCOL_VERSION,
  publishHmfFrameAtlasV3DeliveryPlanFile,
  snapshotHmfFrameAtlasV3CompileRequest,
  verifyHmfFrameAtlasV3DeliveryPlanForPublication,
} from "./frame-atlas-v3-delivery.mjs";

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
  }
  return value;
}

function hashValue(value) {
  return createHash("sha256")
    .update(`${JSON.stringify(sortObject(value), null, 2)}\n`)
    .digest("hex");
}

function batchIndexForSlot(slot) {
  return slot < 144 ? Math.floor(slot / 9) : 16 + Math.floor((slot - 144) / 8);
}

function syntheticPlan(workspaceRoot) {
  const sources = Array.from({ length: 224 }, (_, slot) => ({
    slot,
    row: Math.floor(slot / 16),
    column: slot % 16,
    x: (slot % 16) * 160,
    y: Math.floor(slot / 16) * 160,
    width: 160,
    height: 160,
    bankId: `bank-${String(batchIndexForSlot(slot)).padStart(2, "0")}`,
    productionGroup: "frame-animation",
    unitId: `hmf.frame-animation.bastion.slot-${String(slot).padStart(3, "0")}`,
    batchId: `hmf-b${String(batchIndexForSlot(slot) + 1).padStart(4, "0")}`,
    workOrderSha256: "a".repeat(64),
    headReceiptSha256: "b".repeat(64),
    masterRelativePath: `masters/frames/bastion/sprites/bastion-c${String(slot).padStart(3, "0")}.png`,
    sourcePath: path.join(workspaceRoot, "masters", "frames", "bastion", "sprites", `bastion-c${String(slot).padStart(3, "0")}.png`),
    sourceBytes: 128,
    sourceSha256: "c".repeat(64),
  }));

  const batchEvidence = [];
  let offset = 0;
  for (let batchIndex = 0; batchIndex < 26; batchIndex += 1) {
    const count = batchIndex < 16 ? 9 : 8;
    const unitReceiptHeads = sources.slice(offset, offset + count).map((source) => ({
      unitId: source.unitId,
      headReceiptSha256: source.headReceiptSha256,
    }));
    batchEvidence.push({
      batchId: `hmf-b${String(batchIndex + 1).padStart(4, "0")}`,
      workOrderBatchSha256: "d".repeat(64),
      completedUnits: count,
      unitReceiptHeads,
    });
    offset += count;
  }
  assert.equal(offset, 224);

  const body = {
    schema: HMF_FRAME_ATLAS_V3_PLAN_SCHEMA,
    protocolVersion: HMF_FRAME_ATLAS_V3_PROTOCOL_VERSION,
    projectId: "heavy-metal-fighting",
    publicTitle: "HEAVY METAL FIGHTING",
    frameId: "bastion",
    compiledAt: "2026-08-14T08:00:00.000Z",
    registrySha256: "e".repeat(64),
    layoutSha256: "f".repeat(64),
    deliveryContractSha256: "1".repeat(64),
    styleProofExecutionSha256: "2".repeat(64),
    styleProofApproval: { id: "style-proof-approved", actorClass: "human" },
    workspaceRoot,
    allowedSourceRoot: path.join(workspaceRoot, "masters", "frames", "bastion", "sprites"),
    productionMaster: {
      contractId: "production_master_v3",
      cell: { width: 160, height: 160 },
      authoringCell: { width: 640, height: 640 },
      pivot: { x: 80, y: 152 },
      columns: 16,
      rows: 16,
      atlas: { width: 2560, height: 2560 },
      slotsPerFrame: 256,
      authoredSlotsPerFrame: 224,
      reservedSlots: { start: 224, end: 255, count: 32, requiredAlpha: "fully-transparent" },
      canonicalFormat: "png",
      resampling: "none",
      runtimeFiltering: "nearest-neighbour",
    },
    sources,
    reservedSlots: Array.from({ length: 32 }, (_, index) => 224 + index),
    batchEvidence,
    outputs: {
      image: "bastion.png",
      manifest: "bastion.atlas-v3.json",
      receipt: "bastion.atlas-v3.receipt.json",
      recommendedWorkspaceParent: "exports/runtime/frames/bastion",
    },
    gameTarget: {
      repository: "EVAVO-STUDIO/steel-dominion",
      technicalId: "steel-dominion",
      contractId: "production_master_v3",
      imagePath: "res://assets/fighters/final-v3/bastion.png",
      activationReady: false,
      activationBlockers: [
        "focused-godot-atlas-v3-validation",
        "runtime-cutover-validation",
        "explicit-game-repository-delivery-authorization",
      ],
    },
    authority: {
      sourceRead: true,
      workspaceExportWrite: true,
      sourceMutation: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      forcePush: false,
      namedHumanApprovalRequired: true,
    },
    createOnlyOutput: true,
    atomicWorkspacePublication: true,
  };
  return { ...body, planSha256: hashValue(body) };
}

function compileRequest() {
  return {
    frameId: "bastion",
    workspaceRoot: "/tmp/hmf-workspace",
    frameReceipts: [{ batchId: "hmf-b0001", state: "delivery-ready" }],
    styleProofApprovalRecords: [{ id: "style-proof-approved" }],
    styleProofReceipts: [{ state: "approved" }],
    compiledAt: "2026-08-14T08:00:00.000Z",
  };
}

test("atlas compiler captures an owned immutable request before asynchronous repository and workspace work", () => {
  const request = compileRequest();
  const captured = snapshotHmfFrameAtlasV3CompileRequest(request);
  request.frameId = "viper";
  request.frameReceipts[0].state = "mutated";
  request.styleProofApprovalRecords.push({ id: "attacker" });
  assert.equal(captured.frameId, "bastion");
  assert.equal(captured.frameReceipts[0].state, "delivery-ready");
  assert.equal(captured.styleProofApprovalRecords.length, 1);
  assert.equal(Object.isFrozen(captured), true);
  assert.equal(Object.isFrozen(captured.frameReceipts), true);
  assert.equal(Object.isFrozen(captured.frameReceipts[0]), true);
});

test("atlas compiler admission rejects accessors without invoking them, proxies, symbols and unsupported fields", () => {
  let getterCalled = false;
  const accessor = compileRequest();
  Object.defineProperty(accessor, "frameId", {
    enumerable: true,
    get() {
      getterCalled = true;
      return "bastion";
    },
  });
  assert.throws(
    () => snapshotHmfFrameAtlasV3CompileRequest(accessor),
    /frameId may not be an accessor/,
  );
  assert.equal(getterCalled, false);
  assert.throws(
    () => snapshotHmfFrameAtlasV3CompileRequest(new Proxy(compileRequest(), {})),
    /may not be a Proxy/,
  );
  const symbolic = compileRequest();
  symbolic[Symbol("authority")] = true;
  assert.throws(() => snapshotHmfFrameAtlasV3CompileRequest(symbolic), /symbolic properties/);
  assert.throws(
    () => snapshotHmfFrameAtlasV3CompileRequest({ ...compileRequest(), deploymentAuthorized: true }),
    /unsupported field deploymentAuthorized/,
  );
});

test("atlas plan publication is exact-byte, create-only, atomic, workspace-confined and independently self-hashed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hmf-atlas-v3-publication-"));
  const outputParent = path.join(root, "manifests", "delivery");
  const output = path.join(outputParent, "bastion-atlas-v3-plan.json");
  try {
    await mkdir(outputParent, { recursive: true });
    const plan = syntheticPlan(root);
    const receipt = await publishHmfFrameAtlasV3DeliveryPlanFile(plan, output);
    const bytes = await readFile(output);
    const info = await lstat(output);
    assert.deepEqual(bytes, Buffer.from(`${JSON.stringify(plan, null, 2)}\n`, "utf8"));
    assert.equal(info.isFile(), true);
    assert.equal(info.isSymbolicLink(), false);
    assert.equal(info.nlink, 1);
    assert.equal(receipt.planSha256, plan.planSha256);
    assert.equal(receipt.bytes, bytes.length);
    assert.equal(receipt.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.match(receipt.publicationSha256, /^[0-9a-f]{64}$/);
    assert.equal(receipt.authority.targetRepositoryMutation, false);
    assert.equal(receipt.authority.gitMutation, false);
    assert.equal(receipt.authority.publication, false);
    assert.equal(
      (await verifyHmfFrameAtlasV3DeliveryPlanForPublication(plan)).status,
      "passed",
    );
    await assert.rejects(
      publishHmfFrameAtlasV3DeliveryPlanFile(plan, output),
      /destination already exists/,
    );
    const leftovers = (await import("node:fs/promises")).readdir(outputParent).then((names) => names.filter((name) => name.endsWith(".tmp")));
    assert.deepEqual(await leftovers, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("atlas plan publication rejects correctly rehashed authority escalation and invented plan claims", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hmf-atlas-v3-authority-"));
  try {
    await mkdir(path.join(root, "manifests", "delivery"), { recursive: true });
    const original = syntheticPlan(root);
    const { planSha256: _originalHash, ...body } = original;
    body.authority = { ...body.authority, targetRepositoryMutation: true };
    const escalated = { ...body, planSha256: hashValue(body) };
    await assert.rejects(
      publishHmfFrameAtlasV3DeliveryPlanFile(
        escalated,
        path.join(root, "manifests", "delivery", "escalated.json"),
      ),
      /targetRepositoryMutation must remain false/,
    );

    const { planSha256: _hash, ...known } = original;
    const inventedBody = { ...known, deploymentAuthorization: "granted" };
    const invented = { ...inventedBody, planSha256: hashValue(inventedBody) };
    await assert.rejects(
      publishHmfFrameAtlasV3DeliveryPlanFile(
        invented,
        path.join(root, "manifests", "delivery", "invented.json"),
      ),
      /fields must be exactly/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("atlas plan publication cross-binds every source to its exact batch and receipt evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hmf-atlas-v3-evidence-binding-"));
  try {
    await mkdir(path.join(root, "manifests", "delivery"), { recursive: true });
    const original = syntheticPlan(root);
    const { planSha256: _hash, ...body } = original;
    body.sources = body.sources.map((source, index) => (
      index === 0
        ? { ...source, batchId: "hmf-b9999", headReceiptSha256: "9".repeat(64) }
        : source
    ));
    const substituted = { ...body, planSha256: hashValue(body) };
    await assert.rejects(
      publishHmfFrameAtlasV3DeliveryPlanFile(
        substituted,
        path.join(root, "manifests", "delivery", "substituted-evidence.json"),
      ),
      /batchId disagrees with batch evidence|receipt head disagrees with batch evidence/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("atlas plan publication rejects output outside the workspace and symbolic output directories", { skip: process.platform === "win32" }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hmf-atlas-v3-output-root-"));
  const external = await mkdtemp(path.join(os.tmpdir(), "hmf-atlas-v3-output-external-"));
  try {
    const plan = syntheticPlan(root);
    await assert.rejects(
      publishHmfFrameAtlasV3DeliveryPlanFile(plan, path.join(external, "outside.json")),
      /inside the persistent Artist Workspace/,
    );
    await mkdir(path.join(root, "manifests"), { recursive: true });
    await symlink(external, path.join(root, "manifests", "delivery"), "dir");
    await assert.rejects(
      publishHmfFrameAtlasV3DeliveryPlanFile(
        plan,
        path.join(root, "manifests", "delivery", "symlink.json"),
      ),
      /non-symlink directory/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(external, { recursive: true, force: true });
  }
});
