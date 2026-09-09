# EVAVO Texture Material Workflow

The texture material workflow turns texture generation/finishing into a governed game-asset pipeline for walls, floors, furniture, doors, props and environment surfaces. It treats texture pixels, material-map semantics, mesh UVs and Godot material bindings as separate evidence domains so one failure is not misdiagnosed as another.

## Agent surfaces

### Texture review — v1.4

Canonical entrypoint: `tools/texture_review_mcp.mjs`  
Capability contract: `config/texture-review-agent.capabilities.json`

Tools:

- `evavo_review_texture_map` — read-only semantic review for base colour, tangent normal, roughness, metallic, AO, height, emissive, opacity, specular and packed ORM maps.
- `evavo_review_texture_set` — read-only validation of a coherent material set, including dimensions, expected roles, duplicate authority and Godot import intent.
- `evavo_review_uv_layout` — read-only UV assurance from triangles supplied by an upstream 3D pipeline.
- `evavo_review_obj_uv_layout` — read-only Wavefront OBJ ingestion, topology extraction and UV assurance.
- `evavo_create_texture_tile_proof` — create-only 3x3 diagnostic proof for repeat/seam inspection.
- `evavo_pack_godot_orm_texture` — create-only lossless packing using `R=ambient occlusion`, `G=roughness`, `B=metallic`, `A=255`.

### Godot material delivery — v1

Entrypoint: `tools/godot_material_delivery_mcp.mjs`  
Capability contract: `config/godot-material-delivery-agent.capabilities.json`

Tools:

- `evavo_godot_material_delivery_capabilities`
- `evavo_plan_godot_material_delivery`

This surface is read-only. It turns admitted map metadata into an explicit `StandardMaterial3D` or `ORMMaterial3D` binding recipe. It does not write `.tres`, `.res`, `.tscn` or project import files and does not silently invent custom shaders.

## Safety model

Texture and mesh source files are never overwritten.

Texture-derived writes are create-only and must stay inside `EVAVO_TEXTURE_REVIEW_ALLOWED_ROOTS`. They require both:

1. `EVAVO_TEXTURE_REVIEW_ALLOW_WRITES=true`
2. `confirmLocalWrite=true` on that exact MCP call

Map review, material-set review, UV review, OBJ review and Godot material delivery planning are read-only.

## Texture-map semantics

The workflow does not treat every PNG as display colour:

- base colour and emissive: colour/sRGB intent
- tangent normal: normal-map data, Godot target convention `X+, Y+, Z+`
- roughness, metallic, AO, height, opacity and specular: scalar/data intent
- packed ORM: linear data with `R=AO`, `G=roughness`, `B=metallic`

A confirmed DirectX-style normal is not silently flipped. It is routed to an explicit Y/green conversion step before normal binding.

## Material-set rules

By default, all maps in one set must have matching dimensions. Duplicate semantic roles are rejected because they make the authoritative source ambiguous. Callers can declare required map kinds with `expectedKinds`.

Power-of-two policy is configurable as `ignore`, `warn` or `require`; the default is `warn`.

For repeatable assets, use `expectSeamless=true` and still inspect a 3x3 proof. Numeric edge continuity cannot detect every repeated motif or artistic phase problem.

## Topology-aware UV assurance

`evavo_review_uv_layout` accepts 1–5000 triangles. Each triangle has an ID and exactly three UV points. Optional world positions enable texel-density analysis. Optional `vertexKeys` identify the real mesh vertices behind those UVs.

When `vertexKeys` are present, UV islands are **mesh-aware**: triangles join an island only when they share both the same mesh edge and the same UV edge. This prevents unrelated geometry that happens to occupy identical UV coordinates from being falsely merged into one island.

Connectivity evidence reports one of:

- `mesh-aware` — every triangle supplied topology keys.
- `uv-only-fallback` — no topology keys were supplied; connectivity can only be inferred from UV coordinates.
- `mixed-conservative` — only part of the set has topology keys; the reviewer prefers false separation over falsely merging unrelated mesh topology.

The UV reviewer checks:

