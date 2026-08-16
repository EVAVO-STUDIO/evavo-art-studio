# Top Hat Runtime 0.34 pose-slot production map

Avatar Runtime `0.34.0` deliberately exposes the difference between safe current playback and complete authored performance. Three native-alpha Top Hat body anchors are admitted today, while six semantic body-pose slots remain unfilled:

- `blink-closed`
- `listening-attentive`
- `thinking-reflective`
- `speech-neutral`
- `presentation-open`
- `presentation-emphasis`

The Project Art pose-slot production map binds those six Runtime slots to Art Studio’s existing 24-clip, 24–30 fps animation suite. It creates a deterministic, hash-bound production and review plan. It does **not** generate an image, approve a candidate, fill a Runtime slot, mutate another repository, deploy or publish.

## Exact provenance

The v1 contract binds:

```text
Avatar Runtime
repository: EVAVO-STUDIO/evavo-avatar-runtime
commit:     524066fc95fee329e1a20f7c9aa7d805d94c8cc8
tree:       db8af48a71f1a2708c99f5cea220c7e7dd324e84
package:    0.34.0
pose bank:  evavo_top_hat_body_pose_bank_v1 / 1.0.0

Art Studio production source
repository: EVAVO-STUDIO/evavo-art-studio
commit:     5f2859286e7b9b2823b34019a7d383adeb86c923
tree:       d60f85749c0c1eab7f09b2c273fca3a83c8195f7
animation:  evavo.project-art-avatar-animation-suite-plan.v3
display:    evavo.project-art-avatar-display-bridge-plan.v1
alpha:      evavo.project-art-atlas-transparent-rgb-summary.v1
             evavo.project-art-transparent-rgb-bleed.v1
```

It also requires the exact approved neutral, inhale and exhale master paths, dimensions, byte lengths and SHA-256 values. A stale Runtime pin, changed Art Studio source, altered anchor or widened authority fails closed.

## Slot-to-suite mapping

| Runtime slot | Primary Art Studio clip | Continuity references | Intended authored result |
|---|---|---|---|
| `blink-closed` | `blink-single` | `blink-double` | Natural closed-eye contact pose with unchanged body registration |
| `listening-attentive` | `listening` | `attention` | Restrained attentive posture rather than a generic nod |
| `thinking-reflective` | `thinking` | — | Subtle reflective pose without cartoon exaggeration |
| `speech-neutral` | `talk-neutral` | `talk-in`, `talk-out` | Conversational body anchor with no baked mouth viseme |
| `presentation-open` | `talk-engaged` | `wave` for hand-motion evidence | Open-hand presentation pose, explicitly not a greeting wave |
| `presentation-emphasis` | `talk-emphasis` | `nod` | One restrained emphasis beat with stable fingers and identity |

Every referenced clip is checked against `avatar-animation-suite.mjs` by the focused contract test. The body selector never accepts a mouth viseme. Registered mouth layers continue to own all speech shapes and exact audio timing.

## Candidate output boundary

Each slot receives unique create-only candidate paths for:

```text
RGBA master
machine-readable evidence
review contact sheet
candidate manifest
```

The output remains `planned-unfilled` and `activationEligible: false`. Existing candidates are never overwritten. A separate signed approval receipt and a separate hash-bound release plan are required before Runtime or website activation.

## Alpha and atlas assurance

A candidate is not admitted merely because a provider says it is transparent. The map requires:

- decoded 1024×1536 straight RGBA;
- real native alpha at admission;
- painted checkerboard and opaque matte blocking;
- chroma-spill blocking;
- hidden-RGB cleanup;
- bounded transparent-RGB bleed with radius 8;
- exact alpha preservation;
- visible-RGB preservation above the configured threshold;
- exact non-compositing RGBA atlas paste;
- black, white, mid-grey, green and magenta background proofs;
- nearest and linear filtering proofs;
- zoomed-out runtime review;
- visible-edge and cropped-silhouette blocking.

This keeps checkerboard pixels, green or magenta spill, transparent black fringes and cropped canvas edges out of the runtime.

## Identity and motion review

All six jobs are locked to the approved neutral, inhale and exhale anchors. Review blocks:

- face or character identity drift;
- body-proportion drift;
- top-hat geometry drift;
- pivot or baseline drift;
- hand or finger defects;
- broken entry, exit or loop continuity;
- whole-body switching driven by mouth visemes;
- synthetic body inbetweening presented as authored art.

Presentation and conversational slots require explicit hand and finger review. Every candidate requires named human approval, an approval timestamp and the approved artifact SHA-256.

## Usage

Compile the exact current request in code:

```js
import {
  compileProjectArtTopHatPoseSlotProduction,
  createProjectArtTopHatPoseSlotProductionRequest,
} from './scripts/project-art/top-hat-pose-slot-production.mjs';

const plan = compileProjectArtTopHatPoseSlotProduction(
  createProjectArtTopHatPoseSlotProductionRequest(),
);
```

Run the focused regression suite with:

```bash
node --test scripts/test-project-art-top-hat-pose-slot-production.mjs
```

The dedicated GitHub workflow runs the same contract whenever the mapping, test, documentation, animation suite or workflow changes.

## Current truth

The current three-anchor Runtime remains safe and deployable. The larger performance set is not complete. The six slots remain explicitly unfilled until real assets pass Art Studio mastering, continuity review, runtime preview and named human approval. The production map closes the engineering handoff without falsely claiming that missing artwork already exists.
