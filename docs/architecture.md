# EVAVO Art Studio architecture

## Product boundary

EVAVO Art Studio is not a single image generator and it is not a prompt wrapper. It is a governed production system that can inspect a project, define an art direction, calculate the required asset inventory, produce and revise candidates through bounded provider capabilities, master animation and atlases, prove quality, select candidates through evidence and export engine-ready or print-ready deliverables.

The system has four independent control surfaces over one domain engine:

1. **Web control plane** for the EVAVO hub, project views, work-order review, QA evidence and export retrieval.
2. **REST API** for automation, integrations and remote control processes.
3. **CLI** for local repositories, CI, batch production and recovery.
4. **MCP server** for ChatGPT, Claude and other tool-capable agents using the same contracts and permissions.

No surface is allowed to bypass the domain contracts, work-order graph, provider request compiler, selection policy, promotion boundary, runtime state machine or evidence bundle. Provider execution, candidate comparison and reference promotion are worker capabilities, not browser, REST or MCP shortcuts.

## Runtime topology

```text
EVAVO hub / CLI / MCP / REST
            |
     signed control plane
            |
 work-order, provider and selection compilers
            |
       RuntimeRepository
       /               \
local immutable       pg-boss delivery
transaction journal   over PostgreSQL
       |                 |
       +------ job ID ---+
                 |
       capability-matched workers
       |        |         |         |
     media    vision    provider   engine
       |        |         |         |
     Sharp    metrics   adapter     Godot
     FFmpeg   ONNX      registry    exports
       |        |         |
       +--- immutable artifacts ---+
                 |
     selection evidence and promotion
                 |
 compare-and-swap approved reference
```

The local transaction journal is operational now. It gives Windows and offline workers crash recovery without requiring PostgreSQL. The pg-boss adapter is operational as a delivery interface but still requires a deployment-specific PostgreSQL integration test. Delivery messages never replace authoritative job attempts, artifact hashes, selection evidence or the approved named reference.

The web app is a control plane. Heavy image decoding, animation encoding, provider execution, visual comparison, model-assisted evidence and native engine work belong in authenticated workers because serverless web runtimes are not a reliable place for long CPU/GPU jobs, large temporary files, provider credentials or local repository access.

## Monorepo boundaries

- `apps/web`: Next.js hub application, production-plan compiler and browser QA workbenches.
- `apps/api`: versioned REST API and OpenAPI 3.1 contracts.
- `apps/cli`: local and CI entry point.
- `apps/mcp`: local stdio MCP server.
- `apps/worker`: capability-scoped durable worker host.
- `packages/contracts`: portable JSON-compatible production contracts and validation.
- `packages/core`: work-order compiler, policy engine and deterministic planning.
- `packages/repo-inspector`: safe repository inventory and project inference.
- `packages/providers`: provider-neutral request validation, deterministic prompt compilation, adapter registry, bounded execution and immutable candidate evidence.
- `packages/quality`: decoded-pixel and sequence QA gates.
- `packages/media`: deterministic raster, chroma extraction and atlas production.
- `packages/selection`: deterministic visual comparison, bound model-evidence contracts, immutable ranking and compare-and-swap promotion.
- `packages/godot`: Godot 4.6.2 descriptors, importer source and optional local finalisation.
- `packages/artifacts`: immutable objects, descriptors, lineage, verification and approved references.
- `packages/runtime`: job state machine, immutable journal, workers and delivery adapter.

The implemented foundation now reaches deterministic planning, continuity contracts, governed provider candidates, alpha mastering, decoded-pixel QA, deterministic candidate selection, governed promotion, browser inspection, atlas and Godot source delivery, immutable artifacts, local durable execution and agent-facing runtime controls.

## Production lifecycle

Every requested asset moves through explicit stages rather than being accepted directly from a model:

1. Inspect project and existing asset language.
2. Lock art direction, references, exclusions, palette, composition and target constraints.
3. Compile the complete asset inventory and dependency graph.
4. Compile one bounded provider candidate request or construct from existing masters.
5. Resolve and verify canonical, direction, neighbouring-pose, mask and other role-specific artifacts.
6. Select a capability-compatible provider adapter and record every attempt.
7. Store provider outputs only as unapproved intermediate artifacts.
8. Master transparency, edges, dimensions, colour and other deterministic media properties.
9. Run blocking technical QA and retain rejected evidence for diagnosis.
10. Compare every eligible candidate against the immutable reference using deterministic visual evidence.
11. Attach versioned identity, costume, equipment, pose, style or perceptual evidence when policy requires it.
12. Produce an immutable `selected`, `review-required` or `rejected` ranking without mutating an approved reference.
13. Promote only the recommended hard-gate-eligible candidate through automatic or named-human approval and compare-and-swap reference state.
14. Enforce family and frame consistency against the newly approved master.
15. Build animation timing, sheets, atlases, particle profiles and cinematics.
16. Create lossless masters before runtime or print derivatives.
17. Run final delivery gates.
18. Store immutable outputs and evidence.
19. Package engine resources, metadata and release records.

A fully automatic run uses the same gates as a reviewed run. Automation changes who approves a gate; it does not remove the gate. A high score does not itself constitute approval.

## Provider neutrality

Generation, editing and inpainting are implemented as provider-neutral candidate operations. Upscaling, interpolation and additional model-assisted vision remain adapter families. A request declares what it needs, not which vendor must perform it. The registry selects only adapters that support the declared:

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

