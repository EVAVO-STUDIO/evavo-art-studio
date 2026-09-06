import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { compareWorkHeaderCandidates, judgeWorkHeaderVisualCritique } from "../dist/index.js";

async function image(width, height, seed) {
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      raw[i] = (x + seed) % 255;
      raw[i + 1] = (y * 2 + seed) % 255;
      raw[i + 2] = (x + y + seed) % 255;
      raw[i + 3] = 255;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("candidate board includes hash-bound current technical baseline but never a creative winner", async () => {
  const current = await image(1920, 1080, 2);
  const a = await image(1920, 1080, 10);
  const b = await image(1920, 1080, 80);
  const result = await compareWorkHeaderCandidates({
    candidates: [{ id: "a", image: a }, { id: "b", image: b }],
    currentHeader: current,
  });
  assert.ok(result.evidence.currentHeader);
  assert.match(result.evidence.currentHeader.imageSha256, /^[0-9a-f]{64}$/u);
  assert.match(result.evidence.candidates[0].imageSha256, /^[0-9a-f]{64}$/u);
  assert.equal(result.evidence.critiqueHashBindingRequired, true);
  assert.equal(typeof result.evidence.currentHeader.technicalScore, "number");
  assert.equal(result.evidence.currentHeaderBaselineRequiredForReplacement, true);
  assert.equal(result.evidence.creativeWinner, null);
  assert.equal(result.evidence.finalSelectionAllowed, false);
  assert.equal(result.evidence.visualCritiqueRequired, true);
  assert.ok(result.proofPng.length > 0);
});

test("exact support duplicate is not technically eligible", async () => {
  const a = await image(1920, 1080, 10);
  const b = await image(1920, 1080, 80);
  const result = await compareWorkHeaderCandidates({
    candidates: [{ id: "same-support", image: a }, { id: "other", image: b }],
    supportImage: a,
  });
  const duplicate = result.evidence.candidates.find((item) => item.id === "same-support");
  assert.equal(duplicate.exactDuplicateOfSupport, true);
  assert.equal(duplicate.technicallyEligibleForVisualReview, false);
});

test("visual critique rejects AI-looking header and carries exact image hash", () => {
  const result = judgeWorkHeaderVisualCritique({
    candidateId: "candidate-a",
    candidateSha256: "a".repeat(64),
    semanticRelevance: 4.5,
    focalPointStrength: 4.5,
    cropStability: 4.5,
    hierarchyCompatibility: 4.5,
    brandFit: 4.5,
    authenticity: 4.0,
    detailCredibility: 4.0,
    supportImageDistinctness: 4.5,
    deliberateDesignerChoice: 4.5,
    looksGenericOrStock: false,
    looksAiGeneratedOrMalformed: true,
    looksBlurryOrCheap: false,
    textOrLogoDamage: false,
    mobileCropFailure: false,
    notes: ["Visible AI-like malformed detail in focal area."],
  });
  assert.equal(result.candidateSha256, "a".repeat(64));
  assert.equal(result.exactImageHashBound, true);
  assert.equal(result.verdict, "reject");
  assert.equal(result.eligibleForFinalSelection, false);
  assert.equal(result.automaticPublicationAllowed, false);
});
