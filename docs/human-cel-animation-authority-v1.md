# Human cel animation authority v1

Art Studio owns reusable animation request/profile planning. It does not duplicate Cel Animation Studio's craft engine. When an animation request must use strict hand-drawn cel production, compile a human-cel authority bridge and hand that authority to the Cel Animation Studio workflow.

## Purpose

`tools/human_cel_animation_authority_v1.mjs` converts a compatible animation request into a deterministic, digest-bound authority envelope that requires:

- `evavo-human-cel-craft-v1` craft authority;
- `human-cel-authored` mode;
- strict draftsmanship and anti-generic enforcement;
- strict cel timing authenticity;
- one exact Cel Animation Studio production authority bound to the downstream work-order and direction digests;
- `createStrictHumanCelRenderPrompt` as the required downstream compiler for a strict production claim;
- `evaluateHumanCelQualityGate` before promotion;
- the strict candidate to cite the exact strict-envelope digest in its provenance;
- `createHumanCelQualityReceipt` for the exact candidate bytes after deterministic and manual craft review;
- `reviewHumanCelArtefact` as the required positive approval path;
- Cel Animation Studio `@evavo/cel-core` 0.35.0 or newer.

It grants no provider execution, creative approval, repository mutation or publication authority.

## Admission rules

Strict human-cel authority is available only to `limited-cel` or `full-cel` motion styles and requires a `cel-sequence` or `video-sequence` target. Requests must also provide stable subject identity locks, silhouette anchors, costume anchors, anatomy rules, camera framing, performance intent/weight/tempo, continuity anchors, shape language, line treatment, anti-generic traits and exclusions.

This prevents a generic or weakly specified animation request from being relabelled as human-authored cel work after the fact.

## Downstream requirements

The authority handoff requires these Cel Animation Studio core surfaces:

- `createHumanCelProductionAuthority`
- `assertHumanCelProductionAuthorityBinding`
- `createStrictHumanCelRenderPrompt`
- `assertStrictHumanCelRenderPromptIntegrity`
- `createHumanCelShotLanguageDirective`
- `createHumanCelLightingDirective`
- `createHumanCelTimingDirective`
- `createHumanCelEnvironmentStagingDirective`
- `evaluateHumanCelDrawingContinuity`
- `evaluateHumanCelAntiGenericReview`
- `evaluateHumanCelFinishReview`
- `evaluateHumanCelCinematographyReview`
- `evaluateHumanCelEnvironmentReview`
- `evaluateHumanCelQualityGate`
- `createHumanCelQualityReceipt`
- `assertHumanCelQualityReceiptBinding`
- `reviewHumanCelArtefact`

The downstream Cel authority identifies one exact work order, craft-direction packet, render request, task and visual stage. Any change makes that authority stale. The strict compiler returns a digest-bound envelope containing both that authority and the exact governed render prompt, so a convenience/base compiler cannot silently satisfy a `human-cel-authored` claim.

The consolidated quality gate requires deterministic evidence for drawing continuity, anti-generic artefacts, line/paint/light finish, cinematography and environment staging before the manual department approvals are even considered.

The output-side quality receipt then binds those decisions to the exact candidate content digest plus the strict-envelope, authority, prompt, work-order and direction digests. A filename or visually similar replacement cannot reuse the receipt. Changing the candidate or any strict upstream identity requires a new receipt.

Strict approval is finally delegated through `reviewHumanCelArtefact`. It refuses an `approved` decision without a current zero-blocker receipt. Rejection remains available without a passing receipt, so obviously bad work never needs fabricated positive evidence.

Art Studio can continue to provide deterministic camera, perspective, identity, pose-beat, delivery and runtime planning. Cel Animation Studio remains responsible for the stricter craft grammar, exact downstream authority and promotion evidence.

## MCP surface

Use `.mcp.human-cel-animation-authority-v1.json` to expose:

- `compile_human_cel_animation_authority_v1`
- `verify_human_cel_animation_authority_v1`

Both operations are side-effect free.

## Prohibited substitutions

The authority explicitly forbids one-pass anime filters, independent per-frame regeneration, generic optical-flow smoothing over authored timing, morphing between keys, random line boil, fake analogue degradation, unmotivated rim/bloom/genre grading, generated pseudo-lettering, using a convenience/base prompt compiler to stand in for the required strict authority-bound path, and approving a strict candidate through the generic artefact review path without a current quality receipt.
