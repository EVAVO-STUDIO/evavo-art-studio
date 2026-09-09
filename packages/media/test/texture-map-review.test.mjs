import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { createTextureTileProof, reviewTextureMap } from "../dist/index.js";

async function solid(width, height, rgba) {
  return sharp({
    create: { width, height, channels: 4, background: { r: rgba[0], g: rgba[1], b: rgba[2], alpha: rgba[3] / 255 } },
  }).png().toBuffer();
}

test("accepts a flat tangent-space normal map", async () => {
  const source = await solid(16, 16, [128, 128, 255, 255]);
  const result = await reviewTextureMap(source, { kind: "normal-tangent", expectSeamless: true });
  assert.equal(result.grade, "pass");
  assert.ok(result.normal.bluePositiveRatio > 0.99);
  assert.ok(result.normal.meanVectorLengthError < 0.02);
  assert.equal(result.leftRightSeamError, 0);
  assert.equal(result.topBottomSeamError, 0);
});

test("rejects scalar maps with strong RGB contamination", async () => {
  const source = await solid(16, 16, [220, 40, 110, 255]);
  const result = await reviewTextureMap(source, { kind: "roughness" });
  assert.equal(result.grade, "fail");
  assert.match(result.blockers.join(","), /scalar-map-has-colour-contamination/);
});

test("rejects tangent normals dominated by negative Z", async () => {
  const source = await solid(16, 16, [128, 128, 40, 255]);
  const result = await reviewTextureMap(source, { kind: "normal-tangent" });
  assert.equal(result.grade, "fail");
  assert.match(result.blockers.join(","), /blue-positive-ratio-too-low/);
});

test("flags opposite-edge mismatch when seamless delivery is expected", async () => {
  const width = 8;
  const height = 8;
  const raw = Buffer.alloc(width * height * 4, 255);
  for (let y = 0; y < height; y += 1) {
    const left = (y * width) * 4;
    raw[left] = 0; raw[left + 1] = 0; raw[left + 2] = 0;
    const right = (y * width + width - 1) * 4;
    raw[right] = 255; raw[right + 1] = 255; raw[right + 2] = 255;
  }
  const source = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const result = await reviewTextureMap(source, {
    kind: "base-color",
    expectSeamless: true,
    maximumSeamError: 0.08,
  });
  assert.equal(result.grade, "fail");
  assert.match(result.blockers.join(","), /seam-error-exceeds-limit/);
});

test("creates a bounded 3x3 tile proof", async () => {
  const source = await solid(100, 50, [120, 120, 120, 255]);
  const proof = await createTextureTileProof(source, 64);
  assert.equal(proof.evidence.tileWidth, 64);
  assert.equal(proof.evidence.tileHeight, 32);
  assert.equal(proof.evidence.proofWidth, 192);
  assert.equal(proof.evidence.proofHeight, 96);
  const meta = await sharp(proof.png).metadata();
  assert.equal(meta.width, 192);
  assert.equal(meta.height, 96);
});
