# HEAVY METAL FIGHTING — provider submission manifests

Status: second human gate and runtime-submission instruction compiler  
Provider execution: **false**  
Runtime enqueue: **false**  
Candidate approval: **false**  
Image generation performed by this layer: **none**

## Purpose

A submit-ready HEAVY METAL FIGHTING provider execution envelope proves that:

```text
one immutable body-cel work order exists
one hash-bound choreography overlay exists
all required reference artifacts were admitted by a named human
current receipt state is generation-authorized
next legal receipt action is run-provider-once
one adapter-neutral provider request can be compiled
```

That is still not enough to enqueue or execute the provider.

The provider submission manifest adds a second explicit named-human decision:

```text
ready provider execution envelope
        +
named-human provider-submission authorization
        =
authorization-bound runtime submission instruction
```

This closes the ambiguity between:

```text
the unit is technically ready for one call
```

and:

```text
a named human deliberately authorizes this exact call now
```

## Two distinct human gates

### Gate 1 — generation authorization

The existing production receipt chain must end at:

```text
state       generation-authorized
next action run-provider-once
actor       human
```

This proves the work unit is at the one legal execution point.

### Gate 2 — provider submission authorization

A separate record must bind the exact:

```text
unit ID
batch ID
Frame ID
body slot
executionEnvelopeSha256
providerRequestInputSha256
composedProviderPromptSha256
generation-authorization receipt head
current attempt
one-call / one-candidate scope
human actor
evidence SHA-256
canonical UTC timestamp
reason
```

The second record prevents a previously prepared envelope from being submitted merely because it exists.

## Authorization scope

The scope is fixed:

```text
providerCalls      1
candidates         1
oneImage           true
candidateApproval  false
candidatePromotion false
```

No caller can widen this authorization into:

- multiple provider calls;
- multiple candidate variations;
- a contact sheet;
- an entire sprite bank;
- a packed atlas;
- automatic approval;
- automatic promotion.

## Hash chain

The manifest retains the existing production hashes and adds two more:

```text
workOrderSha256
choreographyOverlaySha256
executionEnvelopeSha256
providerRequestInputSha256
authorizationSha256
runtimeSubmissionInstructionSha256
submissionManifestSha256
```

Changing any bound prompt, reference artifact, receipt head, attempt, output path, actor, reason, or authorization scope changes or invalidates the chain.

## Runtime submission instruction

After both gates pass, the manifest compiles an exact instruction for a later write-enabled runtime boundary:

```text
provider package  @evavo/art-providers
compiler export   compileProviderCandidateRuntimeContract
request input     exact envelope providerRequestInput
candidate count   1
provider calls    1
output path       immutable work-order candidate path
next receipt      candidates-admitted
```

The instruction requires canonical provider-contract validation at submission time. It does not duplicate or bypass the provider package's validation.

## Idempotency

Each authorized instruction receives a deterministic outer idempotency key:

```text
hmf-provider-submit:<first 40 hex characters of authorizationSha256>
```

The later write-enabled runtime must use this binding so retries of the same authorized submission do not become new creative attempts.

The instruction still expects one provider result or one explicit provider-failure receipt. A new creative attempt requires a new governed receipt attempt and new human authorization.

## Required postconditions

A write-enabled runtime consumer must prove:

1. the canonical provider runtime contract compiled successfully;
2. exactly one candidate result or one explicit provider failure was recorded;
3. candidate bytes were stored only at the governed scratch candidate path;
4. the production receipt chain advanced to `candidates-admitted` before QA;
5. provider execution did not approve, promote, deliver, or publish the candidate.

## CLI

Verify the layer:

```powershell
node scripts/heavy-metal-fighting/frame-body-provider-submission-manifest-cli.mjs verify
```

Inspect a blocked manifest:

```powershell
node scripts/heavy-metal-fighting/frame-body-provider-submission-manifest-cli.mjs `
  work-order hmf.frame-animation.bastion.slot-121
```

Compile the named-human authorization after the execution envelope is ready:

```powershell
node scripts/heavy-metal-fighting/frame-body-provider-submission-manifest-cli.mjs `
  authorization hmf.frame-animation.bastion.slot-121 `
  --receipts-json C:\ArtistWorkspace\heavy-metal-fighting\manifests\receipts\bastion-slot-121.json `
  --artifact-bindings-json C:\ArtistWorkspace\heavy-metal-fighting\manifests\provider\bastion-slot-121-references.json `
  --actor-id greg-parker `
  --occurred-at 2026-08-13T03:03:00.000Z `
  --evidence-sha <sha256> `
  --reason "Authorize one provider call for one exact GRAVEBELL hero-impact candidate."
```

Compile the authorization-bound manifest:

```powershell
node scripts/heavy-metal-fighting/frame-body-provider-submission-manifest-cli.mjs `
  work-order hmf.frame-animation.bastion.slot-121 `
  --receipts-json C:\ArtistWorkspace\heavy-metal-fighting\manifests\receipts\bastion-slot-121.json `
  --artifact-bindings-json C:\ArtistWorkspace\heavy-metal-fighting\manifests\provider\bastion-slot-121-references.json `
  --submission-authorization-json C:\ArtistWorkspace\heavy-metal-fighting\manifests\provider\bastion-slot-121-submit-authorization.json
```

Compile a governed Frame-animation batch:

```powershell
node scripts/heavy-metal-fighting/frame-body-provider-submission-manifest-cli.mjs `
  batch hmf-b0123 `
  --receipts-json C:\ArtistWorkspace\heavy-metal-fighting\manifests\receipts\batch-0123.json `
  --artifact-bindings-json C:\ArtistWorkspace\heavy-metal-fighting\manifests\provider\batch-0123-references.json `
  --submission-authorizations-json C:\ArtistWorkspace\heavy-metal-fighting\manifests\provider\batch-0123-submit-authorizations.json
```

The CLI prints JSON. It does not enqueue or execute a job.

## MCP

The read-only production MCP exposes:

```text
evavo_hmf_production_provider_submission_manifest
evavo_hmf_production_provider_submission_manifest_batch
```

These tools can:

- show why an envelope remains blocked;
- return the exact second-gate authorization template;
- validate a supplied authorization record;
- compile the runtime submission instruction;
- report authorized, awaiting, and blocked batch counts.

They cannot create evidence, impersonate a human decision, enqueue runtime jobs, execute a provider, store candidate bytes, or advance receipts.

## Batch behaviour

A batch manifest:

- reuses the exact existing one-to-ten-unit Frame-animation batch;
- reuses the exact provider execution envelope batch;
- accepts at most one authorization per unit;
- rejects authorizations for units outside the batch;
- never pads a partial batch;
- reports authorized, awaiting, and blocked counts;
- rejects supporting-art batches.

## Authority boundary

This layer may:

```text
validate execution-envelope hashes
validate named-human submission authorization
compile one-call / one-candidate instructions
calculate deterministic hashes and idempotency keys
report blockers and next legal actions
```

It may not:

```text
enqueue runtime jobs
execute image providers
admit reference artifacts
persist receipts or authorization evidence
approve candidates
promote candidates
rewrite work orders or choreography overlays
mutate receipt chains
write steel-dominion
commit or push
publish assets
```

Even an authorized manifest states:

```text
providerExecution = false
runtimeEnqueue = false
explicitWriteEnabledRuntimeCallRequired = true
```

The next implementation boundary is therefore narrow and auditable: consume one authorized instruction, compile the canonical provider runtime contract, enqueue it exactly once, and return candidate or failure evidence without granting any review or promotion authority.
