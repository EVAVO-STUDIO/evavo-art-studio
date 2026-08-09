# Governed ComfyUI provider adapter

EVAVO Art Studio can use a local or explicitly authorised remote ComfyUI instance as a provider without turning ComfyUI into an arbitrary workflow or filesystem bridge.

The adapter consumes only repository-compiled workflow profiles. It does not accept arbitrary workflow JSON from a chat, runtime payload, provider request, API caller or worker command.

## Why this boundary exists

ComfyUI is useful for local and offline generation, editing, inpainting, ControlNet-style structural guidance, identity and style references, animation-frame extension and other model workflows. Those capabilities are powerful enough that a loose prompt-to-graph bridge would be unsafe and difficult to reproduce.

Art Studio therefore separates:

```text
reviewed API-format workflow draft
→ exact catalog compilation
→ exact profile adapter registration
→ ordinary provider request selection
→ fresh durable admission
→ fresh execution authorisation
→ dedicated authorised worker
→ immutable unapproved candidates and evidence
→ exact visual review and repair planning
```

A credential, local GPU, running ComfyUI process or catalog file is not provider-execution authority by itself.

## Catalog contracts

A human-reviewed source document uses:

```text
evavo.comfyui-workflow-catalog-draft.v1
```

The compiler writes:

```text
evavo.comfyui-workflow-catalog.v1
```

Every profile contains:

- one stable profile ID and adapter ID `comfyui:<profileId>`;
- one API-format workflow;
- an exact workflow SHA-256;
- the exact node ID and class-type inventory plus its SHA-256;
- an exact model inventory with content SHA-256 values;
- an exact ComfyUI and custom-node runtime inventory;
- explicit allowed provider operations, asset kinds and continuity phases;
- explicit provider capabilities;
- exact mutable input bindings;
- exact output node IDs;
- bounded candidate, reference and source-byte limits;
- a profile self-hash;
- a catalog self-hash.

The compiled catalog is deterministic and tamper evident. A changed workflow, binding, model, runtime component, node inventory, limit or profile field invalidates its hashes.

## Compile a catalog

Build the provider package, then compile create-only:

```powershell
Set-Location C:\GitRepos\evavo-art-studio
pnpm install --frozen-lockfile
pnpm --filter @evavo/art-providers build

pnpm run provider:comfyui:catalog:compile -- `
  --input C:\EVAVO\comfyui\catalog.draft.json `
  --output C:\EVAVO\comfyui\catalog.json
```

The output path must not already exist. The command never calls ComfyUI, submits a runtime job, approves a candidate, mutates another repository or publishes artwork.

A minimal profile resembles:

```json
{
  "schemaVersion": "evavo.comfyui-workflow-catalog-draft.v1",
  "catalogId": "evavo-game-art-local",
  "catalogVersion": "1.0.0",
  "profiles": [
    {
      "profileId": "sprite-match",
      "label": "Sprite match and frame extension",
      "description": "Reviewed local workflow for matching transparent sprite frames.",
      "version": "1.0.0",
      "priority": 120,
      "operations": ["generate", "edit", "inpaint"],
      "assetKinds": ["sprite-frame", "sprite-layer"],
      "continuityPhases": ["identity-master", "key-pose", "in-between", "repair"],
      "capabilities": [
        "generate",
        "edit",
        "inpaint",
        "reference-images",
        "multiple-reference-images",
        "identity-reference",
        "temporal-reference",
        "mask",
        "seed",
        "custom-size",
        "candidate-count",
        "cancellation"
      ],
      "modelId": "evavo-sprite-checkpoint-v1",
      "workflow": {
        "1": {
          "class_type": "CLIPTextEncode",
          "inputs": { "text": "replace me" }
        }
      },
      "bindings": {
        "positivePrompt": { "nodeId": "1", "input": "text" },
        "referenceImages": []
      },
      "outputNodeIds": ["99"],
      "modelInventory": [
        {
          "id": "evavo-sprite-checkpoint-v1",
          "kind": "checkpoint",
          "sha256": "<exact model sha256>"
        }
      ],
      "runtimeInventory": [
        {
          "id": "comfyui",
          "version": "<pinned version>",
          "sha256": "<exact source or package sha256>"
        }
      ],
      "limits": {
        "maximumCandidates": 4,
        "maximumReferenceImages": 8,
        "maximumSourceBytes": 67108864
      }
    }
  ]
}
```

