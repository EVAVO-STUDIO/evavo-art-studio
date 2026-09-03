# Local Generation Batch V2

`evavo.local-generation-batch.v2` is the generic, data-driven local image production layer for Art Studio. It exists to prevent project-specific batch logic and one-off prompt strings from becoming the production architecture.

## Design goals

The v2 layer supports one image or large production sets with the same contract. A campaign declares its shot count, shot list, character/design identity, art direction, quality profile, consistency mode, output rules and retry rules. The orchestrator compiles those declarations into the existing reviewed local-provider runtime instead of bypassing provider governance.

The current maximum is 2,000 shots per campaign. Provider execution is transparently chunked into groups of at most 100 shots so large campaigns do not require a single oversized durable runtime submission.

## Campaign schema

Required top-level fields are:

- `schema: "evavo.local-generation-batch.v2"`
- `campaignId`
- `batch_size`
- `character`
- `style`
- `shots[]`

Important optional controls are:

- `contentClass`
- `generation_mode`
- `consistency_mode`
- `quality_profile`
- `quality_overrides`
- `continuity_locks`
- `quality_prompt`
- `negative`
- `seed_strategy`
- `output_rules`
- `retry_rules`
- `provider`

`shots.length` must equal `batch_size`. This is deliberate: the manifest is an explicit production plan, not an instruction to silently invent an unspecified number of frames.

## Shot contract

Each shot can define:

- `id`
- `description`
- `pose`
- `camera`
- `expression`
- `outfitState`
- `background`
- `framing`
- `mustInclude[]`
- `mustAvoid[]`
- `continuityLocks[]`
- `references[]`
- `seed`
- `candidateCount`
- `assetKind`
- `continuityPhase`
- `target`
- `tags[]`

This makes the shot list the source of truth. A vague campaign-wide prompt is not treated as an adequate replacement for a shot plan.

## Prompt assembly

Prompts are assembled deterministically from separate layers:

1. **Identity** — face, hair, proportions, costume, palette and signature details.
2. **Style** — medium, period, lighting, palette, materials and line treatment.
3. **Quality** — reusable quality-profile direction and campaign quality additions.
4. **Continuity** — strict/balanced/loose rules plus campaign and per-shot locks.
5. **Shot** — pose, camera, expression, outfit state, background, framing and required content.
6. **Negative** — global, quality-profile and shot-specific exclusions.

Every assembled positive and negative prompt receives a SHA-256 in per-image metadata. Stable prompt layers are intentionally repeated across frames; only shot-specific layers should drift during a strict sequence.

The built-in profiles contain explicit anti-generic guidance. Their purpose is not to stuff aesthetic buzzwords into prompts. They enforce concrete production-art concerns such as silhouette, material separation, motivated lighting, stable proportions, meaningful composition and rejection of generic stock/AI visual habits.

## Quality profiles

Built-in profiles:

- `portrait_high_quality`
- `sprite_sheet_clean`
- `concept_art_painterly`
- `comic_inked`
- `cinematic_stills`
- `product_mockups`

Profiles record resolution, steps, CFG, sampler, scheduler, denoise, hires scale, detail-pass intent and output format as reproducibility settings.

### Provider-binding rule

Do not claim that a profile value affected provider pixels unless the selected reviewed provider profile exposes a binding for that value.

At the time v2 was introduced, the ComfyUI adapter has typed workflow bindings for positive prompt, negative prompt, width, height, seed, candidate count, filename prefix and reference images. Sampling controls such as steps, CFG, sampler, scheduler and denoise are preserved in v2 metadata and quality planning but are not silently injected through arbitrary metadata. They must be added as first-class typed provider bindings before Art Studio reports them as active runtime controls.

This fail-honest rule is intentional. Reproducibility metadata is not allowed to masquerade as execution evidence.

## Consistency modes

`strict`

- related deterministic seeds by default
- identity locks repeated in every prompt
- only shot-declared changes are intended to vary
- suitable for sprite families, character sequences, UI portraits and card sets

`balanced`

- preserves recognizable identity and design language
- allows wider pose/camera variation
- useful for ordinary narrative illustration sets

`loose`

- preserves campaign concept rather than exact identity geometry
- uses independent continuity phase by default
- useful for moodboards and exploration

## Generation modes

`independent` — each shot is independently generated.

`sequential-anchor` — the first shot is planned as the identity master; later shots are key poses.

`paired` — defaults to two candidates per shot.

`variation` — defaults to four candidates per shot.

`repair` — uses repair continuity phase for targeted regeneration.

`sprite` — establishes a direction master followed by key poses with repeatable framing intent.

### Reference and anchor evidence

The v2 shot schema records `references[]`, but a string reference is not automatically evidence that a provider consumed an image. Real pixel-level identity/reference chaining requires provider artifact references and a reviewed ComfyUI profile with `reference-images`/role-specific capability plus declared reference bindings. Until that is present, Art Studio must treat reference strings as planning metadata only.

This distinction prevents false claims of character consistency. Prompt locking and seed strategy can improve consistency, but they are not equivalent to an actual image-reference pipeline.

## QA and selective retry

The generic orchestrator validates generated files after each attempt:

- expected candidate count per shot
- file exists and is a regular image file
- non-zero bytes
- PNG/JPEG/WebP signature
- expected image dimensions where available
- SHA-256
- duplicate hashes across accepted shots

Only affected shots are placed into the next attempt. Retry seeds use the original deterministic seed plus `retry_rules.seedBump * (attempt - 1)`.

The whole batch is not rerun because one frame failed.

Default retry ceiling is three attempts per shot and can be configured from one to eight.

## Output structure

By default:

`%LOCALAPPDATA%\EVAVO\ArtStudio\batches\<campaignId>\<runId>\`

contains:

- `manifest.input.json`
- `plan.json`
- `qa-attempt-XX.json`
- `receipt.json`
- `outputs\`
- `metadata\`
- `staging\`

Accepted output names are ordinal and deterministic, for example:

`0001-anchor-front-candidate-01.png`

Every accepted image can have a sibling metadata JSON containing:

- prompt
- negative prompt
- prompt layers
- prompt hashes
- seed
- quality profile
- width/height
- steps/CFG/sampler/scheduler/denoise planning values
- candidate count
- source references
- retry attempt
- provider route
- provider artifact/content hash
- QA result

## One-command execution

From the Art Studio repository:

```cmd
RUN-LOCAL-ART-BATCH.cmd C:\path\to\campaign.json
```

If no manifest is supplied it uses `examples/local-generation-batch.template.json`.

The same runtime is exposed to trusted local agents through:

- `local_generation_batch_capabilities`
- `run_local_generation_batch`

## Regression test

Run:

```cmd
node --test scripts\local-generation-batch-v2.test.mjs
```

The contract suite covers a 120-shot campaign, provider chunking, deterministic strict seeds, sequential anchor phases, paired/variation candidate counts, layered prompts, anti-generic guidance, reproducibility metadata and fail-closed manifest validation.

## Architecture rule

No character, game, campaign, genre or output count belongs in the generic engine.

Project data belongs in campaign manifests. Provider-specific executable details belong in reviewed provider profiles. The batch engine owns planning, deterministic compilation, chunking, QA, retry, metadata and consolidated receipts.
