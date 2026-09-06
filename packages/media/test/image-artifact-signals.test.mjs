import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { detectImageArtifactSignals } from "../dist/index.js";

async function rgbaPng(width, height, pixel) {
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const [r, g, b, a] = pixel(x, y);
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("pixel-art profile does not flag nearest-neighbour repetition as an upscale defect", async () => {
  const image = await rgbaPng(128, 128, (x, y) => {
    const cell = ((Math.floor(x / 2) + Math.floor(y / 2)) % 2) * 255;
    return [cell, cell, cell, 255];
  });
  const result = await detectImageArtifactSignals(image, { profile: "pixel-art" });
  assert.equal(result.nearestNeighbourUpscaleRisk, false);
  assert.ok(!result.warnings.some((warning) => warning.startsWith("nearest-neighbour-upscale-fingerprint")));
});

test("photo profile flags strong two-axis 2x resampling fingerprint with phase separation", async () => {
  const image = await rgbaPng(128, 128, (x, y) => {
    const cellX = Math.floor(x / 2);
    const cellY = Math.floor(y / 2);
    const value = (cellX * 17 + cellY * 29) % 256;
    return [value, (value * 3) % 256, (value * 7) % 256, 255];
  });
  const result = await detectImageArtifactSignals(image, { profile: "photo" });
  assert.equal(result.contract, "evavo.image-artifact-signals.v1_1");
  assert.equal(result.nearestNeighbourUpscaleRisk, true);
  assert.ok(result.horizontalPairAgreement > 0.84);
  assert.ok(result.verticalPairAgreement > 0.84);
  assert.ok(result.horizontalPhaseSeparation > 0.24);
  assert.ok(result.verticalPhaseSeparation > 0.24);
});

test("large flat photographic regions do not look like 2x nearest-neighbour scaling without phase separation", async () => {
  const image = await rgbaPng(128, 128, (x, y) => {
    const value = x < 64 ? 40 : 190;
    return [value, value, value, 255];
  });
  const result = await detectImageArtifactSignals(image, { profile: "photo" });
  assert.ok(result.horizontalPairAgreement > 0.9);
  assert.ok(result.verticalPairAgreement > 0.9);
  assert.ok(result.horizontalPhaseSeparation < 0.1 || result.verticalPhaseSeparation < 0.1);
  assert.equal(result.nearestNeighbourUpscaleRisk, false);
});

test("one-axis repeated striping alone is insufficient for a hard upscale fingerprint", async () => {
  const image = await rgbaPng(128, 128, (x) => {
    const cellX = Math.floor(x / 2);
    const value = (cellX * 31) % 256;
    return [value, value, value, 255];
  });
  const result = await detectImageArtifactSignals(image, { profile: "web-hero" });
  assert.ok(result.horizontalPhaseSeparation > 0.24);
  assert.ok(result.verticalPhaseSeparation < 0.1);
  assert.equal(result.nearestNeighbourUpscaleRisk, false);
});

test("artifact signals ignore fully transparent hidden RGB for visible pixel counts", async () => {
  const image = await rgbaPng(32, 32, (x, y) => [x * 7 % 256, y * 11 % 256, 220, 0]);
  const result = await detectImageArtifactSignals(image, { profile: "photo", minimumPosterizationPixels: 64 });
  assert.equal(result.visiblePixels, 0);
  assert.equal(result.ringingRiskRatio, 0);
  assert.equal(result.posterizationRisk, false);
  assert.equal(result.nearestNeighbourUpscaleRisk, false);
});
