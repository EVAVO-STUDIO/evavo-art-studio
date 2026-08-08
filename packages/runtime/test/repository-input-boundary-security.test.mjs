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
        throw new Error(`runtime-boundary-secret-${name}`);
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
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-runtime-boundary-"));
  const runtimeRoot = path.join(root, "runtime");
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return { runtime, runtimeRoot };
}

function boundaryFailure(code, secret) {
  return (error) =>
    error instanceof RuntimeError &&
    error.code === code &&
    !error.message.includes(secret);
}

test("local runtime options are read once and fail closed", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-runtime-options-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const reads = new Map();
  const options = {};
  Object.defineProperties(options, {
    root: once(reads, "root", root),
    lockTimeoutMs: once(reads, "lockTimeoutMs", 1_000),
    staleLockMs: once(reads, "staleLockMs", 60_000),
  });
  const runtime = new LocalRuntimeRepository(options);
  await runtime.snapshot();
  for (const field of ["root", "lockTimeoutMs", "staleLockMs"]) {
    assert.equal(reads.get(field), 1, field);
  }

  const secret = "private-runtime-options-error";
  const hostile = {};
  Object.defineProperty(hostile, "root", {
    enumerable: true,
    get() {
      throw new Error(secret);
    },
  });
  assert.throws(
    () => new LocalRuntimeRepository(hostile),
    boundaryFailure("RUNTIME_OPTIONS_INVALID", secret),
  );

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  for (const invalid of [
    null,
    [],
    revoked.proxy,
    { root: 7 },
    { root: "runtime\0private" },
    { root, lockTimeoutMs: -1 },
    { root, staleLockMs: 1.5 },
  ]) {
    assert.throws(
      () => new LocalRuntimeRepository(invalid),
      boundaryFailure("RUNTIME_OPTIONS_INVALID", secret),
    );
  }
});

test("submission batch containers are snapshotted by index before journal work", async (t) => {
  const { runtime } = await fixture(t);
  const secret = "hostile-submission-batch-method";
  const reads = new Map();
  const target = [
    submission("job-boundary-batch-a"),
    submission("job-boundary-batch-b"),
  ];
  Object.defineProperty(target, "map", {
    configurable: true,
    get() {
      throw new Error(secret);
    },
  });
  Object.defineProperty(target, Symbol.iterator, {
    configurable: true,
    value() {
      throw new Error(secret);
    },
  });
  const batch = new Proxy(target, {
    get(array, property, receiver) {
      if (property === "length" || property === "0" || property === "1") {
        const name = String(property);
        const count = (reads.get(name) ?? 0) + 1;
        reads.set(name, count);
        if (count > 1) throw new Error(`runtime-batch-repeat-${name}`);
      }
      return Reflect.get(array, property, receiver);
    },
  });

  const jobs = await runtime.submitBatch(batch, "test", T0);
  assert.deepEqual(
    jobs.map((job) => job.id),
    ["job-boundary-batch-a", "job-boundary-batch-b"],
  );
  assert.equal(reads.get("length"), 1);
  assert.equal(reads.get("0"), 1);
  assert.equal(reads.get("1"), 1);
});

test("post-call mutation cannot replace captured submission batch entries", async (t) => {
  const { runtime, runtimeRoot } = await fixture(t);
  await runtime.snapshot();
  const lock = await acquireFileLock(runtimeRoot, "runtime-journal", {
    timeoutMs: 1_000,
    staleAfterMs: 60_000,
  });
  const original = submission("job-boundary-original");
  const replacement = submission("job-boundary-replacement");
  const batch = [original];
  try {
    const pending = runtime.submitBatch(batch, "test", T0);
    batch[0] = replacement;
    await lock.release();

    const jobs = await pending;
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].id, "job-boundary-original");
    assert.equal(await runtime.get("job-boundary-replacement"), null);
  } finally {
    await lock.release();
  }
});