The example is structural. A real profile must contain the complete exported API workflow and every declared binding must refer to a real existing node input. Mutable bindings cannot reuse the same node input.

## Supported binding roles

A profile may bind:

- positive and negative prompts;
- width and height;
- seed;
- candidate count;
- output filename prefix;
- canonical identity;
- direction master;
- previous and next key poses;
- base image and inpaint mask;
- pose, edge and depth controls;
- palette, line, material and layer-context references;
- per-reference strength where the workflow exposes it.

This allows formal matching-image, matching-frame and matching animation frames workflows without pretending that every ComfyUI graph supports every role. Each profile advertises only the operations and capabilities it actually implements. Capabilities from separate profiles are never unioned into one fictional adapter.

## Worker configuration

```powershell
$env:EVAVO_ART_COMFYUI_CATALOG = "C:\EVAVO\comfyui\catalog.json"
$env:EVAVO_ART_COMFYUI_CATALOG_ROOT = "C:\EVAVO\comfyui"
$env:EVAVO_ART_COMFYUI_BASE_URL = "http://127.0.0.1:8188"
$env:EVAVO_ART_COMFYUI_DEDICATED_INSTANCE = "true"
$env:EVAVO_ART_COMFYUI_ALLOW_REMOTE = "false"
$env:EVAVO_ART_COMFYUI_POLL_INTERVAL_MS = "500"
$env:EVAVO_ART_COMFYUI_EXECUTION_TIMEOUT_MS = "1800000"
$env:EVAVO_ART_COMFYUI_MAX_JSON_BYTES = "4194304"
$env:EVAVO_ART_COMFYUI_MAX_OUTPUT_BYTES = "134217728"
$env:EVAVO_ART_COMFYUI_MAX_UPLOAD_BYTES = "67108864"
```

An optional API token belongs only in the worker environment:

```powershell
$env:EVAVO_ART_COMFYUI_API_TOKEN = "..."
```

It is never placed in provider evidence, candidate metadata, runtime payloads or logs returned as successful tool output.

## Endpoint policy

Loopback HTTP is allowed by default:

```text
http://127.0.0.1:8188
http://localhost:8188
```

A non-loopback endpoint is rejected unless:

```text
EVAVO_ART_COMFYUI_ALLOW_REMOTE=true
```

Remote endpoints must use HTTPS. URLs containing embedded credentials, query strings or fragments are rejected. Redirect following is disabled.

## Dedicated-instance requirement

A dedicated instance is mandatory for this adapter. ComfyUI cancellation uses the instance-wide interrupt endpoint. Art Studio therefore requires:

```text
EVAVO_ART_COMFYUI_DEDICATED_INSTANCE=true
```

This value is an explicit operator assertion that the target instance is reserved for the authorised EVAVO worker scope. Shared instances are not accepted because cancelling one authorised request could otherwise interrupt unrelated work.

## Execution sequence

For every selected profile, the adapter:

1. Revalidates the complete self-hashed catalog and profile.
2. Confirms the request operation, asset kind, continuity phase, candidate count, source canvas, seed and references fit that profile.
3. Queries `object_info` and proves every required workflow class exists.
4. Hashes the live definitions for only the required class types.
5. Re-verifies each immutable reference descriptor, byte count, content SHA-256 and raster signature.
6. Uploads exact reference bytes through `upload/image`.
7. Reads the uploaded `input` object back through `view` and proves its byte length and SHA-256 still match the immutable reference.
8. Rejects changed upload names, bytes, storage types or subfolders.
9. Clones the reviewed workflow and mutates only declared bindings.
10. Records the effective workflow SHA-256 and prompt submission SHA-256.
11. Submits through `prompt`.
12. Polls `history/{prompt_id}` within the configured timeout.
13. Accepts outputs only from declared output nodes.
14. Rejects duplicate output locations, path traversal, unsafe filenames, unexpected storage types and output-count mismatch.
15. Downloads each output through `view` with bounded bytes and no redirects.
16. Verifies output magic bytes match the requested PNG, WebP or JPEG format.
17. Returns unapproved provider outputs with exact evidence.
18. Calls `interrupt` on cancellation or a post-submission transient timeout.

