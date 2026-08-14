# HEAVY METAL FIGHTING — Frame atlas-v3 readiness admission

Status: governed atlas source-admission boundary  
Protocol: `2026-08-14.1`

## Purpose

The atlas-v3 compiler already requires every Frame body unit to have a complete
`delivery-ready` receipt chain before final workspace atlas assembly. A receipt
head alone, however, is not the full delivery-readiness evidence. The terminal
receipt points at one persisted readiness record that binds the approved master,
named-human approval, complete mastering/selection lineage and immutable
work-order runtime-delivery metadata.

This admission layer independently reopens that record for every authored atlas
source before an atlas plan is accepted as readiness-admitted.

```text
224 delivery-ready receipt heads
        ↓
224 persisted readiness records
        ↓
224 exact master/work-order/runtime-contract bindings
        ↓
readiness-admitted atlas-v3 plan
        ↓
separate deterministic atlas builder
```

## Per-source proof

For every authored slot `0..223`, admission proves:

- the supplied receipt head is self-hashed and has state `delivery-ready`;
- the receipt belongs to the same unit, batch and work order as the atlas source;
- the receipt candidate SHA equals the exact source/master SHA;
- the receipt evidence SHA equals the persisted readiness-record SHA;
- the readiness record is self-hashed and uses the governed schema/protocol;
- the record's previous receipt is the exact named-human-approved receipt;
- the record still claims that no delivery, promotion or atlas compilation occurred;
- the record has no provider, pixel mutation, promotion, target-repository, atlas,
  Git, deployment or publication authority;
- the record's master path/SHA/byte count equals the atlas source;
- the record's candidate SHA equals the atlas source;
- the record's work-order SHA equals the atlas source work order;
- the complete retained delivery contract exactly equals the immutable work-order
  asset contract.

All readiness record paths and SHA-256 identities must be unique across the 224
sources.

## Enriched plan

`compileHmfFrameAtlasV3ReadinessAdmittedPlan()` first invokes the existing
atlas-v3 compiler, then attaches the following source evidence before
recomputing the canonical plan SHA-256:

```text
deliveryReadyReceiptSha256
deliveryReadinessRecordPath
deliveryReadinessRecordSha256
namedHumanApprovedReceiptSha256
approvalRecordSha256
```

The top-level `readinessAdmission` object records its policy SHA, bound record
count and a canonical hash of the complete admission evidence.

The resulting object remains an
`evavo.heavy-metal-fighting-frame-atlas-v3-plan.v1` and is compatible with the
existing deterministic fixed-grid builder. Its `planSha256` now also binds the
readiness evidence.

## Authority boundary

Readiness admission does not:

```text
change source or master pixels
approve art
run or retry providers
deliver automatically
promote assets into steel-dominion
mutate a target repository
compile the final atlas
commit or push Git
deploy or publish
force push or rewrite history
```

It is an evidence gate between terminal per-cel Art Studio lifecycle completion
and the already separate deterministic atlas assembly boundary.
