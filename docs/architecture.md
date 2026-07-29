# EVAVO Art Studio architecture

## Product boundary

EVAVO Art Studio is not a single image generator and it is not a prompt wrapper. It is a governed production system that can inspect a project, define an art direction, calculate the required asset inventory, produce and revise candidates through bounded provider capabilities, master animation and atlases, prove quality, and export engine-ready or print-ready deliverables.

The system has four independent control surfaces over one domain engine:

1. **Web control plane** for the EVAVO hub, project views, work-order review, QA evidence and export retrieval.
2. **REST API** for automation, integrations and remote control processes.
3. **CLI** for local repositories, CI, batch production and recovery.
4. **MCP server** for ChatGPT, Claude and other tool-capable agents using the same contracts and permissions.

No surface is allowed to bypass the domain contracts, work-order graph, provider request compiler, policy checks, runtime state machine or evidence bundle. Provider execution is a worker capability, not a browser, REST, CLI or MCP shortcut.

## Runtime topology

```text
EVAVO hub / CLI / MCP / REST
            |
     signed control plane
            |
 work-order + provider-contract compiler
            |
       RuntimeRepository
       /               \
local immutable       pg-boss delivery
transaction journal   over PostgreSQL
       |                 |
       +------ job ID ---+
                 |
       capability-matched workers
       |        |        |        |
     media    vision   provider  engine
       |        |        |        |
     Sharp    OpenCV   adapter    Godot
     FFmpeg   ONNX     registry   exports
                 |
 content-addressed artifact store
       + immutable evidence
```

The local transaction journal is operational now. It gives Windows and offline workers crash recovery without requiring PostgreSQL. The pg-boss adapter is operational as a delivery interface but still requires a deployment-specific PostgreSQL integration test. Delivery messages never replace authoritative job attempts or artifact hashes.

The web app is a control plane. Heavy image decoding, animation encoding, provider execution, vision analysis and native engine work belong in authenticated workers because serverless web runtimes are not a reliable place for long CPU/GPU jobs, large temporary files, provider credentials or local repository access.

## Monorepo boundaries

- `apps/web`: Next.js hub application, production-plan compiler and browser QA workbenches.
- `apps/api`: versioned REST API and OpenAPI 3.1 contract.
- `apps/cli`: local and CI entry point.
- `apps/mcp`: local stdio MCP server.
- `apps/worker`: capability-scoped durable worker host.
- `packages/contracts`: portable JSON-compatible production contracts and validation.
- `packages/core`: work-order compiler, policy engine and deterministic planning.
- `packages/repo-inspector`: safe repository inventory and project inference.
- `packages/providers`: provider-neutral request validation, deterministic prompt compilation, adapter registry, bounded execution and immutable candidate evidence.
- `packages/quality`: decoded-pixel and sequence QA gates.
- `packages/media`: deterministic raster and atlas production.
- `packages/godot`: Godot 4.6.2 descriptors, importer source and optional local finalisation.
- `packages/artifacts`: immutable objects, descriptors, lineage, verification and approved references.
- `packages/runtime`: job state machine, immutable journal, workers and delivery adapter.

The implemented foundation now reaches deterministic planning, continuity contracts, governed provider candidates, decoded-pixel QA, browser inspection, atlas and Godot source delivery, immutable artifacts, local durable execution and agent-facing runtime controls.

## Production lifecycle

Every requested asset moves through explicit stages rather than being accepted directly from a model:

1. Inspect project and existing asset language.
2. Lock art direction, references, exclusions, palette, composition and target constraints.
3. Compile the complete asset inventory and dependency graph.
4. Compile one bounded provider candidate request or construct from existing masters.
5. Resolve and verify canonical, direction, neighbouring-pose, mask and other role-specific artifacts.
6. Select a capability-compatible provider adapter and record every attempt.
7. Store provider outputs only as unapproved intermediate artifacts.
8. Select by policy using reference, silhouette, composition and artifact evidence.
9. Clean anatomy, linework, typography, edges, transparency and colour.
10. Enforce family and frame consistency.
11. Build animation timing, sheets, atlases, particle profiles and cinematics.
12. Create lossless masters before runtime or print derivatives.
13. Run blocking QA gates.
14. Store immutable outputs and evidence.
15. Package engine resources, metadata and approved references.

A fully automatic run uses the same gates as a reviewed run. Automation changes who approves a gate; it does not remove the gate.

## Provider neutrality

Generation, editing and inpainting are now implemented as provider-neutral candidate operations. Background removal, upscaling, interpolation and model-assisted vision remain future adapter families. A request declares what it needs, not which vendor must perform it. The registry selects only adapters that support the declared:

