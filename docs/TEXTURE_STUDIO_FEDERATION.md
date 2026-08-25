# Texture Studio federation

EVAVO Texture Studio is now the authoritative procedural texture/material authoring layer between Art Studio creative direction and downstream 3D/runtime delivery.

Canonical producer repository: `EVAVO-STUDIO/evavo-texture-studio`.
Initial executable reference revision reviewed for this boundary: `f599c65fc942622902b6c198e9abd0b698374f6f`.

## Art Studio authority

Art Studio remains authoritative for creative direction, reference selection, palettes, motifs, decals, authored masks, sprite identity, pixel-art direction and provider-assisted image candidates. It must not duplicate Texture Studio's procedural graph evaluator merely for convenience.

For new texture work, Art Studio should compile or retain an `evavo_art_texture_brief_v1`-compatible request containing the asset identity, art direction, retained references, dimensions, tiling policy, style profile, semantic channel requirements and constraints. Texture Studio owns the subsequent editable graph, exposed parameters, deterministic seeds, seamlessness rules, semantic channel evaluation and texture-specific QA.

## Existing Asset Fabricator bridge

The current Art Studio Asset Fabricator material handoff remains valid compatibility evidence. Its eleven-channel closure (base colour, height, OpenGL normal, roughness, metalness, AO, curvature, thickness, wear, dirt and damage) must not be removed or silently reinterpreted.

New Texture Studio work may produce a richer semantic material model and later derive that compatibility closure for 3D Studio. Engine packing such as glTF ORM remains a delivery concern rather than a limit on the source material graph.

## Sprite and 2D use

Texture Studio is not 3D-only. Art Studio may request native-pixel sprite-detail materials, decals, overlays, normal/detail maps and other semantic texture layers while retaining sprite identity and visual approval authority here.

## Authority boundary

Texture Studio output is review-required material evidence. This federation does not grant automatic creative approval, canonical asset promotion, target-repository mutation, deployment, publication or client release. Existing Art Studio provider, alpha, identity and approval gates remain authoritative for Art-owned source imagery.
