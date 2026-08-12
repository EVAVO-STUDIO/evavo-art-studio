# HEAVY METAL FIGHTING — style-proof execution

Status: governed production planning and review control  
Style proof: `branka-bastion-foundry-nine`  
Provider execution: prohibited by this layer  
Automatic approval or promotion: prohibited

## Why this layer exists

The final production registry already knows which of the 179 batches are style-proof critical. What it did not previously express was the **cross-batch order** for proving the visual language before the remaining launch art expands.

The style-proof execution controller groups every critical registry batch into four ordered review phases. It never changes the 1,573-image census, repacks a provider request, creates an approval, calls an image provider, or promotes art.

The controller answers a narrower question:

> Given the exact production registry, the recorded human approvals, and any existing work-order receipts, what is the next legal style-proof action?

## Four phases

### 1. Brand and broadcast shell

Family:

- `title-and-shell`

Purpose:

- lock the `HEAVY METAL FIGHTING` title hierarchy;
- establish the mid-1990s broadcast/arcade density;
- prove typography placement zones without provider-generated readable text;
- lock palette restraint, CRT-era framing, menu treatment and non-generic presentation language.

Required incoming approval:

- `style-north-star-approved`

Human completion approval:

- `style-proof-brand-shell-approved`

### 2. Branka and Bastion identity lock

Families:

- `pilot-portraits`
- `frame-construction`

Purpose:

- freeze Branka Kovac's face, hair mass, clothing, scars and proportions;
- freeze Bastion's silhouette, sensor brow, shoulder mass, piston forearms, anchor feet, dorsal shutters and material hierarchy;
- establish the repeatable construction reference used by later body cels and damage/FX work;
- validate the `hydraulic-weight` motion identity before animation expands.

Required incoming approvals:

- `style-north-star-approved`
- `style-proof-brand-shell-approved`

Human completion approval:

- `frame-construction-approved`

This is intentionally the same approval vocabulary already consumed by final Frame body batches.

### 3. Foundry and service-world lock

Families:

- `service-bay-crew-upgrades`
- `pilot-service-animation`
- `arena-layers`

Purpose:

- prove technician and crew scale against the giant Frame;
- lock Danube Works service-cradle logic, maintenance culture, cables, access equipment and industrial staging;
- lock Foundry Nine as a readable fighting arena rather than a generic cyberpunk backdrop;
- keep the Pilot, Frame, service environment and arena inside one coherent 1990s-imagined future.

Required incoming approvals:

- `style-north-star-approved`
- `frame-construction-approved`

Human completion approval:

- `style-proof-world-context-approved`

### 4. Combat material and motion proof

Families:

- `universal-combat-fx`
- `frame-animation`
- `frame-specific-fx`

Purpose:

- prove Bastion's production-master body language at native pixel scale;
- verify load, contact, recoil, punishable recovery and mechanical settle;
- verify impact readability and separate-effects discipline;
- prove CORE/heat/pressure language without baking effects into the physical body;
- prove the Frame remains readable over the approved arena values.

Required incoming approvals:

- `style-north-star-approved`
- `frame-construction-approved`
- `style-proof-world-context-approved`

Final human completion approval:

- `style-proof-approved`

Only after this gate should the remaining non-critical production batches be treated as visually cleared for expansion.

## Production-master versus live runtime

The style proof deliberately separates **art-production readiness** from **runtime promotion readiness**.

Final Frame body work orders remain:

```text
160 x 160 native
640 x 640 authoring canvas
pivot 80,152
true alpha
nearest-neighbour mastering
one physical Frame body cel per work unit
separate FX
```

Those assets may be designed and reviewed before the game migration is complete.

They may **not** be promoted as final live Frame atlases while `steel-dominion` still uses the compatibility atlas. Production-master-v3 requires the separately tested 256-slot game atlas migration first.

The old style-proof semantic requirements and shared-slot collisions remain valuable review evidence. They do not grant permission to collapse production-master-v3 back into the old shared-cell contract.

## CLI

Compile the exact plan:

```powershell
node C:\GitRepos\evavo-art-studio\scripts\heavy-metal-fighting-production-workspace.mjs style-proof-plan
```

Verify its invariants:

```powershell
node C:\GitRepos\evavo-art-studio\scripts\heavy-metal-fighting-production-workspace.mjs style-proof-verify
```

Derive current status without any evidence:

```powershell
node C:\GitRepos\evavo-art-studio\scripts\heavy-metal-fighting-production-workspace.mjs style-proof-status
```

Derive status from external human approvals and receipt history:

```powershell
node C:\GitRepos\evavo-art-studio\scripts\heavy-metal-fighting-production-workspace.mjs style-proof-status `
  --approvals-json C:\ArtistWorkspace\heavy-metal-fighting\receipts\style-proof-approvals.json `
  --receipts-json C:\ArtistWorkspace\heavy-metal-fighting\receipts\style-proof-receipts.json
```

The CLI reads evidence. It does not create or persist approval records.

## MCP

The production MCP adds:

```text
evavo_hmf_production_style_proof_execution
```

With no arguments it returns:

- the exact four-phase plan;
- all critical production batch IDs assigned exactly once;
- source-image totals;
- Branka/Bastion/Foundry Nine proof subjects;
- legacy semantic evidence;
- the 160x160 production-master contract;
- runtime-promotion blockers;
- the first missing approval or next legal action.

Optional `approvalRecords` must identify a human actor and bind an evidence SHA-256. Optional receipts are validated through the existing hash-linked work-order receipt machinery.

## Approval evidence

A style-proof approval record has this shape:

```json
{
  "id": "style-north-star-approved",
  "actorClass": "human",
  "actorId": "reviewer-name-or-id",
  "occurredAt": "2026-08-12T08:00:00Z",
  "evidenceSha256": "<64 lowercase hex characters>"
}
```

This controller accepts such a record as external evidence for planning. It does not claim to have created the approval, does not persist it, and does not bypass the per-work-order named-human approval state.

A phase completion approval supplied before every batch in that phase reaches `delivery-ready` is treated as invalid/premature evidence rather than as permission to continue.

## Expansion rule

The full campaign remains governed by the production registry. This controller only determines when the style-proof subset has earned enough evidence to unlock the rest.

```text
style north star
  -> brand / shell
  -> Branka + Bastion identity
  -> service world + Foundry Nine
  -> combat body + FX proof
  -> style-proof-approved
  -> broader production expansion
```

No phase may silently regenerate passing siblings, pad a batch to ten, merge images into contact sheets, invent human approval, or promote production-master Frame art into the live game before the atlas migration is validated.
