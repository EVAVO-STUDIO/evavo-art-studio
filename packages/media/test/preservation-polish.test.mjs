import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { polishExistingRasterPreservingArtwork } from "../dist/index.js";

test("preserves opaque artwork while clearing dirty transparent RGB", async () => {
  const width = 5;
  const height = 3;
  const raw = Buffer.alloc(width * height * 4);
  for (let i = 0; i < raw.length; i += 4) {
    raw[i] = 255;
    raw[i + 1] = 255;
    raw[i + 2] = 255;
    raw[i + 3] = 0;
  }
  const center = (1 * width + 2) * 4;
  raw[center] = 255;
  raw[center + 1] = 36;
  raw[center + 2] = 78;
  raw[center + 3] = 255;
  const source = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();

  const result = await polishExistingRasterPreservingArtwork(source, {
    decontaminateFringe: false,
  });
  assert.equal(result.evidence.changedOpaqueRgbPixels, 0);
  assert.equal(result.evidence.preservationPassed, true);
  assert.ok(result.evidence.clearedTransparentRgbPixels > 0);

  const decoded = await sharp(result.buffer).ensureAlpha().raw().toBuffer();
  assert.equal(decoded[center], 255);
  assert.equal(decoded[center + 1], 36);
  assert.equal(decoded[center + 2], 78);
  assert.equal(decoded[center + 3], 255);
  assert.equal(decoded[0], 0);
  assert.equal(decoded[1], 0);
  assert.equal(decoded[2], 0);
  assert.equal(decoded[3], 0);
});

test("decontaminates a semi-transparent white halo using nearby opaque artwork colour", async () => {
  const width = 7;
  const height = 7;
  const raw = Buffer.alloc(width * height * 4);
  const set = (x, y, r, g, b, a) => {
    const i = (y * width + x) * 4;
    raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
  };
  for (let y = 2; y <= 4; y += 1) {
    for (let x = 2; x <= 4; x += 1) set(x, y, 220, 24, 52, 255);
  }
  set(1, 3, 255, 255, 255, 128);
  set(5, 3, 255, 255, 255, 128);
  const source = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();

  const result = await polishExistingRasterPreservingArtwork(source, {
    fringeRadius: 2,
    donorAlphaThreshold: 245,
  });
  assert.equal(result.evidence.changedOpaqueRgbPixels, 0);
  assert.ok(result.evidence.fringeRepairedPixels >= 2);

  const decoded = await sharp(result.buffer).ensureAlpha().raw().toBuffer();
  const left = (3 * width + 1) * 4;
  assert.equal(decoded[left], 220);
  assert.equal(decoded[left + 1], 24);
  assert.equal(decoded[left + 2], 52);
  assert.equal(decoded[left + 3], 128);
});
