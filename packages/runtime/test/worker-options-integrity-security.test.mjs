import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { LocalArtifactStore } from "@evavo/art-artifacts";

import {
  LocalRuntimeRepository,
  normalizeRuntimeWorkerDescriptor,
  RuntimeError,
  RuntimeWorker,
} from "../dist/index.js";

const T0 = new Date("2026-08-08T00:00:00.000Z");

function once(reads, name, value) {
  return {
    enumerable: true,
    configurable: true,
    get() {
      const count = (reads.get(name) ?? 0) + 1;
      reads.set(name, count);
      if (count > 1) {
        throw new Error(`runtime-worker-secret-${name}`);
      }
      return value;
    },
  };
}

function onceArray(reads, name, values) {
  const target = new Array(values.length);
  values.forEach((value, index) => {
    Object.defineProperty(target, index, once(reads, `${name}[${index}]`, value));
  });
  return new Proxy(target, {
    get(array, property, receiver) {
      if (property === "length") {
        const key = `${name}.length`;
        const count = (reads.get(key) ?? 0) + 1;
        reads.set(key, count);
        if (count > 1) {
          throw new Error(`runtime-worker-secret-${key}`);
        }
      }
      return Reflect.get(array, property, receiver);
    },
  });
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-worker-integrity-"));
  const runtime = new LocalRuntimeRepository({ root: path.join(root, "runtime") });
  const artifacts = new LocalArtifactStore({ root: path.join(root, "artifacts") });
  await artifacts.root();
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return { runtime, artifacts };
}

function submission() {
  return {
    id: "job-worker-options-integrity",
    queue: "media",
    kind: "fixture.echo",
    idempotencyKey: "worker-options-integrity",
    payload: { value: 1 },
    requiredCapabilities: ["fixture.echo"],
    maximumAttempts: 1,
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

function expectWorkerOptionsError(action, secret) {
  assert.throws(
    action,
    (error) =>
      error instanceof RuntimeError &&
      error.code === "RUNTIME_WORKER_OPTIONS_INVALID" &&
      !error.message.includes(secret),
  );
}

test("runtime worker descriptors are snapshotted once before scheduling", () => {
  const reads = new Map();
  const nestedReads = new Map();

  const profile = {};
  Object.defineProperties(profile, {
    id: once(nestedReads, "profile.id", "complete"),
    capabilities: once(
      nestedReads,
      "profile.capabilities",
      onceArray(nestedReads, "profile.capabilities.entries", [
        "pose-control",
        "identity-reference",
        "pose-control",
      ]),
    ),
  });

  const descriptor = {};
  Object.defineProperties(descriptor, {
    id: once(reads, "id", "worker-secure"),
    capabilities: once(
      reads,
      "capabilities",
      onceArray(nestedReads, "capabilities", [
        "fixture.echo",
        "artifact-write",
        "fixture.echo",
      ]),
    ),
    queues: once(
      reads,
      "queues",
      onceArray(nestedReads, "queues", ["secondary", "media", "media"]),
    ),
    capabilityProfiles: once(
      reads,
      "capabilityProfiles",
      onceArray(nestedReads, "capabilityProfiles", [profile]),
    ),
  });

  const normalized = normalizeRuntimeWorkerDescriptor(descriptor);

  for (const name of ["id", "capabilities", "queues", "capabilityProfiles"]) {
    assert.equal(reads.get(name), 1, name);
  }
  for (const [name, count] of nestedReads) {
    assert.equal(count, 1, name);
  }

  assert.deepEqual(normalized, {
    id: "worker-secure",
    capabilities: ["artifact-write", "fixture.echo"],
    capabilityProfiles: [
      {
        id: "complete",
        capabilities: ["identity-reference", "pose-control"],
      },
    ],
    queues: ["media", "secondary"],
  });
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.capabilities), true);
  assert.equal(Object.isFrozen(normalized.queues), true);
  assert.equal(Object.isFrozen(normalized.capabilityProfiles), true);
  assert.equal(Object.isFrozen(normalized.capabilityProfiles[0]), true);
  assert.equal(Object.isFrozen(normalized.capabilityProfiles[0].capabilities), true);
});

test("runtime worker descriptor snapshots detach retained scheduling identity", () => {
  const capabilities = ["fixture.echo"];
  const queues = ["media"];
  const profileCapabilities = ["identity-reference", "pose-control"];
  const profile = { id: "complete", capabilities: profileCapabilities };
  const capabilityProfiles = [profile];

  const normalized = normalizeRuntimeWorkerDescriptor({
    id: "worker-detached",
    capabilities,
    queues,
    capabilityProfiles,
  });

  capabilities.push("mutated");
  queues.push("mutated");
  profile.id = "mutated";
  profileCapabilities.push("mutated");
  capabilityProfiles.push({ id: "mutated", capabilities: ["mutated"] });

  assert.deepEqual(normalized, {
    id: "worker-detached",
    capabilities: ["fixture.echo"],
    capabilityProfiles: [
      {
        id: "complete",
        capabilities: ["identity-reference", "pose-control"],
      },
    ],
    queues: ["media"],
  });
  assert.throws(() => {
    normalized.capabilities.push("mutated");
  }, TypeError);
  assert.throws(() => {
    normalized.capabilityProfiles[0].id = "mutated";
  }, TypeError);
});

