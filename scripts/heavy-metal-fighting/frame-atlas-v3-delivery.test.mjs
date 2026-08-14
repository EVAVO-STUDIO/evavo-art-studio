import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildHmfFrameAtlasV3Layout,
  compileHmfFrameAtlasV3DeliveryPlan,
  validateHmfFrameAtlasV3MasterRoot,
  verifyHmfFrameAtlasV3Delivery,
} from "./frame-atlas-v3-delivery.mjs";
import {
  buildHmfFrameMoveBodyChoreography,
  verifyHmfFrameMoveBodyChoreography,
} from "./frame-move-body-choreography.mjs";

const FRAMES = ["bastion", "viper", "citadel", "mirage"];
const MOTION_IDENTITIES = {
  bastion: "hydraulic-weight",
  viper: "razor-snap",
  citadel: "containment-brace",
  mirage: "phase-drift",
};

test("frame atlas-v3 delivery covers all four 224-cel production masters without repacking semantics", async () => {
  const layouts = await Promise.all(FRAMES.map((frameId) => buildHmfFrameAtlasV3Layout(frameId)));
  const allUnits = new Set();
  for (const layout of layouts) {
    assert.equal(layout.frameId, FRAMES[layouts.indexOf(layout)]);
    assert.equal(layout.productionMaster.contractId, "production_master_v3");
    assert.deepEqual(layout.productionMaster.cell, { width: 160, height: 160 });
    assert.deepEqual(layout.productionMaster.authoringCell, { width: 640, height: 640 });
    assert.deepEqual(layout.productionMaster.pivot, { x: 80, y: 152 });
    assert.deepEqual(layout.productionMaster.atlas, { width: 2560, height: 2560 });
    assert.equal(layout.productionMaster.columns, 16);
    assert.equal(layout.productionMaster.rows, 16);
    assert.equal(layout.productionMaster.slotsPerFrame, 256);
    assert.equal(layout.productionMaster.authoredSlotsPerFrame, 224);
    assert.equal(layout.slots.length, 224);
    assert.equal(layout.bodyBatchIds.length, 26);
    assert.match(layout.roleGrammarSha256, /^[0-9a-f]{64}$/);
    assert.match(layout.roleMapSha256, /^[0-9a-f]{64}$/);
    assert.equal(layout.frameMotionRealization.motionIdentity, MOTION_IDENTITIES[layout.frameId]);
    assert.ok(layout.frameMotionRealization.bodyRules.length >= 4);
    assert.equal(typeof layout.frameMotionRealization.recoveryRule, "string");
    assert.equal(typeof layout.frameMotionRealization.fxSeparation, "string");
    assert.deepEqual(layout.reservedSlots, Array.from({ length: 32 }, (_, index) => 224 + index));
    assert.equal(layout.gameTargetPath, `res://assets/fighters/final-v3/${layout.frameId}.png`);
    assert.equal(layout.authority.targetRepositoryMutation, false);
    assert.equal(layout.authority.gitMutation, false);
    for (const [index, slot] of layout.slots.entries()) {
      assert.equal(slot.slot, index);
      assert.equal(slot.row, Math.floor(index / 16));
      assert.equal(slot.column, index % 16);
      assert.equal(slot.x, (index % 16) * 160);
      assert.equal(slot.y, Math.floor(index / 16) * 160);
      assert.equal(slot.width, 160);
      assert.equal(slot.height, 160);
      assert.equal(typeof slot.bodyRole.semanticId, "string");
      assert.equal(typeof slot.bodyRole.roleId, "string");
      assert.equal(typeof slot.bodyRole.phase, "string");
      assert.equal(typeof slot.bodyRole.hero, "boolean");
      assert.equal(typeof slot.bodyRole.contactRole, "boolean");
      assert.equal(typeof slot.bodyRole.holdPriority, "string");
      assert.match(slot.masterRelativePath, new RegExp(`^masters/frames/${layout.frameId}/sprites/${layout.frameId}-`));
      assert.equal(allUnits.has(slot.unitId), false, `duplicate body unit ${slot.unitId}`);
      allUnits.add(slot.unitId);
    }
    assert.equal(layout.slots[121].bodyRole.semanticId, "standing-heavy:hero-impact");
    assert.equal(layout.slots[121].bodyRole.hero, true);
    assert.equal(layout.slots[121].bodyRole.contactRole, true);
    assert.equal(layout.slots[184].bodyRole.semanticId, "overdrive:super-primary-impact");
    assert.equal(layout.slots[184].bodyRole.holdPriority, "hero");
    assert.equal(layout.slots[192].bodyRole.semanticId, "system-down:core-zero-warning");
    assert.equal(layout.slots[212].bodyRole.semanticId, "victory:victory-recognition");
    assert.equal(layout.slots[223].bodyRole.semanticId, "defeat:defeat-loop-bridge");
  }
  assert.equal(allUnits.size, 896);
});

