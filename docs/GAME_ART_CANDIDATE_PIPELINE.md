# Governed game-art candidate pipeline

This pipeline is for game art created in ChatGPT, Claude, Gemini, Art Studio providers, Video Studio, the ChatGPT Library, or a local artist tool. Generated output is never production art merely because it looks plausible.

## Production sequence

1. **Materialise exact bytes on the EVAVO host.** A cloud or chat attachment is first copied to an ordinary local file through the provider connector or Local Storage chat-image transfer. Model sandbox paths are never assumed to exist on the Windows workstation.
2. **Retain the immutable source.** Local Storage/content-addressed intake retains the original bytes and exact SHA-256. Important source and approved-master milestones are handed to EVAVO Storage/BeeStation rather than bloating Git.
3. **Bind the active project.** Art Studio resolves the exact `.evavo/creative-assets.json` project binding and records the project/session identity. Filename similarity is not project discovery.
4. **Run technical candidate audit.** `scripts/audit-pixel-art-candidate.mjs` checks PNG structure, dimensions, transparency, partial-alpha halos and palette size before artistic review. A failure classifies the image as reference/repair material; it does not delete the source.
5. **Creative review.** Review at native 1x and 2x without CRT/post effects. Check silhouette, anatomy, equipment proportions, event readability, period authenticity, palette, lighting, repeated-detail artifacts and whether the piece looks generically generated.
6. **Repair or regenerate.** Use Art Studio's image tools and governed local tools for cutout, background recovery, segmentation, alpha cleanup, crop/padding, resize, nearest-neighbour pixel snapping, palette reduction, compositing and controlled regeneration. Complex contact sheets are split into individual canonical frames before admission.
7. **Build a frame family.** Character frames keep the same model sheet, equipment geometry, pivot convention, ground/contact line and light direction. Effects, dust, water and shadows are separate layers unless a project contract explicitly says otherwise.
8. **Pack sprite sheet/atlas.** Art Studio owns deterministic sheet/atlas packing, Aseprite-compatible tags/slices where used, frame order, pivots, timing and Godot `SpriteFrames` planning. Video Studio contributes ordered frame sequences with exact temporal/hash lineage; Video Studio does not become the image-mastering authority.
9. **Review animation evidence.** Check frame-to-frame scale, pivot stability, foot/board/wheel contact, silhouette continuity, looping, occlusion and in-game readability. Rework bad frames rather than accepting a weak sheet because most frames are usable.
10. **Human approval.** Approval binds the exact final candidate hash, preview hash, role, metadata, project binding and target. Creative feedback such as `looks good` is not mutation authority. Project-approved phrases such as `save this`, `use this`, `approve this asset` or `publish this` can create the exact approval record when the project binding allows them.
11. **Retain source/master, publish compact runtime.** Sources and editable masters go to EVAVO Storage/BeeStation. Compact PNG atlases, layered environment assets and generated `.tres` resources go to the project repository only after validation.
12. **Validate and publish.** The target game's source/art validators and runtime evidence run before Development Studio performs the governed fast-forward Git publication. Art Studio itself does not force-push, merge or bypass repository policy.

## Candidate classes

- `exploration`: useful visual direction only; may be inconsistent or composited.
- `reference-or-repair`: exact source retained, but technical or creative blockers prevent production admission.
- `production-candidate`: technical gate passed and ready for native-scale creative review.
- `approved-master`: manually reviewed and exact-hash approved.
- `runtime-asset`: deterministic derivative of an approved master, validated for the target engine/repository.

## Pixel-art defaults

For deliberately hard-edged pixel art, production sprites normally require binary alpha, no semi-transparent fringe, no interlacing and a deliberately bounded palette. A project may explicitly relax those values for UI, painted backgrounds, lighting/effects or non-pixel assets, but the relaxation is part of the role contract rather than an automatic exception.

## Layer ownership

Environment production should prefer composable layers such as sky, distance, atmosphere, midground, crowd, play surface, foreground and effects. Gameplay characters/equipment should be separately movable where that improves animation and occlusion. Shadows and temporary motion effects are normally runtime/effect layers, not permanently painted into every character frame.

## Review principle

A generated contact sheet is a source of ideas, not automatically a sprite sheet. The production system is expected to reject, segment, repair, regenerate and compare candidates until the final assets are consistent enough to ship.
