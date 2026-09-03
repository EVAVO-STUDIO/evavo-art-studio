# Local Generation Batch V2

`evavo.local-generation-batch.v2` is the generic, data-driven local image production layer for Art Studio. It exists so project-specific shot counts, characters and prompt strings never become the execution architecture.

## Core contract

The same system handles one image or large production sets. The current campaign ceiling is **2,000 shots** and provider execution is transparently chunked into groups of at most 100 shots.

A campaign declares:

- `batch_size`
- `shots[]`
- `character`
- `style`
- `quality_profile`
- `consistency_mode`
- `generation_mode`
- `output_rules`
- `retry_rules`
- optional provider/model/reference plans

`shots.length` must equal `batch_size`. The system never silently invents missing frames.

The formal schema is `schemas/local-generation-batch.v2.schema.json`.

## Shot planning

Each shot can independently define pose/action, camera, expression, outfit state, background, framing, required details, exclusions, continuity locks, seed/candidate overrides, output target and reference inputs.

This makes a structured shot list the production source of truth instead of a single vague campaign prompt.

## Prompt assembly

Prompts are built deterministically from separate layers:

1. **Identity** — face, hair, proportions, costume, palette and signature details.
2. **Style** — medium, period, lighting, palette, materials and edge/line treatment.
3. **Quality** — reusable profile direction plus campaign quality additions.
4. **Continuity** — strict/balanced/loose rules plus campaign and shot locks.
5. **Shot** — pose, camera, expression, outfit, environment and framing.
6. **Negative** — global, profile and shot-specific exclusions.

Every positive and negative prompt receives a SHA-256 in per-image metadata. Stable prompt layers deliberately repeat across a strict sequence; only declared shot layers should vary.

The profile guidance is intentionally concrete. It emphasizes authored silhouette, facial geometry, material separation, motivated lighting, believable anatomy, intentional composition and environmental construction while rejecting generic stock/AI visual habits, plastic surfaces and meaningless micro-detail.

## Quality profiles

Data-driven profiles live in `config/local-generation-quality-profiles.v2.json`:

- `portrait_high_quality`
- `sprite_sheet_clean`
- `concept_art_painterly`
- `comic_inked`
- `cinematic_stills`
- `product_mockups`

They define resolution, steps, CFG, sampler, scheduler, denoise, hires/detail intent and output format.

### Executable sampling settings

Do not claim that a profile value affected provider pixels unless the selected reviewed provider profile exposes or bakes that value.

Art Studio now supports a **workflow-baked** path for the standard local quality profiles:

1. `decompile-comfyui-workflow-catalog.mjs` reconstructs a safe draft from a reviewed compiled catalog while removing only computed integrity fields.
2. `compile-comfyui-quality-profile-draft.mjs` clones the reviewed base workflow and writes profile-specific `KSampler`/`KSamplerAdvanced` values for `steps`, `cfg`, `sampler_name`, `scheduler` and `denoise`.
3. `compile-comfyui-workflow-catalog.mjs` recompiles and re-hashes every resulting profile.
4. `compile-comfyui-quality-catalog.mjs` performs the complete pipeline and can atomically replace a physical catalog while preserving a backup.

The canonical physical catalog can therefore expose reviewed adapters such as:

- `comfyui:sdxl-base-local-portrait_high_quality`
- `comfyui:sdxl-base-local-sprite_sheet_clean`
- `comfyui:sdxl-base-local-concept_art_painterly`
- `comfyui:sdxl-base-local-comic_inked`
- `comfyui:sdxl-base-local-cinematic_stills`
- `comfyui:sdxl-base-local-product_mockups`

The managed entry compiler derives the adapter from `quality_profile` when the campaign has not explicitly pinned another reviewed adapter.

Dynamic arbitrary sampler fields are still not smuggled through metadata. A runtime value is only reported as pixel-affecting when it is typed/bound or baked into the reviewed workflow.

## Consistency modes

`strict`

- deterministic related seeds by default
- identity locks repeated in every prompt
- only explicitly declared changes should vary
- appropriate for sprite families, character sequences, UI portraits and card sets

`balanced`

- preserves recognizable identity and primary design language
- allows wider camera/pose variation

`loose`

- preserves campaign concept rather than exact geometry
- uses independent continuity by default

## Generation modes

