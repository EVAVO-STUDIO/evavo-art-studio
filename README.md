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
- provider-neutral generation, edit and inpaint contracts with immutable role-specific references;
- deterministic provider prompt compilation for identity, style, shot, layer, target and alpha boundaries;
- capability-matched provider selection with explicit allow-lists, bounded fallback and cancellation;
- an OpenAI image adapter using ordered references and masks, model-aware native-alpha requests for supported GPT Image 1.x models, and declared chroma-key fallback for GPT Image 2;
- governed ComfyUI workflow-profile adapters for local generation, editing, inpainting, matching assets and matching animation frames, bound to exact workflow, model, runtime, node and reference hashes;
- decoded mask preflight that proves matching image format, dimensions, page count, alpha and editable coverage before remote inpaint;
- unapproved provider candidates stored as immutable intermediate artifacts with complete attempt and provenance evidence;
- smart alpha classification that preserves genuine alpha, reconstructs conclusively detected exact/subtle/resampled or partial-alpha-disguised painted checkerboards behind even a dominant foreground, defeats token-alpha rims around proven solid mattes, and applies high-chroma-only border-connected declared or confidently inferred local-matte segmentation with physical alpha proof, colour unmixing, audited large-distance and subtle matte-complement halo repair, and bounded transparent RGB bleed;
- durable `art.candidate.master-alpha` work that emits only an unapproved alpha intermediate and immutable extraction or QA evidence;
- deterministic candidate ranking using bounded alignment, silhouettes, symmetric edge distance, area, anchors, palette, luminance, edge orientation and overlapping colour;
- optional model-assisted identity, costume, equipment, pose, style and perceptual evidence bound to exact candidate, reference, model and preprocessing hashes;
- explicit `selected`, `review-required` and `rejected` outcomes with winner-margin and hard-gate governance;
- separate automatic or named-human promotion that re-verifies ranking evidence and compare-and-swaps the approved artifact reference;
- blocking identity, proportion, crop, layer-registration, occlusion and source-parity gates;
- executable decoded-pixel QA for alpha, fake checkerboards, flat mattes, edge halos, hidden transparent colour and safe bounds;
- executable sequence QA for canvas, frame order, exact duration, pivot, baseline, ground contact and declared linked-cel duplicates;
- descriptor-bound Brass static and animation evaluation that hashes and decodes one retained byte sequence, rejects path substitution or multi-frame sources, and publishes evidence with atomic create-only collision protection;
- deterministic no-rotation MaxRects atlas production with fail-closed per-frame transparency admission, transparent padding, edge extrusion, alpha-aware trim restoration and content hashes;
- artist-guided protect/remove masks, solid hostile-background proof sheets and explicit alpha-policy gates for frame, sheet and atlas work;
- Godot 4.6.2 SpriteFrames descriptors and headless importers using AtlasTexture regions, trim margins, loop modes and exact relative durations;
- immutable content-addressed artifact objects, descriptors, lineage, verification and compare-and-swap approved references;
- crash-recoverable runtime transactions with idempotency, dependencies, capability claims, leases, heartbeats, retry, pause, cancellation, dead letter and redrive;
- a capability-scoped local worker that executes provider candidates, alpha mastering, candidate selection, promotion and atlas or Godot source packages while committing only verified artifact IDs;
- an optional pg-boss transport adapter that keeps delivery separate from authoritative runtime and artifact evidence;
- protected owner operations UI with signed HttpOnly sessions, bounded server-side API proxying, secret redaction and durable job controls;
- safe local repository inspector with Godot project and existing-art detection;
- persistent Artist Workspaces for ChatGPT, Claude and trusted agents, separating immutable originals, editable working copies, append-only versions, masks, scratch, review, masters, exports and exact EVAVO Storage handoffs;
- deterministic professional mastering with arbitrary rotation, affine and perspective transforms, curves, channel mixing, tonal adjustment, blur and edge filters, alpha feathering, defringing, shadows, glows and release-profile evidence;
- bounded keyframed 2D motion rendering with layer masks, blend modes, anchors, easing, subframe motion blur, PNG sequences, GIF previews and exact motion manifests;
- JSON-first CLI for planning, provider compilation, alpha mastering, candidate selection, promotion, repository inspection, sprite QA, engine delivery, runtime control and artifact governance;
- versioned REST API for planning, provider and selection contracts, QA, authenticated atlas writes and authenticated runtime or artifact operations;
- Next.js control plane with the continuity-aware production compiler, browser QA workbenches and private operations control room;
- MCP v2 stdio server exposing planning, provider and selection compilation, repository inspection, sprite QA, atlas delivery, runtime control and artifact governance to ChatGPT, Claude and compatible agents;
- EVAVO hub manifest for a signed federated launch at `art.evavo.com.au`;
- architecture, technology, quality, sprite-continuity, provider, alpha-mastering, selection, atlas-delivery, durable-runtime, operations and hub-integration decisions;
- exact-current-main CI validation with a committed, frozen pnpm dependency graph and bounded validation receipts.

