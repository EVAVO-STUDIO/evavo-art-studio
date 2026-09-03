# Local Generation V2 — Quality and Continuity Execution Contract

This document defines what Art Studio may truthfully claim about quality, consistency and model controls.

## Control classes

### Dynamically provider-bound

The current reviewed ComfyUI adapter can bind these values at request time when the selected profile declares the binding:

- positive prompt
- negative prompt
- width
- height
- seed
- candidate count
- filename prefix
- provider artifact reference images

These values are execution controls, not metadata-only hints.

### Workflow-baked quality controls

Art Studio V2 quality profiles define:

- steps
- CFG
- sampler
- scheduler
- denoise
- width/height defaults
- output format
- hires/detail-pass intent

The current provider protocol does not dynamically bind all sampler controls. `scripts/compile-comfyui-quality-profile-draft.mjs` therefore creates reviewed workflow-profile variants and bakes steps/CFG/sampler/scheduler/denoise directly into each KSampler/KSamplerAdvanced node.

A quality profile is only considered executable when the catalog has been recompiled and the selected adapter points at the corresponding reviewed profile, for example:

`comfyui:sdxl-base-local-cinematic_stills`

The catalog compiler must recompute workflow/profile/catalog hashes after the quality workflow is generated.

### Prompt consistency controls

Identity, style, quality, continuity and shot layers are deterministic prompt inputs. Strict mode repeats stable identity/design locks and uses related deterministic seeds. These improve consistency but are not described as pixel-reference conditioning.

### Artifact-conditioned consistency controls

Real image-to-image/reference continuity uses provider artifact IDs and typed roles such as:

- `canonical-identity`
- `direction-master`
- `previous-key-pose`
- `next-key-pose`
- `pose-control`
- `palette-reference`
- `line-reference`
- `material-reference`

`scripts/local-generation-reference-graph-v2.mjs` builds a dependency DAG, topologically stages dependent shots and resolves shot outputs to real provider artifact IDs.

Execution must fail closed when a selected provider profile does not advertise the required reference capability or lacks a declared reference binding. Falling back to a text note while claiming image-reference consistency is prohibited.

## Sequential anchor behavior

For `sequential-anchor` mode, an engine may automatically add a `canonical-identity` dependency from later shots to the first identity-master shot.

For `sprite` mode, an engine may automatically add a `direction-master` dependency from later frames to the first direction-master frame.

This dependency is real only after the source shot has produced a provider artifact ID and that artifact is passed to a compatible reviewed profile.

## Model and LoRA plans

`scripts/local-generation-model-plan-v2.mjs` defines an ordered model plan containing:

- reviewed model profile
- model ID
- zero or more LoRA IDs
- model strength per LoRA
- CLIP strength per LoRA
- whether each LoRA is required
- deterministic model-plan SHA-256

A LoRA plan is executable only when:

1. the reviewed provider profile declares the requested LoRA in its model inventory;
2. the workflow contains a compatible LoRA loader node; and
3. the selected reviewed profile is the one executed.

If those requirements are not met, the plan is not silently ignored.

## Anti-generic art contract

V2 deliberately separates stable project design from shot variation.

Stable layers should specify concrete design facts:

- facial geometry rather than generic attractiveness
- hair shape/length/colour rather than “beautiful hair”
- body silhouette/proportions rather than generic physique tags
- costume construction/materials rather than fashion buzzwords
- environment anchors and recurring props
- palette relationships
- camera/framing rules
- period/world constraints

Shot layers should change only what the shot actually needs: pose, expression, camera, local action, framing or explicitly changed costume/environment state.

Quality profiles include negative guidance for common generic-generation failure modes such as stock composition, plastic materials, repetitive faces, arbitrary clutter, meaningless micro-detail, camera drift and anatomy failures.

The engine should prefer a short set of stable, concrete facts repeated exactly over a different verbose adjective cloud for every frame.

## QA truth boundary

A batch is accepted only on evidence from materialized files. V2 checks count, file existence, image signature, dimensions where supported, byte count and SHA-256 uniqueness. A provider “success” status without accepted image files is not a successful batch.

Optional visual/prompt-adherence scoring may be added as a QA plugin, but should not be hardcoded into the core executor. Such a plugin must record the evaluator identity/version and score evidence in the per-image metadata.
