# HEAVY METAL FIGHTING — provider envelope agent surface

The existing read-only HEAVY METAL FIGHTING production MCP now exposes two provider-envelope tools:

```text
evavo_hmf_production_provider_execution_envelope
evavo_hmf_production_provider_execution_envelope_batch
```

The server version is `1.5.0`.

## One work unit

```json
{
  "name": "evavo_hmf_production_provider_execution_envelope",
  "arguments": {
    "unitId": "hmf.frame-animation.bastion.slot-121",
    "receipts": [],
    "artifactBindings": []
  }
}
```

Without evidence, the tool returns a blocked envelope containing:

- exact base work-order SHA-256;
- exact choreography-overlay SHA-256;
- exact composed provider prompt and prompt hashes;
- required provider reference roles;
- missing reference binding keys;
- current receipt state and next legal action;
- one-candidate target and candidate output path;
- explicit non-authority declarations.

Supplying valid external receipt and reference-admission evidence can make the returned envelope `ready-for-explicit-provider-submission`.

That state does **not** execute anything. The returned object still declares:

```text
providerExecution = false
referenceArtifactAdmission = false
receiptPersistence = false
candidateApproval = false
candidatePromotion = false
targetRepositoryMutation = false
gitMutation = false
publication = false
explicitWriteEnabledRuntimeCallRequired = true
```

## Batch

```json
{
  "name": "evavo_hmf_production_provider_execution_envelope_batch",
  "arguments": {
    "batch": "hmf-b0123",
    "receipts": [],
    "artifactBindings": []
  }
}
```

The batch tool preserves the existing Frame-animation work-order batch exactly. It returns between one and ten envelopes and never pads a partial batch.

Every artifact binding in a batch request must identify its exact `unitId`.

## Evidence inputs

A receipt array contains the existing hash-linked HMF production receipts. The envelope accepts a provider call only when the unit’s verified resume state ends at:

```text
currentState = generation-authorized
nextLegalAction = run-provider-once
```

An artifact binding contains:

```json
{
  "unitId": "hmf.frame-animation.bastion.slot-121",
  "bindingKey": "frameConstruction",
  "sourcePath": "working/frames/bastion/construction",
  "artifactId": "artifact_<sha256>",
  "evidenceSha256": "<sha256>",
  "actorClass": "human",
  "actorId": "named-human-reviewer",
  "occurredAt": "2026-08-13T01:00:00.000Z"
}
```

The MCP validates this evidence in memory. It does not store the receipt, admit the artifact, or claim that the referenced bytes exist in an artifact store.

## Combined verification

```text
evavo_hmf_production_verify
```

now composes:

```text
production registry
style-proof execution
atlas-v3 layout
44-move body choreography
body choreography overlays
provider execution envelopes
immutable work orders
```

A failure in any layer makes the combined verification fail.

## Safety boundary

These MCP tools are for inspection and deterministic compilation only. They cannot:

- generate art;
- invoke a provider;
- record human authorization;
- admit reference artifacts;
- persist receipt chains;
- approve or promote a candidate;
- rewrite a work order or overlay;
- change combat timing;
- write `steel-dominion`;
- commit, push, deploy, or publish.
