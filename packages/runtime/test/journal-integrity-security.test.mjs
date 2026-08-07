import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  normalizeJson,
  sha256,
  stableStringify,
} from "@evavo/art-artifacts";

import {
  LocalRuntimeRepository,
  RuntimeError,
} from "../dist/index.js";

const T0 = new Date("2026-08-07T00:00:00.000Z");

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-runtime-journal-integrity-"));
  const runtimeRoot = path.join(root, "runtime");
  return {
    runtimeRoot,
    runtime: new LocalRuntimeRepository({ root: runtimeRoot }),
  };
}

function submission(id, idempotencyKey) {
  return {
    id,
    queue: "media",
    kind: "fixture.echo",
    idempotencyKey,
    payload: { value: idempotencyKey },
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
  };
}

function transactionFile(sequence) {
  return `${String(sequence).padStart(16, "0")}.json`;
}

async function readLatest(runtimeRoot) {
  const head = JSON.parse(
    await readFile(path.join(runtimeRoot, "head.json"), "utf8"),
  );
  const transactionPath = path.join(
    runtimeRoot,
    "transactions",
    transactionFile(head.sequence),
  );
  return {
    head,
    transactionPath,
    transaction: JSON.parse(await readFile(transactionPath, "utf8")),
  };
}

async function persistTampered(runtimeRoot, head, transaction) {
  transaction.stateSha256 = sha256(
    stableStringify(normalizeJson(transaction.snapshot)),
  );
  await writeFile(
    path.join(runtimeRoot, "transactions", transactionFile(transaction.sequence)),
    `${JSON.stringify(transaction, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(runtimeRoot, "head.json"),
    `${JSON.stringify(
      {
        ...head,
        sequence: transaction.sequence,
        stateSha256: transaction.stateSha256,
        transactionFile: transactionFile(transaction.sequence),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function rejectsWith(code) {
  return (error) => error instanceof RuntimeError && error.code === code;
}

test("persisted job identity is recomputed before runtime state can be used", async () => {
  const { runtime, runtimeRoot } = await fixture();
  const job = await runtime.submit(
    submission("job-integrity", "integrity"),
    "test",
    T0,
  );
  const { head, transaction } = await readLatest(runtimeRoot);
  transaction.snapshot.jobs[job.id].spec.payload = { value: "tampered" };
  await persistTampered(runtimeRoot, head, transaction);

  const reopened = new LocalRuntimeRepository({ root: runtimeRoot });
  await assert.rejects(
    () => reopened.get(job.id),
    rejectsWith("RUNTIME_JOURNAL_JOB_INVALID"),
  );
});

test("idempotency index redirection is rejected even with a recomputed snapshot hash", async () => {
  const { runtime, runtimeRoot } = await fixture();
  const [first, second] = await runtime.submitBatch(
    [
      submission("job-first", "first"),
      submission("job-second", "second"),
    ],
    "test",
    T0,
  );
  const { head, transaction } = await readLatest(runtimeRoot);
  const firstIndex = Object.entries(transaction.snapshot.idempotencyIndex)
    .find(([, jobId]) => jobId === first.id)[0];
  transaction.snapshot.idempotencyIndex[firstIndex] = second.id;
  await persistTampered(runtimeRoot, head, transaction);

  const reopened = new LocalRuntimeRepository({ root: runtimeRoot });
  await assert.rejects(
    () => reopened.list(),
    rejectsWith("RUNTIME_JOURNAL_INDEX_INVALID"),
  );
});

test("event identity is validated independently from the snapshot hash", async () => {
  const { runtime, runtimeRoot } = await fixture();
  await runtime.submit(submission("job-event", "event"), "test", T0);
  const { head, transaction } = await readLatest(runtimeRoot);
  transaction.events[0].id = "event_0000000000000001_9999";
  await persistTampered(runtimeRoot, head, transaction);

  const reopened = new LocalRuntimeRepository({ root: runtimeRoot });
  await assert.rejects(
    () => reopened.events(),
    rejectsWith("RUNTIME_JOURNAL_EVENT_INVALID"),
  );
});

test("a corrupt highest transaction fails closed instead of rolling runtime state back", async () => {
  const { runtime, runtimeRoot } = await fixture();
  await runtime.submit(submission("job-one", "one"), "test", T0);
  await runtime.submit(
    submission("job-two", "two"),
    "test",
    new Date(T0.getTime() + 1),
  );
  const { transactionPath } = await readLatest(runtimeRoot);
  await writeFile(transactionPath, "{broken", "utf8");
  await writeFile(path.join(runtimeRoot, "head.json"), "{broken", "utf8");

  const reopened = new LocalRuntimeRepository({ root: runtimeRoot });
  await assert.rejects(
    () => reopened.list(),
    rejectsWith("RUNTIME_JOURNAL_INVALID"),
  );
});

test("missing immutable transaction sequences are rejected", async () => {
  const { runtime, runtimeRoot } = await fixture();
  await runtime.submit(submission("job-one", "one"), "test", T0);
  await runtime.submit(
    submission("job-two", "two"),
    "test",
    new Date(T0.getTime() + 1),
  );
  await unlink(
    path.join(runtimeRoot, "transactions", transactionFile(1)),
  );

  const reopened = new LocalRuntimeRepository({ root: runtimeRoot });
  await assert.rejects(
    () => reopened.snapshot(),
    rejectsWith("RUNTIME_JOURNAL_SEQUENCE_GAP"),
  );
});

test("unsupported transaction fields fail closed and returned snapshots stay detached", async () => {
  const { runtime, runtimeRoot } = await fixture();
  const job = await runtime.submit(
    submission("job-canonical", "canonical"),
    "test",
    T0,
  );
  const first = await runtime.snapshot();
  first.jobs[job.id].spec.payload.value = "caller-mutation";
  assert.equal((await runtime.get(job.id)).spec.payload.value, "canonical");

  const { head, transactionPath, transaction } = await readLatest(runtimeRoot);
  transaction.untrustedRedirect = "0000000000000000.json";
  await persistTampered(runtimeRoot, head, transaction);
  const reopened = new LocalRuntimeRepository({ root: runtimeRoot });
  await assert.rejects(
    () => reopened.get(job.id),
    rejectsWith("RUNTIME_JOURNAL_INVALID"),
  );

  const entries = await readdir(path.join(runtimeRoot, "transactions"));
  assert.deepEqual(entries, [transactionFile(1)]);
  assert.equal(transactionPath.endsWith(transactionFile(1)), true);
});
