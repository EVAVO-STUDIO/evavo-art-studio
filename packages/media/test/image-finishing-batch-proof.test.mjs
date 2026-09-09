import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { createImageFinishingBatchProof } from "../dist/index.js";

async function patterned(offset = 0) {
  const width = 128;
  const height = 128;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = (x * 7 + y * 11 + offset) % 256;
      const i = (y * width + x) * 4;
      raw[i] = value;
      raw[i + 1] = (value * 2 + 30) % 256;
      raw[i + 2] = (value * 5 + 60) % 256;
      raw[i + 3] = 255;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test("creates a diagnostic finishing proof ordered by batch review priority", async () => {
  const reference = await patterned(0);
  const first = await patterned(2);
  const second = await patterned(80);
  const result = await createImageFinishingBatchProof([
    { id: "first", encoded: first, reviewContext: { declaredProfile: "illustration" } },
    { id: "second", encoded: second, reviewContext: { declaredProfile: "illustration" }, visualFindings: ["malformed-text"] },
  ], {
    approvedReferences: [{ id: "approved", encoded: reference }],
    tileSize: 96,
    columns: 2,
  });

  assert.equal(result.contract, "evavo.image-finishing-batch-proof.v1");
  assert.equal(result.evidence.candidateCount, 2);
  assert.equal(result.evidence.displayedCandidateIds.length, 2);
  assert.deepEqual(result.evidence.displayedCandidateIds, result.review.reviewPriority);
  assert.equal(result.evidence.referenceCoherence.state, "coherent");
  assert.equal(result.evidence.diagnosticOnly, true);
  assert.equal(result.evidence.sourceMutationAllowed, false);
  const meta = await sharp(result.png).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.width, result.evidence.width);
  assert.equal(meta.height, result.evidence.height);
});

test("proof works without approved references and retains the full review queue when cards are capped", async () => {
  const inputs = [];
  for (let index = 0; index < 5; index += 1) {
    inputs.push({ id: `frame-${index}`, encoded: await patterned(index * 20), reviewContext: { declaredProfile: "illustration" } });
  }
  const result = await createImageFinishingBatchProof(inputs, { maximumCards: 2, tileSize: 96 });
  assert.equal(result.review.referenceCount, 0);
  assert.equal(result.evidence.referenceCoherence, null);
  assert.equal(result.evidence.displayedCandidateIds.length, 2);
  assert.equal(result.evidence.omittedCandidateCount, 3);
  assert.equal(result.evidence.reviewPriority.length, 5);
});

test("proof rendering safely escapes arbitrary candidate ids", async () => {
  const image = await patterned(0);
  const result = await createImageFinishingBatchProof([
    { id: '<frame & "one">', encoded: image, visualFindings: ["wrong-content"] },
  ], { tileSize: 96 });
  assert.ok(result.png.length > 0);
  assert.deepEqual(result.evidence.displayedCandidateIds, ['<frame & "one">']);
});
