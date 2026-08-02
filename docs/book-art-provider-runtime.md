# Book Art provider shadow runtime

## Purpose and authority boundary

The Book Art provider runtime is the next controlled migration step between the existing Book Studio compatibility runtime and Art Studio's durable candidate-production infrastructure.

Art Studio owns provider execution, candidate provenance, immutable candidate and evidence storage, technical mastering, comparison, selection evidence and later promotion. Docs Suite remains authoritative for manuscript and visual canon, cover and interior composition, editable typography, illustration placement, ISBN and barcode data, edition geometry, proofing and publication. Website remains the active compatibility runtime while shadow parity, storage registration, rollback and cutover evidence are incomplete.

This slice does not make Art Studio the active Book Studio runtime. It adds a shadow-only path that can compile, submit, execute and inspect exactly one provider candidate without granting that candidate any final or publication authority.

## Shared runtime ownership

The reusable compiler, durable-submission boundary and immutable inspection verifier live in `packages/book-art-runtime` as `@evavo/art-book-runtime`. The worker retains a compatibility re-export only; it no longer owns a second compiler or submission implementation. REST, CLI, MCP and worker tests use the same package contracts, so provider request normalization, fingerprinting, one-attempt policy, idempotency and inspection rules cannot silently diverge.

The package owns deterministic compilation, durable submission and read-only verification. It does not create a provider registry, read provider credentials, call a provider, write candidate bytes during compilation or inspection, select artwork, promote a master, bind artwork into a book or publish an edition.

## Compile, submit, execute, inspect

The boundary is deliberately split into four stages.

### Compile

`compileBookArtProviderShadowJob()` accepts one exact, fingerprint-valid `evavo_book_art_production_work_order` and a server-approved provider adapter policy. Compilation:

- revalidates the complete Book Art work-order fingerprint;
- requires exactly one provider candidate using the independent `generate` operation;
- accepts no caller-supplied image references in this initial boundary;
- requires an explicit adapter allow-list;
- allows an optional preferred adapter and model only when they are within that policy;
- enforces no provider fallback;
- binds the normalized provider request and work-order fingerprint by SHA-256;
- compiles one deterministic durable runtime specification;
- performs no provider call and writes no candidate artifact.

Malformed arrays, unknown fields, invalid canonical timestamps, stale fingerprints and Docs Suite-owned authority claims fail closed. Invalid array entries are not silently removed and treated as a valid policy.

### Submit

`submitBookArtProviderShadowJob()` compiles the request again, validates the actor and submits only the already-normalized runtime specification. Submission creates or reuses one durable job with:

```text
queue: provider
kind: art.candidate.generate
maximumAttempts: 1
provider fallback: false
candidate count: 1
required capabilities:
  evidence.bundle
  provider.candidate-store
  provider.generate
```

The idempotency key binds the runtime contract, execution ID, exact work-order fingerprint and exact normalized provider-request hash. Repeating the same queue, idempotency key and specification returns the existing job. Reusing the key for different work remains a runtime conflict. Submission itself performs no provider request.

### Execute

Only an eligible Art Studio worker can lease the job. The existing governed provider handler then resolves the allow-listed adapter and executes one provider request. There is one runtime attempt and no provider fallback, so the runtime cannot automatically create a second paid request after failure.

A successful execution stores:

- exactly one provider candidate as `storageClass: intermediate`;
- `approvalState: unapproved` on the candidate descriptor;
- immutable provider evidence containing the normalized request, selected adapter, output identity and candidate artifact ID;
- a runtime result evidence artifact;
- one completed runtime attempt bound to the durable job and specification hash.

The candidate retains:

```text
finalDeliverable: false
requiresMastering: true
requiresBlockingQa: true
```

It is not a selected master, promotion authorization, Book Studio use binding or publication package.

### Inspect

`inspectBookArtProviderShadowJob()` accepts the exact compiled result plus read-only runtime and artifact-store interfaces. It does not submit a job, call a provider or write an artifact.

Inspection first proves that the durable job still matches the compiled job ID, specification hash, one-attempt limit, queue, kind and Book identity labels. It then reports one of five typed states:

```text
blocked
not-submitted
pending
failed
succeeded
```

A `succeeded` receipt is emitted only after all runtime output descriptors and bytes pass immutable verification and the output contains:

- exactly one image with `artifactRole: provider-candidate`;
- `storageClass: intermediate`;
- `approvalState: unapproved`;
- the exact compiled provider-request hash;
- `finalDeliverable: false`;
- `requiresMastering: true`;
- `requiresBlockingQa: true`;
- exactly one `provider-candidate-evidence` JSON artifact;
- evidence bound to the exact candidate artifact;
- one successful adapter attempt inside the host allow-list;
- one matching no-fallback provider request and Book identity;
- no selected-master, promotion-authorization, book-use-binding or publication-package role.

The result includes a deterministic `inspectionFingerprintSha256` over the verified state summary. A job may have executed before inspection, but the inspection operation itself always records:

```text
inspectionReadOnly: true
providerCallPerformedByInspection: false
candidateArtifactsWrittenByInspection: false
selectionPerformed: false
promotionPerformed: false
bookUseBindingCreated: false
runtimeCutoverApproved: false
publicationPerformed: false
```

Descriptor claims are never trusted by themselves. The verifier checks the immutable descriptor, content hash, evidence JSON, normalized provider-request hash and source-artifact binding. A descriptor wrapper that falsely changes the candidate from `unapproved` to `selected` is blocked by regression coverage.

## REST, CLI and MCP parity

All operator surfaces call `@evavo/art-book-runtime` directly. Inspection requires trusted access to the runtime journal and immutable artifact store, but remains read-only.

