# Governed provider candidates

## Purpose

EVAVO Art Studio does not ask an image provider to produce a final sprite, sheet, cinematic frame, interface or print master. A provider receives one bounded candidate contract and returns intermediate material. Art Studio retains authority over identity, continuity, layer boundaries, transparency extraction, mastering, quality evidence, approval and engine packaging.

The provider layer exists to make external and local image systems interchangeable without allowing a model, vendor or endpoint to redefine the art-production process.

## Trust boundary

```text
brief and repository evidence
          |
continuity and shot compiler
          |
provider candidate request
          |
capability-matched worker adapter
          |
unapproved immutable candidate artifacts
          |
selection, repair and deterministic mastering
          |
blocking alpha, identity, consistency and delivery QA
          |
approved master and engine derivatives
```

The web application, standalone REST API, CLI and MCP server may validate and compile a provider request. They do not execute the provider call. Execution occurs only inside a durable capability worker with worker-side credentials, cancellation, timeout, immutable input references and an artifact store.

## Non-final-output rule

Every provider candidate is stored with these properties:

- storage class `intermediate`;
- `approvalState=unapproved`;
- `finalDeliverable=false`;
- `requiresMastering=true`;
- `requiresBlockingQa=true`;
- source-artifact lineage;
- provider adapter and model identifiers;
- request and compiled-prompt SHA-256 hashes;
- candidate-family, frame and layer identifiers;
- a separate immutable evidence artifact.

No adapter can write directly to an approved reference, final-delivery folder or Godot resource. A successful provider response means only that candidate material was produced and recorded.

## Request lifecycle

### 1. Normalize the work item

The request declares one operation:

- `generate` for a new bounded candidate;
- `edit` for a controlled revision using one or more approved image references;
- `inpaint` for a masked local repair over an approved base image.

It also declares one asset kind, one continuity phase, the target canvas, candidate count, shot contents, excluded contents, elements that must remain separate, and the art-direction envelope.

### 2. Resolve immutable references

Every image reference is an artifact ID, not an arbitrary local path or browser upload URL. Before a provider call, the worker:

1. resolves the artifact descriptor;
2. verifies the descriptor hash;
3. verifies the content hash;
4. checks the media type;
5. enforces per-reference and total byte limits;
6. reads the verified bytes;
7. records the content hash and role in provider evidence.

A missing required reference blocks the request. An optional reference may be omitted only when it was explicitly declared optional.

### 3. Compile a deterministic art contract

The compiler produces a stable text contract in a fixed section order:

- output status;
- work item;
- continuity contract;
- style envelope;
- shot contract;
- reference contract;
- target contract;
- alpha or matte contract;
- final candidate self-check.

This is not a loose prompt. It states what the provider may change, what it must preserve, what belongs in the shot, what must remain separate, how the canvas is framed, and why the result remains intermediate.

### 4. Select a compatible adapter

The registry rejects adapters before execution when they lack a required capability. Capabilities include:

- generation, editing or inpainting;
- image references and multiple image references;
- masks;
- deterministic seeds;
- native alpha;
- custom source dimensions;
- candidate count;
- cancellation.

The request may allow-list adapters, prefer one adapter or model, require seed support, and decide whether fallback is allowed. A provider is never selected merely because it is available.

### 5. Execute with cancellation and bounded I/O

The durable worker owns:

- API credentials;
- request cancellation;
- lease heartbeats;
- execution timeout;
- response-size limits;
- model allow-lists;
- provider failure classification;
- immutable attempt evidence.

The worker does not expose provider credentials to the job payload, artifact descriptor, REST response, MCP tool result or browser.

### 6. Store candidates and evidence

Each candidate is stored separately. The evidence artifact records:

- normalized request;
- request hash;
- complete compiled contract and hash;
- verified reference roles and content hashes;
- selected adapter descriptor and model;
- every attempted adapter;
- provider request identifier when supplied;
- failure classification and fallback decisions;
- candidate artifact IDs;
- whether deterministic alpha extraction is still required.

Failure evidence is retained even when no candidate succeeds.

## Continuity phases

### Identity master

An identity-master request establishes the canonical design used by every later direction, pose, layer and repair. It should resolve face construction, body proportions, silhouette language, costume construction, equipment scale, handedness, palette and line treatment deliberately.