test("frame atlas-v3 delivery verification locks geometry, role grammar, target path and authority boundary", async () => {
  const verification = await verifyHmfFrameAtlasV3Delivery();
  assert.equal(verification.status, "passed");
  assert.equal(verification.layouts.length, 4);
  assert.ok(verification.checks.every((check) => check.passed));
  assert.equal(verification.failed.length, 0);
  assert.equal(verification.bodyRoleVerification.status, "passed");
  assert.equal(verification.bodyRoleVerification.roleBindings, 896);
  assert.equal(verification.layouts.find((layout) => layout.frameId === "bastion")?.motionIdentity, "hydraulic-weight");
  assert.equal(verification.layouts.find((layout) => layout.frameId === "mirage")?.motionIdentity, "phase-drift");
  assert.equal(verification.authority.workspaceExportWrite, true);
  assert.equal(verification.authority.targetRepositoryMutation, false);
  assert.equal(verification.authority.publication, false);
});

test("named Frame moves bind to production body banks and exact role choreography without claiming game timing authority", async () => {
  const [verification, ...frames] = await Promise.all([
    verifyHmfFrameMoveBodyChoreography(),
    ...FRAMES.map((frameId) => buildHmfFrameMoveBodyChoreography(frameId)),
  ]);
  assert.equal(verification.status, "passed");
  assert.equal(verification.frameCount, 4);
  assert.equal(verification.moveCount, 44);
  assert.ok(verification.runtimeImplementedCount > 0);
  assert.ok(verification.plannedCount > 0);
  assert.ok(verification.checks.every((check) => check.passed));

  for (const frame of frames) {
    assert.equal(frame.moves.length, 11);
    assert.equal(frame.byCategory.normals.length, 6);
    assert.equal(frame.byCategory.specials.length, 2);
    assert.ok(frame.byCategory.reversal);
    assert.ok(frame.byCategory.overdrive);
    assert.ok(frame.byCategory.throw);
    assert.ok(Object.values(frame.namedHighOutput).every(Boolean));
    assert.equal(frame.authority.simulationTiming, false);
    assert.equal(frame.authority.hitboxesDamageAndInputs, false);
    assert.equal(frame.authority.workOrderMutation, false);
    assert.equal(frame.authority.targetRepositoryMutation, false);

    const specialA = frame.moves.find((move) => move.productionBodyBank === "special-a");
    const specialB = frame.moves.find((move) => move.productionBodyBank === "special-b");
    const reversal = frame.moves.find((move) => move.productionBodyBank === "reversal");
    const overdrive = frame.moves.find((move) => move.productionBodyBank === "overdrive");
    const standingHeavy = frame.moves.find((move) => move.productionBodyBank === "standing-heavy");
    const throwMove = frame.moves.find((move) => move.category === "throw");

    assert.deepEqual(specialA.productionBodySlotRange, { start: 150, end: 159, count: 10 });
    assert.deepEqual(specialB.productionBodySlotRange, { start: 160, end: 169, count: 10 });
    assert.deepEqual(reversal.productionBodySlotRange, { start: 170, end: 177, count: 8 });
    assert.deepEqual(overdrive.productionBodySlotRange, { start: 178, end: 191, count: 14 });
    assert.equal(standingHeavy.heroBodyRole.slot, 121);
    assert.equal(standingHeavy.heroBodyRole.semanticId, "standing-heavy:hero-impact");
    assert.equal(overdrive.heroBodyRole.slot, 184);
    assert.equal(overdrive.heroBodyRole.semanticId, "overdrive:super-primary-impact");
    assert.equal(throwMove.productionBodyBank, "throw-attacker");
    assert.equal(throwMove.pairedReceiverBank, "throw-receiver");
    assert.equal(throwMove.pairedReceiverRoles.length, 6);
    assert.equal(Array.isArray(overdrive.separateEffects), true);
    assert.equal(typeof overdrive.choreography.startupIntent, "string");
    assert.equal(typeof overdrive.choreography.heroContact, "string");
    if (specialB.implementationStatus === "planned-runtime-not-implemented") {
      assert.equal(specialB.runtimeImplemented, false);
      assert.ok(specialB.productionGates.length > 0);
    }
  }

  const bastion = frames.find((frame) => frame.frameId === "bastion");
  assert.equal(bastion.namedHighOutput.specialA, "redline-bore");
  assert.equal(bastion.namedHighOutput.specialB, "anvil-lock");
  assert.equal(bastion.namedHighOutput.reversal, "blow-off");
  assert.equal(bastion.namedHighOutput.overdrive, "kiln-verdict");
  assert.equal(bastion.moves.find((move) => move.moveId === "gravebell")?.publicName, "GRAVEBELL");
});

