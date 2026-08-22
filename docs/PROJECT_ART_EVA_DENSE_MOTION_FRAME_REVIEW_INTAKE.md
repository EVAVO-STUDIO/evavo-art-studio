# EVA dense-motion named-human frame-review intake

This stage follows the successful ten-frame EVA deterministic mastering campaign. It consumes ten **externally authored named-human frame-review decisions**, shadow-validates all ten against the existing avatar frame-review contract, pins the exact decision-file bytes, and only then persists the corresponding review outcomes.

It does not create a human decision, infer an approval, perform technical inspection, fabricate creative approval, upload to Cloudinary, release a sequence, publish, deploy or activate Runtime content.

## Pipeline position

```text
exact ten-source materialization
→ candidate assurance
→ named-human alpha matte review + one-use authorization
→ deterministic alpha mastering + frame finishing
→ ten externally authored named-human frame decisions
→ shadow validate all ten
→ pin all ten decision files
→ persist ten review outcomes
→ if all ten approve: technical inspection and release-evidence adaptation
```

The current three-frame website/runtime fallback remains unaffected until the complete downstream dense release is separately admitted and activated.

## Human decision contract

Every frame uses the existing Art Studio contract:

```text
evavo.project-art-avatar-final-pass-provider-frame-review-decision.v1
```

The existing generic reviewer requires:

- `reviewer.actorClass: "human"`;
- a named reviewer id;
- reviewer timestamp and evidence SHA-256;
- exact frame-finisher and review-request lineage;
- exact finished-frame SHA-256;
- native-scale review evidence;
- contact-sheet review evidence;
- identity-reference evidence;
- adjacent-frame evidence;
- loop evidence when applicable; and
- explicit gate results for technical quality, hands/anatomy, face identity, silhouette registration, adjacent-frame continuity and loop closure.

Allowed human decisions are exactly:

```text
approve-final-frame
repair-frame
reject-frame
```

Automation cannot author or replace those decisions.

## Decision locations

For each ten-master program job the externally authored decision is placed at:

```text
<frameRoot>/named-human.frame-review-decision.json
```

The intake derives the corresponding finisher report and review request from the exact mastered frame job. It does not search for alternate decisions or accept a substitute frame family.

## Atomic all-ten preflight

`compileEvaDenseMotionFrameReviewIntakePlan` runs the existing `preflightAvatarFinalPassProviderFrameReviewFiles` for all ten frames before any real review outcome is written.

Each preflight:

1. rechecks exact finished frame bytes;
2. validates the self-hashed human decision;
3. requires the human reviewer class;
4. binds the decision to the exact finisher and review-request hashes;
5. runs the real reviewer in an isolated shadow workspace; and
6. records the expected outcome SHA-256.

If any one of the ten preflights fails, the intake writes no review outcomes.

## Decision-byte pinning

After all ten shadow preflights pass, persistent review uses `reviewAvatarFinalPassProviderFrameFilesPinned`.

The exact decision-file SHA-256 recorded during preflight must still match immediately before the real reviewer consumes it. A changed human decision aborts the persistent phase rather than silently accepting different review evidence.

## Mixed outcomes

The intake does not force approval.

If a named human requests repair or rejects one or more frames, those outcomes are persisted faithfully and the campaign reports:

```text
succeeded-human-review-recorded-repair-or-rejection-present
```

Only ten genuine `approve-final-frame` decisions produce:

```text
succeeded-all-ten-human-approved
```

Even that status does not create EVA technical-inspection evidence or the final creative-approval evidence required by the dense release contract. Those remain separate downstream stages.

## CLI

Run only after the ten-master program and successful mastering campaign receipt exist and the ten human decision files have been authored:

```powershell
node scripts/run-project-art-eva-dense-motion-frame-review-intake.mjs `
  --program 'C:\path\to\ten-master-program.json' `
  --mastering-campaign-receipt 'C:\path\to\mastering.campaign.json' `
  --workspace-root 'C:\path\to\eva-dense-workspace' `
  --output-root 'C:\path\to\eva-review-intake-evidence' `
  --reviewed-at '2026-08-22T08:00:00.000Z'
```

The output root must already exist. The evidence writer is create-only and writes:

```text
campaign-plan.json
campaign-execution.json
```

The exact plan returned by the execution function is persisted with the receipt; the CLI does not recompile a second plan after review outcomes have been written.

## Authority boundary

This stage may:

- read verified mastering evidence;
- read and verify externally authored named-human decisions; and
- persist review outcomes derived from those exact decisions.

It may not:

- create or alter a human decision;
- automatically make a creative decision;
- create technical-inspection evidence;
- create final creative-approval evidence;
- promote a candidate;
- upload to Cloudinary;
- admit or release a sequence;
- mutate a target repository or Git history;
- publish or deploy;
- activate Runtime or website media; or
- force push.

The next implementation boundary after all ten human approvals is a narrow adapter that binds genuine review outcomes and independent technical-inspection evidence into the exact EVA dense release-evidence fields without converting file presence into approval.