It does not require an earlier canonical-identity reference because it is creating that authority. The resulting candidate still needs review and approval before becoming the canonical master.

### Direction master

A direction master must include the approved `canonical-identity` reference. It changes view or staging without changing the design.

### Key pose

A key-pose request must include the approved `canonical-identity` reference and should include the matching `direction-master` when one exists. It authors a motion extreme, contact pose or storytelling pose while preserving identity and projection.

### In-between

An in-between request must include:

- `canonical-identity`;
- `previous-key-pose`;
- `next-key-pose`.

The provider contract tells the model to interpolate motion between the two approved neighbours rather than inventing an unrelated pose. The canonical identity remains authoritative when neighbours contain minor differences.

### Repair

A repair request may use `edit` or `inpaint`. It is scoped to one defect or region and explicitly prohibits regeneration of unrelated approved content.

### Independent

Independent environments, effects, UI assets, illustrations and print candidates do not require a canonical character reference, but they still obey the project style envelope, shot contract, file target and evidence rules.

## Reference roles

| Role | Purpose |
|---|---|
| `canonical-identity` | Authoritative face, body, costume, equipment and silhouette identity. |
| `direction-master` | Approved identity in the requested view or projection. |
| `previous-key-pose` | Approved motion state immediately before an in-between frame. |
| `next-key-pose` | Approved motion state immediately after an in-between frame. |
| `base-image` | Approved image being edited or repaired. |
| `mask` | Exactly one local edit mask for an inpaint request. |
| `pose-control` | Skeleton, pose map or structural guide. |
| `edge-control` | Edge, line or contour structure. |
| `depth-control` | Depth structure. |
| `palette-reference` | Approved project colour system. |
| `line-reference` | Approved pixel, engraving or line-treatment system. |
| `material-reference` | Approved cloth, metal, wood, skin or surface treatment. |
| `layer-context` | Registered sibling layer needed for alignment or occlusion context. |

Reference roles remain separate in the compiled contract. The provider is instructed not to average identity, pose, palette and materials into a generic blend.

## What belongs in one candidate image

A candidate includes only the content declared by the shot contract:

- the complete requested subject or effect;
- persistent identity, costume and material detail;
- the declared pose, direction and action;
- declared equipment that is baked into the frame;
- enough safe margin for the complete motion or effect extent.

It excludes:

- scenery when the subject is intended to be transparent;
- UI, labels or text unless the asset itself is UI;
- extra characters, props or particles;
- collision, normal, emission or guide data baked into colour art;
- anything listed under `separateAssets`;
- checkerboards or other fake transparency;
- contact sheets, sprite sheets, comparison grids and multiple panels.

The `separateAssets` list is authoritative. Common examples are cast shadows, held weapons, action effects, interchangeable equipment, collision sidecars, normal maps and emission maps.

## GPT Image 2 adapter

The first remote adapter uses the OpenAI Image API directly through bounded server-side `fetch` calls. As of 29 July 2026, official OpenAI documentation states that GPT Image 2 supports generation, editing, multiple image inputs and mask editing; image inputs use high fidelity automatically. Its flexible image sizes must use multiples of 16, stay within 3840 pixels per edge and a 3:1 aspect ratio, and contain 655,360 to 8,294,400 pixels. GPT Image 2 does not currently support transparent backgrounds.

Sources:

- <https://platform.openai.com/docs/guides/image-generation>
- <https://platform.openai.com/docs/models/gpt-image-2>
- <https://platform.openai.com/docs/models/default-usage-policies-by-endpoint>
- <https://openai.com/business-data/>

### Source-size handling

Art Studio keeps final game dimensions independent from provider source dimensions. A 128 × 128 sprite may use a 1024 × 1024 provider source canvas, then pass through deterministic reduction, pixel cleanup and QA. The OpenAI adapter validates explicitly supplied source dimensions or derives a compatible source canvas that preserves the target aspect ratio.

### Multiple references

Generation without references uses `/v1/images/generations`. Any edit, inpaint or reference-conditioned request uses `/v1/images/edits` with ordered `image[]` parts. A mask is sent separately as `mask`.

