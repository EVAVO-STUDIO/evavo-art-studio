import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { finalizeTileMapReview } from "../dist/tile-map-review-finalize.js";

async function fixture({ wrongFingerprint = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-tile-map-finalize-"));
  const review = {
    schema_version: 1,
    source_batch_sha256: "a".repeat(64),
    source_batch_fingerprint: "b".repeat(64),
    source_package_fingerprint: "c".repeat(64),
    source_map_fingerprint: "d".repeat(64),
    map_id: "map",
    projection: "orthogonal",
    candidates: [
      {
        candidate_id: "candidate-1",
        task_id: "task-grass",
        visual_family: "epochbound:verdant:terrain:grass",
        path: "candidates/grass/01.png",
        sha256: "e".repeat(64),
      },
      {
        candidate_id: "candidate-2",
        task_id: "task-grass",
        visual_family: "epochbound:verdant:terrain:grass",
        path: "candidates/grass/02.png",
        sha256: "f".repeat(64),
      },
    ],
    authority: {},
    status: "awaiting-review",
    review_fingerprint: "1".repeat(64),
  };
  const reviewPath = path.join(root, "review.json");
  await writeFile(reviewPath, JSON.stringify(review));
  const decisions = {
    schema_version: 1,
    source_review_fingerprint: wrongFingerprint ? "2".repeat(64) : "1".repeat(64),
    reviewed_by: "EVAVO creative review",
    reviewed_at: "2026-08-30T00:00:00Z",
    candidates: [
      { candidate_id: "candidate-1", structural: "approved", visual: "approved", creative: "approved", notes: "best variant" },
      { candidate_id: "candidate-2", structural: "approved", visual: "rejected", creative: "rejected", notes: "too noisy" },
    ],
  };
  const decisionsPath = path.join(root, "decisions.json");
  await writeFile(decisionsPath, JSON.stringify(decisions));
  return { reviewPath, decisionsPath };
}

test("finalization selects only candidates passing structural visual and creative review", async () => {
  const input = await fixture();
  const result = await finalizeTileMapReview(input.reviewPath, input.decisionsPath);
  assert.equal(result.status, "review-finalized");
  assert.equal(result.tasks.length, 1);
  assert.deepEqual(result.tasks[0].approved_sources, [
    { path: "candidates/grass/01.png", sha256: "e".repeat(64) },
  ]);
  assert.equal(result.candidates[1].visual, "rejected");
  assert.equal(result.candidates[1].creative, "rejected");
  assert.match(result.finalization_fingerprint, /^[0-9a-f]{64}$/u);
});

test("rejects decisions targeting a different review", async () => {
  const input = await fixture({ wrongFingerprint: true });
  await assert.rejects(
    () => finalizeTileMapReview(input.reviewPath, input.decisionsPath),
    /do not target this exact review fingerprint/u,
  );
});
