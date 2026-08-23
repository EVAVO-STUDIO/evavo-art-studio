# Character Performance Bank v1

Character Performance Bank v1 turns an approved character design into a reusable, identity-locked drawing bank for dialogue, idle behaviour, expressions, gestures, and transitions. It is a planning, inspection, repair, approval, and delivery contract. It does not generate images, promote a candidate automatically, or activate media in a product.

## Production sequence

1. `compileCharacterPerformanceBank` compiles a deterministic bank from an exact production ID, character ID, creative-intent digest, continuity digest, art-direction digest, thresholds, and slot list.
2. `verifyCharacterPerformanceBank` semantically recompiles the bank and rejects any altered slot, digest, hold relationship, threshold, or authority field.
3. `reviewCharacterPerformanceBank` applies identity, alpha, framing, line-quality, specificity, palette, performance-role, and mouth-chart gates.
4. A failed review produces slot-scoped repair instructions. The repair plan preserves the approved bank identity and forbids a whole-bank regeneration shortcut.
5. `approveCharacterPerformanceBank` records a named creative decision against the exact clean review. It grants creative approval only.
6. `compileCharacterPerformanceDelivery` emits exact Art-to-Cel and Art-to-Video Studio Handoff v2 envelopes for the approved bank.

## Required authored coverage

The bank supports authored slots for:

- idle drawings and intentional holds;
- speaking and listening gestures;
- expressions and expression transitions;
- gesture-to-idle and idle-to-gesture transitions;
- mouth drawings using the governed shape chart: `rest`, `a`, `e`, `o`, `u`, `m-b-p`, `f-v`, `l`, and `w-q`;
- optional effects that remain separate from the locked character palette.

Repeated bytes are admitted only when the slot explicitly declares an intentional hold of one source drawing. A repeated path without a valid hold relationship is rejected.

## Quality evidence

Every slot binds:

- exact asset path, SHA-256, width, and height;
- protected safe bounds;
- alpha coverage, edge contact, halo, hidden-RGB, and unwanted-matte measurements;
- landmark, palette, and cleanup evidence digests;
- identity, line-quality, specificity, and generic-AI penalty basis-point scores;
- role, mouth shape, notes, and intentional-hold source when applicable.

The review blocks or routes repair for cropped edges, white or coloured halos, hidden RGB under transparency, unwanted backgrounds, unsafe framing, identity drift, weak cleanup, generic detail, palette drift, missing performance roles, and missing mouth drawings.

## Repair boundary

Repairs are targeted to the smallest failing slot or evidence field. A repair must retain:

- the production, character, creative-intent, continuity, and art-direction identities;
- unaffected slot hashes;
- protected facial and silhouette landmarks;
- approved palette and line treatment;
- intentional hold relationships;
- existing approved drawings that do not fail the review.

A repair instruction is not an approval. The rebuilt bank must be recompiled, reverified, rereviewed, and then approved by a named creative actor.

## Authority boundary

The module may compile plans, review evidence, emit targeted repair instructions, record a named creative approval, and prepare delivery handoffs. It may not:

- execute an image provider;
- declare provider output final;
- perform automatic creative approval;
- grant release approval;
- publish or deploy media;
- activate assets in Cel Animation Studio, Video Studio, a website, or a game.

## Commands

From the Art Studio repository root:

```bash
node scripts/check-studio-production-v2.mjs
node --test test/studio-handoff-v2.test.mjs test/character-performance-bank-v1.test.mjs
node --check tools/character-performance-bank-v1.mjs
node --check tools/character-performance-delivery-v1.mjs
```

The focused tests include clean-bank compilation, tamper rejection, intentional holds, targeted repair routing, named approval, and cross-studio delivery lineage.