- `independent` — shots are generated independently.
- `sequential-anchor` — the first shot is the identity master; later shots are key poses.
- `paired` — defaults to two candidates per shot.
- `variation` — defaults to four candidates per shot.
- `repair` — targeted repair/regeneration phase.
- `sprite` — establishes a direction master followed by repeatable key poses.

## Reference and anchor evidence

The generic reference graph is implemented in `local-generation-reference-graph-v2.mjs`.

It understands real provider reference roles including:

- `canonical-identity`
- `direction-master`
- `previous-key-pose`
- `next-key-pose`
- `base-image`
- `pose-control`
- `edge-control`
- `depth-control`
- palette/line/material/layer references

It can model external artifact references and shot-to-shot dependencies, topologically stage them, detect cycles/missing sources and resolve a completed source shot to a provider artifact ID.

A textual reference is **prompt-only** planning metadata. A provider artifact dependency is **artifact-conditioned** only when the selected reviewed workflow advertises the required reference capability and contains the matching binding. Art Studio fails closed instead of claiming image-reference consistency when the workflow cannot actually consume the image.

## Model and LoRA plans

`local-generation-model-plan-v2.mjs` describes the reviewed base model plus ordered LoRA IDs/strengths and hashes the plan for reproducibility.

A LoRA is not considered executable merely because a manifest names it. The selected reviewed profile must inventory the LoRA and include an appropriate LoRA loader workflow node. Otherwise the plan remains non-executable and fails closed.

## QA and selective retry

After each attempt the orchestrator validates:

- expected candidate count
- file existence and regular-file status
- non-zero bytes
- PNG/JPEG/WebP signatures
- dimensions where required
- SHA-256
- duplicate hashes across accepted outputs

Only affected shots are retried. Retry seeds remain deterministic using `seedBump`; a weak frame does not force a 120-image campaign to rerun.

## Reproducibility metadata

Each accepted image can retain:

- positive/negative prompt
- all prompt layers and hashes
- seed
- model/provider route
- quality profile and settings
- candidate count
- reference plan
- retry attempt
- provider artifact/content hash
- dimensions/file hash
- QA result

## Managed one-command execution

The normal entrypoint is:

```cmd
RUN-LOCAL-ART-BATCH.cmd C:\path\to\campaign.json
```

The command no longer assumes ComfyUI is already open.

`run-local-art-batch-entry.mjs` preserves the creative source manifest and writes a separate machine-bound execution manifest. The execution copy forces the owned loopback endpoint/catalog and derives the reviewed quality adapter when one is not explicitly pinned.

`run-local-art-batch-managed.mjs` then:

1. verifies the local ComfyUI Python/runtime/catalog,
2. refuses to reuse an already occupied port,
3. writes and hash-verifies the EVAVO true-core bootstrap,
4. starts ComfyUI on loopback with `sqlite:///:memory:`, custom/API nodes disabled and optional built-in extras skipped,
5. verifies the required core generation nodes,
6. runs the V2 batch,
7. shuts down only the ComfyUI process it owns.

The default managed endpoint is `127.0.0.1:8192` and the canonical catalog is `%LOCALAPPDATA%\EVAVO\AI\ComfyUI\catalog.json`.

Trusted local agents use the same path through:

- `local_generation_batch_capabilities`
- `run_local_generation_batch`

There is no second, weaker MCP execution path.

## Output structure

By default:

`%LOCALAPPDATA%\EVAVO\ArtStudio\batches\<campaignId>\<runId>\`

contains the source/plan, QA attempts, receipt, final outputs, per-image metadata and staging evidence.

Managed execution manifests are separately retained under:

`%LOCALAPPDATA%\EVAVO\ArtStudio\agent-requests\managed-batch-v2\`

so machine binding never mutates the authored campaign file.

## Regression contract

`check-local-generation-batch-v2.mjs` requires the compiler, orchestrator, formal schema, data profiles, quality workflow compiler/decompiler, reference DAG, model/LoRA plan, generic examples, managed lifecycle and MCP tools. It also syntax-checks the executable Node modules.

Focused tests cover large-batch chunking, deterministic consistency, generation modes, quality KSampler rewriting, reference-DAG resolution/cycle rejection, model/LoRA fail-closed behavior and reproducibility metadata.

## Architecture rule

No character, game, genre, campaign or fixed output count belongs in the generic engine.

Project decisions belong in campaign data. Pixel-affecting provider behavior belongs in reviewed provider workflows/bindings. The generic engine owns planning, deterministic compilation, machine binding, managed local runtime lifecycle, chunking, QA, retry, metadata and receipts.
