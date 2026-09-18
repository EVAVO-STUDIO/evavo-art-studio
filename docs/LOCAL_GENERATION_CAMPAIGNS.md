# Automated local generation campaigns

`RUN-LOCAL-ART-CAMPAIGN.cmd` is the generic workstation entry point for repeatable Art Studio image-generation campaigns backed by reviewed local provider profiles. The campaign backend can be core ComfyUI or the isolated Draw Things gRPC bridge.

The runner is deliberately data-driven. Lorna is an example campaign, not a hard-coded production path. The same runner can be used for characters, environments, illustrations, sprite frames, sprite layers, UI, effects and print artwork by supplying a different manifest.

## One-command execution

From Art Studio:

```powershell
Set-Location C:\GitRepos\evavo-art-studio
.\RUN-LOCAL-ART-CAMPAIGN.cmd .\path\to\campaign.json
```

When no manifest is supplied the launcher uses `examples/local-generation-campaign.lorna.json` as the current mature non-explicit integration test.

For the complete workstation path, Local Compute exposes:

```powershell
Set-Location C:\GitRepos\evavo-local-compute
.\RUN-EVAVO-ART-CAMPAIGN-CURRENT.cmd C:\path\to\campaign.json
```

That entry point invokes the canonical Local Compute fabric bootstrap, ensures a loopback ComfyUI service is healthy or starts a discovered local installation headlessly, and then runs Art Studio. The operator does not need to open ComfyUI or paste prompts into its UI.

## What the runner does

For every campaign it:

1. validates the reusable `evavo.local-generation-campaign.v1` manifest;
2. requires loopback-only local-provider execution and disables hosted fallback;
3. reads the reviewed, compiled catalog for the selected backend;
4. routes each scene independently to an explicitly requested backend adapter or the highest-priority reviewed compatible local profile;
5. proves that profile supports the scene's operation, asset kind, continuity phase, exact provider capability profile and requested candidate count;
6. probes the local ComfyUI service before spending work;
7. creates ordinary governed Art Studio provider jobs with deterministic seeds, sizes and candidate counts;
8. builds the required Art Studio domain and worker packages;
9. submits the complete job batch to an isolated per-run durable runtime;
10. runs the provider worker until that batch is idle;
11. verifies candidate artifacts through `LocalArtifactStore`;
12. materializes viewable candidate image bytes into the campaign `outputs` directory; and
13. writes a final receipt containing every scene-to-profile/model route, paths, counts and artifact hashes.

Provider candidates remain `intermediate` / `unapproved`. This runner does not silently promote or publish generated artwork.

## Output location

On Windows the default output root is:

```text
%LOCALAPPDATA%\EVAVO\ArtStudio\campaigns\<campaignId>\<runId>\
```

Each run contains:

```text
manifest.input.json
routes.json
jobs\runtime-jobs.json
outputs\<scene>-candidate-01.png
outputs\<scene>-candidate-02.png
...
runtime\...
artifacts\...
receipt.json
```

The files under `outputs` are ordinary viewable images materialized from the verified immutable Art Studio artifact store. The `artifacts` directory remains the canonical content-addressed copy.

A different root can be selected without changing the manifest:

```powershell
node .\scripts\run-local-generation-campaign.mjs `
  --manifest C:\EVAVO\campaigns\my-campaign.json `
  --output-root D:\EVAVO-Renders
```

## Reuse

Start from:

```text
examples/local-generation-campaign.template.json
```

The reusable manifest controls:

- campaign identity;
- content classification;
- persistent subject description;
- local ComfyUI endpoint and compiled catalog;
- optional exact adapter profile globally or per scene;
- asset kind;
- continuity phase;
- source/output dimensions;
- output format and transparency policy;
- candidate count;
- deterministic seed;
- global or scene-specific art direction;
- scene prompt and negative prompt;
- shot action, direction, inclusion, exclusion and framing rules.

The runner does not contain project names, character identities, visual styles, model IDs or fixed prompts. Different scenes in one campaign may route to different reviewed local profiles when that is the best compatible route.

## Mature projects

The manifest supports `mature-nonexplicit` campaigns for unambiguously adult subjects. Such campaigns must declare `subject.minimumAge >= 18` and stay within non-explicit adult artwork. There is intentionally no setting that disables all safety boundaries or turns the automation into an unrestricted explicit-pornography generator.

This content boundary is separate from provider choice. A campaign may still execute completely locally, offline from hosted image providers, through reviewed ComfyUI model/workflow profiles.

## Provider selection

The provider block accepts an optional backend:

```json
{
  "provider": {
    "backend": "draw-things"
  }
}
```

Supported values are:

```text
comfyui      (default, backward compatible)
draw-things
```

When `backend` is omitted the existing ComfyUI behavior is unchanged.

`provider.adapterId` and per-scene `adapterId` are optional. When omitted,
the runner chooses the highest-priority reviewed local catalog profile whose
declared operation, asset kind, continuity phase, limits and capabilities match
that scene. When supplied, adapter IDs must match the selected backend:

