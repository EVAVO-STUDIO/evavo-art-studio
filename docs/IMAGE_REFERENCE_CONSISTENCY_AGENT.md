# EVAVO Approved Reference Consistency Agent

This surface helps a finishing artist, ChatGPT, Claude, Codex or another trusted agent answer a narrow production question:

> Does this candidate or batch remain technically visually consistent with the approved reference art?

It is not an AI detector and it is not semantic identity recognition.

## Canonical surface

Use `tools/image_reference_consistency_mcp.mjs`.

Tools:

- `evavo_review_image_against_references` — compare one candidate against 1–32 approved references.
- `evavo_review_image_batch_against_references` — compare 1–128 candidates against one reference set and rank the strongest outliers first.
- `evavo_create_image_reference_consistency_proof` — optional create-only PNG proof with approved references and prioritized candidate cards.
- `evavo_image_reference_consistency_capabilities` — discover limits, signals and boundaries.

## Signals

The deterministic descriptor intentionally uses several independent low-level signals rather than one fragile similarity number:

- RGB palette distribution
- luminance mean and contrast
- saturation
- edge/detail density
- edge-orientation distribution
- transparent silhouette occupancy
- visible-subject centroid and bounds
- aspect/canvas drift

The composite distance is useful for triage. Component distances remain available so an agent can distinguish, for example, palette drift from framing drift.

## Approved reference set coherence

The reference set is checked before a candidate is judged against it.

- `coherent` — references form a reasonably stable visual target.
- `mixed` — references differ enough that candidate drift should be reviewed rather than automatically trusted.
- `unstable` — references conflict strongly; the system refuses to treat their median as authoritative enough for a technical rejection.

This prevents a bad reference set from producing confident but meaningless consistency decisions.

## Decision boundary

Possible candidate decisions are:

- `consistent`
- `review-drift`
- `reject-technical-drift`
- `reference-set-unstable`

A technical drift rejection means the deterministic visual surrogate is outside the configured tolerance. It does **not** mean the system has proven that a character is a different person, that an object is semantically wrong, or that the image violates art direction in a way only a human/vision model can judge.

Human or semantic visual review remains required for:

- character identity and anatomy
- facial expression
- costume/object correctness
- text/glyph correctness
- pose intent
- scene semantics
- historical accuracy
- composition quality
- whether a deliberate art-direction change is desirable

## AI-origin boundary

The surface explicitly reports `aiOriginDetection: "not-claimed"`.

A generated image can be excellent and a human-made image can contain artifacts. Pixel heuristics do not reliably prove authorship. Use trusted provenance/generation records, source lineage and human review when origin matters.

The consistency surface is instead useful for finding symptoms that matter to production regardless of origin: visual drift, inconsistent palette/tone, unexpected detail character, framing/silhouette changes and batch outliers.

## Diagnostic proof

`evavo_create_image_reference_consistency_proof` creates a bounded PNG contact proof. It shows:

1. approved reference cards
2. reference-set coherence
3. candidate cards ordered by strongest deterministic drift first
4. each candidate's grade, composite distance and decision

Transparent assets are displayed over an explicit diagnostic checkerboard. The proof itself is a flattened review artifact and must never be mistaken for a source image with real transparency.

Proof creation is disabled by default. It requires:

- `EVAVO_IMAGE_CONSISTENCY_ALLOWED_ROOTS`
- `EVAVO_IMAGE_CONSISTENCY_ALLOW_WRITES=true`
- `confirmLocalWrite=true` on the exact call

Proof PNG and receipt paths are create-only and must differ from every candidate/reference source path. The proof remains `diagnostic-only` and carries no approval authority.

## Recommended finishing workflow

For generated batches, animation frames or an edited character/object family:

1. Run ordinary technical image review.
2. Run frame technical continuity when the images are a sequence.
3. Run approved-reference consistency when approved visual anchors exist.
4. Inspect the ranked worst candidates first.
5. Generate a visual consistency proof when a human finishing pass is useful.
6. Route simple technical defects to deterministic repair.
7. Route anatomy/content/identity/style defects to governed semantic edit/inpaint with references.
8. Re-run technical and reference consistency review after the repair.
9. Promote only after final visual review and existing Art Studio approval gates.

This gives agents measurable evidence without pretending deterministic image statistics replace an experienced finishing artist.
