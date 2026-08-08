import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { acquireFileLock } from "@evavo/art-artifacts";

import {
  LocalRuntimeRepository,
  RuntimeError,
} from "../dist/index.js";

const T0 = new Date("2026-08-08T03:00:00.000Z");
const at = (milliseconds) => new Date(T0.getTime() + milliseconds);

function submission(id, overrides = {}) {
  return {
    id,
    queue: "media",
    kind: "fixture.echo",
    idempotencyKey: id,
    payload: { id },
    requiredCapabilities: ["fixture.echo"],
    maximumAttempts: 3,
    retryPolicy: {
      baseDelayMs: 0,
      maximumDelayMs: 0,
      multiplier: 2,
      jitterFraction: 0,
    },
    leaseDurationMs: 10_000,
    timeoutMs: 30_000,
    ...overrides,
  };
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-lifecycle-clock-"));
  const runtimeRoot = path.join(root, "runtime");
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return { runtime, runtimeRoot };
}

async function claimOne(runtime, now, workerId) {
  const claimed = await runtime.claim({
    worker: { id: workerId, capabilities: ["fixture.echo"] },
    maximumJobs: 1,
    now,
  });
  assert.equal(claimed.length, 1);
  return claimed[0];
}

async function mutateClockWhileJournalWaits(
  runtimeRoot,
  clock,
  replacement,
  action,
) {
  const lock = await acquireFileLock(runtimeRoot, "runtime-journal", {
    timeoutMs: 1_000,
    staleAfterMs: 60_000,
  });
  try {
    const pending = action();
    clock.setTime(replacement.getTime());
    await lock.release();
    return await pending;
  } finally {
    await lock.release();
  }
}

function runtimeTimeFailure(secret) {
  return (error) =>
    error instanceof RuntimeError &&
    error.code === "RUNTIME_TIME_INVALID" &&
    !error.message.includes(secret);
}

test("submission and execution clocks are fixed before journal lock waits", async (t) => {
  const { runtime, runtimeRoot } = await fixture(t);

  const submitClock = at(1);
  const delayed = await mutateClockWhileJournalWaits(
    runtimeRoot,
    submitClock,
    at(50_000),
    () =>
      runtime.submit(
        submission("job-clock-submit", {
          notBefore: at(30_000).toISOString(),
        }),
        "clock-test",
        submitClock,
      ),
  );
  assert.equal(delayed.createdAt, at(1).toISOString());
  assert.equal(delayed.updatedAt, at(1).toISOString());
  assert.equal(delayed.state, "waiting");

  const execution = await runtime.submit(
    submission("job-clock-execution"),
    "clock-test",
    T0,
  );
  const claimed = await claimOne(runtime, at(10), "worker-clock-execution");
  assert.equal(claimed.job.id, execution.id);

  const startClock = at(11);
  const started = await mutateClockWhileJournalWaits(
    runtimeRoot,
    startClock,
    at(20_000),
    () =>
      runtime.start(
        execution.id,
        claimed.lease.token,
        "worker-clock-execution",
        startClock,
      ),
  );
  assert.equal(started.state, "running");
  assert.equal(started.updatedAt, at(11).toISOString());
  assert.equal(started.attempts[0].startedAt, at(11).toISOString());

  const heartbeatClock = at(12);
  const heartbeat = await mutateClockWhileJournalWaits(
    runtimeRoot,
    heartbeatClock,
    at(9_000),
    () =>
      runtime.heartbeat(
        execution.id,
        claimed.lease.token,
        "worker-clock-execution",
        heartbeatClock,
      ),
  );
  assert.equal(heartbeat.job.updatedAt, at(12).toISOString());
  assert.equal(heartbeat.job.lease.expiresAt, at(10_012).toISOString());
  assert.equal(
    heartbeat.job.attempts[0].lastHeartbeatAt,
    at(12).toISOString(),
  );

  const completeClock = at(13);
  const completed = await mutateClockWhileJournalWaits(
    runtimeRoot,
    completeClock,
    at(20_000),
    () =>
      runtime.complete(
        execution.id,
        claimed.lease.token,
        [],
        "worker-clock-execution",
        completeClock,
      ),
  );
  assert.equal(completed.state, "succeeded");
  assert.equal(completed.updatedAt, at(13).toISOString());
  assert.equal(completed.finishedAt, at(13).toISOString());
});

