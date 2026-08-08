from pathlib import Path
import re
import textwrap

ROOT = Path.cwd()
SOURCE_PATH = ROOT / "packages/runtime/src/local-repository.ts"
TEST_PATH = ROOT / "packages/runtime/test/execution-result-input-integrity-security.test.mjs"
WORKFLOW_PATH = ROOT / ".github/workflows/runtime-execution-result-input-integrity.yml"

source = SOURCE_PATH.read_text(encoding="utf-8")

constant_anchor = 'const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;\n'
constant_replacement = '''const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const MAX_RUNTIME_OUTPUT_ARTIFACTS = 10_000;
const RUNTIME_FAILURE_CLASSIFICATIONS = new Set<
  RuntimeFailure["classification"]
>([
  "transient",
  "permanent",
  "cancelled",
  "lease-expired",
  "deadline-exceeded",
  "dependency-failed",
  "timeout",
]);
'''
if source.count(constant_anchor) != 1:
    raise SystemExit("artifact ID constant anchor was not unique")
source = source.replace(constant_anchor, constant_replacement, 1)

helper_pattern = re.compile(
    r'''function validateArtifactIds\([\s\S]*?\n}\n\nfunction normalizeFailure\([\s\S]*?\n}\n\nfunction replaceLastAttempt'''
)
helper_replacement = '''function invalidRuntimeOutputArtifacts(message: string): never {
  throw new RuntimeError("RUNTIME_OUTPUT_ARTIFACT_INVALID", message);
}

function snapshotRuntimeOutputArtifacts(
  value: unknown,
): readonly ArtifactId[] {
  let arrayLike = false;
  try {
    arrayLike = Array.isArray(value);
  } catch {
    invalidRuntimeOutputArtifacts(
      "Runtime output artifacts could not be inspected safely.",
    );
  }
  if (!arrayLike) {
    invalidRuntimeOutputArtifacts(
      "Runtime output artifacts must be an array.",
    );
  }

  const source = value as readonly unknown[];
  let length = 0;
  try {
    length = source.length;
  } catch {
    invalidRuntimeOutputArtifacts(
      "Runtime output artifact length could not be read safely.",
    );
  }
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > MAX_RUNTIME_OUTPUT_ARTIFACTS
  ) {
    invalidRuntimeOutputArtifacts(
      `Runtime output artifacts must contain no more than ${MAX_RUNTIME_OUTPUT_ARTIFACTS} entries.`,
    );
  }

  const snapshot: ArtifactId[] = [];
  for (let index = 0; index < length; index += 1) {
    let entry: unknown;
    try {
      entry = source[index];
    } catch {
      invalidRuntimeOutputArtifacts(
        `Runtime output artifact ${index} could not be read safely.`,
      );
    }
    if (typeof entry !== "string" || !ARTIFACT_ID.test(entry)) {
      invalidRuntimeOutputArtifacts(
        `Runtime output artifact ${index} must be a canonical artifact ID.`,
      );
    }
    snapshot.push(entry as ArtifactId);
  }
  return Object.freeze([...new Set(snapshot)].sort());
}

function invalidRuntimeFailureInput(message: string): never {
  throw new RuntimeError("RUNTIME_FAILURE_INVALID", message);
}

function freezeRuntimeJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    for (const entry of value) freezeRuntimeJson(entry);
    return Object.freeze(value);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Readonly<Record<string, JsonValue>>;
    for (const key of Object.keys(record)) {
      freezeRuntimeJson(record[key]!);
    }
    return Object.freeze(record);
  }
  return value;
}

function snapshotRuntimeFailureInput(value: unknown): RuntimeFailure {
  let recordLike = false;
  try {
    recordLike =
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value);
  } catch {
    invalidRuntimeFailureInput(
      "Runtime failure input could not be inspected safely.",
    );
  }
  if (!recordLike) {
    invalidRuntimeFailureInput("Runtime failure input must be an object.");
  }

  const source = value as Readonly<Record<string, unknown>>;
  let classificationInput: unknown;
  let codeInput: unknown;
  let messageInput: unknown;
  let detailsInput: unknown;
  try {
    classificationInput = source.classification;
    codeInput = source.code;
    messageInput = source.message;
    detailsInput = source.details;
  } catch {
    invalidRuntimeFailureInput(
      "Runtime failure fields could not be read safely.",
    );
  }

  if (
    typeof classificationInput !== "string" ||
    !RUNTIME_FAILURE_CLASSIFICATIONS.has(
      classificationInput as RuntimeFailure["classification"],
    )
  ) {
    invalidRuntimeFailureInput(
      "Runtime failure classification is not supported.",
    );
  }
  const classification =
    classificationInput as RuntimeFailure["classification"];

  let code = "";
  try {
    code = safeRuntimeName(codeInput, "failure.code");
  } catch {
    invalidRuntimeFailureInput(
      "Runtime failure code must contain 1 to 128 safe characters.",
    );
  }

  if (typeof messageInput !== "string") {
    invalidRuntimeFailureInput(
      "Failure message must contain 1 to 4096 characters.",
    );
  }
  const message = messageInput.trim();
  if (!message || message.length > 4_096 || message.includes("\\0")) {
    invalidRuntimeFailureInput(
      "Failure message must contain 1 to 4096 characters.",
    );
  }

  let details: JsonValue | undefined;
  if (detailsInput !== undefined) {
    try {
      details = freezeRuntimeJson(
        normalizeJson(detailsInput, "$.failure.details"),
      );
    } catch {
      invalidRuntimeFailureInput(
        "Runtime failure details must contain valid JSON data.",
      );
    }
  }

  return Object.freeze({
    classification,
    code,
    message,
    ...(details === undefined ? {} : { details }),
  });
}

function replaceLastAttempt'''
source, replacement_count = helper_pattern.subn(helper_replacement, source, count=1)
if replacement_count != 1:
    raise SystemExit("failure and output helper block was not replaced exactly once")

