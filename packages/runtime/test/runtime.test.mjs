import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";

import {
  LocalRuntimeRepository,
  PgBossRuntimeDelivery,
  RuntimeError,
  RuntimeWorker,
  TransientRuntimeError,
} from "../dist/index.js";

const T0 = new Date("2026-07-29T00:00:00.000Z");
const at = (milliseconds) => new Date(T0.getTime() + milliseconds);

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-runtime-"));
  return {
    root,
    runtimeRoot: path.join(root, "runtime"),
    runtime: new LocalRuntimeRepository({ root: path.join(root, "runtime") }),
    artifacts: new LocalArtifactStore({ root: path.join(root, "artifacts") }),
  };
}

function submission(overrides = {}) {
  return {
    queue: "media",
    kind: "fixture.echo",
    idempotencyKey: "fixture-1",
    payload: { value: 1 },
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

async function claimOne(runtime, now = T0, workerId = "worker-1") {
  const claimed = await runtime.claim({
    worker: { id: workerId, capabilities: ["fixture.echo"] },
    maximumJobs: 1,
    now,
  });
  assert.equal(claimed.length, 1);
  return claimed[0];
}

test("submission is atomic and idempotent while conflicting reuse is rejected", async () => {
  const { runtime } = await fixture();
  const first = await runtime.submit(submission(), "test", T0);
  assert.equal(first.state, "queued");
  const duplicate = await runtime.submit(submission(), "test", at(1));
  assert.equal(duplicate.id, first.id);
  assert.equal((await runtime.list()).length, 1);
  await assert.rejects(
    () => runtime.submit(submission({ payload: { value: 2 } }), "test", at(2)),
    (error) =>
      error instanceof RuntimeError &&
      error.code === "RUNTIME_IDEMPOTENCY_CONFLICT",
  );
});

test("batch dependency cycles fail without committing partial jobs", async () => {
  const { runtime } = await fixture();
  await assert.rejects(
    () =>
      runtime.submitBatch(
        [
          submission({
            id: "job-a",
            idempotencyKey: "a",
            dependencyJobIds: ["job-b"],
          }),
          submission({
            id: "job-b",
            idempotencyKey: "b",
            dependencyJobIds: ["job-a"],
          }),
        ],
        "test",
        T0,
      ),
    (error) =>
      error instanceof RuntimeError && error.code === "RUNTIME_DEPENDENCY_CYCLE",
  );
  assert.equal((await runtime.list()).length, 0);
});

test("successful dependencies unblock downstream work in the same transaction", async () => {
  const { runtime } = await fixture();
  const [parent, child] = await runtime.submitBatch(
    [
      submission({ id: "job-parent", idempotencyKey: "parent" }),
      submission({
        id: "job-child",
        idempotencyKey: "child",
        dependencyJobIds: ["job-parent"],
      }),
    ],
    "test",
    T0,
  );
  assert.equal(parent.state, "queued");
  assert.equal(child.state, "waiting");

  const claimed = await claimOne(runtime, at(10));
  assert.equal(claimed.job.id, "job-parent");
  await runtime.start(claimed.job.id, claimed.lease.token, "worker-1", at(11));
  await runtime.complete(claimed.job.id, claimed.lease.token, [], "worker-1", at(12));
  assert.equal((await runtime.get("job-child")).state, "queued");
});

test("transient failures retry deterministically, dead-letter and redrive", async () => {
  const { runtime } = await fixture();
  const job = await runtime.submit(
    submission({
      id: "job-retry",
      idempotencyKey: "retry",
      maximumAttempts: 2,
      retryPolicy: {
        baseDelayMs: 1_000,
        maximumDelayMs: 1_000,
        multiplier: 2,
        jitterFraction: 0,
      },
    }),
    "test",
    T0,
  );
  const first = await claimOne(runtime, at(1));
  await runtime.start(job.id, first.lease.token, "worker-1", at(2));
  const retrying = await runtime.fail(
    job.id,
    first.lease.token,
    { classification: "transient", code: "NETWORK", message: "try again" },
    "worker-1",
    at(3),
  );
  assert.equal(retrying.state, "retry-wait");
  assert.equal(retrying.nextAttemptAt, at(1_003).toISOString());
  assert.equal(
    (await runtime.claim({
      worker: { id: "worker-1", capabilities: ["fixture.echo"] },
      now: at(1_002),
    })).length,
    0,
  );

  const second = await claimOne(runtime, at(1_003));
  await runtime.start(job.id, second.lease.token, "worker-1", at(1_004));
  const dead = await runtime.fail(
    job.id,
    second.lease.token,
    { classification: "transient", code: "NETWORK", message: "still unavailable" },
    "worker-1",
    at(1_005),
  );
  assert.equal(dead.state, "dead-letter");
  const redriven = await runtime.redrive(job.id, 1, "operator", at(1_006));
  assert.equal(redriven.state, "queued");
  assert.equal(redriven.attemptLimit, 3);
  assert.equal(redriven.redriveCount, 1);
});

test("expired leases recover safely and exhaust into dead-letter", async () => {
  const { runtime } = await fixture();
  const job = await runtime.submit(
    submission({
      id: "job-expiry",
      idempotencyKey: "expiry",
      maximumAttempts: 2,
    }),
    "test",
    T0,
  );
  await claimOne(runtime, T0);
  await runtime.recoverExpiredLeases("recovery", at(10_001));
  assert.equal((await runtime.get(job.id)).state, "queued");
  await claimOne(runtime, at(10_002));
  await runtime.recoverExpiredLeases("recovery", at(20_003));
  const exhausted = await runtime.get(job.id);
  assert.equal(exhausted.state, "dead-letter");
  assert.equal(exhausted.attempts[1].outcome, "expired");
});

test("pause, resume and cooperative cancellation preserve explicit state", async () => {
  const { runtime } = await fixture();
  const paused = await runtime.submit(
    submission({ id: "job-pause", idempotencyKey: "pause" }),
    "test",
    T0,
  );
  const pauseRecord = await runtime.pause(paused.id, "operator", { now: at(1) });
  assert.equal(pauseRecord.state, "paused");
  assert.equal(pauseRecord.pausedFromState, "queued");
  assert.equal((await runtime.resume(paused.id, "operator", at(2))).state, "queued");

  const claimed = await claimOne(runtime, at(3));
  await runtime.start(claimed.job.id, claimed.lease.token, "worker-1", at(4));
  const requested = await runtime.cancel(claimed.job.id, "operator", { now: at(5) });
  assert.equal(requested.state, "running");
  assert.ok(requested.cancellationRequestedAt);
  const heartbeat = await runtime.heartbeat(
    claimed.job.id,
    claimed.lease.token,
    "worker-1",
    at(6),
  );
  assert.equal(heartbeat.cancellationRequested, true);
  const cancelled = await runtime.cancel(claimed.job.id, "worker-1", {
    force: true,
    now: at(7),
  });
  assert.equal(cancelled.state, "cancelled");
  assert.equal(cancelled.attempts[0].outcome, "cancelled");
});

test("concurrent claims lease a queued job only once", async () => {
  const { runtime } = await fixture();
  await runtime.submit(submission(), "test", T0);
  const [left, right] = await Promise.all([
    runtime.claim({
      worker: { id: "worker-left", capabilities: ["fixture.echo"] },
      maximumJobs: 1,
      now: at(1),
    }),
    runtime.claim({
      worker: { id: "worker-right", capabilities: ["fixture.echo"] },
      maximumJobs: 1,
      now: at(1),
    }),
  ]);
  assert.equal(left.length + right.length, 1);
});

test("one worker capability profile must satisfy the complete job requirement", async () => {
  const { runtime } = await fixture();
  const job = await runtime.submit(
    submission({
      id: "job-profile",
      idempotencyKey: "profile",
      requiredCapabilityProfile: [
        "identity-reference",
        "pose-control",
      ],
    }),
    "test",
    T0,
  );
  assert.deepEqual(job.spec.requiredCapabilityProfile, [
    "identity-reference",
    "pose-control",
  ]);

  const splitProfiles = await runtime.claim({
    worker: {
      id: "worker-split-profiles",
      capabilities: ["fixture.echo"],
      capabilityProfiles: [
        { id: "identity-only", capabilities: ["identity-reference"] },
        { id: "pose-only", capabilities: ["pose-control"] },
      ],
    },
    maximumJobs: 1,
    now: at(1),
  });
  assert.equal(splitProfiles.length, 0);

  const completeProfile = await runtime.claim({
    worker: {
      id: "worker-complete-profile",
      capabilities: ["fixture.echo"],
      capabilityProfiles: [
        {
          id: "complete",
          capabilities: ["pose-control", "identity-reference"],
        },
      ],
    },
    maximumJobs: 1,
    now: at(2),
  });
  assert.equal(completeProfile.length, 1);
  assert.equal(completeProfile[0].job.id, job.id);
});

test("capability profile normalization is deterministic and malformed workers fail closed", async () => {
  const { runtime } = await fixture();
  const left = await runtime.submit(
    submission({
      id: "job-profile-normalized",
      idempotencyKey: "profile-normalized",
      requiredCapabilityProfile: [
        "pose-control",
        "identity-reference",
        "pose-control",
      ],
    }),
    "test",
    T0,
  );
  assert.deepEqual(left.spec.requiredCapabilityProfile, [
    "identity-reference",
    "pose-control",
  ]);

  await assert.rejects(
    () =>
      runtime.claim({
        worker: {
          id: "worker-invalid-profiles",
          capabilities: ["fixture.echo"],
          capabilityProfiles: [
            { id: "duplicate", capabilities: ["identity-reference"] },
            { id: "duplicate", capabilities: ["pose-control"] },
          ],
        },
        now: at(1),
      }),
    (error) =>
      error instanceof RuntimeError &&
      error.code === "RUNTIME_WORKER_OPTIONS_INVALID",
  );
});

test("worker records output lineage and persists JSON results as evidence", async () => {
  const { runtime, artifacts } = await fixture();
  const input = await artifacts.put("source", {
    mediaType: "text/plain",
    storageClass: "source",
    fileName: "source.txt",
  });
  const job = await runtime.submit(
    submission({ inputArtifacts: [input.artifactId] }),
    "test",
    T0,
  );
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: { id: "worker-1", capabilities: ["fixture.echo"] },
    heartbeatIntervalMs: 1_000,
    handlers: {
      "fixture.echo": async (context) => {
        const output = await context.putArtifact("finished", {
          mediaType: "text/plain",
          storageClass: "master",
          fileName: "finished.txt",
        });
        return {
          outputArtifacts: [output.artifactId],
          result: { accepted: true },
        };
      },
    },
  });
  const result = await worker.runOnce();
  assert.deepEqual(result, {
    claimed: 1,
    succeeded: 1,
    failed: 0,
    cancelled: 0,
    paused: 0,
  });
  const completed = await runtime.get(job.id);
  assert.equal(completed.state, "succeeded");
  assert.equal(completed.outputArtifacts.length, 2);
  for (const artifactId of completed.outputArtifacts) {
    assert.equal((await artifacts.verify(artifactId)).contentValid, true);
    const descriptor = await artifacts.get(artifactId);
    assert.equal(descriptor.labels.runtimeJobId, job.id);
    assert.ok(descriptor.sourceArtifacts.includes(input.artifactId));
  }
});