No raw workflow graph, raw ComfyUI history, API token or arbitrary local file is returned through provider metadata.

## Provenance evidence

The adapter records `evavo.comfyui-provider-evidence.v1`, including:

- catalog, profile and source workflow identities;
- effective workflow and prompt submission hashes;
- node, model and runtime inventory hashes;
- required live runtime class types and their definition hash;
- request and compiled-prompt hashes;
- exact uploaded reference artifact IDs and content hashes;
- prompt ID;
- output node and output content hashes;
- bounded byte usage;
- local or remote endpoint classification;
- explicit false approval, promotion, repository mutation and publication authority.

The normal provider orchestrator then stores the images as immutable `intermediate` artifacts with `approvalState: unapproved` and retains the provider evidence artifact.

ComfyUI also writes uploaded inputs and rendered outputs into the configured instance storage. The adapter therefore reports `retainedByProvider: true`; local operation does not imply automatic deletion. Use an operator-owned retention or cleanup policy for that dedicated instance after EVAVO artifact storage has captured the required evidence.

## RAW_ART authority

A catalog and running instance do not allow ordinary workers to execute selected RAW_ART jobs.

The existing sequence remains mandatory:

```text
compile exact provider request
→ select exact work order
→ fresh durable admission
→ fresh execution authorisation naming comfyui:<profileId>
→ dedicated authorised worker
→ immutable unapproved candidates
→ exact candidate review and repair plan
→ fresh admission and fresh authorisation for any iteration
```

An authorisation adapter allowlist can name one or more exact profile adapters:

```powershell
--allowed-adapters comfyui:sprite-match
```

The worker filters the provider registry to that exact allowlist before routing. A request cannot borrow capabilities from an unapproved profile.

## Retained authority boundaries

This adapter may perform only the provider effects already authorised for one exact job:

```text
read exact catalog and immutable references
query bounded ComfyUI runtime metadata
upload exact reference bytes
submit one reviewed workflow profile
poll and cancel that execution
write unapproved candidate and evidence artifacts
complete the authorised runtime job
```

It may not:

```text
accept arbitrary workflow JSON
run shell commands
choose arbitrary executables
scan arbitrary local directories
submit additional runtime jobs
redrive jobs
approve or promote candidates
update named artifact references
mutate source art
mutate target repositories
commit or push Git history
deploy
publish
force push
```

## Validation

```powershell
pnpm run provider:comfyui:check
pnpm check
```

CI is fixture-only. It uses a bounded mock ComfyUI transport and makes no live GPU or paid provider request.

The permanent suite covers:

- canonical catalog and profile hashes;
- exact workflow, node, model and runtime inventories;
- duplicate mutable-binding rejection;
- profile-specific capability isolation;
- exact prompt, size, seed, count and filename bindings;
- exact immutable image upload and reference-strength binding;
- exact uploaded-input readback and SHA-256 verification;
- runtime `object_info` preflight;
- missing-node rejection;
- changed reference-byte rejection;
- changed upload-identity rejection;
- duplicate output-location rejection;
- path traversal rejection;
- output format and count enforcement;
- bounded JSON, upload and output bytes;
- loopback default, remote opt-in and HTTPS enforcement;
- strict boolean environment parsing;
- dedicated-instance cancellation and interrupt evidence;
- allowed-root and symbolic-link confinement;
- create-only catalog publication;
- retained false approval, promotion, repository mutation and publication authority.
