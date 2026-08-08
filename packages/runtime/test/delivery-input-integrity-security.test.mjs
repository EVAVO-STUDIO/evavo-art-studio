import assert from "node:assert/strict";
import test from "node:test";

import {
  PgBossRuntimeDelivery,
  RuntimeError,
} from "../dist/index.js";

const T0 = new Date("2026-08-08T08:00:00.000Z");
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolveInput, rejectInput) => {
    resolve = resolveInput;
    reject = rejectInput;
  });
  return { promise, resolve, reject };
}

function once(reads, name, value) {
  return {
    enumerable: true,
    configurable: true,
    get() {
      const count = (reads.get(name) ?? 0) + 1;
      reads.set(name, count);
      if (count > 1) {
        throw new Error(`runtime-delivery-secret-${name}`);
      }
      return value;
    },
  };
}

function deliveryJob(overrides = {}) {
  const { spec: specOverrides = {}, ...jobOverrides } = overrides;
  const spec = {
    id: "job-delivery",
    queue: "media",
    priority: 7,
    timeoutMs: 30_000,
    notBefore: new Date(T0.getTime() + 1_000).toISOString(),
    ...specOverrides,
  };
  return {
    id: spec.id,
    specHash: HASH_A,
    spec,
    ...jobOverrides,
  };
}

function runtimeFailure(code, secret = "private-runtime-delivery-error") {
  return (error) =>
    error instanceof RuntimeError &&
    error.code === code &&
    !error.message.includes(secret);
}

class FakeBoss {
  started = false;
  startCalls = 0;
  stopCalls = 0;
  queues = new Map();
  getQueueCalls = [];
  createQueueCalls = [];
  sent = [];
  workers = new Map();
  workCalls = [];
  offWorkCalls = [];
  touched = [];
  cancelled = [];
  retried = [];
  queueGate = null;
  workGate = null;
  sendGate = null;
  sendStarted = null;
  sendResult = undefined;

  async start() {
    this.startCalls += 1;
    this.started = true;
    return this;
  }

  async stop() {
    this.stopCalls += 1;
    this.started = false;
  }

  async getQueue(name) {
    this.getQueueCalls.push(name);
    if (this.queueGate) await this.queueGate.promise;
    return this.queues.get(name) ?? null;
  }

  async createQueue(name, options = {}) {
    this.createQueueCalls.push({ name, options });
    this.queues.set(name, { name, ...options });
  }

  async send(name, data, options = {}) {
    this.sendStarted?.resolve();
    if (this.sendGate) await this.sendGate.promise;
    const id = this.sendResult === undefined
      ? `delivery-${this.sent.length + 1}`
      : this.sendResult;
    this.sent.push({ id, name, data, options });
    return id;
  }

  async work(name, options, handler) {
    this.workCalls.push({ name, options });
    if (this.workGate) await this.workGate.promise;
    this.workers.set(name, handler);
    return `work-${name}`;
  }

  async offWork(name) {
    this.offWorkCalls.push(name);
    this.workers.delete(name);
  }

  async touch(name, id) {
    this.touched.push({ name, id });
  }

  async cancel(name, id) {
    this.cancelled.push({ name, id });
  }

  async retry(name, id) {
    this.retried.push({ name, id });
  }
}

