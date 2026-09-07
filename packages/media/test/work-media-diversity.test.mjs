import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { reviewWorkMediaDiversity } from "../dist/index.js";

async function solid(value) {
  return sharp({ create: { width: 64, height: 64, channels: 3, background: { r: value, g: value, b: value } } }).png().toBuffer();
}

async function solidRgb(r, g, b) {
  return sharp({ create: { width: 64, height: 64, channels: 3, background: { r, g, b } } }).png().toBuffer();
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
  assert.equal(result.contract, "evavo.work-media-diversity.v1_1");
  assert.equal(result.evidence.similarityModel, "dhash-ahash-rgb-grid-v1");
  assert.equal(result.evidence.distinctnessPass, false);
  assert.equal(result.evidence.duplicatePairs.length, 1);
  assert.equal(result.evidence.duplicateClusters.length, 1);
  assert.equal(result.evidence.pairs[0].colorGridSimilarity, 1);
});

test("color-aware evidence avoids false cross-route duplicate from grayscale-only structure", async () => {
  const result = await reviewWorkMediaDiversity({ images: [
    { id: "red", route: "/work/red", role: "header", image: await solidRgb(255, 0, 0) },
    { id: "blue", route: "/work/blue", role: "header", image: await solidRgb(0, 0, 255) },
  ], nearDuplicateThreshold: 0.92, reviewSimilarityThreshold: 0.84 });
  assert.equal(result.evidence.duplicatePairs.length, 0);
  assert.equal(result.evidence.nearDuplicatePairs.length, 0);
  assert.equal(result.evidence.crossRouteNearDuplicateCount, 0);
  assert.equal(result.evidence.distinctnessPass, true);
  assert.equal(result.evidence.pairs[0].differenceHashSimilarity, 1);
  assert.equal(result.evidence.pairs[0].averageHashSimilarity, 1);
  assert.ok(result.evidence.pairs[0].colorGridSimilarity < 0.5);
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
  for (const pair of result.evidence.pairs) {
    assert.equal(typeof pair.differenceHashSimilarity, "number");
    assert.equal(typeof pair.averageHashSimilarity, "number");
    assert.equal(typeof pair.colorGridSimilarity, "number");
    assert.equal(typeof pair.colorGridMeanAbsoluteDifference, "number");
  }
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
