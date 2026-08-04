# Restart-safe sprite supervisor continuations

Status: implemented recovery guard for durable sprite-production supervision

The sprite supervisor stores each immutable state tick through an artifact reference and schedules another `art.sprite-production.supervise` job while the run remains active. This boundary makes that transition restart-safe when a worker stops after the state reference advances but before its handler result is durably acknowledged.

## Failure that is prevented

Without a state-bound continuation claim, a retried supervisor job could load a newer state than the state it originally processed, increment it again and schedule another child tick. The opposite failure was also possible: state could be durably marked `running`, continuation submission could fail, and no job would remain to resume the run.

Both outcomes are now blocked.

## Exact tick claim

Every supervisor job already carries an immutable `supervisorTick` label and deterministic idempotency key. The guarded worker now verifies:

- root submissions use tick `0`, the exact compiled request hash and the exact root idempotency key;
- continuation submissions use the exact run, workflow and state tick in their idempotency key;
- review-bearing root submissions claim the single immutable tick named by their review resolutions;
- stored state belongs to the same run, workflow, sprite plan and verified state artifact reference.

The worker then compares the job claim with the durable state tick:

```text
stored tick < claimed tick  -> transient state-not-ready failure
stored tick = claimed tick  -> execute the normal bounded supervisor tick
stored tick > claimed tick  -> stale replay; do not execute the tick again
```

A stale review submission is accepted as an idempotent replay only when every supplied review resolution is already present in the durable state with the same exact content.

## Continuation recovery

When a stale job observes a durable `running` state, it checks the runtime idempotency index for the continuation belonging to that exact state tick.

- If the continuation exists, its queue, kind, run, workflow and tick identity are verified and reused.
- If it is missing, the worker recreates exactly one continuation using the durable state artifact, the current supervisor job as dependency and the deterministic `updatedAt + tickDelayMs` schedule.
- If the idempotency index points to an incompatible job, the run fails closed.

The stale job returns the existing immutable state artifact and does not rewrite state, resubmit completed provider work, relax quality gates, select a different candidate or promote an artifact.

## Preserved supervisor behaviour

This hardening does not change:

- bounded child-job concurrency;
- pause and cancellation handling;
- bounded redrive and targeted repair cycles;
- state-bound named review;
- final release-artifact verification;
- adaptive finalization, mirroring, family verification, atlas or Godot packaging;
- provider, selection and promotion authority boundaries.

## Validation coverage

Executable recovery tests prove:

- recovery of one missing continuation from already-persisted state;
- idempotent reuse after a post-submit crash;
- no duplicate continuation on repeated replay;
- transient rejection when a continuation outruns durable state;
- permanent rejection of an incompatible idempotency entry.

The focused hosted workflow builds and typechecks the supervisor and worker dependency closure, runs the supervisor package tests, runs the existing closed-loop runtime suite and the continuation recovery attacks, then proves the checked-out source remains clean.
