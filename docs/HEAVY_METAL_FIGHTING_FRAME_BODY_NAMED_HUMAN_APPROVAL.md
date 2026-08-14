# HEAVY METAL FIGHTING - Frame body named-human approval

Status: explicit named-human approval boundary over one exact workspace master  
Input: one persisted selected-candidate mastering plan whose receipt state is `mastered`  
Automatic approval: prohibited  
Game-repository promotion, final atlas compilation and publication: prohibited

## Purpose

The mastering boundary copies the exact selected candidate bytes into the immutable work-order master path and records a `mastered` receipt. It deliberately does not approve the master.

This layer performs the next separate authority:

```text
named-human selected outcome
        ↓
exact-byte workspace mastering
        ↓
mastered receipt
        ↓
read-only approval decision compilation
        ↓
explicit named-human approval
        ↓
immutable approval evidence
        ↓
named-human-approved receipt
        ↓
compile-delivery-readiness
```

A human may withhold approval by declining to create a decision. The runtime only persists an affirmative approval when the named reviewer explicitly supplies `approved: true` and all exact-master attestations.

## Required lineage

Before approval can compile, Art Studio revalidates:

- the self-hashed mastering plan;
- the immutable mastering record;
- the exact `mastered` receipt;
- the selected decision and complete receipt lineage;
- the creative-review decision;
- the deterministic-QA report;
- the candidate-admission record;
- the unchanged candidate bytes;
- the exact persisted workspace master;
- the current work order and master output path;
- the current named-human approval policy.

The persisted master path, SHA-256 and byte count must match the mastering record and selected candidate exactly.

## Human approval input

```json
{
  "actorId": "stable-named-human-id",
  "occurredAt": "canonical UTC timestamp",
  "approved": true,
  "rationale": "bounded human rationale",
  "attestations": {
    "masteringPlanSha256": "...",
    "masteringRecordSha256": "...",
    "masteredReceiptSha256": "...",
    "masterSha256": "...",
    "masterBytes": 1234,
    "exactMasterInspected": true,
    "approvalIsExplicitAndNamedHuman": true,
    "noPromotionAtlasGitDeploymentOrPublicationPerformed": true
  }
}
```

The input is a closed contract. Missing or additional fields fail closed.

## Approval evidence

The immutable approval decision binds:

- project, batch, unit, Frame, body slot and attempt;
- persistent workspace and immutable work order;
- current approval-policy SHA-256;
- mastering plan, mastering record and mastered receipt hashes;
- selected decision identity;
- exact master path, SHA-256 and byte count;
- named approver identity;
- explicit rationale and attestations;
- canonical approval timestamp;
- false automatic approval, promotion, atlas, Git, deployment and publication authority.

## Persistence and idempotency

The write-enabled materializer:

- recompiles the approval decision from its embedded evidence;
- re-reads the current policy, work order, master, mastering record and lineage;
- accepts only the exact mastered predecessor chain or the already-appended identical approval receipt;
- writes one create-only or byte-identical reusable approval decision;
- appends one `named-human-approved` receipt;
- advances the next legal action to `compile-delivery-readiness`;
- removes only transaction-owned approval output if receipt advancement fails;
- replays idempotently when the approval decision and receipt are already exact.

The decision path is:

```text
review/batches/<batch>/<unit>-attempt-<nn>-named-human-approval.json
```

## CLI

Verify the static approval boundary:

```powershell
node scripts/heavy-metal-fighting/frame-body-named-human-approval-cli.mjs verify
```

Compile a read-only approval decision:

```powershell
node scripts/heavy-metal-fighting/frame-body-named-human-approval-cli.mjs decision `
  --mastering-plan-json <mastering-plan.json> `
  --workspace-root <persistent-workspace> `
  --human-approval-json <human-approval.json>
```

Persist the decision and append the approval receipt:

```powershell
node scripts/heavy-metal-fighting/frame-body-named-human-approval-cli.mjs materialize `
  --approval-decision-json <approval-decision.json>
```

## Authority boundary

This runtime may read and verify the exact workspace master, record one named-human approval decision and append one approval receipt.

It may not call a provider, change image bytes, approve automatically, promote the master into the game repository, compile the final atlas, mutate Git, deploy or publish.

The next successful boundary is a separate delivery-readiness compiler. That compiler must re-admit the exact approval receipt before any later promotion or atlas-delivery surface can be considered.
