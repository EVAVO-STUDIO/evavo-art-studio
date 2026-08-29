import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { compileTileMapCandidateReview } from "../dist/tile-map-candidate-review.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");

async function fixture({
  duplicate = false,
  wrongFingerprint = false,
  wrongSize = false,
  badAuthority = false,
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-tile-map-review-"));
  const jobs = [];
  const candidates = [];
  for (let index = 0; index < 2; index += 1) {
    const candidateId = `candidate-${index}`;
    const output = `candidates/grass/${String(index + 1).padStart(2, "0")}.png`;
    const absolute = path.join(root, ...output.split("/"));
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(path.dirname(absolute), { recursive: true }),
    );
    const bytes = duplicate && index === 1
      ? await import("node:fs/promises").then(({ readFile }) =>
          readFile(path.join(root, "candidates", "grass", "01.png")),
        )
      : await sharp({
          create: {
            width: wrongSize && index === 0 ? 17 : 16,
            height: 16,
            channels: 4,
            background: { r: 30 + index * 20, g: 120, b: 60, alpha: 1 },
          },
        })
          .png()
          .toBuffer();
    await writeFile(absolute, bytes);
    jobs.push({
      candidate_id: candidateId,
      task_id: "grass-task",
      visual_family: "epochbound:verdant:terrain:grass",
      candidate_index: index,
      projection: "orthogonal",
      dimensions: { width: 16, height: 16 },
      alpha_required: false,
      output_path: output,
    });
    candidates.push({
      candidate_id: candidateId,
      path: output,
      sha256: sha(bytes),
    });
  }
  const batch = {
    schema_version: 1,
    source_package_sha256: "a".repeat(64),
    source_package_fingerprint: "b".repeat(64),
    source_map_fingerprint: "c".repeat(64),
    map_id: "epochbound:bellweather:verdant",
    consumer_adapter: "epochbound",
    projection: "orthogonal",
    jobs,
    authority: {},
    status: "ready-for-provider-candidates",
    batch_fingerprint: "d".repeat(64),
  };
  const batchPath = path.join(root, "batch.json");
  await writeFile(batchPath, JSON.stringify(batch));
  const results = {
    schema_version: 1,
    source_batch_fingerprint: wrongFingerprint
      ? "e".repeat(64)
      : "d".repeat(64),
    source_provider_batch_fingerprint: "f".repeat(64),
    source_execution_sha256: "1".repeat(64),
    source_map_fingerprint: "c".repeat(64),
    candidates,
    authority: {
      provider_output_authority: badAuthority ? "approved" : "intermediate-only",
      review_required: true,
      approval_authority: false,
    },
  };
  const resultsPath = path.join(root, "results.json");
  await writeFile(resultsPath, JSON.stringify(results));
  return { batchPath, resultsPath };
}

test("admits exact authorized provider outputs with all approval states pending", async () => {
  const input = await fixture();
  const result = await compileTileMapCandidateReview(
    input.batchPath,
    input.resultsPath,
  );
  assert.equal(result.status, "awaiting-review");
  assert.equal(result.candidates.length, 2);
  assert.equal(result.source_provider_batch_fingerprint, "f".repeat(64));
  assert.equal(result.source_execution_sha256, "1".repeat(64));
  assert.equal(result.authority.execution_evidence_required, true);
  assert.equal(result.candidates[0].structural_review, "pending");
  assert.equal(result.candidates[0].visual_review, "pending");
  assert.equal(result.candidates[0].creative_review, "pending");
  assert.equal(result.candidates[0].promotion_eligible, false);
  assert.match(result.review_fingerprint, /^[0-9a-f]{64}$/u);
});

test("rejects candidate results from a different candidate batch", async () => {
  const input = await fixture({ wrongFingerprint: true });
  await assert.rejects(
    () => compileTileMapCandidateReview(input.batchPath, input.resultsPath),
    /do not target this exact batch fingerprint/u,
  );
});

test("rejects results that claim provider approval authority", async () => {
  const input = await fixture({ badAuthority: true });
  await assert.rejects(
    () => compileTileMapCandidateReview(input.batchPath, input.resultsPath),
    /do not preserve authorized provider intermediate\/review-only authority/u,
  );
});

test("rejects duplicate candidate pixels", async () => {
  const input = await fixture({ duplicate: true });
  await assert.rejects(
    () => compileTileMapCandidateReview(input.batchPath, input.resultsPath),
    /duplicates another candidate's exact bytes/u,
  );
});

test("rejects provider output with wrong canvas", async () => {
  const input = await fixture({ wrongSize: true });
  await assert.rejects(
    () => compileTileMapCandidateReview(input.batchPath, input.resultsPath),
    /is 17x16; expected 16x16/u,
  );
});
