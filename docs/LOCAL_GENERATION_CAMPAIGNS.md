# Automated local generation campaigns

`RUN-LOCAL-ART-CAMPAIGN.cmd` is the generic workstation entry point for repeatable Art Studio image-generation campaigns backed by a reviewed local ComfyUI provider profile.

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

That entry point invokes the canonical Local Compute fabric bootstrap first and then Art Studio. The operator does not need to open ComfyUI or paste prompts into its UI.

## What the runner does

For every campaign it:

1. validates the reusable `evavo.local-generation-campaign.v1` manifest;
2. requires loopback-only ComfyUI execution and disables hosted fallback;
3. reads the reviewed, compiled ComfyUI catalog;
4. selects the requested `comfyui:<profile>` adapter or the highest-priority reviewed profile supporting all requested asset kinds;
5. probes the local ComfyUI service before spending work;
6. creates ordinary governed Art Studio provider jobs with deterministic seeds, sizes and candidate counts;
7. builds the required Art Studio domain and worker packages;
8. submits the complete job batch to an isolated per-run durable runtime;
9. runs the provider worker until that batch is idle;
10. verifies candidate artifacts through `LocalArtifactStore`;
11. materializes viewable candidate image bytes into the campaign `outputs` directory; and
12. writes a final receipt containing provider, model/profile, paths, counts and artifact hashes.

Provider candidates remain `intermediate` / `unapproved`. This runner does not silently promote or publish generated artwork.

## Output location

On Windows the default output root is:

```text
%LOCALAPPDATA%\EVAVO\ArtStudio\campaigns\<campaignId>\<runId>\
```

Each run contains:

```text
manifest.input.json
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
- optional exact adapter profile;
- asset kind;
- continuity phase;
- source/output dimensions;
- output format and transparency policy;
- candidate count;
- deterministic seed;
- global art direction;
- scene prompt and negative prompt;
- shot action, direction, inclusion, exclusion and framing rules.

The runner does not contain project names, character identities, visual styles or fixed prompts.

## Mature projects

The manifest supports `mature-nonexplicit` campaigns for unambiguously adult subjects. Such campaigns must declare `subject.minimumAge >= 18` and stay within non-explicit adult artwork. There is intentionally no setting that disables all safety boundaries or turns the automation into an unrestricted explicit-pornography generator.

This content boundary is separate from provider choice. A campaign may still execute completely locally, offline from hosted image providers, through the reviewed ComfyUI model/workflow profile.

## Provider selection

`provider.adapterId` is optional. When omitted, the runner chooses the highest-priority reviewed local catalog profile whose declared operations and asset kinds cover the campaign. When supplied, it must use the exact form:

```text
comfyui:<profileId>
```

The campaign always sets `allowFallback: false`, so a local-generation test cannot silently fall through to OpenAI or another hosted image provider.

## Machine-specific configuration

The example catalog path is:

```text
C:\EVAVO\comfyui\catalog.json
```

The catalog remains the authority for exact workflow, model, runtime and node hashes. The generic campaign runner does not accept arbitrary ComfyUI workflow JSON from the manifest and therefore does not weaken the existing reviewed-workflow boundary.

Local Compute may locate Art Studio somewhere other than `C:\GitRepos\evavo-art-studio` by setting:

```powershell
$env:EVAVO_ART_STUDIO_ROOT = 'D:\Repos\evavo-art-studio'
```

No other launcher change is required.
