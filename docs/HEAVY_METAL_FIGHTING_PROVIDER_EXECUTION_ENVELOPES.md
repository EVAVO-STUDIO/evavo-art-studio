# HEAVY METAL FIGHTING — provider execution envelopes

Status: exact provider-request compilation boundary  
Provider execution: **false**  
Automatic generation authorization: **false**  
Reference artifact admission: **false**  
Base work-order mutation: **false**  
Choreography-overlay mutation: **false**

## Purpose

HEAVY METAL FIGHTING now has two complementary immutable production authorities for every final Frame body cel:

```text
base work order
    identity
    dimensions
    source references
    one-image boundary
    candidate path
    failure codes
    receipt lifecycle
    workOrderSha256

supplemental choreography overlay
    exact semantic body role
    Frame-specific physical realization
    named move context
    FX separation
    overlaySha256
```

A provider job needs both, but neither object should be rewritten merely to create a request.

The provider execution envelope composes them into a third independently hashed object:

```text
base workOrderSha256
+
choreography overlaySha256
+
human generation-authorization receipt head
+
human-admitted provider reference artifacts
+
exact composed prompt
+
one-candidate provider request input
=
executionEnvelopeSha256
```

The envelope can report `ready-for-explicit-provider-submission`, but it still cannot execute the provider itself.

## Why this is separate from the work order

The base work order is already used by receipt chains. Mutating its prompt would invalidate:

- the original `workOrderSha256`;
- existing references-locked evidence;
- generation-authorization evidence;
- repair and review receipts;
- later mastering and delivery evidence.

The execution envelope preserves those hashes while letting provider-facing direction improve through separately governed overlays.

## Legal execution point

The receipt state machine already defines the one legal moment for a provider call:

```text
references-locked
    ↓
generation-authorized  ← named human required
    ↓
nextAction = run-provider-once
```

The envelope is submit-ready only when its verified unit state reports all three:

```text
currentState = generation-authorized
nextLegalAction = run-provider-once
headReceiptSha256 = valid SHA-256
```

A planned unit is blocked.

A unit waiting for authorization is blocked.

A unit whose candidate has already been admitted is also blocked from accidental duplicate execution.

A repair becomes eligible only after the receipt chain advances to a new human `generation-authorized` state for the next attempt.

## Provider reference admission

The immutable work order contains logical reference paths such as:

```text
styleNorthStar
stylePalette
styleMaterials
styleLighting
pixelGrammar
antiGeneric
frameConstruction
frameLandmarks
frameHardpoints
framePalette
previousCel
nextCel
```

Those paths are not fabricated into provider artifact IDs.

The envelope returns exact `referenceRequirements`. A separate artifact-store admission process must bind each requirement to:

```json
{
  "unitId": "hmf.frame-animation.bastion.slot-121",
  "bindingKey": "frameConstruction",
  "sourcePath": "working/frames/bastion/construction",
  "artifactId": "artifact_<sha256>",
  "evidenceSha256": "<sha256>",
  "actorClass": "human",
  "actorId": "named-reviewer",
  "occurredAt": "2026-08-13T01:00:00.000Z"
}
```

Admission fails closed when:

- the binding key is not required;
- the source path differs from the immutable work order;
- an artifact ID is malformed;
- evidence is missing;
- the same binding is duplicated;
- the admission actor is not human.

The envelope does not write these artifacts or admission records.

## Reference role mapping

Logical authorities are mapped to the provider protocol vocabulary:

| Work-order binding | Provider role |
| --- | --- |
| Frame construction | canonical identity |
| Style north star / lighting / anti-generic | direction master |
| Frame landmarks | pose control |
| Frame hardpoints | edge control |
| Frame and global palettes | palette reference |
| Pixel grammar | line reference |
| Materials | material reference |
| Previous cel | previous key pose |
| Next cel | next key pose |

An interior animation cel therefore cannot become submit-ready without:

```text
canonical identity
previous key pose
next key pose
```

The final provider package will independently validate the same continuity requirements again before execution.

## Exact prompt composition

The envelope performs one exact composition:

```text
baseWorkOrder.providerPrompt
+
"\n\n"
+
supplementalOverlay.supplementalProviderPrompt
```

It records:

```text
baseProviderPromptSha256
supplementalProviderPromptSha256
composedProviderPromptSha256
```

It does not paraphrase either authority.

