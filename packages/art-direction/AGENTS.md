# Visual continuity engine rules

Read the root `AGENTS.md` and the three visual continuity documents under `docs/` before changing this package.

## Public boundary

- Public consumers use `src/visual-continuity.ts` through the package root. Do not expose weaker internal helpers as alternate public paths.
- `visual-continuity-hardening.ts`, `visual-continuity-packet-v2.ts` and `visual-continuity-release.ts` deliberately wrap the base compiler. Preserve that layering unless the hardened guarantees move into the base implementation with equivalent tests.
- Do not make `candidateCountPerAttempt` greater than one until candidate-set admission, comparison, ranking and selection have exact evidence receipts.

## Iteration

- A one-job packet may be evaluated singly. A multi-job packet must remain atomic and require one result for every job.
- Evaluate every multi-job result against the same original session, then rebuild one deterministic session containing all transitions.
- Never weaken quality thresholds or discard detections to avoid a repair or blocked result.

## Continuity content

- Work-item context must remain bound to exact bible, references, locks, colours, entities, locations, maps and shot templates.
- Map packets must include each relevant symbol's meaning, shape, scale, colour and symbol-master reference.
- Sequence packets must preserve immediate accepted neighbours, canvas, pivot, ground contact, identity, motion topology, timing and loop closure.
- Anti-generic rules, prohibited modern traits and distinctive motifs are required constraints, not optional prompt decoration.

## Approval and handoff

- Technical acceptance is not creative approval.
- Approval receipts must bind the exact accepted artifact, attempt, work-item context, reviewer, review time and decision evidence.
- Approved handoff verification must canonically rebuild and compare the entire package.
- The generic continuity handoff is not the existing 3D receiver schema. Keep the 3D route adapter-required until the multi-view adapter has produced the receiver's exact contract.
- Do not claim direct receivers for other studios without matching validators and tests.

## Tests

Every contract change must add or update executable tests under `test/`. Include deterministic hash verification, tamper rejection, stale-state rejection and the exact bug or policy being changed. Tests run against freshly built `dist` through Node's built-in test runner.
