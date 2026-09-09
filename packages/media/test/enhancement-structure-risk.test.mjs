import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { reviewEnhancementStructureRisk } from "../dist/index.js";

async function makePattern(width, height) {
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      raw[i] = (x * 7 + y * 3) % 256;
      raw[i + 1] = (x * 5 + y * 11) % 256;
      raw[i + 2] = (x * 13 + y * 2) % 256;
      raw[i + 3] = x < width / 8 ? 0 : 255;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("clean 2x upscale preserves macro structure", async () => {
  const source = await makePattern(64, 48);
  const candidate = await sharp(source).resize(128, 96, { kernel: "lanczos3" }).png().toBuffer();
  const risk = await reviewEnhancementStructureRisk(source, candidate);
  assert.equal(risk.candidateScaleX, 2);
  assert.equal(risk.candidateScaleY, 2);
  assert.ok(risk.globalLumaError < 0.03);
  assert.ok(risk.globalChromaError < 0.04);
  assert.ok(risk.globalAlphaError < 0.02);
  assert.ok(risk.structureRiskPatchFraction < 0.1);
});

test("broad colour redraw produces structure risk patches", async () => {
  const source = await makePattern(64, 48);
  const candidate = await sharp({
    create: { width: 128, height: 96, channels: 4, background: { r: 240, g: 30, b: 40, alpha: 1 } },
  }).png().toBuffer();
  const risk = await reviewEnhancementStructureRisk(source, candidate);
  assert.ok(risk.globalChromaError > 0.2);
  assert.ok(risk.structureRiskPatchFraction > 0.25);
});

test("silhouette alpha drift is measured independently from RGB detail", async () => {
  const source = await makePattern(64, 48);
  const candidate = await sharp(source)
    .ensureAlpha()
    .removeAlpha()
    .joinChannel(await sharp({ create: { width: 64, height: 48, channels: 1, background: 128 } }).png().toBuffer())
    .png()
    .toBuffer();
  const risk = await reviewEnhancementStructureRisk(source, candidate, { patchAlphaErrorThreshold: 0.02 });
  assert.ok(risk.globalAlphaError > 0.1);
  assert.ok(risk.alphaRiskPatchFraction > 0);
});

test("rejects a candidate smaller than the source", async () => {
  const source = await makePattern(64, 48);
  const candidate = await sharp(source).resize(32, 24).png().toBuffer();
  await assert.rejects(() => reviewEnhancementStructureRisk(source, candidate), /cannot be smaller/);
});
