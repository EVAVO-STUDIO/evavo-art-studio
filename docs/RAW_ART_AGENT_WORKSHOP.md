# RAW_ART agent workshop

This workflow gives ChatGPT, Claude and other authorised agents a governed path from a reviewed `provider-required` RAW_ART item to immutable provider candidates and evidence.

It does not make RAW_ART mutable. It does not allow a generated or edited image to become approved game art merely because a provider job succeeded.

## Complete operating chain

```text
complete RAW_ART and LFS materialisation
→ exact resumable inventory
→ role-bound Art Studio technical review
→ complete technical admission v2
→ exact creative decision and work order
→ technically gated approved style bank
→ production queue v2
→ campaign revision v3
→ campaign nextBatch membership and needs-processing stage
→ immutable Art Studio source, mask, identity and style artifacts
→ campaign-bound artifact-binding template
→ finalized self-hashed artifact bindings v2
→ provider request batch v2
→ canonical provider validation, prompt compilation and durable job batch
→ separate explicit durable runtime submission
→ separate Art Studio worker execution
→ immutable unapproved candidates and provider evidence
→ candidate mastering and deterministic evaluation
→ Godot Game Test Lab
→ named creative, historical and provenance approvals
→ browser and native composition evidence
→ Development Studio sealed publication
```

A queue entry cannot enter provider execution unless the exact source path and SHA-256 also identify a technically passed campaign-v3 item in the current governed `nextBatch`, and that campaign item is at `needs-processing`.

## Game-owned provider map

Brass & Brine owns the provider mapping in:

```text
config/art/brass_raw_art_provider_role_map.v2.json
```

It maps dialogue portraits, standing characters, crew, ships, documents, icons, weather, maps, locations, ship scenes and combat effects to the correct provider asset kind, alpha target, background strategy, continuity phase, candidate count and quality.

The map also fixes these cross-repository rules:

- campaign revision v3 and complete current-byte technical admission are mandatory;
- only the current campaign `nextBatch` may compile;
- the campaign item must be at `needs-processing`;
- adapter output canvas is derived from the governed target rather than forcing a small RAW_ART canvas onto a provider;
- provider output and evidence are stored as immutable, unapproved artifacts;
- provider execution, runtime submission, approval and publication remain separate authorities.

Art Studio rejects an unmapped role. It must not guess a generic canvas, alpha policy, historical treatment or provider operation.

## Create the artifact-binding template

Build and verify the queue, campaign and approved style bank first:

```powershell
node scripts/compile-raw-art-provider-requests.mjs template `
  --queue <raw-art-production-queue.json> `
  --campaign <campaign-v3.json> `
  --bridge <Brass_Brine/config/art/brass_art_studio_bridge.v1.json> `
  --provider-map <Brass_Brine/config/art/brass_raw_art_provider_role_map.v2.json> `
  --direction <Brass_Brine/config/art/brass_art_direction_animation.v1.json> `
  --style-bank <approved-style-bank.json> `
  --game-head <exact-40-character-Brass-main-sha> `
  --output <create-only-artifact-bindings-template.json>
```

The template includes only current campaign-nextBatch items that are both technically passed and ready for processing. It separately reports:

- sources missing from campaign v3;
- technical-admission or role mismatches;
- provider-required items outside the current campaign batch;
- campaign items that are not yet at `needs-processing`.

Each eligible binding states the exact remaining evidence. Typical requirements are:

- a base-image artifact for edit and inpaint work;
- one reviewed mask artifact for inpainting;
- a canonical identity artifact for continuity-locked character or ship repair;
- previous and next key-pose artifacts for true in-between work;
- approved role style artifacts from `evavo.image-style-reference-bank.v1`;
- an exact creative intent and shot subject;
- optional structural controls, seed policy and adapter restrictions.

## Materialise immutable artifacts

Use the full Art Studio MCP with explicit allowed roots and writes enabled only for the external evidence, artifact and runtime locations. For each source or reference file call:

```text
store_artifact_file
```

A source descriptor can use this shape:

```json
{
  "mediaType": "image/png",
  "storageClass": "source",
  "fileName": "sailor-standing-source.png",
  "sourceArtifacts": [],
  "labels": {
    "project": "brass-and-brine",
    "artifactRole": "raw-art-provider-source",
    "approvalState": "unapproved"
  },
  "metadata": {
    "sourcePath": "RAW_ART/characters/sailor.png",
    "sourceSha256": "<exact-source-sha256>",
    "campaignItemId": "<exact-campaign-item-id>",
    "finalDeliverable": false
  }
}
```