test("delivery options and client methods are snapshotted exactly once", async () => {
  const fake = new FakeBoss();
  const reads = new Map();
  const options = {};
  Object.defineProperties(options, {
    client: once(reads, "client", fake),
    connection: once(reads, "connection", undefined),
    queuePrefix: once(reads, "queuePrefix", "evavo-delivery"),
    heartbeatSeconds: once(reads, "heartbeatSeconds", 20),
    notify: once(reads, "notify", false),
    gracefulStopTimeoutMs: once(reads, "gracefulStopTimeoutMs", 2_000),
  });

  const adapter = new PgBossRuntimeDelivery(options);
  fake.start = async () => {
    throw new Error("replacement start method must not run");
  };
  await Promise.all([adapter.start(), adapter.start()]);
  assert.equal(fake.startCalls, 1);
  for (const name of [
    "client",
    "connection",
    "queuePrefix",
    "heartbeatSeconds",
    "notify",
    "gracefulStopTimeoutMs",
  ]) {
    assert.equal(reads.get(name), 1, name);
  }
  await adapter.stop();

  assert.throws(
    () => new PgBossRuntimeDelivery({ client: new FakeBoss(), notify: "yes" }),
    runtimeFailure("RUNTIME_DELIVERY_OPTIONS_INVALID"),
  );
  assert.throws(
    () => new PgBossRuntimeDelivery({ client: { start() {} } }),
    runtimeFailure("RUNTIME_DELIVERY_OPTIONS_INVALID"),
  );
});

test("publish snapshots job identity and clock before asynchronous queue work", async () => {
  const fake = new FakeBoss();
  fake.queueGate = deferred();
  const adapter = new PgBossRuntimeDelivery({ client: fake, queuePrefix: "evavo-test" });
  await adapter.start();

  const job = deliveryJob();
  const clock = new Date(T0);
  const pending = adapter.publish(job, clock);
  job.id = "job-mutated";
  job.specHash = HASH_B;
  job.spec.id = "job-mutated";
  job.spec.queue = "review";
  job.spec.priority = -999;
  job.spec.timeoutMs = 1_000;
  job.spec.notBefore = new Date(T0.getTime() + 99_000).toISOString();
  clock.setTime(T0.getTime() + 500_000);
  fake.queueGate.resolve();

  assert.equal(await pending, "delivery-1");
  assert.equal(fake.sent.length, 1);
  const sent = fake.sent[0];
  assert.equal(sent.name, "evavo-test.media");
  assert.deepEqual(sent.data, {
    schemaVersion: "1.0",
    jobId: "job-delivery",
    queue: "media",
    specHash: HASH_A,
    enqueuedAt: T0.toISOString(),
  });
  assert.equal(sent.options.singletonKey, "job-delivery");
  assert.equal(sent.options.priority, 7);
  assert.equal(sent.options.expireInSeconds, 30);
  assert.equal(
    sent.options.startAfter,
    new Date(T0.getTime() + 1_000).toISOString(),
  );
  await adapter.stop();
});

test("start and queue preparation are single-flight under concurrency", async () => {
  const fake = new FakeBoss();
  const adapter = new PgBossRuntimeDelivery({ client: fake });
  await Promise.all([adapter.start(), adapter.start(), adapter.start()]);
  assert.equal(fake.startCalls, 1);

  const [left, right] = await Promise.all([
    adapter.publish(deliveryJob({ id: "job-left", spec: { id: "job-left" } }), T0),
    adapter.publish(deliveryJob({ id: "job-right", spec: { id: "job-right" } }), T0),
  ]);
  assert.deepEqual([left, right], ["delivery-1", "delivery-2"]);
  assert.deepEqual(fake.getQueueCalls, [
    "evavo-art.media.dead-letter",
    "evavo-art.media",
  ]);
  assert.equal(fake.createQueueCalls.length, 2);
  await adapter.stop();
});

