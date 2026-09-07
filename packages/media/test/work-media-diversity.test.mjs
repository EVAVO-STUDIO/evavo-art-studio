import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { reviewWorkMediaDiversity } from "../dist/index.js";

async function solid(value) {
  return sharp({ create: { width: 64, height: 64, channels: 3, background: { r: value, g: value, b: value } } }).png().toBuffer();
}

async function split(left, right) {
  const raw = Buffer.alloc(64 * 64 * 3);
  for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) {
    const value = x < 32 ? left : right;
    const i = (y * 64 + x) * 3;
    raw[i] = value; raw[i + 1] = value; raw[i + 2] = value;
  }
  return sharp(raw, { raw: { width: 64, height: 64, channels: 3 } }).png().toBuffer();
}

test("rejects exact duplicate storytelling across Work routes", async () => {
  const image = await split(20, 220);
  const result = await reviewWorkMediaDiversity({ images: [
    { id: "a-header", route: "/work/a", role: "header", image },
    { id: "b-header", route: "/work/b", role: "header", image: Buffer.from(image) },
  ] });
  assert.equal(result.evidence.distinctnessPass, false);
  assert.equal(result.evidence.duplicatePairs.length, 1);
  assert.equal(result.evidence.duplicateClusters.length, 1);
});

test("allows clearly distinct Work imagery while keeping visual review required", async () => {
  const result = await reviewWorkMediaDiversity({ images: [
    { id: "a", route: "/work/a", image: await split(0, 255) },
    { id: "b", route: "/work/b", image: await split(255, 0) },
    { id: "c", route: "/work/c", image: await solid(128) },
  ], nearDuplicateThreshold: 0.92, reviewSimilarityThreshold: 0.84 });
  assert.equal(result.evidence.duplicatePairs.length, 0);
  assert.equal(result.evidence.visualReviewRequired, true);
  assert.equal(result.evidence.automaticReplacementAllowed, false);
});

test("validates routes and threshold ordering", async () => {
  const image = await solid(20);
  await assert.rejects(() => reviewWorkMediaDiversity({ images: [
    { id: "a", route: "/bad", image },
    { id: "b", route: "/work/b", image },
  ] }), /invalid route/u);
  await assert.rejects(() => reviewWorkMediaDiversity({ images: [
    { id: "a", image }, { id: "b", image },
  ], nearDuplicateThreshold: 0.8, reviewSimilarityThreshold: 0.9 }), /must be lower/u);
});
