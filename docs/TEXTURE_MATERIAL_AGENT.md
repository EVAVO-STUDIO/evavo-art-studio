# EVAVO Texture Material Agent

The texture material workflow extends the canonical texture review agent from individual map checks into governed material-set validation and Godot-ready derived assets for walls, floors, furniture, doors, props and environment surfaces.

## Canonical entrypoint

Use `tools/texture_review_mcp.mjs` with the v1.2 contract in `config/texture-review-agent.capabilities.json`.

It exposes:

- `evavo_review_texture_map` — read-only map-aware review for base colour, tangent-space normal, roughness, metallic, ambient occlusion, height, emissive, opacity, specular and packed ORM maps.
- `evavo_review_texture_set` — read-only validation of a complete material set, including dimensions, expected map roles, map-specific blockers/warnings, tileability intent and Godot guidance.
- `evavo_create_texture_tile_proof` — create-only 3x3 diagnostic proof for visually checking repeats and seams.
- `evavo_pack_godot_orm_texture` — create-only lossless channel packing using `R=ambient occlusion`, `G=roughness`, `B=metallic` and `A=255`.

There is intentionally one texture agent surface rather than separate review and material servers. Existing map-review callers keep their original tool names and environment configuration.

## Safety model

Source textures are never overwritten. All derived writes are create-only and must remain inside `EVAVO_TEXTURE_REVIEW_ALLOWED_ROOTS`.

Writes require both:

1. `EVAVO_TEXTURE_REVIEW_ALLOW_WRITES=true`
2. `confirmLocalWrite=true` on that exact MCP call

An existing output path is an error. Output and receipt paths must be distinct from source paths.

Read-only map and material-set review works without enabling writes.

## Godot material contract

The material-set reviewer emits explicit import intent instead of treating every PNG as ordinary colour artwork:

- base colour and emissive: colour/sRGB intent
- tangent normal: linear data; OpenGL-style `X+, Y+, Z+`
- roughness, metallic, AO, height, opacity and specular: linear scalar data
- packed ORM: linear data with `R=AO`, `G=roughness`, `B=metallic`

When a packed ORM texture is present, the reviewer recommends `ORMMaterial3D`; otherwise it recommends `StandardMaterial3D` with separate maps.

The reviewer does not silently invert normal-map channels. A confirmed DirectX-style normal source should be converted deliberately so the authored convention remains auditable.

## Material-set rules

By default, maps in one material set must have matching dimensions. Duplicate roles are rejected because they make the authoritative source ambiguous. Callers can declare `expectedKinds` when a material recipe requires specific maps.

Power-of-two validation is configurable as `ignore`, `warn` or `require`; the default is `warn` rather than rejecting modern engine-valid non-power-of-two textures.

For tileable assets, set `expectSeamless=true`. Numeric opposite-edge checks are useful triage, but a 3x3 tile proof should still be visually inspected for obvious repetition, phase discontinuities and authored pattern breaks.

## ORM packing

`evavo_pack_godot_orm_texture` accepts any combination of AO, roughness and metallic scalar sources. Missing channels use deterministic neutral defaults:

- AO: `255`
- roughness: `255`
- metallic: `0`

By default, scalar inputs are validated before packing. Chromatic contamination is rejected rather than silently converted. A specific source channel (`r`, `g`, `b` or `a`) can be selected when the source is intentionally channel-packed; disabling strict scalar validation must be explicit.

The packer performs no resizing and refuses mismatched source dimensions. Selected byte values are copied directly into the destination ORM channels. The packed output is reviewed as `orm-packed` before it is written.

## Recommended agent sequence

For a new or repaired material:

1. Review each source map with its real semantic kind.
2. Review the complete set with the roles that material is expected to contain.
3. Resolve blockers rather than using generic sharpening/colour filters on data maps.
4. For repeatable materials, create and visually inspect a tile proof.
5. Pack AO/roughness/metallic to ORM only after scalar sources are admitted.
6. Import/test the result in the target Godot material and inspect it on representative geometry under representative lighting.

This agent is a technical finishing and delivery surface. It does not claim that a numerically valid texture is artistically correct, historically accurate, semantically aligned to a mesh, or visually convincing on the final UV layout. Those still require scene/mesh-aware review.
