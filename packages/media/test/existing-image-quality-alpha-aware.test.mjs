import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { reviewExistingImageQuality } from "../dist/index.js";

async function encode(raw, width, height) {
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("hidden RGB under fully transparent pixels does not corrupt visible luma metrics", async () => {
  const width = 6;
  const height = 4;
  const raw = Buffer.alloc(width * height * 4, 0);
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4;
    raw[i] = p % 2 ? 255 : 0;
    raw[i + 1] = p % 3 ? 240 : 5;
    raw[i + 2] = p % 5 ? 220 : 10;
    raw[i + 3] = 0;
  }
  for (let y = 1; y <= 2; y += 1) {
    for (let x = 2; x <= 3; x += 1) {
      const i = (y * width + x) * 4;
      raw[i] = 80;
      raw[i + 1] = 80;
      raw[i + 2] = 80;
      raw[i + 3] = 255;
    }
  }
  const result = await reviewExistingImageQuality(await encode(raw, width, height), {
    minimumSharpness: 0,
    minimumLumaStdDev: 0,
    maximumTransparentRgbContaminationRatio: 1,
  });
  assert.equal(result.metricDomain, "alpha-weighted-visible-pixels");
  assert.ok(Math.abs(result.lumaMean - 80) < 0.001);
  assert.equal(result.visiblePixelRatio, 4 / 24);
  assert.equal(result.alphaWeightRatio, 4 / 24);
});

test("fully transparent artwork fails explicitly instead of reporting hidden-RGB sharpness", async () => {
  const width = 4;
  const height = 4;
  const raw = Buffer.alloc(width * height * 4, 0);
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4;
    raw[i] = p % 2 ? 255 : 0;
    raw[i + 1] = 40;
    raw[i + 2] = 200;
  }
  const result = await reviewExistingImageQuality(await encode(raw, width, height), {
    maximumTransparentRgbContaminationRatio: 1,
  });
  assert.equal(result.alphaWeightRatio, 0);
  assert.equal(result.sharpness, 0);
  assert.equal(result.grade, "fail");
  assert.ok(result.issues.includes("fully-transparent-no-visible-artwork"));
});

test("semi-transparent visible pixels contribute proportionally to tonal metrics", async () => {
  const width = 2;
  const height = 1;
  const raw = Buffer.from([
    0, 0, 0, 255,
    255, 255, 255, 128,
  ]);
  const result = await reviewExistingImageQuality(await encode(raw, width, height), {
    minimumSharpness: 0,
    minimumLumaStdDev: 0,
    maximumTransparentRgbContaminationRatio: 1,
  });
  const expected = 255 * (128 / 255) / (1 + 128 / 255);
  assert.ok(Math.abs(result.lumaMean - expected) < 0.5);
  assert.ok(result.alphaWeightRatio > 0.74 && result.alphaWeightRatio < 0.76);
});