test("hostile runtime worker descriptor access fails closed without leaking errors", () => {
  const topSecret = "top-level-worker-secret";
  const hostileTop = {
    id: "worker-hostile-top",
    capabilities: ["fixture.echo"],
  };
  Object.defineProperty(hostileTop, "queues", {
    enumerable: true,
    get() {
      throw new Error(topSecret);
    },
  });
  expectWorkerOptionsError(
    () => normalizeRuntimeWorkerDescriptor(hostileTop),
    topSecret,
  );

  const nestedSecret = "nested-worker-secret";
  const hostileProfile = { id: "profile-hostile" };
  Object.defineProperty(hostileProfile, "capabilities", {
    enumerable: true,
    get() {
      throw new Error(nestedSecret);
    },
  });
  expectWorkerOptionsError(
    () =>
      normalizeRuntimeWorkerDescriptor({
        id: "worker-hostile-profile",
        capabilities: ["fixture.echo"],
        capabilityProfiles: [hostileProfile],
      }),
    nestedSecret,
  );

  const revoked = Proxy.revocable(
    { id: "worker-revoked", capabilities: ["fixture.echo"] },
    {},
  );
  revoked.revoke();
  expectWorkerOptionsError(
    () => normalizeRuntimeWorkerDescriptor(revoked.proxy),
    "revoked-worker-secret",
  );

  expectWorkerOptionsError(
    () =>
      normalizeRuntimeWorkerDescriptor({
        id: "worker-invalid-profiles",
        capabilities: ["fixture.echo"],
        capabilityProfiles: { length: 1 },
      }),
    "invalid-profile-secret",
  );
});

test("runtime worker options bind execution to one immutable handler snapshot", async (t) => {
  const { runtime, artifacts } = await fixture(t);
  await runtime.submit(submission(), "test", T0);

  let intendedCalls = 0;
  let swappedCalls = 0;
  const intendedHandler = async () => {
    intendedCalls += 1;
    return { result: { handler: "intended" } };
  };
  const swappedHandler = async () => {
    swappedCalls += 1;
    return { result: { handler: "swapped" } };
  };
  const handlers = { "fixture.echo": intendedHandler };
  const descriptor = {
    id: "worker-options-snapshot",
    capabilities: ["fixture.echo"],
    queues: ["media"],
  };

  const reads = new Map();
  const options = {};
  Object.defineProperties(options, {
    runtime: once(reads, "runtime", runtime),
    artifacts: once(reads, "artifacts", artifacts),
    worker: once(reads, "worker", descriptor),
    handlers: once(reads, "handlers", handlers),
    concurrency: once(reads, "concurrency", 1),
    heartbeatIntervalMs: once(reads, "heartbeatIntervalMs", 1_000),
  });

  const worker = new RuntimeWorker(options);
  handlers["fixture.echo"] = swappedHandler;
  descriptor.capabilities.push("mutated");
  descriptor.queues.push("mutated");

  for (const name of [
    "runtime",
    "artifacts",
    "worker",
    "handlers",
    "concurrency",
    "heartbeatIntervalMs",
  ]) {
    assert.equal(reads.get(name), 1, name);
  }

  const result = await worker.runOnce();
  assert.deepEqual(result, {
    claimed: 1,
    succeeded: 1,
    failed: 0,
    cancelled: 0,
    paused: 0,
  });
  assert.equal(intendedCalls, 1);
  assert.equal(swappedCalls, 0);
});

test("hostile runtime worker options fail closed without leaking errors", () => {
  const topSecret = "worker-options-top-secret";
  const hostileOptions = {
    runtime: {},
    artifacts: {},
    worker: { id: "worker-hostile-options", capabilities: ["fixture.echo"] },
  };
  Object.defineProperty(hostileOptions, "handlers", {
    enumerable: true,
    get() {
      throw new Error(topSecret);
    },
  });
  expectWorkerOptionsError(() => new RuntimeWorker(hostileOptions), topSecret);

  const handlerSecret = "worker-handler-secret";
  const hostileHandlers = {};
  Object.defineProperty(hostileHandlers, "fixture.echo", {
    enumerable: true,
    get() {
      throw new Error(handlerSecret);
    },
  });
  expectWorkerOptionsError(
    () =>
      new RuntimeWorker({
        runtime: {},
        artifacts: {},
        worker: { id: "worker-hostile-handler", capabilities: ["fixture.echo"] },
        handlers: hostileHandlers,
      }),
    handlerSecret,
  );

  expectWorkerOptionsError(
    () =>
      new RuntimeWorker({
        runtime: {},
        artifacts: {},
        worker: { id: "worker-invalid-handler", capabilities: ["fixture.echo"] },
        handlers: { "fixture.echo": "not-a-function" },
      }),
    "invalid-handler-secret",
  );

  const revoked = Proxy.revocable(
    {
      runtime: {},
      artifacts: {},
      worker: { id: "worker-revoked-options", capabilities: ["fixture.echo"] },
      handlers: { "fixture.echo": async () => undefined },
    },
    {},
  );
  revoked.revoke();
  expectWorkerOptionsError(
    () => new RuntimeWorker(revoked.proxy),
    "revoked-options-secret",
  );
});
