import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { detectExistingImageDefects } from "../dist/index.js";

async function png(raw, width, height) {
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

function pixel(raw, width, x, y, rgba) {
  const i = (y * width + x) * 4;
  raw[i] = rgba[0]; raw[i + 1] = rgba[1]; raw[i + 2] = rgba[2]; raw[i + 3] = rgba[3];
}

test("default transparent RGB detection ignores hidden matte far from visible artwork", async () => {
  const width = 8;
  const height = 8;
  const raw = Buffer.alloc(width * height * 4, 0);
  pixel(raw, width, 0, 0, [255, 255, 255, 0]);
  pixel(raw, width, 7, 7, [80, 100, 120, 255]);

  const result = await detectExistingImageDefects(await png(raw, width, height), { maskPadding: 0 });
  assert.equal(result.evidence.transparentRgbMode, "edge-only");
  assert.equal(result.evidence.defectCounts["transparent-rgb-contamination"], 0);
  assert.equal(result.evidence.suggestedAction, "none");
});

test("edge-aware transparent RGB detection catches contamination next to visible artwork", async () => {
  const width = 5;
  const height = 5;
  const raw = Buffer.alloc(width * height * 4, 0);
  pixel(raw, width, 2, 2, [180, 40, 70, 255]);
  pixel(raw, width, 2, 1, [255, 255, 255, 0]);

  const result = await detectExistingImageDefects(await png(raw, width, height), { maskPadding: 0 });
  assert.equal(result.evidence.defectCounts["transparent-rgb-contamination"], 1);
  assert.equal(result.evidence.suggestedAction, "polish");
});

test("transparent logo profile intentionally audits hidden RGB across the canvas", async () => {
  const width = 8;
  const height = 8;
  const raw = Buffer.alloc(width * height * 4, 0);
  for (let i = 0; i < raw.length; i += 4) {
    raw[i] = 255; raw[i + 1] = 255; raw[i + 2] = 255; raw[i + 3] = 0;
  }
  const result = await detectExistingImageDefects(await png(raw, width, height), {
    profile: "logo-transparent",
    maskPadding: 0,
    maximumMaskCoverageRatio: 0.1,
  });
  assert.equal(result.evidence.transparentRgbMode, "all");
  assert.equal(result.evidence.withinMaximumMaskCoverageRatio, false);
  assert.equal(result.evidence.suggestedAction, "manual-review");
});

test("detects alpha pinhole inside opaque artwork and proposes localized repair", async () => {
  const width = 5;
  const height = 5;
  const raw = Buffer.alloc(width * height * 4, 0);
  for (let y = 1; y <= 3; y += 1) {
    for (let x = 1; x <= 3; x += 1) pixel(raw, width, x, y, [200, 40, 60, 255]);
  }
  raw[(2 * width + 2) * 4 + 3] = 20;

  const result = await detectExistingImageDefects(await png(raw, width, height), { maskPadding: 0, pinholeAlphaMaximum: 70 });
  assert.ok(result.evidence.defectCounts["alpha-pinhole"] >= 1);
  assert.equal(result.evidence.suggestedAction, "localized-repair");
  assert.deepEqual(result.evidence.bounds, { left: 2, top: 2, right: 2, bottom: 2 });
});

test("detects dark or chromatic matte fringe by donor colour distance, not just bright luma", async () => {
  const width = 5;
  const height = 5;
  const raw = Buffer.alloc(width * height * 4, 0);
  for (let y = 1; y <= 3; y += 1) {
    for (let x = 1; x <= 3; x += 1) pixel(raw, width, x, y, [230, 210, 180, 255]);
  }
  pixel(raw, width, 2, 0, [0, 20, 120, 150]);
  pixel(raw, width, 2, 1, [230, 210, 180, 255]);

  const result = await detectExistingImageDefects(await png(raw, width, height), { maskPadding: 0, haloColorDistanceThreshold: 80 });
  assert.ok(result.evidence.defectCounts["edge-halo-risk"] >= 1);
  assert.equal(result.evidence.suggestedAction, "polish");
});

test("hard alpha discontinuity requires mixed transparent and opaque neighbourhood", async () => {
  const width = 3;
  const height = 3;
  const raw = Buffer.alloc(width * height * 4, 0);
  pixel(raw, width, 1, 1, [120, 120, 120, 128]);
  pixel(raw, width, 0, 1, [120, 120, 120, 255]);
  pixel(raw, width, 2, 1, [120, 120, 120, 255]);
  pixel(raw, width, 1, 0, [120, 120, 120, 0]);
  pixel(raw, width, 1, 2, [120, 120, 120, 0]);

  const result = await detectExistingImageDefects(await png(raw, width, height), { maskPadding: 0, stairStepMinimumTransitions: 4 });
  assert.ok(result.evidence.defectCounts["hard-alpha-stair-step"] >= 1);
  assert.equal(result.evidence.suggestedAction, "localized-repair");
});
