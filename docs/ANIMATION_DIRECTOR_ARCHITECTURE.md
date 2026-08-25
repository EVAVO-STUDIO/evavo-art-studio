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
  -> key-pose provider requests
  -> retained key-pose artifacts
  -> in-between provider requests bound to both keys
  -> motion evidence
  -> sequence and motion QA
  -> targeted repair
  -> alpha/frame mastering
  -> atlas/package
  -> Godot runtime validation
```

Batch size is a worker/resource limit, not an animation-design rule. Frames are grouped by motion dependency. Every retained drawing remains an independently addressable immutable artifact.

Generation topology and playback topology are deliberately separate. Frames 6–8 of the walk require retained key poses 5 and 1 as structural neighbours even when the delivered clip is configured not to loop. That satisfies the provider contract's two-sided in-between requirement without falsely enabling runtime loop playback or loop-closure approval.

## Governed provider bridge

`@evavo/art-sprite-supervisor` now exposes `compileAnimationProviderBatch`. It translates one exact Animation Director generation batch into the existing provider-neutral candidate-request contract and then passes every request through `validateProviderCandidateRequest`.

The bridge does not execute a provider. It requires concrete visual dependencies:

- a canonical identity artifact;
- an optional direction-master artifact when the plan declares one;
- one pose-control artifact for every requested drawing;
- both retained key-pose artifacts for any in-between batch.

Missing or malformed artifact identities fail before a provider request exists. In-between work cannot replace a missing retained key pose with prose, a chat thumbnail or an unrelated previous frame. Candidate count is also bounded by the Animation Director batch budget.

Each normalized provider request retains the animation protocol, batch, frame role, rational timing, planted-foot identity, landmark requirements and an all-false approval/publication authority record in metadata. Provider execution remains a later independently authorised runtime effect.

## Motion evidence and QA

`@evavo/art-quality` exposes `analyseAnimationMotion`. It consumes supplied per-frame landmark evidence and evaluates motion independently from the Animation Director.

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

Art Studio's governed ComfyUI profile contract already supports canonical identity, direction master, previous/next key poses, pose, edge and depth controls, palette and line references. The new provider bridge uses those existing semantic roles rather than introducing provider-specific graph concepts.

Pose guidance is intentionally abstract. An implementation may use an authored 2D skeleton, OpenPose-compatible control image, silhouette, depth guide, 3D mannequin projection or another reviewed structural representation. Animation Director owns semantic pose/contact constraints; the provider adapter owns how an authorised reviewed workflow consumes the bound artifacts.

## Timing and interchange

Animation timing remains explicit source data. Aseprite is a useful optional editable interchange because its CLI can export tagged frame ranges, layers, sprite sheets and JSON metadata, and its frame model retains per-frame duration. It must not become the canonical EVAVO authority: EVAVO manifests remain the source of timing, identity, provenance and approval state.

Godot `SpriteFrames` likewise supports animation FPS, per-frame relative duration and none/linear/ping-pong loop modes. The existing Art Studio Godot delivery descriptor already retains these values, so reviewed EVAVO timing can be translated without inventing another playback format.

## Remaining quality work

The current motion analyser is intentionally deterministic and evidence-driven; it does not perform pose detection by itself. The next useful additions are:

- a governed landmark/pose extraction adapter with exact model/runtime provenance;
- binding provider candidates to their derived/corrected landmark evidence;
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
2. Bind provider results to motion evidence and use failed motion gates to produce targeted repair requests.
3. Add Aseprite import/export with exact tool/version fingerprinting and no arbitrary script surface.
4. Add a Godot walk-cycle smoke fixture that verifies frame order, timing, pivot, loop mode and atlas sampling in Game Test Lab.
5. Extend motion profiles only after the walk fixture is proven: run, jump/land, climb, sword attack and hit reaction are the next useful families.
6. Route traditional-cel profiles through Cel Animation Studio rather than duplicating X-sheet logic.

The definition of done for the first slice is not "a plan compiles". It is one canonical character moving through this entire path and producing a visually reviewed, technically clean walk cycle that plays correctly in the target Godot runtime.
