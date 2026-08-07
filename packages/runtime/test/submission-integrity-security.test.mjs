import assert from "node:assert/strict";
import test from "node:test";

import { sha256 } from "@evavo/art-artifacts";

import {
  normalizeRuntimeJobSubmission,
  RuntimeError,
} from "../dist/index.js";

const ARTIFACT_A = `artifact_${"a".repeat(64)}`;

function once(reads, name, value) {
  return {
    enumerable: true,
    configurable: true,
    get() {
      const count = (reads.get(name) ?? 0) + 1;
      reads.set(name, count);
      if (count > 1) {
        throw new Error(`runtime-submission-secret-${name}`);
      }
      return value;
    },
  };
}

function onceArray(reads, name, values) {
  const result = new Array(values.length);
  values.forEach((value, index) => {
    Object.defineProperty(
      result,
      index,
      once(reads, `${name}[${index}]`, value),
    );
  });
  return result;
}

function validSubmission(overrides = {}) {
  return {
    id: "job-runtime-snapshot",
    queue: "media",
    kind: "fixture.snapshot",
    idempotencyKey: "runtime-snapshot-1",
    payload: { governance: { stage: "review", locks: ["identity"] } },
    requiredCapabilities: ["fixture.snapshot"],
    requiredCapabilityProfile: ["fixture.snapshot"],
    dependencyJobIds: ["job-parent"],
    inputArtifacts: [ARTIFACT_A],
    priority: 7,
    maximumAttempts: 3,
    retryPolicy: {
      baseDelayMs: 100,
      maximumDelayMs: 1_000,
      multiplier: 2,
      jitterFraction: 0.1,
    },
    leaseDurationMs: 20_000,
    timeoutMs: 60_000,
    notBefore: "2026-08-08T00:00:00.000Z",
    deadline: "2026-08-08T01:00:00.000Z",
    labels: { stage: "review" },
    ...overrides,
  };
}

test("runtime job submissions are snapshotted once before validation and hashing", () => {
  const reads = new Map();
  const nestedReads = new Map();
  const retryPolicy = {};
  Object.defineProperties(retryPolicy, {
    baseDelayMs: once(nestedReads, "retryPolicy.baseDelayMs", 100),
    maximumDelayMs: once(nestedReads, "retryPolicy.maximumDelayMs", 1_000),
    multiplier: once(nestedReads, "retryPolicy.multiplier", 2),
    jitterFraction: once(nestedReads, "retryPolicy.jitterFraction", 0.1),
  });
  const labels = {};
  Object.defineProperty(
    labels,
    "stage",
    once(nestedReads, "labels.stage", "review"),
  );
  const payload = { governance: {} };
  Object.defineProperty(
    payload.governance,
    "stage",
    once(nestedReads, "payload.governance.stage", "review"),
  );
  Object.defineProperty(
    payload.governance,
    "locks",
    once(nestedReads, "payload.governance.locks", ["identity"]),
  );

  const submission = {};
  Object.defineProperties(submission, {
    id: once(reads, "id", "job-runtime-snapshot"),
    queue: once(reads, "queue", "media"),
    kind: once(reads, "kind", "fixture.snapshot"),
    idempotencyKey: once(reads, "idempotencyKey", "runtime-snapshot-1"),
    payload: once(reads, "payload", payload),
    requiredCapabilities: once(
      reads,
      "requiredCapabilities",
      onceArray(nestedReads, "requiredCapabilities", ["fixture.snapshot"]),
    ),
    requiredCapabilityProfile: once(
      reads,
      "requiredCapabilityProfile",
      onceArray(nestedReads, "requiredCapabilityProfile", ["fixture.snapshot"]),
    ),
    dependencyJobIds: once(
      reads,
      "dependencyJobIds",
      onceArray(nestedReads, "dependencyJobIds", ["job-parent"]),
    ),
    inputArtifacts: once(
      reads,
      "inputArtifacts",
      onceArray(nestedReads, "inputArtifacts", [ARTIFACT_A]),
    ),
    priority: once(reads, "priority", 7),
    maximumAttempts: once(reads, "maximumAttempts", 3),
    retryPolicy: once(reads, "retryPolicy", retryPolicy),
    leaseDurationMs: once(reads, "leaseDurationMs", 20_000),
    timeoutMs: once(reads, "timeoutMs", 60_000),
    notBefore: once(reads, "notBefore", "2026-08-08T00:00:00.000Z"),
    deadline: once(reads, "deadline", "2026-08-08T01:00:00.000Z"),
    labels: once(reads, "labels", labels),
  });

  const normalized = normalizeRuntimeJobSubmission(submission);
  for (const name of [
    "id",
    "queue",
    "kind",
    "idempotencyKey",
    "payload",
    "requiredCapabilities",
    "requiredCapabilityProfile",
    "dependencyJobIds",
    "inputArtifacts",
    "priority",
    "maximumAttempts",
    "retryPolicy",
    "leaseDurationMs",
    "timeoutMs",
    "notBefore",
    "deadline",
    "labels",
  ]) {
    assert.equal(reads.get(name), 1, name);
  }
  for (const [name, count] of nestedReads) {
    assert.equal(count, 1, name);
  }

  assert.equal(normalized.spec.id, "job-runtime-snapshot");
  assert.deepEqual(normalized.spec.requiredCapabilities, ["fixture.snapshot"]);
  assert.deepEqual(normalized.spec.requiredCapabilityProfile, ["fixture.snapshot"]);
  assert.deepEqual(normalized.spec.dependencyJobIds, ["job-parent"]);
  assert.deepEqual(normalized.spec.inputArtifacts, [ARTIFACT_A]);
  assert.equal(normalized.spec.retryPolicy.baseDelayMs, 100);
  assert.match(normalized.specHash, /^[a-f0-9]{64}$/);
});

