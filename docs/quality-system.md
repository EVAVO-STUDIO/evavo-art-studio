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

Before these blocking checks, the background-recovery kernel classifies the source. It preserves meaningful native alpha while canonicalizing hidden RGB, reconstructs confidently detected neutral or chromatic painted checkerboards into real alpha (including transparent-rim bypass attempts), removes a declared high-chroma matte, or conservatively infers a flat high-chroma border matte when a provider deviates. Checkerboard repair is accepted only when canvas-edge segmentation and recomposition proof succeed; ambiguous backgrounds remain rejected.

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
