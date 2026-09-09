import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";
import {
  reviewImageReferenceConsistency,
  reviewImageReferenceConsistencyBatch,
} from "../dist/index.js";

async function solid(r, g, b, width = 64, height = 64) {
  return sharp({ create: { width, height, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer();
}

async function transparentSubject(left) {
  return sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: { create: { width: 24, height: 32, channels: 4, background: { r: 210, g: 55, b: 55, alpha: 1 } } }, left, top: 16 }])
    .png()
    .toBuffer();
}

test("accepts a close visual match against an approved reference", async () => {
  const reference = await solid(180, 40, 40);
  const candidate = await solid(185, 45, 45);
  const result = await reviewImageReferenceConsistency(candidate, [{ id: "approved", encoded: reference }]);
  assert.equal(result.grade, "pass");
  assert.equal(result.decision, "consistent");
  assert.equal(result.referenceCoherence.state, "coherent");
  assert.ok(result.distance.composite < 0.05);
  assert.equal(result.aiOriginDetection, "not-claimed");
  assert.equal(result.semanticReviewRequired, true);
});

test("flags strong palette drift without claiming semantic identity failure", async () => {
  const reference = await solid(180, 40, 40);
  const candidate = await solid(30, 40, 220);
  const result = await reviewImageReferenceConsistency(candidate, [{ id: "approved", encoded: reference }]);
  assert.equal(result.grade, "warn");
  assert.equal(result.decision, "review-drift");
  assert.ok(result.flags.some((flag) => flag.startsWith("palette-distribution-drift:")));
  assert.match(result.interpretation, /does not prove semantic identity/);
});

test("can fail closed at a stricter declared distance threshold", async () => {
  const reference = await solid(180, 40, 40);
  const candidate = await solid(30, 40, 220);
  const result = await reviewImageReferenceConsistency(candidate, [{ id: "approved", encoded: reference }], {
    warnDistance: 0.08,
    failDistance: 0.16,
  });
  assert.equal(result.grade, "fail");
  assert.equal(result.decision, "reject-technical-drift");
});

test("detects transparent silhouette and occupancy drift", async () => {
  const reference = await transparentSubject(8);
  const candidate = await transparentSubject(32);
  const result = await reviewImageReferenceConsistency(candidate, [{ id: "pose-anchor", encoded: reference }]);
  assert.equal(result.grade, "warn");
  assert.ok(result.distance.silhouette > 0.18);
  assert.ok(result.flags.some((flag) => flag.startsWith("silhouette-or-occupancy-drift:")));
});

test("marks a conflicting approved reference set as mixed instead of pretending the baseline is authoritative", async () => {
  const red = await solid(180, 40, 40);
  const blue = await solid(30, 40, 220);
  const result = await reviewImageReferenceConsistency(red, [
    { id: "red-style", encoded: red },
    { id: "blue-style", encoded: blue },
  ]);
  assert.equal(result.referenceCoherence.state, "mixed");
  assert.equal(result.grade, "warn");
  assert.equal(result.decision, "review-drift");
});

test("batch review ranks the strongest technical visual drift first", async () => {
  const reference = await solid(180, 40, 40);
  const close = await solid(184, 44, 44);
  const different = await solid(30, 40, 220);
  const batch = await reviewImageReferenceConsistencyBatch([
    { id: "close", encoded: close },
    { id: "different", encoded: different },
  ], [{ id: "approved", encoded: reference }]);
  assert.deepEqual(batch.reviewPriority, ["different", "close"]);
  assert.equal(batch.results.find((item) => item.id === "close").review.grade, "pass");
  assert.equal(batch.results.find((item) => item.id === "different").review.grade, "warn");
});
