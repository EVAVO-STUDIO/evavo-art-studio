# Human cel animation authority v1

Art Studio owns reusable animation request/profile planning. It does not duplicate Cel Animation Studio's craft engine. When an animation request must use strict hand-drawn cel production, compile a human-cel authority bridge and hand that authority to the Cel Animation Studio workflow.

## Purpose

`tools/human_cel_animation_authority_v1.mjs` converts a compatible animation request into a deterministic, digest-bound authority envelope that requires:

- `evavo-human-cel-craft-v1` craft authority;
- `human-cel-authored` mode;
- strict draftsmanship and anti-generic enforcement;
- strict construction-first cleanup/ink rather than auto-tracing or random line wobble;
- strict colour/paint authorship from approved palette roles, local colour, cel-shadow families and material-specific highlights;
- strict cel timing authenticity;
- strict acting/performance authorship rather than generic idle motion, timer blinking or mouth flapping;
- strict registered optical/compositing craft rather than blanket bloom, interpolation, full-frame weather textures or fake analogue damage;
- one exact Cel Animation Studio production authority bound to downstream work-order and direction digests;
- `createStrictHumanCelRenderPrompt` as the required downstream compiler for a strict production claim;
- `createHumanCelColourPaintDirective`, `createHumanCelCleanupInkDirective`, `createHumanCelPerformanceDirective` and `createHumanCelCompositingDirective` inside the strict prompt grammar;
- `evaluateHumanCelQualityGate`, including `evaluateHumanCelPerformanceReview`, before promotion;
- the strict candidate to cite the exact strict-envelope digest in its provenance;
- `createHumanCelQualityReceipt` for the exact candidate bytes after deterministic and manual craft review;
- `reviewHumanCelArtefact` as the canonical positive review helper;
- the Cel Animation Studio persistence-level strict receipt gate before any approved state becomes authoritative;
- canonical persisted snapshot/render-job integrity at the public Cel Store boundary;
- Cel Animation Studio `@evavo/cel-core` 0.38.0 or newer;
- Cel Animation Studio `@evavo/cel-store` 0.27.0 or newer.

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
- `createHumanCelColourPaintDirective`
- `createHumanCelCleanupInkDirective`
- `createHumanCelTimingDirective`
- `createHumanCelPerformanceDirective`
- `createHumanCelEnvironmentStagingDirective`
- `createHumanCelCompositingDirective`
- `evaluateHumanCelDrawingContinuity`
- `evaluateHumanCelAntiGenericReview`
- `evaluateHumanCelFinishReview`
- `evaluateHumanCelCinematographyReview`
- `evaluateHumanCelPerformanceReview`
- `evaluateHumanCelEnvironmentReview`
- `evaluateHumanCelQualityGate`
- `createHumanCelQualityReceipt`
- `assertHumanCelQualityReceiptBinding`
- `reviewHumanCelArtefact`

The authority also requires Store 0.27's `strict-human-cel-promotion-receipt-gate` and `canonical-snapshot-render-job-integrity` behaviours. The public Store recomputes canonical production-snapshot content, render recipe/request/job identity, task graph, artefact bindings and current render-job content before the strict receipt gate is trusted. A hand-edited job or snapshot therefore cannot become authority merely by carrying strings that look like SHA-256 digests.

For strict candidates, the receipt gate remains the final craft-promotion boundary: if a candidate cites a persisted strict envelope, a render-job revision cannot newly approve it or advance using it until a matching immutable zero-blocker receipt exists. The ordinary annotation-clearance and risk-acceptance gates still apply afterward.

## Authored production departments

Core 0.38 makes the three additional departments explicit in the downstream immutable authority:

- `strictCleanupAndInk: true`
- `strictColourAndPaint: true`
- `strictOpticalCompositing: true`

Cleanup begins from construction and protects gesture, volume, contact, line hierarchy and closed paint regions. Held ink remains stable and mechanical hard points do not melt between drawings. Random line wobble and uniform auto-traced vector contours are not accepted as handmade character.

Colour begins from stable local colour and approved palette roles. Shadows are designed cel shapes from the named light hierarchy, not a universal black multiply layer. Highlights differ by material. Night scenes retain local-colour identity instead of receiving a blanket blue wash. Universal rim light, universal gloss and generic LUT grading are rejected.

Optical/compositing works from registered layers and authored timing. Glow, diffusion, reflection and weather require source/depth/duration logic. Locked cameras stay locked. Smears, multiples and held drawings remain discrete. Optical flow, blanket bloom, full-frame weather overlays, temporal grain crawl and fake film/VHS damage cannot replace production craft.

The production authority also marks `strictPerformanceActing: true`. The strict prompt therefore includes performance grammar for gaze/thought beats, reaction delay, authored blinking, stable face/head construction, contained mouth substitution, genuine held body parts and character-specific asymmetry.

The consolidated quality gate requires deterministic evidence for drawing continuity, anti-generic artefacts, line/paint/light finish, cinematography, acting/performance and environment staging before manual department approvals are even considered. Manual review includes acting/performance approval as its own required decision.

The output-side quality receipt binds those decisions to the exact candidate content digest plus the strict-envelope, authority, prompt, work-order and direction digests. A filename or visually similar replacement cannot reuse the receipt. Changing the candidate or any strict upstream identity requires a new receipt.

`reviewHumanCelArtefact` is the canonical strict positive-review helper. The store is deliberately stronger than helper identity: even an older or generic caller cannot make a strict approved job revision authoritative unless the same exact persisted receipt evidence passes the global promotion gate and the persisted snapshot/job state first recomputes correctly.

Art Studio can continue to provide deterministic camera, perspective, identity, pose-beat, delivery and runtime planning. Cel Animation Studio remains responsible for the stricter craft grammar, exact downstream authority, immutable quality evidence and persisted promotion enforcement.

## MCP surface

Use `.mcp.human-cel-animation-authority-v1.json` to expose:

- `compile_human_cel_animation_authority_v1`
- `verify_human_cel_animation_authority_v1`

Both operations are side-effect free.

## Prohibited substitutions

The authority explicitly forbids one-pass anime filters, independent per-frame regeneration, generic optical-flow smoothing over authored timing, morphing between keys, auto-traced/vector-uniform cleanup, random line wobble or line boil, blanket blue-night/multiply-shadow/generic LUT colour treatment, fake analogue degradation, constant idle body bob, timer-like blinking, generic mouth flapping, blanket bloom/full-frame weather/fake film damage, unmotivated rim/bloom/genre grading, generated pseudo-lettering, using a convenience/base prompt compiler to stand in for the required strict authority-bound path, persisting a strict approved candidate without a current candidate-byte-bound zero-blocker quality receipt, and trusting hand-edited persisted job/snapshot state without canonical Store integrity verification.
