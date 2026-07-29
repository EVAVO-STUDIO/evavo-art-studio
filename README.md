# EVAVO Art Studio

EVAVO Art Studio is a governed art-production platform for professional game, digital and print assets. It inspects a project, understands its design and art direction, calculates the complete asset inventory, creates and revises artwork through explicit stages, masters transparent sprites and animation, and exports evidence-backed delivery packages.

This repository is intentionally broader than an image generator. It is the shared production engine behind a premium web control plane, versioned REST API, local CLI, MCP tools for ChatGPT and Claude, durable workers, provider adapters and engine-specific exporters.

## Working foundation

- portable art brief, work-order, quality-gate, deliverable and repository-snapshot contracts;
- deterministic production-plan compiler with dependency, approval and capability assignment;
- canonical sprite identities with index-matched or deliberately shared family inheritance;
- direction masters, key poses and neighbour-conditioned in-between frame plans;
- explicit authored-cel, layered-rig and hybrid production methods;
- per-layer bake, linked-cel, separate-frame, rigged-part, guide and engine-sidecar decisions;
- exact Aseprite millisecond and Godot relative-duration timing;
- individual lossless frames, editable source, layer manifests and packed derivatives;
- blocking identity, proportion, crop, layer-registration, occlusion and source-parity gates;
- executable decoded-pixel QA for alpha, fake checkerboards, flat mattes, edge halos, hidden transparent colour and safe bounds;
- executable sequence QA for canvas, frame order, exact duration, pivot, baseline, ground contact and declared linked-cel duplicates;
- deterministic no-rotation MaxRects atlas production with transparent padding, edge extrusion, alpha-aware trim restoration and content hashes;
- Godot 4.6.2 SpriteFrames descriptors and headless importers using AtlasTexture regions, trim margins, loop modes and exact relative durations;
- immutable content-addressed artifact objects, descriptors, lineage, verification and compare-and-swap approved references;
- crash-recoverable runtime transactions with idempotency, dependencies, capability claims, leases, heartbeats, retry, pause, cancellation, dead letter and redrive;
- a capability-scoped local worker that builds atlas and Godot source packages and commits only verified artifact IDs;
- an optional pg-boss transport adapter that keeps delivery separate from authoritative runtime and artifact evidence;
- safe local repository inspector with Godot project and existing-art detection;
- JSON-first CLI for validation, planning, repository inspection, sprite QA, engine-ready delivery, runtime control and artifact governance;
- versioned REST API for planning, QA, authenticated atlas writes and authenticated runtime or artifact operations;
- Next.js control-plane workspace with an interactive continuity-aware production-plan compiler and browser QA workbenches;
- MCP v2 stdio server exposing planning, repository inspection, sprite QA, atlas delivery, runtime control and artifact governance to ChatGPT, Claude and compatible agents;
- EVAVO hub manifest for a signed federated launch at `art.evavo.com.au`;
- architecture, technology, quality, sprite-continuity, atlas-delivery, durable-runtime and hub-integration decisions;
- CI validation for type checks, tests and builds.

## First commands

```powershell
pnpm install
pnpm check
pnpm art -- validate --input examples/game-art-brief.json
pnpm art -- plan --input examples/game-art-brief.json --output art-plan.json
pnpm art -- inspect --repo C:\GitRepos\your-game --output repo-art-snapshot.json

pnpm art -- quality-frame `
  --input .\source\hero\frames\down\frame-001.png `
  --expectations .\source\hero\frame-quality.json `
  --output .\evidence\frame-001.quality.json

pnpm art -- quality-sequence `
  --manifest .\source\hero\hero-idle.sequence.json `
  --output .\evidence\hero-idle.quality.json