complete_old = '''    const transitionNow = snapshotRuntimeTransitionClock(now);
    const actor = actorName(actorInput);
    const at = iso(transitionNow);
    const outputArtifacts = validateArtifactIds(outputArtifactsInput);
'''
complete_new = '''    const transitionNow = snapshotRuntimeTransitionClock(now);
    const outputArtifacts = snapshotRuntimeOutputArtifacts(
      outputArtifactsInput,
    );
    const actor = actorName(actorInput);
    const at = iso(transitionNow);
'''
if source.count(complete_old) != 1:
    raise SystemExit("complete input block was not unique")
source = source.replace(complete_old, complete_new, 1)

fail_old = '''    const transitionNow = snapshotRuntimeTransitionClock(now);
    const actor = actorName(actorInput);
    const failure = normalizeFailure(failureInput);
'''
fail_new = '''    const transitionNow = snapshotRuntimeTransitionClock(now);
    const failure = snapshotRuntimeFailureInput(failureInput);
    const actor = actorName(actorInput);
'''
if source.count(fail_old) != 1:
    raise SystemExit("fail input block was not unique")
source = source.replace(fail_old, fail_new, 1)

SOURCE_PATH.write_text(source, encoding="utf-8")

TEST_PATH.write_text(textwrap.dedent(r'''
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
''').lstrip(), encoding="utf-8")

WORKFLOW_PATH.write_text(textwrap.dedent(r'''
    name: Runtime execution result input integrity

    on:
      pull_request:
        paths:
          - "packages/runtime/src/local-repository.ts"
          - "packages/runtime/test/execution-result-input-integrity-security.test.mjs"
          - "scripts/bootstrap-ci-media-tools.sh"
          - ".github/workflows/runtime-execution-result-input-integrity.yml"
      push:
        branches:
          - main
        paths:
          - "packages/runtime/src/local-repository.ts"
          - "packages/runtime/test/execution-result-input-integrity-security.test.mjs"
          - "scripts/bootstrap-ci-media-tools.sh"
          - ".github/workflows/runtime-execution-result-input-integrity.yml"

    permissions:
      contents: read

    concurrency:
      group: runtime-execution-result-input-integrity-${{ github.ref }}
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

          - name: Build and type-check runtime result dependencies
            run: |
              pnpm --filter @evavo/art-artifacts build
              pnpm --filter @evavo/art-runtime build
              pnpm --filter @evavo/art-runtime typecheck

          - name: Run runtime result and persistence regressions
            run: >-
              node --test
              packages/runtime/test/runtime.test.mjs
              packages/runtime/test/redrive-policy.test.mjs
              packages/runtime/test/journal-integrity-security.test.mjs
              packages/runtime/test/submission-integrity-security.test.mjs
              packages/runtime/test/worker-options-integrity-security.test.mjs
              packages/runtime/test/control-options-integrity-security.test.mjs
              packages/runtime/test/claim-input-integrity-security.test.mjs
              packages/runtime/test/transition-clock-integrity-security.test.mjs
              packages/runtime/test/execution-result-input-integrity-security.test.mjs

          - name: Verify permanent runtime execution result contract
            shell: bash
            run: |
              set -euo pipefail
              grep -F 'snapshotRuntimeOutputArtifacts' packages/runtime/src/local-repository.ts
              grep -F 'snapshotRuntimeFailureInput' packages/runtime/src/local-repository.ts
              grep -F 'RUNTIME_FAILURE_CLASSIFICATIONS' packages/runtime/src/local-repository.ts
              grep -F 'failure inputs are read exactly once and normalized before journal work' packages/runtime/test/execution-result-input-integrity-security.test.mjs
              grep -F 'completion snapshots array indexes instead of caller iterators' packages/runtime/test/execution-result-input-integrity-security.test.mjs
              grep -F 'post-call mutation cannot change retained execution result evidence' packages/runtime/test/execution-result-input-integrity-security.test.mjs
              grep -F 'hostile and malformed execution results fail closed without state changes' packages/runtime/test/execution-result-input-integrity-security.test.mjs
              ! grep -F 'function validateArtifactIds' packages/runtime/src/local-repository.ts
              ! grep -F 'function normalizeFailure' packages/runtime/src/local-repository.ts

          - name: Run complete Art Studio validation
            run: pnpm check

          - name: Prove exact source remains clean
            if: always()
            shell: bash
            run: |
              set -euo pipefail
              git diff --exit-code
              test -z "$(git status --porcelain=v1 --untracked-files=all)"
''').lstrip(), encoding="utf-8")
