# HEAVY METAL FIGHTING — Frame body creative review

Status: explicit named-human review-evidence boundary  
Input: one persisted Frame body candidate whose exact bytes already passed deterministic QA  
Provider execution: prohibited  
Selection, repair authorization, approval and promotion: prohibited  
Game-repository mutation: prohibited

## Purpose

Deterministic QA can prove PNG structure, alpha integrity, pivot and ground-line behaviour, crop safety, connected-body dominance, colour bounds and duplicate content. It cannot honestly decide whether a Frame still looks like itself, whether the pose performs its exact combat role, whether mechanical landmarks drifted, or whether the result feels like a premium 1994–1997 arcade/DOS fighter.

This layer performs that next separate authority:

```text
immutable work order
        ↓
candidates-admitted receipt
        ↓
deterministic QA report
        ↓
deterministic-qa-passed receipt
        ↓
read-only creative-review packet
        ↓
complete named-human assessment
        ↓
immutable creative-review decision
        ↓
creative-review-passed receipt
        ↓
STOP — select-or-request-repair remains a separate human gate
```

`creative-review-passed` means that the review evidence is complete, internally consistent and bound to the exact candidate. It does **not** mean that the candidate has been selected, approved, promoted or authorized for repair.

## Exact evidence lineage

The review packet re-reads and binds:

- the exact self-hashed deterministic QA report;
- the persisted copy of that report in the Artist Workspace;
- the unchanged candidate bytes and candidate SHA-256;
- the exact candidate-admission record;
- the exact hash-linked `candidates-admitted` receipt embedded by admission and named by deterministic QA;
- the provider-submission manifest SHA-256 inherited from admission;
- the current immutable work order;
- the exact Frame body role, bank, phase, semantic role, hero/contact responsibility and hold priority;
- the hash-linked receipt chain whose head is `deterministic-qa-passed`;
- the governed creative-review policy.

A changed candidate, stale work order, altered QA report, disconnected receipt chain, mismatched reference lineage, unsafe path or symlink fails closed before a review packet can be compiled.

## Required review modes

One named human must attest that the exact candidate was reviewed in all six governed modes:

```text
native 160 × 160
nearest-neighbour 4×
640 × 360 match composite
320 × 180 thumbnail
one-colour silhouette
grayscale
```

This prevents a large zoomed preview from hiding weak native-scale clusters, a colour image from hiding value problems, or a detailed body from hiding a generic silhouette.

## Governed creative criteria

Every decision must cover all eight criteria exactly once:

1. Frame identity and silhouette.
2. Mechanical construction and declared landmarks.
3. Exact body-role choreography.
4. Frame-specific motion identity and cadence.
5. Material, palette and gameplay lighting.
6. 1990s pixel authenticity and readability.
7. Physical-body and effect separation.
8. Continuity, hardpoint and mirror intent.

Each criterion is either `pass` or `fail`. A failure requires at least one failure code from that criterion's governed vocabulary and a bounded observation. A pass may not carry a hidden failure code.

The policy is data-driven in:

```text
config/heavy-metal-fighting/frame-body-creative-review-policy.v1.json
```

The policy SHA-256 is bound into every packet, decision and persisted result.

## Findings are not selection

A complete review computes one recommendation:

```text
all criteria pass   → selected
one or more fail    → repair-requested
```

That recommendation is written into a non-executing selection-decision template. It has no authority to append `selected-or-repair-requested`.

The actual selection or repair request remains the existing separate lifecycle state:

```text
selected-or-repair-requested
```

and still requires a human actor. This means:

- the reviewer cannot silently select the image by completing the review;
- a defect can be recorded without automatically authorizing provider repair;
- an agent cannot convert the recommendation into approval or promotion;
- the candidate SHA remains unchanged throughout the attempt.

## Named-human evidence

A valid assessment binds:

- a stable 2–160 character reviewer identifier using letters, numbers, dot, underscore, colon, at-sign or hyphen;
- canonical UTC review time after deterministic QA passed;
- all required review modes;
- all governed criterion results;
- substantive 20–1200 character observations and governed failure codes;
- a summary;
- the exact candidate SHA-256;
- the exact QA-report SHA-256;
- the exact provider reference-manifest SHA-256;
- an attestation that the review was independent and named-human;
- an attestation that no selection, repair authorization or promotion occurred.

The resulting `creative-review-passed` receipt uses:

```text
actorClass = human
actorId    = <named reviewer>
```

Its evidence hash is the canonical SHA-256 of the complete review evidence.

## Persistence and idempotency

The explicit write-enabled materializer:

- revalidates the packet, decision, current policy, work order, candidate bytes, admission lineage, QA report and receipt chain;
- recompiles the decision from its own evidence and rejects any drift;
- writes one immutable attempt-specific creative-review decision;
- refuses to overwrite different review bytes;
- reuses an identical existing decision;
- advances the receipt chain last;
- reuses an already-appended identical review receipt;
- rejects any competing or later receipt chain;
- writes no file outside the persistent Artist Workspace.

The decision path is:

```text
review/batches/<batch>/<unit>-attempt-<nn>-creative-review.json
```

A successful materialization leaves the next legal action at:

```text
select-or-request-repair
```

## CLI

Verify the static boundary:

```powershell
node scripts/heavy-metal-fighting/frame-body-creative-review-cli.mjs verify
```

Compile a read-only review packet:

```powershell
node scripts/heavy-metal-fighting/frame-body-creative-review-cli.mjs packet `
  --qa-report-json <deterministic-qa-report.json> `
  --workspace-root <persistent-workspace>
```

Compile one complete named-human decision without writing:

```powershell
node scripts/heavy-metal-fighting/frame-body-creative-review-cli.mjs decision `
  --packet-json <creative-review-packet.json> `
  --assessment-json <named-human-assessment.json>
```

Persist the immutable decision and append only `creative-review-passed`:

```powershell
node scripts/heavy-metal-fighting/frame-body-creative-review-cli.mjs materialize `
  --decision-json <creative-review-decision.json>
```

## Authority boundary

This runtime may:

```text
read one deterministic-QA-passed candidate
bind exact work-order, role, QA and reference lineage
compile one read-only review packet
validate one complete named-human assessment
persist one immutable creative-review decision
append one creative-review-passed receipt
recommend selected or repair-requested
```

It may not:

```text
call or retry a provider
change candidate bytes
select the candidate
append selected-or-repair-requested
authorize or execute repair
master or promote the candidate
approve the candidate as final
build the final atlas
write steel-dominion
commit or push through the production surface
publish or deploy
```

The next boundary is the explicit named-human `selected-or-repair-requested` decision. A selected candidate can then move toward mastering; a repair request can compile a bounded repair attempt without changing passing siblings.