Read each returned `artifact_<sha256>` record through `inspect_artifact_record` when independent verification is needed. Filenames and labels do not replace the content-addressed artifact identity.

Replace the template placeholders with the returned artifact identifiers and exact creative briefs. Do not manually change the template schema or claim that it is ready.

## Finalize artifact bindings

Finalize the completed template against the current exact inputs:

```powershell
node scripts/compile-raw-art-provider-requests.mjs finalize `
  --queue <raw-art-production-queue.json> `
  --campaign <campaign-v3.json> `
  --bridge <Brass_Brine/config/art/brass_art_studio_bridge.v1.json> `
  --provider-map <Brass_Brine/config/art/brass_raw_art_provider_role_map.v2.json> `
  --direction <Brass_Brine/config/art/brass_art_direction_animation.v1.json> `
  --style-bank <approved-style-bank.json> `
  --completed-template <completed-artifact-bindings-template.json> `
  --output <create-only-finalized-artifact-bindings.json>
```

The finalizer:

- rejects remaining placeholders;
- verifies every artifact identifier format;
- rejects bindings outside the current campaign nextBatch;
- binds the exact queue, campaign, admission, bridge, provider map, direction and style-bank bytes;
- writes `evavo.raw-art-provider-artifact-bindings.v2` with a deterministic `bindingsSha256` and `runId`;
- reports `ready` or `partially-ready` without executing a provider.

## Compile provider requests

```powershell
node scripts/compile-raw-art-provider-requests.mjs compile `
  --queue <raw-art-production-queue.json> `
  --campaign <campaign-v3.json> `
  --bridge <Brass_Brine/config/art/brass_art_studio_bridge.v1.json> `
  --provider-map <Brass_Brine/config/art/brass_raw_art_provider_role_map.v2.json> `
  --direction <Brass_Brine/config/art/brass_art_direction_animation.v1.json> `
  --style-bank <approved-style-bank.json> `
  --artifact-bindings <finalized-artifact-bindings.json> `
  --maximum-orders 25 `
  --output <create-only-provider-request-batch.json>
```

The requested maximum cannot exceed either the game-owned provider maximum or campaign-v3 `nextBatch.maximumItems`.

The compiler independently verifies:

- queue schema and self-hash;
- exact bridge bytes used by the queue;
- campaign-v3 self-hash, run ID, exact item IDs and all-false effect boundary;
- complete technical admission with current source bytes reverified;
- current campaign-nextBatch membership and `needs-processing` stage;
- the game-owned provider role map v2;
- the current art-direction contract and all-false authority;
- style-bank self-hash, explicit approval evidence and all-false effects;
- finalized binding self-hash and exact input-file identities;
- immutable artifact identifiers;
- base-image, mask, identity and key-pose requirements;
- role canvas, alpha, background and provider-operation compatibility;
- stable target paths and bounded batch size.

Evidence-complete items become `evavo.raw-art-provider-request-batch.v2` requests. A problem with one current-batch item remains isolated. Provider work outside the current campaign batch is deferred rather than silently executed.

The provider request intentionally does not copy the RAW_ART dimensions into `sourceCanvas`. The adapter derives a valid working canvas from the governed target, while the exact original dimensions remain in request metadata. Candidate mastering must restore the governed final canvas and alpha policy before evaluation.

## Compile the canonical provider runtime batch

Build the shared provider contract, then compile the complete request batch in one deterministic, create-only pass:

```powershell
pnpm --filter @evavo/art-providers build

node scripts/compile-raw-art-provider-runtime-batch.mjs `
  --provider-batch <create-only-provider-request-batch.json> `
  --output <create-only-provider-runtime-batch.json>
