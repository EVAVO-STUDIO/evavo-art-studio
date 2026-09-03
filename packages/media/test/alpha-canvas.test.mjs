import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";
import { normalizeAlphaCanvas } from "../dist/index.js";

test("normalizes edge-touching native alpha with deterministic transparent padding", async () => {
  const rgba = Buffer.alloc(6 * 5 * 4);
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 2; x += 1) {
      const offset = (y * 6 + x) * 4;
      rgba.set([90, 70, 40, 255], offset);
    }
  }
  const source = await sharp(rgba, { raw: { width: 6, height: 5, channels: 4 } }).png().toBuffer();
  const first = await normalizeAlphaCanvas(source, 3);
  const second = await normalizeAlphaCanvas(source, 3);
  assert.deepEqual(first.png, second.png);
  assert.deepEqual(first.evidence, {
    sourceWidth: 6,
    sourceHeight: 5,
    visibleBounds: { left: 0, top: 0, width: 2, height: 3 },
    padding: 3,
    outputWidth: 8,
    outputHeight: 9,
  });
  const decoded = await sharp(first.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(decoded.info.width, 8);
  assert.equal(decoded.info.height, 9);
  const alpha = [...decoded.data].filter((_, index) => index % 4 === 3);
  assert.equal(alpha.filter((value) => value === 255).length, 6);
  assert.equal(alpha[0], 0);
  assert.equal(alpha.at(-1), 0);
});

test("rejects empty alpha and unsafe padding", async () => {
  const empty = await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  await assert.rejects(() => normalizeAlphaCanvas(empty), /no visible pixels/i);
  await assert.rejects(() => normalizeAlphaCanvas(empty, 0), /padding/i);
});
