import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import {
  reviewExistingImageEdit,
  reviewExistingImageQuality,
} from "../dist/index.js";

async function pngFromRaw(raw, width, height) {
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

function solidRaw(width, height, rgba) {
  const raw = Buffer.alloc(width * height * 4);
  for (let i = 0; i < raw.length; i += 4) {
    raw[i] = rgba[0];
    raw[i + 1] = rgba[1];
    raw[i + 2] = rgba[2];
    raw[i + 3] = rgba[3];
  }
  return raw;
}

test("detects dirty RGB hidden behind transparent pixels", async () => {
  const width = 32;
  const height = 32;
  const raw = solidRaw(width, height, [70, 80, 90, 255]);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const i = (y * width + x) * 4;
      raw[i] = 255;
      raw[i + 1] = 255;
      raw[i + 2] = 255;
      raw[i + 3] = 0;
    }
  }

  const evidence = await reviewExistingImageQuality(await pngFromRaw(raw, width, height));
  assert.ok(evidence.transparentRgbContaminationRatio > 0.05);
  assert.ok(evidence.issues.some((issue) => issue.startsWith("dirty-transparent-rgb")));
  assert.notEqual(evidence.grade, "pass");
});

test("flags collateral opaque RGB changes in an existing-image edit", async () => {
  const width = 32;
  const height = 32;
  const sourceRaw = solidRaw(width, height, [80, 90, 100, 255]);
  const editedRaw = Buffer.from(sourceRaw);
  const i = (12 * width + 12) * 4;
  editedRaw[i] = 200;

  const review = await reviewExistingImageEdit(
    await pngFromRaw(sourceRaw, width, height),
    await pngFromRaw(editedRaw, width, height),
    { maximumChangedPixelRatio: 0.05 },
  );

  assert.equal(review.evidence.opaqueRgbChangedPixels, 1);
  assert.equal(review.evidence.verdict, "fail");
  assert.equal(review.evidence.approvedForPromotion, false);
  assert.ok(review.evidence.regressions.some((entry) => entry.startsWith("opaque-rgb-changed")));
  assert.ok(review.proofPng.length > 0);
  assert.ok(review.differenceProofPng.length > 0);
});

test("recognises transparent RGB cleanup as an improvement", async () => {
  const width = 40;
  const height = 40;
  const sourceRaw = solidRaw(width, height, [90, 100, 110, 255]);
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 10; x += 1) {
      const i = (y * width + x) * 4;
      sourceRaw[i] = 255;
      sourceRaw[i + 1] = 255;
      sourceRaw[i + 2] = 255;
      sourceRaw[i + 3] = 0;
    }
  }
  const editedRaw = Buffer.from(sourceRaw);
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 10; x += 1) {
      const i = (y * width + x) * 4;
      editedRaw[i] = 0;
      editedRaw[i + 1] = 0;
      editedRaw[i + 2] = 0;
    }
  }

  const review = await reviewExistingImageEdit(
    await pngFromRaw(sourceRaw, width, height),
    await pngFromRaw(editedRaw, width, height),
    { preserveOpaqueRgb: true, maximumChangedPixelRatio: 0.1 },
  );

  assert.ok(review.evidence.improvements.includes("transparent-rgb-contamination-reduced"));
  assert.equal(review.evidence.opaqueRgbChangedPixels, 0);
});
