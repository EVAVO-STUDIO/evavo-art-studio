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
- pivot, baseline, camera, alpha and loop-closure locks;
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
  -> adjacent-frame and loop review
  -> targeted repair
  -> alpha/frame mastering
  -> atlas/package
  -> Godot runtime validation
```

Batch size is a worker/resource limit, not an animation-design rule. Frames are grouped by motion dependency. A future provider may execute several related frame candidates in one bounded call, but every retained drawing remains an independently addressable immutable artifact.

## Provider controls

Art Studio's governed ComfyUI profile contract already supports canonical identity, direction master, previous/next key poses, pose, edge and depth controls, palette and line references. Animation Director should compile into those existing semantic roles rather than introduce provider-specific graph concepts.

Pose guidance is intentionally abstract. An implementation may use an authored 2D skeleton, OpenPose-compatible control image, silhouette, depth guide, 3D mannequin projection or another reviewed structural representation. The Animation Director owns the semantic pose and contact constraints; the provider adapter owns how a reviewed workflow consumes them.

## Timing and interchange

Animation timing remains explicit source data. Aseprite is a useful optional editable interchange because its CLI can export tagged frame ranges, layers, sprite sheets and JSON metadata, and its frame model retains per-frame duration. It must not become the canonical EVAVO authority: EVAVO manifests remain the source of timing, identity, provenance and approval state.

Godot `SpriteFrames` likewise supports animation FPS, per-frame relative duration and none/linear/ping-pong loop modes. The Art Studio delivery adapter should translate reviewed EVAVO timing into those runtime semantics without changing authored timing.

## Quality work still required

The current Art Studio sequence checks catch important image continuity failures, but the Animation Director needs dedicated motion analyzers before the walk slice is production-proven. Highest-value additions are:

- planted-foot lock measured in subject-local coordinates;
- root/centre-of-mass trajectory continuity;
- optional joint and limb-length stability;
- hand-to-prop or hand-to-weapon attachment stability;
- facing and camera stability;
- final-to-first pose and root closure;
- temporal palette, line-weight and lighting flicker;
- runtime-scale playback review rather than contact-sheet-only review.

These analyzers must produce evidence and blockers, not creative approval.

## Lifecycle

Animation iteration should use the existing workspace lifecycle rather than production ceremony for every experiment:

```text
scratch -> working -> candidate -> reviewed -> approved -> delivery
```

Scratch/working frames may be regenerated and repaired within bounded authorised work. Only reviewed/approved artifacts may enter an authoritative atlas or release package.

## Next implementation slices

1. Add pose-plan artifacts and structural-control image binding.
2. Compile Animation Director frame plans into existing provider-neutral candidate requests.
3. Add planted-foot/root/prop motion QA and loop-closure evidence.
4. Add Aseprite import/export adapter with exact tool/version fingerprinting and no arbitrary script surface.
5. Add a Godot walk-cycle smoke fixture that verifies frame order, timing, pivot, loop mode and atlas sampling in Game Test Lab.
6. Extend motion profiles only after the walk fixture is proven: run, jump/land, climb, sword attack and hit reaction are the next useful families.
7. Route traditional-cel profiles through Cel Animation Studio rather than duplicating X-sheet logic.

The definition of done for the first slice is not "a plan compiles". It is one canonical character moving through this entire path and producing a visually reviewed, technically clean walk cycle that plays correctly in the target Godot runtime.
