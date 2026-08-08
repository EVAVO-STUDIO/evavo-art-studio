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
const ARTIFACT_A = `artifact_${"a".repeat(64)}`;
const ARTIFACT_B = `artifact_${"b".repeat(64)}`;
const ARTIFACT_C = `artifact_${"c".repeat(64)}`;

function once(reads, name, value) {
  return {
    enumerable: true,
    configurable: true,
    get() {
      const count = (reads.get(name) ?? 0) + 1;
      reads.set(name, count);
      if (count > 1) {
        throw new Error(`runtime-result-secret-${name}`);
      }
      return value;
    },
  };
}

function submission(id) {
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
      multiplier: 2,
      jitterFraction: 0,
    },
    leaseDurationMs: 10_000,
    timeoutMs: 30_000,
  };
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-result-inputs-"));
  const runtimeRoot = path.join(root, "runtime");
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return { runtime, runtimeRoot };
}

async function startJob(runtime, id, offset = 0) {
  await runtime.submit(submission(id), "test", at(offset));
  const claimed = await runtime.claim({
    worker: { id: `worker-${id}`, capabilities: ["fixture.echo"] },
    maximumJobs: 1,
    now: at(offset + 1),
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].job.id, id);
  await runtime.start(
    id,
    claimed[0].lease.token,
    `worker-${id}`,
    at(offset + 2),
  );
  return claimed[0];
}

function failureInputError(secret) {
  return (error) =>
    error instanceof RuntimeError &&
    error.code === "RUNTIME_FAILURE_INVALID" &&
    !error.message.includes(secret);
}

function outputArtifactError(secret) {
  return (error) =>
    error instanceof RuntimeError &&
    error.code === "RUNTIME_OUTPUT_ARTIFACT_INVALID" &&
    !error.message.includes(secret);
}

test("failure inputs are read exactly once and normalized before journal work", async (t) => {
  const { runtime } = await fixture(t);
  const claimed = await startJob(runtime, "job-failure-once");
  const reads = new Map();
  const details = { provider: "fixture", attempt: 1 };
  const failure = {};
  Object.defineProperties(failure, {
    classification: once(reads, "classification", "transient"),
    code: once(reads, "code", " NETWORK "),
    message: once(reads, "message", " try again "),
    details: once(reads, "details", details),
  });

  const failed = await runtime.fail(
    claimed.job.id,
    claimed.lease.token,
    failure,
    "worker-job-failure-once",
    at(3),
  );

  assert.equal(failed.state, "retry-wait");
  assert.deepEqual(failed.failure, {
    classification: "transient",
    code: "NETWORK",
    message: "try again",
    details: { provider: "fixture", attempt: 1 },
  });
  assert.equal(reads.get("classification"), 1);
  assert.equal(reads.get("code"), 1);
  assert.equal(reads.get("message"), 1);
  assert.equal(reads.get("details"), 1);
});

test("completion snapshots array indexes instead of caller iterators", async (t) => {
  const { runtime } = await fixture(t);
  const claimed = await startJob(runtime, "job-output-iterator");
  const secret = "hostile-output-iterator";
  const outputs = [ARTIFACT_B, ARTIFACT_A, ARTIFACT_A];
  Object.defineProperty(outputs, Symbol.iterator, {
    configurable: true,
    value() {
      throw new Error(secret);
    },
  });

  const completed = await runtime.complete(
    claimed.job.id,
    claimed.lease.token,
    outputs,
    "worker-job-output-iterator",
    at(3),
  );

  assert.equal(completed.state, "succeeded");
  assert.deepEqual(completed.outputArtifacts, [ARTIFACT_A, ARTIFACT_B]);
});

