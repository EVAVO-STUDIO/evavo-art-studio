import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { acquireFileLock } from "@evavo/art-artifacts";

import {
  LocalRuntimeRepository,
  RuntimeError,
} from "../dist/index.js";

const T0 = new Date("2026-08-08T00:00:00.000Z");
const at = (milliseconds) => new Date(T0.getTime() + milliseconds);

function submission(id, overrides = {}) {
  return {
    id,
    queue: "media",
    kind: "fixture.echo",
    idempotencyKey: id,
    payload: { id },
    requiredCapabilities: ["fixture.echo"],
    maximumAttempts: 2,
    retryPolicy: {
      baseDelayMs: 1_000,
      maximumDelayMs: 1_000,
      multiplier: 1,
      jitterFraction: 0,
    },
    leaseDurationMs: 10_000,
    timeoutMs: 30_000,
    ...overrides,
  };
}

async function fixture(t, suffix = "") {
  const root = await mkdtemp(
    path.join(os.tmpdir(), `evavo-transition-clock-${suffix}`),
  );
  const runtimeRoot = path.join(root, "runtime");
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return { runtime, runtimeRoot };
}

async function mutateWhileJournalLocked(
  runtimeRoot,
  now,
  mutatedNow,
  operation,
) {
  const lock = await acquireFileLock(runtimeRoot, "runtime-journal", {
    timeoutMs: 1_000,
    staleAfterMs: 60_000,
  });
  try {
    const pending = operation();
    now.setTime(mutatedNow.getTime());
    await lock.release();
    return await pending;
  } finally {
    await lock.release();
  }
}

async function runningJob(runtime, id, overrides = {}, claimAt = at(1)) {
  await runtime.submit(submission(id, overrides), "test", T0);
  const claimed = await runtime.claim({
    worker: { id: `worker-${id}`, capabilities: ["fixture.echo"] },
    maximumJobs: 1,
    now: claimAt,
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].job.id, id);
  await runtime.start(
    id,
    claimed[0].lease.token,
    `worker-${id}`,
    new Date(claimAt.getTime() + 1),
  );
  return claimed[0];
}

function timeFailure(secret) {
  return (error) =>
    error instanceof RuntimeError &&
    error.code === "RUNTIME_TIME_INVALID" &&
    !error.message.includes(secret);
}

test("all journal-backed transition methods snapshot clocks before asynchronous work", async () => {
  const source = await readFile(
    new URL("../src/local-repository.ts", import.meta.url),
    "utf8",
  );
  const methods = [
    ["submitBatch", "get"],
    ["start", "heartbeat"],
    ["heartbeat", "complete"],
    ["complete", "fail"],
    ["fail", "cancel"],
    ["resume", "redrive"],
    ["redrive", "recoverExpiredLeases"],
    ["recoverExpiredLeases", "cancellationRequested"],
  ];

  for (const [method, nextMethod] of methods) {
    const start = source.indexOf(`  public async ${method}(`);
    const end = source.indexOf(`  public async ${nextMethod}(`, start);
    assert.ok(start >= 0 && end > start, method);
    const block = source.slice(start, end);
    const clockCall = "snapshotRuntimeTransitionClock(now)";
    const clockIndex = block.indexOf(clockCall);
    const journalIndex = block.indexOf("this.#journal.transact");
    assert.ok(clockIndex >= 0, `${method} must snapshot its clock`);
    assert.ok(
      journalIndex < 0 || clockIndex < journalIndex,
      `${method} must snapshot before journal work`,
    );
    assert.doesNotMatch(
      block.slice(clockIndex + clockCall.length),
      /\bnow\b/,
      `${method} must not retain the caller clock after snapshotting`,
    );
  }

  const claimStart = source.indexOf("function snapshotRuntimeClaimRequest(");
  const claimEnd = source.indexOf(
    "function snapshotRuntimeTransitionClock(",
    claimStart,
  );
  const claimBlock = source.slice(claimStart, claimEnd);
  assert.ok(
    claimBlock.indexOf("snapshotRuntimeClaimDate(nowInput)") <
      claimBlock.indexOf("normalizeRuntimeWorkerDescriptor("),
    "claim time must be copied before worker normalization can run getters",
  );
});