test("worker retries explicitly transient handler failures", async () => {
  const { runtime, artifacts } = await fixture();
  await runtime.submit(submission({ maximumAttempts: 2 }), "test", T0);
  let calls = 0;
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: { id: "worker-1", capabilities: ["fixture.echo"] },
    handlers: {
      "fixture.echo": async () => {
        calls += 1;
        if (calls === 1) throw new TransientRuntimeError("TEMPORARY", "retry me");
        return { result: { calls } };
      },
    },
  });
  const result = await worker.runUntilIdle({ maximumCycles: 5, idleDelayMs: 1 });
  assert.equal(result.claimed, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.succeeded, 1);
});

test("journal recovers the latest immutable transaction when head is corrupt", async () => {
  const { runtime, runtimeRoot } = await fixture();
  await runtime.submit(submission({ id: "job-one", idempotencyKey: "one" }), "test", T0);
  await runtime.submit(submission({ id: "job-two", idempotencyKey: "two" }), "test", at(1));
  await writeFile(path.join(runtimeRoot, "head.json"), "{broken", "utf8");
  const recovered = new LocalRuntimeRepository({ root: runtimeRoot });
  assert.equal((await recovered.list()).length, 2);
  const transactions = await readdir(path.join(runtimeRoot, "transactions"));
  assert.ok(transactions.length >= 2);
});

