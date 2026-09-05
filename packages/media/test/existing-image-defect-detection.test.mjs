import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { detectExistingImageDefects } from "../dist/index.js";

async function png(raw, width, height) {
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("detects dirty transparent RGB and proposes polish", async () => {
  const width = 4;
  const height = 4;
  const raw = Buffer.alloc(width * height * 4, 0);
  raw[0] = 255;
  raw[1] = 255;
  raw[2] = 255;
  raw[3] = 0;

  const result = await detectExistingImageDefects(await png(raw, width, height), { maskPadding: 0 });
  assert.equal(result.evidence.defectCounts["transparent-rgb-contamination"], 1);
  assert.equal(result.evidence.suggestedAction, "polish");
  assert.ok(result.maskPng.length > 0);
  assert.ok(result.overlayPng.length > 0);
});

test("detects alpha pinhole inside opaque artwork and proposes localized repair", async () => {
  const width = 5;
  const height = 5;
  const raw = Buffer.alloc(width * height * 4, 0);
  for (let y = 1; y <= 3; y += 1) {
    for (let x = 1; x <= 3; x += 1) {
      const i = (y * width + x) * 4;
      raw[i] = 200; raw[i + 1] = 40; raw[i + 2] = 60; raw[i + 3] = 255;
    }
  }
  raw[(2 * width + 2) * 4 + 3] = 20;

  const result = await detectExistingImageDefects(await png(raw, width, height), {
    maskPadding: 0,
    pinholeAlphaMaximum: 70,
  });
  assert.ok(result.evidence.defectCounts["alpha-pinhole"] >= 1);
  assert.equal(result.evidence.suggestedAction, "localized-repair");
  assert.deepEqual(result.evidence.bounds, { left: 2, top: 2, right: 2, bottom: 2 });
});

test("escalates broad defect masks to manual review", async () => {
  const width = 8;
  const height = 8;
  const raw = Buffer.alloc(width * height * 4, 0);
  for (let i = 0; i < raw.length; i += 4) {
    raw[i] = 255; raw[i + 1] = 255; raw[i + 2] = 255; raw[i + 3] = 0;
  }

  const result = await detectExistingImageDefects(await png(raw, width, height), {
    maskPadding: 0,
    maximumMaskCoverageRatio: 0.1,
  });
  assert.equal(result.evidence.withinMaximumMaskCoverageRatio, false);
  assert.equal(result.evidence.suggestedAction, "manual-review");
});
