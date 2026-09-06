import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { reviewEnhancementLocalDetailRisk } from "../dist/index.js";

async function pattern(width, height, noisyQuadrant = false) {
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      raw[i] = (x * 3) % 256;
      raw[i + 1] = (y * 5) % 256;
      raw[i + 2] = ((x + y) * 2) % 256;
      raw[i + 3] = 255;
      if (noisyQuadrant && x < width / 2 && y < height / 2) {
        const c = (x + y) % 4 === 0 ? 255 : 0;
        raw[i] = c;
        raw[i + 1] = 255 - c;
        raw[i + 2] = c;
      }
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("equivalent image has no high or low local detail risk", async () => {
  const source = await pattern(180, 120);
  const result = await reviewEnhancementLocalDetailRisk(source, Buffer.from(source), { gridColumns: 4, gridRows: 4 });
  assert.equal(result.highDetailPatchFraction, 0);
  assert.equal(result.lowDetailPatchFraction, 0);
  assert.equal(result.patches.length, 16);
  assert.equal(result.reviewRequired, true);
  assert.equal(result.automaticRejectionAllowed, false);
});

test("local candidate texture spikes are surfaced", async () => {
  const source = await pattern(180, 120);
  const candidate = await pattern(180, 120, true);
  const result = await reviewEnhancementLocalDetailRisk(source, candidate, {
    gridColumns: 4,
    gridRows: 4,
    highDetailRatio: 1.5,
  });
  assert.ok(result.highDetailPatchFraction > 0);
  assert.ok(result.maximumDetailRatio > 1.5);
  assert.ok(result.patches.some((patch) => patch.highDetailRisk));
});

test("candidate smaller than source is rejected", async () => {
  const source = await pattern(180, 120);
  const candidate = await pattern(90, 60);
  await assert.rejects(
    () => reviewEnhancementLocalDetailRisk(source, candidate),
    /cannot be smaller than source/u,
  );
});
