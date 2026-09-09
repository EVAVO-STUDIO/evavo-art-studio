# Texture Map Review Agent

Art Studio now has map-aware validation for texture and PBR data assets. The goal is not to make every texture look photographically attractive; it is to understand what each map means and catch technical mistakes before Godot/material delivery.

## Supported map kinds

- `base-color`
- `normal-tangent`
- `roughness`
- `metallic`
- `ambient-occlusion`
- `height`
- `specular`
- `emissive`
- `opacity`
- `orm-packed`

## Deterministic checks

The reviewer reports per-channel mean, standard deviation, range and clipping, plus optional opposite-edge seam error. Scalar maps are checked for accidental RGB colour contamination. Tangent-space normal maps are checked for positive-Z/blue plausibility and vector-length error. Packed ORM maps are explicitly treated as data rather than as a conventional colour image.

When `expectSeamless=true`, left/right and top/bottom edge error is measured. This is a technical signal only; repeated motifs can still make a mathematically seamless texture look obviously tiled, so visual proof remains important.

## 3x3 tile proof

`createTextureTileProof` produces a bounded 3x3 repeat for fast visual inspection. The MCP tool `evavo_create_texture_tile_proof` writes that proof and a diagnostic receipt using create-only paths. It never edits the source.

```powershell
pnpm --filter @evavo/art-media build
$env:EVAVO_TEXTURE_REVIEW_ALLOWED_ROOTS = "C:\GitRepos;C:\EVAVO"
node tools/texture_review_mcp.mjs
```

Read-only map review needs only the allowed roots. Diagnostic proof writes additionally require:

```powershell
$env:EVAVO_TEXTURE_REVIEW_ALLOW_WRITES = "true"
```

and `confirmLocalWrite=true` on the exact proof call.

## Godot/material constraints

The reviewer deliberately does not silently flip a normal map's green channel or silently repack material channels. Those operations depend on the target shader/import convention and must be explicit. For packed ORM delivery, verify the expected channel mapping before export (commonly AO in R, roughness in G and metallic in B, but the target material contract is authoritative).

The deterministic evidence also cannot prove UV correctness, texel density, material semantics, or whether generated detail actually represents the intended surface. Those remain runtime/visual checks and should be reviewed on the target mesh under representative lighting.
