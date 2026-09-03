# Local Generation Quality and Continuity

This document defines the execution truth boundary for Art Studio local generation. It exists so agents do not confuse planning intent, prompt guidance, reviewed workflow settings, or real image conditioning.

## Four control classes

### prompt-only

A control is **prompt-only** when it affects the assembled positive/negative prompt but is not bound to a provider workflow input beyond prompt text.

Examples:

- identity wording
- costume/material wording
- camera/framing wording
- continuity locks written into the prompt
- negative exclusions

Prompt-only controls can materially improve consistency, but they are not evidence that a provider consumed a reference image or dynamically changed a sampler parameter.

### workflow-baked

A control is **workflow-baked** when the selected reviewed ComfyUI workflow already contains the exact executable value.

The quality-profile catalog physically commissioned for Art Studio uses workflow-baked KSampler controls for:

- steps
- CFG
- sampler
- scheduler
- denoise

The reviewed adapter ID identifies the quality profile, for example:

- `comfyui:sdxl-base-local-portrait_high_quality`
- `comfyui:sdxl-base-local-sprite_sheet_clean`
- `comfyui:sdxl-base-local-concept_art_painterly`
- `comfyui:sdxl-base-local-comic_inked`
- `comfyui:sdxl-base-local-cinematic_stills`
- `comfyui:sdxl-base-local-product_mockups`

Those values may be reported as pixel-affecting only when that reviewed adapter/profile is the route actually used for the job.

### dynamically bound

A control is **dynamically bound** only when the reviewed provider profile explicitly declares a typed binding and the runtime job supplies a compatible value.

The current core SDXL provider has typed bindings for prompt, negative prompt, width, height, seed, candidate count and filename/output routing. Additional dynamic fields must be added to the provider contract before Art Studio may claim they changed runtime pixels.

### artifact-conditioned

A control is **artifact-conditioned** when the provider consumes a real stored artifact ID through a reviewed reference binding.

Art Studio reference roles include:

- `canonical-identity`
- `direction-master`
- `previous-key-pose`
- `next-key-pose`
- `base-image`
- `mask`
- `pose-control`
- `edge-control`
- `depth-control`
- `palette-reference`
- `line-reference`
- `material-reference`
- `layer-context`

A reference in prose is not artifact-conditioned. A shot-to-shot dependency is not artifact-conditioned until the prior accepted candidate becomes a real provider artifact ID and the selected reviewed workflow advertises the matching reference capability/binding.

## Consistency modes

### strict

Use for sprites, turnarounds, card families, UI portraits and sequences where identity drift is unacceptable.

Strict mode uses stable prompt layers, deterministic related seeds, continuity locks and staged dependency planning. If artifact-conditioned reference capability is available, strict mode should prefer real anchor/reference bindings. If it is not available, Art Studio must report that the run used prompt/seed consistency only.

### balanced

Use when recognizable design continuity matters but camera, pose and scene variation are expected.

### loose

Use for exploration and concept breadth. Loose mode should not be presented as identity-locked production output.

## Reference DAG

The V2 reference graph is a real dependency graph, not prompt decoration. It validates shot dependencies, rejects cycles/missing sources, topologically stages execution and can resolve accepted prior shots to artifact IDs.

Execution must fail closed when a required reference role is unsupported by the reviewed provider profile. It must never silently drop a required reference and claim equivalent consistency.

## Model and LoRA plan

A campaign may carry a reviewed model plan with an ordered LoRA set and model/CLIP strengths.

LoRA is executable only when all of the following are true:

1. the selected reviewed provider profile inventories the requested LoRA;
2. the workflow contains an appropriate LoRA loader;
3. the model/LoRA plan matches the reviewed profile contract;
4. the executed route records the selected reviewed profile.

If any condition is absent, the LoRA plan remains planning metadata and execution must fail closed when it was required.

## Quality profile rule

Quality profile names are production configuration. They are not aesthetic buzzwords.

Each quality profile should define concrete resolution/sampling behavior plus prompt guidance suited to its output class. The physically commissioned catalog creates separate reviewed workflow hashes for every quality profile, so selecting `cinematic_stills` or `sprite_sheet_clean` changes the executable KSampler workflow rather than merely changing metadata.

## Anti-generic quality discipline

Avoid generic AI-looking output by keeping stable project-specific information explicit:

- exact identity geometry and silhouette
- project-specific costume and construction details
- physical material separation
- motivated lighting sources
- deliberate camera/framing rules
- environment anchors that remain stable across related shots
- controlled detail hierarchy
- meaningful pose/action intent
- explicit exclusions for stock-photo composition, plastic skin, meaningless micro-detail and accidental redesign

Prompt layers should be specific but not bloated. Stable identity/style/continuity blocks should remain stable; shot blocks should carry only intentional differences.

## QA and evidence

QA proves file and batch integrity, not subjective artistic success by itself.

The current automatic checks include:

- expected candidate count
- file existence
- non-zero bytes
- PNG/JPEG/WebP signature
- dimensions where supported
- SHA-256
- duplicate hash rejection

Per-image metadata records prompt hashes, seed, quality profile, provider route, retry attempt, artifact/content hash and QA result. Optional vision/prompt-adherence scoring may be added as a separate reviewed QA layer, but it must not replace physical file/hash validation.

## Managed local runtime

The normal one-command and MCP paths use the managed true-core ComfyUI lifecycle:

1. create a machine-bound execution manifest while preserving the authored campaign;
2. bind the canonical local catalog and owned loopback port;
3. derive the correct reviewed quality adapter when one was not explicitly pinned;
4. start an isolated true-core ComfyUI process with an in-memory SQLite database;
5. verify required core generation nodes;
6. run the V2 batch;
7. stop only the ComfyUI process owned by that invocation.

Hosted fallback remains disabled.

## Reporting rule

When reporting a result, use the strongest accurate term only:

- **prompt-only** when only prompts/seed strategy were used;
- **workflow-baked** when a reviewed quality workflow supplied the setting;
- **dynamically bound** when a typed runtime binding supplied the setting;
- **artifact-conditioned** when a real provider artifact reference was consumed;
- **LoRA-conditioned** only when a reviewed LoRA loader/profile actually executed.

Never upgrade one class into another in prose just because the intended artistic result looked similar.
