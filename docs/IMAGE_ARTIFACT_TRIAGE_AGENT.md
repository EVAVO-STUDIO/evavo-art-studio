# EVAVO Image Artifact Triage Agent

The artifact triage surface helps agents and finishing artists find suspicious image defects without pretending pixel statistics can determine whether an image was AI-generated.

## Canonical surface

Use `tools/image_artifact_triage_mcp.mjs`.

Tools:

- `evavo_image_artifact_triage_capabilities`
- `evavo_review_image_artifact_risk`

The review is read-only and path-confined by `EVAVO_IMAGE_ARTIFACT_ALLOWED_ROOTS`.

## Deterministic signals

The surface combines the existing technical artifact evidence with generated-detail triage:

- ringing / oversharpen candidates
- tonal posterization risk
- 2x nearest-neighbour upscale fingerprint for non-pixel-art profiles
- repeated nontrivial local-pattern risk
- local detail-density imbalance
- normal image quality and connected-defect context

Repeated-detail detection ignores flat patches and compares non-local normalized local structures. It is automatically suppressed as a generated-detail warning for profiles where repetition is commonly intentional, including textures, pixel art, UI screenshots and logos.

Local detail-density review compares the distribution of small-region detail energy. It is useful for finding one strangely over-detailed or under-detailed region in otherwise coherent art.

## What these signals mean

They are production triage signals. They can point toward things such as:

- cloned or doubled motifs
- repeated generated micro-structures
- strange local texture reuse
- one inconsistent high-frequency region
- aggressive sharpening
- poor resampling
- quantized tone ramps

The same measurements can also come from intentional pattern design, tileable textures, compression, depth of field, UI repetition, or deliberate focal detail. For that reason the generated-detail layer is advisory and does not automatically reject an image.

## What still requires semantic visual review

Deterministic raster statistics cannot establish:

- malformed anatomy or hands
- whether text/glyphs make sense
- character or costume identity
- impossible reflections
- incorrect occlusion
- perspective logic
- whether an object or scene is semantically wrong

Route those findings to human/vision review and, where appropriate, governed semantic edit/inpaint with masks and approved references.

## AI-origin boundary

The surface explicitly refuses to identify AI authorship.

`aiOriginDetection` is not claimed and the review reports image origin as undetermined. Artifact signals are useful whether the source was generated, photographed, painted, composited, cloned, compressed or manually edited.

When origin matters, use trusted provenance metadata, signed generation records and source lineage. Use approved-reference consistency for visual-family drift, not authorship.

## Recommended workflow

1. Run normal finishing review.
2. Run artifact triage when the image feels synthetic, overprocessed, oddly repetitive or inconsistent in local detail.
3. If approved visual anchors exist, run reference consistency too.
4. Inspect the actual image around the flagged signals.
5. Route deterministic technical defects to bounded repair.
6. Route semantic defects to masked provider/artist repair.
7. Re-review after editing.
8. Keep final approval behind the existing Art Studio promotion boundary.
