import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { createImageSequenceFinishingReview } from "../dist/image-sequence-finishing-review.js";

async function patterned(offset = 0, width = 128, height = 128) {
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = (x * 5 + y * 7 + offset) % 256;
      const i = (y * width + x) * 4;
      raw[i] = value;
      raw[i + 1] = (value * 3 + 40) % 256;
      raw[i + 2] = (value * 5 + 80) % 256;
      raw[i + 3] = 255;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("reviews an ordered sequence with shared finishing and continuity evidence", async () => {
  const reference = await patterned(0);
  const frames = [
    { id: "f1", encoded: await patterned(1), durationMs: 83, reviewContext: { declaredProfile: "cel-animation-frame" } },
    { id: "f2", encoded: await patterned(2), durationMs: 83, reviewContext: { declaredProfile: "cel-animation-frame" } },
    { id: "f3", encoded: await patterned(3), durationMs: 83, reviewContext: { declaredProfile: "cel-animation-frame" } },
  ];
  const result = await createImageSequenceFinishingReview(frames, {
    approvedReferences: [{ id: "approved", encoded: reference }],
  });

  assert.equal(result.contract, "evavo.image-sequence-finishing-review.v1");
  assert.equal(result.frameCount, 3);
  assert.equal(result.batch.itemCount, 3);
  assert.equal(result.batch.referenceCount, 1);
  assert.equal(result.frames.length, 3);
  assert.equal(result.neighbors.length, 2);
  assert.equal(result.visualReviewRequired, true);
  assert.equal(result.automaticPromotionAllowed, false);
  assert.equal(result.sourcesModified, false);
  assert.equal(result.reviewPriority.length, 3);
});

test("flags a canvas-size outlier and pushes it toward the front of review priority", async () => {
  const result = await createImageSequenceFinishingReview([
    { id: "f1", encoded: await patterned(1, 128, 128), reviewContext: { declaredProfile: "cel-animation-frame" } },
    { id: "bad-size", encoded: await patterned(2, 160, 128), reviewContext: { declaredProfile: "cel-animation-frame" } },
    { id: "f3", encoded: await patterned(3, 128, 128), reviewContext: { declaredProfile: "cel-animation-frame" } },
  ]);
  const bad = result.frames.find((frame) => frame.id === "bad-size");
  assert.ok(bad.flags.includes("canvas-size-outlier"));
  assert.ok(result.setWarnings.includes("technical-frame-continuity-outliers-present") || bad.continuityRisk === "review");
  assert.ok(result.reviewPriority.indexOf("bad-size") <= 1);
  assert.notEqual(result.sequenceDecision, "pass-to-visual-review");
});

test("identical neighboring frames are review evidence rather than an automatic sequence rejection", async () => {
  const held = await patterned(5);
  const result = await createImageSequenceFinishingReview([
    { id: "hold-a", encoded: held, durationMs: 100, reviewContext: { declaredProfile: "cel-animation-frame" } },
    { id: "hold-b", encoded: held, durationMs: 100, reviewContext: { declaredProfile: "cel-animation-frame" } },
  ]);
  assert.equal(result.neighbors.length, 1);
  assert.ok(result.neighbors[0].flags.includes("exact-or-effectively-duplicate-neighbor"));
  assert.ok(result.setWarnings.some((warning) => warning.includes("intentional animation holds")));
  assert.notEqual(result.sequenceDecision, "reject");
});

test("duplicate neighbor review can be explicitly suppressed for authored holds", async () => {
  const held = await patterned(5);
  const result = await createImageSequenceFinishingReview([
    { id: "hold-a", encoded: held, reviewContext: { declaredProfile: "cel-animation-frame" } },
    { id: "hold-b", encoded: held, reviewContext: { declaredProfile: "cel-animation-frame" } },
  ], { duplicateNeighborPolicy: "ignore" });
  assert.deepEqual(result.neighbors[0].flags, []);
  assert.ok(!result.setWarnings.some((warning) => warning.includes("duplicate-neighbor")));
});

test("semantic findings stay attached to their frame inside sequence finishing", async () => {
  const result = await createImageSequenceFinishingReview([
    { id: "good", encoded: await patterned(1), reviewContext: { declaredProfile: "cel-animation-frame" } },
    { id: "semantic", encoded: await patterned(2), reviewContext: { declaredProfile: "cel-animation-frame" }, visualFindings: ["identity-drift"] },
  ]);
  const semantic = result.batch.items.find((item) => item.id === "semantic").packet;
  assert.equal(semantic.disposition, "semantic-repair");
  assert.equal(semantic.priority, "high");
  assert.equal(result.reviewPriority[0], "semantic");
});
