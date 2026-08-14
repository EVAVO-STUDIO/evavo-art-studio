# Iterative 1990s Game Art Production Orchestrator

The Art Production Orchestrator adds a deterministic admission, review-and-repair control plane above the existing layered source-art contracts.

It is designed for DOS, VGA, top-down sports, side-on arcade, point-and-click, world-map and fixed-camera isometric games where camera accuracy, native pixel grammar and frame continuity matter more than one attractive concept image.

```text
layered production plan
  -> game, style and camera profile
  -> dependency-safe one-image batch
  -> external provider request and response evidence
  -> retained candidate PNG and inspection evidence
  -> exact scheduled-job candidate-admission receipt
  -> deterministic technical evaluation
  -> bounded repair and retry
  -> technical pass
  -> named-human creative approval receipt
  -> individual source PNG retention
  -> strip, grid and atlas metadata
  -> separate packaging execution and Godot integration
```

## Reusable game-type profile foundation

The orchestrator complements the generic `scripts/game-art-production` profile engine rather than replacing it. The reusable profile engine resolves game-type asset contracts and one-asset work orders; this orchestrator coordinates many work orders through dependency, admission, review, repair and packaging state.

The JONEZ fixture is split across:

```text
config/game-art-production/profiles/isometric-life-sim-1990s.v1.json
config/game-art-production/projects/jonez.v1.json
config/game-art-production/loops/jonez-1991-iterative-loop.v1.json
```

The generic profile defines reusable DOS VGA isometric asset families and QA vocabulary. The project binding supplies JONEZ identity, repository, paths and camera metadata. The loop policy binds the exact layered district plan to deterministic batch, metric, repair and packaging rules.

## What the loop controls

A reusable profile locks:

- the game identity, target era, engine and engine version;
- one fixed camera family and the exact projection, yaw, pitch, roll and orthographic scale;
- legal gameplay-facing directions;
- weighted technical review metrics;
- a complete blocking-detection set;
- retry budget and batch size;
- animation identity, pivot and ground-contact thresholds;
- individual-PNG retention and non-rotating, non-trimming packaging policy.

The built-in camera families are:

```text
isometric-life-sim-90s
top-down-sports-90s
side-on-arcade-90s
interior-point-click-90s
world-map-strategy-90s
custom-fixed-90s
```

A profile cannot silently reinterpret a dimetric life-sim plan as a top-down sports game or change camera angles between assets.

## Scheduling

Every source unit begins in one of these states:

```text
gated
queued
repair-required
review-passed
blocked
```

The scheduler honours lower-layer dependencies, style-proof scope, continuity families, identity masters and previous animation frames. Repair work is scheduled before new work, and every job still requests exactly one source PNG.

## Candidate admission

Technical review accepts only a governed `evavo.art-production.candidate-admission.receipt`.

The receipt compiler independently recompiles the exact current batch and refuses a request unless it identifies one current job by matching:

```text
batchSha256
jobSha256
unitId
attemptNumber
mode
expected width and height
expected alpha policy
```

The request must also provide four distinct content-addressed artifacts:

- provider request evidence;
- provider response evidence;
- the retained candidate PNG;
- a separate inspection-evidence report.

The receipt retains the provider identity, model, provider job ID, candidate identity, admitting operator, admission time, a normalized request hash, a governed admission-basis hash and the complete receipt hash.

This is an evidence-binding boundary, not an execution boundary. Art Studio does not claim to run the provider, fetch or decode the evidence, inspect the PNG bytes or decide that the candidate is technically acceptable.

The former loose attempt-level `candidate` object is rejected. `ArtProductionAttemptInput` now carries the complete admission receipt, and semantic replay re-verifies that receipt against the exact prior loop before any score or state transition can be reproduced.

See `docs/ART_PRODUCTION_CANDIDATE_ADMISSION.md`.

## Technical evaluation

Candidate and inspection evidence are externally produced and content-addressed. The orchestrator does not claim to inspect image bytes by itself.

Static sources are scored for:

- alpha quality;
- exclusive layer purity;
- native-scale readability;
- palette discipline;
- deliberate pixel-cluster quality;
- camera accuracy;
- era authenticity;
- non-generic project identity;
- runtime usability.

Animation frames additionally require:

- identity consistency;
- pivot stability;
- ground-contact stability;
- coherent pose progression.

Blocking detections include antialiasing, gradients, bloom, procedural pixel noise, generic AI styling, SVG-like rendering, generated text, halos, unsafe transparent RGB, camera drift, identity drift, pivot drift, foot drift, crop risk and copyrighted imitation.

A failed attempt receives a bounded repair directive and a retry prompt that preserves the exact dimensions, alpha policy, camera, palette, layer ownership, continuity key, pivot and ground contact. Art Studio never weakens the rubric merely because the retry limit has been reached. Exhausted work becomes `blocked`.

## Semantic replay

The loop is self-hashed, but verification does not trust that hash alone. It reconstructs the initial loop and replays every retained attempt in order, recomputing:

- scheduled candidate-admission identity;
- candidate identity;
- required metrics;
- weighted score;
- failed metrics;
- blocking detections;
- review decision;
- repair directives;
- retry prompt;
- next unit states;
- final loop identity.

A rehashed scheduling substitution, authority escalation, edited repair result or changed candidate therefore fails verification.

## Named-human approval receipts

A deterministic technical pass remains separate from creative approval.

Before packaging, every exact accepted candidate requires an `evavo.art-production.human-approval.receipt` compiled from an explicit caller-supplied named-human decision. That receipt is bound to the exact plan, loop, profile, admitted candidate, technical-review attempt, reviewer, decision time and separate decision-evidence artifact.

Receipt compilation records the decision; it does not make it or authenticate the reviewer’s legal identity.

## Packaging plan

Packaging is available only when:

1. the style proof is approved;
2. the loop covers full production;
3. every source was admitted through its exact scheduled job;
4. every unit has a deterministic technical pass;
5. each exact accepted candidate has a named-human approval receipt;
6. every animation clip contains all declared frames in canonical order.

The plan can retain individual PNGs and describe:

- horizontal animation strips;
- fixed-column animation grids;
- deterministic shelf-packed atlases;
- source rectangles, frame order, pivots and Y-sort origins.

Atlas rotation and trimming remain forbidden for pixel-art sources. Packaging metadata does not mutate pixels or replace the authoritative individual PNGs.

## MCP surface

```text
art_production_orchestrator_protocol
compile_art_production_loop
compile_next_art_production_batch
compile_art_production_candidate_admission_receipt
evaluate_art_production_attempt
verify_art_production_loop
compile_art_production_human_approval_receipt
compile_art_production_packaging_plan
```

These tools compile and verify contracts only. They do not call a provider, inspect image bytes, automatically admit a candidate, make a creative decision, execute image repair, write sheets or atlases, mutate a game repository, commit, push, deploy or publish.
