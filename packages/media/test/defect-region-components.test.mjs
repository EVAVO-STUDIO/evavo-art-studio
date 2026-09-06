import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { segmentDefectMaskRegions } from "../dist/index.js";

async function mask(width, height, points) {
  const raw = Buffer.alloc(width * height, 0);
  for (const [x, y] of points) raw[y * width + x] = 255;
  return sharp(raw, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

test("segments and ranks disconnected defect regions", async () => {
  const input = await mask(12, 10, [
    [1, 1], [1, 2], [2, 1], [2, 2],
    [8, 6], [8, 7], [9, 6],
  ]);
  const result = await segmentDefectMaskRegions(input, { mergeGap: 0, minimumPixelCount: 1 });
  assert.equal(result.componentCount, 2);
  assert.equal(result.retainedComponentCount, 2);
  assert.equal(result.regions[0].pixelCount, 4);
  assert.deepEqual(result.regions[0].bounds, { left: 1, top: 1, right: 2, bottom: 2, width: 2, height: 2 });
  assert.equal(result.regions[0].rank, 1);
});

test("merge gap joins nearby regions for practical inspection", async () => {
  const input = await mask(10, 6, [[1, 2], [2, 2], [4, 2], [5, 2]]);
  const separated = await segmentDefectMaskRegions(input, { mergeGap: 0, minimumPixelCount: 1 });
  const merged = await segmentDefectMaskRegions(input, { mergeGap: 2, minimumPixelCount: 1 });
  assert.equal(separated.retainedComponentCount, 2);
  assert.equal(merged.retainedComponentCount, 1);
  assert.equal(merged.regions[0].pixelCount, 4);
});

test("small isolated noise can be excluded from review regions", async () => {
  const input = await mask(10, 10, [[0, 0], [4, 4], [4, 5], [5, 4], [5, 5]]);
  const result = await segmentDefectMaskRegions(input, { mergeGap: 0, minimumPixelCount: 2 });
  assert.equal(result.componentCount, 2);
  assert.equal(result.retainedComponentCount, 1);
  assert.equal(result.ignoredSmallComponentPixels, 1);
  assert.equal(result.regions[0].touchesCanvasEdge, false);
});
