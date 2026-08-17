# Top Hat pose-bank release plan

The six Top Hat candidate-admission records now have a separate aggregation
boundary before any pose-bank release can be approved.

```text
six exact named-human-reviewed candidate admissions
→ deterministic hash-bound pose-bank release plan
→ separate named-human pose-bank release approval
→ separately governed Avatar Runtime release
→ separate website installation and activation review
```

This tranche implements only the second step.

It does not execute a provider, generate or alter an image, approve a candidate,
fill a pose slot, release a pose bank or sequence, mutate a repository, deploy,
publish, install website media, activate a runtime, force push, or rewrite
history.

## Schemas

```text
evavo.project-art-top-hat-pose-bank-release-plan.v1
evavo.project-art-top-hat-pose-bank-release-plan-capabilities.v1
evavo.project-art-top-hat-pose-bank-release-plan-receipt.v1
```

Protocol:

```text
2026-08-17.2
```

Successful compilation status:

```text
top-hat-pose-bank-release-plan-ready-for-human-approval
```

## Exact six-slot set

The compiler accepts exactly one admission for each canonical slot:

```text
blink-closed
listening-attentive
thinking-reflective
speech-neutral
presentation-open
presentation-emphasis
```

Input order is not trusted. The compiler verifies the set and writes the slots
in the canonical order above.

## Admission requirements

Every input is reparsed through the existing candidate-admission parser. Each
record must retain:

- its valid self-hash;
- character `top-hat-man`;
- technical release-review eligibility;
- no inherited candidate approval;
- no pose-slot filling;
- no pose-bank release;
- no Runtime activation;
- no website installation authority.

All six admissions must share the exact same:

```text
runtime-adapter SHA-256
provider-package SHA-256
provider-request SHA-256
production-plan SHA-256
Runtime 0.34 source pin
Art Studio animation and alpha-safety source pin
```

The six candidate-admission identities must be distinct.

Equal final-frame byte hashes are not treated as automatic proof of duplicate
art. A later named-human release review must inspect the six actual frames and
their contact-sheet evidence. The technical plan instead requires distinct
slot identities and exact slot-specific paths.

## Exact path binding

Each slot must retain its canonical reviewed target:

```text
assets/top-hat-man/candidates/top-hat-man-<slot-id>-v1.alpha.png
```

and its exact create-only finished scratch path:

```text
scratch/avatar-final-pass/top-hat-pose-slots-v1/<slot-id>/candidate-01.finished.png
```

Cross-slot path substitution fails closed.

## Retained evidence

Each plan slot binds:

```text
slot ID
candidate-admission SHA-256
admission timestamp
runtime dispatch, binding and outcome SHA-256
materialization, finisher and review SHA-256
provider request and prompt SHA-256
candidate and evidence artifact IDs
finished-frame path and reviewed target
file SHA-256 and byte count
1024 × 1536 canvas
visible-pixel SHA-256
alpha SHA-256
visible bounds
named-human review identity
all review gates and evidence
review notes
```

The release plan is self-hashed as:

```text
poseBankReleasePlanSha256
```

For a fixed compilation timestamp and the same six admissions, shuffled input
produces the same canonical plan and hash.

## Release-review-only state

A valid plan records:

```text
eligible:                                  true
exactSlotCount:                            6
exactSlotSetComplete:                      true
allCandidatesTechnicallyAdmitted:          true
candidateApprovalInherited:                false
separateNamedHumanReleaseApprovalRequired: true
releaseApproved:                           false
poseSlotFillingPerformed:                  false
poseBankReleased:                          false
sequenceReleased:                          false
runtimeActivationAllowed:                  false
websiteInstallationAllowed:                false
```

The required later transactions remain:

```text
obtain-separate-named-human-pose-bank-release-approval
publish-a-new-avatar-runtime-pose-bank-release
perform-separate-website-installation-and-activation-review
```

## Create-only writer

The writer accepts six exact admission JSON files:

```powershell
node scripts/write-project-art-top-hat-pose-bank-release-plan.mjs `
  --blink-closed C:\EVAVO\TopHat\blink-closed.admission.json `
  --listening-attentive C:\EVAVO\TopHat\listening-attentive.admission.json `
  --thinking-reflective C:\EVAVO\TopHat\thinking-reflective.admission.json `
  --speech-neutral C:\EVAVO\TopHat\speech-neutral.admission.json `
  --presentation-open C:\EVAVO\TopHat\presentation-open.admission.json `
  --presentation-emphasis C:\EVAVO\TopHat\presentation-emphasis.admission.json `
  --output C:\EVAVO\TopHat\top-hat-pose-bank-release-plan.json `
  --compiled-at 2026-08-17T06:00:00.000Z
```

The writer:

1. requires absolute input and output paths;
2. rejects symbolic or multiply linked admission inputs;
3. performs stable, bounded UTF-8 JSON reads;
4. verifies that inputs do not change while being read;
5. recompiles the complete six-slot plan;
6. creates the output with exclusive `wx` semantics and mode `0600`;
7. synchronises, closes, reopens, reparses, and independently verifies it;
8. refuses overwrite;
9. removes only its own partial output after failure.

## Authority contract

The only positive capabilities are:

```text
evidenceRead:               true
technicalPlanCompilation:  true
releaseApprovalEligibility:true
```

The following remain closed:

```text
providerExecution:       false
runtimeEnqueue:          false
imageMutation:           false
creativeDecision:        false
candidateApproval:       false
candidatePromotion:      false
poseSlotFilling:         false
poseBankReleaseApproval: false
poseBankRelease:         false
sequenceRelease:         false
repositoryMutation:      false
gitCommit:               false
gitPush:                 false
deployment:              false
publication:             false
runtimeActivation:       false
websiteInstallation:     false
forcePush:               false
```

## Verification

Run:

```bash
node --test scripts/test-project-art-top-hat-pose-bank-release-plan.mjs
node --test scripts/test-project-art-top-hat-pose-bank-release-plan-writer.mjs
```

The suites cover canonical six-slot compilation, shuffled input, missing,
duplicate and unknown slots, self-hash drift, common-source substitution,
Runtime and Art Studio pin substitution, path substitution, candidate and plan
authority escalation, release-state escalation, accessors, cycles, create-only
output, mode `0600`, overwrite refusal, symbolic input, hard-linked input,
relative paths, and partial-output safety.
