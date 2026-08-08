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
        throw new Error(`runtime-claim-secret-${name}`);
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
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-claim-input-"));
  const runtimeRoot = path.join(root, "runtime");
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return { runtime, runtimeRoot };
}

function claimInputFailure(secret) {
  return (error) =>
    error instanceof RuntimeError &&
    error.code === "RUNTIME_CLAIM_INVALID" &&
    !error.message.includes(secret);
}

test("claim request fields are read exactly once before journal work", async (t) => {
  const { runtime } = await fixture(t);
  await runtime.submit(
    submission("job-claim-once"),
    "test",
    T0,
  );

  const reads = new Map();
  const request = {};
  Object.defineProperties(request, {
    worker: once(reads, "worker", {
      id: "worker-claim-once",
      capabilities: ["fixture.echo"],
    }),
    maximumJobs: once(reads, "maximumJobs", 1),
    now: once(reads, "now", at(1)),
  });

  const claimed = await runtime.claim(request);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].job.id, "job-claim-once");
  for (const field of ["worker", "maximumJobs", "now"]) {
    assert.equal(reads.get(field), 1, field);
  }
});

test("post-call clock mutation cannot advance delayed jobs or extend leases", async (t) => {
  const { runtime, runtimeRoot } = await fixture(t);
  await runtime.submit(
    submission("job-claim-immediate"),
    "test",
    T0,
  );
  await runtime.submit(
    submission("job-claim-delayed", {
      notBefore: at(3_600_000).toISOString(),
    }),
    "test",
    T0,
  );

  const lock = await acquireFileLock(runtimeRoot, "runtime-journal", {
    timeoutMs: 1_000,
    staleAfterMs: 60_000,
  });
  const now = at(1);
  try {
    const pending = runtime.claim({
      worker: {
        id: "worker-claim-clock",
        capabilities: ["fixture.echo"],
      },
      maximumJobs: 2,
      now,
    });
    now.setTime(at(7_200_000).getTime());
    await lock.release();

    const claimed = await pending;
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].job.id, "job-claim-immediate");
    assert.equal(claimed[0].lease.leasedAt, at(1).toISOString());
    assert.equal(claimed[0].lease.expiresAt, at(10_001).toISOString());
    assert.equal(
      (await runtime.get("job-claim-delayed")).state,
      "waiting",
    );
  } finally {
    await lock.release();
  }
});

test("hostile claim requests fail closed without changing queued jobs", async (t) => {
  const { runtime } = await fixture(t);
  const job = await runtime.submit(
    submission("job-claim-hostile"),
    "test",
    T0,
  );
  const secret = "private-runtime-claim-error";
  const hostile = {};
  Object.defineProperty(hostile, "worker", {
    enumerable: true,
    get() {
      throw new Error(secret);
    },
  });

  await assert.rejects(
    () => runtime.claim(hostile),
    claimInputFailure(secret),
  );
  assert.equal((await runtime.get(job.id)).state, "queued");

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  await assert.rejects(
    () => runtime.claim(revoked.proxy),
    claimInputFailure(secret),
  );
  assert.equal((await runtime.get(job.id)).state, "queued");
});

test("malformed claim controls are rejected before scheduling", async (t) => {
  const { runtime } = await fixture(t);
  const job = await runtime.submit(
    submission("job-claim-malformed"),
    "test",
    T0,
  );
  const worker = {
    id: "worker-claim-malformed",
    capabilities: ["fixture.echo"],
  };
  const invalidRequests = [
    null,
    [],
    { worker, maximumJobs: 0 },
    { worker, maximumJobs: 101 },
    { worker, maximumJobs: 1.5 },
    { worker, maximumJobs: "1" },
    { worker, now: "2026-08-08T00:00:00.000Z" },
    { worker, now: new Date(Number.NaN) },
  ];

  for (const request of invalidRequests) {
    await assert.rejects(
      () => runtime.claim(request),
      claimInputFailure("malformed-runtime-claim"),
    );
    assert.equal((await runtime.get(job.id)).state, "queued");
  }
});

test("claim clocks are copied through intrinsic Date semantics", async (t) => {
  const { runtime } = await fixture(t);
  await runtime.submit(
    submission("job-claim-hostile-date"),
    "test",
    T0,
  );
  const secret = "overridden-claim-date-method";
  class HostileDate extends Date {
    getTime() {
      throw new Error(secret);
    }

    toISOString() {
      throw new Error(secret);
    }
  }

  const claimed = await runtime.claim({
    worker: {
      id: "worker-claim-hostile-date",
      capabilities: ["fixture.echo"],
    },
    maximumJobs: 1,
    now: new HostileDate(at(30).getTime()),
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].lease.leasedAt, at(30).toISOString());
  assert.equal(claimed[0].lease.expiresAt, at(10_030).toISOString());
});
