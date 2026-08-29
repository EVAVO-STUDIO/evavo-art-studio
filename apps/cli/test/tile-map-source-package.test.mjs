import assert from "node:assert/strict";
import test from "node:test";

import { compileTileMapSourcePackage } from "../dist/tile-map-source-package-commands.js";

const plan = () => ({
  schema_version: 1,
  source: {
    authority: "evavo-tile-map-studio",
    handoff_schema_version: 2,
    handoff_sha256: "a".repeat(64),
    map_id: "transport:first-slice",
    source_map_fingerprint: "b".repeat(64),
    consumer_adapter: "transport-empire",
    production_profile: "1990s-isometric-simulation",
    projection: "isometric",
  },
  authority_contract: {
    art_studio_role: "source-art-generation-and-creative-approval",
    semantic_authority: "tile-map-studio",
    provider_results_are_intermediate: true,
    creative_approval_cannot_be_inferred_from_build_success: true,
    sprite_studio_role: "lossless-mastering-atlas-and-receipt",
  },
  tasks: [
    {
      task_id: "tile-map-tile-rail",
      task_kind: "tile-family",
      visual_family: "transport:rail:ew",
      projection: "isometric",
      dimensions: { width: 64, height: 32 },
      minimum_visual_variants: 2,
      alpha_required: true,
      semantic_source_ids: ["transport:rail:ew"],
      semantic_rules: ["Rail topology is simulation-owned.", "Preserve east-west edge signature."],
      art_direction_notes: ["Late-1990s transport-management pixel art."],
      topology: {
        terrains: ["rail"],
        edge_signatures: ["ew"],
        continuous_material: false,
        seamless_edges: false,
      },
      feature_kind: null,
      provider_output_authority: "intermediate-only",
      creative_approval_required: true,
      promotion_state: "blocked-pending-creative-approval",
    },
  ],
  blocking_rules: ["No placeholder art."],
  status: "awaiting-source-art",
  plan_fingerprint: "c".repeat(64),
});

test("compiles provider-neutral source package with immutable topology rules", () => {
  const result = compileTileMapSourcePackage(plan(), "d".repeat(64));
  assert.equal(result.status, "ready-for-candidate-authoring");
  assert.equal(result.authority.semantic_authority, "tile-map-studio");
  assert.equal(result.authority.creative_authority, "art-studio");
  assert.equal(result.authority.provider_authority, "candidate-generation-only");
  assert.equal(result.tasks[0].required_approved_variants, 2);
  assert.equal(result.tasks[0].candidate_count, 4);
  assert.deepEqual(result.tasks[0].immutable_semantic_rules, [
    "Rail topology is simulation-owned.",
    "Preserve east-west edge signature.",
  ]);
  assert.equal(result.tasks[0].gates.sprite_packaging_blocked_until_approval, true);
  assert.match(result.tasks[0].output_contract.candidate_directory, /^candidates\/transport-rail-ew-/u);
});

test("rejects a task that weakens creative approval authority", () => {
  const input = plan();
  input.tasks[0].provider_output_authority = "approved";
  assert.throws(
    () => compileTileMapSourcePackage(input, "d".repeat(64)),
    /weakens creative approval authority/u,
  );
});

test("rejects task projection drift", () => {
  const input = plan();
  input.tasks[0].projection = "orthogonal";
  assert.throws(
    () => compileTileMapSourcePackage(input, "d".repeat(64)),
    /projection orthogonal != isometric/u,
  );
});
