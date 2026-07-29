# Durable runtime and content-addressed artifacts

## Purpose

Art Studio work can span many frames, provider attempts, deterministic clean-up passes, quality gates and engine exports. A browser request or one shell process is not a sufficient source of truth for that work. The durable layer separates three responsibilities:

1. **Runtime state** records what should happen, what is currently leased, what failed and what may retry.
2. **Artifact storage** records immutable bytes, descriptors, lineage and approved named references.
3. **Delivery transport** wakes shared workers but does not replace runtime or artifact evidence.

A provider response, queue acknowledgement or mutable output filename is never sufficient proof that an asset is complete.

## Local layout

The default local runtime uses two independent roots:

```text
.art-studio/
├── runtime/
│   ├── head.json
│   ├── transactions/
│   │   ├── 000000000001.json
│   │   └── 000000000002.json
│   └── locks/
└── artifacts/
    ├── objects/
    │   └── sha256/ab/cd/<content-hash>
    ├── descriptors/
    │   └── sha256/12/34/artifact_<descriptor-hash>.json
    ├── refs/
    │   └── projects/demo/approved-master.json
    └── locks/
```

`head.json` is a convenience pointer, not the only copy of runtime state. If it is missing, stale or corrupt, the journal scans immutable transaction records from newest to oldest and restores the latest snapshot whose SHA-256 is valid.

## Artifact contract

The artifact store hashes the exact content bytes and stores them once. A separate immutable descriptor records:

- artifact ID and content hash;
- media type and byte length;
- storage class such as source, master, intermediate, evidence, manifest or runtime;
- original display filename;
- source-artifact lineage;
- JSON-safe metadata and labels;
- object and descriptor locations;
- descriptor hash and protocol version.

Two descriptors can refer to the same content bytes without duplicating the object. This is useful when one approved PNG is both a source frame and an engine delivery input but needs different production metadata.

Every read can re-hash the object. Tampering is reported rather than silently accepted.

### Approved references

Named references provide mutable pointers over immutable artifacts:

```text
projects/1871/hero/canonical-identity
projects/1871/hero/approved-idle-atlas
jobs/job_abc/final-output
```

Updates use an expected generation. Two operators or workers cannot unknowingly replace the same approved reference; one compare-and-swap update succeeds and the stale update is rejected. References retain the previous artifact ID for review history.

## Runtime state machine

```text
waiting ───────────────┐
  │ dependencies ready │
  ▼                    │
queued ──claim──> leased ──start──> running
  │              │                    │
  │ pause         │ lease expiry       │ heartbeat / complete / fail
  ▼              ▼                    ▼
paused       retry-wait <──────── transient failure
  │              │
  └─resume────────┘

running/leased ──cancel request──> cooperative stop
running/leased ──force cancel────> cancelled
running/leased ──pause request───> cooperative pause

permanent failure ───────────────> failed
attempts exhausted ──────────────> dead-letter
failed dependency ───────────────> blocked
success ─────────────────────────> succeeded
```

Terminal states are `succeeded`, `failed`, `cancelled`, `blocked` and `dead-letter`. Redrive is explicit, adds a bounded number of attempts, increments a redrive counter and re-enters dependency and deadline evaluation.

## Submission and idempotency

Every submission contains a queue, kind, idempotency key, JSON payload, capability requirements, dependencies, input artifacts and execution policy. The runtime normalises and hashes that specification.

- Repeating the same queue and idempotency key with the same specification returns the existing job.
- Reusing the key for different work is rejected.
- Batch submission is atomic.
- Cycles introduced within a batch are rejected before any transaction commits.
- Missing dependencies remain waiting and may be submitted later.
- A terminal failed dependency blocks downstream work with explicit evidence.

## Leases and attempts

A claim creates a cryptographically random lease token and a new immutable attempt record. Only a worker with the required capabilities and an allowed queue can claim a job.

A valid lease token is required to:

- start execution;
- extend the lease through a heartbeat;
- commit success;
- report failure.

Attempts retain worker ID, lease times, start time, heartbeat count, outcome, failure classification and output artifact IDs. Expired leases are recovered into retry, terminal failure or dead letter according to the original policy.

## Retry policy

Retries use bounded exponential delay with deterministic SHA-256-derived jitter. The same job and attempt receive the same delay across recovery or replay. Unknown handler errors are permanent unless a handler deliberately throws `TransientRuntimeError`.

Failure classifications are:

- transient;
- permanent;
- cancelled;
- lease expired;
- deadline exceeded;
- dependency failed;
- execution timeout.

The runtime never lowers quality thresholds or changes an art work order merely because an execution attempt failed.

## Worker host

`apps/worker` is the local durable worker host. It supports:

```powershell
pnpm worker:once
pnpm worker:until-idle
pnpm dev:worker
```