test("final atlas plan compilation refuses to proceed before the governed style proof is complete", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hmf-atlas-v3-incomplete-style-proof-"));
  const masterRoot = path.join(root, "masters", "frames", "bastion", "sprites");
  try {
    await mkdir(masterRoot, { recursive: true });
    await assert.rejects(
      compileHmfFrameAtlasV3DeliveryPlan({
        frameId: "bastion",
        workspaceRoot: root,
        frameReceipts: [],
        styleProofApprovalRecords: [],
        styleProofReceipts: [],
        compiledAt: "2026-08-12T08:00:00.000Z",
      }),
      /style proof must be complete/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Frame master root must be a real directory inside the persistent workspace", { skip: process.platform === "win32" }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hmf-atlas-v3-master-root-"));
  const external = await mkdtemp(path.join(os.tmpdir(), "hmf-atlas-v3-external-master-"));
  const frameParent = path.join(root, "masters", "frames", "bastion");
  try {
    await mkdir(frameParent, { recursive: true });
    await symlink(external, path.join(frameParent, "sprites"), "dir");
    await assert.rejects(
      validateHmfFrameAtlasV3MasterRoot(root, "bastion"),
      /non-symlink directory/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(external, { recursive: true, force: true });
  }
});

test("fixed-grid Python builder keeps 224 authored cells, direct receipt evidence, transparent reserve and no game mutation authority", async () => {
  const [builder, common, contract] = await Promise.all([
    readFile(new URL("../../tools/build_heavy_metal_fighting_frame_atlas_v3.py", import.meta.url), "utf8"),
    readFile(new URL("./frame_atlas_v3_build_common.py", import.meta.url), "utf8"),
    readFile(new URL("./frame_atlas_v3_build_contract.py", import.meta.url), "utf8"),
  ]);
  assert.match(common, /CELL=\(160,160\)/);
  assert.match(common, /ATLAS=\(2560,2560\)/);
  assert.match(common, /AUTHORED=224/);
  assert.match(common, /TOTAL=256/);
  assert.match(contract, /reserved slots drifted/);
  assert.match(contract, /plan requires 224 sources/);
  assert.match(contract, /source receipt evidence disagrees/);
  assert.match(builder, /headReceiptSha256/);
  assert.match(builder, /stable_bytes\(Path\(s\["sourcePath"\]\)/);
  assert.match(builder, /image\.mode!="RGBA"/);
  assert.match(builder, /corners must be transparent/);
  assert.match(builder, /atlas\.alpha_composite\(image,dest=/);
  assert.match(builder, /rename_noreplace\(stage,output\)/);
  assert.match(builder, /"gameActivationReady":False/);
  assert.match(builder, /"targetRepositoryMutation":False/);
  assert.doesNotMatch(builder, /os\.replace\(/);
  assert.doesNotMatch(builder, /\.resize\(/);
  assert.doesNotMatch(builder, /\.rotate\(/);
  assert.doesNotMatch(builder, /subprocess/);
  assert.doesNotMatch(builder, /git push/);
});

test("unknown Frames cannot acquire an atlas-v3 delivery layout", async () => {
  await assert.rejects(buildHmfFrameAtlasV3Layout("unknown-frame"), /frameId must be one of/);
});
