# EVAVO Animation Director

The Animation Director is the orchestration layer for deterministic 2D animation planning in Art Studio. It converts a high-level motion request into an explicit frame plan before provider execution.

The implementation remains evidence-driven and provider-neutral. It does not treat generated imagery as approved art, does not hide timing decisions inside prompts, and does not duplicate Cel Animation Studio's X-sheet authority.

## Why this belongs in Art Studio

Art Studio already owns canonical sprite identities, direction masters, matching-frame generation, alpha mastering, sequence review, sheet/atlas production and Godot delivery. Cel Animation Studio owns authored X-sheets, exposure semantics and traditional cel production. Godot Engine Systems owns runtime construction and playback, not professional source-art production.

A separate generic `animation-studio` repository would duplicate those boundaries. Animation Director therefore coordinates the existing Art Studio capabilities and delegates traditional X-sheet work to Cel Animation Studio when a production profile requires it.

## First executable vertical slice

`compileAnimationDirectorPlan` currently supports an authored eight-drawing walk cycle. It emits:

- contact, down, passing and up frame roles for both steps;
- rational `1000 / fps` timing rather than rounded millisecond constants;
- a canonical identity reference on every frame;
- optional direction-master references;
- explicit pose-control requirements;
- previous-frame and next-key-pose reference roles for dependent drawings;
- two key contact poses followed by two bounded in-between groups;
- planted-foot continuity requirements and style-specific drift tolerances;
- explicit `root`, `leftFoot` and `rightFoot` landmark requirements;
- style-specific maximum root-step and loop-seam tolerances;
- pivot, baseline, camera, alpha and loop locks;
- an all-false authority boundary for provider execution, approval, promotion, repository mutation and publication.

The compiler deliberately rejects unsupported actions in this protocol revision. Expanding the action vocabulary without motion-specific semantics would produce generic animation plans and is not considered progress.

## Generation strategy

The intended production order is:

```text
canonical identity + direction master
  -> motion profile
  -> pose plan
  -> key contacts
  -> key-pose review
  -> dependency-bounded in-betweens
  -> motion evidence
  -> sequence and motion QA
  -> targeted repair
  -> alpha/frame mastering
  -> atlas/package
  -> Godot runtime validation
```

Batch size is a worker/resource limit, not an animation-design rule. Frames are grouped by motion dependency. A future provider may execute several related frame candidates in one bounded call, but every retained drawing remains an independently addressable immutable artifact.

## Motion evidence and QA

`@evavo/art-quality` now exposes `analyseAnimationMotion`. It consumes supplied per-frame landmark evidence and evaluates motion independently from the Animation Director.

The first implemented gates are:

- required-landmark presence;
- planted-landmark lock across each contiguous planted segment;
- maximum root movement between adjacent drawings;
- optional attachment constraints such as hand-to-weapon grip distance;
- explicit loop-seam anchor closure.

This separation is deliberate. Animation Director states what evidence is required; Quality evaluates evidence that was actually produced. Neither package invents landmark detections or claims creative approval.

Loop closure is seam-aware. A valid walk does not require every limb in the last drawing to equal the first drawing. The first walk profile therefore closes the stable `root` seam anchor while foot and limb progression remain governed by pose, contact and adjacent-frame constraints. Additional motion families can declare different seam anchors where appropriate.

Landmark coordinates are provider-neutral evidence. They may come from reviewed authored controls, a pinned pose estimator, a 3D projection, manually corrected anchors or another governed analyser. The analyser never treats the existence of landmark JSON as proof that the landmarks are visually correct; provenance and analyser identity must be retained by the caller.

## Provider controls

Art Studio's governed ComfyUI profile contract already supports canonical identity, direction master, previous/next key poses, pose, edge and depth controls, palette and line references. Animation Director should compile into those existing semantic roles rather than introduce provider-specific graph concepts.

Pose guidance is intentionally abstract. An implementation may use an authored 2D skeleton, OpenPose-compatible control image, silhouette, depth guide, 3D mannequin projection or another reviewed structural representation. The Animation Director owns the semantic pose and contact constraints; the provider adapter owns how a reviewed workflow consumes them.

## Timing and interchange

Animation timing remains explicit source data. Aseprite is a useful optional editable interchange because its CLI can export tagged frame ranges, layers, sprite sheets and JSON metadata, and its frame model retains per-frame duration. It must not become the canonical EVAVO authority: EVAVO manifests remain the source of timing, identity, provenance and approval state.

Godot `SpriteFrames` likewise supports animation FPS, per-frame relative duration and none/linear/ping-pong loop modes. The Art Studio delivery adapter should translate reviewed EVAVO timing into those runtime semantics without changing authored timing.

## Remaining quality work

The current motion analyser is intentionally deterministic and evidence-driven; it does not perform pose detection by itself. The next useful QA additions are:

- a governed landmark/pose extraction adapter with exact model/runtime provenance;
- limb-length and joint-angle stability where anatomy is relevant;
- facing-direction evidence;
- weapon-tip and prop trajectory continuity;
- temporal palette, line-weight and lighting flicker;
- runtime-scale playback evidence rather than contact-sheet-only review.

These analyzers must produce evidence and blockers, not creative approval.

## Lifecycle

Animation iteration should use the existing workspace lifecycle rather than production ceremony for every experiment:

```text
scratch -> working -> candidate -> reviewed -> approved -> delivery
```

Scratch/working frames may be regenerated and repaired within bounded authorised work. Only reviewed/approved artifacts may enter an authoritative atlas or release package.

## Next implementation slices

1. Add a governed pose/landmark evidence producer and structural-control image binding.
2. Compile Animation Director frame plans into existing provider-neutral candidate requests.
3. Bind provider results to motion evidence and use failed motion gates to produce targeted repair requests.
4. Add Aseprite import/export with exact tool/version fingerprinting and no arbitrary script surface.
5. Add a Godot walk-cycle smoke fixture that verifies frame order, timing, pivot, loop mode and atlas sampling in Game Test Lab.
6. Extend motion profiles only after the walk fixture is proven: run, jump/land, climb, sword attack and hit reaction are the next useful families.
7. Route traditional-cel profiles through Cel Animation Studio rather than duplicating X-sheet logic.

The definition of done for the first slice is not "a plan compiles". It is one canonical character moving through this entire path and producing a visually reviewed, technically clean walk cycle that plays correctly in the target Godot runtime.
