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

const T0 = new Date("2026-08-08T00:00:00.000Z");
const at = (milliseconds) => new Date(T0.getTime() + milliseconds);

function once(reads, name, value) {
  return {
    enumerable: true,
    configurable: true,
    get() {
      const count = (reads.get(name) ?? 0) + 1;
      reads.set(name, count);
      if (count > 1) {
        throw new Error(`runtime-control-secret-${name}`);
      }
      return value;
    },
  };
}

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
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-control-options-"));
  const runtimeRoot = path.join(root, "runtime");
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return { runtime, runtimeRoot };
}

async function startJob(runtime, id, now = at(1)) {
  await runtime.submit(submission(id), "test", T0);
  const claimed = await runtime.claim({
    worker: { id: `worker-${id}`, capabilities: ["fixture.echo"] },
    maximumJobs: 1,
    now,
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].job.id, id);
  await runtime.start(
    id,
    claimed[0].lease.token,
    `worker-${id}`,
    at(now.getTime() - T0.getTime() + 1),
  );
  return claimed[0];
}

function controlOptionsFailure(secret) {
  return (error) =>
    error instanceof RuntimeError &&
    error.code === "RUNTIME_JOB_CONTROL_OPTIONS_INVALID" &&
    !error.message.includes(secret);
}

test("cancel and pause options are read exactly once before journal work", async (t) => {
  const { runtime } = await fixture(t);
  const cancelJob = await runtime.submit(
    submission("job-control-cancel-once"),
    "test",
    T0,
  );
  const pauseJob = await runtime.submit(
    submission("job-control-pause-once"),
    "test",
    T0,
  );

  const cancelReads = new Map();
  const cancelOptions = {};
  Object.defineProperties(cancelOptions, {
    force: once(cancelReads, "force", false),
    now: once(cancelReads, "now", at(10)),
  });
  const cancelled = await runtime.cancel(
    cancelJob.id,
    "operator",
    cancelOptions,
  );
  assert.equal(cancelled.state, "cancelled");
  assert.equal(cancelled.updatedAt, at(10).toISOString());
  assert.equal(cancelReads.get("force"), 1);
  assert.equal(cancelReads.get("now"), 1);

  const pauseReads = new Map();
  const pauseOptions = {};
  Object.defineProperties(pauseOptions, {
    force: once(pauseReads, "force", false),
    now: once(pauseReads, "now", at(20)),
  });
  const paused = await runtime.pause(
    pauseJob.id,
    "operator",
    pauseOptions,
  );
  assert.equal(paused.state, "paused");
  assert.equal(paused.updatedAt, at(20).toISOString());
  assert.equal(pauseReads.get("force"), 1);
  assert.equal(pauseReads.get("now"), 1);
});

test("post-call mutation cannot escalate cooperative cancellation or advance unrelated jobs", async (t) => {
  const { runtime, runtimeRoot } = await fixture(t);
  await runtime.submit(submission("job-control-cancel-active"), "test", T0);
  await runtime.submit(
    submission("job-control-delayed", {
      notBefore: at(3_600_000).toISOString(),
    }),
    "test",
    T0,
  );
  const claimed = await runtime.claim({
    worker: { id: "worker-cancel", capabilities: ["fixture.echo"] },
    maximumJobs: 1,
    now: at(1),
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].job.id, "job-control-cancel-active");
  await runtime.start(
    claimed[0].job.id,
    claimed[0].lease.token,
    "worker-cancel",
    at(2),
  );

  const lock = await acquireFileLock(runtimeRoot, "runtime-journal", {
    timeoutMs: 1_000,
    staleAfterMs: 60_000,
  });
  const now = at(3);
  const options = { force: false, now };
  try {
    const pending = runtime.cancel(
      claimed[0].job.id,
      "operator",
      options,
    );
    options.force = true;
    now.setTime(at(7_200_000).getTime());
    await lock.release();

    const requested = await pending;
    assert.equal(requested.state, "running");
    assert.equal(requested.cancellationRequestedAt, at(3).toISOString());
    assert.equal(
      (await runtime.get("job-control-delayed")).state,
      "waiting",
    );
  } finally {
    await lock.release();
  }
});

test("post-call mutation cannot escalate cooperative pause", async (t) => {
  const { runtime, runtimeRoot } = await fixture(t);
  const claimed = await startJob(runtime, "job-control-pause-active");
  const lock = await acquireFileLock(runtimeRoot, "runtime-journal", {
    timeoutMs: 1_000,
    staleAfterMs: 60_000,
  });
  const options = { force: false, now: at(5) };
  try {
    const pending = runtime.pause(
      claimed.job.id,
      "operator",
      options,
    );
    options.force = true;
    await lock.release();

    const requested = await pending;
    assert.equal(requested.state, "running");
    assert.equal(requested.pauseRequestedAt, at(5).toISOString());
  } finally {
    await lock.release();
  }
});

test("hostile and malformed control options fail closed without state changes", async (t) => {
  const { runtime } = await fixture(t);
  const job = await runtime.submit(
    submission("job-control-hostile"),
    "test",
    T0,
  );
  const secret = "private-runtime-control-error";
  const hostile = {};
  Object.defineProperty(hostile, "force", {
    enumerable: true,
    get() {
      throw new Error(secret);
    },
  });

  await assert.rejects(
    () => runtime.cancel(job.id, "operator", hostile),
    controlOptionsFailure(secret),
  );
  assert.equal((await runtime.get(job.id)).state, "queued");

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  await assert.rejects(
    () => runtime.pause(job.id, "operator", revoked.proxy),
    controlOptionsFailure(secret),
  );
  assert.equal((await runtime.get(job.id)).state, "queued");

  for (const options of [
    null,
    [],
    { force: "true" },
    { now: "2026-08-08T00:00:00.000Z" },
    { now: new Date(Number.NaN) },
  ]) {
    await assert.rejects(
      () => runtime.cancel(job.id, "operator", options),
      controlOptionsFailure("malformed-runtime-control"),
    );
    assert.equal((await runtime.get(job.id)).state, "queued");
  }
});

test("control clocks are copied through intrinsic Date semantics", async (t) => {
  const { runtime } = await fixture(t);
  const job = await runtime.submit(
    submission("job-control-hostile-date"),
    "test",
    T0,
  );
  const secret = "overridden-date-method";
  class HostileDate extends Date {
    getTime() {
      throw new Error(secret);
    }

    toISOString() {
      throw new Error(secret);
    }
  }
  const now = new HostileDate(at(30));
  const cancelled = await runtime.cancel(job.id, "operator", { now });
  assert.equal(cancelled.state, "cancelled");
  assert.equal(cancelled.updatedAt, at(30).toISOString());
});