- operation;
- single or multiple role-specific image references;
- mask requirements;
- deterministic seed policy;
- native-alpha or chroma-key strategy;
- custom source dimensions;
- candidate count;
- cancellation;
- model and adapter allow-lists.

The provider request compiler locks:

- continuity phase;
- canonical identity and direction inheritance;
- neighbouring key poses for in-between frames;
- the exact shot contents;
- elements that must remain separate;
- art direction, palette, line, material, camera and era rules;
- target and source canvases;
- background and alpha strategy;
- final candidate self-checks.

Provider output is always an intermediate candidate until deterministic mastering and QA complete. Each candidate carries source-artifact lineage, provider/model identifiers, request and prompt hashes, approval state, attempt evidence and a requirement for later mastering and blocking QA.

The first remote adapter is OpenAI GPT Image 2. It uses generation for independent requests and ordered image references or masks for edits. Because GPT Image 2 currently lacks transparent-background output, transparency-required work uses an explicit flat chroma matte and remains blocked until deterministic extraction and hostile-matte QA pass. The local fixture adapter exists only for deterministic tests and is disabled by default.

Provider credentials belong only on authenticated provider workers. CLI, REST and MCP can validate and compile requests, but they cannot execute adapters directly.

## Durable execution

The runtime interface enforces:

- queue-scoped idempotency keys and specification hashes;
- atomic batch submission and cycle rejection;
- dependency waiting, unblocking and failure propagation;
- capability and queue matching;
- random lease tokens and heartbeat renewal;
- execution deadlines and timeouts;
- bounded deterministic retries with explicit classification;
- cooperative or forced cancellation and pause;
- immutable attempts and runtime events;
- dead-letter review and bounded redrive;
- recovery from stale locks, corrupt head pointers and expired leases.

Provider jobs use distinct kinds:

```text
art.candidate.generate
art.candidate.edit
art.candidate.inpaint
```

A provider worker advertises only the capabilities actually present in its configured adapters. The `provider` queue is added automatically only when at least one adapter is available. Unknown provider errors are permanent unless an adapter deliberately classifies them as transient or incompatible. Fallback is permitted only when the request explicitly allows it.

The local implementation serialises each mutation into an immutable transaction containing the complete snapshot, previous sequence, event records and state SHA-256. `head.json` is only an optimisation and can be reconstructed.

`PgBossRuntimeDelivery` creates prefixed strict-FIFO queues with heartbeat and dead-letter settings. It transports job references; it is not the source of truth for art approval or artifact lineage.

## Artifact and evidence contract

Every deliverable or provider candidate receives:

- SHA-256 content hash;
- immutable descriptor hash;
- source and reference artifact IDs;
- work-order, job and attempt identifiers;
- provider, model and adapter-version identifiers when applicable;
- deterministic provider request and compiled-prompt hashes;
- prompts, masks, seeds and parameters;
- deterministic tool versions and command arguments;
- dimensions, format, colour space, density and alpha readings;
- QA gate results and comparison evidence;
- license and usage notes;
- canonical name, folder and engine mapping.

Objects are stored by content hash. Descriptors can give the same bytes different governed production roles without duplicating the object. Named approved references use compare-and-swap generations and retain the previous artifact ID.

Provider candidate artifacts use storage class `intermediate`, carry `approvalState=unapproved`, and cannot become approved merely because the adapter succeeded. A separate evidence artifact records all references, attempts, fallback decisions, candidate IDs and failure evidence.

Generated binaries do not live in Git by default. Git stores briefs, plans, manifests, approved small assets and reproducibility records. Large masters and intermediates use the local content-addressed store; an S3-compatible adapter remains a deployment slice.

## Security boundary

- The hub launch remains a separate signed, short-lived handoff.
- Repository and worker file access is restricted to configured roots.
- API runtime and artifact reads are privileged because payloads may contain private paths.
- REST operational access requires the explicit write switch and a server-only token of at least 32 bytes.
- Provider validation and compilation REST routes are deterministic and use no provider credential.
- MCP operational tools require the explicit local write switch.
- Provider compilation tools return a durable job contract rather than executing a model.
- Workers receive scoped jobs and artifact access, never the complete owner secret set.
- Provider keys remain worker-side and are never stored in briefs, job payloads, evidence or artifact metadata.
- Provider reference and response sizes are bounded before data is retained.
- Uploaded files are decoded with strict size, pixel-count, frame-count and format limits.
- Active job transitions require a valid lease token.
- Untrusted schemas, commands and output paths are never executed directly.
- Hosted API and MCP surfaces do not run providers, Godot or arbitrary binaries.
- Every external mutation records an actor label and immutable event evidence; signed actor identity remains part of the hub-launch slice.
