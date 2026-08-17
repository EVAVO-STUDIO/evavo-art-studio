# Top Hat pose-slot provider runtime adapter

The Runtime `0.34.0` Top Hat pose bank declares six missing authored body poses.
Art Studio now has three separate, deliberately narrow boundaries:

```text
pose-slot production plan
→ exact reference and authorization package
→ guarded provider-runtime adapter
```

The adapter is the first boundary that can compile one selected Top Hat slot into
the existing generic avatar provider runtime. It does **not** call a provider,
enqueue a runtime job, materialize an image, approve a candidate, fill a pose
slot, mutate a repository, deploy, publish or activate the Runtime.

## Why a guarded adapter is required

The Top Hat provider package and the established avatar runtime intentionally
use different vocabularies.

The Top Hat package retains:

```text
six named Runtime slots
slot-specific one-shot human authorization
authorization expiry
maximumProviderCalls: 1
neutral / inhale / exhale body anchors
animation-suite continuity evidence
straight-alpha metadata
governed reviewed target paths
```

The generic avatar runtime expects:

```text
provider-redraw
key-pose
run-provider-once
base-image
canonical-identity
scratch/avatar-final-pass/<session>/<frame>/candidate-01.png
evavo.project-art-avatar-final-pass-provider-metadata.v1
```

The adapter maps those contracts without weakening either parser.

It deliberately does **not** persist a timeless generic provider batch. The
self-hashed adapter retains the complete exact Top Hat request. Each selected
slot is recompiled and checked again when its dispatch is created. Dispatch
compilation must occur inside that slot's original named-human authorization
window.

## Exact schemas

```text
evavo.project-art-top-hat-pose-slot-provider-runtime-adapter.v1
evavo.project-art-top-hat-pose-slot-provider-runtime-adapter-metadata.v1
evavo.project-art-top-hat-pose-slot-provider-runtime-adapter-capabilities.v1
evavo.project-art-top-hat-pose-slot-provider-runtime-adapter-receipt.v1
evavo.project-art-top-hat-pose-slot-provider-runtime-dispatch-receipt.v1
```

The output dispatch retains the existing generic schema:

```text
evavo.project-art-avatar-final-pass-provider-runtime-dispatch.v1
```

That means the existing generic runtime binder, outcome normalizer, candidate
materializer, PNG inspector and frame finisher remain the one production path.

## Six exact guarded slots

```text
blink-closed
listening-attentive
thinking-reflective
speech-neutral
presentation-open
presentation-emphasis
```

The adapter refuses:

- a blocked source package;
- fewer or more than six jobs;
- a changed slot order or unknown slot;
- non-human or multi-call authorization;
- missing exact body anchors;
- missing continuity evidence;
- changed candidate target paths;
- changed Runtime or Art Studio identity;
- changed plan or package hashes;
- rehashed adapter tampering;
- widened source or adapter authority.

## Reference mapping

The exact admitted neutral body becomes the generic edit source:

```text
anchor:neutral
→ base-image
```

The exact admitted inhale and exhale bodies become identity locks:

```text
anchor:inhale
anchor:exhale
→ canonical-identity
```

Only those three admitted PNG identities are submitted as provider image
references.

Animation-suite continuity evidence remains cryptographically bound inside the
provider request metadata:

```text
source clip ID
source path
source SHA-256
artifact ID
admission evidence SHA-256
named human actor
admission timestamp
```

The adapter does not pretend that a JSON clip reference is an image. Continuity
evidence is therefore not submitted as an unverified provider image reference.
It remains available to candidate evidence, review and later sequence
admission.

## One active authorization window

Each source job already carries:

```text
action:               run-top-hat-pose-provider-once
actorClass:           human
actorId:              named identity
slotId:               exact slot
occurredAt:           canonical UTC timestamp
expiresAt:            no more than 24 hours later
evidenceSha256:       exact approval evidence
maximumProviderCalls: 1
```

The adapter retains that complete authorization.

A dispatch is rejected when:

```text
dispatch compiledAt < occurredAt
dispatch compiledAt > expiresAt
maximumProviderCalls != 1
slotId does not match the selected source job
```

The generic batch used internally for dispatch is created only in memory and is
not the adapter artifact. This prevents the normal workflow from turning a
bounded Top Hat authorization into a reusable, timeless batch file.

## Generic provider request

A selected slot becomes one standard edit job:

```text
kind:             provider-redraw
operation:        edit
continuityPhase: key-pose
candidateCount:   1
quality:          high
fallback:         false
```

The provider-facing image references are:

```text
one base-image
two canonical-identity references
```

The candidate is materialized under:

```text
scratch/avatar-final-pass/top-hat-pose-slots-v1/<slot>/candidate-01.png
```

The separate reviewed target remains:

```text
assets/top-hat-man/candidates/top-hat-man-<slot>-v1.alpha.png
```

The scratch path and reviewed target can never be the same path.

## Native straight-alpha contract

The generic request retains:

```text
width:          1024
height:         1536
transparency:   required
outputFormat:   png
background:     native-alpha
source canvas:  1024 × 1536
```

The Top Hat metadata additionally retains:

```text
rgba8-straight
straight alpha association
sRGB colour space
no atlas trimming
no atlas rotation
bounded visible-RGB bleed policy
registered mouth layer owns visemes
body cadence is independent of visemes
synthetic body in-betweening is forbidden
```

The candidate still must pass the existing decoded PNG, alpha, hidden-RGB,
checkerboard, matte, spill, canvas-edge, registration, anatomy, identity and
continuity checks. Provider metadata is not candidate approval.

## Create-only CLI

Compile the self-hashed adapter:

```powershell
node scripts/top-hat-pose-slot-provider-runtime-cli.mjs adapt `
  --request C:\EVAVO\Evidence\top-hat\provider-request.json `
  --output C:\EVAVO\Evidence\top-hat\runtime-adapter.json `
  --compiled-at 2026-08-16T12:30:00.000Z
```

Compile one guarded dispatch while its authorization remains active:

```powershell
node scripts/top-hat-pose-slot-provider-runtime-cli.mjs dispatch `
  --adapter C:\EVAVO\Evidence\top-hat\runtime-adapter.json `
  --slot-id presentation-open `
  --output C:\EVAVO\Evidence\top-hat\presentation-open.runtime-dispatch.json `
  --compiled-at 2026-08-16T12:31:00.000Z
```

Both commands:

1. require absolute ordinary input and output paths;
2. reject symbolic and multiply linked input files;
3. bind the inspected path to a stable open descriptor;
4. bound input bytes;
5. validate fatal UTF-8 and JSON;
6. recompile the exact current Top Hat package;
7. use create-only `wx` output;
8. write mode `0600`;
9. synchronize the complete file;
10. verify that the finished path still names the written inode;
11. reopen and independently parse the result;
12. remove only their own partial output after verification failure;
13. refuse to overwrite an existing record;
14. emit a passive receipt to standard output.

## Existing downstream chain

The guarded dispatch enters the existing avatar production stack:

```text
guarded Top Hat dispatch
→ @evavo/art-providers contract compilation
→ generic runtime binding
→ separately authorized runtime enqueue and provider call
→ runtime outcome normalization
→ create-only candidate materialization
→ candidate PNG inspection
→ frame finisher
→ native-scale and contact-sheet review
→ anatomy, identity and continuity review
→ named-human candidate approval
→ hash-bound pose-bank release plan
→ separate Runtime installation
→ separate website activation review
```

No downstream action is implied by successful adapter or dispatch compilation.

## Validation

Run:

```bash
node --test scripts/test-project-art-top-hat-pose-slot-production.mjs
node --test scripts/test-project-art-top-hat-pose-slot-writer.mjs
node --test scripts/test-project-art-top-hat-pose-slot-provider-package.mjs
node --test scripts/test-project-art-top-hat-pose-slot-provider-package-writer.mjs
node --test scripts/test-project-art-top-hat-pose-slot-provider-runtime-adapter.mjs
node --test scripts/test-project-art-top-hat-pose-slot-provider-runtime-cli.mjs
```

The adapter suite compiles every slot through:

```text
generic runtime dispatch
generic provider contract binding
generic runtime candidate outcome
generic candidate source-chain admission
```

It also covers deterministic adapter identity, authorization not-yet-active and
expiry rejection, blocked packages, unknown slots, rehashed tampering, symbolic
inputs, multiply linked inputs, create-only output, overwrite refusal, mode
`0600`, partial-output cleanup and closed authority.

## Authority boundary

The adapter and its receipts keep all of the following false:

```text
runtime contract compilation performed
runtime enqueue performed
provider execution performed
candidate byte materialization
receipt persistence outside the explicit CLI output
deterministic QA
creative review
candidate approval
candidate promotion
pose-slot filling
sequence release
target repository mutation
Git mutation
deployment
publication
runtime activation
force push
```

A compiled dispatch is permission-shaped evidence for one later explicit
provider transaction. It is not proof that a provider ran or that any image was
created.