## First commands

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm art -- validate --input examples/game-art-brief.json
pnpm art -- plan --input examples/game-art-brief.json --output art-plan.json
pnpm art -- inspect --repo C:\GitRepos\your-game --output repo-art-snapshot.json

# Validate and compile a provider-neutral candidate without calling a model:
pnpm art -- provider-protocol
pnpm art -- provider-validate `
  --input .\examples\provider-candidate-request.json `
  --output .\provider-request.normalized.json
pnpm art -- provider-compile `
  --input .\examples\provider-candidate-request.json `
  --output .\provider-request.compiled.json

# Deterministically preserve or recover native alpha, a painted checkerboard, or a flat matte:
pnpm art -- master-alpha `
  --input .\candidate.png `
  --output .\candidate.alpha.png `
  --proof .\candidate.alpha.proof.png `
  --evidence .\candidate.alpha.evidence.json `
  --expectations .\frame-quality.json

# Validate and compile ranking or promotion without executing a worker:
pnpm art -- selection-protocol
pnpm art -- selection-validate `
  --input .\selection.json `
  --output .\selection.normalized.json
pnpm art -- selection-compile `
  --input .\selection.json `
  --output .\selection.job.json
pnpm art -- promotion-compile `
  --input .\promotion.json `
  --output .\promotion.job.json

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

# Submit provider, mastering, selection, promotion or atlas work to the durable runtime:
pnpm art -- runtime-submit `
  --input .\examples\runtime-provider-job.json `
  --runtime-root .\.art-studio\runtime `
  --actor greg

pnpm art -- runtime-submit `
  --input .\examples\runtime-alpha-mastering-job.json `
  --runtime-root .\.art-studio\runtime `
  --actor greg

pnpm art -- runtime-submit `
  --input .\examples\runtime-selection-job.json `
  --runtime-root .\.art-studio\runtime `
  --actor greg

pnpm art -- runtime-submit `
  --input .\examples\runtime-promotion-job.json `
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

The web workspace starts at `http://localhost:4200`. The private owner control room is at `http://localhost:4200/operations`. The standalone API starts on `127.0.0.1:4100` by default.

## Persistent Artist Workspace and professional mastering

ChatGPT, Claude and trusted EVAVO agents can create a path-confined persistent workspace, preserve immutable originals, make append-only working snapshots, compile deterministic image or motion plans and prepare exact EVAVO Storage handoffs without sending image bytes through MCP arguments. Workspace writes require the explicit local write gate and remain separate from provider execution, creative approval, repository mutation and publication.

The Project Art sandbox includes the deterministic operation families needed for professional finishing: crop, pad, translate, pixel-safe and continuous-tone resize, arbitrary rotation, affine and perspective transforms, colour replacement, grayscale, inversion, posterisation, thresholding, gamma, hue, curves, channel mixing, multiple blur and edge filters, alpha morphology, feathering, defringing, halo and matte cleanup, ordered compositing, shadows and glows. Sprite slicing and assembly default to strict decoded transparency admission and retain evidence for every source and output. `image-master` applies a release profile and emits a self-hashed mastering report. `motion-sequence` renders bounded keyframed layers to PNG frames, an exact manifest and an optional GIF preview.

