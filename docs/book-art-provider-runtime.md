# Book Art provider shadow runtime

## Purpose and authority boundary

The Book Art provider runtime is the next controlled migration step between the existing Book Studio compatibility runtime and Art Studio's durable candidate-production infrastructure.

Art Studio owns provider execution, candidate provenance, immutable candidate and evidence storage, technical mastering, comparison, selection evidence and later promotion. Docs Suite remains authoritative for manuscript and visual canon, cover and interior composition, editable typography, illustration placement, ISBN and barcode data, edition geometry, proofing and publication. Website remains the active compatibility runtime while shadow parity, storage registration, rollback and cutover evidence are incomplete.

This slice does not make Art Studio the active Book Studio runtime. It adds a shadow-only path that can Compile, submit, execute and inspect exactly one provider candidate without granting that candidate any final or publication authority.

## Compile, submit, execute

The boundary is deliberately split into three stages.

### Compile

`compileBookArtProviderShadowJob()` accepts one exact, fingerprint-valid `evavo_book_art_production_work_order` and a server-approved provider adapter policy. Compilation:

- revalidates the complete Book Art work-order fingerprint;
- requires one independent `generate` candidate;
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

## Idempotency and paid-call safety

The runtime journal is authoritative for execution identity. Duplicate submission before execution, during queue residence or after successful completion resolves to the same job. An already succeeded job is not claimable again, so another worker pass remains idle and the provider adapter is not called a second time.

The regression suite uses a counting fixture adapter to prove:

1. duplicate submissions create one `job.submitted` event and one durable job;
2. the worker leases and completes that job once;
3. the fixture adapter is called once;
4. resubmission after success still returns the same job;
5. a later worker cycle claims zero jobs;
6. the only image artifact remains an unapproved intermediate candidate.

The fixture proves runtime and artifact semantics without making live provider traffic or claiming that a paid provider, credentials or account configuration has passed production smoke testing.

## Non-authority flags

Compilation, submission and execution preserve these boundaries:

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

## Provider policy

Adapter IDs and an optional model are deployment policy, not Book Studio creative input. Credentials are not accepted in the work order, runtime payload or artifact metadata. The server or authenticated worker host chooses the allow-list from its configured provider registry.

The initial shadow boundary intentionally rejects provider reference artifacts. Legacy artwork registration and future governed reference-image use remain separate migration gates because they require exact byte registration, rights evidence and cross-repository identity parity.

## Validation

The focused `Book Art Provider Runtime` workflow runs on relevant pull-request and mainline changes. It:

- verifies the static authority boundary;
- installs the review-first workspace dependency graph with the governed Node and pnpm versions;
- builds the complete domain dependency chain;
- compiles and runs the worker test suite, including adversarial Book Art runtime tests;
- removes the generated lockfile and proves the tracked source remains clean.

The repository-wide exact-main validation still runs after merge. Passing source and fixture tests is not equivalent to receiving a live provider response or approving an artwork.

## Remaining migration gates

No production cutover is approved by this slice. Before Website provider execution can be retired, the coordinated migration still requires:

- registration of exact legacy artwork bytes in immutable Art Studio storage without checksum changes;
- authenticated Website-to-Art-Studio shadow requests and success/failure parity evidence;
- production-provider credential, model and response smoke tests;
- technical mastering and candidate-comparison parity;
- immutable promotion and Docs Suite artwork-use binding for eligible artifacts;
- API, CLI, MCP and agent parity;
- rollback drills, an observation period and an exact deletion manifest.

Until those gates pass, Website remains the active compatibility runtime, Art Studio runs only the explicit shadow candidate path, Docs Suite remains authoritative for book design and publication, and there is still only one authoritative writer.
