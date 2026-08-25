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
- provider-compatible previous-key-pose and next-key-pose roles for dependent drawings;
- two key contact poses followed by two bounded in-between groups;
- planted-foot continuity requirements and style-specific drift tolerances;
- explicit `root`, `leftFoot` and `rightFoot` landmark requirements;
- style-specific maximum root-step and loop-seam tolerances;
- pivot, baseline, camera, alpha and playback-loop locks;
- provider-safe identifiers and provider-compatible canvas bounds before a provider plan exists;
- an all-false authority boundary for provider execution, approval, promotion, repository mutation and publication.

The compiler deliberately rejects unsupported actions in this protocol revision. Expanding the action vocabulary without motion-specific semantics would produce generic animation plans and is not considered progress.

## Generation strategy

The implemented production path is now:

```text
canonical identity + direction master
  -> motion profile
  -> pose plan
  -> Animation Director frame/batch plan
  -> pose-control artifacts
  -> Sprite Supervisor provider requests
  -> retained key-pose artifacts
  -> in-between provider requests bound to both keys
  -> candidate/frame lineage
  -> motion evidence
  -> sequence and motion QA
  -> targeted motion repair directives
  -> alpha/frame mastering
  -> atlas/package
  -> Godot descriptor acceptance
  -> target-owned Godot runtime evidence
  -> Game Test Lab runtime admission
```

Batch size is a worker/resource limit, not an animation-design rule. Frames are grouped by motion dependency. Every retained drawing remains an independently addressable immutable artifact.

Generation topology and playback topology are deliberately separate. Frames 6–8 of the walk require retained key poses 5 and 1 as structural neighbours even when the delivered clip is configured not to loop. That satisfies the provider contract's two-sided in-between requirement without falsely enabling runtime loop playback or loop-closure approval.

## Governed provider bridge

`@evavo/art-sprite-supervisor` owns `compileAnimationProviderBatch`. It translates one exact Animation Director generation batch into the existing provider-neutral candidate-request contract and passes every request through `validateProviderCandidateRequest`.

The bridge does not execute a provider. It requires concrete visual dependencies:

- a canonical identity artifact;
- an optional direction-master artifact when the plan declares one;
- one pose-control artifact for every requested drawing;
- both retained key-pose artifacts for any in-between batch.

Missing or malformed artifact identities fail before a provider request exists. In-between work cannot replace a missing retained key pose with prose, a chat thumbnail or an unrelated previous frame. Candidate count is bounded by the Animation Director batch budget.

Each normalized provider request retains the animation protocol, exact Animation Director plan SHA-256, batch, frame role, rational timing, planted-foot identity, landmark requirements and an all-false approval/publication authority record in metadata. Runtime submission remains false until a separately authorised durable-runtime action occurs.

Provider compilation deliberately remains in Sprite Supervisor rather than Art Direction because Sprite Supervisor already depends on both Art Direction and Providers and validates against the actual provider contract. Art Direction owns animation semantics, not provider execution grammar.

## Motion evidence and lineage

`@evavo/art-quality` owns motion evidence and deterministic motion analysis. Motion evidence can be produced by a reviewed model/runtime, manually corrected landmarks, authored controls or a 3D projection. Machine-produced evidence requires exact model, runtime and preprocessing identities.

The animation lineage layer binds each analysed candidate frame to:

- the exact Animation Director plan SHA-256;
- the exact provider request SHA-256 that produced the candidate family;
- the exact candidate artifact ID;
- the candidate content SHA-256;
- the motion-evidence manifest SHA-256.

A QA result therefore cannot be replayed against a changed motion plan, another provider request or substituted image bytes merely because frame names still match.

## Motion QA

The implemented deterministic gates include:

- required-landmark presence;
- planted-landmark lock across each contiguous planted segment;
- maximum root movement between adjacent drawings;
- optional attachment constraints such as hand-to-weapon grip distance;
- explicit loop-seam anchor closure.

Animation Director states what evidence is required; Quality evaluates evidence that was actually produced. Neither package invents landmark detections or claims creative approval.

Loop closure is seam-aware. A valid walk does not require every limb in the last drawing to equal the first drawing. The walk profile closes the stable `root` seam anchor while foot and limb progression remain governed by pose, contact and adjacent-frame constraints.

