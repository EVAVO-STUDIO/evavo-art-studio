# Automated local generation campaigns

`RUN-LOCAL-ART-CAMPAIGN.cmd` is the generic workstation entry point for repeatable Art Studio image-generation campaigns backed by reviewed local ComfyUI provider profiles.

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
2. requires loopback-only ComfyUI execution and disables hosted fallback;
3. reads the reviewed, compiled ComfyUI catalog;
4. routes each scene independently to an explicitly requested `comfyui:<profile>` or the highest-priority reviewed compatible local profile;
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

`provider.adapterId` and per-scene `adapterId` are optional. When omitted, the runner chooses the highest-priority reviewed local catalog profile whose declared operation, asset kind, continuity phase, limits and capabilities match that scene. When supplied, an adapter ID must use:

```text
comfyui:<profileId>
```

The capability profile written to each runtime job is derived the same way as Art Studio's provider registry: `generate` and `cancellation`, plus `seed`, `custom-size`, and `candidate-count` when the request actually needs them. This prevents runtime jobs from being rejected because of capability-profile drift.

Every generated request sets `allowFallback: false`, so a local-generation campaign cannot silently fall through to OpenAI or another hosted image provider.

## Machine-specific configuration

Both provider settings can come from the manifest or environment:

```text
EVAVO_ART_COMFYUI_BASE_URL
EVAVO_ART_COMFYUI_CATALOG
```

Defaults are loopback `http://127.0.0.1:8188` and, on Windows, `C:\EVAVO\comfyui\catalog.json`.

The catalog remains the authority for exact workflow, model, runtime and node hashes. The generic campaign runner does not accept arbitrary ComfyUI workflow JSON from the manifest and therefore does not weaken the existing reviewed-workflow boundary.

Local Compute may locate Art Studio somewhere other than `C:\GitRepos\evavo-art-studio` by setting:

```powershell
$env:EVAVO_ART_STUDIO_ROOT = 'D:\Repos\evavo-art-studio'
```

No other launcher change is required.
