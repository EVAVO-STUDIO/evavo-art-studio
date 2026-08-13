# HEAVY METAL FIGHTING - Frame body selected-candidate mastering

Status: governed exact-byte workspace mastering boundary  
Input: one persisted Frame body selection decision whose receipt outcome is `selected`  
Image transformation: prohibited  
Named-human approval: prohibited  
Game-repository promotion: prohibited

## Purpose

The selection layer records one explicit named-human `selected` or `repair-requested` lifecycle outcome. A selected outcome proves which deterministic-QA-passed candidate may advance, but it intentionally does not create a master.

This layer performs the next separate authority:

```text
immutable work order
        ↓
candidate admission
        ↓
deterministic QA passed
        ↓
named-human creative review completed
        ↓
named-human selected outcome persisted
        ↓
read-only mastering plan compilation
        ↓
exact selected-candidate byte revalidation
        ↓
create-only workspace master publication
        ↓
immutable mastering record
        ↓
mastered receipt
        ↓
request-named-human-approval
```

The mastering boundary does not decide whether an asset is good enough. That decision already occurred at selection. It also does not grant final approval. Its only image authority is to copy the exact selected candidate bytes into the immutable work-order master path.

## Required lineage

Before a mastering plan can compile, Art Studio revalidates:

- the exact self-hashed selected decision;
- the exact persisted copy of that decision;
- the named-human selected receipt;
- the complete selection evidence;
- the creative-review decision, evidence and receipt;
- the deterministic-QA report;
- the candidate-admission record and receipt;
- the unchanged selected candidate bytes;
- the immutable work order and master output path;
- the complete hash-linked production receipt chain;
- the current selected-candidate mastering policy.

A `repair-requested` selection, changed candidate, changed receipt chain, stale policy, changed work order, substituted decision, unsafe path or symbolic filesystem component fails closed.

## Mastering request

The read-only plan compiler requires one explicit system mastering request:

```json
{
  "actorId": "evavo-art-studio-mastering",
  "occurredAt": "2026-08-13T08:06:00.000Z",
  "attestations": {
    "candidateSha256": "...",
    "selectionDecisionSha256": "...",
    "selectionEvidenceSha256": "...",
    "selectionReceiptSha256": "...",
    "exactByteMasteringOnly": true,
    "noNamedHumanApprovalGameRepositoryMutationOrPublicationPerformed": true
  }
}
```

The resulting production receipt uses:

```text
actorClass = system
state      = mastered
outcome    = null
```

The actor ID remains explicit and evidence-bound. The system actor may execute the deterministic copy, but it cannot approve the work.

## Exact-byte master contract

The selected candidate is already the candidate whose dimensions, alpha, pivot, ground contact, palette, continuity and runtime mirror rules passed deterministic QA and named-human creative review.

Mastering therefore remains deliberately narrow:

- the master path must equal `workOrder.assetContract.masterOutputPath`;
- the path must remain under `masters/`;
- the master bytes must equal the selected candidate bytes exactly;
- the master SHA-256 must equal the selected candidate SHA-256;
- no resize, crop, resampling, metadata rewrite, colour conversion, alpha rewrite or other image transformation is permitted;
- a conflicting existing master is never replaced;
- an identical existing master may be re-admitted and reused;
- final bytes are read back and rehashed before the receipt chain advances.

This exact-byte rule avoids a second uncontrolled image-processing surface after the candidate has passed review.

## Create-only publication

The write-enabled materializer publishes the master through one same-directory no-replace transaction:

1. create an exclusive mode-`0600` stage file;
2. write and file-sync the exact selected bytes;
3. read back and hash the stage;
4. hard-link the staged inode to the final master path;
5. reject an existing or racing conflicting destination;
6. remove the private stage link;
7. directory-sync where the platform supports it;
8. read back the one-link final master and verify exact bytes again.

The mastering record uses the same create-only or exact-reuse rule. If a later operation fails before the receipt append, the materializer removes only outputs whose exact filesystem identities still belong to that transaction.

## Immutable mastering record

The mastering record binds:

- project, batch, unit, Frame, body slot and attempt;
- workspace and work-order identity;
- current mastering-policy SHA-256;
- selected decision, evidence and receipt hashes;
- candidate path, byte count and SHA-256;
- master path, byte count and SHA-256;
- exact-byte-copy claim;
- system executor identity;
- explicit mastering attestations;
- canonical mastering timestamp;
- false approval, promotion, Git, deployment and publication authority.

The record is self-hashed. The `mastered` production receipt uses the record SHA-256 as its `evidenceSha256` and remains linked directly to the selected receipt.

## Persistence and idempotency

The materializer:

- recompiles the complete mastering plan from its embedded evidence;
- re-reads the current policy and work order;
- revalidates the persisted selection, creative review, QA report, admission record and candidate;
- accepts only the exact selected predecessor chain or the already-appended identical mastered receipt;
- creates or exactly reuses the workspace master;
- creates or exactly reuses the immutable mastering record;
- advances the receipt chain last;
- refuses to replace different master or record bytes;
- returns `already-mastered` only when master, record and receipt are all exact reusable evidence;
- writes nothing outside the persistent Artist Workspace.

The record path is:

```text
review/batches/<batch>/<unit>-attempt-<nn>-mastering-record.json
```

The master path comes only from the immutable work order, for example:

```text
masters/frames/<frame>/animation/body/slot-<nnn>.png
```

## CLI

Verify the static mastering boundary:

```powershell
node scripts/heavy-metal-fighting/frame-body-selected-candidate-mastering-cli.mjs verify
```

Compile a read-only mastering plan:

```powershell
node scripts/heavy-metal-fighting/frame-body-selected-candidate-mastering-cli.mjs plan `
  --selection-decision-json <selection-decision.json> `
  --workspace-root <persistent-workspace> `
  --mastering-request-json <mastering-request.json>
```

Create or exactly reuse the workspace master, persist the record and append the receipt:

```powershell
node scripts/heavy-metal-fighting/frame-body-selected-candidate-mastering-cli.mjs materialize `
  --mastering-plan-json <mastering-plan.json>
```

## Authority boundary

This runtime may:

```text
read one exact selected candidate
compile one immutable mastering plan
create or exactly reuse one work-order-bound workspace master
persist one immutable mastering record
append one mastered receipt
expose request-named-human-approval as the next legal action
```

It may not:

```text
call or retry a provider
change candidate bytes
transform image bytes during mastering
select a candidate
approve the mastered asset
promote the master into steel-dominion
compile the final runtime atlas
mutate the target game repository
commit or push through the production surface
publish or deploy
```

The next successful boundary is a separate named-human approval decision over the exact mastered record and master SHA-256. Only after that approval may another distinct delivery-readiness boundary consider promotion or atlas delivery.
