import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "../packages/media/node_modules/sharp/dist/index.mjs";
import { projectVehicleWheelOverlays } from "./vehicle_wheel_overlay_projector.mjs";

test("projects an alpha wheel through a reviewed same-canvas mask", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-wheel-projector-"));
  const product = path.join(root, "product.png");
  const mask = path.join(root, "mask.png");
  const output = path.join(root, "output.png");
  await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 180, g: 190, b: 200, alpha: 255 } } }).png().toFile(product);
  const maskPixels = Buffer.alloc(64 * 32 * 4);
  for (let y = 10; y < 22; y += 1) for (let x = 20; x < 44; x += 1) maskPixels[(y * 64 + x) * 4 + 3] = 255;
  await sharp(maskPixels, { raw: { width: 64, height: 32, channels: 4 } }).png().toFile(mask);
  const receipt = await projectVehicleWheelOverlays({
    canvas: { width: 64, height: 32 }, product,
    targets: [{ id: "rear_left", mask, output, x: 32, y: 16, radiusX: 12, radiusY: 6 }],
  });
  assert.equal(receipt.outputs.length, 1);
  assert.equal(receipt.approvalState, "unapproved-pending-native-runtime-review");
  const metadata = await sharp(await readFile(output)).metadata();
  assert.deepEqual([metadata.width, metadata.height, metadata.hasAlpha], [64, 32, true]);
  const alpha = await sharp(output).ensureAlpha().extractChannel(3).raw().toBuffer();
  assert.equal(alpha[16 * 64 + 32], 255);
  assert.equal(alpha[0], 0);
});

test("rejects a mask that does not match the retained canvas", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-wheel-projector-"));
  const product = path.join(root, "product.png");
  const mask = path.join(root, "mask.png");
  await sharp({ create: { width: 8, height: 8, channels: 4, background: "#ffffff" } }).png().toFile(product);
  await sharp({ create: { width: 10, height: 10, channels: 4, background: "#ffffff" } }).png().toFile(mask);
  await assert.rejects(
    projectVehicleWheelOverlays({ canvas: { width: 64, height: 32 }, product, targets: [{ id: "wheel", mask, output: path.join(root, "out.png"), x: 20, y: 16, radiusX: 8, radiusY: 6 }] }),
    /must be 64x32/,
  );
});
