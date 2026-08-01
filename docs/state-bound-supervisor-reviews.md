# State-bound sprite supervisor reviews

Status: implemented in supervisor protocol `2026-08-01.2`.

## Why review commands are separate submissions

A supervisor workflow has one stable identity for its sprite plan, tasks, dependencies, quality policies and release requirements. Human decisions are not allowed to rewrite that workflow. They arrive as separately hashed review submissions that retain the stable workflow SHA-256 while receiving a new request SHA-256 and a new durable root-job idempotency key.

This lets an operator resume one existing immutable run without regenerating completed child work or creating a second production history.

## Review command contract

Every review resolution requires:

```json
{
  "resolutionId": "release-review-001",
  "expectedStateTick": 42,
  "taskId": "$release",
  "action": "approve-release",
  "approver": "Greg Parker",
  "reason": "Reviewed the complete immutable release evidence."
}
```

The command is accepted only when:

- `resolutionId` is a safe identifier not previously used with different content;
- `expectedStateTick` exactly matches the current immutable supervisor state;
- the target task is actually `review-required`, or the release is at its final approval boundary;
- the action is valid for that target;
- every supplied artifact binding is an immutable artifact ID;
- required tasks cannot be skipped;
- final release approval is not already recorded.

## Replay and stale-state behaviour

An identical command with the same `resolutionId` and content is idempotent. It is recorded once and later replays have no side effects.

Reusing a resolution ID with different content fails with `SPRITE_SUPERVISOR_REVIEW_ID_CONFLICT`.

Submitting a command for an older or newer tick fails with `SPRITE_SUPERVISOR_REVIEW_STATE_STALE`. The operator must reread the current state and prepare a new command rather than overwriting a decision made against newer evidence.

## Task review actions

### Retry

`retry` is accepted only while the target task is `review-required`. It clears the current failed-child pointer, advances the task cycle and resubmits only that task. Completed dependencies and unaffected artifact bindings remain unchanged.

### Skip

`skip` is accepted only for optional tasks. Required tasks remain blocking and cannot be waived through review.

### Abort

`abort` fails the target task and the run. When configured, the supervisor force-cancels other active child jobs and retains the immutable state and decision evidence.

## Final release approval

`approve-release` must target `$release`. It is accepted only when:

- the run is already `review-required`;
- final human approval is required by policy;
- every required task succeeded;
- no submitted, running or genuinely waiting child job remains active;
- no task-level review remains unresolved;
- all required release artifact roles are available for final immutable verification.

Dormant failure-triggered repair definitions do not count as active jobs until a child job is actually submitted.

After approval, the same supervisor tick verifies release artifacts and emits `sprite-production-release-evidence`. It does not rerun completed provider, mastering, verification, repair, selection, atlas or Godot tasks.

## Concurrent state updates

Supervisor state is advanced through a compare-and-swap artifact reference. When two ticks race, one update succeeds and the other receives `SPRITE_SUPERVISOR_STATE_CONFLICT`. The worker preserves that condition as transient so the durable runtime can retry against the newest state instead of converting a normal concurrency race into permanent failure.

## Authority boundary

Review commands do not contain provider credentials and cannot:

- lower a quality threshold;
- disable a gate;
- accept a rejected artifact;
- execute a provider directly;
- invoke a shell;
- update an approved art reference outside the existing promotion transaction;
- deploy a project.

REST and MCP validate and compile review-bearing workflows only. Explicit CLI submission or an authenticated runtime operation creates the durable root job.
