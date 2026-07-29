# EVAVO Art Studio architecture

## Product boundary

EVAVO Art Studio is not a single image generator and it is not a prompt wrapper. It is a governed production system that can inspect a project, define an art direction, calculate the required asset inventory, create and revise assets, master animation and atlases, prove quality, and export engine-ready or print-ready deliverables.

The system has four independent surfaces over one domain engine:

1. **Web control plane** for the EVAVO hub, project views, work-order review, QA evidence and export retrieval.
2. **REST API** for automation, integrations and remote control processes.
3. **CLI** for local repositories, CI, batch production and recovery.
4. **MCP server** for ChatGPT, Claude and other tool-capable agents using the same contracts and permissions.

No surface is allowed to bypass the domain contracts, work-order graph, policy checks, runtime state machine or evidence bundle.

## Runtime topology

```text
EVAVO hub / CLI / MCP / REST
            |
     signed control plane
            |
   work-order compiler + policy engine
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
     Sharp    OpenCV   model     Godot
     FFmpeg   ONNX     adapters  exports
                 |
 content-addressed artifact store
       + immutable evidence
```

The local transaction journal is operational now. It gives Windows and offline workers crash recovery without requiring PostgreSQL. The pg-boss adapter is operational as a delivery interface but still requires a deployment-specific PostgreSQL integration test. Delivery messages never replace authoritative job attempts or artifact hashes.

The web app is a control plane. Heavy image decoding, animation encoding, vision analysis, provider execution and native engine work belong in authenticated workers because serverless web runtimes are not a reliable place for long CPU/GPU jobs, large temporary files or local repository access.

## Monorepo boundaries

- `apps/web`: Next.js hub application, production-plan compiler and browser QA workbenches.
- `apps/api`: versioned REST API and OpenAPI 3.1 contract.
- `apps/cli`: local and CI entry point.
- `apps/mcp`: local stdio MCP server.
- `apps/worker`: capability-scoped durable worker host.
- `packages/contracts`: portable JSON-compatible production contracts and validation.
- `packages/core`: work-order compiler, policy engine and deterministic planning.
- `packages/repo-inspector`: safe repository inventory and project inference.
- `packages/quality`: decoded-pixel and sequence QA gates.
- `packages/media`: deterministic raster and atlas production.
- `packages/godot`: Godot 4.6.2 descriptors, importer source and optional local finalisation.
- `packages/artifacts`: immutable objects, descriptors, lineage, verification and approved references.
- `packages/runtime`: job state machine, immutable journal, workers and delivery adapter.
- `packages/providers`: later generation and editing provider adapters.

The implemented foundation now reaches deterministic planning, continuity contracts, decoded-pixel QA, browser inspection, atlas and Godot source delivery, immutable artifacts, local durable execution and agent-facing runtime controls. It remains provider-neutral.

## Production lifecycle

Every requested asset moves through explicit stages rather than being accepted directly from a model:

1. Inspect project and existing asset language.
2. Lock art direction, references, exclusions, palette, composition and target constraints.
3. Compile the complete asset inventory and dependency graph.
4. Generate multiple candidates or construct from existing masters.
5. Select by policy using reference, silhouette, composition and artifact evidence.
6. Clean anatomy, linework, typography, edges, transparency and colour.
7. Enforce family and frame consistency.
8. Build animation timing, sheets, atlases, particle profiles and cinematics.
9. Create lossless masters before runtime or print derivatives.
10. Run blocking QA gates.
11. Store immutable outputs and evidence.
12. Package engine resources, metadata and approved references.

A fully automatic run uses the same gates as a reviewed run. Automation changes who approves a gate; it does not remove the gate.

## Provider neutrality

Generation, editing, background removal, upscaling, interpolation and model-assisted vision are capability adapters. A work item declares what it needs, not which vendor must perform it. The scheduler selects a compatible provider based on:

- asset type and target style;
- reference-image and mask support;
- deterministic seed support;
- transparent-output reliability;
- maximum dimensions and frame count;
- cost, latency and data policy;
- measured quality history for that task family.

Provider output is always considered an intermediate candidate until deterministic mastering and QA complete. Provider credentials belong only on authenticated provider workers.

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

The local implementation serialises each mutation into an immutable transaction containing the complete snapshot, previous sequence, event records and state SHA-256. `head.json` is only an optimisation and can be reconstructed.

`PgBossRuntimeDelivery` creates prefixed strict-FIFO queues with heartbeat and dead-letter settings. It transports job references; it is not the source of truth for art approval or artifact lineage.

## Artifact and evidence contract

Every deliverable receives:

- SHA-256 content hash;
- immutable descriptor hash;
- source and reference artifact IDs;
- work-order, job and attempt identifiers;
- provider, model and model-version identifiers when applicable;
- prompts, masks, seeds and parameters;
- deterministic tool versions and command arguments;
- dimensions, format, colour space, density and alpha readings;
- QA gate results and comparison evidence;
- license and usage notes;
- canonical name, folder and engine mapping.

Objects are stored by content hash. Descriptors can give the same bytes different governed production roles without duplicating the object. Named approved references use compare-and-swap generations and retain the previous artifact ID.

Generated binaries do not live in Git by default. Git stores briefs, plans, manifests, approved small assets and reproducibility records. Large masters and intermediates use the local content-addressed store; an S3-compatible adapter remains a deployment slice.

## Security boundary

- The hub launch remains a separate signed, short-lived handoff.
- Repository and worker file access is restricted to configured roots.
- API runtime and artifact reads are privileged because payloads may contain private paths.
- REST operational access requires the explicit write switch and a server-only token of at least 32 bytes.
- MCP operational tools require the explicit local write switch.
- Workers receive scoped jobs and artifact access, never the complete owner secret set.
- Provider keys remain worker-side and are rejected from briefs or artifact metadata by policy.
- Uploaded files are decoded with strict size, pixel-count, frame-count and format limits.
- Active job transitions require a valid lease token.
- Untrusted schemas, commands and output paths are never executed directly.
- Hosted API and MCP surfaces do not run Godot or arbitrary binaries.
- Every external mutation records an actor label and immutable event evidence; signed actor identity remains part of the hub-launch slice.
