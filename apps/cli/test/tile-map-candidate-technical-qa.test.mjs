import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { compileTileMapCandidateTechnicalQa } from "../dist/tile-map-candidate-technical-qa.js";

const sha = (value) => createHash("sha256").update(value).digest("hex");

async function rgbaPng(width, height, pixel) {
  const data = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const value = pixel(index % width, Math.floor(index / width));
    data[index * 4] = value[0];
    data[index * 4 + 1] = value[1];
    data[index * 4 + 2] = value[2];
    data[index * 4 + 3] = value[3];
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function fixture({
  images,
  required = 2,
  topology = null,
  profile = "snes-topdown-rpg",
  alphaRequired = false,
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-tile-map-technical-qa-"));
  const candidateRoot = path.join(root, "provider-results");
  const candidateDirectory = path.join(candidateRoot, "candidates", "grass");
  await mkdir(candidateDirectory, { recursive: true });
  const candidateImages = images ?? [
    await rgbaPng(16, 16, (x, y) => [30 + (x % 2) * 20, 110 + (y % 2) * 20, 50, 255]),
    await rgbaPng(16, 16, (x, y) => [80, 90 + (x % 3) * 20, 40 + (y % 2) * 30, 255]),
    await rgbaPng(16, 16, (x, y) => [110 + (y % 2) * 15, 70, 30 + (x % 2) * 25, 255]),
  ];
  const candidates = [];
  for (const [index, bytes] of candidateImages.entries()) {
    const relative = `candidates/grass/${String(index + 1).padStart(2, "0")}.png`;
    await writeFile(path.join(candidateRoot, ...relative.split("/")), bytes);
    candidates.push({
      candidate_id: `candidate-${index + 1}`,
      task_id: "task-grass",
      visual_family: "epochbound:verdant:terrain:grass",
      path: relative,
      sha256: sha(bytes),
      bytes: bytes.length,
      width: 16,
      height: 16,
      has_alpha: true,
      structural_review: "pending",
      visual_review: "pending",
      creative_review: "pending",
      promotion_eligible: false,
    });
  }
  const sourcePackage = {
    schema_version: 1,
    source_plan_sha256: "1".repeat(64),
    source_plan_fingerprint: "2".repeat(64),
    source_map_fingerprint: "3".repeat(64),
    map_id: "map",
    consumer_adapter: "epochbound",
    production_profile: profile,
    projection: "orthogonal",
    tasks: [{
      task_id: "task-grass",
      visual_family: "epochbound:verdant:terrain:grass",
      task_kind: "tile-family",
      projection: "orthogonal",
      dimensions: { width: 16, height: 16 },
      required_approved_variants: required,
      candidate_count: candidateImages.length,
      alpha_required: alphaRequired,
      semantic_source_ids: ["grass"],
      immutable_semantic_rules: ["Preserve terrain semantics."],
      creative_direction: ["Authored pixel terrain."],
      topology,
      feature_kind: null,
    }],
    authority: {},
    promotion_policy: {},
    status: "ready-for-candidate-authoring",
    package_fingerprint: "4".repeat(64),
  };
  const packagePath = path.join(root, "source-package.json");
  await writeFile(packagePath, JSON.stringify(sourcePackage));
  const review = {
    schema_version: 1,
    source_batch_sha256: "5".repeat(64),
    source_batch_fingerprint: "6".repeat(64),
    source_package_fingerprint: "4".repeat(64),
    source_provider_batch_fingerprint: "7".repeat(64),
    source_execution_sha256: "8".repeat(64),
    source_map_fingerprint: "3".repeat(64),
    provider_results_path: path.join(candidateRoot, "provider-results.json"),
    provider_results_sha256: "9".repeat(64),
    candidate_root: candidateRoot,
    map_id: "map",
    projection: "orthogonal",
    candidates,
    authority: {},
    status: "awaiting-review",
    review_fingerprint: "a".repeat(64),
  };
  const reviewPath = path.join(root, "review.json");
  await writeFile(reviewPath, JSON.stringify(review));
  return { packagePath, reviewPath };
}

test("admits sufficiently distinct technically valid pixel candidates", async () => {
  const input = await fixture();
  const result = await compileTileMapCandidateTechnicalQa(
    input.packagePath,
    input.reviewPath,
  );
  assert.equal(result.status, "passed");
  assert.equal(result.families[0].passed_candidates, 3);
  assert.equal(result.authority.creative_approval_authority, false);
  assert.match(result.qa_fingerprint, /^[0-9a-f]{64}$/u);
});

test("near-identical pixels do not satisfy the required variant count", async () => {
  const first = await rgbaPng(16, 16, () => [40, 120, 60, 255]);
  const second = await rgbaPng(16, 16, (x, y) =>
    x === 0 && y === 0 ? [41, 120, 60, 255] : [40, 120, 60, 255],
  );
  const input = await fixture({ images: [first, second], required: 2 });
  const result = await compileTileMapCandidateTechnicalQa(
    input.packagePath,
    input.reviewPath,
  );
  assert.equal(result.status, "blocked");
  assert.equal(result.families[0].passed_candidates, 1);
  assert.ok(
    result.candidates.some((candidate) =>
      candidate.issues.some((issue) => issue.code === "NEAR_DUPLICATE_VARIANT"),
    ),
  );
});

test("continuous seamless materials fail when opposite edges visibly disagree", async () => {
  const image = await rgbaPng(16, 16, (x) =>
    x === 0 ? [0, 0, 0, 255] : x === 15 ? [255, 255, 255, 255] : [80, 100, 60, 255],
  );
  const input = await fixture({
    images: [image],
    required: 1,
    topology: {
      continuous_material: true,
      seamless_edges: true,
      edge_signatures: [],
    },
  });
  const result = await compileTileMapCandidateTechnicalQa(
    input.packagePath,
    input.reviewPath,
  );
  assert.equal(result.status, "blocked");
  assert.ok(
    result.candidates[0].issues.some(
      (issue) => issue.code === "SEAMLESS_MATERIAL_EDGE_MISMATCH",
    ),
  );
});

test("soft alpha blocks pixel-exact production profiles", async () => {
  const image = await rgbaPng(16, 16, () => [40, 120, 60, 128]);
  const input = await fixture({ images: [image], required: 1, alphaRequired: true });
  const result = await compileTileMapCandidateTechnicalQa(
    input.packagePath,
    input.reviewPath,
  );
  assert.equal(result.status, "blocked");
  assert.ok(
    result.candidates[0].issues.some(
      (issue) => issue.code === "PIXEL_GRID_SOFT_ALPHA",
    ),
  );
});

test("topology variants must preserve compatible boundary alpha masks", async () => {
  const first = await rgbaPng(16, 16, (x, y) =>
    x === 0 && y >= 4 && y <= 11 ? [100, 100, 100, 255] : [0, 0, 0, 0],
  );
  const second = await rgbaPng(16, 16, (x, y) =>
    x === 0 && y >= 12 ? [130, 130, 130, 255] : [0, 0, 0, 0],
  );
  const input = await fixture({
    images: [first, second],
    required: 2,
    alphaRequired: true,
    topology: {
      continuous_material: false,
      seamless_edges: false,
      edge_signatures: ["w"],
    },
  });
  const result = await compileTileMapCandidateTechnicalQa(
    input.packagePath,
    input.reviewPath,
  );
  assert.equal(result.status, "blocked");
  assert.ok(
    result.candidates.some((candidate) =>
      candidate.issues.some((issue) => issue.code === "TOPOLOGY_BORDER_DRIFT"),
    ),
  );
});
