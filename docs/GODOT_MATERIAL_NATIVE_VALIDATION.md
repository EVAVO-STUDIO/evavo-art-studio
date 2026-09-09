# EVAVO Native Godot Material Validation

This is the final technical checkpoint after texture review, UV assurance, preprocessing, material planning and optional `.tres` materialization.

## Surface

Use `tools/godot_material_validation_mcp.mjs`.

It exposes:

- `evavo_godot_material_validation_capabilities`
- `evavo_validate_godot_material_resource`

The validator launches the operator-configured Godot 4.6 executable headlessly and asks Godot itself to load an existing `res://...tres` material. It can also assert that the resource loads as `StandardMaterial3D` or `ORMMaterial3D`.

## Why this is separate from material writing

Writing a deterministic text resource and launching an engine process are different privilege classes. The validator therefore has a separate MCP surface and separate environment gates.

Creating a material does not automatically authorize Godot execution.

## Required environment

Native execution requires all of the following:

- `EVAVO_GODOT_MATERIAL_VALIDATION_ALLOWED_ROOTS` — canonical local roots that may contain projects to validate.
- `EVAVO_GODOT_MATERIAL_ALLOW_EXECUTION=true` — explicit operator admission for native execution.
- `EVAVO_GODOT_EXECUTABLE` — trusted local Godot 4.6 executable path/name configured by the operator.
- `confirmLocalExecution=true` — required on the exact MCP call.

The MCP does not accept a per-call executable. This prevents an agent from turning the validator into an arbitrary process launcher.

## Path contract

`projectPath` must exist beneath the configured validation roots and contain `project.godot`.

`resourcePath` must:

- start with `res://`
- end with `.tres`
- contain no empty path segments
- contain no `.` or `..` segments
- contain no backslash traversal form
- resolve to an existing file inside the selected project

## Execution contract

The underlying runner uses:

- headless Godot execution
- `shell: false`
- a bounded timeout
- a temporary SceneTree validation script outside the project
- a structured `EVAVO_MATERIAL_VALIDATION=` JSON marker in stdout

The temporary validator is removed after execution.

Godot may update its normal `.godot` import/cache data while loading a project. The validator therefore reports `projectCacheMayChange=true`. It does not rewrite the target `.tres` or source textures.

## Approval semantics

A successful native load returns `native-load-validated-unapproved`.

That is intentionally not final art approval. It proves that Godot loaded the resource and, when requested, that its runtime class matched the expected material class. It does not prove that:

- the material looks correct on the intended mesh
- UV scale/orientation is artistically correct
- tangent seams are invisible under target lighting
- roughness/metallic/AO values are physically convincing
- emissive intensity is suitable for the scene
- transparency sorting/cutout behavior is visually acceptable

Representative runtime visual review remains the final promotion boundary.

## Recommended automated material chain

1. `evavo_review_texture_map`
2. `evavo_review_texture_set`
3. `evavo_review_obj_uv_layout` or `evavo_review_uv_layout`
4. If required, `evavo_convert_tangent_normal_y`
5. If required, `evavo_compose_opacity_into_albedo_alpha`
6. Optional `evavo_create_texture_tile_proof`
7. Optional `evavo_pack_godot_orm_texture`
8. `evavo_plan_godot_material_delivery`
9. `evavo_write_godot_material_resource`
10. `evavo_validate_godot_material_resource`
11. Runtime visual inspection on representative geometry and lighting
12. Explicit promotion/approval through the existing Art Studio governance boundary

## Tests

`packages/godot/test/material-validation.test.mjs` covers validator script generation, marker parsing and fail-closed input behavior.

`tools/godot_material_validation_mcp.test.mjs` covers execution admission, environment-only executable control, allowed-root enforcement and `res://` traversal rejection.

`packages/godot/test/material-validation-native.test.mjs` performs a real headless Godot load when `EVAVO_GODOT_EXECUTABLE` is configured. It skips cleanly when the executable is unavailable, so ordinary environments retain deterministic tests while capable workstations gain a genuine engine-level check.
