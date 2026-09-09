# EVAVO Image Agent Workflow Handbook

This document is the operational map for ChatGPT, Claude, Codex and other trusted agents working with Art Studio image assets.

The core rule is simple:

> Review first, choose the smallest safe operation, preserve the source, prove the result, review the actual output again, and promote only through the explicit approval boundary.

## Default routing

### One image and the problem is not yet known

Start with the unified finishing packet:

- `evavo_review_image_finishing_packet`

It combines technical quality, defects, artifact/generated-detail triage, repair routing, optional approved references and known semantic findings.

Use the older `evavo_review_image_for_finishing` when raw specialist finishing evidence is specifically needed.

### Many related images, order does not matter

Use:

- `evavo_review_image_finishing_batch`
- optionally `evavo_create_image_finishing_batch_proof`

The batch shares one approved-reference model and returns compact per-image dispositions plus one prioritized review queue.

### Ordered animation or frame sequence

Use:

- `evavo_review_image_sequence_finishing`

This adds canvas/tone/sharpness/visible-mass continuity and adjacent-frame similarity to the same per-frame finishing decisions.

Duplicate neighboring frames are review evidence rather than automatic failures because authored holds are valid animation.

### Does this match approved art?

Use:

- `evavo_review_image_against_references`
- `evavo_review_image_batch_against_references`
- optional `evavo_create_image_reference_consistency_proof`

This is a deterministic visual-family surrogate. It measures palette/tone/detail/silhouette/framing drift and checks whether the reference set itself is coherent before trusting it.

It does not prove character/object identity.

### Does this have suspicious generated-looking or overprocessed defects?

Use:

- `evavo_review_image_artifact_risk`

Signals include ringing, posterization, suspicious 2x nearest-neighbour upscaling, repeated nontrivial local detail and abnormal local detail-density distribution.

These are artifact signals, not AI authorship detection.

### Painted checkerboard, matte background or broken transparency

Use the raster finishing surface:

- real-alpha mastering/recovery
- transparency proof
- finishing review afterward

Never treat visible checkerboard pixels as a real alpha channel.

### Natural-background removal

Do not approximate an ambiguous photographic/natural subject boundary using chroma-key heuristics.

Use an approved segmentation/provider mask, then preserve outside-mask pixels and generate alpha proof/review evidence.

### Small deterministic technical defect

Use the image repair planner first.

Safe preservation polish is appropriate only for defects it actually fixes, such as admitted transparent-RGB or fringe contamination. It is not a generic enhancer.

### Local semantic defect

Examples:

- malformed hand/anatomy
- wrong text
- identity drift
- wrong object/content
- perspective error
- style mismatch

Use a governed provider/artist candidate plus an explicit reviewed mask and reference when required, then apply the bounded candidate through the localized repair surface.

Never use sharpening or global filters to pretend a semantic defect was repaired.

### Blur or missing source detail

Do not invent confidence with aggressive sharpening.

Prefer source reacquisition, a better original render, or governed learned enhancement. Learned enhancement must pass source-space structural/detail review before it can replace a source.

### Texture/PBR material

Use the texture workflow:

1. map-aware review
2. material-set review
3. UV/OBJ review when mesh data is available
4. explicit normal-Y conversion only when needed
5. explicit opacity-to-albedo-alpha composition only when needed
6. optional 3x3 tile proof
7. optional AO/Roughness/Metallic packing
8. Godot material delivery plan
9. create-only `.tres` materialization
10. optional native headless Godot load/class validation
11. representative in-engine visual inspection

Do not process normal/roughness/AO/metallic/height data maps as ordinary colour photographs.

### Runtime shader/effect

Prefer the Godot sprite/effects surface for dynamic effects. Keep effect layers/shaders separate from canonical master art unless a reviewed delivery explicitly requires a baked result.

## Write classes

Art Studio distinguishes several permission classes.

### Read-only

Review, routing, consistency and planning tools should not alter source files.

### Write-gated create-only

A deterministic derived asset/proof may be written only when:

- the surface write environment variable is enabled
- that exact call includes `confirmLocalWrite=true`
- output remains under configured roots
- output differs from every source path
- the target does not already exist

### Candidate + mask required

A localized semantic edit requires a reviewed candidate image plus mask. Outside-mask preservation is enforced where the repair primitive promises it.

### Native execution gated

Native Godot validation is a separate execution privilege from file creation. The executable is operator-configured, shell execution is disabled, the exact call requires execution confirmation, and the operation can update normal Godot cache/import data.

## Approval model

Generated outputs, repair outputs, proofs and material resources are not automatically approved merely because the operation completed.

Important states include:

- diagnostic-only
- unapproved
- promotion-ready evidence
- explicit final approval/promotion

Numeric review, successful file creation or successful native engine loading never substitutes for final visual approval.

## Finishing loop

For most image work the preferred loop is:

1. review packet
2. optional approved-reference/artifact/sequence specialist review
3. choose smallest safe route
4. create derived output non-destructively
5. generate relevant proof/difference evidence
6. run the review packet on the actual derived output
7. compare again with approved references/sequence when relevant
8. inspect the real image at intended runtime/output size
9. approve/promote explicitly

## AI-origin boundary

No image tool should claim that artifact heuristics prove an image was AI-generated.

Use:

- provenance metadata or signed generation records
- source/reference lineage
- deterministic artifact evidence
- approved-reference consistency
- human/vision semantic review

The production question is normally more useful than the authorship guess: **is this image correct, coherent, intentional and release-quality?**

## Useful environment boundaries

Current specialist surfaces use explicit local roots, including:

- `EVAVO_IMAGE_FINISHING_PACKET_ALLOWED_ROOTS`
- `EVAVO_IMAGE_REVIEW_ALLOWED_ROOTS`
- `EVAVO_IMAGE_REPAIR_ALLOWED_ROOTS`
- `EVAVO_IMAGE_CONSISTENCY_ALLOWED_ROOTS`
- `EVAVO_IMAGE_ARTIFACT_ALLOWED_ROOTS`
- `EVAVO_IMAGE_SEQUENCE_ALLOWED_ROOTS`
- `EVAVO_TEXTURE_REVIEW_ALLOWED_ROOTS`
- Godot material delivery/validation roots

Keep roots as narrow as practical for the current project/workspace rather than granting unrestricted filesystem access.
