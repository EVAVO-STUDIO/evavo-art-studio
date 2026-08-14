# Art Production Candidate Admission

Art Production technical review does not accept a free-standing candidate object.

A candidate must first be represented by an exact candidate-admission receipt that binds its retained PNG metadata to the currently scheduled one-image job and to caller-supplied provider and inspection evidence. The receipt is a deterministic contract. It does not call a provider, fetch or decode the PNG, inspect pixels, make a technical decision or grant creative approval.

## Position in the governed flow

```text
layered production plan
  -> exact profile and current production loop
  -> dependency-safe one-image batch
  -> provider request and response evidence
  -> retained candidate PNG metadata
  -> separate inspection-evidence identity
  -> scheduled-job candidate-admission receipt
  -> deterministic technical review and bounded repair
  -> named-human creative approval
  -> packaging and runtime-assembly handoff
  -> exact caller-supplied PNG byte admission
```

Candidate admission and source-byte admission are deliberately separate:

- candidate admission proves that the candidate presented for technical review belongs to the exact current scheduled generation or repair job;
- source-byte admission later proves that the approved runtime source bytes are the exact, structurally valid PNG bytes bound through the complete production lineage.

## Why this boundary exists

The iterative loop already produced self-hashed batches and jobs. Before this boundary, `evaluateArtProductionAttempt` accepted caller-supplied candidate metadata containing an artifact ID, SHA-256, byte count, dimensions and alpha policy. Geometry and alpha were checked, but the candidate was not cryptographically connected to the exact current `batchSha256` or `jobSha256`.

That allowed otherwise well-formed metadata to enter technical review without proving which scheduled generation or repair job produced it.

## Contract identity

Protocol `2026-08-15.1` defines:

```text
evavo.art-production.candidate-admission.request
evavo.art-production.candidate-admission.receipt
```

An admission request binds:

- the exact layered-production plan;
- the exact current production loop and profile;
- the exact current batch and one scheduled job;
- the exact unit and attempt number;
- provider identity, model and provider job ID;
- content-addressed provider request evidence;
- content-addressed provider response evidence;
- the retained candidate PNG artifact, SHA-256, byte count, dimensions and alpha policy;
- a separate content-addressed inspection-evidence artifact;
- the admitting operator and canonical UTC admission time.

Provider request evidence, provider response evidence, the retained PNG and inspection evidence must be four distinct artifacts.

## Deterministic compilation

`compileArtProductionCandidateAdmissionReceipt` does not trust caller-supplied scheduling claims.

It first verifies the exact production loop, independently compiles the next batch from that loop, and requires the request to identify one job in that exact batch with the same:

```text
batchSha256
jobSha256
unitId
attemptNumber
mode
expected dimensions
expected alpha policy
```

The receipt retains a `jobBasisSha256` over the current loop, exact batch identity and complete scheduled job.

It also retains:

```text
requestSha256
admissionBasisSha256
admissionReceiptSha256
```

## Verification sequence

`verifyArtProductionCandidateAdmissionReceipt` performs both submitted-payload and semantic verification:

1. Validate every receipt field, content address, timestamp, distinct-evidence constraint and authority value.
2. Recompute the normalized request, governed admission basis and complete receipt identity.
3. Reverify the exact production loop.
4. Recompile the exact current batch and scheduled job.
5. Recompile the canonical receipt from the retained request.
6. Require the canonical and submitted receipt identities to match.

`verifyArtProductionCandidateAdmissionReceiptAgainstRequest` additionally proves that the receipt belongs to the exact caller-retained request rather than another legitimate provider transaction.

This distinguishes:

- retained-hash mutation, which fails submitted-payload verification;
- attacker-rehashed scheduling or authority mutation, which fails deterministic recompilation or the authority gate;
- cross-loop or stale-job replay, which fails current-batch reconstruction;
- a different legitimate provider request, which fails request-bound verification.

## Technical-review integration

`ArtProductionAttemptInput` requires:

```text
candidateAdmissionReceipt
```

The former loose `candidate` input is rejected.

Technical review derives candidate identity only from the verified receipt. Retained attempt history therefore includes the complete admission receipt, and semantic loop replay re-verifies that receipt against the exact prior loop before recomputing metrics, detections, weighted score, repair directives and state transitions.

A review-passed accepted candidate retains direct lineage to:

```text
admissionReceiptSha256
scheduledBatchSha256
scheduledJobSha256
providerRequestSha256
providerResponseSha256
inspectionEvidenceSha256
attemptSha256
weightedScore
```

Named-human approval, packaging, runtime assembly and source-byte admission inherit this lineage through the accepted technical-review attempt.

## MCP surface

The planning-only MCP tool is:

```text
compile_art_production_candidate_admission_receipt
```

It can compile a receipt or verify one against an exact retained admission request. All provider, response, candidate and inspection evidence is supplied by the caller.

The MCP tool does not:

- call an image provider;
- authenticate that a provider actually ran;
- fetch or inspect evidence bytes;
- decode or judge the candidate PNG;
- automatically admit a candidate;
- make a creative decision;
- mutate image bytes;
- execute packaging or assembly;
- write a game repository;
- commit, push, deploy or publish.

Binary source-byte admission remains outside MCP and is available only through the direct `@evavo/art-direction` package API with caller-supplied `Uint8Array` values.

## Authority remains closed

Every candidate-admission receipt states:

```text
providerExecution: false
imageInspection: false
automaticCandidateAdmission: false
creativeDecision: false
imageMutation: false
packagingExecution: false
targetRepositoryMutation: false
gitCommit: false
gitPush: false
publication: false
forcePush: false
```

The compiler records explicit caller-supplied evidence. It does not authenticate legal identity, prove that an external provider actually ran, inspect referenced evidence bytes or determine that the pixels are acceptable. Those remain separate governed operations.

## Adversarial coverage

Focused tests prove that the boundary:

- compiles and verifies an exact current-job receipt;
- rejects the former loose candidate object at technical review;
- rejects retained-hash candidate mutation;
- rejects attacker-rehashed scheduled-job substitution;
- rejects rehashed provider-execution authority escalation;
- distinguishes separate valid provider transactions through request-bound verification;
- rejects replay of a valid receipt against a later loop;
- requires inspection evidence to remain distinct from the retained PNG.