## Candidate selection

Selection accepts two to 32 immutable candidates and one immutable reference. It verifies content and descriptor hashes, candidate state, QA state and source lineage before decoding image evidence.

Deterministic evidence includes:

- bounded translation and alpha-silhouette overlap;
- symmetric candidate-to-reference edge distance;
- visible-area, centroid and bounds-aspect similarity;
- palette and luminance distributions;
- edge-orientation distributions;
- aligned overlap-colour similarity.

Dimension mismatch, invalid candidate state, missing reference lineage and failed blocking thresholds are hard failures. They cannot be offset by a higher weighted score.

Optional model-assisted evidence is stored separately as `selection-model-evidence` and binds one candidate, one reference, one evidence kind, model version, model hash and preprocessing hash. It can influence selection only through the declared policy.

The selector emits immutable `candidate-selection-evidence` and one of:

```text
selected
review-required
rejected
```

Automatic selection requires explicit policy permission, all hard gates, the minimum overall score, the minimum winner margin and all automatic-only model evidence. Ambiguity becomes `review-required`; the selector does not guess.

## Promotion

Selection never updates an approved reference. Promotion is a second transaction requiring:

- exact selection-evidence artifact;
- exact recommended candidate;
- descriptor and content hashes matching the ranking;
- automatic or named-human approval;
- target reference namespace and name;
- expected reference generation and current artifact id when one exists;
- actor identity.

Automatic promotion requires `selected`. Human approval may resolve `review-required` for the recommended hard-gate-eligible candidate, but cannot promote `rejected`, waive a blocking failure or choose a runner-up.

Promotion creates a traceable `selected-art-master`, writes immutable `candidate-promotion-authorization` evidence, then performs one compare-and-swap named-reference update. A stale reference leaves diagnostic artifacts but does not become approved.

The named reference is the authoritative approved pointer. The selected master remains `finalDeliverable=false` until later delivery packaging and release gates pass.

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

Production jobs use distinct kinds:

```text
art.candidate.generate
art.candidate.edit
art.candidate.inpaint
art.candidate.master-alpha
art.candidate.select
art.candidate.promote
```

Provider workers advertise only configured adapter capabilities. Selection workers advertise deterministic comparison and promotion capabilities independently of provider credentials. The `provider` queue is added automatically only when at least one provider adapter is available; the `selection` queue can operate entirely offline against immutable artifacts.

The local implementation serialises each mutation into an immutable transaction containing the complete snapshot, previous sequence, event records and state SHA-256. `head.json` is only an optimisation and can be reconstructed.

`PgBossRuntimeDelivery` creates prefixed strict-FIFO queues with heartbeat and dead-letter settings. It transports job references; it is not the source of truth for art approval, artifact lineage or selection evidence.

## Artifact and evidence contract

Every deliverable, provider candidate, selection or promotion record receives:

- SHA-256 content hash;
- immutable descriptor hash;
- source and reference artifact IDs;
- work-order, job and attempt identifiers;
- provider, model and adapter-version identifiers when applicable;
- deterministic provider request and compiled-prompt hashes;
- selection request and promotion request hashes;
- prompts, masks, seeds and parameters;
- deterministic tool versions and command arguments;
- dimensions, format, colour space, density and alpha readings;
- QA gate, metric and comparison evidence;
- model and preprocessing hashes for external evidence;
- approval mode, actor and named-reference generation;
- license and usage notes;
- canonical name, folder and engine mapping.

Objects are stored by content hash. Descriptors can give the same bytes different governed production roles without duplicating the object. Named approved references use compare-and-swap generations and retain the previous artifact ID.

Provider candidates use storage class `intermediate`, carry `approvalState=unapproved`, and cannot become approved merely because the adapter succeeded. Alpha masters remain unapproved intermediates. Selection evidence is storage class `evidence`. Promotion creates a storage class `master`, but the named reference remains the authoritative approval record.

Generated binaries do not live in Git by default. Git stores briefs, plans, manifests, approved small assets and reproducibility records. Large masters and intermediates use the local content-addressed store; an S3-compatible adapter remains a deployment slice.

## Security boundary

- The hub launch remains a separate signed, short-lived handoff.
- Repository and worker file access is restricted to configured roots.
- API runtime and artifact reads are privileged because payloads may contain private paths.
- REST operational access requires the explicit write switch and a server-only token of at least 32 bytes.
- Provider, selection and promotion validation or compilation routes are deterministic and use no provider credential.
- MCP operational tools require the explicit local write switch.
- Provider and selection compilation tools return durable job contracts rather than executing providers, image comparison or promotion.
- Workers receive scoped jobs and artifact access, never the complete owner secret set.
- Provider keys remain worker-side and are never stored in briefs, job payloads, evidence or artifact metadata.
- Provider reference and response sizes are bounded before data is retained.
- Selection image bytes, decoded pixels, candidate counts, lineage depth, translation search and decode concurrency are bounded.
- Model-assisted evidence is rejected unless it is bound to exact candidate and reference artifacts plus model and preprocessing hashes.
- Active job transitions require a valid lease token.
- Promotion requires exact selection evidence and compare-and-swap reference state.
- Untrusted schemas, commands and output paths are never executed directly.
- Hosted API and MCP surfaces do not run providers, candidate comparison, promotion, Godot or arbitrary binaries.
- Every external mutation records an actor label and immutable event evidence; signed actor identity remains part of the hub-launch slice.
