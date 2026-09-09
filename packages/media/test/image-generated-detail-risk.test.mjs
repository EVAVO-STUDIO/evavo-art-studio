import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { detectGeneratedDetailArtifactRisk } from "../dist/index.js";

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

test("flags repeated nontrivial local motifs for illustration review", async () => {
  const image = await rgbaPng(96, 96, (x, y) => {
    const localX = x % 8;
    const localY = y % 8;
    const value = ((localX < 4) !== (localY < 4)) ? 220 : 35;
    return [value, Math.min(255, value + 15), Math.max(0, value - 10), 255];
  });
  const result = await detectGeneratedDetailArtifactRisk(image, { profile: "illustration" });
  assert.equal(result.contract, "evavo.generated-detail-artifact-risk.v1");
  assert.equal(result.repeatedDetailRisk, true);
  assert.ok(result.largestRepeatedCluster >= 4);
  assert.ok(result.repeatedPatchRatio >= 0.22);
  assert.ok(result.warnings.some((warning) => warning.startsWith("repeated-nontrivial-local-pattern-risk:")));
  assert.equal(result.aiOriginDetection, "not-claimed");
  assert.equal(result.advisoryOnly, true);
});

test("suppresses repetition warnings for texture assets where tiling may be intentional", async () => {
  const image = await rgbaPng(96, 96, (x, y) => {
    const value = ((x % 8 < 4) !== (y % 8 < 4)) ? 220 : 35;
    return [value, value, value, 255];
  });
  const result = await detectGeneratedDetailArtifactRisk(image, { profile: "texture" });
  assert.equal(result.repetitionSuppressedForProfile, true);
  assert.equal(result.repeatedDetailRisk, false);
  assert.ok(result.largestRepeatedCluster >= 4);
});

test("flat imagery does not create fake repeated-detail risk", async () => {
  const image = await rgbaPng(96, 96, () => [100, 100, 100, 255]);
  const result = await detectGeneratedDetailArtifactRisk(image, { profile: "photo" });
  assert.equal(result.eligibleRepeatedPatternTileCount, 0);
  assert.equal(result.repeatedPatchRatio, 0);
  assert.equal(result.repeatedDetailRisk, false);
  assert.equal(result.detailImbalanceRisk, false);
});

test("flags a strong local detail-density imbalance as review evidence", async () => {
  const image = await rgbaPng(96, 96, (x, y) => {
    if (x >= 80) {
      const value = (x + y) % 2 ? 245 : 10;
      return [value, value, value, 255];
    }
    const value = 70 + (x % 8) * 2;
    return [value, value, value, 255];
  });
  const result = await detectGeneratedDetailArtifactRisk(image, { profile: "photo" });
  assert.equal(result.detailImbalanceRisk, true);
  assert.ok(result.detailEnergyP90ToMedianRatio >= 3.5);
  assert.ok(result.warnings.some((warning) => warning.startsWith("local-detail-density-imbalance:")));
});

test("fully transparent tiles are excluded from generated-detail risk statistics", async () => {
  const image = await rgbaPng(96, 96, (x, y) => [x * 3 % 256, y * 5 % 256, 200, 0]);
  const result = await detectGeneratedDetailArtifactRisk(image, { profile: "illustration" });
  assert.equal(result.visibleTileCount, 0);
  assert.equal(result.eligibleRepeatedPatternTileCount, 0);
  assert.equal(result.repeatedDetailRisk, false);
  assert.equal(result.detailImbalanceRisk, false);
});
