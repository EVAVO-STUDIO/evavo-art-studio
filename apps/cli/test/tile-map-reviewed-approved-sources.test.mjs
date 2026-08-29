import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { compileReviewedApprovedSourcesManifest } from "../dist/tile-map-reviewed-approved-sources.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");

async function fixture({ bypass = false, wrongReview = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-tile-map-reviewed-approval-"));
  const bytes = await sharp({ create: { width: 16, height: 16, channels: 4, background: { r: 42, g: 130, b: 70, alpha: 1 } } }).png().toBuffer();
  await writeFile(path.join(root, "candidate.png"), bytes);
  const sourcePackage = {
    schema_version: 1,
    source_plan_sha256: "a".repeat(64),
    source_plan_fingerprint: "b".repeat(64),
    source_map_fingerprint: "c".repeat(64),
    map_id: "map",
    consumer_adapter: "epochbound",
    production_profile: "snes-topdown-rpg",
    projection: "orthogonal",
    tasks: [{
      task_id: "task-grass",
      visual_family: "epochbound:verdant:terrain:grass",
      task_kind: "tile-family",
      projection: "orthogonal",
      dimensions: { width: 16, height: 16 },
      required_approved_variants: 1,
      candidate_count: 4,
      alpha_required: false,
      semantic_source_ids: ["grass"],
      immutable_semantic_rules: ["Preserve gameplay semantics."],
      creative_direction: ["SNES terrain."],
      topology: null,
      feature_kind: null,
    }],
    authority: {},
    promotion_policy: {},
    status: "ready-for-candidate-authoring",
    package_fingerprint: "d".repeat(64),
  };
  const packagePath = path.join(root, "source-package.json");
  await writeFile(packagePath, JSON.stringify(sourcePackage));
  const review = {
    schema_version: 1,
    source_batch_sha256: "e".repeat(64),
    source_batch_fingerprint: "f".repeat(64),
    source_package_fingerprint: "d".repeat(64),
    source_map_fingerprint: "c".repeat(64),
    map_id: "map",
    projection: "orthogonal",
    candidates: [{
      candidate_id: "candidate-1",
      task_id: "task-grass",
      visual_family: "epochbound:verdant:terrain:grass",
      path: "candidate.png",
      sha256: sha(bytes),
    }],
    authority: {},
    status: "awaiting-review",
    review_fingerprint: "1".repeat(64),
  };
  const reviewPath = path.join(root, "review.json");
  await writeFile(reviewPath, JSON.stringify(review));
  const approved = bypass ? "rejected" : "approved";
  const finalization = {
    schema_version: 1,
    source_review_fingerprint: wrongReview ? "2".repeat(64) : "1".repeat(64),
    source_package_fingerprint: "d".repeat(64),
    source_map_fingerprint: "c".repeat(64),
    map_id: "map",
    projection: "orthogonal",
    creative_approval: {
      decision: "approved",
      approved_by: "EVAVO creative review",
      approved_at: "2026-08-30T00:00:00Z",
    },
    candidates: [{
      candidate_id: "candidate-1",
      task_id: "task-grass",
      visual_family: "epochbound:verdant:terrain:grass",
      path: "candidate.png",
      sha256: sha(bytes),
      structural: "approved",
      visual: approved,
      creative: approved,
      notes: null,
    }],
    tasks: [{
      task_id: "task-grass",
      visual_family: "epochbound:verdant:terrain:grass",
      approved_sources: [{ path: "candidate.png", sha256: sha(bytes) }],
    }],
    authority: {},
    status: "review-finalized",
    finalization_fingerprint: "3".repeat(64),
  };
  const finalizationPath = path.join(root, "finalization.json");
  await writeFile(finalizationPath, JSON.stringify(finalization));
  return { packagePath, reviewPath, finalizationPath };
}

test("exports only candidates that passed the exact review manifest", async () => {
  const input = await fixture();
  const result = await compileReviewedApprovedSourcesManifest(
    input.packagePath,
    input.reviewPath,
    input.finalizationPath,
  );
  assert.equal(result.eligible_for_sprite_studio, true);
  assert.equal(result.source_review_fingerprint, "1".repeat(64));
  assert.equal(result.review_finalization_fingerprint, "3".repeat(64));
  assert.equal(result.tasks[0].approved_sources[0].sha256.length, 64);
});

test("rejected candidate cannot be manually slipped into approved sources", async () => {
  const input = await fixture({ bypass: true });
  await assert.rejects(
    () => compileReviewedApprovedSourcesManifest(input.packagePath, input.reviewPath, input.finalizationPath),
    /did not pass all three review gates/u,
  );
});

test("finalization from another review cannot approve candidate bytes", async () => {
  const input = await fixture({ wrongReview: true });
  await assert.rejects(
    () => compileReviewedApprovedSourcesManifest(input.packagePath, input.reviewPath, input.finalizationPath),
    /does not target the exact review manifest/u,
  );
});
