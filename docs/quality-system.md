# Quality system

## Real transparency, not a visual imitation

Transparent output is accepted only when the decoded file contains an alpha channel and the alpha distribution matches the expected subject coverage. The QA worker also tests for:

- repeated checkerboard periodicity;
- large flat background colour clusters;
- baked white, black, green or magenta mattes;
- coloured fringes and premultiplication halos;
- dirty RGB values beneath fully transparent pixels;
- missing edge bleed for filtered sprite sampling.

Every transparent master is composited over black, white, middle grey, green and magenta test mattes. A contact sheet and numeric edge report are retained in the evidence bundle. Chroma-key generation may be used as an intermediate technique, but chroma removal, edge colour decontamination and alpha proof must complete before export.

The independent final-frame fake-transparency gate fits robust colour modes from the visible border band rather than the whole image. That prevents a large character from hiding a faint checker signal, detects provider-resampled 22–28 pixel tile runs, defeats grids painted at partial alpha inside a clear token rim, and records fit, coverage and residual error. Completely hidden RGB at alpha zero remains ignored. The gate rejects only alternating two-axis grids, so ordinary low-contrast stripes are not mislabeled as checkerboard transparency.

Before these blocking checks, the background-recovery kernel classifies the source. It preserves meaningful native alpha while canonicalizing hidden RGB; reconstructs confidently detected neutral, chromatic, subtle, nonstandard-tile or resampled painted checkerboards into real alpha; rejects transparent-rim bypasses around either grids or proven solid high-chroma mattes; removes a declared high-chroma matte; or conservatively infers a flat high-chroma border-band matte when a provider deviates. Chroma recovery follows the nearest confident local matte, uses scale-aware inset subject references and enforces physically bounded foreground colours. Automatic foreground recovery additionally requires the source pixel to retain the key's dominant chroma and requires projection/physical-alpha agreement, preventing a nearby seed from repainting legitimate skin, hair, cuffs or shoes. Lossy distance and matte-complement halo replacement is confined to the proven border-connected matte; ambiguous non-key foreground remains available for explicit artist guidance. Requested spill suppression accepts substituted mattes only after classifier proof, removes material visible key spill and neutralises key-coloured hidden RGB before texture filtering. Ordinary pixels retain bounded recomposition proof, and all connected-matte repairs retain their counts and maximum source drift. Grid and matte-rim repairs are accepted only when canvas-edge segmentation and recomposition proof succeed; ambiguous backgrounds remain rejected.

## Anti-generic art direction

Negative prompts alone are not an art-direction system. Each project receives an explicit style envelope containing references, era, materials, palette, silhouette rules, camera rules, line treatment, composition, recurring motifs and prohibited motifs. Candidate selection compares against that envelope and across the asset family.

The quality system records separate readings for:

- reference adherence;
- originality inside the brief;
- silhouette and shape language;
- palette and value structure;
- period and material plausibility;
- composition and crop;
- anatomy, perspective, text and object artifacts;
- consistency with approved sibling assets.

## Sprite and frame rules

Animation work orders lock canvas size, pivot, baseline, frame naming, direction order, frame rate, loop mode and intended motion arc before frames are produced. QA checks frame dimensions, accidental duplicates, missing frames, anchor drift, silhouette drift, palette drift and loop closure.

A sprite sheet is never the only retained source. The package contains individual lossless frames, the packed sheet, timing data, pivot and collision metadata, a manifest, previews and hashes.

## Atlas rules

Atlas profiles define maximum dimensions, power-of-two policy, padding, edge extrusion, rotation permission, trimming, pivot retention and naming. Rotation is disabled by default for pixel art, directional characters, tiles and any target where hand inspection or engine coordinate clarity matters.

Godot exports can include:

- source PNG frames;
- packed PNG atlas;
- JSON atlas manifest;
- `.tres` SpriteFrames or AtlasTexture resources;
- import-setting recommendations;
- particle flipbook metadata;
- collision or region sidecars when declared by the brief.

## Master and derivative rules

Lossless masters are produced before optimisation. Runtime and web derivatives are compared against the master rather than recursively recompressed. Print outputs retain physical dimensions, effective DPI, bleed, trim, safe area and ICC profile evidence. Metadata removal or retention is explicit per target rather than accidental.

## Autonomous approval

Fully automatic runs may approve a gate only when:

- every blocking deterministic gate passes;
- model-assisted scores meet the policy threshold;
- the evidence bundle is complete;
- the candidate is not an outlier against approved family assets;
- retry and fallback limits have not been exceeded;
- no high-risk ambiguity requires an owner decision.

When a run cannot safely approve itself, it stops with a precise decision packet rather than silently accepting weak art.