pnpm art -- atlas-build `
  --manifest C:\GitRepos\your-game\art\hero.atlas.json `
  --output-dir C:\GitRepos\your-game\art\generated `
  --godot-project C:\GitRepos\your-game

# Optional local finalisation through a reviewed Godot executable:
pnpm art -- atlas-build `
  --manifest C:\GitRepos\your-game\art\hero.atlas.json `
  --output-dir C:\GitRepos\your-game\art\generated `
  --godot-project C:\GitRepos\your-game `
  --godot-executable "C:\Tools\Godot\Godot_v4.6.2-stable_mono_win64.exe"

# Submit the same atlas work to the durable local runtime:
pnpm art -- runtime-submit `
  --input .\jobs\hero-atlas.job.json `
  --runtime-root .\.art-studio\runtime `
  --actor greg

pnpm art -- runtime-list --state queued,running,retry-wait
pnpm worker:until-idle
pnpm art -- runtime-events --after 0

pnpm dev
pnpm dev:api
pnpm dev:mcp
pnpm dev:worker
```

The web workspace starts at `http://localhost:4200`. The standalone API starts on `127.0.0.1:4100` by default and exposes:

- `GET /health`
- `GET /v1/capabilities`
- `POST /v1/plans`
- `POST /v1/repositories/inspect`
- `POST /v1/quality/sprite-frame`
- `POST /v1/quality/sprite-sequence`
- `POST /v1/atlases/build`
- `GET|POST /v1/runtime/jobs`
- `GET /v1/runtime/jobs/:id`
- `POST /v1/runtime/jobs/:id/cancel|pause|resume|redrive`
- `POST /v1/runtime/recover`
- `GET /v1/runtime/events`
- `GET /v1/artifacts/:id[/verify]`
- `GET|POST /v1/artifact-references`

Repository, sequence and atlas paths are restricted to `EVAVO_ART_ALLOWED_ROOTS`. On Windows, separate allowed roots with `;`. REST atlas, runtime and artifact routes require `EVAVO_ART_ALLOW_WRITES=true` plus a server-only `EVAVO_ART_WRITE_TOKEN` of at least 32 bytes supplied as a bearer token or `x-evavo-art-write-token`. Operational reads are protected because job payloads may contain private repository paths. Local MCP operational tools require the write flag and a trusted MCP process connection. Provider secrets belong on workers and are never exposed to the browser, briefs, runtime payloads or artifact descriptors.

## Core rules

A provider response is never a final asset. Every final asset must pass the declared production stages, deterministic mastering, blocking quality gates, metadata generation and evidence bundling.

A sprite sheet is never the sole source. The source package retains canonical and direction masters, individual lossless frames, exact timing, registered layers, editable cels, pivots, manifests and reproducibility evidence.

Later frames may not be unrelated text-only generations. They inherit the approved identity and direction references and are conditioned by neighbouring key poses and structural controls.

Non-zero RGB beneath fully transparent pixels is not automatically a defect. It is accepted only when it behaves like deliberate edge bleed that agrees with nearby approved subject colour; unrelated matte contamination remains blocking.

Atlas generation consumes approved individual frames. It never rotates directional art, never recursively compresses derivatives, retains source dimensions and trim offsets, leaves transparent padding around packed regions, extrudes only the subject edge, and hashes every source and output. Atlas metadata stores manifest-relative source references rather than machine-specific absolute paths.

Godot delivery is two-stage by design: Art Studio deterministically emits the atlas, descriptor and reviewed importer source; a local or authenticated engine worker may then run Godot headlessly to save the native SpriteFrames resource. Hosted API and MCP surfaces do not execute arbitrary binaries.

The runtime journal, artifact hashes and evidence records are authoritative. pg-boss may wake distributed workers, but a queue acknowledgement cannot approve an asset or replace attempt history. Workers commit success only with valid immutable artifact IDs.

See `docs/architecture.md`, `docs/technology-decisions.md`, `docs/quality-system.md`, `docs/sprite-continuity.md`, `docs/executable-sprite-quality.md`, `docs/atlas-and-godot-delivery.md`, `docs/durable-runtime-and-artifacts.md` and `docs/hub-integration.md`.
