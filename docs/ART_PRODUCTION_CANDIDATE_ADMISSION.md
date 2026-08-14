# Art Production Candidate Admission

Art Production technical review no longer accepts a free-standing candidate object.

A candidate must first be represented by an exact candidate-admission receipt that binds the retained PNG identity to the currently scheduled one-image job and to caller-supplied provider and inspection evidence. The receipt is a deterministic contract. It does not call a provider, download evidence, decode the PNG, inspect pixels, make a technical decision or grant creative approval.

## Why the boundary exists

The iterative loop already produced self-hashed batches and jobs. Before this boundary, `evaluateArtProductionAttempt` accepted caller-supplied candidate metadata containing an artifact ID, SHA-256, byte count, dimensions and alpha policy. Geometry and alpha were checked, but the candidate was not cryptographically connected to the exact current `batchSha256` or `jobSha256`.

That allowed a caller to present otherwise well-formed metadata without proving which scheduled generation or repair job it belonged to.

## Admission request

Protocol `2026-08-14.3` defines:

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

The compiler does not trust caller-supplied scheduling claims.

It independently compiles the next batch from the exact plan and loop, then requires the request to identify a job in that batch with the exact:

```text
batchSha256
jobSha256
unitId
attemptNumber
mode
expected dimensions
expected alpha policy
```

The receipt retains a `jobBasisSha256` over the exact scheduled job and current loop.

It also retains:

```text
requestSha256
admissionBasisSha256
admissionReceiptSha256
```

## Verification sequence

The public verifier performs two classes of proof.

1. It validates the complete submitted receipt envelope, recomputes the normalized request, governed admission basis and full receipt identity, and requires all authority fields to remain false.
2. It recompiles the canonical receipt from the exact plan, loop and current scheduled job and requires the resulting receipt identity to match.

The request-bound verifier additionally proves that a receipt belongs to the exact caller-retained admission request.

This separates:

- retained-hash mutation, which fails submitted-payload verification;
- attacker-rehashed scheduling or authority mutation, which fails deterministic recompilation or the authority gate;
- a different legitimate external evidence request, which is generically valid only as its own receipt and fails verification against another retained request.

## Technical review integration

`ArtProductionAttemptInput` now requires:

```text
candidateAdmissionReceipt
```

The former loose `candidate` input is rejected.

Technical review derives the candidate identity only from the verified receipt. Retained attempt history therefore includes the complete admission receipt, and semantic loop replay re-verifies the receipt against the exact prior loop before recomputing scores, repair directives and state transitions.

A review-passed accepted candidate retains direct lineage to:

```text
admissionReceiptSha256
scheduledBatchSha256
scheduledJobSha256
providerRequestSha256
providerResponseSha256
inspectionEvidenceSha256
attemptSha256
```

Named-human approval and packaging remain downstream of the accepted technical-review attempt, so they inherit the admission binding without gaining provider or image authority.

## Authority remains closed

Every receipt states:

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

The compiler records explicit caller-supplied evidence. It does not authenticate legal identity, prove that an external provider actually ran, inspect the referenced evidence bytes or determine that the pixels are acceptable. Those remain separate governed operations.
