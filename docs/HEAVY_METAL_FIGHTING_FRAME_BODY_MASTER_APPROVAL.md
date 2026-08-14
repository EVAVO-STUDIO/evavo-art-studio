# HEAVY METAL FIGHTING - Frame body master approval

Status: governed named-human approval boundary  
Input: one exact persisted Frame body master whose receipt state is `mastered`  
Image transformation: prohibited  
Automatic approval: prohibited  
Delivery readiness: separate

## Purpose

The selected-candidate mastering layer copies one reviewed candidate byte-for-byte into the immutable work-order master path. It deliberately stops at:

```text
request-named-human-approval
```

This layer records that separate approval. It does not redraw, alter, promote, deliver or publish the master.

```text
immutable work order
        ↓
candidate admission
        ↓
deterministic QA passed
        ↓
named-human creative review completed
        ↓
named-human selection persisted
        ↓
exact-byte master created
        ↓
mastering record and mastered receipt
        ↓
named-human reviews the exact persisted master
        ↓
immutable approval decision
        ↓
named-human-approved receipt
        ↓
compile-delivery-readiness
```

## Required lineage

Before an approval decision can compile, Art Studio revalidates:

- the exact self-hashed mastering plan;
- the exact persisted mastering record;
- the exact one-link workspace master;
- the mastered production receipt;
- the selected candidate and selected decision;
- the creative-review decision and evidence;
- deterministic QA and candidate admission evidence;
- the unchanged immutable work order;
- the current approval policy;
- the complete hash-linked production receipt chain.

The master bytes, byte count and SHA-256 must still equal the selected candidate and mastering record. A changed master, stale plan, substituted record, competing receipt, unsafe path, hard-linked file or symbolic filesystem component fails closed.

## Human approval request

A real approval request must identify one named human and bind the exact mastered basis:

```json
{
  "actorId": "greg-parker",
  "occurredAt": "2026-08-13T08:07:00.000Z",
  "decision": "approved",
  "rationale": "The exact master preserves the reviewed identity and motion role.",
  "attestations": {
    "candidateSha256": "...",
    "masterSha256": "...",
    "masteringPlanSha256": "...",
    "masteringRecordSha256": "...",
    "masteredReceiptSha256": "...",
    "reviewedExactMasterAtNativeScale": true,
    "reviewedExactMasterAtGameplayScale": true,
    "reviewedExactMasterAtThumbnailScale": true,
    "reviewedExactMasterInSilhouette": true,
    "reviewedExactMasterInGrayscale": true,
    "frameIdentityApproved": true,
    "silhouetteApproved": true,
    "materialReadabilityApproved": true,
    "motionRoleReadabilityApproved": true,
    "noAutomaticApprovalDeliveryPromotionOrPublicationPerformed": true
  }
}
```

The decision accepts only `approved`. A refusal does not fabricate another lifecycle state; the unit remains `mastered` and unapproved until a separate governed remediation path is introduced.

## Exact master review

The named human approves the actual persisted master, not a stale candidate reference or generated proxy.

Required review perspectives are:

```text
native scale
gameplay scale
thumbnail scale
silhouette
grayscale
```

The approval also explicitly checks Frame identity, silhouette, material readability and motion-role readability.

No automated metric can substitute for these attestations.

## Immutable approval decision

The decision binds:

- project, batch, unit, Frame, body slot and attempt;
- workspace and work-order identity;
- current approval-policy SHA-256;
- selection, mastering-plan, mastering-record and mastered-receipt identities;
- candidate and master path, byte count and SHA-256;
- named-human actor identity;
- rationale and exact attestations;
- canonical approval timestamp;
- false automatic approval, delivery, promotion, Git and publication authority.

The approval evidence is hashed. The decision is self-hashed. The `named-human-approved` production receipt uses the approval-evidence SHA-256 and remains linked directly to the mastered receipt.

## Persistence and idempotency

The write-enabled materializer:

- recompiles the decision from embedded governed evidence;
- re-reads the current policy and immutable work order;
- revalidates every persisted lineage file;
- re-reads and hashes the selected candidate and master;
- accepts only the exact mastered predecessor or already-appended identical approval receipt;
- creates or exactly reuses one immutable approval-decision JSON file;
- appends exactly one `named-human-approved` receipt;
- removes only its own newly created decision if receipt advancement fails;
- returns `already-approved` only when the decision and receipt are both exact reusable evidence.

The decision path is:

```text
review/batches/<batch>/<unit>-attempt-<nn>-master-approval-decision.json
```

## CLI

Verify the static boundary:

```powershell
node scripts/heavy-metal-fighting/frame-body-master-approval-cli.mjs verify
```

Compile a read-only approval decision:

```powershell
node scripts/heavy-metal-fighting/frame-body-master-approval-cli.mjs plan `
  --mastering-plan-json <mastering-plan.json> `
  --workspace-root <persistent-workspace> `
  --human-approval-json <human-approval.json>
```

Persist the approval decision and receipt:

```powershell
node scripts/heavy-metal-fighting/frame-body-master-approval-cli.mjs materialize `
  --approval-decision-json <approval-decision.json>
```

## Authority boundary

This runtime may:

```text
read one exact persisted master
read and verify its complete lineage
compile one named-human approval decision
persist that immutable decision
append one named-human-approved receipt
expose compile-delivery-readiness as the next legal action
```

It may not:

```text
call or retry a provider
change candidate or master bytes
transform image bytes
select a candidate
approve automatically
compile delivery readiness automatically
promote into steel-dominion
compile the final runtime atlas
mutate a target repository
commit or push
deploy or publish
```

The next successful boundary must separately compile delivery readiness from the exact named-human approval receipt. Approval alone does not authorize game-repository mutation or final atlas delivery.
