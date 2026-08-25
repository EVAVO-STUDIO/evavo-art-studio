# EVAVO Animation Director

The Animation Director is the orchestration layer for deterministic 2D animation planning in Art Studio. It converts a high-level motion request into an explicit frame plan before provider execution.

The implementation is evidence-driven and provider-neutral. It does not treat generated imagery as approved art, hide timing decisions inside prompts, or duplicate Cel Animation Studio's X-sheet authority.

## Ownership

Art Studio owns canonical 2D identities, direction masters, sprite motion planning, structural pose controls, generated-frame continuity, alpha mastering, sequence review, targeted repair, atlas production and Godot delivery. Cel Animation Studio owns authored X-sheets, exposure/hold semantics and traditional cel production. Godot Game Test Lab owns reusable execution and retained runtime evidence. Target games own their actual runtime fixture/journey and presentation policy.

A separate generic `animation-studio` repository would duplicate those boundaries. Animation Director therefore coordinates the existing owners rather than creating another source of truth.

## First executable motion family

`compileAnimationDirectorPlan` currently supports an authored eight-phase walk cycle. It emits contact, down, passing and up phases for both steps, rational `1000 / fps` timing, canonical identity/direction references, two structural key poses, bounded in-between groups, planted-foot constraints, root/foot landmark requirements, loop-seam anchors, pivot/baseline/camera/alpha locks and provider-safe canvas/identifier constraints.

The eight phases are sprite-animation planning semantics. When `traditional-cel` is selected they become motion-landmark guidance only; they are not eight final cel drawings or an authored X-sheet.

## Production path

```text
canonical identity + direction master
  -> motion profile
  -> Animation Director plan
  -> semantic pose controls
  -> rendered pose-control bindings
  -> verified Sprite Supervisor provider requests
  -> retained key poses
  -> in-betweens bound to both retained keys
  -> candidate/frame lineage
  -> motion evidence + motion QA
  -> temporal appearance QA
  -> targeted motion/appearance repair
  -> alpha/frame mastering
  -> optional governed Aseprite interchange
  -> atlas/package
  -> Godot descriptor acceptance
  -> self-hashed runtime expectation
  -> target-owned Godot AnimatedSprite2D probe
  -> raw runtime telemetry
  -> Game Test Lab evidence compilation/admission
  -> separate visual/game-feel approval
```

Batch size is a worker/resource limit, not an animation-design rule. Frames are grouped by motion dependency and every retained drawing remains an independently addressable immutable artifact.

Generation topology and playback topology are separate. Frames 6–8 of the walk can depend on retained key poses 5 and 1 even when runtime looping is disabled; structural generation context does not imply playback loop approval.

## Governed pose controls

`@evavo/art-direction` owns the semantic pose-control contract. A pose control records:

- exact clip/frame identity and frame number;
- exact source canvas;
- normalized `0..1` landmark coordinates and confidence;
- required landmark IDs;
- provenance kind: authored, pose estimator or 3D projection;
- exact model/runtime/config identities for machine-estimated poses;
- source artifact identities where applicable;
- canonical manifest SHA-256 and an all-false authority boundary.

A rendered PNG control image is then bound to the exact semantic manifest. The binding records the rendered artifact/content SHA, dimensions and its own canonical SHA-256. `verifyAnimationPoseControlBinding` detects post-binding mutation.

`compileVerifiedAnimationProviderBatch` is the preferred provider bridge. It accepts canonical pose-control bindings rather than naked artifact IDs, verifies the binding SHA, frame/clip identity, canvas and `artifact_<contentSha256>` relationship, and only then delegates to the lower-level provider compiler.

The lower-level `compileAnimationProviderBatch` remains an internal compatibility boundary; autonomous production workflows should use the verified compiler.

## Provider bridge and lineage

Sprite Supervisor converts one exact Director generation batch into provider-neutral candidate requests and passes them through `validateProviderCandidateRequest`.

Every generated request retains the Animation Director plan SHA-256, compiler version, batch/phase/frame role, rational timing, contact/landmark requirements and all-false execution/approval/publication authority metadata.

`@evavo/art-quality` binds each analysed candidate frame to:

- exact Director plan SHA-256;
- exact original provider request SHA-256;
- candidate artifact ID and content SHA-256;
- motion-evidence manifest SHA-256;
- exact landmark producer/model/runtime/preprocessing provenance.

QA evidence therefore cannot be silently replayed against changed plan semantics, substituted provider work or different candidate bytes.

## Motion QA

Implemented deterministic motion gates include:

- required landmark presence;
- planted-foot lock / foot sliding;
- maximum root movement between adjacent drawings;
- optional attachment constraints such as hand-to-weapon grip distance;
- explicit loop-seam anchor closure.

Animation Director declares evidence requirements; Quality evaluates evidence that was actually produced. Neither package invents landmark detections or claims creative approval.

## Temporal appearance QA

`analyseTemporalAppearance` adds a separate alpha-aware no-model flicker layer. It measures visible-pixel luminance, colour centroid, coarse colour-distribution distance and edge-density change across adjacent frames.

This layer deliberately does not compare raw pixels or attempt to judge pose motion. Motion geometry belongs to the landmark gates. Appearance drift defaults to review warnings and may be promoted to a blocking production policy where appropriate.

The implemented appearance signals are intended to catch problems such as:

- one-frame brightness/exposure changes;
- character/material colour casts;
- palette invention or disappearance;
- abrupt line/detail-density changes.

Deliberate flashes, smear frames or style-specific extremes can remain non-blocking and be reviewed rather than automatically rejected.

## Targeted repair

