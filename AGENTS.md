# EVAVO Art Studio agent rules

## RAW_ART first

When a game repository contains `raw_Art`, `RAW_ART`, `Raw_Art` or `raw_art`, treat that folder as immutable owner-supplied source evidence.

1. Materialise Git LFS objects before review. An LFS pointer is not an image.
2. Run the exact RAW_ART inventory.
3. Build the visual catalog outside the source folder.
4. Open every contact sheet with an image-viewing tool.
5. Read `AGENT_VISUAL_CONTEXT.md` and copy `RAW_ART_REVIEW_WORKBOOK.json` into reviewed evidence.
6. Name coherent visual families and decide whether suggested groups are frames, directions, variants, sheets, duplicates or unrelated exports.
7. Resolve and open the full-resolution original before selecting, modifying or using it as a style reference.
8. Record the decision and source SHA-256 before creating a working copy.

Do not infer subject, canon, quality, sequence order, provenance or intended use from a filename alone. Technical metrics and contact sheets help triage; they do not replace visual review.

## Source preservation

- Never edit, delete, rename, normalize, optimize or reorganize originals inside RAW_ART.
- Never point a released Godot scene directly at RAW_ART.
- Put previews and reports in a disposable evidence directory.
- Put modifications in a reviewed working session or the game repository's declared source-art destination.
- Preserve real alpha, canvas, pivot, palette, edge and frame-timing evidence unless an approved work order explicitly changes them.
- Never replace transparent pixels with a checkerboard or other baked background.

## Style use

Owner-supplied RAW_ART is primary evidence of the desired direction, but only named, visually inspected references may enter an approved style bank. Compare silhouettes, proportions, value grouping, palette ramps, material treatment, line or pixel language, lighting, camera, animation rhythm and UI density. State conflicts and outliers honestly.

Start with the strong prior that the collection is likely what the owner wants. Preserve coherent signatures and deliberate exceptions; do not average incompatible families into generic art. This prior guides review but never turns every source into an approved runtime asset.

A numeric suffix, direction token or shared export timestamp is only grouping evidence. Confirm frame versus variant status, order, canvas, pivot, ground line, continuity, action arc, loop closure and timing by looking at the originals. A provider must not invent independent frame identities.

Generated or edited work remains an unapproved derivative until it is compared with the selected originals at full resolution and actual runtime scale. Do not use a provider to redesign each animation frame independently. Identity, construction landmarks, palette, lighting, camera, pivot and motion topology must remain continuous across a family.

## Required tools

- `raw_art_folder_mcp.mjs` for immutable inventory, duplicate and sequence evidence, reviewed session plans and source-safe materialisation.
- `raw_art_visual_catalog_mcp.mjs` for contact sheets, gallery paths, the owner-intent context, review workbook, style-family triage, frame/variant candidates and hash-verified full-resolution source paths.
- Project Art and provider tools only after reviewed decisions and approved style references exist.
- Godot Game Test Lab evidence before any runtime promotion.

Read `docs/RAW_ART_FOLDER_WORKBENCH.md`, `docs/RAW_ART_VISUAL_CATALOG.md` and `docs/RAW_ART_AGENT_WORKSHOP.md` before changing a game-art pipeline.
