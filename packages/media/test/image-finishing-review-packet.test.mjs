import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { createImageFinishingReviewPacket } from "../dist/index.js";

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