```text
comfyui:<profileId>
draw-things:<profileId>
```

The two namespaces are intentionally not interchangeable. A Draw Things
campaign only routes to compiled profiles whose node inventory contains
`DrawThingsSampler`; the normal ComfyUI backend explicitly excludes those
profiles.

The capability profile written to each runtime job is derived the same way as Art Studio's provider registry: `generate` and `cancellation`, plus `seed`, `custom-size`, and `candidate-count` when the request actually needs them. This prevents runtime jobs from being rejected because of capability-profile drift.

Every generated request sets `allowFallback: false`, so a local-generation campaign cannot silently fall through to OpenAI or another hosted image provider.

## Machine-specific configuration

Core ComfyUI settings can come from the manifest or environment:

```text
EVAVO_ART_COMFYUI_BASE_URL
EVAVO_ART_COMFYUI_CATALOG
```

Draw Things uses a separate dedicated service/catalog:

```text
EVAVO_ART_DRAWTHINGS_COMFYUI_BASE_URL
EVAVO_ART_DRAWTHINGS_CATALOG
```

Canonical Draw Things defaults are:

```text
ComfyUI bridge : http://127.0.0.1:8193
Draw Things gRPC: 127.0.0.1:7859
catalog         : %LOCALAPPDATA%\EVAVO\AI\DrawThings\catalog.json
```

Run `prepare_draw_things_local_provider` (MCP) or
`COMMISSION-EVAVO-DRAW-THINGS-CURRENT.ps1 -Mode Prepare` (PowerShell) to
rebuild this catalog from the real installed model bytes and committed EVAVO
model policy. Preparation does not authorize downloads.

The catalog remains the authority for exact workflow, model, runtime and node hashes. The generic campaign runner does not accept arbitrary ComfyUI workflow JSON from the manifest and therefore does not weaken the existing reviewed-workflow boundary.

Local Compute may locate Art Studio somewhere other than `C:\GitRepos\evavo-art-studio` by setting:

```powershell
$env:EVAVO_ART_STUDIO_ROOT = 'D:\Repos\evavo-art-studio'
```

No other launcher change is required.


## Draw Things continuity routing

A Draw Things manifest does not need to name a workflow for ordinary routing.

For a no-reference scene, Art Studio uses the model's base profile.

For a scene with a required `canonical-identity` reference, Art Studio requires
the `identity-reference` capability and selects a reviewed identity-reference
profile.

For Kontext-capable models, a scene containing both
`canonical-identity` and `direction-master` can route to the reviewed
direction-reference profile.

An `in-between` sprite scene must contain required:

```text
canonical-identity
previous-key-pose
next-key-pose
```

The generated Kontext temporal profile binds the canonical identity as the base
Draw Things reference and the previous/next key poses as shuffle/moodboard
references. The V1 validator and provider capability profile require all three
roles before the job reaches the GPU.

Example:

```json
{
  "schema": "evavo.local-generation-campaign.v1",
  "campaignId": "ranger-walk-south-03",
  "contentClass": "general",
  "subject": {
    "description": "The approved ranger character"
  },
  "provider": {
    "backend": "draw-things"
  },
  "style": {
    "styleName": "game production",
    "intent": "Preserve the approved character and project art direction."
  },
  "scenes": [
    {
      "id": "walk-south-03",
      "assetKind": "sprite-frame",
      "continuityPhase": "in-between",
      "prompt": "Intermediate south-facing walk-cycle pose between the approved neighboring key poses.",
      "candidateCount": 2,
      "references": [
        {
          "artifactId": "artifact_<sha256>",
          "role": "canonical-identity",
          "required": true
        },
        {
          "artifactId": "artifact_<sha256>",
          "role": "previous-key-pose",
          "required": true
        },
        {
          "artifactId": "artifact_<sha256>",
          "role": "next-key-pose",
          "required": true
        }
      ],
      "target": {
        "width": 512,
        "height": 512,
        "transparency": "opaque",
        "outputFormat": "png"
      }
    }
  ]
}
```

The final atlas is still not generated by diffusion. Individual accepted frames
continue through Art Studio's sequence QA, alpha/mastering, pivot/baseline
validation and deterministic atlas/Godot delivery pipeline.

## GPU-aware local model selection

The canonical Local Compute launcher obtains the shared creative GPU lease before
starting either local backend. When NVIDIA telemetry is available, the free VRAM
measured at admission is passed to Art Studio.

The generated Draw Things governance evidence marks each model as
`baseline`, `quality` or `heavy`. Current routing keeps quality profiles
eligible at 8 GiB or more free-at-admission and heavy profiles at 10 GiB or more.
This lets an unpinned campaign prefer the higher-priority FLUX route when there
is headroom and use the governed SDXL baseline when there is not.

This is a local model fallback only. `allowFallback` remains false for hosted
providers, so resource routing cannot silently send the artwork to OpenAI or
another remote image service.
