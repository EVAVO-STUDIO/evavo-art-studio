# Runtime lifecycle clock integrity

The local runtime treats every caller-supplied lifecycle clock as untrusted mutable input.

## Boundary

Before any journal lock or asynchronous persistence work, the runtime copies each `Date` through intrinsic `Date` semantics into:

- one finite epoch-millisecond primitive; and
- one canonical ISO 8601 timestamp derived from that primitive.

The caller-owned `Date` is never retained by submission, start, heartbeat, completion, failure, resume, redrive, or expired-lease recovery work.

## Invariant

The same clock snapshot controls all effects of one operation:

- persisted `createdAt`, `updatedAt`, `finishedAt`, attempt and event timestamps;
- lease-expiry validation and extension;
- deadline and execution-timeout decisions;
- retry scheduling;
- `notBefore` and retry availability reconciliation; and
- expired execution recovery.

A caller cannot change those decisions by mutating its `Date` after the method call while the runtime waits for the journal lock. Overridden `getTime()` or `toISOString()` methods are not invoked. Invalid, fake, or revoked clock objects fail closed with `RUNTIME_TIME_INVALID` before runtime state changes.

## Verification

`packages/runtime/test/lifecycle-clock-integrity-security.test.mjs` holds the journal lock while mutating clocks, exercises every remaining lifecycle boundary, verifies intrinsic handling of hostile `Date` subclasses, and proves invalid clocks leave state unchanged.

`.github/workflows/runtime-lifecycle-clock-integrity.yml` rebuilds the exact runtime dependency closure, runs the focused persistence and adversarial regressions, verifies the source contract, runs the complete Art Studio validation chain, and proves the checkout remains clean.
