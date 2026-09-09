import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { buildVehicleMotionLayerPacket } from "../dist/index.js";

async function fixture() {
  return sharp({ create: { width: 32, height: 24, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: { create: { width: 18, height: 14, channels: 4, background: { r: 28, g: 30, b: 34, alpha: 1 } } }, left: 7, top: 6 }])
    .png()
    .toBuffer();
}

test("builds deterministic wheel, contact-patch and occlusion layers on the source canvas", async () => {
  const input = await fixture();
  const spec = { view: "RACE_REAR_CHASE", drivetrain: "FWD", reviewedAnchors: true, reviewer: "test-review", anchors: [{ id: "rear_left", x: 11, y: 15, radiusX: 4, radiusY: 5, axle: "rear", side: "left" }] };
  const first = await buildVehicleMotionLayerPacket(input, spec);
  const second = await buildVehicleMotionLayerPacket(input, spec);
  assert.equal(first.width, 32);
  assert.equal(first.height, 24);
  assert.equal(first.layers.length, 3);
  assert.deepEqual(first.layers.map((layer) => layer.role), ["wheel", "tyre_contact_patch_mask", "wheel_occlusion_mask"]);
  assert.deepEqual(first.layers.map((layer) => layer.sha256), second.layers.map((layer) => layer.sha256));
  assert.ok(first.layers.every((layer) => layer.nonTransparentPixels > 0));
  assert.equal(first.evidence.publicationAuthority, false);
});

test("rejects unreviewed anchors and opaque sources", async () => {
  const input = await fixture();
  await assert.rejects(() => buildVehicleMotionLayerPacket(input, { view: "rear", drivetrain: "FWD", reviewedAnchors: false, reviewer: "", anchors: [] }), /reviewedAnchors/);
  const opaque = await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } }).png().toBuffer();
  await assert.rejects(() => buildVehicleMotionLayerPacket(opaque, { view: "rear", drivetrain: "RWD", reviewedAnchors: true, reviewer: "test", anchors: [{ id: "rear", x: 8, y: 8, radiusX: 3, radiusY: 3, axle: "rear", side: "left" }] }), /meaningful transparency/);
});
