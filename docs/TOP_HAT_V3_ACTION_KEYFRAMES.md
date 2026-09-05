# Top Hat v3 action keyframes

## Scope

This change defines the actual action inside each of the existing 25 clips before temporal subdivision. It does not increase the budget: 732 body frames, 17 registered facial layers, 6 foundation poses, 755 artwork slots overall. No new images, approvals, Cloudinary uploads or runtime activations were produced during this pass. EVA artwork and playback were not changed.

The previous plan started every clip with just its opening and closing images. That can leave the intended action undefined when both endpoints are close to neutral. The new Runtime motion compiler selects explicit performance anchors inside the existing frame budget, then fills the intervals with earlier-wave temporal references.

Examples (frame numbers below are one-based):

| Clip | Authored action anchors |
| --- | --- |
| Single blink | 1 open; 3 closing; 4 complete lid contact; 6 reopening; 9 open return |
| Idle breathe | 1 rest; 13 inhale apex; 25 release; 36 exhale apex; 48 approach loop return |
| Hat tip | 1 rest; 6 hand approach; 12 brim contact; 17 tip apex; 23 hat reseated; 28 settle |
| Wave | Rest; hand raised; outward wrist arc; inward wrist arc; hand lowering; settle |

## Implementation

Runtime adds `src/top-hat-v3-motion-keyframes.js` and uses it from `src/top-hat-v3-generation-plan.js`. Its initial wave contains opening, performance and closing anchors. All later waves require two references from earlier waves. Scheduling a prerequisite does not claim it is approved.

The generation plan preserves the original inventory performance direction, exact target path and job ID. Each body job also carries an authored direction, key-pose label where applicable, motion phase, timestamp and a declared eye/mouth ownership rule. These ownership declarations are production metadata, not a new playback compositor.

Loop sampling uses `ordinal / frameCount`, so the last cyclic sample does not duplicate phase 1. The existing `phase` field remains N-1-based progress for compatibility. Timestamp values are calculated directly from ordinal and cadence, rather than accumulating rounded per-frame milliseconds.

Art Studio validates the timeline and its initial anchor coverage, checks each frame against the declared pose, and forwards the directions and timing into the provider request. New exports require these action anchors. Old v1 exports without motion metadata remain readable. Partially missing, conflicting or orphaned motion metadata fails validation.

Only the hat-tip prompt permits the intended rigid rotation of the original hat. It still forbids changes to its crown, brim, band, scale or identity. This resolves the previous contradiction between demanding a hat tip and demanding an unchanged hat angle.

## Executed verification

Environment: Node v22.16.0 in an isolated Linux container, not the MSI workstation.

From Avatar Runtime:

```sh
node --check src/top-hat-v3-generation-plan.js
node --test scripts/test-top-hat-v3-motion-keyframes.mjs
```

Result: 43 tests passed, zero failed, zero skipped. The generation-plan module received a syntax check; its full profile/import graph was not executed in this checkout.

From Art Studio, with the updated Avatar Runtime checkout alongside it:

```sh
node --test scripts/test-top-hat-v3-motion-handoff.mjs
```

Result: 57 tests, 56 passed, zero failed, one skipped. This run includes the existing 42-test provider regression module. Across the two test runs there are 100 tests: 99 passed and one skipped; do not count the imported regression module again.

The handoff test calls the real Runtime clip-motion compiler and real Art Studio provider-plan compiler with explicitly synthetic inventory and artifact-binding fixtures. It verifies the complete 755-request fixture, preserved action directions, temporal references, invalid timeline rejection, and existing provider/CLI regressions. Fixture approval flags are not real artwork approval records.

The skipped check imports the built Art Studio provider package, which was absent in this environment. Full repository quality gates, actual provider validation/execution, GPU availability, image generation, raster/visual QA and animation smoothness have not been verified by these tests.

The cross-repository test uses a sibling `evavo-avatar-runtime` checkout by default. Set `EVAVO_AVATAR_RUNTIME_ROOT` to an alternate checkout root. An absent default sibling is explicitly skipped; a configured but invalid root fails. These standalone commands were run explicitly and were not added to the repositories' default test scripts in this pass.

## Tested code identities

The committed source/test bytes were compared with the locally tested Git blob identities:

| Repository | File | Git blob SHA1 |
| --- | --- | --- |
| Avatar Runtime | src/top-hat-v3-motion-keyframes.js | 18ba46912b4d24f21f968596a2dfc54a22c10b7e |
| Avatar Runtime | src/top-hat-v3-generation-plan.js | f6f564ee998e350989b203c8544b3402408e005b |
| Avatar Runtime | scripts/test-top-hat-v3-motion-keyframes.mjs | a2cbea9ceb0b3075418d62dffb4ca96dd6e1ba85 |
| Art Studio | scripts/project-art/top-hat-v3-animation-provider-plan.mjs | 9db6cba5086a4cf0681503176e49044cf2742f95 |
| Art Studio | scripts/test-top-hat-v3-provider-plan-regression.mjs | 10564ea009acedd27a57227ab2ea6719994fa3e3 |
| Art Studio | scripts/test-top-hat-v3-motion-handoff.mjs | d02e50aa30571c36fe0f206d536a340936853ab5 |

## Production handoff

Refresh both repositories before exporting a new generation plan. Exported plans and downstream provider plans, schedules and authorizations must be regenerated against the new plan hash. Do not relabel an old authorization or assume it approves a changed plan. Existing approved artwork remains subject to its own exact source and review lineage.

The original full-body master remains the source of truth: `top-hat-man-full-body-master-v5.alpha.png`, expected SHA256 `92cb290246a7629024dcb7768f4119f6a139d9c9f59e3d0545563e1f5b35575a`. Its previously uploaded Cloudinary reference asset is `5aa50c927c4ebff8134d4231628fe7f2`, version `1788583123`; it remains tagged as an unapproved, non-production reference. Its bytes were not independently retrieved or visually inspected in this pass.

Actual image production remains blocked in this chat because the reference has not been surfaced as a usable image input. The first image task is the closed-eye foundation pose, using that exact existing master, followed by identity and registration review. No new character should be invented to work around missing image input.
