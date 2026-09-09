# EVAVO Image Sequence Finishing Agent

The sequence finishing agent reviews ordered animation frames as both individual assets and a temporal set. It exists for cases where ordinary batch review is not enough because adjacent frames, canvas continuity and intentional holds matter.

## Canonical surface

Use `tools/image_sequence_finishing_mcp.mjs`.

Tools:

- `evavo_image_sequence_finishing_capabilities`
- `evavo_review_image_sequence_finishing`

The surface is read-only and uses `EVAVO_IMAGE_SEQUENCE_ALLOWED_ROOTS` for local frame/reference access.

## What it combines

For 2–128 ordered frames it combines:

- the unified per-frame finishing packet
- repair/regen/human-review disposition per frame
- optional approved-reference consistency
- canvas and aspect-ratio continuity
- alpha-state consistency
- quality-score continuity
- luminance and contrast continuity
- sharpness continuity
- visible-mass continuity
- adjacent perceptual similarity
- duplicate/near-duplicate neighbor evidence

Every frame can also carry explicit semantic findings such as identity drift, malformed text, broken anatomy or wrong content. Those findings remain attached to that frame and can force semantic repair even when technical metrics look normal.

## Intentional holds

Exact or near-duplicate neighboring frames are not automatically rejected.

A repeated frame can be a valid authored hold, timing device or deliberate idle pause. The default policy therefore surfaces duplicate neighbors as review evidence and adds an instruction to verify motion pacing visually.

Set `duplicateNeighborPolicy="ignore"` only when repeated holds are already intentional and separately validated.

## Sequence decision

The sequence returns:

- `pass-to-visual-review`
- `review`
- `reject`

This decision is technical/production triage. It does not claim that animation acting, pose arcs, timing, anticipation, follow-through, identity or style motion are artistically correct.

## Review priority

Frame priority combines:

1. finishing packet priority (`critical`, `high`, `review`, `normal`)
2. number of technical continuity flags
3. duplicate-neighbor evidence
4. approved-reference distance when references exist

This makes it practical to review a large animation by inspecting the most suspicious frames first.

## Relationship to other Art Studio surfaces

Use the sequence finishing agent when frames are ordered and temporal continuity matters.

Use `evavo_review_image_finishing_batch` when the images are related but order is not meaningful.

Use `evavo_create_image_finishing_batch_proof` to create a prioritized visual contact sheet for the human finishing pass. It can be used after sequence review as the visual queue because it uses the same per-frame finishing packet decisions.

Use the older `evavo_review_image_set_consistency` specialist tool when a caller specifically wants its historical median continuity output. The sequence finishing agent is the more actionable default because it includes repair routing and semantic findings.

## Recommended animation workflow

1. Supply ordered frames and their real durations when known.
2. Supply approved character/style references when available.
3. Supply semantic findings from human/vision review for frames with anatomy, identity, text, pose or content problems.
4. Run sequence finishing review.
5. Inspect frames in `reviewPriority` order.
6. Confirm whether duplicate neighbors are intentional holds.
7. Route each frame according to its packet disposition.
8. Re-run the sequence review after edits.
9. Create a prioritized finishing proof for human signoff when useful.
10. Keep final promotion behind existing Art Studio approval gates.

The agent does not identify AI authorship and does not automatically approve animation for release.
