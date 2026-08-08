from pathlib import Path

ROOT = Path.cwd()
SOURCE_PATH = ROOT / "packages/runtime/src/local-repository.ts"
TEST_PATH = ROOT / "packages/runtime/test/claim-input-integrity-security.test.mjs"
WORKFLOW_PATH = ROOT / ".github/workflows/runtime-claim-input-integrity.yml"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


source = SOURCE_PATH.read_text(encoding="utf-8")

old_type_anchor = '''type RuntimeControlOptionsSnapshot = Readonly<{
  force: boolean;
  now: Date;
  at: string;
}>;

function iso(now: Date): string {
'''
new_type_anchor = '''type RuntimeControlOptionsSnapshot = Readonly<{
  force: boolean;
  now: Date;
  at: string;
}>;

type RuntimeClaimRequestSnapshot = Readonly<{
  worker: ReturnType<typeof normalizeRuntimeWorkerDescriptor>;
  maximumJobs: number;
  now: Date;
  at: string;
}>;

function iso(now: Date): string {
'''
source = replace_once(
    source,
    old_type_anchor,
    new_type_anchor,
    "runtime claim request snapshot type",
)

old_helper_anchor = '''  return Object.freeze({ force, now, at: iso(now) });
}

function draft(
'''
new_helper_anchor = '''  return Object.freeze({ force, now, at: iso(now) });
}

function invalidRuntimeClaimRequest(message: string): never {
  throw new RuntimeError("RUNTIME_CLAIM_INVALID", message);
}

function snapshotRuntimeClaimDate(value: unknown): Date {
  let milliseconds = Number.NaN;
  try {
    milliseconds = Date.prototype.getTime.call(value);
  } catch {
    invalidRuntimeClaimRequest(
      "Runtime claim time must be a valid Date.",
    );
  }
  if (!Number.isFinite(milliseconds)) {
    invalidRuntimeClaimRequest(
      "Runtime claim time must be a valid Date.",
    );
  }
  return new Date(milliseconds);
}

function snapshotRuntimeClaimRequest(
  value: unknown,
): RuntimeClaimRequestSnapshot {
  let recordLike = false;
  try {
    recordLike =
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value);
  } catch {
    invalidRuntimeClaimRequest(
      "Runtime claim request could not be inspected safely.",
    );
  }
  if (!recordLike) {
    invalidRuntimeClaimRequest(
      "Runtime claim request must be an object.",
    );
  }

  const source = value as Readonly<Record<string, unknown>>;
  let workerInput: unknown;
  let maximumJobsInput: unknown;
  let nowInput: unknown;
  try {
    workerInput = source.worker;
    maximumJobsInput = source.maximumJobs;
    nowInput = source.now;
  } catch {
    invalidRuntimeClaimRequest(
      "Runtime claim request fields could not be read safely.",
    );
  }

  const worker = normalizeRuntimeWorkerDescriptor(
    workerInput as RuntimeClaimRequest["worker"],
  );
  const maximumJobs = maximumJobsInput === undefined
    ? 1
    : maximumJobsInput;
  if (
    typeof maximumJobs !== "number" ||
    !Number.isInteger(maximumJobs) ||
    maximumJobs < 1 ||
    maximumJobs > 100
  ) {
    invalidRuntimeClaimRequest(
      "maximumJobs must be an integer between 1 and 100.",
    );
  }

  const now = nowInput === undefined
    ? new Date()
    : snapshotRuntimeClaimDate(nowInput);
  return Object.freeze({
    worker,
    maximumJobs,
    now,
    at: iso(now),
  });
}

function draft(
'''
source = replace_once(
    source,
    old_helper_anchor,
    new_helper_anchor,
    "runtime claim request snapshot helpers",
)

old_claim_prefix = '''  public async claim(request: RuntimeClaimRequest): Promise<readonly RuntimeClaimedJob[]> {
    const worker = normalizeRuntimeWorkerDescriptor(request.worker);
    const workerId = worker.id;
    const capabilities = worker.capabilities;
    const capabilityProfiles = worker.capabilityProfiles ?? [];
    const queues = worker.queues;
    const maximumJobs = request.maximumJobs ?? 1;
    if (!Number.isInteger(maximumJobs) || maximumJobs < 1 || maximumJobs > 100) {
      throw new RuntimeError(
        "RUNTIME_CLAIM_INVALID",
        "maximumJobs must be an integer between 1 and 100.",
      );
    }
    const now = request.now ?? new Date();
    const at = iso(now);

    return this.#journal.transact((snapshot) => {
'''
new_claim_prefix = '''  public async claim(request: RuntimeClaimRequest): Promise<readonly RuntimeClaimedJob[]> {
    const {
      worker,
      maximumJobs,
      now,
      at,
    } = snapshotRuntimeClaimRequest(request);
    const workerId = worker.id;
    const capabilities = worker.capabilities;
    const capabilityProfiles = worker.capabilityProfiles ?? [];
    const queues = worker.queues;

    return this.#journal.transact((snapshot) => {
'''
source = replace_once(
    source,
    old_claim_prefix,
    new_claim_prefix,
    "runtime claim request snapshot",
)
for live_read in ("request.worker", "request.maximumJobs", "request.now"):
    if live_read in source:
        raise RuntimeError(f"runtime claim live read remains: {live_read}")
