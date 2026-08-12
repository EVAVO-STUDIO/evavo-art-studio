import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildHmfFrameAtlasV3Layout,
  compileHmfFrameAtlasV3DeliveryPlan,
  verifyHmfFrameAtlasV3Delivery,
} from "./frame-atlas-v3-delivery.mjs";

const FRAMES = ["bastion", "viper", "citadel", "mirage"];

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
      assert.match(slot.masterRelativePath, new RegExp(`^masters/frames/${layout.frameId}/sprites/${layout.frameId}-`));
      assert.equal(allUnits.has(slot.unitId), false, `duplicate body unit ${slot.unitId}`);
      allUnits.add(slot.unitId);
    }
  }
  assert.equal(allUnits.size, 896);
});

test("frame atlas-v3 delivery verification locks geometry, target path and authority boundary", async () => {
  const verification = await verifyHmfFrameAtlasV3Delivery();
  assert.equal(verification.status, "passed");
  assert.equal(verification.layouts.length, 4);
  assert.ok(verification.checks.every((check) => check.passed));
  assert.equal(verification.failed.length, 0);
  assert.equal(verification.authority.workspaceExportWrite, true);
  assert.equal(verification.authority.targetRepositoryMutation, false);
  assert.equal(verification.authority.publication, false);
});

test("final atlas plan compilation refuses to proceed before the governed style proof is complete", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hmf-atlas-v3-incomplete-style-proof-"));
  try {
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

test("fixed-grid Python builder keeps 224 authored cells, transparent reserve and no game mutation authority", async () => {
  const source = await readFile(new URL("../../tools/build_heavy_metal_fighting_frame_atlas_v3.py", import.meta.url), "utf8");
  assert.match(source, /AUTHORED_SLOTS = 224/);
  assert.match(source, /TOTAL_SLOTS = 256/);
  assert.match(source, /RESERVED_START = 224/);
  assert.match(source, /ATLAS = \(2560, 2560\)/);
  assert.match(source, /CELL = \(160, 160\)/);
  assert.match(source, /image\.mode != "RGBA"/);
  assert.match(source, /transparent cell corners/);
  assert.match(source, /reserved_region_is_transparent/);
  assert.match(source, /atlas\.alpha_composite\(image, dest=/);
  assert.match(source, /os\.replace\(temporary, output_root\)/);
  assert.match(source, /"gameActivationReady": False/);
  assert.match(source, /"targetRepositoryMutation": False/);
  assert.doesNotMatch(source, /\.resize\(/);
  assert.doesNotMatch(source, /\.rotate\(/);
  assert.doesNotMatch(source, /subprocess/);
  assert.doesNotMatch(source, /git push/);
});

test("unknown Frames cannot acquire an atlas-v3 delivery layout", async () => {
  await assert.rejects(buildHmfFrameAtlasV3Layout("unknown-frame"), /frameId must be one of/);
});
