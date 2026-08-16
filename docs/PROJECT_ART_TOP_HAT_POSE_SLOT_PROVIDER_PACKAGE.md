# Top Hat pose-slot provider package

The Runtime `0.34.0` pose bank truthfully exposes six missing authored Top Hat
body poses. Art Studio already maps those slots to the governed animation suite.
This boundary turns that deterministic production map into the exact provider
job envelopes used by the existing avatar production stack.

It does **not** run a provider, generate an image, approve a candidate, fill a
Runtime slot, modify another repository, deploy or publish.

## Exact schemas

```text
evavo.project-art-top-hat-pose-slot-provider-package-request.v1
evavo.project-art-top-hat-pose-slot-provider-package.v1
evavo.project-art-top-hat-pose-slot-provider-job.v1
evavo.project-art-top-hat-pose-slot-provider-metadata.v1
evavo.project-art-top-hat-pose-slot-provider-package-receipt.v1
```

The package binds the exact current production plan:

```text
Runtime package:       @evavo/avatar-runtime 0.34.0
Runtime commit:        524066fc95fee329e1a20f7c9aa7d805d94c8cc8
Runtime tree:          db8af48a71f1a2708c99f5cea220c7e7dd324e84
Pose bank:             evavo_top_hat_body_pose_bank_v1 1.0.0
Body cadence:          evavo_top_hat_body_display_cadence_v1
Production plan:       evavo.project-art-top-hat-pose-slot-production-plan.v1
Required pose slots:   6
Admitted body anchors: neutral, inhale, exhale
```

A stale plan, altered anchor, changed candidate path, widened authority, missing
slot or substituted Runtime identity fails closed.

## Six exact provider jobs

The compiler emits one job for each unfilled slot:

```text
blink-closed
listening-attentive
thinking-reflective
speech-neutral
presentation-open
presentation-emphasis
```

Every job is limited to:

```text
one named slot
one exact candidate path
one candidate
one human-authorised provider call
one deterministic seed when required
no adapter fallback
```

The package never silently chooses a provider or model. Until an allowed adapter,
seed, exact reference artifacts and a slot-specific named-human authorization
are supplied, the job remains `blocked` and contains no provider request input.

A fully admitted job becomes only:

```text
ready-for-explicit-provider-submission
```

It is not represented as executed, generated, reviewed or approved.

## Exact reference admission

Every slot requires the three current approved body anchors:

```text
anchor:neutral  -> edit-source
anchor:inhale   -> identity-anchor
anchor:exhale   -> identity-anchor
```

Their paths and SHA-256 identities must exactly match the production plan.

Each mapped animation-suite clip also requires a separately admitted reference
artifact. For example, `presentation-open` requires the pinned `talk-engaged`
and `wave` continuity references. Clip artifacts carry an exact source path,
SHA-256, artifact identity, evidence SHA-256, named human actor and timestamp.
Unexpected, duplicate or role-mismatched bindings are rejected.

This keeps repository filenames from being treated as sufficient evidence. The
provider job receives only the exact artifacts admitted for that slot.

## Human one-shot authorization

Provider readiness requires a slot-specific authorization with:

```text
action:               run-top-hat-pose-provider-once
actorClass:           human
actorId:              named identity
slotId:               exact job slot
occurredAt:           canonical UTC timestamp
expiresAt:            no more than 24 hours later
evidenceSha256:       exact approval evidence
maximumProviderCalls: 1
```

An authorization for one slot cannot be replayed for another. Multi-call,
non-human, expired-order or overlong authorizations fail closed.

## Provider request shape

Ready jobs use the same bounded provider request vocabulary as the existing
avatar final-pass stack:

```text
operation:        edit
assetKind:        sprite-frame
continuityPhase: semantic-key-pose
candidateCount:   1
quality:          high
```

The prompt binds:

- the exact Runtime slot and Art Studio continuity mapping;
- the three admitted identity anchors;
- the full `1024 × 1536` canvas, pivot and baseline;
- stable face, anatomy, silhouette, top-hat and wardrobe geometry;
- explicit hand, wrist and finger review where relevant;
- registered-mouth ownership of all visemes and audio timing;
- no synthetic body in-between represented as authored pose art.

