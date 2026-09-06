import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { readRasterImageDimensions } from "../dist/index.js";

test("reads raster dimensions and alpha from encoded bytes", async () => {
  const encoded = await sharp({ create: { width: 37, height: 19, channels: 4, background: { r: 20, g: 30, b: 40, alpha: 0.5 } } }).png().toBuffer();
  const result = await readRasterImageDimensions(encoded);
  assert.equal(result.width, 37);
  assert.equal(result.height, 19);
  assert.equal(result.pages, 1);
  assert.equal(result.hasAlpha, true);
  assert.equal(result.format, "png");
});

test("rejects empty image input", async () => {
  await assert.rejects(() => readRasterImageDimensions(Buffer.alloc(0)), /input is empty/u);
});
