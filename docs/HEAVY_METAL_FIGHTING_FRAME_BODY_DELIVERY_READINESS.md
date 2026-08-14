# HEAVY METAL FIGHTING - Frame body delivery readiness

Status: deterministic terminal Artist Workspace lifecycle boundary  
Input: one persisted named-human-approved Frame body master  
Final atlas compilation: prohibited  
Game-repository promotion: prohibited  
Target-repository mutation: prohibited

## Purpose

Named-human approval binds one explicit human decision to an exact persisted Frame body master and its complete governed lineage. It intentionally stops before declaring the unit delivery-ready.

This layer performs the final per-unit Artist Workspace transition:

```text
exact selected candidate
        ↓
exact-byte workspace master
        ↓
immutable mastering record
        ↓
named-human approval record
        ↓
named-human-approved receipt
        ↓
deterministic delivery-readiness compilation
        ↓
immutable readiness record
        ↓
delivery-ready receipt
        ↓
complete
```

`delivery-ready` is the terminal state in the governed work-order receipt machine. It means the exact approved master and its evidence chain are complete enough to be consumed by a separate atlas or promotion planner. It does not itself build an atlas, copy an asset into `steel-dominion`, activate a runtime, commit, push, deploy or publish.

## Required evidence

Before readiness can compile, Art Studio revalidates:

- the exact self-hashed named-human approval plan;
- the immutable approval record and named-human-approved receipt;
- the selected-candidate mastering plan, record and mastered receipt;
- the persisted selection and creative-review decisions;
- the deterministic-QA report;
- the candidate-admission record and receipt;
- the unchanged selected candidate bytes;
- the exact persisted master bytes;
- the immutable work order and current readiness policy;
- the complete hash-linked receipt chain.

The master path must equal the work-order master path and remain under `masters/`. Its bytes, SHA-256 and byte count must still equal the approved record and selected candidate.

## Readiness request

The deterministic compiler requires one explicit system request:

```json
{
  "actorId": "evavo-art-studio-delivery-readiness",
  "occurredAt": "canonical UTC timestamp",
  "attestations": {
    "candidateSha256": "...",
    "masterSha256": "...",
    "approvalPlanSha256": "...",
    "approvalRecordSha256": "...",
    "approvedReceiptSha256": "...",
    "exactApprovedMasterRevalidated": true,
    "approvalLineageAccepted": true,
    "noAtlasPromotionTargetGitOrPublicationPerformed": true
  }
}
```

The resulting production receipt uses:

```text
actorClass = system
state      = delivery-ready
outcome    = null
```

## Delivery descriptor

The readiness record retains a deterministic descriptor from the immutable work order:

- asset kind;
- exact master path, SHA-256 and byte count;
- native and authoring dimensions;
- alpha, pivot, ground line and continuity contract;
- optional legacy target and runtime-delivery descriptors;
- approval-record and receipt-chain paths;
- terminal workspace state.

This is evidence for a later consumer. It is not target-repository write authority.

## Persistence

The materializer:

1. snapshots and re-admits the complete readiness plan;
2. reconstructs it from its governed evidence;
3. revalidates the current workspace, policy, work order, approval record and master;
4. creates or exactly reuses one immutable readiness record;
5. appends exactly one `delivery-ready` receipt;
6. checks the batch resume state reports `complete` for the unit;
7. removes only its own newly-created record if receipt persistence fails;
8. returns `already-delivery-ready` only when record and receipt are exact reusable evidence.

The record path is:

```text
review/batches/<batch>/<unit>-attempt-<nn>-delivery-readiness.json
```

## Immutable caller-input admission

The public compiler and materializer capture caller-owned input synchronously before asynchronous work. They accept bounded ordinary JSON data only and reject proxies, accessors without invoking getters, symbols, cycles, sparse or extended arrays, exotic prototypes, non-JSON values, non-finite numbers and unsupported fields.

Post-call mutation cannot change the retained readiness compiler, master identity, attestations, receipt or persisted record.

## CLI

Verify the boundary:

```powershell
node scripts/heavy-metal-fighting/frame-body-delivery-readiness-cli.mjs verify
```

Compile a read-only plan:

```powershell
node scripts/heavy-metal-fighting/frame-body-delivery-readiness-cli.mjs plan `
  --approval-plan-json <approval-plan.json> `
  --workspace-root <persistent-workspace> `
  --readiness-request-json <readiness-request.json>
```

Persist the readiness record and terminal receipt:

```powershell
node scripts/heavy-metal-fighting/frame-body-delivery-readiness-cli.mjs materialize `
  --readiness-plan-json <readiness-plan.json>
```

## Authority boundary

This runtime may:

```text
read and verify one exact named-human-approved master
read and verify its complete governed lineage
compile one immutable readiness plan
persist one immutable readiness record
append one delivery-ready receipt
complete the per-unit Artist Workspace lifecycle
```

It may not:

```text
call or retry a provider
change candidate or master bytes
approve automatically
compile the final Frame atlas
promote the master into steel-dominion
mutate the target game repository
commit or push through the runtime
deploy
publish
```

The existing Frame atlas-v3 planner separately requires complete delivery-ready receipt chains for every authored slot before it may compile a workspace export plan. That planner remains write-disabled for the target repository and retains its own runtime-validation and cutover gates.
