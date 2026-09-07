import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { compareImageSimilarity } from "../dist/index.js";

async function solid(value) {
  return sharp({ create: { width: 64, height: 64, channels: 3, background: { r: value, g: value, b: value } } }).png().toBuffer();
}

async function verticalSplit(left, right) {
  const raw = Buffer.alloc(64 * 64 * 3);
  for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) {
    const value = x < 32 ? left : right;
    const i = (y * 64 + x) * 3;
    raw[i] = value; raw[i + 1] = value; raw[i + 2] = value;
  }
  return sharp(raw, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer();
}

test("exact copies remain exact duplicates", async () => {
  const image = await verticalSplit(20, 220);
  const result = await compareImageSimilarity(image, Buffer.from(image));
  assert.equal(result.exactBinaryMatch, true);
  assert.equal(result.perceptualSimilarity, 1);
  assert.equal(result.recommendation, "reject-duplicate");
});

test("combined aHash+dHash avoids flat-image collision with a broad split", async () => {
  const flat = await solid(128);
  const split = await verticalSplit(0, 255);
  const result = await compareImageSimilarity(flat, split);
  assert.ok(result.differenceHashSimilarity >= result.averageHashSimilarity);
  assert.ok(result.averageHashDistance > 0);
  assert.ok(result.perceptualSimilarity < 0.92);
  assert.equal(result.nearDuplicate, false);
});

test("resized derivatives remain strong perceptual matches", async () => {
  const source = await verticalSplit(15, 235);
  const resized = await sharp(source).resize(160, 96, { fit: "fill" }).png().toBuffer();
  const result = await compareImageSimilarity(source, resized);
  assert.equal(result.exactBinaryMatch, false);
  assert.ok(result.perceptualSimilarity >= 0.92);
  assert.equal(result.nearDuplicate, true);
});