The avatar animation suite compiler expands pinned EVA or Top Hat identity references into a governed 25-clip production plan: four anti-repeating idles, six talk performances, speech transitions, reactions and a character-specific greeting. It schedules 315 continuity-linked full-character frames plus 17 pixel-registered mouth and eye layers. Top Hat v2 handoffs retain the canonical portrait while binding every image job to a full-body RGBA master by repository commit, tree, asset hash, manifest hash and reference-set digest. Each frame requires genuine alpha or a declared low-collision chroma matte, border-connected background recovery, colour decontamination and independent frame assurance; a painted checkerboard is always blocking. The compiler plans work only and cannot approve, publish or activate art.

See [`docs/PERSISTENT_ARTIST_WORKSPACE.md`](./docs/PERSISTENT_ARTIST_WORKSPACE.md), [`docs/PROJECT_ART_MASTERING_AND_MOTION.md`](./docs/PROJECT_ART_MASTERING_AND_MOTION.md) and [`docs/PROJECT_ART_AVATAR_ANIMATION_SUITE.md`](./docs/PROJECT_ART_AVATAR_ANIMATION_SUITE.md).

## Provider candidate execution

CLI, REST and MCP can validate and compile the same provider-neutral contract, but they do not call an image model. Execution occurs only after a durable job reaches a worker with the required provider capability.

For real GPT Image 2 candidate work, configure the worker process only:

```text
OPENAI_API_KEY=<server-only key>
EVAVO_ART_OPENAI_IMAGE_MODEL=gpt-image-2
EVAVO_ART_OPENAI_IMAGE_MODELS=gpt-image-2,gpt-image-2-2026-04-21
EVAVO_ART_OPENAI_BASE_URL=https://api.openai.com/v1
EVAVO_ART_WORKER_QUEUES=
```

Leaving `EVAVO_ART_WORKER_QUEUES` empty lets the worker add `provider` automatically when a provider adapter is configured. The deterministic fixture provider remains disabled unless `EVAVO_ART_ENABLE_FIXTURE_PROVIDER=true` is explicitly set for tests.

A provider response is stored as an unapproved `intermediate`, never as a final master. Identity-locked sprite work requires a canonical identity artifact. In-between frames also require the approved previous and next key poses. Inpaint work requires an approved base image and exactly one mask.

The OpenAI adapter decodes the actual base and mask before transport. Mismatched formats or dimensions, multiple pages, missing alpha and masks with no editable pixels fail before a remote request is made.

For governed local ComfyUI execution, first export one reviewed workflow in API format, place it in a catalog draft, then compile the exact self-hashed catalog:

```powershell
pnpm run provider:comfyui:catalog:compile -- `
  --input C:\EVAVO\comfyui\catalog.draft.json `
  --output C:\EVAVO\comfyui\catalog.json

$env:EVAVO_ART_COMFYUI_CATALOG = "C:\EVAVO\comfyui\catalog.json"
$env:EVAVO_ART_COMFYUI_CATALOG_ROOT = "C:\EVAVO\comfyui"
$env:EVAVO_ART_COMFYUI_BASE_URL = "http://127.0.0.1:8188"
$env:EVAVO_ART_COMFYUI_DEDICATED_INSTANCE = "true"
```

Each catalog profile becomes one exact adapter ID such as `comfyui:sprite-match`. The worker does not accept arbitrary workflow JSON. It revalidates catalog, profile, workflow, model, runtime and node identities; verifies and uploads exact immutable reference bytes; preflights required node classes through ComfyUI; binds only declared mutable inputs; downloads bounded outputs; and records unapproved candidate provenance. Remote endpoints require explicit opt-in and HTTPS. Execution still requires the existing durable admission and short-lived RAW_ART execution authorisation. See [`docs/COMFYUI_PROVIDER_ADAPTER.md`](./docs/COMFYUI_PROVIDER_ADAPTER.md).

GPT Image 2 does not currently support transparent backgrounds, so transparency-required requests use a declared flat high-chroma matte; provider validation and provider-canvas preparation reject black, white and grey keys. Models that explicitly advertise native alpha receive an API-level transparent-background request. Both paths remain intermediate and must pass smart background classification, deterministic alpha mastering, edge cleanup and hostile-matte QA. A painted transparency grid is repaired only when its periodic border model and recomposition proof are conclusive.