## Targeted repair

`@evavo/art-repair` now compiles failed motion gates into bounded repair directives instead of restarting an entire animation by default.

The first repair mappings cover:

- missing required landmarks;
- planted-foot drift/foot sliding;
- root-motion discontinuities;
- broken attachment constraints;
- loop-seam failure.

Repair plans identify affected frames and exact corrections while preserving canonical identity, proportions, costume, props, camera, canvas, pivot, baseline, neighbouring approved poses, palette, line treatment and transparency policy. Repair planning remains effect-free; provider execution still requires the ordinary authorised provider/runtime path.

## Provider controls

Art Studio's governed ComfyUI profile contract already supports canonical identity, direction master, previous/next key poses, pose, edge and depth controls, palette and line references. The provider bridge uses those existing semantic roles rather than introducing provider-specific animation graph concepts.

Pose guidance is intentionally abstract. An implementation may use an authored 2D skeleton, OpenPose-compatible control image, silhouette, depth guide, 3D mannequin projection or another reviewed structural representation. Animation Director owns semantic pose/contact constraints; the provider adapter owns how an authorised reviewed workflow consumes the bound artifacts.

## Timing and interchange

Animation timing remains explicit source data. Aseprite is a useful optional editable interchange because its CLI can export tagged frame ranges, layers, sprite sheets and JSON metadata, and its frame model retains per-frame duration. It must not become the canonical EVAVO authority: EVAVO manifests remain the source of timing, identity, provenance and approval state.

Godot `SpriteFrames` supports animation FPS, per-frame relative duration and none/linear/ping-pong loop modes. Art Studio's Godot descriptor retains those values.

`@evavo/art-godot` now also exposes a generic descriptor-acceptance check. It verifies the expected animation name, exact frame order, atlas-frame membership, FPS, loop mode, positive timing, total-duration consistency and pivot stability without claiming that Godot has executed anything.

## Runtime acceptance

Godot Game Test Lab now has a generic `sprite_animation_runtime_admission` contract for target-owned runtime telemetry. The target repository remains responsible for the actual Godot fixture or journey; Test Lab remains the reusable evidence authority.

The runtime admission checks:

- self-hashed expectation and runtime-evidence documents;
- exact clip identity and frame order;
- Godot 4.6.2-or-newer runtime identity;
- renderer identity;
- successful `SpriteFrames` load and animation start;
- no retained import or console errors;
- expected loop mode;
- every expected frame rendered;
- observed per-frame timing within an explicit tolerance;
- runtime pivot stability;
- at least one complete observed cycle for a looping animation.

It explicitly does not claim human visual approval, game-feel approval or physical-controller approval. Those remain separate evidence boundaries.

## Lifecycle

Animation iteration uses the existing workspace lifecycle rather than production ceremony for every experiment:

```text
scratch -> working -> candidate -> reviewed -> approved -> delivery
```

Scratch/working frames may be regenerated and repaired within bounded authorised work. Only reviewed/approved artifacts may enter an authoritative atlas or release package.

## Remaining high-value work

1. Implement or bind a governed pose/landmark producer that can generate exact structural-control artifacts with model/runtime provenance rather than requiring them to be supplied externally.
2. Add candidate-to-repair provider compilation so targeted motion repair directives become validated `repair`/`edit` provider requests without losing the original candidate lineage.
3. Add Aseprite import/export with exact executable/version fingerprinting and no arbitrary script surface.
4. Add one target-owned Godot walk-cycle fixture/journey and capture real Test Lab runtime telemetry against the generic runtime-admission contract.
5. Add visual temporal gates for palette, line-weight and lighting flicker and motion-specific anatomy checks where appropriate.
6. Extend motion profiles only after the walk vertical slice is executed end-to-end: run, jump/land, climb, sword attack and hit reaction are the next useful families.
7. Route traditional-cel profiles through Cel Animation Studio rather than duplicating X-sheet logic.

The definition of done for the first slice is not "a plan compiles". It is one canonical character moving through the complete path and producing a visually reviewed, technically clean walk cycle that plays correctly in the target Godot runtime with retained evidence.