The first built-in handler is `sprite.atlas.build`. It:

1. reads a guarded atlas manifest;
2. builds the deterministic atlas, data and evidence package;
3. optionally writes the reviewed Godot descriptor and importer source;
4. ingests generated outputs into immutable artifact storage;
5. records source-artifact lineage and runtime labels;
6. commits success only with valid artifact IDs.

It does not execute a Godot binary. Native `.tres` creation remains a reviewed local or authenticated engine-worker gate.

Workers renew leases, enforce execution timeouts and observe cancellation or pause requests. A handler can emit output artifacts directly and optionally return JSON result data, which the worker stores as an evidence artifact.

## PostgreSQL and pg-boss transport

`PgBossRuntimeDelivery` is an optional shared-worker delivery adapter. It uses:

- one prefixed queue per Art Studio runtime queue;
- strict FIFO per job singleton key;
- a dead-letter queue;
- heartbeat settings;
- optional PostgreSQL `LISTEN/NOTIFY` wake-up with polling as the correctness floor;
- the runtime job ID as the transport singleton key.

A transport message contains only the job ID, queue, specification hash and enqueue time. The worker must re-read authoritative runtime state before executing. A pg-boss completion never approves an artifact by itself.

This branch validates the adapter contract with a deterministic fake client. A real PostgreSQL integration and failure drill remains a deployment smoke gate.

## CLI

```powershell
pnpm art -- runtime-submit `
  --input .\jobs\hero-atlas.job.json `
  --runtime-root .\.art-studio\runtime `
  --actor greg

pnpm art -- runtime-list `
  --state queued,running,retry-wait `
  --queue media

pnpm art -- runtime-show --job job_...
pnpm art -- runtime-events --after 0
pnpm art -- runtime-pause --job job_...
pnpm art -- runtime-resume --job job_...
pnpm art -- runtime-cancel --job job_...
pnpm art -- runtime-redrive --job job_... --attempts 1
pnpm art -- runtime-recover
```

Artifact operations are also JSON-first:

```powershell
pnpm art -- artifact-put `
  --input .\art\hero.png `
  --descriptor .\art\hero.artifact.json

pnpm art -- artifact-verify --artifact artifact_...

pnpm art -- artifact-ref-set `
  --namespace projects/1871/hero `
  --name approved-master `
  --artifact artifact_... `
  --expected-generation 0
```

## REST API

Operational routes require all of the following:

```text
EVAVO_ART_ALLOW_WRITES=true
EVAVO_ART_WRITE_TOKEN=<at least 32 bytes>
EVAVO_ART_RUNTIME_ROOT=<configured local runtime root>
EVAVO_ART_ARTIFACT_ROOT=<configured local artifact root>
```

The token is supplied as `Authorization: Bearer ...` or `x-evavo-art-write-token`. Runtime reads are protected too because payloads may contain private repository paths.

Routes include:

```text
GET  /v1/runtime/jobs
POST /v1/runtime/jobs
GET  /v1/runtime/jobs/:id
POST /v1/runtime/jobs/:id/cancel
POST /v1/runtime/jobs/:id/pause
POST /v1/runtime/jobs/:id/resume
POST /v1/runtime/jobs/:id/redrive
POST /v1/runtime/recover
GET  /v1/runtime/events
GET  /v1/artifacts/:id
GET  /v1/artifacts/:id/verify
GET  /v1/artifact-references?namespace=...&name=...
POST /v1/artifact-references
```

The REST process submits and controls jobs but does not execute handlers.

## MCP

The local stdio server exposes tools for submission, listing, control, recovery, events, guarded file ingestion, artifact verification and named-reference management. Every operational MCP tool requires `EVAVO_ART_ALLOW_WRITES=true`.

MCP does not expose raw binary object reads, shell execution or provider credentials.

## Security and reliability rules

- Runtime and artifact paths are configured server-side.
- Worker input paths remain within approved roots.
- Artifact IDs use `artifact_<sha256>` and are validated at every boundary.
- Active state transitions require a valid lease token.
- API operational reads and writes require the control token.
- Runtime mutations are serialised through a recoverable file lock.
- Artifact writes and reference updates are atomic.
- Event and transaction records are immutable.
- Provider secrets are never accepted in briefs, runtime payloads or artifact descriptors.
- pg-boss is delivery infrastructure, not evidence or approval.

## Deliberate limitations

This slice does not yet provide:

- an S3-compatible artifact adapter;
- a live PostgreSQL integration test in repository CI;
- distributed reconciliation between the local journal and PostgreSQL state;
- hosted worker authentication and registration;
- provider-generation handlers;
- OpenCV/ONNX identity and consistency workers;
- automatic native Godot execution;
- a browser job operations dashboard.

Those additions must retain the same job IDs, state transitions, artifact hashes and evidence contracts rather than creating alternative sources of truth.
