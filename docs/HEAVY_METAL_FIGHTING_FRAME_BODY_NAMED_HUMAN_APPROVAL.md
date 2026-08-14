# HEAVY METAL FIGHTING - Frame body named-human approval

Status: explicit named-human approval boundary  
Input: one persisted exact-byte Frame body master whose production receipt chain ends at `mastered`  
Master mutation: prohibited  
Game-repository promotion: prohibited  
Delivery-readiness and final-atlas compilation: prohibited

## Purpose

Selected-candidate mastering copies the exact reviewed candidate bytes into the immutable work-order master path and records a `mastered` receipt. It intentionally cannot approve the result.

This layer performs the next separate authority:

```text
immutable work order
        ↓
deterministic QA and creative review
        ↓
named-human selected outcome
        ↓
exact-byte workspace master
        ↓
mastering record and mastered receipt
        ↓
read-only approval-plan compilation
        ↓
explicit named-human inspection and approval
        ↓
immutable approval record
        ↓
named-human-approved receipt
        ↓
compile-delivery-readiness
```

Approval does not promote the master, build an atlas, write the game repository or declare delivery readiness. It only records that one named human inspected and approved the exact persisted master and its complete governed lineage.

## Required lineage

Before an approval plan can compile, Art Studio revalidates:

- the self-hashed selected-candidate mastering plan;
- the persisted selection and creative-review decisions;
- the deterministic-QA report;
- the candidate-admission record and receipt;
- the unchanged selected candidate bytes;
- the immutable work order;
- the persisted exact-byte master;
- the persisted mastering record;
- the mastered receipt and complete hash-linked receipt chain;
- the current named-human approval policy.

The master path must equal the immutable work-order master path and remain under `masters/`. The master SHA-256, byte count and bytes must still equal the selected candidate and mastering record. A changed file, stale policy, competing receipt, unsafe path or symbolic filesystem component fails closed.

## Human approval input

```json
{
  "actorId": "stable-named-human-id",
  "occurredAt": "canonical UTC timestamp",
  "decision": "approved",
  "rationale": "bounded human rationale",
  "attestations": {
    "candidateSha256": "...",
    "masterSha256": "...",
    "masteringPlanSha256": "...",
    "masteringRecordSha256": "...",
    "masteredReceiptSha256": "...",
    "exactMasterInspected": true,
    "masteringLineageAccepted": true,
    "independentNamedHumanApproval": true,
    "noMasterMutationPromotionDeliveryGitOrPublicationPerformed": true
  }
}
```

The resulting production receipt always uses:

```text
actorClass = human
state      = named-human-approved
outcome    = null
```

## Immutable approval record

The approval record binds:

- project, batch, unit, Frame, body slot and attempt;
- workspace and work-order identity;
- current approval-policy SHA-256;
- mastering plan, record and mastered-receipt hashes;
- selection decision and receipt hashes;
- candidate and master path, SHA-256 and byte count;
- approver identity and canonical timestamp;
- explicit approval rationale and attestations;
- false master-mutation, promotion, delivery, Git and publication authority.

The record is self-hashed. Its SHA-256 becomes the `evidenceSha256` of the `named-human-approved` receipt.

## Persistence and idempotency

The write-enabled materializer:

- recompiles the approval plan from its own evidence;
- re-reads the current policy and work order;
- revalidates every persisted upstream record and the exact master bytes;
- accepts only the exact mastered predecessor chain or the already-appended identical approval receipt;
- publishes one immutable approval record create-only or exactly reuses it;
- advances the receipt chain last;
- removes only its own newly-created record if receipt persistence fails;
- refuses conflicting approval bytes or competing receipts;
- returns `already-approved` only when the record and receipt are exact reusable evidence;
- writes nothing outside the persistent Artist Workspace.

The record path is:

```text
review/batches/<batch>/<unit>-attempt-<nn>-named-human-approval.json
```

## CLI

Verify the boundary:

```powershell
node scripts/heavy-metal-fighting/frame-body-named-human-approval-cli.mjs verify
```

Compile a read-only approval plan:

```powershell
node scripts/heavy-metal-fighting/frame-body-named-human-approval-cli.mjs plan `
  --mastering-plan-json <mastering-plan.json> `
  --workspace-root <persistent-workspace> `
  --human-approval-json <human-approval.json>
```

Persist the approval record and append the receipt:

```powershell
node scripts/heavy-metal-fighting/frame-body-named-human-approval-cli.mjs materialize `
  --approval-plan-json <approval-plan.json>
```

## Authority boundary

This runtime may:

```text
read and verify one exact mastered Frame body cel
read and verify its complete mastering lineage
compile one named-human approval plan
persist one immutable approval record
append one named-human-approved receipt
expose compile-delivery-readiness as the next legal action
```

It may not:

```text
call or retry a provider
change candidate or master bytes
approve automatically
promote the master into steel-dominion
compile delivery readiness
compile or publish the final atlas
mutate the target game repository
commit or push through the production surface
deploy or publish
```

The next boundary is deterministic delivery-readiness compilation. That later layer must prove the exact approval record and receipt, complete the `delivery-ready` state, and still stop before any separately authorised game-repository promotion.