test("failure, resume, redrive and recovery decisions share their clock snapshot", async (t) => {
  const { runtime, runtimeRoot } = await fixture(t);

  const retryJob = await runtime.submit(
    submission("job-clock-failure", {
      retryPolicy: {
        baseDelayMs: 1_000,
        maximumDelayMs: 1_000,
        multiplier: 2,
        jitterFraction: 0,
      },
    }),
    "clock-test",
    T0,
  );
  const retryClaim = await claimOne(runtime, at(100), "worker-clock-failure");
  await runtime.start(
    retryJob.id,
    retryClaim.lease.token,
    "worker-clock-failure",
    at(101),
  );
  const failureClock = at(102);
  const retrying = await mutateClockWhileJournalWaits(
    runtimeRoot,
    failureClock,
    at(5_000),
    () =>
      runtime.fail(
        retryJob.id,
        retryClaim.lease.token,
        {
          classification: "transient",
          code: "CLOCK_RETRY",
          message: "retry from the immutable lifecycle clock",
        },
        "worker-clock-failure",
        failureClock,
      ),
  );
  assert.equal(retrying.state, "retry-wait");
  assert.equal(retrying.updatedAt, at(102).toISOString());
  assert.equal(retrying.nextAttemptAt, at(1_102).toISOString());

  const resumeJob = await runtime.submit(
    submission("job-clock-resume", {
      notBefore: at(30_000).toISOString(),
    }),
    "clock-test",
    T0,
  );
  await runtime.pause(resumeJob.id, "clock-test", { now: at(1) });
  const resumeClock = at(2);
  const resumed = await mutateClockWhileJournalWaits(
    runtimeRoot,
    resumeClock,
    at(40_000),
    () => runtime.resume(resumeJob.id, "clock-test", resumeClock),
  );
  assert.equal(resumed.state, "waiting");
  assert.equal(resumed.updatedAt, at(2).toISOString());

  const redriveJob = await runtime.submit(
    submission("job-clock-redrive", {
      notBefore: at(30_000).toISOString(),
    }),
    "clock-test",
    T0,
  );
  await runtime.cancel(redriveJob.id, "clock-test", { now: at(1) });
  const redriveClock = at(2);
  const redriven = await mutateClockWhileJournalWaits(
    runtimeRoot,
    redriveClock,
    at(40_000),
    () => runtime.redrive(redriveJob.id, 1, "clock-test", redriveClock),
  );
  assert.equal(redriven.state, "waiting");
  assert.equal(redriven.updatedAt, at(2).toISOString());

  const recoveryJob = await runtime.submit(
    submission("job-clock-recovery"),
    "clock-test",
    T0,
  );
  const recoveryClaim = await claimOne(
    runtime,
    at(200),
    "worker-clock-recovery",
  );
  assert.equal(recoveryClaim.job.id, recoveryJob.id);
  await runtime.start(
    recoveryJob.id,
    recoveryClaim.lease.token,
    "worker-clock-recovery",
    at(201),
  );
  const recoveryClock = at(5_000);
  const recovered = await mutateClockWhileJournalWaits(
    runtimeRoot,
    recoveryClock,
    at(20_000),
    () => runtime.recoverExpiredLeases("clock-recovery", recoveryClock),
  );
  assert.deepEqual(recovered, []);
  assert.equal((await runtime.get(recoveryJob.id)).state, "running");
});