## Candidate alpha mastering

Art Studio first distinguishes meaningful native alpha, a visible painted checkerboard, a declared matte and a confidently inferred high-chroma matte. It never accepts checkerboard pixels as alpha or removes every pixel matching a key colour. A token transparent rim cannot disguise a painted interior: when a solid high-chroma matte still dominates the visible border band, recovery proves that ownership, composites existing alpha over only that matte, and re-extracts with recomposition evidence. Recovery flood-fills only background-like pixels connected to the image border, preserving enclosed matching colours in the subject. It then estimates edge alpha against nearby confident foreground, removes grid or matte contamination, writes bounded subject-colour bleed beneath nearby transparent pixels and runs the same decoded-pixel frame gates used elsewhere.

The durable job kind is:

```text
art.candidate.master-alpha
```

It requires:

```text
media.chroma-extract
media.background-recovery
quality.sprite-frame
evidence.bundle
```

The source candidate must be an immutable, unapproved `provider-candidate` artifact and must also appear in `inputArtifacts`. The job emits an unapproved intermediate PNG plus evidence. A quality rejection remains visible and diagnosable, but cannot update an approved reference or become a final delivery.

The direct `master-alpha` CLI command uses the same kernel, writes atomically and exits with code `3` when blocking sprite QA fails.

## Candidate selection and promotion

Selection compares two to 32 immutable, QA-passed candidates with one immutable reference. It can use built-in `sprite-identity`, `sprite-motion`, `environment` or `ui` profiles, or a complete custom policy.

The deterministic selector measures bounded translation, alpha-silhouette overlap, symmetric edge distance, visible area, centroid, visible-bounds aspect, palette, luminance, edge orientation and aligned colour. Missing source lineage, invalid artifact state, failed content verification, dimension mismatch and blocking thresholds cannot be offset by a strong score elsewhere.

Optional model-assisted evidence is a separate immutable `selection-model-evidence` artifact. It is bound to one candidate, one reference, one evidence kind, model and preprocessing hashes. Identity, costume, equipment, pose, style and perceptual evidence can be weighted or required, but never update an approved reference directly.

Selection writes a complete immutable ranking and returns:

```text
selected
review-required
rejected
```

`selected` requires every hard gate, overall threshold, winner margin and automatic-only evidence condition. `review-required` retains an eligible but ambiguous result instead of guessing. `rejected` means no candidate is hard-gate eligible.

Selection itself never creates an approved master. Promotion is a separate transaction that re-verifies the evidence, the recommended candidate and the current named-reference generation. Automatic promotion requires an automatically selected result. A named human may resolve `review-required`, but cannot promote a rejected result, waive blocking failures or choose a lower-ranked candidate.

The durable job kinds are:

```text
art.candidate.select
art.candidate.promote
```

Promotion creates a traceable `selected-art-master`, writes immutable authorization evidence and compare-and-swaps the named reference. A stale generation leaves diagnostic artifacts but does not become approved.

See `docs/candidate-selection-and-promotion.md` for the metric, evidence, review and promotion contracts.

## Protected owner operations

Copy `.env.example` to the environment used by the API, web and worker processes, then provide three different random secrets of at least 32 bytes:

```text
EVAVO_ART_WRITE_TOKEN
EVAVO_ART_OPERATOR_ACCESS_TOKEN
EVAVO_ART_OPERATOR_SESSION_SECRET
```

The owner access token is submitted only to the same-origin Next.js session route and exchanged for an expiring HMAC-signed `HttpOnly`, `SameSite=Strict` cookie. Browser JavaScript never receives the standalone API token. The Next.js gateway accepts only the declared runtime and artifact routes, applies request and response limits, rejects cross-site requests and redirects, and recursively redacts lease tokens or secret-like fields before returning evidence to the browser.

For a local operating stack:

