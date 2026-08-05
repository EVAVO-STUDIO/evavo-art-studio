# Image reference intelligence

This contract turns an exact reviewed image into a bounded production decision rather than treating every source as either usable or disposable.

The review records what must be preserved, what is defective, the intended game role, required canvas and alpha policy, and whether the correct next action is keep, edit, recreate, generate a variation, retain only as reference, or reject.

## Review flow

```text
exact source bytes and SHA-256
→ semantic and historical review
→ composition, silhouette and style evidence
→ technical alpha, crop, edge and resolution evidence
→ explicit decision
→ image-reference work order
→ provider-neutral edit or generation request
→ independent source/candidate comparison
→ Art Studio delivery manifest
→ Development Studio workspace execution
→ Test Lab and browser evidence
→ separate creative approval and publication
```

A recreation must retain only explicitly approved identity, composition and style traits. It must list defects to remove and negative constraints. “Make it similar” is not an adequate work order.

The work-order compiler performs no provider call, image edit, deletion, repository mutation or publication:

```powershell
node scripts/compile-image-reference-work-order.mjs review.json work-order.json
```

For Brass & Brine, comparisons must consider 1871 plausibility, port and culture specificity, monochrome engraving language, restrained red accents, gameplay readability, correct transparency treatment and the governed runtime canvas.
