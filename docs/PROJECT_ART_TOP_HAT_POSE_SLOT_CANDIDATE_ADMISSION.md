# Top Hat pose-slot candidate admission

The Top Hat pose-bank production chain now has four deliberately separate boundaries:

```text
Runtime 0.34 pose-slot production plan
→ exact provider package and human one-shot authorization
→ guarded generic provider-runtime dispatch
→ exact reviewed candidate admission
```

This boundary admits one finished, human-reviewed Top Hat candidate for a later pose-bank release review. It does not execute a provider, generate an image, promote a candidate, fill a Runtime slot, publish a pose bank, mutate a repository, deploy, or activate a website.

## Exact schemas

```text
evavo.project-art-top-hat-pose-slot-candidate-admission.v1
evavo.project-art-top-hat-pose-slot-candidate-admission-capabilities.v1
evavo.project-art-top-hat-pose-slot-candidate-admission-receipt.v1
```

Protocol:

```text
2026-08-17.1
```

A successful result has status:

```text
top-hat-pose-candidate-admitted-for-release-review
```

## Six exact slots

The admission compiler accepts only:

```text
blink-closed
listening-attentive
thinking-reflective
speech-neutral
presentation-open
presentation-emphasis
```

Each call admits exactly one slot and one final PNG identity.

## Complete source chain

The admission recompiles the exact Top Hat runtime adapter and the selected dispatch. It then binds:

```text
provider runtime dispatch
provider runtime binding
provider runtime outcome
candidate materialization receipt
frame-finisher request
frame-finisher report
frame-review request
named-human review decision
final frame-review outcome
actual finished PNG bytes
```

The following must agree across the complete chain:

```text
character and slot identity
Runtime session and generic job identity
provider package and request SHA-256
production-plan SHA-256
provider request and prompt identities
candidate and evidence artifact IDs
scratch candidate path
reviewed target path
materialization identity
finisher request and report identities
review request, decision and outcome identities
final frame path, byte count and SHA-256
```

A filename or self-reported provider result is never sufficient.

## Human review is mandatory

The final decision must be:

```text
approve-final-frame
```

The reviewer must be a named human and every blocking gate must pass:

```text
technical
handsAndAnatomy
faceIdentity
silhouetteRegistration
adjacentFrameContinuity
loopClosure: pass or not-applicable
```

The review outcome must exactly retain the reviewer, gates, evidence, notes, final-frame SHA-256, and all-false release and activation authority.

## Final PNG verification

The actual finished bytes are decoded again at admission time. The candidate must be:

```text
PNG
1024 × 1536
eight-bit RGBA
non-interlaced
native transparent alpha
visible pixels present
transparent pixels present
zero hidden RGB under fully transparent pixels
zero visible canvas-edge contact
```

The decoded PNG must exactly match the frame-finisher and review evidence for:

```text
file SHA-256
byte count
visible-pixel SHA-256
alpha SHA-256
visible bounds
```

The admission records:

```text
pixelFormat: rgba8-straight
alphaAssociation: straight
colourSpace: srgb
```

Provider metadata is not trusted as proof of transparency or approval.

## Release-review-only output

A successful admission means only that the exact candidate may participate in a separately governed Top Hat pose-bank release review.

```text
releaseReview.eligible:                 true
releaseReview.candidateApprovalInherited: false
releaseReview.poseSlotFilled:           false
releaseReview.poseBankReleased:         false
releaseReview.runtimeActivationAllowed: false
releaseReview.websiteInstallationAllowed: false
```

The required later transactions remain:

```text
collect six exact slot admissions
compile a hash-bound pose-bank release plan
obtain separate named-human pose-bank release approval
publish a new Avatar Runtime pose-bank release
perform separate website installation and activation review
```

## Create-only writer

The writer accepts the exact evidence files and the actual finished PNG:

```powershell
node scripts/write-project-art-top-hat-pose-slot-candidate-admission.mjs `
  --slot-id presentation-open `
  --adapter C:\EVAVO\TopHat\runtime-adapter.json `
  --dispatch C:\EVAVO\TopHat\presentation-open.dispatch.json `
  --binding C:\EVAVO\TopHat\presentation-open.binding.json `
  --outcome C:\EVAVO\TopHat\presentation-open.outcome.json `
  --materialization C:\EVAVO\TopHat\presentation-open.materialization.json `
  --finisher-request C:\EVAVO\TopHat\presentation-open.finisher-request.json `
  --finisher-report C:\EVAVO\TopHat\presentation-open.frame-finisher.json `
  --review-request C:\EVAVO\TopHat\presentation-open.review-request.json `
  --review-decision C:\EVAVO\TopHat\presentation-open.review-decision.json `
  --review-outcome C:\EVAVO\TopHat\presentation-open.review-outcome.json `
  --finished-frame C:\EVAVO\TopHat\presentation-open.finished.png `
  --output C:\EVAVO\TopHat\presentation-open.candidate-admission.json `
  --admitted-at 2026-08-17T02:00:00.000Z
```

The writer:

1. Requires absolute paths.
2. Rejects symbolic or multiply linked inputs.
3. Reads bounded, stable UTF-8 JSON and PNG inputs.
4. Recompiles and verifies the complete admission.
5. Creates the output with exclusive `wx` semantics and mode `0600`.
6. Synchronises and reopens the output.
7. Reparses the self-hashed admission.
8. Removes only its own partial output on failure.
9. Refuses to overwrite an existing output.

## Authority contract

The only positive admission capabilities are:

```text
evidenceRead:             true
finalFrameByteRead:       true
technicalAdmission:       true
releaseReviewEligibility: true
```

The following remain closed:

```text
providerExecution:   false
runtimeEnqueue:      false
imageMutation:       false
creativeDecision:    false
candidateApproval:   false
candidatePromotion:  false
poseSlotFilling:     false
poseBankRelease:     false
sequenceRelease:     false
repositoryMutation:  false
gitCommit:           false
gitPush:             false
deployment:          false
publication:         false
runtimeActivation:   false
forcePush:           false
```

## Verification

Run the focused suites:

```bash
node --test scripts/test-project-art-top-hat-pose-slot-candidate-admission.mjs
node --test scripts/test-project-art-top-hat-pose-slot-candidate-admission-writer.mjs
```

The tests cover all six slots, exact adapter and dispatch recompilation, complete provider source-chain binding, named-human review, gate failure, candidate-byte corruption, final-hash drift, accessor and cycle rejection, authority escalation, create-only output, mode `0600`, overwrite refusal, symbolic-input rejection, and partial-output safety.