1. Set `EVAVO_ART_ALLOW_WRITES=true` and configure `EVAVO_ART_WRITE_TOKEN` for the standalone API.
2. Set `EVAVO_ART_API_BASE_URL=http://127.0.0.1:4100` for the web process.
3. Configure `EVAVO_ART_OPERATOR_ACCESS_TOKEN` and `EVAVO_ART_OPERATOR_SESSION_SECRET` only on the web server.
4. Configure provider credentials only on the worker process.
5. Start `pnpm dev:api`, `pnpm dev:worker` and `pnpm dev` in separate processes.
6. Open `/operations`, establish the owner session, submit or inspect work, and keep worker execution outside the web process.

Do not add any operator or provider secret to a `NEXT_PUBLIC_` variable. Production remains fail-closed when either the owner-session boundary or server-side API link is incomplete.

## API surface

- `GET /health`
- `GET /v1/capabilities`
- `POST /v1/plans`
- `POST /v1/repositories/inspect`
- `GET /v1/provider-protocol`
- `POST /v1/providers/validate`
- `POST /v1/providers/compile`
- `GET /v1/selection-protocol`
- `POST /v1/selections/validate`
- `POST /v1/selections/compile`
- `POST /v1/promotions/validate`
- `POST /v1/promotions/compile`
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

The core API is documented in `apps/api/openapi.yaml`; deterministic selection and promotion compilation are documented in `apps/api/openapi.selection.yaml`.

Repository, sequence and atlas paths are restricted to `EVAVO_ART_ALLOWED_ROOTS`. On Windows, separate allowed roots with `;`. REST atlas, runtime and artifact routes require `EVAVO_ART_ALLOW_WRITES=true` plus the server-only `EVAVO_ART_WRITE_TOKEN`. Operational reads are protected because job payloads may contain private repository paths. Provider, selection and promotion contract routes are deterministic and do not hold provider credentials, decode candidate images or mutate references. Local MCP operational tools require the write flag and a trusted MCP process connection.

## Core rules

A provider response is never a final asset. Every final asset must pass the declared production stages, deterministic mastering, blocking quality gates, metadata generation and evidence bundling.

A provider receives one bounded frame or layer contract. It does not receive authority to create a whole sprite sheet, merge separate runtime layers, invent unrelated props or redesign an approved identity.

A high candidate score is not approval. Selection writes evidence; promotion is a separate, exact-reference transaction.

A sprite sheet is never the sole source. The source package retains canonical and direction masters, individual lossless frames, exact timing, registered layers, editable cels, pivots, manifests and reproducibility evidence.

Later frames may not be unrelated text-only generations. They inherit the approved identity and direction references and are conditioned by neighbouring key poses and structural controls.

Non-zero RGB beneath fully transparent pixels is not automatically a defect. It is accepted only when it behaves like deliberate edge bleed that agrees with nearby approved subject colour; unrelated matte contamination remains blocking.

Atlas generation consumes approved individual frames. It defaults to `alphaPolicy: required`, decodes every frame before trimming, rejects painted grids and mattes, records frame-level admission evidence, never rotates directional art, never recursively compresses derivatives, retains source dimensions and trim offsets, leaves transparent padding around packed regions, extrudes only the subject edge, and hashes every source and output. The explicit `opaque` policy remains available for genuinely opaque art but still cannot admit a painted transparency grid. Atlas metadata stores manifest-relative source references rather than machine-specific absolute paths.

Godot delivery is two-stage by design: Art Studio deterministically emits the atlas, descriptor and reviewed importer source; a local or authenticated engine worker may then run Godot headlessly to save the native SpriteFrames resource. Hosted API and MCP surfaces do not execute arbitrary binaries.

The runtime journal, artifact hashes and evidence records are authoritative. pg-boss may wake distributed workers, but a queue acknowledgement cannot approve an asset or replace attempt history. Workers commit success only with valid immutable artifact IDs.

See `docs/architecture.md`, `docs/technology-decisions.md`, `docs/quality-system.md`, `docs/sprite-continuity.md`, `docs/governed-provider-candidates.md`, `docs/candidate-alpha-mastering.md`, `docs/TRANSPARENCY_PRODUCTION_STANDARD.md`, `docs/candidate-selection-and-promotion.md`, `docs/executable-sprite-quality.md`, `docs/atlas-and-godot-delivery.md`, `docs/durable-runtime-and-artifacts.md`, `docs/runtime-operations-dashboard.md` and `docs/hub-integration.md`.
