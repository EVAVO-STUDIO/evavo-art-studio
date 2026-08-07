import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LocalRuntimeJournal,
  LocalRuntimeRepository,
  RuntimeError,
} from "../dist/index.js";

const T0 = new Date("2026-08-07T00:00:00.000Z");
const at = (milliseconds) => new Date(T0.getTime() + milliseconds);

async function fixtureWithJournal() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-runtime-redrive-policy-"));
  const options = { root: path.join(root, "runtime") };
  return {
    runtime: new LocalRuntimeRepository(options),
    journal: new LocalRuntimeJournal(options),
  };
}

async function fixture() {
  return (await fixtureWithJournal()).runtime;
}

function submission(overrides = {}) {
  return {
    queue: "provider",
    kind: "art.candidate.generate",
    idempotencyKey: "provider-candidate",
    payload: { candidate: 1 },
    maximumAttempts: 1,
    retryPolicy: {
      baseDelayMs: 0,
      maximumDelayMs: 0,
      multiplier: 1,
      jitterFraction: 0,
    },
    labels: {},
    ...overrides,
  };
}

async function failOnce(runtime, job, workerId = "worker-1") {
  const claimed = await runtime.claim({
    worker: { id: workerId, capabilities: [] },
    maximumJobs: 1,
    now: at(1),
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].job.id, job.id);
  return runtime.fail(
    job.id,
    claimed[0].lease.token,
    {
      classification: "permanent",
      code: "PROVIDER_FAILED",
      message: "provider attempt failed",
    },
    workerId,
    at(2),
  );
}

async function persistHistoricalRedrive(journal, jobId, state = "waiting") {
  const token = `lease_historical_${state}`;
  await journal.transact((snapshot) => {
    const job = snapshot.jobs[jobId];
    assert.ok(job);
    const base = { ...job };
    delete base.lease;
    delete base.nextAttemptAt;
    delete base.cancellationRequestedAt;
    delete base.pauseRequestedAt;
    delete base.pausedFromState;
    delete base.finishedAt;
    delete base.failure;

    const redriven = {
      ...base,
      state: "waiting",
      updatedAt: at(3).toISOString(),
      attemptLimit: 2,
      outputArtifacts: [],
      redriveCount: 1,
    };

    if (state === "waiting") {
      snapshot.jobs[jobId] = redriven;
    } else {
      const lease = {
        workerId: "worker-historical",
        token,
        leasedAt: at(3).toISOString(),
        expiresAt: at(60_003).toISOString(),
      };
      const attempt = {
        attempt: 2,
        workerId: lease.workerId,
        leaseToken: token,
        leasedAt: lease.leasedAt,
        ...(state === "running"
          ? {
              startedAt: at(3).toISOString(),
              lastHeartbeatAt: at(3).toISOString(),
            }
          : {}),
        heartbeatCount: 0,
        outputArtifacts: [],
      };
      snapshot.jobs[jobId] = {
        ...redriven,
        state,
        attempts: [...job.attempts, attempt],
        lease,
      };
    }

    return { result: undefined, events: [], changed: true };
  });
  return token;
}

function governedSubmission(id, idempotencyKey) {
  return submission({
    id,
    idempotencyKey,
    labels: { migrationMode: "book-art-shadow-candidate" },
  });
}

test("core runtime refuses redrive for governed one-attempt Book Art provider jobs", async () => {
  const runtime = await fixture();
  const job = await runtime.submit(
    governedSubmission("job-book-art-provider", "book-art-provider"),
    "test",
    T0,
  );
  const failed = await failOnce(runtime, job);
  assert.equal(failed.state, "failed");
  assert.equal(failed.attemptLimit, 1);
  assert.equal(failed.attempts.length, 1);

  await assert.rejects(
    () => runtime.redrive(job.id, 1, "operator", at(3)),
    (error) =>
      error instanceof RuntimeError &&
      error.code === "RUNTIME_REDRIVE_POLICY_FORBIDDEN",
  );

  const unchanged = await runtime.get(job.id);
  assert.equal(unchanged.state, "failed");
  assert.equal(unchanged.attemptLimit, 1);
  assert.equal(unchanged.redriveCount, 0);
  assert.equal(unchanged.attempts.length, 1);
});

