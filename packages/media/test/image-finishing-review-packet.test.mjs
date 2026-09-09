import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import {
  createImageFinishingReviewBatch,
  createImageFinishingReviewPacket,
} from "../dist/index.js";

async function patterned(offset = 0) {
  const width = 128;
  const height = 128;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const value = (x * 5 + y * 7 + offset) % 256;
      raw[i] = value;
      raw[i + 1] = (value * 3 + 40) % 256;
      raw[i + 2] = (value * 5 + 80) % 256;
      raw[i + 3] = 255;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("creates a read-only packet with technical, repair and approved-reference evidence", async () => {
  const candidate = await patterned(0);
  const reference = await patterned(2);
  const packet = await createImageFinishingReviewPacket(candidate, {
    reviewContext: { declaredProfile: "illustration", filename: "candidate.png" },
    approvedReferences: [{ id: "approved", encoded: reference }],
  });

  assert.equal(packet.contract, "evavo.image-finishing-review-packet.v1");
  assert.ok(packet.technicalReview);
  assert.ok(packet.repairDecision);
  assert.ok(packet.referenceConsistency);
  assert.equal(packet.referenceConsistency.referenceCount, 1);
  assert.equal(packet.requiresHumanVisualReview, true);
  assert.equal(packet.automaticPromotionAllowed, false);
  assert.equal(packet.sourceMutationAllowed, false);
  assert.equal(packet.originAssessment.aiGenerated, "not-determined");
  assert.ok(packet.recommendedNextTools.includes("human-visual-review"));
});

test("explicit semantic visual findings force a semantic-repair disposition", async () => {
  const candidate = await patterned(0);
  const reference = await patterned(0);
  const packet = await createImageFinishingReviewPacket(candidate, {
    approvedReferences: [{ id: "approved", encoded: reference }],
    visualFindings: ["broken-anatomy", "identity-drift"],
  });
  assert.equal(packet.disposition, "semantic-repair");
  assert.equal(packet.priority, "high");
  assert.equal(packet.repairDecision.requiresMask, true);
  assert.equal(packet.repairDecision.requiresReference, true);
  assert.ok(packet.recommendedNextTools.includes("governed-provider-edit-or-inpaint"));
});

test("packet works without approved references and does not invent consistency evidence", async () => {
  const candidate = await patterned(0);
  const packet = await createImageFinishingReviewPacket(candidate, {
    reviewContext: { declaredProfile: "illustration" },
  });
  assert.equal(packet.referenceConsistency, null);
  assert.ok(packet.reasonCodes.length > 0);
  assert.ok(packet.recommendedNextTools.includes("evavo_review_image_for_finishing"));
  assert.ok(!packet.recommendedNextTools.includes("evavo_review_image_against_references"));
});

test("generated-detail signals are carried into packet reason codes", async () => {
  const width = 96;
  const height = 96;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const localX = x % 8;
      const localY = y % 8;
      const value = ((localX < 4) !== (localY < 4)) ? 220 : 35;
      const i = (y * width + x) * 4;
      raw[i] = value;
      raw[i + 1] = Math.min(255, value + 15);
      raw[i + 2] = Math.max(0, value - 10);
      raw[i + 3] = 255;
    }
  }
  const candidate = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const packet = await createImageFinishingReviewPacket(candidate, {
    reviewContext: { declaredProfile: "illustration" },
  });
  assert.equal(packet.technicalReview.generatedDetailRisk.repeatedDetailRisk, true);
  assert.ok(packet.reasonCodes.includes("generated-detail-risk:repeated-nontrivial-local-patterns"));
  assert.equal(packet.automaticPromotionAllowed, false);
});

test("batch packet shares one reference model and summarizes all candidates", async () => {
  const reference = await patterned(0);
  const close = await patterned(2);
  const changed = await patterned(90);
  const batch = await createImageFinishingReviewBatch([
    { id: "close", encoded: close, reviewContext: { declaredProfile: "illustration" } },
    { id: "changed", encoded: changed, reviewContext: { declaredProfile: "illustration" } },
  ], {
    approvedReferences: [{ id: "approved", encoded: reference }],
  });

  assert.equal(batch.contract, "evavo.image-finishing-review-batch.v1");
  assert.equal(batch.itemCount, 2);
  assert.equal(batch.referenceCount, 1);
  assert.equal(batch.referenceCoherence.state, "coherent");
  assert.equal(batch.items.length, 2);
  assert.equal(batch.reviewPriority.length, 2);
  assert.deepEqual(new Set(batch.reviewPriority), new Set(["close", "changed"]));
  assert.equal(Object.values(batch.summary.dispositions).reduce((sum, value) => sum + value, 0), 2);
  assert.equal(Object.values(batch.summary.priorities).reduce((sum, value) => sum + value, 0), 2);
  assert.equal(batch.automaticPromotionAllowed, false);
  assert.equal(batch.sourcesModified, false);
});

test("batch semantic findings remain per-image and preserve repair requirements", async () => {
  const reference = await patterned(0);
  const a = await patterned(1);
  const b = await patterned(2);
  const batch = await createImageFinishingReviewBatch([
    { id: "normal", encoded: a },
    { id: "semantic", encoded: b, visualFindings: ["malformed-text", "style-mismatch"] },
  ], {
    defaultReviewContext: { declaredProfile: "illustration" },
    approvedReferences: [{ id: "approved", encoded: reference }],
  });
  const semantic = batch.items.find((item) => item.id === "semantic").packet;
  assert.equal(semantic.disposition, "semantic-repair");
  assert.equal(semantic.repairDecision.requiresMask, true);
  assert.equal(semantic.repairDecision.requiresReference, true);
  assert.ok(batch.summary.priorities.high >= 1);
});

test("batch rejects duplicate candidate identifiers", async () => {
  const image = await patterned(0);
  await assert.rejects(
    createImageFinishingReviewBatch([
      { id: "duplicate", encoded: image },
      { id: "duplicate", encoded: image },
    ]),
    /Duplicate finishing batch id/,
  );
});
