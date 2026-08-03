# Book Art provider shadow runtime

## Purpose and authority boundary

The Book Art provider runtime is the next controlled migration step between the existing Book Studio compatibility runtime and Art Studio's durable candidate-production infrastructure.

Art Studio owns provider execution, candidate provenance, immutable candidate and evidence storage, technical mastering, comparison, selection evidence and later promotion. Docs Suite remains authoritative for manuscript and visual canon, cover and interior composition, editable typography, illustration placement, ISBN and barcode data, edition geometry, proofing and publication. Website remains the active compatibility runtime while shadow parity, storage registration, rollback and cutover evidence are incomplete.

This slice does not make Art Studio the active Book Studio runtime. It adds a shadow-only path that can compile, submit, execute, inspect and compare the structure of exactly one provider candidate without granting that candidate any final, cutover or publication authority.

## Shared runtime ownership

The reusable compiler, durable-submission boundary, immutable inspection verifier and structural Website parity comparator live in `packages/book-art-runtime` as `@evavo/art-book-runtime`. The worker retains a compatibility re-export only; it no longer owns a second compiler or submission implementation. REST, CLI, MCP and worker tests use the same package contracts, so provider request normalization, fingerprinting, one-attempt policy, idempotency and inspection rules cannot silently diverge.

The package owns deterministic compilation, durable submission, read-only verification and read-only structural parity comparison. It does not create a provider registry, read provider credentials, call a provider, write candidate bytes during compilation or inspection, select artwork, promote a master, bind artwork into a book or publish an edition.

## Compile, submit, execute, inspect, compare

The boundary is deliberately split into five stages.

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

### Compare structural Website parity

`compareBookArtProviderShadowParity()` accepts the exact Art Studio compilation plus one independently fingerprinted Website observation. The Website evidence uses:

```text
evavo_website_book_art_provider_shadow_observation
```

It binds the Website source commit, Book identity, execution ID, source-brief fingerprint, work-order fingerprint, normalized provider-request fingerprint, outcome, one-attempt/no-fallback boundary, adapter and model, failure classification and unapproved-candidate state. The observation fingerprint must match its complete canonical contents before comparison begins.

The comparator reuses immutable Art Studio inspection and reports:

```text
blocked
incomplete
matched
mismatched
```

A deterministic `parityFingerprintSha256` binds the Website summary, Art Studio summary, field-level comparison, blockers, mismatches and warnings. A `matched` result means the request, execution and authority structure agrees. It does not mean that two provider images have identical bytes or visual appearance.

Structural shadow parity does not compare candidate pixels or prove visual similarity. Provider outputs may be stochastic, so candidate bytes are not expected to be equal. The operation writes no runtime job or artifact and cannot approve artwork, selection, promotion, Book use, runtime cutover, source deletion or publication.

```text
parityReadOnly: true
providerCallPerformedByParity: false
artifactWritesPerformedByParity: false
visualSimilarityEvaluated: false
candidateBytesExpectedEqual: false
observationPeriodSatisfied: false
cutoverEligible: false
websiteRuntimeStillActive: true
websiteSourceDeletionAllowed: false
runtimeCutoverApproved: false
publicationPerformed: false
```

A matched receipt is one bounded piece of migration evidence. It does not satisfy the observation period, production-provider smoke test, visual/technical comparison, rollback drill or deletion-manifest gates.

## Register exact legacy artwork bytes

`registerLegacyBookArtBytes()` closes the receiver-side storage-registration gap for eligible legacy Website cover artwork. The operator supplies one exact Website state-import input, the source repository commit and path, and the original image file. Art Studio reruns the fail-closed legacy state importer before it inspects or stores the bytes; a caller cannot substitute a fabricated imported receipt.

Before any artifact write, registration proves:

- the Website quality, candidate-set and selection-binding evidence remains internally consistent;
- the imported state is only `candidate` or `review_required`, never approved;
- the source SHA-256 and byte length match the legacy governed-artifact evidence;
- decoded MIME type, width and height match the imported receipt;
- the source path is a normalized relative Website repository path; and
- rights-blocked or revision-blocked artwork remains blocked.

A successful operation writes the original file byte-for-byte as one immutable `storageClass: source` artifact with `approvalState: unapproved`. It then reads the stored object back, rechecks its checksum and size, compares every stored byte with the supplied source, and writes a separate immutable `book-art-legacy-byte-registration-evidence` JSON artifact. It does not re-encode, resize, recolour, optimise or otherwise rewrite the artwork. It creates no named reference and cannot select, promote or bind the artwork into a book.

The shared boundary is exported as:

```text
@evavo/art-book-runtime/legacy-registration
```

The local CLI accepts a small envelope containing `registration` plus a relative `sourceFile` path:

```text
evavo-art book-art-legacy-register --input legacy-registration.json --artifact-root .art-studio/artifacts --actor migration-operator
```

Registration is deliberately local/root-scoped because the current REST and MCP contracts do not yet define a bounded authenticated binary-upload transport. Website remains the active compatibility runtime. Completing this capability does not prove that the production legacy corpus has been registered, satisfy the observation period, approve runtime cutover or allow Website source deletion.

