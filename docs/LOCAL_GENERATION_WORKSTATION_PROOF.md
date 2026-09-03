# Local Generation Workstation Proof

This document records the accepted physical workstation state for the EVAVO Art Studio V2 local-generation runtime. It is evidence and recovery guidance, not a substitute for live validation.

## Canonical workstation layout

Art Studio runtime root:

`%LOCALAPPDATA%\EVAVO\ArtStudio`

Expected runtime directories:

- `campaigns`
- `batches`
- `artifacts`
- `runtime`
- `agent-requests`
- `receipts`
- `logs`

ComfyUI runtime root:

`%LOCALAPPDATA%\EVAVO\AI\ComfyUI`

Canonical reviewed catalog:

`%LOCALAPPDATA%\EVAVO\AI\ComfyUI\catalog.json`

## Runtime baseline

The accepted workstation proof established:

- Windows local execution
- NVIDIA RTX 4080 Laptop GPU
- approximately 12.3 GB VRAM visible to the local runtime
- Python 3.12.10 in the isolated ComfyUI environment
- CUDA 13.0 visible to PyTorch
- PyTorch `2.14.0+cu130`
- torchvision `0.29.0+cu130`
- torchaudio `2.11.0+cu130`
- ComfyUI pinned at commit `ace9172e95038ac25015c419713aa7755f739034`

Do not infer current health from this record alone. Managed execution still probes the owned local service at runtime.

## SDXL model proof

The local SDXL Base 1.0 checkpoint was accepted only after exact size and SHA-256 verification.

- size: `6938078334` bytes
- SHA-256: `31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b`

The reviewed catalog's model inventory must continue to identify the same accepted model authority before jobs execute.

## True-core ComfyUI service

The managed V2 service uses a dedicated true-core bootstrap rather than a general interactive ComfyUI instance.

Properties:

- loopback only
- owned port, default `8192`
- `sqlite:///:memory:` database
- `--disable-auto-launch`
- `--disable-all-custom-nodes`
- `--disable-api-nodes`
- built-in `comfy_extras` import is skipped for the dedicated process
- pinned upstream ComfyUI checkout remains unchanged
- only the process started by the managed invocation is terminated by that invocation

The same true-core mechanism physically reached ready state in approximately 33 seconds during commissioning.

Required core nodes:

- `CheckpointLoaderSimple`
- `CLIPTextEncode`
- `EmptyLatentImage`
- `KSampler`
- `VAEDecode`
- `SaveImage`

## Physical quality catalog

A base reviewed SDXL profile was expanded into six independently hashed workflow-baked quality variants through:

1. safe decompilation of the accepted compiled catalog;
2. deterministic quality-profile workflow compilation;
3. normal reviewed catalog recompilation;
4. backup of the prior physical catalog;
5. atomic promotion and readback verification.

The commissioned catalog contains seven profiles total: one base plus six quality variants.

Compiled catalog integrity SHA-256:

`d3f207ea64af576433d15dbe0e76fa6c68f3b6c6161e6447c268267088325f13`

The physical catalog file changed from:

`bb68d80ac9263b44f89fc55a9059a9dfb18987341c21681be9cf1d94192d97ca`

to:

`d5338e9bf77fd09188e22e476e891bd619339dd90bc7c02615b1ca92a99014ae`

Reviewed quality profile hashes:

| Profile | Profile SHA-256 |
| --- | --- |
| `sdxl-base-local-portrait_high_quality` | `76bfe3eb3242921c786d3208913c5f5bfcfd6a9da9fd8fbb80a4800a05660087` |
| `sdxl-base-local-sprite_sheet_clean` | `28916db96e2b3d88831088c05e2ea2bccc8f50061567fb3dd9046cc151bb63a3` |
| `sdxl-base-local-concept_art_painterly` | `b0130574c7477f47611fd405dac6c17d91e143e358b9c6171dd16dc27ade3281` |
| `sdxl-base-local-comic_inked` | `fb31d0def6432679a24115ddef0d5116eb81d2779eb149c5fbd65bf8fde2beb0` |
| `sdxl-base-local-cinematic_stills` | `e96b70b80a2aac729ae0e2b048d3f6d47b03b47193cccc1937191658cdbaf9b8` |
| `sdxl-base-local-product_mockups` | `6a8fc8d0a4814c0c75764b452263eb7fce9da57881ce381de7b5b0b66c5326b6` |

The quality profile is part of executable routing. The matching reviewed workflow bakes the profile's KSampler steps, CFG, sampler, scheduler and denoise values.

## Managed V2 launch path

Human/CLI entry:

`RUN-LOCAL-ART-BATCH.cmd <campaign.json>`

Agent entry:

`run_local_generation_batch`

Both converge on the same managed entry and lifecycle.

Managed entry responsibilities:

1. preserve the authored source manifest;
2. compile the V2 plan;
3. run the pre-GPU prompt/plan audit;
4. bind the physical catalog and owned loopback endpoint;
5. derive or verify the reviewed quality adapter;
6. validate model/LoRA requirements against the selected physical profile;
7. validate explicit reference-input requirements and fail closed if the selected workflow/runtime cannot execute them;
8. write machine-bound execution and provider-selection evidence;
9. start the owned true-core ComfyUI service;
10. run the durable provider-backed batch orchestrator;
11. stop the owned service.

## Pre-GPU prompt and plan audit

The managed path rejects or warns on structural prompt problems before GPU time is spent.

Checks include:

- generic AI filler phrases
- low shot specificity
- weak shot-specific prompt layer
- excessive prompt length
- duplicate shot prompts outside variation mode
- strict identity-layer drift
- strict style-layer drift
- campaign prompt collapse

This audit is deterministic. It is not a subjective image-quality score and does not replace post-generation QA.

## Post-generation QA

The V2 orchestrator validates:

- expected image count, using the sum of per-shot candidate counts
- file existence
- regular files
- non-zero bytes
- PNG/JPEG/WebP signatures
- expected dimensions where the format parser supports them
- SHA-256
- duplicate hashes across accepted outputs

Only affected shots are retried.

## Truth boundary

The physical core SDXL catalog currently proves:

- prompt/seed consistency
- workflow-baked quality settings
- local-only SDXL execution

It does **not** currently prove IP-Adapter/ControlNet/reference-image identity conditioning or LoRA conditioning. Explicit artifact-conditioned reference requests and LoRA requirements must fail closed unless a reviewed physical profile with the required loader/bindings is selected.

Never describe prompt similarity as artifact-conditioned consistency.

## Hosted paths

Hosted image fallback is disabled for this local batch path. The proof and catalog commissioning did not require GitHub Actions, Vercel jobs or hosted image inference.
