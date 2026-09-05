import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { createExistingImageDifferenceProof } from "../dist/index.js";

async function pngFromRaw(raw, width, height) {
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("reports exact RGB and alpha mutation surface", async () => {
  const width = 4;
  const height = 4;
  const sourceRaw = Buffer.alloc(width * height * 4, 0);
  for (let i = 0; i < sourceRaw.length; i += 4) {
    sourceRaw[i] = 20;
    sourceRaw[i + 1] = 30;
    sourceRaw[i + 2] = 40;
    sourceRaw[i + 3] = 255;
  }
  const editedRaw = Buffer.from(sourceRaw);
  const rgb = (1 * width + 1) * 4;
  editedRaw[rgb] = 99;
  const alpha = (2 * width + 2) * 4;
  editedRaw[alpha + 3] = 128;

  const result = await createExistingImageDifferenceProof(
    await pngFromRaw(sourceRaw, width, height),
    await pngFromRaw(editedRaw, width, height),
  );

  assert.equal(result.evidence.changedPixels, 2);
  assert.equal(result.evidence.opaqueRgbChangedPixels, 1);
  assert.equal(result.evidence.alphaChangedPixels, 1);
  assert.deepEqual(result.evidence.changeBounds, { left: 1, top: 1, right: 2, bottom: 2 });
  assert.equal(result.evidence.changedPixelRatio, 2 / 16);
  assert.ok(result.proofPng.length > 0);
});

test("enforces maximum change surface evidence", async () => {
  const width = 2;
  const height = 2;
  const sourceRaw = Buffer.from([
    1, 2, 3, 255, 1, 2, 3, 255,
    1, 2, 3, 255, 1, 2, 3, 255,
  ]);
  const editedRaw = Buffer.from(sourceRaw);
  editedRaw[0] = 9;
  editedRaw[4] = 9;

  const result = await createExistingImageDifferenceProof(
    await pngFromRaw(sourceRaw, width, height),
    await pngFromRaw(editedRaw, width, height),
    { maximumChangedPixelRatio: 0.25 },
  );
  assert.equal(result.evidence.changedPixelRatio, 0.5);
  assert.equal(result.evidence.withinMaximumChangedPixelRatio, false);
});
