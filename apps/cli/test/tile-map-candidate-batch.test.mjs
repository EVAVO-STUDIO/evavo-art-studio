import assert from "node:assert/strict";
import test from "node:test";

import { compileTileMapCandidateBatch } from "../dist/tile-map-candidate-batch.js";

const sourcePackage = () => ({
  schema_version: 1,
  source_plan_sha256: "a".repeat(64),
  source_plan_fingerprint: "b".repeat(64),
  source_map_fingerprint: "c".repeat(64),
  map_id: "transport:first-slice",
  consumer_adapter: "transport-empire",
  production_profile: "1990s-isometric-simulation",
  projection: "isometric",
  tasks: [
    {
      task_id: "tile-map-tile-rail-ew",
      visual_family: "transport:rail:ew",
      task_kind: "tile-family",
      projection: "isometric",
      dimensions: { width: 64, height: 32 },
      required_approved_variants: 2,
      candidate_count: 4,
      alpha_required: true,
      semantic_source_ids: ["transport:rail:ew"],
      immutable_semantic_rules: [
        "Rail topology is simulation-owned.",
        "Preserve east-west edge signature.",
      ],
      creative_direction: ["Late-1990s transport-management pixel art."],
      topology: {
        terrains: ["rail"],
        edge_signatures: ["ew"],
        continuous_material: false,
        seamless_edges: false,
      },
      feature_kind: null,
    },
  ],
  authority: {},
  promotion_policy: {},
  status: "ready-for-candidate-authoring",
  package_fingerprint: "d".repeat(64),
});

test("expands source tasks into deterministic provider-neutral candidates", () => {
  const result = compileTileMapCandidateBatch(sourcePackage(), "e".repeat(64));
  assert.equal(result.status, "ready-for-provider-candidates");
  assert.equal(result.jobs.length, 4);
  assert.equal(result.source_map_fingerprint, "c".repeat(64));
  assert.equal(result.jobs[0].provider_request.operation, "generate");
  assert.equal(result.jobs[0].provider_request.authority, "intermediate-only");
  assert.deepEqual(result.jobs[0].approvals, {
    structural: false,
    visual: false,
    creative: false,
  });
  assert.deepEqual(result.jobs[0].immutable_semantic_rules, [
    "Rail topology is simulation-owned.",
    "Preserve east-west edge signature.",
  ]);
  assert.match(result.jobs[0].output_path, /^candidates\/transport-rail-ew-/u);
  assert.match(result.batch_fingerprint, /^[0-9a-f]{64}$/u);
});

test("candidate identity is stable for the same semantic map and task", () => {
  const first = compileTileMapCandidateBatch(sourcePackage(), "e".repeat(64));
  const second = compileTileMapCandidateBatch(sourcePackage(), "e".repeat(64));
  assert.deepEqual(
    first.jobs.map((job) => job.candidate_id),
    second.jobs.map((job) => job.candidate_id),
  );
  assert.equal(first.batch_fingerprint, second.batch_fingerprint);
});

test("rejects candidate generation when task projection drifts", () => {
  const input = sourcePackage();
  input.tasks[0].projection = "orthogonal";
  assert.throws(
    () => compileTileMapCandidateBatch(input, "e".repeat(64)),
    /projection differs from source package/u,
  );
});