The adapter deliberately omits an `input_fidelity` override because GPT Image 2 currently processes image inputs with high fidelity automatically.

### Transparency

Because GPT Image 2 does not currently provide native transparent output, `native-alpha` requests are incompatible with this adapter. For transparency-required sprites, the recommended intermediate strategy is:

1. render against one declared flat chroma matte, commonly green or magenta;
2. prohibit gradients, texture, matte-coloured rim light and cast shadows on the matte;
3. extract alpha deterministically in a media worker;
4. decontaminate edge colour;
5. retain subject-coloured transparent edge bleed where appropriate;
6. run the executable frame QA over checker, black, white, grey, green and magenta proofs;
7. accept the cleaned transparent master only after blocking gates pass.

The chroma image is never the final transparent asset.

### Data policy

OpenAI states that API inputs and outputs are not used to train its models by default unless an organisation explicitly opts in. Abuse-monitoring retention, Zero Data Retention eligibility and regional controls depend on the endpoint, model and organisation configuration. Art Studio therefore records the adapter as remote and provider-retention-dependent rather than claiming a universal zero-retention guarantee.

## Failure and fallback policy

Failures are classified as:

- `transient` for rate limits, temporary service failures and retryable network problems;
- `incompatible` when the adapter cannot satisfy the declared contract;
- `permanent` for malformed requests, invalid output contracts and non-retryable failures;
- `cancelled` when the runtime or worker aborts the job.

Fallback occurs only when all of these are true:

1. `selection.allowFallback` is true;
2. another eligible adapter exists;
3. the failure is transient or incompatible.

Permanent and cancelled failures do not silently move to another provider. Every attempted adapter remains in evidence.

## Interfaces

### CLI

```powershell
pnpm art -- provider-protocol

pnpm art -- provider-validate `
  --input .\examples\provider-candidate-request.json `
  --output .\provider-request.normalized.json

pnpm art -- provider-compile `
  --input .\examples\provider-candidate-request.json `
  --output .\provider-request.compiled.json
```

These commands never execute a provider.

Submit a durable provider job:

```powershell
pnpm art -- runtime-submit `
  --input .\examples\runtime-provider-job.json `
  --runtime-root .\.art-studio\runtime `
  --actor greg

pnpm worker:until-idle
```

### REST

```text
GET  /v1/provider-protocol
POST /v1/providers/validate
POST /v1/providers/compile
```

The REST routes are deterministic control-plane operations. They do not execute adapters.

### MCP

```text
provider_candidate_protocol
validate_provider_candidate_request
compile_provider_candidate_request
submit_art_runtime_jobs
```

The compile tool returns a ready-to-submit durable runtime job. Provider execution still occurs only after submission to a compatible worker.

## Worker configuration

```text
OPENAI_API_KEY=<server-only key>
EVAVO_ART_OPENAI_IMAGE_MODEL=gpt-image-2
EVAVO_ART_OPENAI_IMAGE_MODELS=gpt-image-2,gpt-image-2-2026-04-21
EVAVO_ART_OPENAI_BASE_URL=https://api.openai.com/v1
EVAVO_ART_PROVIDER_MAX_RESPONSE_BYTES=134217728
EVAVO_ART_WORKER_QUEUES=
```

Leaving `EVAVO_ART_WORKER_QUEUES` empty allows the worker to add the provider queue automatically when a real adapter exists. Provider credentials must never be copied into the web environment unless the web and worker are the same trusted local process, which is not the recommended production topology.

The fixture provider is available only for deterministic tests:

```text
EVAVO_ART_ENABLE_FIXTURE_PROVIDER=true
```

It must remain false in normal operation.

## Current deliberate limitations

This slice produces governed candidate artifacts. It does not yet:

- remove a chroma matte or create the transparent master;
- automatically compare identity, anatomy, costume and silhouette with OpenCV or ONNX;
- select the winning candidate;
- repair a failed candidate automatically;
- author an editable Aseprite or OpenRaster source package;
- approve a candidate or update an approved artifact reference;
- implement Replicate, ComfyUI or other provider adapters;
- provide a browser candidate-comparison workbench.

Those stages remain separate so generation cannot bypass mastering, measured consistency evidence or approval policy.
