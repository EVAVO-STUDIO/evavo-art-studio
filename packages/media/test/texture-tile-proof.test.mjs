import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { createTextureTileProofWithSampling } from "../dist/index.js";

async function gradient(width, height) {
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      raw[i] = Math.round(255 * x / Math.max(1, width - 1));
      raw[i + 1] = Math.round(255 * y / Math.max(1, height - 1));
      raw[i + 2] = (x * 7 + y * 11) % 256;
      raw[i + 3] = 255;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("continuous proof downsizes with an explicit continuous sampling receipt", async () => {
  const source = await gradient(1024, 512);
  const proof = await createTextureTileProofWithSampling(source, 256);
  assert.equal(proof.evidence.sampling, "continuous");
  assert.equal(proof.evidence.resized, true);
  assert.equal(proof.evidence.tileWidth, 256);
  assert.equal(proof.evidence.tileHeight, 128);
  assert.equal(proof.evidence.proofWidth, 768);
  assert.equal(proof.evidence.proofHeight, 384);
  const meta = await sharp(proof.png).metadata();
  assert.equal(meta.width, 768);
  assert.equal(meta.height, 384);
});

test("nearest-neighbour sampling is explicit for pixel or texel inspection", async () => {
  const source = await gradient(256, 128);
  const proof = await createTextureTileProofWithSampling(source, 64, "nearest");
  assert.equal(proof.evidence.sampling, "nearest");
  assert.equal(proof.evidence.resized, true);
  assert.equal(proof.evidence.tileWidth, 64);
  assert.equal(proof.evidence.tileHeight, 32);
});

test("proof does not resample when the source already fits the requested bound", async () => {
  const source = await gradient(80, 40);
  const proof = await createTextureTileProofWithSampling(source, 512, "continuous");
  assert.equal(proof.evidence.resized, false);
  assert.equal(proof.evidence.tileWidth, 80);
  assert.equal(proof.evidence.tileHeight, 40);
});

test("rejects unsupported sampling and unsafe preview bounds", async () => {
  const source = await gradient(32, 32);
  await assert.rejects(
    () => createTextureTileProofWithSampling(source, 512, "bilinear"),
    /continuous or nearest/,
  );
  await assert.rejects(
    () => createTextureTileProofWithSampling(source, 32, "continuous"),
    /64 through 2048/,
  );
});
