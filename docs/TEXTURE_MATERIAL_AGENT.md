# EVAVO Texture Material Agent

The texture material workflow extends the canonical texture review agent from individual map checks into governed material-set validation, UV assurance and Godot-ready derived assets for walls, floors, furniture, doors, props and environment surfaces.

## Canonical entrypoint

Use `tools/texture_review_mcp.mjs` with the v1.3 contract in `config/texture-review-agent.capabilities.json`.

It exposes:

- `evavo_review_texture_map` — read-only map-aware review for base colour, tangent-space normal, roughness, metallic, ambient occlusion, height, emissive, opacity, specular and packed ORM maps.
- `evavo_review_texture_set` — read-only validation of a complete material set, including dimensions, expected map roles, map-specific blockers/warnings, tileability intent and Godot guidance.
- `evavo_review_uv_layout` — read-only UV assurance from triangle UV/world-position data supplied by a 3D pipeline.
- `evavo_review_obj_uv_layout` — read-only Wavefront OBJ ingestion plus UV assurance, including polygon triangulation and missing-UV accounting.
- `evavo_create_texture_tile_proof` — create-only 3x3 diagnostic proof for visually checking repeats and seams.
- `evavo_pack_godot_orm_texture` — create-only lossless channel packing using `R=ambient occlusion`, `G=roughness`, `B=metallic` and `A=255`.

There is intentionally one texture agent surface rather than separate review, material and UV servers. Existing map-review callers keep their original tool names and environment configuration.

## Safety model

Source textures and mesh files are never overwritten. All derived writes are create-only and must remain inside `EVAVO_TEXTURE_REVIEW_ALLOWED_ROOTS`.

Writes require both:

1. `EVAVO_TEXTURE_REVIEW_ALLOW_WRITES=true`
2. `confirmLocalWrite=true` on that exact MCP call

An existing output path is an error. Output and receipt paths must be distinct from source paths.

Map, material-set, triangle UV and OBJ UV review are read-only and work without enabling writes.

## Godot material contract

The material-set reviewer emits explicit import intent instead of treating every PNG as ordinary colour artwork:

- base colour and emissive: colour/sRGB intent
- tangent normal: linear data; OpenGL-style `X+, Y+, Z+`
- roughness, metallic, AO, height, opacity and specular: linear scalar data
- packed ORM: linear data with `R=AO`, `G=roughness`, `B=metallic`

When a packed ORM texture is present, the reviewer recommends `ORMMaterial3D`; otherwise it recommends `StandardMaterial3D` with separate maps.

The reviewer does not silently invert normal-map channels. A confirmed DirectX-style normal source should be converted deliberately, including through Godot's normal-map Y-invert import option where appropriate, so the authored convention remains auditable.

## Material-set rules

By default, maps in one material set must have matching dimensions. Duplicate roles are rejected because they make the authoritative source ambiguous. Callers can declare `expectedKinds` when a material recipe requires specific maps.

Power-of-two validation is configurable as `ignore`, `warn` or `require`; the default is `warn` rather than rejecting modern engine-valid non-power-of-two textures.

For tileable assets, set `expectSeamless=true`. Numeric opposite-edge checks are useful triage, but a 3x3 tile proof should still be visually inspected for obvious repetition, phase discontinuities and authored pattern breaks.

## UV assurance

`evavo_review_uv_layout` accepts 1–5000 triangles. Every triangle has an ID and exactly three UV points; optional world-space positions enable texel-density analysis. Deliberately stacked or mirrored geometry can declare a shared `overlapGroup` so intentional reuse is distinguishable from accidental overlap.

The UV reviewer checks:

- zero/near-zero UV triangle area
- world-space degenerates when positions are provided
- coordinates outside the 0–1 unit square unless tiled coordinates are explicitly allowed
- overlapping UV triangles, with configurable warn/reject policy
- mirrored UV winding, with configurable warn/reject policy
- connected UV islands
- boundary padding in real output texels when texture dimensions are supplied
- texel-density outliers relative to the material median when world positions and texture dimensions are supplied

`evavo_review_obj_uv_layout` parses Wavefront OBJ `v`, `vt`, `f`, `o`, `g` and `usemtl` records, supports positive and negative OBJ indices and triangulates polygon faces with a deterministic fan. A face that has no usable UV coordinate is counted as skipped rather than assigned invented UVs. `flipVForReview=true` can apply `v := 1-v` to the review domain without changing the source OBJ or the extracted authored coordinates.

A numeric UV pass is not a visual mesh/material pass. Final inspection still needs representative geometry and lighting to catch wrong semantic placement, visible tangent seams, wrong physical texture scale and artistic repetition.

## ORM packing

`evavo_pack_godot_orm_texture` accepts any combination of AO, roughness and metallic scalar sources. Missing channels use deterministic neutral defaults:

- AO: `255`
- roughness: `255`
- metallic: `0`

By default, scalar inputs are validated before packing. Chromatic contamination is rejected rather than silently converted. A specific source channel (`r`, `g`, `b` or `a`) can be selected when the source is intentionally channel-packed; disabling strict scalar validation must be explicit.

The packer performs no resizing and refuses mismatched source dimensions. Selected byte values are copied directly into the destination ORM channels. The packed output is reviewed as `orm-packed` before it is written.

## Recommended agent sequence

For a new or repaired material:

1. Review the mesh UV layout first from extracted triangles or a local OBJ export.
2. Resolve degenerates, accidental overlap, invalid range, inadequate padding or major texel-density inconsistency before blaming the textures.
3. Review each texture with its real semantic map kind.
4. Review the complete material set with the roles it is expected to contain.
5. Resolve blockers rather than applying generic colour/sharpen filters to data maps.
6. For repeatable materials, create and visually inspect a 3x3 tile proof.
7. Pack AO/roughness/metallic to ORM only after scalar sources are admitted.
8. Import/test the result in the target Godot material on representative geometry under representative lighting.

This agent is a technical finishing and delivery surface. It does not claim that a numerically valid texture or UV layout is artistically correct, historically accurate, semantically aligned to a mesh, or visually convincing in the final scene. Those remain explicit runtime/visual review requirements.