```

The output schema is `evavo.raw-art-provider-runtime-batch.v1`. For every valid current-batch work order it records:

- the campaign item ID and exact source/target identity;
- the normalized provider request and deterministic request ID;
- the request SHA-256;
- the canonical provider-neutral prompt and prompt SHA-256;
- the exact adapter capability profile required by routing;
- the same durable runtime job contract returned by the Art Studio MCP;
- a complete compiled-contract SHA-256 and runtime-job SHA-256.

The runtime compiler independently verifies the request-batch v2 self-hash, run ID, counts, campaign-nextBatch membership, campaign/admission/style/bindings hashes, metadata v2, adapter-derived canvas policy, unique work-order/source/target identities and all-false authority. A malformed provider request becomes a per-item `canonical-provider-contract` blocker and does not stop unrelated valid jobs.

The compiler performs no provider call, artifact read, runtime submission, candidate selection, promotion, approval or publication.

## Submit selected runtime jobs through Art Studio MCP

Start the full MCP after building the domain packages:

```powershell
pnpm run build:domain
pnpm --filter @evavo/art-studio-mcp build
node apps/mcp/dist/index.js
```

Configure explicit roots and write permission only where required:

```text
EVAVO_ART_ALLOWED_ROOTS=<game-root><path-delimiter><evidence-root><path-delimiter><artifact-root>
EVAVO_ART_ARTIFACT_ROOT=<artifact-root>
EVAVO_ART_RUNTIME_ROOT=<runtime-root>
EVAVO_ART_ALLOW_WRITES=true
```

For each deliberately selected `jobs[].contract.runtimeJob`, an authorised agent uses the actual MCP tools in this order:

```text
submit_art_runtime_jobs
→ get_art_runtime_job or list_art_runtime_jobs
→ read_art_runtime_events when audit or recovery evidence is needed
```

The runtime batch has already used the same canonical compiler as `validate_provider_candidate_request` and `compile_provider_candidate_request`. Those tools remain available for one-off inspection, but repeating them for every compiled batch item is no longer required. Runtime submission remains a separate explicit mutation of the durable local runtime only.

## Run the worker separately

The MCP does not pretend to execute queued jobs. Run one of the explicit worker commands in the Art Studio checkout:

```powershell
pnpm worker:once
pnpm worker:until-idle
pnpm dev:worker
```

Provider credentials and adapter configuration remain outside generated route documents, request batches, runtime batches, evidence and logs. The worker registers only adapters that are actually configured.

After execution, inspect the runtime job again. A successful provider handler automatically stores:

- immutable candidate image artifacts labelled `approvalState=unapproved`;
- one immutable provider evidence artifact containing the normalized request, prompt hash, routing inspection, exact references, attempts, adapter/model evidence and candidate artifact IDs.

Use `inspect_artifact_record` to hash-verify those records. No separate fabricated evidence-bundle tool is required.

## Candidate completion

Provider candidates are intermediate. Before they can advance, they still require:

```text
provider-canvas restoration or deterministic mastering where applicable
→ alpha, crop, halo, silhouette and actual-runtime-scale checks
→ candidate comparison against source, work order and approved style bank
→ Brass static or animation evaluation
→ native Godot Test Lab evidence
→ named creative, historical and provenance approvals
→ browser evidence where applicable
→ sealed Development Studio publication
```

A failed or blocked candidate does not stop unrelated admitted items.

## Permanent regression

```powershell
node scripts/check-raw-art-provider-requests.mjs
pnpm --filter @evavo/art-providers build
node scripts/check-raw-art-provider-runtime-batch.mjs
node scripts/check-raw-art-production-orchestrator.mjs
```

The regressions prove:

- campaign-v3 nextBatch and technical admission gating;
- exact campaign item identity and stage handling;
- create-only template, finalization, request-batch and runtime-batch output;
- finalized artifact-binding and provider-runtime self-hashes;
- canonical provider prompt and runtime-job parity across package, REST, CLI and MCP surfaces;
- stale campaign, request-batch and metadata bindings fail closed;
- an excessive provider batch cannot outrun campaign authority;
- approved style artifacts, base images, masks and continuity evidence are enforced;
- small RAW_ART source canvases do not incorrectly become provider output-size constraints;
- one incomplete provider contract does not block unrelated ready jobs;
- provider execution, runtime submission, approval, mutation and publication remain false in all planning artifacts.

## Non-negotiable boundaries

- RAW_ART source bytes are never overwritten or deleted.
- A filename is not a creative brief, identity, historical source or style authority.
- Only technically admitted and explicitly approved style references may influence provider requests.
- A queue decision cannot bypass campaign v3 or current nextBatch authority.
- A provider runtime batch is a create-only job plan, not permission to submit or execute jobs.
- Provider output is an immutable unapproved candidate, not final art.
- Provider execution, runtime submission, creative approval, historical approval, provenance approval, native acceptance, browser acceptance and publication remain separate authorities.
- No provider request or runtime batch may publish to the game checkout.
- Only independently accepted candidates may enter Development Studio's sealed non-forced publication flow.