class FakeBoss {
  started = false;
  queues = new Map();
  sent = [];
  workers = new Map();
  touched = [];
  cancelled = [];
  retried = [];

  async start() { this.started = true; return this; }
  async stop() { this.started = false; }
  async getQueue(name) { return this.queues.get(name) ?? null; }
  async createQueue(name, options = {}) { this.queues.set(name, { name, ...options }); }
  async send(name, data, options = {}) {
    const id = `delivery-${this.sent.length + 1}`;
    this.sent.push({ id, name, data, options });
    return id;
  }
  async work(name, _options, handler) {
    this.workers.set(name, handler);
    return `work-${name}`;
  }
  async offWork(name) { this.workers.delete(name); }
  async touch(name, id) { this.touched.push({ name, id }); }
  async cancel(name, id) { this.cancelled.push({ name, id }); }
  async retry(name, id) { this.retried.push({ name, id }); }
}

test("pg-boss adapter keeps delivery separate from authoritative runtime state", async () => {
  const fake = new FakeBoss();
  const adapter = new PgBossRuntimeDelivery({
    client: fake,
    queuePrefix: "evavo-test",
    notify: true,
  });
  await adapter.start();
  const { runtime } = await fixture();
  const job = await runtime.submit(submission(), "test", T0);
  const deliveryId = await adapter.publish(job, T0);
  assert.equal(deliveryId, "delivery-1");
  assert.equal(fake.sent[0].data.jobId, job.id);
  assert.equal(fake.sent[0].options.singletonKey, job.id);
  const received = [];
  await adapter.subscribe("media", async (message) => received.push(message));
  const handler = fake.workers.get("evavo-test.media");
  await handler([{ id: deliveryId, data: fake.sent[0].data, signal: new AbortController().signal }]);
  assert.equal(received[0].specHash, job.specHash);
  await adapter.touch("media", deliveryId);
  await adapter.cancel("media", deliveryId);
  await adapter.retry("media", deliveryId);
  assert.equal(fake.touched.length, 1);
  assert.equal(fake.cancelled.length, 1);
  assert.equal(fake.retried.length, 1);
  await adapter.stop();
});
