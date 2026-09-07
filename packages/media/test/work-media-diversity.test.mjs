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
const story = (overrides = {}) => ({
  subject: "product-ui",
  setting: "browser-ui",
  activity: "analysing",
  composition: "full-bleed-ui",
  specificity: "specific",
  motifTokens: ["dashboard", "analytics"],
  genericStockOrAiFiller: false,
  ...overrides,
});

test("rejects exact duplicate storytelling across Work routes", async () => {
  const image = await split(20, 220);
  const result = await reviewWorkMediaDiversity({ images: [
    { id: "a-header", route: "/work/a", role: "header", image, story: story() },
    { id: "b-header", route: "/work/b", role: "header", image: Buffer.from(image), story: story({ subject: "data-visualization", composition: "diagrammatic" }) },
  ], requireStoryReview: true });
  assert.equal(result.contract, "evavo.work-media-diversity.v1_2");
  assert.equal(result.evidence.similarityModel, "dhash-ahash-rgb-grid-v1");
  assert.equal(result.evidence.storySimilarityModel, "work-story-archetype-v1");
  assert.equal(result.evidence.distinctnessPass, false);
  assert.equal(result.evidence.duplicatePairs.length, 1);
  assert.equal(result.evidence.crossRouteDuplicateCount, 1);
  assert.equal(result.evidence.duplicateClusters.length, 1);
});

test("color-aware evidence avoids false cross-route duplicate from grayscale-only structure", async () => {
  const result = await reviewWorkMediaDiversity({ images: [
    { id: "red", route: "/work/red", role: "header", image: await solidRgb(255, 0, 0), story: story({ subject: "retail-shopfront", setting: "retail", activity: "purchasing", composition: "environment-wide", motifTokens: ["shopfront"] }) },
    { id: "blue", route: "/work/blue", role: "header", image: await solidRgb(0, 0, 255), story: story({ subject: "infrastructure", setting: "industrial", activity: "monitoring", composition: "diagrammatic", motifTokens: ["network"] }) },
  ], nearDuplicateThreshold: 0.92, reviewSimilarityThreshold: 0.84, requireStoryReview: true });
  assert.equal(result.evidence.duplicatePairs.length, 0);
  assert.equal(result.evidence.nearDuplicatePairs.length, 0);
  assert.equal(result.evidence.crossRouteNearDuplicateCount, 0);
  assert.equal(result.evidence.storyCollisionPairs.length, 0);
  assert.equal(result.evidence.semanticStoryReviewPassed, true);
  assert.equal(result.evidence.distinctnessPass, true);
  assert.ok(result.evidence.pairs[0].colorGridSimilarity < 0.5);
});

test("catches same generic visual story even when pixels differ", async () => {
  const result = await reviewWorkMediaDiversity({ images: [
    { id: "one", route: "/work/one", role: "header", image: await solidRgb(220, 40, 40), story: story({ subject: "person-at-device", setting: "office", activity: "analysing", composition: "person-with-screen", motifTokens: ["laptop", "desk"] }) },
    { id: "two", route: "/work/two", role: "header", image: await solidRgb(30, 30, 220), story: story({ subject: "person-at-device", setting: "office", activity: "analysing", composition: "person-with-screen", motifTokens: ["laptop", "desk"] }) },
  ], requireStoryReview: true });
  assert.equal(result.evidence.perceptualDistinctnessPass, true);
  assert.equal(result.evidence.crossRouteStoryCollisionCount, 1);
  assert.equal(result.evidence.storyPairs[0].classification, "story-duplicate");
  assert.equal(result.evidence.semanticStoryReviewPassed, false);
  assert.equal(result.evidence.distinctnessPass, false);
});

test("rejects explicit generic stock or AI filler story review", async () => {
  const result = await reviewWorkMediaDiversity({ images: [
    { id: "candidate", route: "/work/a", role: "header", image: await solidRgb(200, 30, 30), story: story({ specificity: "generic", genericStockOrAiFiller: true }) },
    { id: "other", route: "/work/b", role: "header", image: await solidRgb(30, 200, 30), story: story({ subject: "infrastructure", setting: "industrial", activity: "monitoring", composition: "environment-wide", motifTokens: ["operations"] }) },
  ], requireStoryReview: true });
  assert.deepEqual(result.evidence.genericOrFillerItems, ["candidate"]);
  assert.equal(result.evidence.storyReviewComplete, true);
  assert.equal(result.evidence.semanticStoryReviewPassed, false);
  assert.equal(result.evidence.distinctnessPass, false);
});

test("fails story distinctness when mandatory semantic review is incomplete", async () => {
  const result = await reviewWorkMediaDiversity({ images: [
    { id: "a", route: "/work/a", image: await solid(20), story: story() },
    { id: "b", route: "/work/b", image: await solid(220) },
  ], requireStoryReview: true });
  assert.equal(result.evidence.storyReviewComplete, false);
  assert.deepEqual(result.evidence.missingStoryReviewIds, ["b"]);
  assert.equal(result.evidence.storyDistinctnessPass, false);
  assert.equal(result.evidence.distinctnessPass, false);
});

test("same-route exact reuse does not count as cross-route repetition", async () => {
  const image = await split(0, 255);
  const result = await reviewWorkMediaDiversity({ images: [
    { id: "tile", route: "/work/a", role: "tile", image, story: story() },
    { id: "header", route: "/work/a", role: "header", image: Buffer.from(image), story: story() },
  ], requireStoryReview: true });
  assert.equal(result.evidence.duplicatePairs.length, 1);
  assert.equal(result.evidence.crossRouteDuplicateCount, 0);
  assert.equal(result.evidence.crossRouteStoryCollisionCount, 0);
  assert.equal(result.evidence.distinctnessPass, true);
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
  await assert.rejects(() => reviewWorkMediaDiversity({ images: [
    { id: "a", image }, { id: "b", image },
  ], storyCollisionThreshold: 0.6, storyReviewThreshold: 0.7 }), /storyReviewThreshold must be lower/u);
});
