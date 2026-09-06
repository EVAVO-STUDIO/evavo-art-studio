import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { createExistingImageEditInspectionProof } from "../dist/index.js";

async function image(width, height, edits = []) {
  const raw = Buffer.alloc(width * height * 4, 0);
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4;
    raw[i] = 80; raw[i + 1] = 90; raw[i + 2] = 100; raw[i + 3] = 255;
  }
  for (const [x, y, r = 220] of edits) {
    const i = (y * width + x) * 4;
    raw[i] = r;
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("inspection proof creates separate zoom pairs for disconnected edit regions", async () => {
  const source = await image(80, 60);
  const edited = await image(80, 60, [
    [10, 10], [11, 10], [10, 11],
    [60, 45], [61, 45], [60, 46], [61, 46],
  ]);
  const result = await createExistingImageEditInspectionProof(source, edited);
  assert.equal(result.evidence.changeRegions.length, 2);
  assert.equal(result.evidence.changeRegions[0].rank, 1);
  assert.ok(result.evidence.panels.includes("source-region-01-pixel-zoom"));
  assert.ok(result.evidence.panels.includes("edited-region-02-pixel-zoom"));
  assert.ok(result.png.length > 0);
});

test("inspection proof handles identical images without inventing change regions", async () => {
  const source = await image(32, 24);
  const result = await createExistingImageEditInspectionProof(source, source);
  assert.equal(result.evidence.changedPixelRatio, 0);
  assert.equal(result.evidence.changeRegions.length, 0);
  assert.ok(result.evidence.panels.includes("source-no-change-pixel-zoom"));
});