SOURCE_PATH.write_text(source, encoding="utf-8")

TEST_PATH.write_text(
    '''import assert from "node:assert/strict";
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
        throw new Error(`runtime-claim-secret-${name}`);
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
  const root = await mkdtemp(path.join(os.tmpdir(), "evavo-claim-input-"));
  const runtimeRoot = path.join(root, "runtime");
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return { runtime, runtimeRoot };
}

function claimInputFailure(secret) {
  return (error) =>
    error instanceof RuntimeError &&
    error.code === "RUNTIME_CLAIM_INVALID" &&
    !error.message.includes(secret);
}

test("claim request fields are read exactly once before journal work", async (t) => {
  const { runtime } = await fixture(t);
  await runtime.submit(
    submission("job-claim-once"),
    "test",
    T0,
  );

  const reads = new Map();
  const request = {};
  Object.defineProperties(request, {
    worker: once(reads, "worker", {
      id: "worker-claim-once",
      capabilities: ["fixture.echo"],
    }),
    maximumJobs: once(reads, "maximumJobs", 1),
    now: once(reads, "now", at(1)),
  });

  const claimed = await runtime.claim(request);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].job.id, "job-claim-once");
  for (const field of ["worker", "maximumJobs", "now"]) {
    assert.equal(reads.get(field), 1, field);
  }
});

test("post-call clock mutation cannot advance delayed jobs or extend leases", async (t) => {
  const { runtime, runtimeRoot } = await fixture(t);
  await runtime.submit(
    submission("job-claim-immediate"),
    "test",
    T0,
  );
  await runtime.submit(
    submission("job-claim-delayed", {
      notBefore: at(3_600_000).toISOString(),
    }),
    "test",
    T0,
  );

  const lock = await acquireFileLock(runtimeRoot, "runtime-journal", {
    timeoutMs: 1_000,
    staleAfterMs: 60_000,
  });
  const now = at(1);
  try {
    const pending = runtime.claim({
      worker: {
        id: "worker-claim-clock",
        capabilities: ["fixture.echo"],
      },
      maximumJobs: 2,
      now,
    });
    now.setTime(at(7_200_000).getTime());
    await lock.release();

    const claimed = await pending;
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].job.id, "job-claim-immediate");
    assert.equal(claimed[0].lease.leasedAt, at(1).toISOString());
    assert.equal(claimed[0].lease.expiresAt, at(10_001).toISOString());
    assert.equal(
      (await runtime.get("job-claim-delayed")).state,
      "waiting",
    );
  } finally {
    await lock.release();
  }
});

test("hostile claim requests fail closed without changing queued jobs", async (t) => {
  const { runtime } = await fixture(t);
  const job = await runtime.submit(
    submission("job-claim-hostile"),
    "test",
    T0,
  );
  const secret = "private-runtime-claim-error";
  const hostile = {};
  Object.defineProperty(hostile, "worker", {
    enumerable: true,
    get() {
      throw new Error(secret);
    },
  });

  await assert.rejects(
    () => runtime.claim(hostile),
    claimInputFailure(secret),
  );
  assert.equal((await runtime.get(job.id)).state, "queued");

  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  await assert.rejects(
    () => runtime.claim(revoked.proxy),
    claimInputFailure(secret),
  );
  assert.equal((await runtime.get(job.id)).state, "queued");
});

test("malformed claim controls are rejected before scheduling", async (t) => {
  const { runtime } = await fixture(t);
  const job = await runtime.submit(
    submission("job-claim-malformed"),
    "test",
    T0,
  );
  const worker = {
    id: "worker-claim-malformed",
    capabilities: ["fixture.echo"],
  };
  const invalidRequests = [
    null,
    [],
    { worker, maximumJobs: 0 },
    { worker, maximumJobs: 101 },
    { worker, maximumJobs: 1.5 },
    { worker, maximumJobs: "1" },
    { worker, now: "2026-08-08T00:00:00.000Z" },
    { worker, now: new Date(Number.NaN) },
  ];

  for (const request of invalidRequests) {
    await assert.rejects(
      () => runtime.claim(request),
      claimInputFailure("malformed-runtime-claim"),
    );
    assert.equal((await runtime.get(job.id)).state, "queued");
  }
});

test("claim clocks are copied through intrinsic Date semantics", async (t) => {
  const { runtime } = await fixture(t);
  await runtime.submit(
    submission("job-claim-hostile-date"),
    "test",
    T0,
  );
  const secret = "overridden-claim-date-method";
  class HostileDate extends Date {
    getTime() {
      throw new Error(secret);
    }

    toISOString() {
      throw new Error(secret);
    }
  }

  const claimed = await runtime.claim({
    worker: {
      id: "worker-claim-hostile-date",
      capabilities: ["fixture.echo"],
    },
    maximumJobs: 1,
    now: new HostileDate(at(30).getTime()),
  });
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].lease.leasedAt, at(30).toISOString());
  assert.equal(claimed[0].lease.expiresAt, at(10_030).toISOString());
});
''',
    encoding="utf-8",
)

