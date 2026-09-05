import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { applyLocalizedRasterEdit } from "../dist/index.js";

async function pngFromRaw(data, width, height, channels = 4) {
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

test("localized edit changes only the authorized mask area", async () => {
  const width = 8;
  const height = 8;
  const source = Buffer.alloc(width * height * 4);
  const candidate = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4;
    source[i] = 20; source[i + 1] = 30; source[i + 2] = 40; source[i + 3] = 255;
    candidate[i] = 220; candidate[i + 1] = 30; candidate[i + 2] = 50; candidate[i + 3] = 255;
  }
  const mask = Buffer.alloc(width * height, 0);
  for (let y = 2; y <= 5; y += 1) {
    for (let x = 2; x <= 5; x += 1) mask[y * width + x] = 255;
  }

  const result = await applyLocalizedRasterEdit(
    await pngFromRaw(source, width, height),
    await pngFromRaw(candidate, width, height),
    await pngFromRaw(mask, width, height, 1),
    { featherRadius: 0, maskThreshold: 8 },
  );

  assert.equal(result.evidence.maskPixels, 16);
  assert.equal(result.evidence.changedOutsideMaskPixels, 0);
  assert.equal(result.evidence.preservationPassed, true);

  const out = await sharp(result.buffer).ensureAlpha().raw().toBuffer();
  const outside = (0 * width + 0) * 4;
  const inside = (3 * width + 3) * 4;
  assert.deepEqual([...out.subarray(outside, outside + 4)], [20, 30, 40, 255]);
  assert.deepEqual([...out.subarray(inside, inside + 4)], [220, 30, 50, 255]);
});

test("localized edit refuses candidate dimension drift", async () => {
  const source = await sharp({ create: { width: 8, height: 8, channels: 4, background: "#112233ff" } }).png().toBuffer();
  const candidate = await sharp({ create: { width: 7, height: 8, channels: 4, background: "#445566ff" } }).png().toBuffer();
  const mask = await sharp({ create: { width: 8, height: 8, channels: 1, background: "#ffffff" } }).png().toBuffer();
  await assert.rejects(() => applyLocalizedRasterEdit(source, candidate, mask), /candidate dimensions/);
});

test("feathering still copies every non-authorized pixel from source", async () => {
  const width = 9;
  const height = 9;
  const source = await sharp({ create: { width, height, channels: 4, background: "#202020ff" } }).png().toBuffer();
  const candidate = await sharp({ create: { width, height, channels: 4, background: "#ff244eff" } }).png().toBuffer();
  const maskData = Buffer.alloc(width * height, 0);
  maskData[4 * width + 4] = 255;
  const mask = await pngFromRaw(maskData, width, height, 1);
  const result = await applyLocalizedRasterEdit(source, candidate, mask, { featherRadius: 1, maskThreshold: 8 });
  assert.equal(result.evidence.changedOutsideMaskPixels, 0);
  assert.equal(result.evidence.changedOpaqueOutsideMaskPixels, 0);
});
