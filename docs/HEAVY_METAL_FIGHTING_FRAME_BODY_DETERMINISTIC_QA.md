# HEAVY METAL FIGHTING — Frame body deterministic QA

Status: explicit write-enabled technical-quality boundary  
Input: one previously materialized `candidates-admitted` Frame body cel  
Provider execution: prohibited  
Creative approval or promotion: prohibited  
Game-repository mutation: prohibited

## Purpose

The provider runtime and candidate-admission layers can now prove that one named-human-authorised provider request produced one exact, hash-bound 160 × 160 RGBA candidate and that the candidate was copied into the persistent Artist Workspace with a `candidates-admitted` receipt.

This layer performs the next separate authority:

```text
immutable work order
        ↓
provider runtime outcome
        ↓
candidate-admission record
        ↓
candidates-admitted receipt
        ↓
read-only deterministic-QA plan
        ↓
explicit write-enabled QA materializer
        ↓
immutable QA report
        ↓
PASS: deterministic-qa-passed receipt
FAIL: no pass receipt; candidate remains candidates-admitted
```

No image provider is called by this runtime.

## Required evidence

A QA plan requires:

- the exact self-hashed candidate-admission record;
- its exact persisted copy in the Artist Workspace;
- the exact admitted candidate bytes;
- the exact hash-linked receipt chain whose head is that record's `candidates-admitted` receipt;
- the current immutable work order;
- the exact Frame body semantic role for the production slot;
- the governed deterministic-QA policy.

The candidate, admission record, receipt chain and every parent path are re-read from the workspace through non-symlink paths. A stale record, changed candidate, disconnected receipt chain, unsafe path or mismatched work-order hash is rejected before QA evidence can be compiled.

## Governed automated checks

The runtime decodes the PNG itself using Node's built-in zlib implementation and validates every PNG chunk CRC.

It checks:

- exact 160 × 160, 8-bit RGBA, non-interlaced PNG structure;
- the immutable 640 × 640 authoring-canvas contract;
- a meaningful minimum amount of opaque body content;
- binary alpha rather than low-alpha antialiasing or haze;
- zero unsafe RGB values beneath fully transparent pixels;
- bounded alpha coverage so a matte or checkerboard cannot masquerade as transparency;
- transparent corners and crop-safe top, left and right margins;
- no pixels below the governed ground line at `y=152`;
- pivot proximity to `x=80`;
- floor contact for semantic roles that are deterministically classified as grounded;
- connected body-cluster dominance and a bounded amount of tiny disconnected debris;
- bounded opaque RGB colour complexity;
- content-address duplicate detection against admitted peer records in the same batch and any explicitly supplied cross-batch comparisons.

The exact thresholds are data-driven in:

```text
config/heavy-metal-fighting/frame-body-deterministic-qa-policy.v1.json
```

The policy is independently SHA-256 bound into every report.

## Deferred checks are explicit

One decoded cel cannot honestly prove every production requirement. The report therefore records, rather than silently passing, checks that require another authority:

- continuity across previous and next approved cels;
- runtime mirror behaviour;
- weapon-side and hardpoint identity;
- joint-length continuity;
- microdetail crawl across an animation bank;
- physical-body readability in a stage composite with effects kept separate.

Those remain creative-sequence, identity, stage-composite or runtime checks. A deterministic pass is not a creative approval.

## Pass behaviour

When every automated check passes, the read-only plan includes one `deterministic-qa-passed` receipt:

```text
actorClass = system
actorId    = hmf-frame-body-deterministic-qa
```

Its `candidateSha256` must remain identical to the `candidates-admitted` receipt. Its evidence hash binds the canonical decoded metrics, checks, failures, deferred checks, semantic role and QA policy.

The explicit materializer writes the immutable report first and advances the receipt chain last. The next legal production action becomes:

```text
run-creative-review
```

## Failure behaviour

A failed candidate produces:

- an immutable deterministic-QA report;
- exact failed check records;
- deduplicated governed failure codes;
- a bounded repair template for only that work unit when repair budget remains;
- an explicit operator action requesting named-human bounded-repair authorization.

It does **not** produce `deterministic-qa-passed`.

The receipt chain remains at:

```text
candidates-admitted
```

The runtime also does not retry a provider. Repair authorization, repair-specific provider submission and a new admitted candidate remain a later separate authority. This fail-closed boundary avoids falsely advancing a technically rejected candidate or silently overwriting the first attempt.

## Idempotency and persistence

The materializer:

- writes one canonical QA report beneath the immutable work order's governed review root;
- refuses to overwrite different report bytes;
- reuses an identical existing report;
- advances only the exact validated predecessor receipt chain;
- reuses an already-appended identical pass receipt;
- leaves a failed receipt chain byte-for-byte unchanged;
- rejects symlinked workspace paths and traversal;
- writes no file outside the persistent Artist Workspace.

The report path is attempt-specific:

```text
review/batches/<batch>/<unit>-attempt-<nn>-deterministic-qa.json
```

## CLI

Verify the static contract:

```powershell
node scripts/heavy-metal-fighting/frame-body-deterministic-qa-cli.mjs verify
```

Compile a read-only plan:

```powershell
node scripts/heavy-metal-fighting/frame-body-deterministic-qa-cli.mjs plan `
  --admission-record-json <candidate-admission.json> `
  --workspace-root <persistent-workspace> `
  --comparison-admissions-json <optional-array.json> `
  --occurred-at <canonical-UTC>
```

Execute the explicit write-enabled boundary:

```powershell
node scripts/heavy-metal-fighting/frame-body-deterministic-qa-cli.mjs materialize `
  --plan-json <deterministic-qa-plan.json>
```

## Authority boundary

This runtime may:

```text
read one admitted Frame body candidate
re-decode and inspect its exact PNG bytes
compile deterministic technical evidence
write one immutable QA report
append deterministic-qa-passed only when every automated check passes
compile one non-executing bounded repair template after failure
```

It may not:

```text
call or retry a provider
authorize a repair
change the candidate bytes
run creative or identity review
select the candidate
master or promote the candidate
build the final atlas
write steel-dominion
commit or push
publish or deploy
```

The next successful production boundary is creative review. The next failed-production boundary is named-human-authorised, repair-specific provider re-entry without rewriting or falsely passing the rejected candidate.