The negative contract blocks malformed anatomy, identity drift, crop or
registration drift, fake checkerboards, opaque mattes, chroma spill, alpha
fringes, baked visemes, multiple candidates, contact sheets, labels and text.

## Straight-alpha contract

Every provider target explicitly declares:

```json
{
  "width": 1024,
  "height": 1536,
  "pixelFormat": "rgba8-straight",
  "alphaAssociation": "straight",
  "colourSpace": "srgb",
  "transparency": "required",
  "trimTransparentBorders": false,
  "rotateAtlasRegions": false
}
```

The metadata also carries:

```json
{
  "schema": "evavo.project-art-alpha-encoding.v1",
  "association": "straight",
  "premultiplied": false,
  "colourSpace": "srgb",
  "transparentRgbPolicy": "bounded-visible-rgb-bleed"
}
```

This prevents a technically transparent candidate from silently crossing a
straight-versus-premultiplied boundary and developing dark, pale, green or
magenta edge contamination.

Provider transparency is still not trusted as approval. Actual candidate bytes
must later pass decoded PNG, alpha, hidden-RGB, matte, checkerboard, spill,
canvas-edge, continuity, anatomy, identity and runtime-preview review.

## Create-only package writer

Compile the default blocked handoff artifact:

```bash
node scripts/write-project-art-top-hat-pose-slot-provider-package.mjs \
  --output /absolute/create-only/top-hat-pose-slot-provider-package.json
```

Compile an explicitly admitted request:

```bash
node scripts/write-project-art-top-hat-pose-slot-provider-package.mjs \
  --request /absolute/top-hat-pose-slot-provider-request.json \
  --output /absolute/create-only/top-hat-pose-slot-provider-package.json
```

The writer:

1. Requires ordinary absolute request and output paths.
2. Rejects symbolic or multiply linked request files.
3. Bounds request bytes and validates fatal UTF-8 and JSON.
4. Recompiles and verifies the exact current pose-slot plan.
5. Creates the output with `wx` semantics and mode `0600`.
6. Writes and synchronises the complete deterministic package.
7. Reopens, reparses and independently recompiles the package.
8. Deletes only its own partial output if verification fails.
9. Refuses to overwrite an existing output.
10. Emits a passive receipt to standard output.

The receipt distinguishes package compilation from every later action:

```text
providerExecutionPerformed:  false
candidateBytesMaterialized:   false
candidateApprovalPerformed:   false
poseSlotsFilled:              false
runtimeActivationPerformed:   false
repositoryMutationAuthority:  false
publicationAuthority:         false
forcePushAuthority:           false
```

## Verification

Run the focused suites:

```bash
node --test scripts/test-project-art-top-hat-pose-slot-production.mjs
node --test scripts/test-project-art-top-hat-pose-slot-writer.mjs
node --test scripts/test-project-art-top-hat-pose-slot-provider-package.mjs
node --test scripts/test-project-art-top-hat-pose-slot-provider-package-writer.mjs
```

The tests cover deterministic blocked and fully admitted packages, all six jobs,
one-call authorization, exact anchors, continuity bindings, no fallback,
deterministic seeds, straight-alpha metadata, plan and authority tampering,
path traversal, binding substitution, duplicate and unexpected artifacts,
accessors, cyclic documents, create-only writes, request-file safety and
overwrite refusal.

The dedicated workflow compiles both the production plan and the provider
package, validates their receipts and uploads bounded evidence. The uploaded
provider package remains blocked because CI has no human provider authorization
or admitted runtime reference artifacts.

## Next governed transaction

Real art production remains a separate explicit sequence:

```text
named-human one-shot authorization
  -> exact reference artifact admission
  -> explicit provider submission
  -> one create-only candidate per slot
  -> decoded alpha and hidden-RGB mastering
  -> anatomy, identity and continuity review
  -> named-human candidate approval
  -> hash-bound Runtime pose-bank release plan
  -> separate website installation and activation review
```

Until those transactions complete, Runtime and the website continue to report
one authored body clip, five declared fallbacks and six unfilled pose slots.