test("claim clocks are captured before worker normalization can mutate them", async (t) => {
  const { runtime } = await fixture(t, "claim-");
  await runtime.submit(submission("job-claim-clock-immediate"), "test", T0);
  await runtime.submit(
    submission("job-claim-clock-delayed", {
      notBefore: at(3_600_000).toISOString(),
    }),
    "test",
    T0,
  );

  const now = at(1);
  const worker = {
    capabilities: ["fixture.echo"],
  };
  Object.defineProperty(worker, "id", {
    enumerable: true,
    get() {
      now.setTime(at(7_200_000).getTime());
      return "worker-claim-clock-order";
    },
  });

  const claimed = await runtime.claim({ worker, maximumJobs: 2, now });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].job.id, "job-claim-clock-immediate");
  assert.equal(claimed[0].lease.leasedAt, at(1).toISOString());
  assert.equal(
    (await runtime.get("job-claim-clock-delayed")).state,
    "waiting",
  );
});

test("post-call clock mutation cannot change submission or execution transitions", async (t) => {
  const { runtime, runtimeRoot } = await fixture(t, "execution-");
  await runtime.snapshot();

  const submitNow = at(1);
  const delayed = await mutateWhileJournalLocked(
    runtimeRoot,
    submitNow,
    at(7_200_000),
    () =>
      runtime.submit(
        submission("job-transition-submit", {
          notBefore: at(3_600_000).toISOString(),
        }),
        "test",
        submitNow,
      ),
  );
  assert.equal(delayed.state, "waiting");
  assert.equal(delayed.createdAt, at(1).toISOString());
  assert.equal(delayed.updatedAt, at(1).toISOString());

  await runtime.submit(submission("job-transition-execution"), "test", T0);
  const claimed = await runtime.claim({
    worker: {
      id: "worker-transition-execution",
      capabilities: ["fixture.echo"],
    },
    maximumJobs: 1,
    now: at(2),
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].job.id, "job-transition-execution");

  const startNow = at(3);
  const started = await mutateWhileJournalLocked(
    runtimeRoot,
    startNow,
    at(20_000),
    () =>
      runtime.start(
        claimed[0].job.id,
        claimed[0].lease.token,
        "worker-transition-execution",
        startNow,
      ),
  );
  assert.equal(started.state, "running");
  assert.equal(started.updatedAt, at(3).toISOString());

  const heartbeatNow = at(4);
  const heartbeat = await mutateWhileJournalLocked(
    runtimeRoot,
    heartbeatNow,
    at(40_000),
    () =>
      runtime.heartbeat(
        claimed[0].job.id,
        claimed[0].lease.token,
        "worker-transition-execution",
        heartbeatNow,
      ),
  );
  assert.equal(heartbeat.job.state, "running");
  assert.equal(heartbeat.job.updatedAt, at(4).toISOString());
  assert.equal(heartbeat.job.lease.expiresAt, at(10_004).toISOString());

  const completeNow = at(5);
  const completed = await mutateWhileJournalLocked(
    runtimeRoot,
    completeNow,
    at(50_000),
    () =>
      runtime.complete(
        claimed[0].job.id,
        claimed[0].lease.token,
        [],
        "worker-transition-execution",
        completeNow,
      ),
  );
  assert.equal(completed.state, "succeeded");
  assert.equal(completed.finishedAt, at(5).toISOString());
});

test("post-call clock mutation cannot change failure or recovery decisions", async (t) => {
  const { runtime, runtimeRoot } = await fixture(t, "failure-");
  const failedClaim = await runningJob(runtime, "job-transition-failure");

  const failNow = at(3);
  const failed = await mutateWhileJournalLocked(
    runtimeRoot,
    failNow,
    at(20_000),
    () =>
      runtime.fail(
        failedClaim.job.id,
        failedClaim.lease.token,
        {
          classification: "transient",
          code: "TRANSIENT_FIXTURE",
          message: "Retry the fixture.",
        },
        "worker-job-transition-failure",
        failNow,
      ),
  );
  assert.equal(failed.state, "retry-wait");
  assert.equal(failed.updatedAt, at(3).toISOString());
  assert.equal(failed.nextAttemptAt, at(1_003).toISOString());

  const recoveryClaim = await runningJob(
    runtime,
    "job-transition-recovery",
    {},
    at(4),
  );
  const recoverNow = at(6);
  const recovered = await mutateWhileJournalLocked(
    runtimeRoot,
    recoverNow,
    at(20_000),
    () => runtime.recoverExpiredLeases("runtime-recovery", recoverNow),
  );
  assert.deepEqual(recovered, []);
  assert.equal((await runtime.get(failedClaim.job.id)).state, "retry-wait");
  assert.equal((await runtime.get(recoveryClaim.job.id)).state, "running");
});

