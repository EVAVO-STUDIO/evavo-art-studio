import assert from "node:assert/strict";
import test from "node:test";

import sharp from "../node_modules/sharp/lib/index.js";
import { createImageReferenceConsistencyProof } from "../dist/index.js";

async function solid(r, g, b) {
  return sharp({ create: { width: 64, height: 64, channels: 4, background: { r, g, b, alpha: 1 } } }).png().toBuffer();
}

test("creates a bounded diagnostic proof with approved references and worst candidates first", async () => {
  const reference = await solid(180, 40, 40);
  const close = await solid(184, 44, 44);
  const different = await solid(30, 40, 220);
  const result = await createImageReferenceConsistencyProof([
    { id: "close", encoded: close },
    { id: "different", encoded: different },
  ], [{ id: "approved", encoded: reference }], {
    tileSize: 96,
    columns: 2,
  });

  assert.equal(result.evidence.tileSize, 96);
  assert.equal(result.evidence.columns, 2);
  assert.deepEqual(result.evidence.displayedReferenceIds, ["approved"]);
  assert.deepEqual(result.evidence.displayedCandidateIds, ["different", "close"]);
  assert.equal(result.evidence.diagnosticOnly, true);
  assert.equal(result.evidence.sourceMutationAllowed, false);
  const meta = await sharp(result.png).metadata();
  assert.equal(meta.width, result.evidence.width);
  assert.equal(meta.height, result.evidence.height);
  assert.equal(meta.format, "png");
});

test("proof card limits do not change full batch priority evidence", async () => {
  const reference = await solid(180, 40, 40);
  const candidates = [];
  for (let index = 0; index < 5; index += 1) {
    candidates.push({ id: `candidate-${index}`, encoded: await solid(180 - index * 20, 40, 40 + index * 25) });
  }
  const result = await createImageReferenceConsistencyProof(candidates, [{ id: "approved", encoded: reference }], {
    maximumCandidateCards: 2,
  });
  assert.equal(result.evidence.displayedCandidateIds.length, 2);
  assert.equal(result.evidence.omittedCandidateCount, 3);
  assert.equal(result.evidence.reviewPriority.length, 5);
});

test("proof rendering escapes arbitrary IDs before inserting SVG labels", async () => {
  const image = await solid(120, 120, 120);
  const result = await createImageReferenceConsistencyProof(
    [{ id: '<candidate & "x">', encoded: image }],
    [{ id: "<approved&>", encoded: image }],
    { tileSize: 96 },
  );
  assert.ok(result.png.length > 0);
  assert.deepEqual(result.evidence.displayedCandidateIds, ['<candidate & "x">']);
});
