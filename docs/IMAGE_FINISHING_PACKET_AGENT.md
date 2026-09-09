# EVAVO Unified Image Finishing Packet

The finishing packet is the preferred first review surface when an agent needs to decide what should happen to an image, not merely collect low-level metrics.

## Canonical surface

Use `tools/image_finishing_packet_mcp.mjs`.

Tools:

- `evavo_review_image_finishing_packet` — one candidate image.
- `evavo_review_image_finishing_batch` — 1–128 candidates with compact per-image decisions.
- `evavo_create_image_finishing_batch_proof` — optional create-only visual finishing queue.
- `evavo_image_finishing_packet_capabilities` — discovery and limits.

The older finishing-artist, artifact-triage, reference-consistency and repair surfaces remain available as specialist tools. The packet coordinates their decision evidence; it does not replace their lower-level operations.

## What one packet combines

A packet includes:

- role/profile-aware technical quality review
- connected defect regions and preservation-first finishing plan
- ringing, posterization and suspicious resampling evidence
- repeated-detail and local-detail-density triage
- safe repair routing
- optional approved-reference consistency
- explicit semantic findings supplied by a vision/human review
- recommended next governed tools

It produces one disposition:

- `ready-for-visual-review`
- `safe-local-repair`
- `localized-repair`
- `semantic-repair`
- `reacquire-or-regenerate`
- `human-review`

It also assigns `normal`, `review`, `high` or `critical` priority.

## Conservative interaction between evidence

Evidence is not combined by blindly averaging scores.

A source that is technically safe to polish can still be downgraded to human review when it has strong drift from a coherent approved reference set. If the approved references themselves are unstable, the packet asks for the reference set to be curated instead of rejecting the candidate against a contradictory target.

Known semantic findings such as broken anatomy, malformed text, identity drift, wrong content or perspective errors route to semantic repair rather than sharpening or generic filters.

## Batch review

`evavo_review_image_finishing_batch` handles up to 128 candidates. A shared approved-reference model is computed once for the batch rather than separately for every frame.

Per candidate it retains:

- disposition and priority
- technical grade/score and blockers
- artifact/generated-detail flags
- repair route and requirements
- approved-reference drift when references exist
- reason codes
- recommended next tools

The overall batch returns:

- priority order
- disposition counts
- priority counts
- technical reject count
- generated-detail risk count
- approved-reference drift count
- reference-set coherence

The agent-facing batch payload is intentionally compact so a large animation or generated-art batch remains tractable.

## Visual finishing proof

`evavo_create_image_finishing_batch_proof` creates a PNG contact proof ordered by the same combined review priority. It works with or without approved references.

Each card includes:

- candidate ID
- priority
- disposition
- quality score
- approved-reference distance when available
- concise artifact-risk flags

Transparent candidates are displayed over a diagnostic checkerboard. The checker is part of the flattened review proof and never represents real transparency.

Proof generation is disabled by default. It requires:

- `EVAVO_IMAGE_FINISHING_PACKET_ALLOWED_ROOTS`
- `EVAVO_IMAGE_FINISHING_PACKET_ALLOW_WRITES=true`
- `confirmLocalWrite=true` on the exact call

The proof PNG and receipt are create-only, cannot overwrite source/reference files and remain `diagnostic-only`.

## Recommended automated finishing loop

1. Call `evavo_review_image_finishing_packet` or the batch equivalent.
2. If the packet says `safe-local-repair`, use the governed preservation repair surface.
3. If it says `localized-repair`, use a reviewed candidate and explicit mask.
4. If it says `semantic-repair`, use a governed provider/artist edit with mask and references.
5. If it says `reacquire-or-regenerate`, do not fake missing detail with sharpening.
6. If it says `human-review`, inspect the evidence and references before changing pixels.
7. After every pixel-changing operation, run the finishing packet again on the actual output.
8. Generate a batch proof when human review needs a prioritized contact sheet.
9. Promote only through the existing explicit approval boundary.

## Origin and approval boundaries

The packet does not identify AI authorship. It can identify production artifacts and visual consistency risks, but origin remains a provenance question.

The packet never modifies source pixels and never grants final approval. `automaticPromotionAllowed` is always false and `requiresHumanVisualReview` is always true.