test("post-call clock mutation cannot change resume or redrive reconciliation", async (t) => {
  const resumedFixture = await fixture(t, "resume-");
  await resumedFixture.runtime.submit(
    submission("job-transition-resume", {
      notBefore: at(3_600_000).toISOString(),
    }),
    "test",
    T0,
  );
  await resumedFixture.runtime.pause(
    "job-transition-resume",
    "operator",
    { now: at(1) },
  );
  const resumeNow = at(2);
  const resumed = await mutateWhileJournalLocked(
    resumedFixture.runtimeRoot,
    resumeNow,
    at(7_200_000),
    () =>
      resumedFixture.runtime.resume(
        "job-transition-resume",
        "operator",
        resumeNow,
      ),
  );
  assert.equal(resumed.state, "waiting");
  assert.equal(resumed.updatedAt, at(2).toISOString());

  const redriveFixture = await fixture(t, "redrive-");
  await redriveFixture.runtime.submit(
    submission("job-transition-redrive", {
      maximumAttempts: 1,
      notBefore: at(3_600_000).toISOString(),
    }),
    "test",
    T0,
  );
  const claimed = await redriveFixture.runtime.claim({
    worker: {
      id: "worker-transition-redrive",
      capabilities: ["fixture.echo"],
    },
    maximumJobs: 1,
    now: at(3_600_001),
  });
  await redriveFixture.runtime.start(
    claimed[0].job.id,
    claimed[0].lease.token,
    "worker-transition-redrive",
    at(3_600_002),
  );
  const terminal = await redriveFixture.runtime.fail(
    claimed[0].job.id,
    claimed[0].lease.token,
    {
      classification: "permanent",
      code: "PERMANENT_FIXTURE",
      message: "Do not retry automatically.",
    },
    "worker-transition-redrive",
    at(3_600_003),
  );
  assert.equal(terminal.state, "failed");

  const redriveNow = at(2);
  const redriven = await mutateWhileJournalLocked(
    redriveFixture.runtimeRoot,
    redriveNow,
    at(7_200_000),
    () =>
      redriveFixture.runtime.redrive(
        claimed[0].job.id,
        1,
        "operator",
        redriveNow,
      ),
  );
  assert.equal(redriven.state, "waiting");
  assert.equal(redriven.updatedAt, at(2).toISOString());
});

test("transition clocks fail closed and use intrinsic Date semantics", async (t) => {
  const { runtime } = await fixture(t, "invalid-");
  const job = await runtime.submit(
    submission("job-transition-invalid-clock"),
    "test",
    T0,
  );
  const secret = "private-transition-clock-error";
  const revoked = Proxy.revocable(new Date(T0), {});
  revoked.revoke();

  for (const invalid of [
    null,
    [],
    {},
    "2026-08-08T00:00:00.000Z",
    new Date(Number.NaN),
    revoked.proxy,
    {
      getTime() {
        throw new Error(secret);
      },
      toISOString() {
        throw new Error(secret);
      },
    },
  ]) {
    await assert.rejects(
      () => runtime.recoverExpiredLeases("runtime-recovery", invalid),
      timeFailure(secret),
    );
    assert.equal((await runtime.get(job.id)).state, "queued");
  }

  class HostileDate extends Date {
    getTime() {
      throw new Error(secret);
    }

    toISOString() {
      throw new Error(secret);
    }
  }
  const hostileNow = new HostileDate(at(30));
  const submitted = await runtime.submit(
    submission("job-transition-hostile-date"),
    "test",
    hostileNow,
  );
  assert.equal(submitted.createdAt, at(30).toISOString());
  assert.equal(submitted.updatedAt, at(30).toISOString());
});