`@evavo/art-repair` now compiles both motion and appearance findings into bounded frame-specific corrections rather than regenerating a complete sequence by default.

Motion repair covers missing landmarks, foot sliding, root discontinuities, attachment failures and loop seams.

Appearance repair covers luminance flicker, colour drift, palette drift and edge-density drift. It targets the later offending frame and binds the preceding retained frame as appearance reference without allowing the neighbour's pose to replace the target pose.

Provider-bound repair requests remain tied to the original provider request, candidate artifact/content SHA and Director plan. Appearance repair uses the failed frame as `base-image`, and uses neighbouring retained art as `palette-reference` and/or `line-reference` when those corrections require it.

Repair planning and compilation do not execute providers, approve art, promote artifacts, mutate repositories or publish anything.

## Traditional-cel routing

`resolveAnimationProductionRoute` routes normal sprite styles to `art-studio-sprite` and `traditional-cel` to `cel-animation-studio`.

Direct Sprite Supervisor image-provider compilation fails closed for the traditional-cel route.

Art Studio can compile a digest-bound traditional-cel intake containing identity references and Director motion-landmark guidance. Cel Animation Studio owns validation of that intake and then independently owns its production brief, shot timing, X-sheet revision, drawing roles, holds, exposure on ones/twos/threes, unique-drawing count, render stages and frame-sequence manifest.

The Art Studio intake therefore cannot masquerade as an approved X-sheet or exposure plan.

## Aseprite interchange

`@evavo/art-media` now has a governed Aseprite interchange plan and receipt boundary.

The plan pins:

- exact Aseprite executable path/version/SHA-256;
- exact `.ase` / `.aseprite` source SHA-256;
- fixed batch-mode sheet/metadata arguments;
- tag/slice metadata requests;
- explicit padding/trim/extrusion/duplicate settings;
- create-only PNG/JSON outputs;
- no arbitrary `--script` or `--shell` surface.

The receipt verifies the exact executable identity, actual returned PNG/JSON bytes, source identity, frame durations, tags and slices. Aseprite remains an editable interchange; EVAVO manifests remain canonical timing/provenance/approval authority.

## Godot delivery and runtime evidence

`@evavo/art-godot` retains frame order, per-frame duration, relative duration, FPS, loop mode, trim restoration and pivot data in its Godot descriptor. Static animation acceptance verifies animation identity, exact frame order, atlas-frame membership, timing totals, loop mode and pivot stability without claiming runtime execution.

The generated `SpriteFrames` resource carries EVAVO frame and animation metadata including ordered frame IDs, exact duration microseconds, FPS and loop mode.

Art Studio can compile a canonical self-hashed Test Lab runtime expectation from an accepted descriptor. Variable frame holds remain explicit; timing is not flattened to uniform `1000 / FPS` frames.

The target-owned `cinematic_precision_platformer` reference surface now includes `SpriteAnimationRuntimeProbe.gd` and a dedicated probe scene. The probe loads an actual EVAVO `SpriteFrames`, verifies configured Godot FPS/per-frame duration through Godot's own APIs, observes `AnimatedSprite2D` playback and render completion, and writes create-only raw telemetry outside the repository.

Godot Game Test Lab exposes:

```text
godot-lab-sprite-animation
godot-lab-sprite-animation-probe
```

The exact-SHA probe lane requires a clean target checkout, target-owned `res://` scene/resource paths and external create-only evidence locations. It runs through the Lab's bounded process supervision, temporarily leases only the animation-probe environment variables, restores the environment afterward and rechecks target HEAD/cleanliness before accepting telemetry.

Test Lab compiles raw target telemetry into self-hashed runtime evidence bound to the exact expectation SHA and then performs runtime admission.

Configured SpriteFrames timing is the deterministic source-of-truth check. Wall-clock frame cadence is retained separately as a scheduler/runtime-health signal with an explicit tolerance rather than being treated as a laboratory timer.

A runtime admission pass still does not mean human visual approval, game-feel approval, physical-controller approval or production release approval.

## Lifecycle

```text
scratch -> working -> candidate -> reviewed -> approved -> delivery
```

Scratch/working frames may be generated and repaired within bounded authorised work. Only reviewed/approved artifacts may enter an authoritative atlas or release package.

## Remaining high-value work

1. Execute the complete walk-cycle vertical slice on the actual local Windows/Godot toolchain and retain the first real end-to-end evidence bundle. Source contracts and regression fixtures are not a substitute for this execution proof.
2. Add an authorised local pose-estimator/3D-projection producer that emits the governed semantic pose-control manifests and rendered PNG controls automatically; the contract exists, but this chat has not executed such a local producer.
3. Route governed Aseprite plans through the local process executor and retain real executable/output receipts; planning and receipt validation exist, but a real Aseprite process has not been executed here.
4. Add a separate screenshot/movie visual-evidence lane for actual-scale sprite presentation. Runtime timing admission must remain separate from visual-art/game-feel approval.
5. Add anatomy-oriented temporal checks where appropriate: limb-length/joint-angle stability, facing-direction consistency, prop-tip trajectories and motion-family-specific constraints.
6. Extend Director motion families only after the real walk vertical slice has executed successfully: run, jump/land, climb, sword attack and hit reaction are the next useful families.
7. Add deliberate-effect annotations/policies so known flashes, smears, palette cycling and effects animation can declare expected appearance discontinuities without weakening default flicker detection.

The first-slice definition of done is not “a plan compiles”. It is one canonical character moving through the complete path and producing a visually reviewed, technically clean walk cycle that plays correctly in the target Godot runtime with retained evidence.
