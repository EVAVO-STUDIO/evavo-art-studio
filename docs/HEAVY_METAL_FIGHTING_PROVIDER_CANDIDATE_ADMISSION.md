# HEAVY METAL FIGHTING Provider Candidate Admission

## Purpose

This boundary admits one successful HEAVY METAL FIGHTING provider result into the persistent Art Studio workspace without granting deterministic QA, creative review, approval, mastering, promotion, game-repository mutation, Git, deployment, or publication authority.

It sits after the governed provider runtime outcome:

```text
human generation authorization
  -> provider execution envelope
  -> second human provider-submission authorization
  -> HMF runtime dispatch
  -> generic @evavo/art-providers runtime contract
  -> one provider call
  -> one candidate artifact plus one evidence artifact
  -> HMF runtime outcome
  -> candidate admission plan
  -> explicit write-enabled candidate admission
  -> candidates-admitted receipt
```

Provider output remains an unapproved intermediate candidate.

## Files

```text
scripts/heavy-metal-fighting/
  frame-body-provider-candidate-admission.mjs
  frame-body-provider-candidate-admission-cli.mjs
  frame-body-provider-candidate-admission.test.mjs
```

## Read-only planning

Planning reads and validates the immutable provider records and local artifact store, but does not create workspace files.

```powershell
node scripts/heavy-metal-fighting/frame-body-provider-candidate-admission-cli.mjs plan `
  --dispatch-json .\dispatch.json `
  --runtime-binding-json .\binding.json `
  --runtime-outcome-json .\outcome.json `
  --receipts-json .\receipts.json `
  --artifact-store-root C:\ArtStudio\artifacts `
  --actor-id provider-runtime:openai-image `
  --occurred-at 2026-08-13T08:04:00.000Z
```

The plan is accepted only when all of the following remain exact:

- The dispatch, binding, and outcome self-hashes are valid.
- All three records identify the same work unit, batch, Frame, body slot, attempt, and submission idempotency key.
- The runtime outcome is `candidate-admission-ready`, not a provider failure.
- Exactly one candidate artifact and one evidence artifact exist.
- The previous production receipt head remains `generation-authorized`.
- The immutable work order still declares the same candidate and receipt paths.
- The candidate does not require post-provider alpha extraction.

Planning returns a hash-bound receipt transition but performs no write.

## Explicit admission

Admission requires both the `admit` command and the separate `--write` switch.

```powershell
node scripts/heavy-metal-fighting/frame-body-provider-candidate-admission-cli.mjs admit `
  --write `
  --dispatch-json .\dispatch.json `
  --runtime-binding-json .\binding.json `
  --runtime-outcome-json .\outcome.json `
  --receipts-json .\receipts.json `
  --artifact-store-root C:\ArtStudio\artifacts `
  --workspace-root C:\ArtStudio\heavy-metal-fighting `
  --actor-id provider-runtime:openai-image `
  --occurred-at 2026-08-13T08:04:00.000Z
```

The workspace root and artifact-store root are supplied at runtime. Neither path is hard-coded.

The write sequence is deliberately ordered:

1. Create or verify the exact scratch candidate.
2. Re-read and hash the materialized candidate.
3. Create or verify the exact receipt-chain bundle.

A receipt can therefore never be created first and point at absent candidate bytes. A crash after candidate creation can be resumed safely: the next call verifies and reuses the exact candidate before creating the receipt bundle.

## Artifact-store verification

The operator validates the canonical local artifact-store layout rather than trusting a caller-supplied source file.

For both candidate and evidence artifacts it verifies:

- `artifact_<sha256>` identity;
- canonical descriptor hash;
- canonical descriptor and object paths;
- immutable content SHA-256 and byte count;
- regular files only;
- no symbolic-link traversal;
- stable file identity while reading.

The candidate descriptor must remain:

```text
mediaType       image/png
storageClass    intermediate
artifactRole    provider-candidate
approvalState   unapproved
candidateIndex  1
```

Its request, Frame, adapter, model, prompt hash, alpha strategy, and QA/mastering requirements must match the runtime binding and outcome.

The evidence descriptor must remain:

```text
mediaType       application/json
storageClass    evidence
artifactRole    provider-candidate-evidence
outcome          candidate-produced
```

The evidence JSON must bind the same request and prompt hashes, one eligible routing decision, one successful adapter attempt, the exact candidate artifact, and `requiresAlphaExtraction: false`.

## PNG structural gate

Admission performs structural verification only. It does not claim deterministic pixel QA.

The PNG must have:

- a valid PNG signature and chunk CRCs;
- one 13-byte `IHDR`;
- one or more valid `IDAT` chunks;
- one terminal `IEND` and no trailing bytes;
- exactly `160 x 160` pixels;
- 8-bit, non-indexed RGBA colour type;
- standard compression and filtering;
- non-interlaced storage;
- a safely bounded inflated scanline size;
- at least one transparent pixel;
- at least one visible pixel.

The result explicitly records:

```text
structuralValidationOnly  true
deterministicQaPassed     false
```

Palette, pivot, silhouette, continuity, crop, transparent RGB, and other production gates remain the responsibility of the later deterministic-QA stage.

## Receipt transition

The previous head must be:

```text
generation-authorized
```

Admission creates exactly the next legal state:

```text
candidates-admitted
```

The receipt binds:

- the runtime-outcome SHA-256 as evidence;
- the materialized PNG content SHA-256 as candidate identity;
- the exact attempt;
- the previous receipt hash;
- a runtime-scoped actor ID.

The provider runtime is normalized into the existing canonical receipt actor class `agent`. This avoids introducing a protocol-breaking fourth receipt actor class while preserving the source runtime class in the admission plan:

```text
sourceRuntimeClass   runtime
canonicalActorClass agent
```

After the receipt is compiled, the existing resume planner must report:

```text
currentState  candidates-admitted
nextAction    run-deterministic-qa
```

## Receipt bundle

The work-order receipt path contains one canonical bundle with:

- project, work-order, unit, and batch identity;
- admission-plan hash;
- runtime-outcome hash;
- candidate path, artifact ID, and content hash;
- evidence artifact ID;
- the ordered receipt chain;
- exact head receipt hash;
- a self-hash for the bundle.

The bundle remains unapproved evidence. It is not a master, delivery record, or publication record.

## Idempotency and conflict handling

Replaying the same admission with the same immutable inputs:

- reuses the existing candidate when its bytes are exact;
- reuses the existing receipt bundle when its bytes are exact;
- returns the same admission-plan and receipt-bundle hashes.

The operator fails closed when:

- an existing candidate has different bytes;
- an existing receipt bundle differs;
- a path leaves its governed root;
- a parent or file is a symbolic link;
- the receipt state has already advanced or is stale;
- the artifact descriptor or object is corrupt;
- the PNG is malformed or has the wrong geometry;
- the provider result contains multiple candidates or fallback attempts;
- the runtime outcome is a provider failure.

## Authority retained outside this operator

Candidate admission may perform only:

```text
candidateMaterialization  true
receiptPersistence        true
```

It may not perform:

```text
deterministicQa
creativeReview
candidateApproval
candidatePromotion
mastering
targetRepositoryMutation
gitMutation
deployment
publication
```

The next legal production action is deterministic QA against the exact admitted candidate SHA-256.