test("all lifecycle methods copy clocks through intrinsic Date semantics", async (t) => {
  const { runtime } = await fixture(t);
  const secret = "overridden-runtime-lifecycle-date-method";

  class HostileDate extends Date {
    getTime() {
      throw new Error(secret);
    }

    toISOString() {
      throw new Error(secret);
    }
  }

  const hostile = (milliseconds) =>
    new HostileDate(Date.prototype.getTime.call(at(milliseconds)));

  const completedJob = await runtime.submit(
    submission("job-hostile-clock-complete"),
    "clock-test",
    hostile(1),
  );
  assert.equal(completedJob.createdAt, at(1).toISOString());
  const completedClaim = await claimOne(
    runtime,
    hostile(2),
    "worker-hostile-complete",
  );
  await runtime.start(
    completedJob.id,
    completedClaim.lease.token,
    "worker-hostile-complete",
    hostile(3),
  );
  const heartbeat = await runtime.heartbeat(
    completedJob.id,
    completedClaim.lease.token,
    "worker-hostile-complete",
    hostile(4),
  );
  assert.equal(heartbeat.job.lease.expiresAt, at(10_004).toISOString());
  const completed = await runtime.complete(
    completedJob.id,
    completedClaim.lease.token,
    [],
    "worker-hostile-complete",
    hostile(5),
  );
  assert.equal(completed.finishedAt, at(5).toISOString());

  const failedJob = await runtime.submit(
    submission("job-hostile-clock-fail"),
    "clock-test",
    hostile(10),
  );
  const failedClaim = await claimOne(
    runtime,
    hostile(11),
    "worker-hostile-fail",
  );
  await runtime.start(
    failedJob.id,
    failedClaim.lease.token,
    "worker-hostile-fail",
    hostile(12),
  );
  const failed = await runtime.fail(
    failedJob.id,
    failedClaim.lease.token,
    {
      classification: "permanent",
      code: "HOSTILE_CLOCK",
      message: "hostile clock methods must not run",
    },
    "worker-hostile-fail",
    hostile(13),
  );
  assert.equal(failed.state, "failed");
  assert.equal(failed.updatedAt, at(13).toISOString());

  const resumedJob = await runtime.submit(
    submission("job-hostile-clock-resume", {
      notBefore: at(50_000).toISOString(),
    }),
    "clock-test",
    hostile(20),
  );
  await runtime.pause(resumedJob.id, "clock-test", { now: hostile(21) });
  const resumed = await runtime.resume(
    resumedJob.id,
    "clock-test",
    hostile(22),
  );
  assert.equal(resumed.state, "waiting");
  assert.equal(resumed.updatedAt, at(22).toISOString());

  const redrivenJob = await runtime.submit(
    submission("job-hostile-clock-redrive", {
      notBefore: at(50_000).toISOString(),
    }),
    "clock-test",
    hostile(30),
  );
  await runtime.cancel(redrivenJob.id, "clock-test", { now: hostile(31) });
  const redriven = await runtime.redrive(
    redrivenJob.id,
    1,
    "clock-test",
    hostile(32),
  );
  assert.equal(redriven.state, "waiting");
  assert.equal(redriven.updatedAt, at(32).toISOString());

  const recoveryJob = await runtime.submit(
    submission("job-hostile-clock-recovery"),
    "clock-test",
    hostile(40),
  );
  const recoveryClaim = await claimOne(
    runtime,
    hostile(41),
    "worker-hostile-recovery",
  );
  assert.equal(recoveryClaim.job.id, recoveryJob.id);
  await runtime.start(
    recoveryJob.id,
    recoveryClaim.lease.token,
    "worker-hostile-recovery",
    hostile(42),
  );
  const recovered = await runtime.recoverExpiredLeases(
    "clock-recovery",
    hostile(10_042),
  );
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].id, recoveryJob.id);
  assert.equal(recovered[0].updatedAt, at(10_042).toISOString());
});

test("invalid lifecycle clocks fail closed before runtime state changes", async (t) => {
  const { runtime } = await fixture(t);
  const secret = "private-invalid-runtime-clock";

  await assert.rejects(
    () =>
      runtime.submit(
        submission("job-invalid-clock"),
        "clock-test",
        new Date(Number.NaN),
      ),
    runtimeTimeFailure(secret),
  );
  assert.equal((await runtime.list()).length, 0);

  const fakeClock = {
    getTime() {
      throw new Error(secret);
    },
    toISOString() {
      throw new Error(secret);
    },
  };
  await assert.rejects(
    () =>
      runtime.submit(
        submission("job-fake-clock"),
        "clock-test",
        fakeClock,
      ),
    runtimeTimeFailure(secret),
  );
  assert.equal((await runtime.list()).length, 0);

  const revoked = Proxy.revocable(new Date(), {});
  revoked.revoke();
  await assert.rejects(
    () =>
      runtime.submit(
        submission("job-revoked-clock"),
        "clock-test",
        revoked.proxy,
      ),
    runtimeTimeFailure(secret),
  );
  assert.equal((await runtime.list()).length, 0);
});
