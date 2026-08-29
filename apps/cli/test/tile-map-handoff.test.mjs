import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  compileProductionPlan,
  handleTileMapHandoffCommand,
  validateHandoff,
} from "../dist/tile-map-handoff-commands.js";

const HASH = "a".repeat(64);

function fixture() {
  return {
    schema_version: 2,
    map_id: "epochbound-verdant-01",
    consumer_adapter: "epochbound",
    production_profile: "platformer-metatile",
    projection: "orthogonal",
    source_map_fingerprint: HASH,
    families: [
      {
        visual_family: "epochbound:verdant:terrain:grass",
        projection: "orthogonal",
        tile_width: 16,
        tile_height: 16,
        tile_ids: ["grass"],
        terrains: ["grass"],
        edge_signatures: [],
        minimum_visual_variants: 4,
        continuous_material: true,
        seamless_edges: true,
        alpha_required: false,
        semantic_rules: ["Keep borders interchangeable."],
        art_direction_notes: ["Avoid repeated micro-patterns."],
      },
    ],
    feature_families: [
      {
        visual_family: "epochbound:verdant:landmark:tree",
        projection: "orthogonal",
        feature_kind: "landmark",
        source_feature_ids: ["tree-01"],
        nominal_width: 32,
        nominal_height: 48,
        minimum_visual_variants: 2,
        alpha_required: true,
        semantic_rules: ["Do not move the canonical footprint."],
        art_direction_notes: ["Use a readable authored silhouette."],
      },
    ],
    art_studio_contract: {
      role: "source-art-generation-and-creative-approval",
      requirements: ["Provider output stays intermediate."],
    },
    sprite_studio_contract: {
      role: "lossless-mastering-atlas-and-receipt",
      manifest_schema: 2,
    },
    blocking_rules: ["Creative approval is mandatory."],
  };
}

test("compiles immutable tile and feature art tasks", () => {
  const handoff = validateHandoff(fixture());
  const plan = compileProductionPlan(handoff, "b".repeat(64));

  assert.equal(plan.schema_version, 1);
  assert.equal(plan.status, "awaiting-source-art");
  assert.equal(plan.source.authority, "evavo-tile-map-studio");
  assert.equal(plan.tasks.length, 2);
  assert.equal(plan.tasks[0].provider_output_authority, "intermediate-only");
  assert.equal(plan.tasks[0].creative_approval_required, true);
  assert.equal(plan.tasks[0].promotion_state, "blocked-pending-creative-approval");
  assert.equal(plan.authority_contract.semantic_authority, "tile-map-studio");
  assert.equal(plan.authority_contract.creative_approval_cannot_be_inferred_from_build_success, true);
  assert.match(plan.plan_fingerprint, /^[0-9a-f]{64}$/);

  const tileTask = plan.tasks.find((task) => task.task_kind === "tile-family");
  assert.deepEqual(tileTask.semantic_rules, ["Keep borders interchangeable."]);
  assert.deepEqual(tileTask.topology.edge_signatures, []);
  assert.equal(tileTask.topology.seamless_edges, true);

  const featureTask = plan.tasks.find((task) => task.task_kind === "feature-family");
  assert.equal(featureTask.feature_kind, "landmark");
  assert.deepEqual(featureTask.semantic_source_ids, ["tree-01"]);
});

test("rejects an Art Studio authority mismatch", () => {
  const payload = fixture();
  payload.art_studio_contract.role = "provider-execution";
  assert.throws(
    () => validateHandoff(payload),
    (error) => error?.code === "EVAVO_TILE_MAP_HANDOFF_AUTHORITY_MISMATCH",
  );
});

test("rejects duplicate visual families across tiles and features", () => {
  const payload = fixture();
  payload.feature_families[0].visual_family = payload.families[0].visual_family;
  assert.throws(
    () => validateHandoff(payload),
    (error) => error?.code === "EVAVO_TILE_MAP_HANDOFF_DUPLICATE_FAMILY",
  );
});

test("file command binds the plan to the exact handoff bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evavo-tile-map-handoff-"));
  const input = join(directory, "handoff.json");
  const bytes = Buffer.from(`${JSON.stringify(fixture(), null, 2)}\n`, "utf8");
  await writeFile(input, bytes);

  const result = await handleTileMapHandoffCommand("tile-map-handoff", { input });
  assert.equal(result.handled, true);
  assert.equal(
    result.value.source.handoff_sha256,
    createHash("sha256").update(bytes).digest("hex"),
  );
});
