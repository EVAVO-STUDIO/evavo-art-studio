# EVAVO Art Studio architecture

## Product boundary

EVAVO Art Studio is not a single image generator and it is not a prompt wrapper. It is a governed production system that can inspect a project, define an art direction, calculate the required asset inventory, create and revise assets, master animation and atlases, prove quality, and export engine-ready or print-ready deliverables.

The system has four independent surfaces over one domain engine:

1. **Web control plane** for the EVAVO hub, project views, work-order review, live job status, comparison, QA evidence and export retrieval.
2. **REST API** for automation, integrations and remote workers.
3. **CLI** for local repositories, CI, batch production and recovery.
4. **MCP server** for ChatGPT, Claude and other tool-capable agents using the same contracts and permissions.

No surface is allowed to bypass the domain contracts, work-order graph, policy checks or evidence bundle.

## Runtime topology

```text
EVAVO hub / CLI / MCP / REST
            |
     signed control plane
            |
   work-order compiler + policy engine
            |
      durable PostgreSQL queue
            |
  capability-matched workers
  |       |       |       |
media   vision  provider  engine
  |       |       |       |
Sharp  OpenCV   model   Godot export
FFmpeg ONNX     adapters manifests
            |
 artifact store + evidence ledger
```

The web app is a control plane. Heavy image decoding, animation encoding, vision analysis and model execution belong in authenticated workers because serverless web runtimes are not a reliable place for long CPU/GPU jobs, large temporary files or local repository access.

## Monorepo boundaries

- `apps/web`: Next.js hub application and signed-launch surface.
- `apps/api`: versioned REST API and OpenAPI description.
- `apps/cli`: local and CI entry point.
- `apps/mcp`: stdio and Streamable HTTP MCP server.
- `apps/worker`: worker host and capability registration.
- `packages/contracts`: portable JSON-compatible contracts and validation.
- `packages/core`: work-order compiler, policy engine and deterministic planning.
- `packages/repo-inspector`: safe repository inventory and project inference.
- `packages/quality`: alpha, artifact, consistency, animation, atlas and print gates.
- `packages/media`: Sharp, FFmpeg and ImageMagick adapters.
- `packages/providers`: generation and editing provider adapters.
- `packages/godot`: Godot 4.6.2 import profiles, `.tres`, SpriteFrames, atlas and particle exports.
- `packages/runtime`: durable jobs, leases, retries, cancellation and evidence recording.

The first committed slice implements contracts, deterministic planning, repository inspection, CLI, REST, a Next.js control plane and a local MCP stdio server without binding the domain to any generation provider.

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
11. Package engine resources, metadata, hashes and evidence.

A fully automatic run uses the same gates as a reviewed run. Automation changes who approves a gate; it does not remove the gate.

## Provider neutrality

Generation, editing, background removal, upscaling, interpolation and vision models are capability adapters. A work item declares what it needs, not which vendor must perform it. The scheduler selects a compatible provider based on:

- asset type and target style;
- reference-image and mask support;
- deterministic seed support;
- transparent-output reliability;
- maximum dimensions and frame count;
- cost, latency and data policy;
- measured quality history for that task family.

Provider output is always considered an intermediate candidate until deterministic mastering and QA complete.

## Durable execution

The recommended production queue is PostgreSQL-backed so local workers, a hosted control plane and future Python workers can share one durable job ledger without requiring a separate Redis service. Jobs require:

- idempotency keys;
- explicit input and output hashes;
- leases and heartbeats;
- bounded retries with failure classification;
- cancellation and pause points;
- immutable attempts and decision records;
- dead-letter review;
- resumable dependency graphs.

`pg-boss` is the initial Node implementation candidate. The queue remains behind a runtime interface so a later Temporal, Hatchet or local-only adapter does not alter domain packages.

## Artifact and evidence contract

Every deliverable receives:

- SHA-256 content hash;
- source and reference hashes;
- work-order and attempt identifiers;
- provider, model and model-version identifiers when applicable;
- prompts, masks, seeds and parameters;
- deterministic tool versions and command arguments;
- dimensions, format, colour space, density and alpha readings;
- QA gate results and comparison evidence;
- license and usage notes;
- canonical name, folder and engine mapping.

Generated binaries do not live in Git by default. Git stores briefs, plans, manifests, approved small assets and reproducibility records. Large masters and intermediates use a content-addressed artifact store with local filesystem and S3-compatible adapters.

## Security boundary

- The hub launches the standalone application through a signed, short-lived handoff.
- Repository inspection is local by default and restricted to configured roots.
- Workers receive scoped jobs and artifact credentials, never the complete owner secret set.
- Provider keys remain worker-side.
- Uploaded files are decoded with strict size, pixel-count, frame-count and format limits.
- Untrusted schemas, commands and output paths are never executed directly.
- All external actions are recorded against an authenticated actor or agent identity.