## REST, CLI and MCP parity

All operator surfaces call `@evavo/art-book-runtime` directly. Inspection requires trusted access to the runtime journal and immutable artifact store, but remains read-only.

### REST

The API exposes:

```text
GET  /v1/book-art/provider-runtime
POST /v1/book-art/provider-jobs/compile
POST /v1/book-art/provider-jobs/submit
POST /v1/book-art/provider-jobs/inspect
POST /v1/book-art/provider-jobs/parity
```

The API host injects its adapter policy. Callers may not send `adapterPolicy` or provider credentials. Compilation is public and read-only. Submission and inspection require the existing Art Studio operational enablement and control token. Submission additionally requires a durable runtime repository. Inspection and parity require both the runtime repository and immutable artifact store. Parity accepts exactly `request` plus a fingerprinted `websiteObservation`; a structural mismatch returns `409`. A successful submission returns `201` whether it created the deterministic job or idempotently reused it. Submission, inspection and parity do not call a provider.

### CLI

The CLI exposes:

```text
evavo-art book-art-legacy-register --input legacy-registration.json --artifact-root .art-studio/artifacts --actor migration-operator
evavo-art book-art-provider-protocol
evavo-art book-art-provider-compile --input request.json
evavo-art book-art-provider-submit --input request.json --runtime-root .art-studio/runtime
evavo-art book-art-provider-inspect --input request.json --runtime-root .art-studio/runtime --artifact-root .art-studio/artifacts
evavo-art book-art-provider-parity --input parity.json --runtime-root .art-studio/runtime --artifact-root .art-studio/artifacts
```

The CLI receives provider policy only from the host environment. The input file contains the execution identity and exact work order but no policy or credentials. Inspection reports `not-submitted` and `pending` without failing the command; a blocked or terminally failed receipt exits non-zero. Parity consumes an envelope containing `request` and `websiteObservation`; blocked or mismatched evidence exits non-zero, while matched or incomplete structural evidence remains machine-readable.

### MCP

The MCP server registers:

```text
book_art_provider_runtime_protocol
compile_book_art_provider_shadow_job
submit_book_art_provider_shadow_job
inspect_book_art_provider_shadow_job
compare_book_art_provider_shadow_parity
```

Compilation is side-effect free. MCP submission and protected inspection require `EVAVO_ART_ALLOW_WRITES=true` as the existing trusted operational boundary. Submission writes only the durable job journal. Inspection and parity read the configured runtime and artifact roots and cannot instantiate a provider registry, write artifact bytes, update an approved reference or promote artwork. Parity additionally refuses to claim visual similarity, cutover eligibility or permission to delete Website source.

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
8. tampered approval claims fail closed;
9. a fingerprinted Website observation matches only when request, outcome, one-attempt policy, adapter/model and candidate authority agree;
10. a model or request mismatch remains explicit and cutover-ineligible.

The shared package, REST and CLI tests also prove that compilation writes no job, repeated submission creates one journal identity and inspection performs no write. The fixture proves runtime and artifact semantics without making live provider traffic or claiming that a paid provider, credentials or account configuration has passed production smoke testing.

## Non-authority flags

Compilation, submission, execution, inspection and structural parity preserve these boundaries:

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

- verifies the static runtime, inspection and structural Website parity authority boundaries across REST, CLI and MCP;
- installs the review-first workspace dependency graph with the governed Node and pnpm versions;
- builds the complete domain dependency chain, including the shared Book Art runtime package;
- runs the shared runtime, worker execution/inspection/parity, REST, CLI, MCP and OpenAPI regression suites;
- runs the repository-wide `pnpm check` on the exact candidate;
- removes the generated lockfile and proves the tracked source remains clean.

The repository-wide exact-main validation still runs after merge. Passing source and fixture tests is not equivalent to receiving a live provider response or approving artwork.

## Remaining migration gates

No production cutover is approved by this slice. Before Website provider execution can be retired, the coordinated migration still requires:

- execution of the exact-byte registrar across the complete production legacy-artwork corpus, with immutable per-item receipts and complete expected-item coverage;
- a sustained batch of authenticated Website-to-Art-Studio shadow requests with matched success/failure structural parity receipts;
- production-provider credential, model and response smoke tests;
- technical mastering and candidate-comparison parity;
- immutable promotion and Docs Suite artwork-use binding for eligible artifacts;
- authenticated cross-repository invocation and agent-authorization parity using the shared REST, CLI and MCP contracts;
- rollback drills, an observation period and an exact deletion manifest.

Until those gates pass, Website remains the active compatibility runtime, Art Studio runs only the explicit shadow candidate path, Docs Suite remains authoritative for book design and publication, and there is still only one authoritative writer. No production cutover is approved.

## Legacy byte registration authority

Legacy byte registration stores the original bytes unchanged as an unapproved source artifact and writes separate immutable byte-registration evidence. It does not create or update a named reference, select or promote artwork, create a Book-use binding, approve runtime cutover, delete Website source, or publish an edition.
