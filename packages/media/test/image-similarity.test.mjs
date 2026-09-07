import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { compareImageSimilarity } from "../dist/index.js";

async function solid(value) {
  return sharp({ create: { width: 64, height: 64, channels: 3, background: { r: value, g: value, b: value } } }).png().toBuffer();
}

async function solidRgb(r, g, b) {
  return sharp({ create: { width: 64, height: 64, channels: 3, background: { r, g, b } } }).png().toBuffer();
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

async function colorSplit(left, right) {
  const raw = Buffer.alloc(64 * 64 * 3);
  for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) {
    const rgb = x < 32 ? left : right;
    const i = (y * 64 + x) * 3;
    raw[i] = rgb[0]; raw[i + 1] = rgb[1]; raw[i + 2] = rgb[2];
  }
  return sharp(raw, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer();
}

test("exact copies remain exact duplicates", async () => {
  const image = await verticalSplit(20, 220);
  const result = await compareImageSimilarity(image, Buffer.from(image));
  assert.equal(result.exactBinaryMatch, true);
  assert.equal(result.perceptualSimilarity, 1);
  assert.equal(result.colorGridSimilarity, 1);
  assert.equal(result.colorGridMeanAbsoluteDifference, 0);
  assert.equal(result.recommendation, "reject-duplicate");
});

test("combined shape tone and color avoids flat-image collision with a broad split", async () => {
  const flat = await solid(128);
  const split = await verticalSplit(0, 255);
  const result = await compareImageSimilarity(flat, split);
  assert.ok(result.averageHashDistance > 0);
  assert.ok(result.perceptualSimilarity < 0.92);
  assert.equal(result.nearDuplicate, false);
});

test("different colors with identical grayscale structure are not false near-duplicates", async () => {
  const red = await solidRgb(255, 0, 0);
  const blue = await solidRgb(0, 0, 255);
  const result = await compareImageSimilarity(red, blue);
  assert.equal(result.differenceHashSimilarity, 1);
  assert.equal(result.averageHashSimilarity, 1);
  assert.ok(result.colorGridSimilarity < 0.5);
  assert.ok(result.perceptualSimilarity < 0.92);
  assert.equal(result.nearDuplicate, false);
});

test("same-layout recolors retain structural similarity but expose color divergence", async () => {
  const warm = await colorSplit([230, 35, 35], [250, 210, 30]);
  const cool = await colorSplit([35, 80, 230], [30, 220, 210]);
  const result = await compareImageSimilarity(warm, cool);
  assert.ok(result.differenceHashSimilarity > 0.8);
  assert.ok(result.colorGridSimilarity < result.differenceHashSimilarity);
  assert.ok(result.perceptualSimilarity < 0.92);
});

test("resized derivatives remain strong color-aware perceptual matches", async () => {
  const source = await colorSplit([15, 30, 70], [235, 180, 25]);
  const resized = await sharp(source).resize(160, 96, { fit: "fill" }).png().toBuffer();
  const result = await compareImageSimilarity(source, resized);
  assert.equal(result.exactBinaryMatch, false);
  assert.ok(result.colorGridSimilarity > 0.98);
  assert.ok(result.perceptualSimilarity >= 0.92);
  assert.equal(result.nearDuplicate, true);
});
