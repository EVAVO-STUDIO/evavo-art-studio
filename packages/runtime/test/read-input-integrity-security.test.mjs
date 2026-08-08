import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LocalRuntimeRepository,
  RuntimeError,
} from "../dist/index.js";

const T0 = new Date("2026-08-08T05:00:00.000Z");

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
      multiplier: 1,
      jitterFraction: 0,
    },
    leaseDurationMs: 10_000,
    timeoutMs: 30_000,
    ...overrides,
  };
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-read-input-"));
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return runtime;
}

function once(reads, name, value) {
  return {
    enumerable: true,
    configurable: true,
    get() {
      const count = (reads.get(name) ?? 0) + 1;
      reads.set(name, count);
      if (count > 1) {
        throw new Error(`private-runtime-read-${name}`);
      }
      return value;
    },
  };
}

function readFailure(secret) {
  return (error) =>
    error instanceof RuntimeError &&
    error.code === "RUNTIME_QUERY_INVALID" &&
    !error.message.includes(secret);
}

function arrayWithHostileIterator(value, secret) {
  const result = [value];
  Object.defineProperty(result, Symbol.iterator, {
    configurable: true,
    get() {
      throw new Error(secret);
    },
  });
  return result;
}

test("list query fields are read exactly once before snapshot work", async (t) => {
  const runtime = await fixture(t);
  await runtime.submit(submission("job-read-once"), "test", T0);

  const reads = new Map();
  const query = {};
  Object.defineProperties(query, {
    states: once(reads, "states", ["queued"]),
    queues: once(reads, "queues", ["media"]),
    kinds: once(reads, "kinds", ["fixture.echo"]),
    limit: once(reads, "limit", 10),
  });

  const jobs = await runtime.list(query);
  assert.deepEqual(jobs.map((job) => job.id), ["job-read-once"]);
  for (const field of ["states", "queues", "kinds", "limit"]) {
    assert.equal(reads.get(field), 1, field);
  }
});

test("list filters use bounded indexed snapshots instead of caller iterators", async (t) => {
  const runtime = await fixture(t);
  await runtime.submit(submission("job-read-iterator"), "test", T0);
  const secret = "private-runtime-filter-iterator";

  const jobs = await runtime.list({
    states: arrayWithHostileIterator("queued", secret),
    queues: arrayWithHostileIterator("media", secret),
    kinds: arrayWithHostileIterator("fixture.echo", secret),
    limit: 10,
  });
  assert.deepEqual(jobs.map((job) => job.id), ["job-read-iterator"]);
});

test("hostile and malformed list queries fail closed without leaking errors", async (t) => {
  const runtime = await fixture(t);
  await runtime.submit(submission("job-read-malformed"), "test", T0);
  const secret = "private-runtime-query-error";

  const hostile = {};
  Object.defineProperty(hostile, "states", {
    enumerable: true,
    get() {
      throw new Error(secret);
    },
  });
  const revokedQuery = Proxy.revocable({}, {});
  revokedQuery.revoke();
  const revokedArray = Proxy.revocable([], {});
  revokedArray.revoke();

  const invalidQueries = [
    null,
    [],
    hostile,
    revokedQuery.proxy,
    { limit: 0 },
    { limit: 100_001 },
    { limit: 1.5 },
    { limit: "10" },
    { states: "queued" },
    { states: ["unknown"] },
    { states: [null] },
    { states: revokedArray.proxy },
    { queues: "media" },
    { queues: [1] },
    { queues: [""] },
    { queues: ["unsafe/name"] },
    { queues: ["q".repeat(129)] },
    { kinds: "fixture.echo" },
    { kinds: [null] },
    { kinds: ["unsafe kind"] },
    { kinds: Array(10_001).fill("fixture.echo") },
  ];

  for (const query of invalidQueries) {
    await assert.rejects(
      () => runtime.list(query),
      readFailure(secret),
    );
    assert.equal((await runtime.list()).length, 1);
  }
});

test("list filter snapshots are detached from later caller mutation", async (t) => {
  const runtime = await fixture(t);
  await runtime.submit(submission("job-read-detached"), "test", T0);

  const states = ["queued"];
  const queues = ["media"];
  const kinds = ["fixture.echo"];
  const pending = runtime.list({ states, queues, kinds, limit: 10 });
  states[0] = "failed";
  queues[0] = "other";
  kinds[0] = "other.kind";

  const jobs = await pending;
  assert.deepEqual(jobs.map((job) => job.id), ["job-read-detached"]);
});

test("get validates and snapshots job IDs before asynchronous reads", async (t) => {
  const runtime = await fixture(t);
  const first = await runtime.submit(submission("job-read-first"), "test", T0);
  const second = await runtime.submit(
    submission("job-read-second", {
      queue: "other",
      idempotencyKey: "job-read-second",
    }),
    "test",
    T0,
  );

  assert.equal((await runtime.get(` ${first.id} `)).id, first.id);
  assert.equal(await runtime.get("job-read-missing"), null);

  let selected = first.id;
  let coercions = 0;
  const dynamicId = {
    [Symbol.toPrimitive]() {
      coercions += 1;
      return selected;
    },
  };
  const pending = runtime.get(dynamicId);
  selected = second.id;
  await assert.rejects(
    () => pending,
    readFailure("private-runtime-job-id-coercion"),
  );
  assert.equal(coercions, 0);

  const secret = "private-runtime-job-id-error";
  const hostileId = {
    [Symbol.toPrimitive]() {
      throw new Error(secret);
    },
  };
  const revokedId = Proxy.revocable({}, {});
  revokedId.revoke();
  for (const jobId of [
    null,
    [],
    hostileId,
    revokedId.proxy,
    "",
    "../job-read-first",
    "job/read-first",
    "job read first",
    `job-${"x".repeat(128)}`,
    "job-read-first\0redirect",
  ]) {
    await assert.rejects(
      () => runtime.get(jobId),
      readFailure(secret),
    );
  }

  await assert.rejects(
    () => runtime.cancellationRequested(hostileId),
    readFailure(secret),
  );
  assert.equal((await runtime.get(first.id)).id, first.id);
  assert.equal((await runtime.get(second.id)).id, second.id);
});