WORKFLOW_PATH.write_text(
    '''name: Runtime claim input integrity

on:
  pull_request:
    paths:
      - "packages/runtime/src/local-repository.ts"
      - "packages/runtime/test/claim-input-integrity-security.test.mjs"
      - "scripts/bootstrap-ci-media-tools.sh"
      - ".github/workflows/runtime-claim-input-integrity.yml"
  push:
    branches:
      - main
    paths:
      - "packages/runtime/src/local-repository.ts"
      - "packages/runtime/test/claim-input-integrity-security.test.mjs"
      - "scripts/bootstrap-ci-media-tools.sh"
      - ".github/workflows/runtime-claim-input-integrity.yml"

permissions:
  contents: read

concurrency:
  group: runtime-claim-input-integrity-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-24.04
    timeout-minutes: 40
    steps:
      - name: Check out exact source
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Install and identify media tools
        run: bash scripts/bootstrap-ci-media-tools.sh

      - name: Set up pnpm 10.13.1
        uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320 # v4.4.0
        with:
          version: 10.13.1

      - name: Set up Node.js 22.14.0
        uses: actions/setup-node@6044e13b5dc448c55e2357c09f80417699197238 # v6.2.0
        with:
          node-version: "22.14.0"
          package-manager-cache: false

      - name: Install frozen dependency graph
        run: pnpm install --frozen-lockfile

      - name: Build and type-check runtime claim dependencies
        run: |
          pnpm --filter @evavo/art-artifacts build
          pnpm --filter @evavo/art-runtime build
          pnpm --filter @evavo/art-runtime typecheck

      - name: Run runtime claim and persistence regressions
        run: >-
          node --test
          packages/runtime/test/runtime.test.mjs
          packages/runtime/test/redrive-policy.test.mjs
          packages/runtime/test/journal-integrity-security.test.mjs
          packages/runtime/test/submission-integrity-security.test.mjs
          packages/runtime/test/worker-options-integrity-security.test.mjs
          packages/runtime/test/control-options-integrity-security.test.mjs
          packages/runtime/test/claim-input-integrity-security.test.mjs

      - name: Verify permanent runtime claim input contract
        shell: bash
        run: |
          set -euo pipefail
          grep -F 'snapshotRuntimeClaimRequest' packages/runtime/src/local-repository.ts
          grep -F 'snapshotRuntimeClaimDate' packages/runtime/src/local-repository.ts
          grep -F 'claim request fields are read exactly once before journal work' packages/runtime/test/claim-input-integrity-security.test.mjs
          grep -F 'post-call clock mutation cannot advance delayed jobs or extend leases' packages/runtime/test/claim-input-integrity-security.test.mjs
          grep -F 'hostile claim requests fail closed without changing queued jobs' packages/runtime/test/claim-input-integrity-security.test.mjs
          ! grep -F 'request.worker' packages/runtime/src/local-repository.ts
          ! grep -F 'request.maximumJobs' packages/runtime/src/local-repository.ts
          ! grep -F 'request.now' packages/runtime/src/local-repository.ts

      - name: Run complete Art Studio validation
        run: pnpm check

      - name: Prove exact source remains clean
        if: always()
        shell: bash
        run: |
          set -euo pipefail
          git diff --exit-code
          test -z "$(git status --porcelain=v1 --untracked-files=all)"
''',
    encoding="utf-8",
)
