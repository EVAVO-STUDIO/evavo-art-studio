# Governed Draw Things local provider

EVAVO Art Studio can use Draw Things as a distinct local image provider without making Draw Things the orchestration or approval authority.

## Architecture

```text
EVAVO Art Studio
  -> governed provider request
  -> draw-things:<profileId>
  -> reviewed ComfyUI API workflow
  -> official ComfyUI-DrawThings-gRPC bridge
  -> Draw Things gRPCServerCLI
  -> local NVIDIA GPU
  -> immutable unapproved candidate
  -> existing EVAVO ranking / QA / repair / mastering / atlas pipeline
```

This keeps Art Studio's provider-neutral request, provenance, candidate storage, selection, alpha mastering, sequence QA and delivery contracts unchanged.

## Why the bridge is the first transport

Draw Things exposes a real gRPC image-generation service, but its generation request carries generation configuration as a FlatBuffer payload. Rebuilding that configuration protocol independently inside Art Studio would duplicate Draw Things implementation detail and create a second compatibility surface.

The official `drawthingsai/draw-things-comfyui` project already converts reviewed ComfyUI node configuration into Draw Things gRPC requests. Art Studio therefore uses that bridge first and gives the resulting workflow its own provider identity.

A future native gRPC adapter remains possible, but only after Art Studio can pin and validate the exact Draw Things configuration schema rather than guessing sampler configuration.

## Provider identity and evidence

A compiled ComfyUI profile is admitted as Draw Things only when its exact node inventory contains `DrawThingsSampler`. It is registered as `draw-things:<profileId>` instead of `comfyui:<profileId>`.

The adapter records the normal ComfyUI catalog/profile/workflow/runtime/model evidence plus the Draw Things profile hash, official sampler boundary, delegated adapter identity, the exact gRPC server/port/TLS values pinned inside the reviewed workflow, and explicit proof that no direct Art Studio gRPC client or candidate approval was used. Remote Draw Things endpoints are rejected unless the immutable workflow enables TLS.

## External service and licence boundary

Draw Things Community and the official ComfyUI bridge are GPLv3 projects. Do not vendor their source into this repository or silently bundle/download their server as part of Art Studio. Keep them separately installed and managed as external local services. Art Studio contains only its own provider adapter, configuration and evidence contracts.

The model used by Draw Things has its own licence. Model installation is not approval for commercial use. EVAVO model-governance metadata must independently record source, hash and reviewed licence status before production use.

## Windows / NVIDIA local layout

```text
Windows 11
  |
  +-- EVAVO Art Studio worker / MCP
  +-- dedicated headless ComfyUI
  |     +-- official ComfyUI-DrawThings-gRPC custom node
  +-- Docker Desktop / WSL2
        +-- drawthingsai/draw-things-grpc-server-cli
              +-- NVIDIA GPU
```

Draw Things documents its CUDA server container on port `7859`. A loopback-only operator launch can follow this shape:

```powershell
$models = Join-Path $env:LOCALAPPDATA "EVAVO\AI\DrawThings\Models"
New-Item -ItemType Directory -Force -Path $models | Out-Null

docker run --rm --gpus all `
  -v "${models}:/grpc-models" `
  -p 127.0.0.1:7859:7859 `
  drawthingsai/draw-things-grpc-server-cli:latest `
  gRPCServerCLI /grpc-models --no-response-compression --model-browser
```

Pin an exact reviewed image digest for production rather than relying on `:latest`, and record that digest in the runtime inventory. Pin the official ComfyUI bridge to an exact reviewed commit as well.

The normal EVAVO ComfyUI service intentionally disables every custom node and should remain unchanged. Run Draw Things through a separate dedicated ComfyUI bridge instance on port `8193`. Start that instance with custom nodes disabled by default and whitelist only the pinned Draw Things bridge, for example `--disable-all-custom-nodes --whitelist-custom-nodes draw-things-comfyui --disable-api-nodes --disable-auto-launch`. This keeps the ordinary core-only generation path isolated from the GPL bridge and from unrelated custom nodes.

## Art Studio worker configuration

```powershell
$env:EVAVO_ART_DRAWTHINGS_CATALOG = "C:\EVAVO\draw-things\catalog.json"
$env:EVAVO_ART_DRAWTHINGS_CATALOG_ROOT = "C:\EVAVO\draw-things"
$env:EVAVO_ART_DRAWTHINGS_COMFYUI_BASE_URL = "http://127.0.0.1:8193"
$env:EVAVO_ART_DRAWTHINGS_COMFYUI_DEDICATED_INSTANCE = "true"
$env:EVAVO_ART_DRAWTHINGS_COMFYUI_ALLOW_REMOTE = "false"
```

The same bounded timeout, JSON, upload and output controls are available under the `EVAVO_ART_DRAWTHINGS_COMFYUI_*` prefix. The Draw Things gRPC target is not controlled by an environment flag: `server`, `port` and `use_tls` are pinned inside the reviewed `DrawThingsSampler` workflow and therefore participate in the catalog/profile hashes.

## Building the reviewed workflow catalog

Do not accept arbitrary workflows from ChatGPT, Claude, MCP callers or runtime payloads. Install and pin the official bridge, build and review a workflow containing `DrawThingsSampler` and any required Draw Things ControlNet/LoRA nodes, and pin its `server`, `port` and `use_tls` fields. For the canonical local service use `127.0.0.1`, `7859` and `false`. Export it in ComfyUI API format, include exact model/runtime hashes, then compile it with the existing deterministic ComfyUI catalog compiler. Point `EVAVO_ART_DRAWTHINGS_CATALOG` at that compiled catalog.

The wrapper does not weaken ComfyUI validation: the workflow remains self-hashed and only declared bindings can be mutated at execution time.

## Recommended profile families

Prefer several narrow reviewed profiles over one workflow claiming every capability: `draw-things:concept-fast`, `draw-things:illustration-quality`, `draw-things:character-identity`, `draw-things:sprite-key-pose`, `draw-things:sprite-inbetween`, `draw-things:sprite-repair`, and `draw-things:environment`.

Each profile should advertise only capabilities its exact graph proves. A sprite in-between profile should claim canonical identity and previous/next key-pose references only when those bindings really exist.

## Sprite and animation policy

Do not ask diffusion to author the final atlas grid. Generate individual identity masters, direction masters, key poses and neighbour-conditioned in-betweens; run per-frame QA and selective repair; master alpha; validate pivot/baseline/ground contact; then use deterministic frame ordering, MaxRects packing and Godot SpriteFrames delivery.

Draw Things supplies candidates. Art Studio remains responsible for deciding whether those candidates advance.

## Agent behaviour

ChatGPT, Claude and trusted agents should work at intent level rather than raw sampler level. Art Studio should compile intent, inspect exact provider eligibility, and choose a reviewed `draw-things:*` or `comfyui:*` profile. Raw sampler controls remain an operator/workflow-authoring concern.

## Single-GPU rule

EVAVO Local Compute already provides the machine-wide creative GPU lease broker with resource estimates, priorities, starvation protection and per-GPU collision avoidance. Draw Things-backed Art Studio jobs must stay behind that same broker rather than inventing a second lock. Keep direct local provider worker concurrency at `1` when bypassing the broker, and never run independent interactive ComfyUI or Draw Things generations against the same GPU while a lease is active.

## Production acceptance

A Draw Things-backed candidate is never automatically final. It continues through immutable candidate storage, identity/silhouette/palette comparison, sequence continuity checks, decoded alpha/matte checks, crop/safe-bound checks, selective repair, explicit promotion, and deterministic atlas or engine export.
