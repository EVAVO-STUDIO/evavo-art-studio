# HEAVY METAL FIGHTING — Frame body selection decision

Status: explicit named-human lifecycle decision boundary  
Input: one persisted Frame body creative-review decision whose receipt chain ends at `creative-review-passed`  
Provider execution: prohibited  
Mastering, promotion and final approval: prohibited  
Game-repository mutation: prohibited

## Purpose

Creative review now proves that one named human inspected the exact deterministic-QA-passed candidate in every governed review mode and recorded every required criterion. That review intentionally stops before selecting the candidate or requesting a repair.

This layer performs the next separate authority:

```text
immutable work order
        ↓
candidate admission
        ↓
deterministic QA passed
        ↓
named-human creative review completed
        ↓
creative-review-passed receipt
        ↓
read-only selection decision compilation
        ↓
explicit named-human selected-or-repair-requested decision
        ↓
immutable selection evidence
        ↓
selected-or-repair-requested receipt
        ↓
selected: master-selected-candidate
repair-requested: authorize-bounded-repair
```

The layer does not master a selected candidate and does not authorize a repair provider call. It only records which existing lifecycle branch the named human chose.

## Required lineage

Before a decision can compile, Art Studio revalidates:

- the exact self-hashed creative-review decision;
- the exact persisted copy of that decision;
- the complete creative-review evidence and recommendation;
- the `creative-review-passed` receipt and its deterministic-QA predecessor;
- the candidate SHA-256 and unchanged candidate bytes;
- the deterministic-QA report;
- the candidate-admission record and receipt;
- the immutable work order;
- the complete hash-linked production receipt chain;
- the creative-review selection template;
- the current selection-decision policy.

A stale policy, changed work order, changed candidate, substituted review record, conflicting receipt, unsafe path or symlink fails closed.

## Human decision input

The decision requires:

```json
{
  "actorId": "stable-named-human-id",
  "occurredAt": "canonical UTC timestamp",
  "outcome": "selected or repair-requested",
  "rationale": "bounded human rationale",
  "attestations": {
    "candidateSha256": "...",
    "creativeReviewDecisionSha256": "...",
    "creativeReviewReceiptSha256": "...",
    "reviewEvidenceSha256": "...",
    "recommendationConsidered": true,
    "noCandidateMutationMasteringPromotionOrProviderExecutionPerformed": true
  }
}
```

The resulting receipt always uses:

```text
actorClass = human
actorId    = <named decision maker>
state      = selected-or-repair-requested
```

## Recommendation binding

The creative review already computes one evidence-based recommendation:

```text
all creative criteria pass → selected
one or more criteria fail  → repair-requested
```

The selection policy requires the explicit human outcome to match that completed recommendation.

This prevents:

- selecting a candidate with unresolved creative defects;
- requesting an unbounded repair when no governed defect exists;
- an agent changing the outcome after the human review;
- bypassing the review evidence with a free-form receipt.

The policy is data-driven in:

```text
config/heavy-metal-fighting/frame-body-selection-decision-policy.v1.json
```

Its SHA-256 is bound into every selection decision.

## Selected branch

For `selected`:

- the creative review must contain zero failure codes;
- no repair template is produced;
- the receipt chain advances to `selected-or-repair-requested` with outcome `selected`;
- the next legal action becomes `master-selected-candidate`.

The candidate is not copied, mastered, promoted, approved or delivered by this layer.

## Repair-requested branch

For `repair-requested`:

- the creative review must contain at least one governed failure code;
- the receipt chain advances with outcome `repair-requested`;
- a bounded repair template is compiled for the exact failed candidate and unit;
- passing siblings remain explicitly forbidden from regeneration;
- the next legal action becomes `authorize-bounded-repair`.

The repair template is still non-executing. The next attempt cannot begin until a separate human `generation-authorized` receipt is created for the incremented attempt.

## Persistence and idempotency

The explicit write-enabled materializer:

- recompiles the selection decision from its own evidence;
- re-reads the current work order and policy;
- revalidates the persisted creative decision, QA report, admission record and candidate bytes;
- accepts only the exact `creative-review-passed` predecessor chain or the already-appended identical selection receipt;
- writes one immutable attempt-specific selection decision;
- refuses to overwrite different decision bytes;
- reuses an identical existing decision;
- advances the receipt chain last;
- is idempotent after the exact decision has already been recorded;
- writes nothing outside the persistent Artist Workspace.

The decision path is:

```text
review/batches/<batch>/<unit>-attempt-<nn>-selection-decision.json
```

## CLI

Verify the static boundary:

```powershell
node scripts/heavy-metal-fighting/frame-body-selection-decision-cli.mjs verify
```

Compile a read-only named-human decision:

```powershell
node scripts/heavy-metal-fighting/frame-body-selection-decision-cli.mjs decision `
  --creative-review-decision-json <creative-review-decision.json> `
  --workspace-root <persistent-workspace> `
  --human-decision-json <human-decision.json>
```

Persist the immutable decision and append the outcome receipt:

```powershell
node scripts/heavy-metal-fighting/frame-body-selection-decision-cli.mjs materialize `
  --selection-decision-json <selection-decision.json>
```

## Authority boundary

This runtime may:

```text
read one completed creative-review decision
validate one explicit named-human outcome
persist one immutable selection decision
append one selected-or-repair-requested receipt
compile one non-executing bounded repair template when required
expose the next legal lifecycle action
```

It may not:

```text
call or retry a provider
change candidate bytes
start a repair attempt
master the selected candidate
promote or finally approve the candidate
build the final atlas
write steel-dominion
commit or push through the production surface
publish or deploy
```

The next successful boundary is selected-candidate mastering. The next repair boundary is a separate named-human bounded-repair authorization that begins a new attempt without regenerating passing siblings.
