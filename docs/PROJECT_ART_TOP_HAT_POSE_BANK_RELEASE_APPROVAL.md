# Project Art Top Hat pose-bank release approval

Protocol `2026-08-17.3` admits one separately supplied named-human approval for
the exact six-slot Top Hat pose-bank release plan.

This is an evidence-admission boundary. It does not create a human decision,
fill runtime pose slots, release a pose bank, publish an Avatar Runtime package,
install website assets, activate a runtime, deploy, or mutate Git.

## Boundary

```text
six self-hashed candidate admissions
  -> deterministic pose-bank release plan
  -> separately supplied named-human release decision
  -> release-approval admission
  -> later governed Avatar Runtime publication transaction
  -> later separate website installation and activation review
```

The release plan must already satisfy protocol `2026-08-17.2`. It remains in
`ready-for-human-approval` state and contains the exact canonical six-slot set,
source pins, candidate-admission identities, finished-frame identities, alpha
identities, and named-human frame-review lineage.

## Human decision contract

The approval decision uses schema:

```text
evavo.project-art-top-hat-pose-bank-release-approval-decision.v1
```

Its decision value must be exactly:

```text
approve-top-hat-pose-bank-for-runtime-publication
```

A valid decision must bind:

- the exact self-hashed pose-bank release plan;
- the exact canonical six-slot order;
- every candidate-admission SHA-256;
- every finished-frame path, reviewed target path, and file SHA-256;
- every visible-pixel and alpha SHA-256;
- every final-frame review decision and outcome SHA-256;
- one named reviewer with `actorClass: human`;
- one exact ISO decision timestamp after the release plan;
- contact-sheet, identity-continuity, alpha-integrity, and source-lineage
  evidence digests;
- an evidence-record SHA-256 held by the reviewer record;
- an all-false consequence-authority record;
- one canonical self-hash over the complete decision.

The module parses and verifies a decision supplied by an external human-review
transaction. It intentionally does not expose a production function that can
invent or auto-approve that decision.

The repository fixture uses an actor ID beginning with `test-only-` and carries
an explicit synthetic-fixture note. It exists solely for deterministic tests and
must never be treated as production approval evidence.

## Approval admission

A successful admission uses schema:

```text
evavo.project-art-top-hat-pose-bank-release-approval-admission.v1
```

and status:

```text
top-hat-pose-bank-release-approval-admitted-for-runtime-publication
```

The admission retains the exact plan hash, decision hash, six-slot identities,
reviewer, evidence, notes, approval time, admission time, and one canonical
self-hash.

Its release state is deliberately precise:

```text
humanReleaseApprovalAdmitted: true
releaseApproved:              true
runtimePublicationEligible:   true
poseSlotFillingPerformed:      false
poseBankReleased:              false
runtimePublicationPerformed:  false
sequenceReleased:              false
websiteInstallationAllowed:   false
runtimeActivationAllowed:      false
```

`releaseApproved: true` means the supplied named-human decision has been
cryptographically admitted. It does not mean the software has released or
published anything.

## Closed authority

The approval-admission authority has only three positive evidence capabilities:

```text
evidenceRead
namedHumanReleaseApprovalAdmission
runtimePublicationEligibility
```

The following remain false:

```text
providerExecution
runtimeEnqueue
imageMutation
creativeDecision
candidateApproval
candidatePromotion
poseSlotFilling
poseBankReleaseApproval
poseBankRelease
runtimePublication
sequenceRelease
repositoryMutation
gitCommit
gitPush
deployment
publication
runtimeActivation
websiteInstallation
forcePush
```

The software does not gain human creative authority merely because it can admit
evidence that a human exercised that authority elsewhere.

## Create-only writer

The direct writer is:

```text
scripts/write-project-art-top-hat-pose-bank-release-approval.mjs
```

Example:

```bash
node scripts/write-project-art-top-hat-pose-bank-release-approval.mjs \
  --plan /absolute/path/top-hat-pose-bank-release-plan.json \
  --decision /absolute/path/top-hat-pose-bank-release-approval-decision.json \
  --output /absolute/path/top-hat-pose-bank-release-approval-admission.json \
  --admitted-at 2026-08-18T01:00:00.000Z
```

The writer:

1. requires absolute paths;
2. rejects symbolic and multiply linked input files;
3. rejects symbolic parent traversal;
4. performs descriptor-stable JSON reads;
5. verifies the release plan and named-human decision before output creation;
6. creates the output with exclusive `wx` semantics and mode `0600`;
7. synchronises the output file;
8. rereads and independently verifies the exact plan, decision, and admission;
9. removes only its own newly created partial output on failure;
10. refuses to replace an existing output.

A successful receipt states that approval was admitted and Runtime publication
is eligible, while publication, activation, repository mutation, and force-push
authority remain false.

## Verification

```bash
node --check scripts/project-art/top-hat-pose-bank-release-approval-foundation.mjs
node --check scripts/project-art/top-hat-pose-bank-release-approval.mjs
node --check scripts/project-art/top-hat-pose-bank-release-approval-fixture.mjs
node --check scripts/write-project-art-top-hat-pose-bank-release-approval.mjs
node --check scripts/test-project-art-top-hat-pose-bank-release-approval.mjs
node --check scripts/test-project-art-top-hat-pose-bank-release-approval-writer.mjs

node --test scripts/test-project-art-top-hat-pose-bank-release-plan.mjs
node --test scripts/test-project-art-top-hat-pose-bank-release-plan-writer.mjs
node --test scripts/test-project-art-top-hat-pose-bank-release-approval.mjs
node --test scripts/test-project-art-top-hat-pose-bank-release-approval-writer.mjs
```

The adversarial suites cover plan substitution, cross-plan replay, slot reorder,
slot and path collision, frame and alpha substitution, non-human reviewers,
evidence drift, timestamp drift, rehashed authority escalation, rehashed state
escalation, accessors, cycles, overwrite attempts, symbolic inputs, hard-linked
inputs, and partial-output cleanup.

## Required next transactions

After a real named-human decision has been admitted, two boundaries still remain:

1. publish a new governed Avatar Runtime pose-bank release;
2. perform a separate website installation and activation review.

Neither transaction is implied or performed by this protocol.
