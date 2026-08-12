# HEAVY METAL FIGHTING — governed work orders, receipts and repair flow

Status: production execution-planning authority  
Project: **HEAVY METAL FIGHTING**  
Provider execution: not granted by this layer

## Purpose

The 179-batch registry answers **what** must be produced. This layer answers **exactly how one batch is handed to an authorised art provider, reviewed, repaired and resumed without losing good work**.

It remains deliberately non-executing. Art Studio can compile prompts, paths, references, receipts, repair plans and resume state, but it does not silently call a provider, approve an image, promote a master, mutate `steel-dominion`, commit game art or publish a release.

## Immutable work order

Every registry unit compiles into one immutable work order containing:

- exact registry SHA-256 and authority hashes;
- batch and unit identity;
- production wave and prerequisites;
- exact native and authoring dimensions;
- alpha, pivot and ground-line requirements;
- working and master destinations;
- candidate, review, version, receipt and journal paths;
- Pilot or Frame identity authority;
- mechanical construction, landmark, hardpoint and palette reference locations;
- previous and next body-cel references where applicable;
- historical source intent for supporting artwork;
- the final HMF style-authenticity contract;
- technical and anti-generic failure codes;
- one exact provider prompt;
- a deterministic `workOrderSha256`.

A work order always asks for **one image only**. A numbered batch is therefore a bounded group of one to ten independent image jobs, never a request for a contact sheet.

## Candidate intake

Candidate generation is one-at-a-time by policy:

```text
candidate fanout = 1
```

Candidates live under:

```text
scratch/provider/<batch>/<unit>/...
```

until admitted. The provider output is not the working master, not the approved master and not the runtime deliverable.

Candidate admission requires a SHA-256. That hash then remains stable through deterministic QA, creative review, selection, mastering and named-human approval for that attempt.

## Receipt chain

Each unit has a hash-linked receipt chain using the governed batch lifecycle:

```text
planned (implicit)
→ references-locked
→ generation-authorized
→ candidates-admitted
→ deterministic-qa-passed
→ creative-review-passed
→ selected-or-repair-requested
→ mastered
→ named-human-approved
→ delivery-ready
```

`generation-authorized`, `selected-or-repair-requested` and `named-human-approved` require a human actor.

This deliberately prevents an agent from moving directly from “prompt compiled” to “final art”.

## Repair branch

If selection produces:

```json
"outcome": "repair-requested"
```

the current attempt ends. The next linked receipt increments the attempt and restarts at:

```text
generation-authorized
```

The repair template binds:

- exact failed candidate SHA-256;
- exact failure codes;
- exact original work order;
- repair-attempt number;
- candidate and mask paths;
- all sibling unit IDs that are forbidden from regeneration;
- a prompt instructing the provider to change only the failing property while preserving every passing identity, silhouette, palette, landmark, composition, pivot and continuity property.

A bad cel therefore does not destroy nine good siblings.

## Resume planning

Art Studio can compile a resume plan from a batch and its receipt chains. For every unit it reports the current state and one next action:

```text
lock-references
request-generation-authorization
run-provider-once
run-deterministic-qa
run-creative-review
select-or-request-repair
authorize-bounded-repair
master-selected-candidate
request-named-human-approval
compile-delivery-readiness
complete
```

The resume compiler rejects:

- receipts from another work order;
- invalid receipt hashes;
- disconnected chains;
- branching chains;
- skipped normal states;
- a changed candidate hash inside one attempt;
- automatic human-only decisions;
- delivery after a repair request without a new authorised attempt.

## Commands

```powershell
# Exact work orders for one numbered batch
node scripts/heavy-metal-fighting-production-workspace.mjs work-order-batch hmf-b0001

# One exact immutable work order
node scripts/heavy-metal-fighting-production-workspace.mjs work-order <unit-id>

# Receipt schema and path template
node scripts/heavy-metal-fighting-production-workspace.mjs receipt-template <unit-id>

# One bounded repair template
node scripts/heavy-metal-fighting-production-workspace.mjs repair-template <unit-id> `
  --candidate-sha <64-char-sha256> `
  --failure-codes random-greebles,pivot-drift `
  --attempt 1

# Resume with no existing receipts
node scripts/heavy-metal-fighting-production-workspace.mjs resume-batch hmf-b0001

# Resume from an array of hash-linked receipts
node scripts/heavy-metal-fighting-production-workspace.mjs resume-batch hmf-b0001 `
  --receipts-json C:\path\to\receipts.json

# Verify the work-order layer
node scripts/heavy-metal-fighting-production-workspace.mjs work-order-verify
```

## Why this matters for the 1990s visual target

The system is intentionally strict because visual consistency is cumulative. Bastion's tenth animation batch must still use the exact construction, landmark, material and motion identity approved during the first proof. Miho's later portrait must still use the same face and hair mass. Mirage's false-vector effects must still remain separate from its physical body.

Without immutable work orders and receipts, a long generation campaign tends to drift quietly. With them, each image has a traceable visual authority, one bounded purpose and one repair history.