test("derived runtime job IDs retain the canonical NUL delimiter", () => {
  const normalized = normalizeRuntimeJobSubmission(
    validSubmission({ id: undefined }),
  );
  assert.equal(
    normalized.spec.id,
    `job_${sha256("media\0runtime-snapshot-1").slice(0, 40)}`,
  );
  assert.throws(
    () =>
      normalizeRuntimeJobSubmission(
        validSubmission({ idempotencyKey: "invalid\0key" }),
      ),
    (error) =>
      error instanceof RuntimeError &&
      error.code === "RUNTIME_JOB_SPEC_INVALID",
  );
});

test("runtime job submission snapshots detach and freeze retained identity", () => {
  const payload = { governance: { stage: "review", locks: ["identity"] } };
  const requiredCapabilities = ["fixture.snapshot"];
  const requiredCapabilityProfile = ["fixture.snapshot"];
  const dependencyJobIds = ["job-parent"];
  const inputArtifacts = [ARTIFACT_A];
  const retryPolicy = {
    baseDelayMs: 100,
    maximumDelayMs: 1_000,
    multiplier: 2,
    jitterFraction: 0.1,
  };
  const labels = { stage: "review" };
  const normalized = normalizeRuntimeJobSubmission(
    validSubmission({
      payload,
      requiredCapabilities,
      requiredCapabilityProfile,
      dependencyJobIds,
      inputArtifacts,
      retryPolicy,
      labels,
    }),
  );

  payload.governance.stage = "mutated";
  payload.governance.locks.push("mutated");
  requiredCapabilities.push("mutated");
  requiredCapabilityProfile.push("mutated");
  dependencyJobIds.push("job-mutated");
  inputArtifacts.push(`artifact_${"b".repeat(64)}`);
  retryPolicy.baseDelayMs = 999;
  labels.stage = "mutated";

  assert.equal(normalized.spec.payload.governance.stage, "review");
  assert.deepEqual(normalized.spec.payload.governance.locks, ["identity"]);
  assert.deepEqual(normalized.spec.requiredCapabilities, ["fixture.snapshot"]);
  assert.deepEqual(normalized.spec.requiredCapabilityProfile, ["fixture.snapshot"]);
  assert.deepEqual(normalized.spec.dependencyJobIds, ["job-parent"]);
  assert.deepEqual(normalized.spec.inputArtifacts, [ARTIFACT_A]);
  assert.equal(normalized.spec.retryPolicy.baseDelayMs, 100);
  assert.equal(normalized.spec.labels.stage, "review");

  for (const value of [
    normalized,
    normalized.spec,
    normalized.spec.payload,
    normalized.spec.payload.governance,
    normalized.spec.payload.governance.locks,
    normalized.spec.requiredCapabilities,
    normalized.spec.requiredCapabilityProfile,
    normalized.spec.dependencyJobIds,
    normalized.spec.inputArtifacts,
    normalized.spec.retryPolicy,
    normalized.spec.labels,
  ]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.throws(() => {
    normalized.spec.requiredCapabilities.push("mutated");
  }, TypeError);
  assert.throws(() => {
    normalized.spec.labels.stage = "mutated";
  }, TypeError);
});

test("hostile runtime submission access fails closed without leaking errors", () => {
  const cases = [
    new Proxy(validSubmission(), {
      get(target, property, receiver) {
        if (property === "queue") {
          throw new Error("runtime-submission-top-level-secret");
        }
        return Reflect.get(target, property, receiver);
      },
    }),
    validSubmission({
      retryPolicy: new Proxy({}, {
        get() {
          throw new Error("runtime-submission-retry-secret");
        },
      }),
    }),
    validSubmission({
      requiredCapabilities: new Proxy([], {
        get(target, property, receiver) {
          if (property === "length") {
            throw new Error("runtime-submission-array-secret");
          }
          return Reflect.get(target, property, receiver);
        },
      }),
    }),
    validSubmission({
      labels: new Proxy({}, {
        ownKeys() {
          throw new Error("runtime-submission-label-secret");
        },
      }),
    }),
    validSubmission({
      payload: new Proxy({}, {
        ownKeys() {
          throw new Error("runtime-submission-payload-secret");
        },
      }),
    }),
  ];

  for (const submission of cases) {
    assert.throws(
      () => normalizeRuntimeJobSubmission(submission),
      (error) =>
        error instanceof RuntimeError &&
        error.code === "RUNTIME_JOB_SPEC_INVALID" &&
        !error.message.includes("secret"),
    );
  }
});

test("runtime submission type mismatches use bounded runtime errors", () => {
  const cases = [
    validSubmission({ idempotencyKey: 42 }),
    validSubmission({ priority: "high" }),
    validSubmission({ retryPolicy: [] }),
    validSubmission({ labels: [] }),
    validSubmission({ dependencyJobIds: {} }),
    validSubmission({ requiredCapabilities: null }),
  ];

  for (const submission of cases) {
    assert.throws(
      () => normalizeRuntimeJobSubmission(submission),
      (error) =>
        error instanceof RuntimeError &&
        error.code === "RUNTIME_JOB_SPEC_INVALID",
    );
  }
});