test("subscription registration is atomic and inbound batches are detached", async () => {
  const fake = new FakeBoss();
  fake.workGate = deferred();
  const adapter = new PgBossRuntimeDelivery({ client: fake, queuePrefix: "evavo-test" });
  await adapter.start();

  const received = [];
  const handlerGate = deferred();
  const first = adapter.subscribe("media", async (message) => {
    received.push(message);
    await handlerGate.promise;
  });
  await assert.rejects(
    () => adapter.subscribe("media", async () => undefined),
    runtimeFailure("RUNTIME_DELIVERY_ALREADY_SUBSCRIBED"),
  );
  fake.workGate.resolve();
  assert.equal(await first, "work-evavo-test.media");
  assert.equal(fake.workCalls.length, 1);

  const values = {
    schemaVersion: "1.0",
    jobId: "job-inbound",
    queue: "media",
    specHash: HASH_A,
    enqueuedAt: T0.toISOString(),
  };
  const reads = new Map();
  const data = {};
  for (const [name, value] of Object.entries(values)) {
    Object.defineProperty(data, name, once(reads, name, value));
  }
  const signal = {};
  Object.defineProperty(signal, "aborted", once(reads, "aborted", false));
  const jobs = [{ id: "delivery-inbound", data, signal }];
  Object.defineProperty(jobs, Symbol.iterator, {
    configurable: true,
    value() {
      throw new Error("hostile delivery iterator must not run");
    },
  });

  const work = fake.workers.get("evavo-test.media");
  const pending = work(jobs);
  values.jobId = "job-mutated";
  values.queue = "review";
  values.specHash = HASH_B;
  handlerGate.resolve();
  await pending;

  assert.equal(received.length, 1);
  assert.deepEqual(received[0], {
    schemaVersion: "1.0",
    jobId: "job-inbound",
    queue: "media",
    specHash: HASH_A,
    enqueuedAt: T0.toISOString(),
  });
  assert.equal(Object.isFrozen(received[0]), true);
  for (const name of [...Object.keys(values), "aborted"]) {
    assert.equal(reads.get(name), 1, name);
  }

  await assert.rejects(
    () => work([{
      id: "delivery-wrong-queue",
      data: { ...received[0], queue: "review" },
      signal: new AbortController().signal,
    }]),
    runtimeFailure("RUNTIME_DELIVERY_MESSAGE_INVALID"),
  );
  await assert.rejects(
    () => work([{
      id: "delivery-aborted",
      data: received[0],
      signal: { aborted: true },
    }]),
    runtimeFailure("RUNTIME_DELIVERY_ABORTED"),
  );

  await adapter.stop();
  assert.deepEqual(fake.offWorkCalls, ["evavo-test.media"]);
});

test("stop drains in-flight publishes before stopping the client", async () => {
  const fake = new FakeBoss();
  fake.sendGate = deferred();
  fake.sendStarted = deferred();
  const adapter = new PgBossRuntimeDelivery({ client: fake });
  await adapter.start();

  const publishing = adapter.publish(deliveryJob(), T0);
  await fake.sendStarted.promise;
  const stopping = adapter.stop();
  await Promise.resolve();
  assert.equal(fake.stopCalls, 0);
  fake.sendGate.resolve();
  assert.equal(await publishing, "delivery-1");
  await stopping;
  assert.equal(fake.stopCalls, 1);
  await assert.rejects(
    () => adapter.publish(deliveryJob(), T0),
    runtimeFailure("RUNTIME_DELIVERY_NOT_STARTED"),
  );
});

test("delivery command and transport outputs fail closed before client mutation", async () => {
  const fake = new FakeBoss();
  const adapter = new PgBossRuntimeDelivery({ client: fake });
  await adapter.start();
  const secret = "private-runtime-delivery-error";
  const hostile = {
    toString() {
      throw new Error(secret);
    },
  };

  for (const operation of [
    () => adapter.touch(hostile, "delivery-1"),
    () => adapter.cancel("media", hostile),
    () => adapter.retry("media", "bad\0delivery"),
  ]) {
    await assert.rejects(
      operation,
      runtimeFailure("RUNTIME_DELIVERY_INPUT_INVALID", secret),
    );
  }
  assert.equal(fake.touched.length, 0);
  assert.equal(fake.cancelled.length, 0);
  assert.equal(fake.retried.length, 0);

  fake.sendResult = { hostile: true };
  await assert.rejects(
    () => adapter.publish(deliveryJob(), T0),
    runtimeFailure("RUNTIME_DELIVERY_MESSAGE_INVALID", secret),
  );
  await adapter.stop();
});
