# Iterative 1990s Game Art Production Orchestrator

The Art Production Orchestrator is a deterministic admission, review, repair, approval, packaging and runtime-handoff control plane above the existing layered source-art contracts.

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
  -> explicit named-human decision
  -> candidate-bound human-approval receipt
  -> individual source PNG retention
  -> strip, grid and atlas metadata
  -> approval-bound runtime assembly handoff
  -> separate assembly execution and Godot integration
```

Protocol `2026-08-14.4` combines the candidate-admission and runtime-assembly lineages without granting either stage execution authority.

## Reusable game-type profile foundation

The orchestrator complements the generic `scripts/game-art-production` profile engine rather than replacing it. The reusable profile engine resolves game-type asset contracts and one-asset work orders; this orchestrator coordinates many work orders through dependency, admission, review, repair, approval provenance, packaging state and runtime-assembly admission.

The JONEZ fixture is split across:

```text
config/game-art-production/profiles/isometric-life-sim-1990s.v1.json
config/game-art-production/projects/jonez.v1.json
config/game-art-production/loops/jonez-1991-iterative-loop.v1.json
```

A reusable profile locks game identity, target era, engine, fixed camera family, projection, yaw, pitch, roll, orthographic scale, facing directions, technical metrics, blocking detections, retry budget, batch size, animation continuity thresholds and packaging policy.

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

Every source unit moves through:

```text
gated
queued
repair-required
review-passed
blocked
```

The scheduler honours lower-layer dependencies, style-proof scope, continuity families, identity masters and previous animation frames. Repair work is scheduled before new work. Every job requests exactly one source PNG and is self-hashed inside one exact batch.

## Candidate admission

Technical review no longer accepts a free-standing candidate object.

`compileArtProductionCandidateAdmissionReceipt` independently recompiles the exact current batch and requires the submitted evidence to identify one current job by matching:

```text
batchSha256
jobSha256
unitId
attemptNumber
mode
expected width and height
expected alpha policy
```

The request must provide four distinct content-addressed artifacts:

- provider request evidence;
- provider response evidence;
- the retained candidate PNG;
- a separate inspection-evidence report.

The receipt retains provider identity, model, provider job ID, candidate identity, admitting operator, canonical UTC admission time, `jobBasisSha256`, `requestSha256`, `admissionBasisSha256` and `admissionReceiptSha256`.

The generic verifier checks the submitted receipt and deterministically recompiles it from the exact plan, loop and scheduled job. The request-bound verifier additionally proves that the receipt belongs to the exact retained external evidence request.

Receipt compilation records caller-supplied evidence. It does not prove that a provider actually ran, fetch or inspect evidence bytes, decode the PNG, automatically admit a candidate or make a technical decision.

See `docs/ART_PRODUCTION_CANDIDATE_ADMISSION.md`.

## Technical evaluation

`ArtProductionAttemptInput` requires the complete candidate-admission receipt. Technical review derives the candidate identity only from that verified receipt.

Static sources are scored for alpha quality, exclusive layer purity, native-scale readability, palette discipline, deliberate pixel clusters, camera accuracy, era authenticity, non-generic project identity and runtime usability.

Animation frames additionally require identity consistency, pivot stability, ground-contact stability and coherent pose progression.

Blocking detections include antialiasing, gradients, bloom, procedural pixel noise, generic AI styling, SVG-like rendering, generated text, halos, unsafe transparent RGB, camera drift, identity drift, pivot drift, foot drift, crop risk and copyrighted imitation.

A failed attempt receives bounded repair directives and a retry prompt preserving dimensions, alpha policy, camera, palette, layer ownership, continuity key, pivot and ground contact. Exhausted work becomes `blocked`; the rubric is never weakened to accept the best bad result.

## Semantic replay

The loop does not trust its self-hash alone. Verification reconstructs the initial loop and replays every retained attempt, recomputing:

- exact scheduled candidate-admission identity;
- candidate identity;
- required metrics and weighted score;
- failed metrics and blocking detections;
- review decision;
- repair directives and retry prompt;
- next unit states;
- final loop identity.

A stale or substituted job, edited candidate, rehashed authority escalation or changed repair result therefore fails verification.

A review-passed accepted candidate retains direct identities for its admission receipt, scheduled batch and job, provider request and response evidence, inspection evidence and technical-review attempt.

## Named-human approval receipts

A deterministic technical pass is not creative approval.

For each accepted candidate, a caller supplies an explicit named-human approval request and a distinct content-addressed decision-evidence artifact. `compileArtProductionHumanApprovalReceipt` binds that decision to the exact plan, loop, profile, admission-bound candidate, technical-review attempt, derived score, reviewer and canonical UTC review time.

The receipt retains independent request, approval-basis and complete-receipt hashes. Verification checks the submitted payload and recompiles the canonical receipt from the exact governed inputs.

Receipt compilation records the supplied decision. It does not authenticate legal identity, inspect decision-evidence bytes or make the creative decision.

## Packaging plan

Packaging is available only when:

1. the style proof is approved;
2. the loop covers full production;
3. every source was admitted through its exact scheduled job;
4. every unit has a deterministic technical pass;
5. every exact accepted candidate has a valid named-human approval receipt;
6. every animation clip contains all declared frames in canonical order.

The plan retains each authoritative individual PNG with technical-review and approval lineage and can describe horizontal strips, fixed-column grids and deterministic shelf-packed atlases. Rotation and trimming remain forbidden for pixel-art sources.

Packaging metadata does not mutate pixels or replace the authoritative individual PNGs.

## Runtime assembly handoff

The generic layered-assembly compiler remains reusable outside Art Production and therefore does not receive the full production loop, candidate-admission history, approval receipts and packaging plan.

`compileArtProductionRuntimeAssemblyHandoff` is the stricter orchestrated bridge. It verifies the exact admission-bound loop, every complete approval receipt and the deterministic packaging plan before compiling one blocker-free `runtime-candidate` assembly manifest.

Every admitted assembly source must match the same artifact ID, SHA-256, byte count, dimensions, technical-review attempt, approval request, approval basis and approval receipt retained by packaging. The technical-review attempt identity transitively commits the exact candidate-admission receipt and scheduled provider evidence used before review.

The handoff embeds the verified runtime-ready assembly manifest and one lineage record per admitted source. Verification checks the submitted handoff, then recompiles it from the exact plan, loop, receipts, package and assembly request. A handoff from another placement layout, source subset, package, receipt set or loop cannot be replayed.

The handoff is metadata only. It does not read source bytes, pack pixels, write assembly files, run Godot, mutate a game repository or activate a runtime.

See `docs/ART_PRODUCTION_RUNTIME_ASSEMBLY_HANDOFF.md`.

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
compile_art_production_runtime_assembly_handoff
```

These tools compile and verify contracts only. They do not call a provider, read or inspect artifact bytes, automatically admit a candidate, make a creative decision, execute image repair, write sheets or atlases, execute assembly, activate a runtime, mutate a game repository, commit, push, deploy or publish.
