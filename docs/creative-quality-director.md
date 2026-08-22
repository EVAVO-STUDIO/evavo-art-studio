# Creative Quality Director

## Purpose

The Creative Quality Director is Art Studio's higher-level visual review compiler. It sits above technical frame, alpha, sequence and targeted-repair checks and answers a different question:

> Is this candidate intentionally designed, drawn, staged, timed, painted and composited, or is it merely technically valid generated media?

It creates immutable review and repair evidence. It does not execute a provider, mutate source art, promote a candidate, grant creative approval, publish media or release client work.

## Relationship to existing Art Studio systems

The compiler extends rather than replaces:

- Art Production candidate admission and production loops;
- frame and sequence quality evidence;
- sprite-family consistency gates;
- alpha and edge mastering;
- targeted repair planning and execution;
- candidate selection, human approval and promotion.

A technical pass is required but is not creative approval. A creative review can return a technically valid frame for redraw, re-layout, re-timing, repainting or effects redesign.

## Review order

Reviews are performed upstream-first:

1. story read and silhouette;
2. character construction and acting;
3. camera, layout and depth;
4. authored timing, weight and contact;
5. line language and cleanup;
6. palette, practical light and cel-shadow design;
7. effects cause, shape, exposure and integration;
8. loop or authored ending behaviour;
9. alpha, crop and delivery readiness;
10. rights-safe provenance.

The system avoids polishing a downstream layer when the actual defect belongs upstream. A malformed key pose is redrawn before in-betweens are cleaned. A broken camera or layout is corrected before background detail is repainted. An unmotivated lighting design is not hidden with bloom or grain.

## Anti-generic rules

The checked-in authored-cel profile rejects, among other failures:

- averaged identity or generic facial construction;
- symmetrical neutral poses without intention, force or contact;
- equal line weight, vector-like cleanup and temporal line crawl;
- plastic shading, airbrushed gradients and unmotivated rim light;
- detail noise without focal hierarchy;
- generic haze used instead of designed depth;
- regenerated motion inside authored holds;
- morphing between keys rather than authored breakdowns and in-betweens;
- particle noise presented as smoke, fire, rain, impact or debris animation;
- effects without physical source, occlusion or contact light;
- repeated-playback loop pops, phase-locked secondary cycles and duplicate terminal frames;
- alpha halos, unsafe transparent RGB and crop damage;
- protected imitation or missing provenance.

Hand-made character is not simulated with random line jitter, global grain, frame-wide wobble or one texture over every material.

## Repair selection

Each failure rule names both a department intervention and, where appropriate, a bridge to Art Studio's existing targeted-repair strategies.

Structural, acting, layout, timing and rights failures cannot be repaired with a superficial inpaint. They require source replacement or manual art direction. Localized line, shade or palette repair may use masked provider inpainting only when an exact repair mask and approved reference artifacts are present. Without the mask, the compiler fails closed to manual review.

Alpha, geometry and composition defects continue to use the deterministic alpha-remaster, transform and recompose lanes.

## Loop modes

The review request must choose one explicit mode:

- `none`: preserve the authored ending and do not force a loop;
- `seamless`: require exact first-frame, last-frame and boundary-review digests, omit the duplicate terminal frame, and review repeated playback;
- `finite-repeat`: require an exact cycle count and terminal policy.

A seamless loop is reviewed for pose, volume, line, palette, luminance, motion-vector continuity, repeated playback and absence of the duplicate terminal frame. Any interpolation is downstream assistance only and requires another seam review.

## Revision convergence

The profile limits unattended revision cycles. Every next candidate remains bound to the previous candidate digest, technical evidence and approved references. Blocking findings must clear and unchanged areas must not regress.

A clean machine review produces `awaiting-human-creative-approval`, never automatic approval. Reaching the revision limit produces an escalation rather than an infinite regenerate-and-score loop.

## CLI

Validate the checked-in profile:

```powershell
node scripts/creative-quality-director.mjs validate `
  --profile config/creative-quality-cel-v1.json
```

Compile one create-only review record:

```powershell
node scripts/creative-quality-director.mjs compile `
  --profile config/creative-quality-cel-v1.json `
  --input .\workfiles\creative-review-request.json `
  --output .\workfiles\creative-review-result.json
```

The request carries exact candidate, technical evidence, approved reference, loop and finding identities. The output is evidence for downstream repair planning and independent approval; it is not a provider instruction or publication receipt.