test("post-call mutation cannot change retained execution result evidence", async (t) => {
  const { runtime, runtimeRoot } = await fixture(t);
  const completedClaim = await startJob(runtime, "job-output-mutation");
  const outputLock = await acquireFileLock(runtimeRoot, "runtime-journal", {
    timeoutMs: 1_000,
    staleAfterMs: 60_000,
  });
  const outputs = [ARTIFACT_A];
  try {
    const pending = runtime.complete(
      completedClaim.job.id,
      completedClaim.lease.token,
      outputs,
      "worker-job-output-mutation",
      at(3),
    );
    outputs[0] = ARTIFACT_B;
    outputs.push(ARTIFACT_C);
    await outputLock.release();
    const completed = await pending;
    assert.deepEqual(completed.outputArtifacts, [ARTIFACT_A]);
  } finally {
    await outputLock.release();
  }

  const failedClaim = await startJob(runtime, "job-failure-mutation", 10);
  const failureLock = await acquireFileLock(runtimeRoot, "runtime-journal", {
    timeoutMs: 1_000,
    staleAfterMs: 60_000,
  });
  const details = { provider: "fixture", attempt: 1 };
  const failure = {
    classification: "transient",
    code: "NETWORK",
    message: "try again",
    details,
  };
  try {
    const pending = runtime.fail(
      failedClaim.job.id,
      failedClaim.lease.token,
      failure,
      "worker-job-failure-mutation",
      at(13),
    );
    failure.classification = "permanent";
    failure.code = "CHANGED";
    failure.message = "changed";
    details.provider = "changed";
    details.attempt = 99;
    await failureLock.release();
    const failed = await pending;
    assert.deepEqual(failed.failure, {
      classification: "transient",
      code: "NETWORK",
      message: "try again",
      details: { provider: "fixture", attempt: 1 },
    });
  } finally {
    await failureLock.release();
  }
});

test("hostile and malformed execution results fail closed without state changes", async (t) => {
  const { runtime } = await fixture(t);
  const claimed = await startJob(runtime, "job-result-hostile");
  const secret = "private-execution-result-error";

  const hostileFailure = {
    classification: "transient",
    message: "try again",
  };
  Object.defineProperty(hostileFailure, "code", {
    enumerable: true,
    get() {
      throw new Error(secret);
    },
  });
  await assert.rejects(
    () =>
      runtime.fail(
        claimed.job.id,
        claimed.lease.token,
        hostileFailure,
        "worker-job-result-hostile",
        at(3),
      ),
    failureInputError(secret),
  );
  assert.equal((await runtime.get(claimed.job.id)).state, "running");

  const hostileDetails = {};
  Object.defineProperty(hostileDetails, "private", {
    enumerable: true,
    get() {
      throw new Error(secret);
    },
  });
  const circular = {};
  circular.self = circular;
  const revokedFailure = Proxy.revocable({}, {});
  revokedFailure.revoke();
  for (const failure of [
    null,
    [],
    revokedFailure.proxy,
    { classification: "unknown", code: "NETWORK", message: "retry" },
    { classification: "transient", code: 7, message: "retry" },
    { classification: "transient", code: "NETWORK", message: 7 },
    {
      classification: "transient",
      code: "NETWORK",
      message: "retry",
      details: hostileDetails,
    },
    {
      classification: "transient",
      code: "NETWORK",
      message: "retry",
      details: circular,
    },
  ]) {
    await assert.rejects(
      () =>
        runtime.fail(
          claimed.job.id,
          claimed.lease.token,
          failure,
          "worker-job-result-hostile",
          at(3),
        ),
      failureInputError(secret),
    );
    assert.equal((await runtime.get(claimed.job.id)).state, "running");
  }

  const revokedOutputs = Proxy.revocable([ARTIFACT_A], {});
  revokedOutputs.revoke();
  const coercibleArtifact = {
    toString() {
      return ARTIFACT_A;
    },
  };
  for (const outputs of [
    new Set([ARTIFACT_A]),
    revokedOutputs.proxy,
    new Array(1),
    ["artifact_invalid"],
    [coercibleArtifact],
  ]) {
    await assert.rejects(
      () =>
        runtime.complete(
          claimed.job.id,
          claimed.lease.token,
          outputs,
          "worker-job-result-hostile",
          at(3),
        ),
      outputArtifactError(secret),
    );
    assert.equal((await runtime.get(claimed.job.id)).state, "running");
  }
});