test("runtime queries are read once and ignore caller iterators", async (t) => {
  const { runtime } = await fixture(t);
  await runtime.submit(
    submission("job-boundary-query-media"),
    "test",
    T0,
  );
  await runtime.submit(
    submission("job-boundary-query-review", { queue: "review" }),
    "test",
    T0,
  );

  const secret = "hostile-runtime-query-iterator";
  const states = ["queued"];
  const queues = ["media"];
  const kinds = ["fixture.echo"];
  for (const values of [states, queues, kinds]) {
    Object.defineProperty(values, Symbol.iterator, {
      configurable: true,
      value() {
        throw new Error(secret);
      },
    });
  }

  const reads = new Map();
  const query = {};
  Object.defineProperties(query, {
    states: once(reads, "states", states),
    queues: once(reads, "queues", queues),
    kinds: once(reads, "kinds", kinds),
    limit: once(reads, "limit", 10),
  });

  const jobs = await runtime.list(query);
  assert.deepEqual(
    jobs.map((job) => job.id),
    ["job-boundary-query-media"],
  );
  for (const field of ["states", "queues", "kinds", "limit"]) {
    assert.equal(reads.get(field), 1, field);
  }
});

test("post-call mutation cannot change a pending runtime query", async (t) => {
  const { runtime } = await fixture(t);
  await runtime.submit(
    submission("job-boundary-query-original"),
    "test",
    T0,
  );
  await runtime.submit(
    submission("job-boundary-query-other", { queue: "review" }),
    "test",
    T0,
  );

  const states = ["queued"];
  const queues = ["media"];
  const kinds = ["fixture.echo"];
  const query = { states, queues, kinds, limit: 10 };
  const pending = runtime.list(query);
  states[0] = "failed";
  queues[0] = "review";
  kinds[0] = "changed.kind";
  query.limit = 1;

  const jobs = await pending;
  assert.deepEqual(
    jobs.map((job) => job.id),
    ["job-boundary-query-original"],
  );
});

test("hostile repository identities and collections fail closed", async (t) => {
  const { runtime } = await fixture(t);
  const existing = await runtime.submit(
    submission("job-boundary-hostile"),
    "test",
    T0,
  );
  const secret = "private-runtime-boundary-error";

  const revokedBatch = Proxy.revocable([], {});
  revokedBatch.revoke();
  await assert.rejects(
    () => runtime.submitBatch(revokedBatch.proxy, "test", at(1)),
    boundaryFailure("RUNTIME_BATCH_INVALID", secret),
  );
  assert.equal((await runtime.list()).length, 1);

  const hostileQuery = {};
  Object.defineProperty(hostileQuery, "states", {
    enumerable: true,
    get() {
      throw new Error(secret);
    },
  });
  await assert.rejects(
    () => runtime.list(hostileQuery),
    boundaryFailure("RUNTIME_QUERY_INVALID", secret),
  );

  const revokedQuery = Proxy.revocable({}, {});
  revokedQuery.revoke();
  for (const query of [
    null,
    [],
    revokedQuery.proxy,
    { states: ["unknown"] },
    { queues: [7] },
    { kinds: [" unsafe"] },
    { limit: 0 },
  ]) {
    await assert.rejects(
      () => runtime.list(query),
      boundaryFailure("RUNTIME_QUERY_INVALID", secret),
    );
  }

  const hostileActor = {};
  Object.defineProperty(hostileActor, "trim", {
    get() {
      throw new Error(secret);
    },
  });
  await assert.rejects(
    () =>
      runtime.submit(
        submission("job-boundary-hostile-actor"),
        hostileActor,
        at(2),
      ),
    boundaryFailure("RUNTIME_ACTOR_INVALID", secret),
  );
  assert.equal(await runtime.get("job-boundary-hostile-actor"), null);

  const hostileJobId = {
    toString() {
      throw new Error(secret);
    },
  };
  await assert.rejects(
    () => runtime.get(hostileJobId),
    boundaryFailure("RUNTIME_JOB_ID_INVALID", secret),
  );

  const claimed = await runtime.claim({
    worker: {
      id: "worker-boundary-hostile",
      capabilities: ["fixture.echo"],
    },
    maximumJobs: 1,
    now: at(3),
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].job.id, existing.id);

  const hostileLeaseToken = {
    toString() {
      throw new Error(secret);
    },
  };
  for (const leaseToken of [hostileLeaseToken, "invalid-token"]) {
    await assert.rejects(
      () =>
        runtime.start(
          existing.id,
          leaseToken,
          "worker-boundary-hostile",
          at(4),
        ),
      boundaryFailure("RUNTIME_LEASE_TOKEN_INVALID", secret),
    );
    assert.equal((await runtime.get(existing.id)).state, "leased");
  }
});
