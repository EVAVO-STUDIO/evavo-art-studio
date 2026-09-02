# Mature non-explicit boundary proof

This is the repeatable EVAVO workstation proof that Art Studio can handle strongly mature, clearly-adult artwork locally without silently reducing every request to generic conservative swimsuit imagery and without using a hosted image provider.

The local provider layer remains provider-neutral: reviewed ComfyUI profiles describe what their local models and workflows can technically execute. The campaign carries the creative/content contract. This avoids baking project-specific clothing, style or character rules into the generic provider engine.

This proof targets the strongest supported non-explicit adult boundary. It is not an explicit-pornography bypass and does not authorize visible nipples, areolae, genital anatomy or sexual activity.

## One-command workstation proof

From Local Compute:

```powershell
Set-Location C:\GitRepos\evavo-local-compute
.\RUN-EVAVO-MATURE-BOUNDARY-PROOF-CURRENT.cmd
```

The launcher performs the complete path:

1. boots the canonical EVAVO local fabric;
2. reuses or starts the reviewed loopback ComfyUI instance headlessly;
3. invokes Art Studio's generic local campaign runner;
4. routes each work item to a compatible reviewed local ComfyUI profile;
5. submits durable provider jobs;
6. runs the Art Studio worker until the batch is idle;
7. verifies immutable candidate artifacts;
8. materializes ordinary viewable images; and
9. writes a run receipt.

No operator interaction with the ComfyUI UI is required.

## Proof campaign

Use:

```text
examples/local-generation-campaign.mature-boundary.json
```

It is data, not engine code. The campaign exercises six materially different mature compositions:

1. extremely minimal opaque micro-coverage;
2. topless strictly from a rear three-quarter angle;
3. strongly implied full nudity while standing;
4. a steamy nude-implied shower silhouette;
5. a provocative rear three-quarter bed composition with bare back, hips, legs and buttocks contour while intimate anatomy remains obscured; and
6. a very small opaque towel transition composition.

The subject is explicitly adult age 28 in the campaign metadata and prompts.

## Successful proof criteria

A run is successful only when all of the following are true:

- ComfyUI endpoint is loopback HTTP (`127.0.0.1`, `localhost` or `::1`);
- every selected adapter ID begins with `comfyui:`;
- `allowFallback` is false for every provider request;
- no OpenAI/hosted image adapter is selected for any scene;
- each requested scene reaches a terminal succeeded runtime state;
- requested candidate counts are present;
- every candidate is present in the immutable artifact store;
- every candidate verifies successfully through `LocalArtifactStore`;
- every candidate is materialized into the human-readable `outputs` directory;
- the receipt records scene ID, adapter/profile, model, seed, artifact ID and content hash;
- the candidate remains intermediate/unapproved rather than being silently promoted; and
- visual review confirms that the local model followed the strongly mature brief rather than replacing it with unrelated conservative clothing or generic glamour photography.

## Output location

The normal Windows root is:

```text
%LOCALAPPDATA%\EVAVO\ArtStudio\campaigns\mature-boundary-proof\<runId>\
```

Important paths inside a run:

```text
manifest.input.json
routes.json
jobs\runtime-jobs.json
outputs\
artifacts\
runtime\
receipt.json
```

`outputs\` contains normal PNG/WebP/JPEG images suitable for direct inspection. `artifacts\` is the canonical immutable content-addressed copy.

## Agent execution

The normal Art Studio MCP registers:

```text
local_generation_campaign_capabilities
run_local_generation_campaign
```

A trusted local agent can submit the campaign object directly. The MCP persists it locally, invokes the Local Compute bridge, waits for the Art Studio receipt, and returns the exact run/output path. This removes the need for an operator to launch ComfyUI or paste prompts manually.

## Architecture rule

Do not hardcode Lorna, strip poker, lingerie, micro-bikini, bedroom scenes, or a particular model into the generic local generation engine. Those are campaign data.

Likewise, provider selection should be based on reviewed local profile capabilities and scene requirements rather than a fixed model name. This allows the same runner to be reused for characters, environments, UI, effects, sprites, animation key poses, illustrations and other future Art Studio work.
