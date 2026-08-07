import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LocalRuntimeRepository,
  RuntimeError,
} from "../dist/index.js";

const T0 = new Date("2026-08-07T00:00:00.000Z");
const at = (milliseconds) => new Date(T0.getTime() + milliseconds);

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-runtime-redrive-policy-"));
  return new LocalRuntimeRepository({ root: path.join(root, "runtime") });
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

test("core runtime refuses redrive for governed one-attempt Book Art provider jobs", async () => {
  const runtime = await fixture();
  const job = await runtime.submit(
    submission({
      id: "job-book-art-provider",
      labels: { migrationMode: "book-art-shadow-candidate" },
    }),
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
