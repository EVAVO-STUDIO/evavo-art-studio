# Top Hat six-pose named-human frame-review intake

This stage follows the governed six-slot deterministic frame-finishing campaign. It accepts six **externally authored named-human review decisions**, validates every decision against the existing frame-review contract in an isolated shadow workspace, and then persists the corresponding review outcomes in the real candidate workspace.

It does not make a review decision, infer an approval, promote a candidate, fill a pose slot, release a sequence, publish anything, or activate Runtime content.

## Pipeline position

```text
six-slot provider execution
→ six-slot candidate materialization
→ six-slot deterministic frame finishing
→ six externally authored named-human decisions
→ hash-only decision manifest
→ shadow-validate all six decisions
→ persist six review outcomes
→ if and only if all six are human-approved: candidate-admission preflight
```

The canonical slots remain:

1. `blink-closed`
2. `listening-attentive`
3. `thinking-reflective`
4. `speech-neutral`
5. `presentation-open`
6. `presentation-emphasis`

## Human decision contract

A valid decision is the existing `evavo.project-art-avatar-final-pass-provider-frame-review-decision.v1` document. The existing reviewer enforces the full contract, including:

- exact frame-finisher report binding;
- exact review-request binding;
- the exact frame id;
- a self-hashed review decision;
- `reviewer.actorClass: "human"`;
- a non-empty named reviewer id;
- reviewer timestamp and evidence SHA-256;
- all required review gates;
- native-scale, contact-sheet, identity-reference and adjacent-frame evidence hashes;
- loop-closure evidence when that gate is applicable; and
- no release, publication or Runtime authority in the decision.

The allowed human decisions remain:

- `approve-final-frame`
- `repair-frame`
- `reject-frame`

Automation is not permitted to author or substitute these decision documents.

## Shadow validation before persistence

For each slot, `preflightAvatarFinalPassProviderFrameReviewFiles`:

1. stable-reads the finisher report, review request and external human decision;
2. rejects a non-human reviewer immediately;
3. verifies the finished PNG still matches the report/request hashes;
4. rejects any pre-existing real review outcome;
5. copies only the finished PNG into an isolated temporary workspace;
6. invokes the existing real review processor against the shadow copy;
7. records the exact expected review-outcome SHA-256 and decision result; and
8. deletes the temporary workspace.

The six-slot intake campaign completes **all six shadow reviews before the first real review-outcome write**.

## Decision-byte pinning

A human decision file may not change between shadow preflight and persistence.

The preflight records the exact decision-file SHA-256. The persistent phase then uses `reviewAvatarFinalPassProviderFrameFilesPinned`, which stable-reads the decision once, verifies that its file hash is identical to the preflight hash, and passes that exact parsed object into the existing reviewer.

If the decision bytes change, persistence stops before the reviewer can write an outcome.

## Mixed human outcomes

The intake stage does not force six approvals.

If genuine human reviewers produce a mixture of approve, repair and reject decisions, those outcomes are preserved faithfully. A complete mixed review campaign is reported as:

`succeeded-human-review-recorded-repair-or-rejection-present`

and the next required stage is repair or replacement before candidate admission.

Only a complete six-slot intake where all six genuine human decisions resolve to `final-frame-admitted` exposes `six-slot-candidate-admission-preflight` as the next stage. Even then, this intake campaign itself creates zero candidate admissions.

## Decision files and manifest

Use one externally authored decision file per canonical slot. For the manifest compiler, place them in one directory using these exact names:

```text
blink-closed.frame-review-decision.json
listening-attentive.frame-review-decision.json
thinking-reflective.frame-review-decision.json
speech-neutral.frame-review-decision.json
presentation-open.frame-review-decision.json
presentation-emphasis.frame-review-decision.json
```

The manifest compiler only stable-reads and hashes these six files. It does not parse them into approvals, create reviewer identities, add evidence, fill gates or modify the files.

```powershell
node scripts/compile-project-art-top-hat-pose-bank-frame-review-decision-manifest.mjs `
  --decision-root 'C:\path\to\human-review-decisions' `
  --output 'C:\path\to\human-review-decisions\decision-manifest.json'
```

The resulting self-hashed manifest contains all six canonical paths and their exact file SHA-256 values plus the fixed policy:

```json
{
  "policy": {
    "decisionsExternallyAuthored": true,
    "namedHumanRequired": true,
    "automaticDecisionCreationAllowed": false
  }
}
```

The manifest carries no review judgment of its own. The later shadow preflight still validates the full decision schema and requires `reviewer.actorClass: "human"`.

## Production intake CLI

```powershell
node scripts/run-project-art-top-hat-pose-bank-frame-review-intake-campaign.mjs `
  --finishing-campaign-plan-evidence 'C:\path\to\finishing-run\campaign-plan.json' `
  --finishing-campaign-execution-evidence 'C:\path\to\finishing-run\campaign-execution.json' `
  --decision-manifest 'C:\path\to\human-review-decisions\decision-manifest.json' `
  --workspace-root 'C:\path\to\top-hat-candidate-workspace' `
  --output-root 'C:\path\to\top-hat-review-intake-run-001' `
  --reviewed-at '2026-08-19T02:00:00.000Z'
```

The CLI verifies the exact successful finishing plan/execution evidence, exact workspace binding, decision-manifest self-hash and all six decision-file hashes before the campaign runs.

The campaign itself runs once. That one run shadow-validates all six decisions before the first persistent review outcome, pins the exact decision bytes, then persists outcomes sequentially. The resulting already-self-hashed plan and receipt are written afterward into the create-only evidence root, preventing a second-preflight race between evidence planning and persistence.

The output evidence root contains:

```text
<output-root>/
  campaign-plan.json
  campaign-execution.json
```

The candidate workspace receives only the existing per-frame review outcomes:

```text
<candidate>.frame-review-outcome.json
```

No human decision file is created or modified by this stage.

## Authority boundary

This stage may:

- read the finishing chain;
- verify externally authored human decisions; and
- persist review outcomes from those exact decisions.

It may not:

- create a human decision;
- perform creative review by automation;
- admit or promote a Top Hat candidate;
- generate dependent inbetweens;
- fill pose slots;
- admit or release a sequence;
- mutate a target repository or Git history;
- deploy or publish; or
- activate Runtime content.

Review intake is not candidate admission, and candidate admission is not release.

## Next safe stage

When, and only when, all six persisted review outcomes are genuine human approvals, the next safe automation layer is an all-six candidate-admission preflight/orchestrator that reuses the existing single-slot Top Hat admission writer. That downstream stage must validate the complete six-slot provider/materialization/finisher/review chain before the first candidate admission and must still grant no sequence-release or Runtime-activation authority.
