import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "../packages/media/node_modules/sharp/dist/index.mjs";
import { reviewWaterSurfaceKit } from "./water_surface_kit_review.mjs";

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

test("proves coordinated metatile seams and exact current loop without granting approval", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-water-kit-"));
  const baseFrames = [];
  const currentFrames = [];
  const metatile = Buffer.alloc(128 * 128 * 4);
  for (let y = 0; y < 128; y += 1) for (let x = 0; x < 128; x += 1) {
    const offset = (y * 128 + x) * 4;
    const sx = Math.min(x, 127 - x), sy = Math.min(y, 127 - y);
    metatile.set([20 + sx, 40 + sy, 48, 255], offset);
  }
  for (let frame = 0; frame < 8; frame += 1) for (let variant = 0; variant < 4; variant += 1) {
    const animatedMetatile = Buffer.from(metatile);
    animatedMetatile.set([80 + frame, 96, 104, 255], ((20 + frame) * 128 + 20 + frame) * 4);
    const left = (variant % 2) * 64, top = Math.floor(variant / 2) * 64;
    const encoded = await sharp(animatedMetatile, { raw: { width: 128, height: 128, channels: 4 } }).extract({ left, top, width: 64, height: 64 }).png().toBuffer();
    const relative = `base/v${variant}-f${frame}.png`; await mkdir(path.dirname(path.join(root, relative)), { recursive: true }); await writeFile(path.join(root, relative), encoded);
    baseFrames.push({ variant, frame, path: relative, sha256: hash(encoded) });
  }
  const current0 = Buffer.alloc(128 * 64 * 4);
  for (let y = 0; y < 64; y += 1) for (let x = 0; x < 128; x += 1) current0.set([x, y, 80, x % 17 === 0 ? 170 : 0], (y * 128 + x) * 4);
  for (let frame = 0; frame < 8; frame += 1) {
    const pixels = Buffer.alloc(current0.length);
    for (let y = 0; y < 64; y += 1) for (let x = 0; x < 128; x += 1) current0.copy(pixels, (y * 128 + ((x + frame * 16) % 128)) * 4, (y * 128 + x) * 4, (y * 128 + x + 1) * 4);
    const encoded = await sharp(pixels, { raw: { width: 128, height: 64, channels: 4 } }).png().toBuffer();
    const relative = `current/f${frame}.png`; await mkdir(path.dirname(path.join(root, relative)), { recursive: true }); await writeFile(path.join(root, relative), encoded);
    currentFrames.push({ frame, downstream_shift_pixels: frame * 16, path: relative, sha256: hash(encoded) });
  }
  const baseReceipt = path.join(root, "base.json"), currentReceipt = path.join(root, "current.json");
  await writeFile(baseReceipt, JSON.stringify({ schema:"strikewater_seamless_water_kit_receipt_v1",variants:4,frames_per_variant:8,runtime_admission:false,frames:baseFrames }));
  await writeFile(currentReceipt, JSON.stringify({ schema:"strikewater_directional_current_overlay_receipt_v1",frame_count:8,step_pixels:16,runtime_admission:false,frames:currentFrames }));
  const result = await reviewWaterSurfaceKit({ baseReceiptPath:baseReceipt,currentReceiptPath:currentReceipt,root });
  assert.equal(result.passed,true); assert.equal(result.base.distinctFrames,8); assert.equal(result.current.exactLoopClosure,true); assert.equal(result.creativeApproval,false); assert.equal(result.runtimeAdmission,false);

  const duplicateFrames = baseFrames.map((entry) => {
    const source = baseFrames.find((candidate) => candidate.variant === entry.variant && candidate.frame === 0);
    return { ...entry, path: source.path, sha256: source.sha256 };
  });
  const duplicateReceipt = path.join(root, "duplicate-base.json");
  await writeFile(duplicateReceipt, JSON.stringify({ schema:"strikewater_seamless_water_kit_receipt_v1",variants:4,frames_per_variant:8,runtime_admission:false,frames:duplicateFrames }));
  await assert.rejects(
    reviewWaterSurfaceKit({ baseReceiptPath:duplicateReceipt,currentReceiptPath:currentReceipt,root }),
    /contains only 1 distinct reconstructed exposures/u,
  );
});