## Provider request input

After all references are admitted, the envelope compiles an adapter-neutral provider candidate request using the repository’s canonical provider protocol shape:

```text
operation          generate
asset kind         sprite-frame
candidate count    1
quality             high
target              160 × 160 RGBA PNG
source canvas       640 × 640
background          native alpha
fallback            disabled
```

For an interior cel the continuity phase is `in-between`.

For a boundary drawing it is `key-pose`.

The canonical ready cel can act as `identity-master`.

The request metadata retains:

- unit and batch IDs;
- registry SHA-256;
- base work-order SHA-256;
- choreography-overlay SHA-256;
- body slot, bank and semantic role;
- exact candidate output path;
- entirely false approval flags.

## One-candidate rule

The envelope inherits:

```text
candidateFanout = 1
candidateCount = 1
```

One provider submission may therefore produce one candidate for one exact work unit.

It cannot create an uncontrolled variation fanout, contact sheet, multi-frame sheet, alternate design set or provider-packed atlas.

## Candidate output

The base work order remains authoritative for the candidate destination.

The envelope resolves candidate number one from the existing template, for example:

```text
scratch/provider/<batch>/<unit>/<name>-cand-01.png
```

No passing sibling is regenerated.

## API

```javascript
import {
  heavyMetalFightingProviderExecutionEnvelope,
  buildHmfProviderExecutionEnvelopeBatch,
  verifyHmfProviderExecutionEnvelopes,
} from "./scripts/heavy-metal-fighting/frame-body-provider-execution-envelope.mjs";
```

Compile a blocked template:

```javascript
await heavyMetalFightingProviderExecutionEnvelope(
  "hmf.frame-animation.bastion.slot-121",
);
```

Compile with external evidence:

```javascript
await heavyMetalFightingProviderExecutionEnvelope(
  "hmf.frame-animation.bastion.slot-121",
  {
    receipts,
    artifactBindings,
  },
);
```

## CLI

Verify the complete envelope contract:

```powershell
node scripts/heavy-metal-fighting/frame-body-provider-execution-envelope-cli.mjs verify
```

Inspect a blocked work-order envelope:

```powershell
node scripts/heavy-metal-fighting/frame-body-provider-execution-envelope-cli.mjs `
  work-order hmf.frame-animation.bastion.slot-121
```

Compile against external receipt and artifact-admission evidence:

```powershell
node scripts/heavy-metal-fighting/frame-body-provider-execution-envelope-cli.mjs `
  work-order hmf.frame-animation.bastion.slot-121 `
  --receipts-json C:\ArtistWorkspace\heavy-metal-fighting\manifests\receipts\bastion-receipts.json `
  --artifact-bindings-json C:\ArtistWorkspace\heavy-metal-fighting\manifests\provider\bastion-reference-bindings.json
```

Compile a complete governed Frame-animation batch:

```powershell
node scripts/heavy-metal-fighting/frame-body-provider-execution-envelope-cli.mjs `
  batch hmf-b0123 `
  --receipts-json C:\ArtistWorkspace\heavy-metal-fighting\manifests\receipts\batch-0123.json `
  --artifact-bindings-json C:\ArtistWorkspace\heavy-metal-fighting\manifests\provider\batch-0123-reference-bindings.json
```

A supporting-art batch is rejected rather than being misrepresented as a Frame body execution batch.

## Batch behaviour

A batch envelope:

- reuses the exact existing work-order batch;
- reuses the exact choreography-overlay batch;
- preserves the `workOrderBatchSha256`;
- preserves the overlay-batch SHA-256;
- contains one envelope for each existing work order;
- remains between one and ten units;
- does not pad a partial batch;
- reports ready and blocked counts;
- never invokes a provider.

## Authority boundary

This layer may:

```text
compose prompts
validate receipt-chain readiness
validate supplied artifact-admission evidence
compile provider request inputs
calculate hashes
report blockers
```

It may not:

```text
authorize generation
admit reference artifacts
persist receipts
execute a provider
approve candidates
promote candidates
mutate base work orders
mutate choreography overlays
mutate receipt chains
write steel-dominion
commit or push
deploy or publish
```

Even a submit-ready envelope states:

```text
providerExecution = false
explicitWriteEnabledRuntimeCallRequired = true
```

The actual provider call must remain a separate, explicit, write-enabled runtime operation whose output is still only a candidate.
