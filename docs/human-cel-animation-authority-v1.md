# Human cel animation authority v1

Art Studio owns reusable animation request/profile planning. It does not duplicate Cel Animation Studio's craft engine. When an animation request must use strict hand-drawn cel production, compile a human-cel authority bridge and hand that authority to the Cel Animation Studio workflow.

## Purpose

`tools/human_cel_animation_authority_v1.mjs` converts a compatible animation request into a deterministic, digest-bound authority envelope that requires:

- `evavo-human-cel-craft-v1` craft authority;
- `human-cel-authored` mode;
- strict draftsmanship and anti-generic enforcement;
- strict cel timing authenticity;
- `createHumanCelRenderPrompt` as the preferred downstream compiler;
- `evaluateHumanCelQualityGate` before promotion;
- Cel Animation Studio `@evavo/cel-core` 0.33.0 or newer.

It grants no provider execution, creative approval, repository mutation or publication authority.

## Admission rules

Strict human-cel authority is available only to `limited-cel` or `full-cel` motion styles and requires a `cel-sequence` or `video-sequence` target. Requests must also provide stable subject identity locks, silhouette anchors, costume anchors, anatomy rules, camera framing, performance intent/weight/tempo, continuity anchors, shape language, line treatment, anti-generic traits and exclusions.

This prevents a generic or weakly specified animation request from being relabelled as human-authored cel work after the fact.

## Downstream requirements

The authority handoff requires these Cel Animation Studio core surfaces:

- `createHumanCelRenderPrompt`
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

The consolidated quality gate now requires deterministic evidence for drawing continuity, anti-generic artefacts, line/paint/light finish, cinematography and environment staging before the manual department approvals are even considered.

Art Studio can continue to provide deterministic camera, perspective, identity, pose-beat, delivery and runtime planning. Cel Animation Studio remains responsible for the stricter craft grammar and promotion evidence.

## MCP surface

Use `.mcp.human-cel-animation-authority-v1.json` to expose:

- `compile_human_cel_animation_authority_v1`
- `verify_human_cel_animation_authority_v1`

Both operations are side-effect free.

## Prohibited substitutions

The authority explicitly forbids one-pass anime filters, independent per-frame regeneration, generic optical-flow smoothing over authored timing, morphing between keys, random line boil, fake analogue degradation, unmotivated rim/bloom/genre grading and generated pseudo-lettering.