- degenerate UV triangles
- degenerate world-space triangles when positions are supplied
- coordinates outside 0–1 unless tiled coordinates are explicitly allowed
- accidental triangle overlap
- explicitly admitted stacked/mirrored reuse via `overlapGroup`
- winding orientation relative to `majority`, `positive` or `negative` convention
- topology-aware UV islands
- atlas-boundary padding in output texels
- **true inter-island spacing** in output texels using triangle-edge distance, not only bounding boxes
- world-space texel-density outliers

`orientationConvention=majority` is the default so a globally V-flipped coordinate convention is not misreported as thousands of mirrored triangles. Use an explicit positive/negative convention when a pipeline contract demands one orientation.

For intentionally tiled UV coordinates, atlas-boundary padding is not treated as a meaningful blocker; the reviewer reports that the boundary check was skipped.

## Wavefront OBJ adapter

`evavo_review_obj_uv_layout` parses `v`, `vt`, `f`, `o`, `g` and `usemtl`, resolves positive and negative indices and triangulates polygon faces with a deterministic fan.

OBJ mesh vertex indices are carried into UV review as stable topology keys automatically. Faces without usable UVs are counted instead of receiving invented coordinates. `flipVForReview=true` applies `v := 1-v` only to the review copy; authored OBJ UV data is not changed.

## ORM packing

`evavo_pack_godot_orm_texture` accepts AO, roughness and metallic scalar sources. Missing inputs use deterministic neutral defaults:

- AO: `255`
- roughness: `255`
- metallic: `0`

Strict scalar validation is on by default. Source dimensions must match exactly. No resizing occurs. Selected source bytes are copied directly into destination channels and the packed output is reviewed before it is written.

## Godot material delivery contract

`planGodotMaterialDelivery()` lives in `@evavo/art-godot` and is surfaced through `evavo_plan_godot_material_delivery`.

The planner can bind these standard Godot properties directly:

- base colour → `albedo_texture`
- tangent normal → `normal_texture` plus `normal_enabled=true`
- roughness → `roughness_texture` + explicit channel + `roughness=1`
- metallic → `metallic_texture` + explicit channel + `metallic=1`
- ambient occlusion → `ao_texture` + explicit channel + `ao_enabled=true`
- height → `heightmap_texture` + `heightmap_enabled=true`
- emissive → `emission_texture` + `emission_enabled=true`
- packed ORM → `orm_texture` on `ORMMaterial3D`

`metallic=1` is deliberately emitted when a metallic texture or ORM map is authoritative so the texture is not suppressed by the material scalar.

The planner also emits an explicit transparency mode. Transparency is expected to come from **albedo alpha**. A separate opacity image is therefore not pretended to be a direct `BaseMaterial3D` texture property.

Unsupported/ambiguous workflows are routed instead of guessed:

- DirectX normal → convert Y/green to Godot/OpenGL convention first.
- standalone opacity → compose into albedo alpha or deliberately use a reviewed custom shader.
- standalone per-pixel specular map → re-author for metallic/roughness or deliberately use a reviewed custom shader.
- packed ORM plus separate AO/roughness/metallic → reject ambiguous authority.
- `ORMMaterial3D` requested with only separate scalar maps → pack ORM first.
- `StandardMaterial3D` requested with only packed ORM → unpack/switch material class explicitly.

The delivery decision is `ready`, `needs-preprocess` or `reject`.

## Recommended automated sequence

For a new or repaired material:

1. Review the mesh UV layout from the upstream triangle contract or a local OBJ export.
2. Resolve degenerates, accidental overlaps, invalid range, insufficient island padding and major texel-density inconsistency.
3. Review every texture using its real semantic kind.
4. Review the complete material set and resolve role/dimension conflicts.
5. For repeatable materials, create and visually inspect a 3x3 tile proof.
6. If using the packed workflow, pack admitted AO/roughness/metallic data to ORM.
7. Run `evavo_plan_godot_material_delivery` to obtain the exact Godot material class, property bindings, preprocessing needs and runtime checklist.
8. Bind/test on representative geometry in Godot under representative lighting and camera distances.
9. Inspect tangent seams, physical texture scale, lower-mip bleed, transparency behavior and artistic repetition before promotion.

A technical pass is not a final visual approval. The workflow deliberately separates deterministic evidence from scene-aware art direction and runtime inspection.