### REST

The API exposes:

```text
GET  /v1/book-art/provider-runtime
POST /v1/book-art/provider-jobs/compile
POST /v1/book-art/provider-jobs/submit
POST /v1/book-art/provider-jobs/inspect
```

The API host injects its adapter policy. Callers may not send `adapterPolicy` or provider credentials. Compilation is public and read-only. Submission and inspection require the existing Art Studio operational enablement and control token. Submission additionally requires a durable runtime repository. Inspection requires both the runtime repository and immutable artifact store. A successful submission returns `201` whether it created the deterministic job or idempotently reused it; neither submission nor inspection calls a provider.

### CLI

The CLI exposes:

```text
evavo-art book-art-provider-protocol
evavo-art book-art-provider-compile --input request.json
evavo-art book-art-provider-submit --input request.json --runtime-root .art-studio/runtime
evavo-art book-art-provider-inspect --input request.json --runtime-root .art-studio/runtime --artifact-root .art-studio/artifacts
```

The CLI receives provider policy only from the host environment. The input file contains the execution identity and exact work order but no policy or credentials. Inspection reports `not-submitted` and `pending` without failing the command; a blocked or terminally failed receipt exits non-zero for automation.

### MCP

The MCP server registers:

```text
book_art_provider_runtime_protocol
compile_book_art_provider_shadow_job
submit_book_art_provider_shadow_job
inspect_book_art_provider_shadow_job
```

Compilation is side-effect free. MCP submission and protected inspection require `EVAVO_ART_ALLOW_WRITES=true` as the existing trusted operational boundary. Submission writes only the durable job journal. Inspection reads the configured runtime and artifact roots and cannot instantiate a provider registry, write artifact bytes, update an approved reference or promote artwork.

## Provider policy

Adapter IDs and an optional model are deployment policy, not Book Studio creative input. Credentials are not accepted in the work order, runtime payload or artifact metadata. The REST, CLI and MCP hosts use:

```text
EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS
EVAVO_BOOK_ART_PROVIDER_PREFERRED_ADAPTER
EVAVO_BOOK_ART_PROVIDER_MODEL
```

`EVAVO_BOOK_ART_PROVIDER_ADAPTER_IDS` is a comma-separated allow-list. Preferred adapter and model are optional, but the preferred adapter must be present in the allow-list. The worker host independently configures the real provider registry and credentials; those values never enter the Book Art request.

The initial shadow boundary intentionally rejects provider reference artifacts. Legacy artwork registration and future governed reference-image use remain separate migration gates because they require exact byte registration, rights evidence and cross-repository identity parity.

## Idempotency and paid-call safety

The runtime journal is authoritative for execution identity. Duplicate submission before execution, during queue residence or after successful completion resolves to the same job. An already succeeded job is not claimable again, so another worker pass remains idle and the provider adapter is not called a second time.

The regression suite uses a counting fixture adapter to prove:

1. duplicate submissions create one `job.submitted` event and one durable job;
2. the worker leases and completes that job once;
3. the fixture adapter is called once;
4. resubmission after success still returns the same job;
5. a later worker cycle claims zero jobs;
6. the only image artifact remains an unapproved intermediate candidate;
7. inspection moves from `not-submitted` to `pending` to verified `succeeded` without creating another runtime event, provider request or artifact;
8. tampered approval claims fail closed.

The shared package, REST and CLI tests also prove that compilation writes no job, repeated submission creates one journal identity and inspection performs no write. The fixture proves runtime and artifact semantics without making live provider traffic or claiming that a paid provider, credentials or account configuration has passed production smoke testing.

## Non-authority flags

Compilation, submission, execution and inspection preserve these boundaries:

```text
shadowOnly: true
providerCandidateMayBeFinal: false
authoritativeBookWritesPerformed: false
selectionPerformed: false
promotionPerformed: false
bookUseBindingCreated: false
runtimeCutoverApproved: false
publicationPerformed: false
```

The worker does not write Website or Docs Suite book state. It does not update an approved Art Studio reference. Promotion still requires the existing immutable promotion transaction and evidence checks. Docs Suite can bind artwork only after that separate promotion produces an approved Book Art receipt.

## Validation

The focused `Book Art Provider Runtime` workflow runs on relevant pull-request and mainline changes. It:

- verifies the static authority and REST, CLI and MCP surface-parity boundary;
- installs the review-first workspace dependency graph with the governed Node and pnpm versions;
- builds the complete domain dependency chain, including the shared Book Art runtime package;
- runs the shared runtime, worker execution and inspection, REST, CLI and MCP regression suites;
- runs the repository-wide `pnpm check` on the exact candidate;
- removes the generated lockfile and proves the tracked source remains clean.

The repository-wide exact-main validation still runs after merge. Passing source and fixture tests is not equivalent to receiving a live provider response or approving artwork.

## Remaining migration gates

No production cutover is approved by this slice. Before Website provider execution can be retired, the coordinated migration still requires:

- registration of exact legacy artwork bytes in immutable Art Studio storage without checksum changes;
- authenticated Website-to-Art-Studio shadow requests and success/failure parity evidence using the typed inspection receipt;
- production-provider credential, model and response smoke tests;
- technical mastering and candidate-comparison parity;
- immutable promotion and Docs Suite artwork-use binding for eligible artifacts;
- authenticated cross-repository invocation and agent-authorization parity using the shared REST, CLI and MCP contracts;
- rollback drills, an observation period and an exact deletion manifest.

Until those gates pass, Website remains the active compatibility runtime, Art Studio runs only the explicit shadow candidate path, Docs Suite remains authoritative for book design and publication, and there is still only one authoritative writer. No production cutover is approved.
