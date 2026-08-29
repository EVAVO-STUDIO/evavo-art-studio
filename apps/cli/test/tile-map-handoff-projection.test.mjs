import assert from "node:assert/strict";
import test from "node:test";

import { validateHandoff } from "../dist/tile-map-handoff-commands.js";

test("rejects family projection drift from the handoff projection", () => {
  const payload = {
    schema_version: 2,
    map_id: "transport-grid",
    consumer_adapter: "transport-empire",
    production_profile: "1990s-isometric-simulation",
    projection: "isometric",
    source_map_fingerprint: "a".repeat(64),
    families: [
      {
        visual_family: "transport:network:road",
        projection: "orthogonal",
        tile_width: 64,
        tile_height: 32,
        tile_ids: ["road-ew"],
        terrains: ["road"],
        edge_signatures: ["EW"],
        minimum_visual_variants: 2,
        continuous_material: false,
        seamless_edges: false,
        alpha_required: true,
        semantic_rules: ["Preserve network topology."],
        art_direction_notes: ["Keep the isometric silhouette readable."],
      },
    ],
    feature_families: [],
    art_studio_contract: {
      role: "source-art-generation-and-creative-approval",
      requirements: ["Provider results stay intermediate."],
    },
    sprite_studio_contract: { role: "lossless-mastering-atlas-and-receipt" },
    blocking_rules: ["Creative approval remains mandatory."],
  };

  assert.throws(
    () => validateHandoff(payload),
    (error) => error?.code === "EVAVO_TILE_MAP_HANDOFF_PROJECTION_MISMATCH",
  );
});
