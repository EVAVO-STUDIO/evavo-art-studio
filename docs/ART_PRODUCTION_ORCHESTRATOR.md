# Iterative 1990s Game Art Production Orchestrator

The Art Production Orchestrator adds a deterministic review-and-repair control plane above the existing layered source-art contracts.

It is designed for DOS, VGA, top-down sports, side-on arcade, point-and-click, world-map and fixed-camera isometric games where camera accuracy, native pixel grammar and frame continuity matter more than one attractive concept image.

```text
layered production plan
  -> game, style and camera profile
  -> dependency-safe one-image batch
  -> exact candidate evidence
  -> deterministic technical evaluation
  -> bounded repair and retry
  -> technical pass
  -> explicit named-human decision
  -> candidate-bound human-approval receipt
  -> individual source PNG retention
  -> strip, grid and atlas metadata
  -> approval-bound runtime assembly handoff
  -> exact caller-supplied source PNG byte admission
  -> separate assembly execution and Godot integration
```

## Reusable game-type profile foundation

The orchestrator complements the generic `scripts/game-art-production` profile engine rather than replacing it. The reusable profile engine resolves game-type asset contracts and one-asset work orders; this orchestrator coordinates many work orders through dependency, review, repair, approval provenance, packaging state, runtime-assembly admission and exact source-byte verification.

The JONEZ fixture is now split across:

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

## Technical evaluation

Candidate evidence is externally produced and content-addressed. The technical-review loop does not claim to inspect image bytes by itself. Exact PNG byte inspection occurs later at the source-admission boundary after review, approval, packaging and runtime-handoff lineage are complete.

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

- candidate admission identity;
- required metrics;
- weighted score;
- failed metrics;
- blocking detections;
- review decision;
- repair directives;
- retry prompt;
- next unit states;
- final loop identity.

A rehashed authority escalation or edited repair result therefore fails verification.

## Named-human approval receipts

A deterministic technical pass is not a creative approval. For each accepted candidate, a caller must supply an explicit named-human approval request and a distinct content-addressed decision-evidence artifact.

`compileArtProductionHumanApprovalReceipt` binds that supplied decision to:

- the exact layered-production plan and plan SHA-256;
- the exact full-production loop and profile SHA-256;
- one canonical source unit;
- the exact accepted candidate artifact, byte count and SHA-256;
- the exact technical-review attempt and derived weighted score;
- the reviewer, canonical UTC review time and approved decision;
- the external decision-evidence artifact and SHA-256.

The receipt retains independent request, approval-basis and complete-receipt hashes. Verification first checks its submitted payload, then recompiles the canonical receipt from the exact plan, loop, candidate and request. A changed derived score, candidate, loop, authority field or source identity cannot be legitimised by recomputing the outer receipt hash.

Receipt compilation records a caller-supplied decision. It does not authenticate a person's legal identity, inspect the external evidence bytes or make the creative decision. Those remain responsibilities of the governed human-review and artifact systems.

## Packaging plan

Packaging is available only when:

1. the style proof is approved;
2. the loop covers full production;
3. every unit has a deterministic technical pass;
4. every exact accepted candidate has a valid candidate-bound named-human approval receipt;
5. every animation clip contains all declared frames in canonical order.

The plan retains each individual source with its technical-review attempt, approval request, approval basis and approval receipt identities, and can describe:

- horizontal animation strips;
- fixed-column animation grids;
- deterministic shelf-packed atlases;
- source rectangles, frame order, pivots and Y-sort origins.

Atlas rotation and trimming remain forbidden for pixel-art sources. Packaging metadata does not mutate pixels or replace the authoritative individual PNGs.

## Runtime assembly handoff

The generic layered-assembly compiler remains reusable outside Art Production and therefore accepts content-addressed approval-receipt identities without receiving the full production loop and packaging contract.

`compileArtProductionRuntimeAssemblyHandoff` is the stricter orchestrated bridge. It verifies the exact loop, every complete approval receipt and the deterministic packaging plan before compiling a `runtime-candidate` assembly manifest. Every admitted assembly source must match the same artifact ID, SHA-256, byte count, dimensions, technical-review attempt, approval request, approval basis and approval receipt retained by packaging.

The handoff embeds the verified runtime-ready assembly manifest and one lineage record per admitted source. Verification first checks the submitted handoff and authority boundary, then recompiles the expected handoff from the exact plan, loop, receipts, package and assembly request. A handoff from another placement layout, source subset, package, receipt set or loop cannot be replayed.

The handoff is still metadata only. It does not read source bytes, pack pixels, write assembly files, run Godot, mutate a game repository or activate a runtime.

## Source PNG byte admission

`compileArtProductionSourceAdmissionReceipt` is the next read-only boundary. It first re-verifies the exact runtime handoff, then requires one caller-supplied `Uint8Array` for every source binding.

For each PNG it independently verifies:

- exact byte count, SHA-256 and `artifact_<sha256>` identity;
- PNG signature, bounded chunk framing and every chunk CRC;
- one leading IHDR, contiguous IDAT data and terminal IEND;
- static eight-bit RGBA non-interlaced encoding;
- exact native dimensions;
- bounded zlib decoding and PNG filters 0 through 4;
- alpha-policy compliance;
- non-empty visible pixels;
- zero hidden RGB values under fully transparent pixels;
- decoded RGBA SHA-256 and pixel totals.

The resulting receipt binds those byte and pixel facts to the plan, loop, package, assembly request, assembly manifest, handoff, technical-review attempt and human-approval lineage.

`verifyArtProductionSourceAdmissionReceipt` validates the submitted receipt and then repeats the complete byte inspection to recompile the canonical receipt. Rehashed receipt mutation or replay against another handoff therefore fails.

This API inspects only bytes explicitly supplied by the caller. It does not browse an artifact store, write files, mutate pixels, execute packaging, assemble a scene or activate a runtime.

## MCP surface

```text
art_production_orchestrator_protocol
compile_art_production_loop
evaluate_art_production_attempt
compile_next_art_production_batch
verify_art_production_loop
compile_art_production_human_approval_receipt
compile_art_production_packaging_plan
compile_art_production_runtime_assembly_handoff
```

These tools compile and verify contracts only. The human-approval tool records an explicit caller-supplied named-human decision and can verify a receipt against the exact retained request; it does not decide whether an image is creatively approved.

The runtime-assembly handoff tool cross-binds approved package sources to the existing assembly manifest, but it does not read artifact bytes, execute assembly, write a scene, activate a runtime, mutate a repository, commit, push, deploy or publish.

Source PNG byte admission is deliberately a direct `@evavo/art-direction` package API rather than an MCP tool. The MCP surface cannot fetch or ingest binary artifact payloads and remains planning-only.

The tools do not call a provider, admit candidate bytes, make a creative decision, execute image repair, write sheets or atlases, mutate a game repository, commit, push, deploy or publish.
