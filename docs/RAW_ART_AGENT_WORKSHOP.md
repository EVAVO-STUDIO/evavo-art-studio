# RAW_ART agent workshop

This workflow gives ChatGPT, Claude and other authorised agents a governed path from a reviewed `provider-required` RAW_ART item to an immutable provider candidate job.

It does not make RAW_ART mutable and it does not turn generated candidates into approved game art.

## Complete operating chain

```text
complete RAW_ART inventory
→ role-bound Art Studio review
→ complete technical admission
→ reviewed queue decision
→ technically gated approved style bank
→ immutable Art Studio artifacts
→ provider request batch
→ provider request validation and deterministic prompt compilation
→ explicit durable runtime submission
→ immutable unapproved candidates
→ deterministic candidate evaluation
→ Godot Game Test Lab
→ named creative, historical and provenance approvals
→ browser and native composition evidence
→ Development Studio sealed publication
```

## Game-owned role map

Brass & Brine owns the provider mapping in:

```text
config/art/brass_raw_art_provider_role_map.v1.json
```

It maps dialogue portraits, standing characters, crew, ships, documents, icons, weather, maps, locations, ship scenes and combat effects to the correct provider asset kind, alpha target, background strategy, continuity phase, candidate count and quality.

The provider compiler rejects an unmapped role. Art Studio must not guess a generic canvas or transparency policy.

## Create the artifact-binding template

Build the complete technical queue and approved style bank first. Then run:

```powershell
node scripts/compile-raw-art-provider-requests.mjs template `
  --queue <raw-art-production-queue.json> `
  --bridge <Brass_Brine/config/art/brass_art_studio_bridge.v1.json> `
  --provider-map <Brass_Brine/config/art/brass_raw_art_provider_role_map.v1.json> `
  --direction <Brass_Brine/config/art/brass_art_direction_animation.v1.json> `
  --style-bank <approved-style-bank.json> `
  --game-head <exact-40-character-Brass-main-sha> `
  --output <create-only-artifact-bindings-template.json>
```

The template lists every `provider-required` queue entry and the exact evidence still needed. Typical requirements include:

- an immutable base-image artifact for edit and inpaint work;
- one explicit reviewed mask for inpainting;
- a canonical identity artifact for continuity-locked character or ship repair;
- approved style-reference artifacts drawn from `evavo.image-style-reference-bank.v1`;
- an exact creative intent and shot subject;
- optional key poses, structural controls and adapter restrictions.

The template contains placeholders and cannot be submitted. Materialise the required files into the Art Studio artifact store, replace the placeholders with `artifact_<sha256>` identifiers, change the schema to `evavo.raw-art-provider-artifact-bindings.v1`, set `status` to `ready`, and retain the all-false authority object.

## Compile provider requests

```powershell
node scripts/compile-raw-art-provider-requests.mjs compile `
  --queue <raw-art-production-queue.json> `
  --bridge <Brass_Brine/config/art/brass_art_studio_bridge.v1.json> `
  --provider-map <Brass_Brine/config/art/brass_raw_art_provider_role_map.v1.json> `
  --direction <Brass_Brine/config/art/brass_art_direction_animation.v1.json> `
  --style-bank <approved-style-bank.json> `
  --artifact-bindings <completed-artifact-bindings.json> `
  --maximum-orders 25 `
  --output <create-only-provider-request-batch.json>
```

The compiler independently verifies:

- queue schema and self-hash;
- exact bridge bytes used by the queue;
- the game-owned provider role map;
- the current art-direction contract and all-false authority;
- style-bank self-hash, explicit approval evidence and all-false effects;
- exact queue and style-bank identities in the artifact bindings;
- immutable artifact identifier syntax;
- base-image, mask, identity and key-pose requirements;
- role canvas, alpha, background and provider-operation compatibility;
- stable target paths and bounded batch size.

Evidence-complete entries become `evavo.raw-art-provider-request-batch.v1` requests. Missing evidence is reported per item and does not stop unrelated ready work.

## Agent execution through the existing Art Studio MCP

After the request batch is compiled, start the existing full Art Studio MCP and durable runtime:

```powershell
pnpm run build:domain
pnpm --filter @evavo/art-studio-mcp build
node apps/mcp/dist/index.js
```

Configure explicit roots and write permission only for the evidence, artifact and runtime locations:

```text
EVAVO_ART_ALLOWED_ROOTS=<game-root><path-delimiter><evidence-root><path-delimiter><artifact-root>
EVAVO_ART_ARTIFACT_ROOT=<artifact-root>
EVAVO_ART_RUNTIME_ROOT=<runtime-root>
EVAVO_ART_ALLOW_WRITES=true
```

For each compiled request, an authorised agent uses the existing tools in this order:

```text
validate_provider_candidate_request
compile_provider_candidate_request
submit_art_runtime_jobs
inspect_art_runtime_job
manage_art_runtime_worker
prepare_candidate_evidence_bundle
```

The first two tools validate continuity references, masks, dimensions, alpha targets, adapter capabilities and the deterministic prompt. Runtime submission remains a separate explicit call. Provider output remains an immutable unapproved candidate.

## Permanent regression

```powershell
node scripts/check-raw-art-provider-requests.mjs
node scripts/check-raw-art-production-orchestrator.mjs
```

The regressions prove valid role-aware work compiles, stale queue bindings fail, create-only output cannot be overwritten, approved style artifacts are required, and one incomplete item does not block unrelated ready work.

## Non-negotiable boundaries

- RAW_ART source bytes are never overwritten or deleted.
- A filename is not a creative brief, identity, historical source or style authority.
- Only technically admitted and explicitly approved style references may influence provider requests.
- Provider output is an immutable unapproved candidate, not final art.
- Provider execution, runtime submission, creative approval, historical approval, provenance approval, native acceptance, browser acceptance and publication remain separate authorities.
- No provider request may publish to the game checkout.
- Only independently accepted candidates may enter Development Studio's sealed non-forced publication flow.
