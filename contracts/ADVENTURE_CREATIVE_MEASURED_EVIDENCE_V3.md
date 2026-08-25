# Adventure Creative Measured Evidence v3

Art Studio must return `adventure-creative-measured-evidence-v3.schema.json` evidence for every Adventure Studio v3 production candidate that enters review or production acceptance.

## Evidence is measured, never inferred

Evidence must be computed from the decoded candidate artifact and its retained production manifests. Do not copy requested values into the evidence object and do not infer transparency from a checkerboard preview.

For transparent work, decode the real alpha channel and measure fully transparent, partially transparent and opaque pixels. Explicitly detect baked checkerboards, matte residue, halo/fringe pixels and contaminated RGB hidden under zero alpha. A visual checkerboard background is not transparency and must be reported as a failure.

For animation/cel work, report the actual frame IDs, duplicates, missing/unexpected frames, per-frame trim geometry, exposure timing and anchors. Compare the measured sequence against the work-order frame plan, model sheet and X-sheet. Do not accept independently regenerated frames whose identity, costume, proportions, anchors or palette drift between drawings.

## Iterative repair discipline

1. Produce a candidate against the exact work-order revision.
2. Measure the candidate.
3. Review measured failures against the work order.
4. Repair only the failed frame IDs or regions named by the repair order.
5. Preserve accepted frames, protected regions, layout geometry and invariant digests byte-for-byte or pixel-for-pixel where the repair policy requires it.
6. Re-measure the repaired candidate.
7. Verify the original finding closed and no protected/accepted work regressed.
8. Return the new revision with lineage to the previous candidate and governing authorities.

Whole-asset regeneration is a last resort and requires an explicit work-order reason. It must never be used merely because one frame has a bad hand, edge, alpha fringe or timing error.

## Art Studio responsibilities

Art Studio is authoritative for measured still-image evidence such as native dimensions, decoded alpha topology, transparency contamination, layout registration, palette/style comparison and protected-region drift. Cel/sequence evidence may be produced here only when Art Studio is explicitly responsible for the animation asset.

A delivery with digest-only evidence is not sufficient for Adventure Studio production acceptance.