test("historical inflated Book Art attempt limits cannot create a second claim", async () => {
  const { runtime, journal } = await fixtureWithJournal();
  const job = await runtime.submit(
    governedSubmission("job-book-art-historical-waiting", "book-art-historical-waiting"),
    "test",
    T0,
  );
  await failOnce(runtime, job);
  await persistHistoricalRedrive(journal, job.id, "waiting");

  const claimed = await runtime.claim({
    worker: { id: "worker-after-upgrade", capabilities: [] },
    maximumJobs: 1,
    now: at(4),
  });
  assert.equal(claimed.length, 0);

  const guarded = await runtime.get(job.id);
  assert.equal(guarded.state, "dead-letter");
  assert.equal(guarded.attemptLimit, 2);
  assert.equal(guarded.redriveCount, 1);
  assert.equal(guarded.attempts.length, 1);
  assert.equal(guarded.failure.code, "RUNTIME_ATTEMPTS_EXHAUSTED");

  const events = await runtime.events();
  assert.equal(events.filter((event) => event.type === "job.leased").length, 1);
  assert.equal(events.filter((event) => event.type === "job.dead-lettered").length, 1);
});

test("a historical leased second Book Art attempt cannot start", async () => {
  const { runtime, journal } = await fixtureWithJournal();
  const job = await runtime.submit(
    governedSubmission("job-book-art-historical-leased", "book-art-historical-leased"),
    "test",
    T0,
  );
  await failOnce(runtime, job);
  const token = await persistHistoricalRedrive(journal, job.id, "leased");

  await assert.rejects(
    () => runtime.start(job.id, token, "worker-historical", at(4)),
    (error) =>
      error instanceof RuntimeError &&
      error.code === "RUNTIME_ATTEMPT_POLICY_FORBIDDEN",
  );

  const beforeFailure = await runtime.get(job.id);
  assert.equal(beforeFailure.state, "leased");
  assert.equal(beforeFailure.attempts.length, 2);
  assert.equal(beforeFailure.attempts[1].startedAt, undefined);

  const failed = await runtime.fail(
    job.id,
    token,
    {
      classification: "transient",
      code: "RUNTIME_ATTEMPT_POLICY_FORBIDDEN",
      message: "historical second attempt rejected",
    },
    "worker-historical",
    at(5),
  );
  assert.equal(failed.state, "dead-letter");
  assert.equal(failed.attemptLimit, 2);
  assert.equal(failed.attempts.length, 2);
});

test("a historical running second Book Art attempt cannot heartbeat or complete", async () => {
  const { runtime, journal } = await fixtureWithJournal();
  const job = await runtime.submit(
    governedSubmission("job-book-art-historical-running", "book-art-historical-running"),
    "test",
    T0,
  );
  await failOnce(runtime, job);
  const token = await persistHistoricalRedrive(journal, job.id, "running");

  await assert.rejects(
    () => runtime.heartbeat(job.id, token, "worker-historical", at(4)),
    (error) =>
      error instanceof RuntimeError &&
      error.code === "RUNTIME_ATTEMPT_POLICY_FORBIDDEN",
  );
  await assert.rejects(
    () => runtime.complete(job.id, token, [], "worker-historical", at(5)),
    (error) =>
      error instanceof RuntimeError &&
      error.code === "RUNTIME_ATTEMPT_POLICY_FORBIDDEN",
  );

  const failed = await runtime.fail(
    job.id,
    token,
    {
      classification: "transient",
      code: "RUNTIME_ATTEMPT_POLICY_FORBIDDEN",
      message: "historical running attempt rejected",
    },
    "worker-historical",
    at(6),
  );
  assert.equal(failed.state, "dead-letter");
  assert.equal(failed.attemptLimit, 2);
  assert.equal(failed.attempts.length, 2);

  const events = await runtime.events();
  assert.equal(events.filter((event) => event.type === "job.succeeded").length, 0);
  assert.equal(events.filter((event) => event.type === "job.retry-scheduled").length, 0);
});

test("core runtime keeps redrive available for ordinary one-attempt jobs", async () => {
  const runtime = await fixture();
  const job = await runtime.submit(
    submission({
      id: "job-ordinary-provider",
      idempotencyKey: "ordinary-provider",
      labels: { migrationMode: "ordinary-fixture" },
    }),
    "test",
    T0,
  );
  const failed = await failOnce(runtime, job);
  assert.equal(failed.state, "failed");

  const redriven = await runtime.redrive(job.id, 1, "operator", at(3));
  assert.equal(redriven.state, "queued");
  assert.equal(redriven.attemptLimit, 2);
  assert.equal(redriven.redriveCount, 1);
});
