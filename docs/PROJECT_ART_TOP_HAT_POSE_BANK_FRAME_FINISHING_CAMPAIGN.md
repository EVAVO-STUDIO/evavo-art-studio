# Top Hat six-pose deterministic frame-finishing campaign

This stage follows the governed Top Hat six-slot candidate-materialization campaign. It consumes six already-materialized, still-unapproved provider candidates and runs the existing deterministic single-frame finisher across the complete pose bank.

It does not perform creative review, candidate admission, promotion, pose-slot filling, sequence release, repository mutation, publication, or Runtime activation.

## Pipeline position

```text
successful six-slot provider campaign
→ successful six-slot candidate materialization
→ shadow-preflight all six frame-finisher inputs
→ persist finishing campaign plan evidence
→ deterministically finish six frames in canonical order
→ persist finishing campaign execution evidence
→ independent named-human frame review
→ existing candidate admission path
```

The canonical slot order remains:

1. `blink-closed`
2. `listening-attentive`
3. `thinking-reflective`
4. `speech-neutral`
5. `presentation-open`
6. `presentation-emphasis`

## Shadow preflight

The frame finisher is deliberately reused instead of reimplemented.

Before the first persistent finished-frame write, every slot is passed through `preflightAvatarFinalPassProviderFrameFiles`. The preflight:

1. validates the real workspace and finisher request source path;
2. snapshots the source candidate into an isolated temporary workspace;
3. invokes the existing `finishAvatarFinalPassProviderFrameFiles` implementation against that snapshot and the original immutable materialization receipt/request;
4. requires the result to remain unapproved and outside review/release/runtime authority;
5. records the exact expected finished PNG SHA-256, frame-finisher report SHA-256, review-request SHA-256, visible-pixel SHA-256 and alpha SHA-256;
6. verifies the original source candidate did not change during preflight; and
7. removes the temporary workspace.

The real candidate workspace receives no finishing outputs during this phase.

The preflight also rejects any pre-existing finished PNG, finisher report, review request, or review outcome. This prevents replay and stale human-review evidence from being mixed into a fresh finishing campaign.

## Deterministic finishing

After all six shadow preflights succeed, the campaign processes the real workspace sequentially in canonical order using the same `finishAvatarFinalPassProviderFrameFiles` function.

For every real result, the campaign requires exact reproduction of the shadow-preflight contract:

- finished PNG SHA-256;
- visible-pixel SHA-256;
- alpha SHA-256;
- frame-finisher report SHA-256; and
- frame-review request SHA-256.

The existing finisher itself also proves that:

- PNG structure and CRCs are valid;
- the canvas is unchanged;
- visible pixels are unchanged;
- alpha is unchanged;
- visible bounds are unchanged;
- only RGB hidden underneath fully transparent pixels may be cleared; and
- the output remains `approvalState: unapproved`.

If any slot fails or does not reproduce the preflight hashes, the campaign stops immediately. Earlier create-only outputs remain as evidence; later slots are untouched.

## Authority boundary

This stage may read materialized candidates, deterministically finish pixels, persist finisher reports, and persist review requests.

It has no authority for:

- provider execution or retry;
- candidate materialization;
- visible-pixel, alpha, canvas, or registration changes;
- creative review;
- candidate approval or promotion;
- dependent inbetween admission;
- pose-slot filling;
- sequence admission or release;
- target repository or Git mutation;
- deployment or publication;
- Runtime activation; or
- force push.

The generated review request is evidence for a later human decision. It is not a review decision itself.

## Production CLI

The CLI requires the exact successful materialization campaign plan and execution receipt, the same candidate workspace, a new create-only evidence root, and one fixed finishing timestamp:

```powershell
node scripts/run-project-art-top-hat-pose-bank-frame-finishing-campaign.mjs `
  --materialization-campaign-plan 'C:\path\to\materialization-run\campaign-plan.json' `
  --materialization-campaign-receipt 'C:\path\to\materialization-run\campaign-execution.json' `
  --workspace-root 'C:\path\to\top-hat-candidate-workspace' `
  --output-root 'C:\path\to\top-hat-finishing-run-001' `
  --finished-at '2026-08-19T01:00:00.000Z'
```

The materialization plan/receipt must be self-validating, mutually bound, successful for all six slots, and bound to the exact workspace root. The finishing `output-root` must not already exist and must be disjoint from both the candidate workspace and the upstream materialization evidence roots.

## Evidence

The CLI writes:

```text
<output-root>/
  campaign-plan.json
  campaign-execution.json
```

The plan evidence hash-binds the upstream materialization plan file/document, the upstream materialization execution file/document, and the six-slot shadow-preflight plan.

The execution evidence hash-binds the finishing campaign receipt to that exact plan evidence and the upstream materialization execution receipt.

The candidate workspace receives, for each slot:

```text
<candidate>.finished.png
<candidate>.frame-finisher.json
<candidate>.frame-review-request.json
```

No frame-review outcome is created here.

## Next required stage

A successful finishing campaign means all six deterministic frame-finisher bundles exist and are awaiting independent named-human review.

It does **not** mean the poses are approved. The reviewer still must inspect technical quality, hands/anatomy, face identity, silhouette registration, adjacent-frame continuity, and loop closure where applicable. Only genuine named-human review evidence may proceed into the existing admission path.

Finishing is not approval.
