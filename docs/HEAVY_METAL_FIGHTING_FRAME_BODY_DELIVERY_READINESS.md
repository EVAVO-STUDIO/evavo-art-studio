# HEAVY METAL FIGHTING — Frame body delivery readiness

Status: governed terminal Art Studio lifecycle boundary  
Asset kind: `frame-body-cel`  
Protocol: `2026-08-14.1`

## Purpose

Delivery readiness closes one Frame body cel inside Art Studio after the exact mastered bytes have received named-human approval. It proves that the live master, the complete approval lineage, and the immutable runtime-delivery metadata still agree before the unit becomes `delivery-ready`.

It deliberately does **not** deliver the asset into the game repository. Repository mutation, atlas compilation, Git publication and deployment remain separate authorities.

```text
selected candidate
      ↓
exact-byte master
      ↓
named-human approval
      ↓
delivery-readiness compilation
      ↓
immutable readiness record
      ↓
delivery-ready receipt
      ↓
complete
```

## Admission requirements

The compiler accepts only a completed `evavo.heavy-metal-fighting-frame-body-named-human-approval-plan.v1` whose persisted workspace still contains the exact governed lineage.

Before readiness can compile, Art Studio reopens and checks:

- the selected decision;
- the named-human creative-review decision;
- the deterministic QA report;
- the candidate-admission record and receipt;
- the selected candidate bytes;
- the selected-candidate mastering record;
- the exact mastered bytes;
- the named-human approval record;
- the named-human-approved receipt chain;
- the immutable work order and runtime-delivery contract.

The master must still be byte-identical to the selected candidate and its SHA-256 and byte count must match the mastering and approval records.

## Readiness request

The system request is explicit and SHA-bound. It contains:

```json
{
  "actorId": "evavo-art-studio-readiness",
  "occurredAt": "2026-08-13T08:08:00.000Z",
  "attestations": {
    "approvalPlanSha256": "<sha256>",
    "approvalRecordSha256": "<sha256>",
    "namedHumanApprovedReceiptSha256": "<sha256>",
    "masterSha256": "<sha256>",
    "exactApprovedMasterRevalidated": true,
    "deliveryMetadataRevalidated": true,
    "noDeliveryPromotionAtlasGitOrPublicationPerformed": true
  }
}
```

The timestamp may not precede named-human approval. Unknown fields, unsafe actors and mismatched attestations fail closed.

## Retained readiness record

The immutable record binds:

- work-order SHA-256;
- policy SHA-256;
- approval plan and record SHA-256 identities;
- named-human-approved receipt SHA-256;
- mastering plan, record and mastered receipt identities;
- selection decision and selection receipt identities;
- selected candidate SHA-256;
- exact master path, SHA-256 and byte count;
- the complete immutable `assetContract` from the work order;
- system executor identity and timestamp;
- explicit no-delivery/no-promotion/no-atlas claims.

For Frame body cels, the retained delivery contract includes native dimensions, authoring canvas, alpha, pivot, ground line, continuity key, review preset, workspace/master paths, legacy-target metadata and the deterministic runtime-delivery contract.

## Persistence

`plan` is read-only. `materialize` is an explicit write boundary.

Persistence is create-only or exact reuse:

1. validate and reconstruct the complete readiness plan;
2. reopen all governed workspace evidence;
3. create or exactly reuse the readiness record;
4. append exactly one hash-linked `delivery-ready` receipt;
5. prove the unit is terminal and `nextAction` is `complete`.

If the readiness record was created by the current transaction but receipt advancement fails, only that transaction-owned record is removed. Existing evidence is never overwritten.

Exact replay returns `already-delivery-ready`.

## Input hardening

Caller-owned compiler and materializer input is captured into bounded immutable JSON before asynchronous workspace work begins. The snapshot layer rejects proxies, accessors, symbols, cycles, sparse arrays, extra fields, non-JSON values, unsafe prototype keys, excessive depth/node count/bytes and caller mutation after invocation.

## CLI

Verify the policy and lifecycle:

```powershell
node scripts\heavy-metal-fighting\frame-body-delivery-readiness-cli.mjs verify
```

Compile a read-only plan:

```powershell
node scripts\heavy-metal-fighting\frame-body-delivery-readiness-cli.mjs plan `
  --approval-plan-json C:\EVAVO\hmf\approval-plan.json `
  --workspace-root C:\EVAVO\hmf-workspace `
  --readiness-request-json C:\EVAVO\hmf\readiness-request.json
```

Materialize the readiness record and terminal receipt:

```powershell
node scripts\heavy-metal-fighting\frame-body-delivery-readiness-cli.mjs materialize `
  --readiness-plan-json C:\EVAVO\hmf\readiness-plan.json
```

## Authority boundary

Delivery readiness grants no authority to:

```text
execute or retry a provider
change candidate pixels
change master pixels
approve automatically
deliver automatically
promote a candidate or master into a game repository
mutate any target repository
compile the final runtime atlas
commit or push Git
deploy
publish
force-push or rewrite history
```

`delivery-ready` means the approved source bytes and their exact delivery metadata are sealed inside Art Studio. A later repository-delivery operation must separately re-admit this record, bind an exact target repository/head, and obtain its own mutation authority.
