import assert from "node:assert/strict";
import test from "node:test";

import {
  ProviderError,
  compileProviderCandidateContract,
  compileProviderCandidateRuntimeContract,
} from "../dist/index.js";

const request = {
  schemaVersion: "1.0",
  operation: "generate",
  assetKind: "environment",
  continuityPhase: "independent",
  assetId: "london-docks",
  candidateFamilyId: "london-docks-rain",
  creativeIntent:
    "Create one historically plausible 1871 London dock environment candidate.",
  style: {
    styleName: "Brass and Brine engraved port",
    intent: "Controlled monochrome engraving with deliberate readable staging.",
    mustHave: ["broad gameplay lane", "period shipping"],
    mustAvoid: ["modern containers", "pseudo-text"],
  },
  shot: {
    subject: "A side-stage London dock in rain.",
    include: ["complete dock lane"],
    exclude: ["modern infrastructure"],
    separateAssets: ["weather particles"],
  },
  target: {
    width: 1280,
    height: 720,
    transparency: "opaque",
    outputFormat: "png",
  },
  background: { strategy: "opaque-source" },
  candidateCount: 3,
};

test("canonical provider compile contract is deterministic and immutable", () => {
  const left = compileProviderCandidateContract(request);
  const right = compileProviderCandidateContract(structuredClone(request));
  assert.deepEqual(left, right);
  assert.equal(left.executionMode, "durable-worker-only");
  assert.equal(left.requestSha256.length, 64);
  assert.equal(left.compiledPromptSha256.length, 64);
  assert.deepEqual(left.requiredAdapterCapabilities, [
    "cancellation",
    "candidate-count",
    "generate",
  ]);
  assert.ok(Object.isFrozen(left));
  assert.ok(Object.isFrozen(left.request));
  assert.ok(Object.isFrozen(left.requiredAdapterCapabilities));
});

test("canonical runtime contract binds the exact compiled request and adapter profile", () => {
  const compiled = compileProviderCandidateContract(request);
  const runtime = compileProviderCandidateRuntimeContract(request);
  assert.deepEqual(runtime.request, compiled.request);
  assert.equal(runtime.requestSha256, compiled.requestSha256);
  assert.equal(runtime.compiledPromptSha256, compiled.compiledPromptSha256);
  assert.deepEqual(
    runtime.requiredAdapterCapabilities,
    compiled.requiredAdapterCapabilities,
  );
  assert.equal(runtime.executionMode, "submit-runtime-job");
  assert.equal(runtime.runtimeJob.queue, "provider");
  assert.equal(runtime.runtimeJob.kind, "art.candidate.generate");
  assert.equal(
    runtime.runtimeJob.idempotencyKey,
    `provider:${runtime.request.requestId}`,
  );
  assert.strictEqual(runtime.runtimeJob.payload, runtime.request);
  assert.strictEqual(
    runtime.runtimeJob.requiredCapabilityProfile,
    runtime.requiredAdapterCapabilities,
  );
  assert.deepEqual(runtime.runtimeJob.requiredCapabilities, [
    "provider.generate",
    "provider.reference-lock",
    "provider.candidate-store",
    "evidence.bundle",
  ]);
  assert.equal(runtime.runtimeJob.maximumAttempts, 3);
  assert.equal(runtime.runtimeJob.leaseDurationMs, 300_000);
  assert.equal(runtime.runtimeJob.timeoutMs, 1_800_000);
  assert.ok(Object.isFrozen(runtime));
  assert.ok(Object.isFrozen(runtime.runtimeJob));
  assert.ok(Object.isFrozen(runtime.runtimeJob.labels));
});

test("canonical compile surfaces fail closed through provider validation", () => {
  assert.throws(
    () =>
      compileProviderCandidateRuntimeContract({
        ...request,
        assetKind: "sprite-frame",
        continuityPhase: "key-pose",
        target: {
          width: 128,
          height: 128,
          transparency: "required",
          outputFormat: "png",
        },
        background: { strategy: "native-alpha" },
      }),
    (error) =>
      error instanceof ProviderError &&
      error.code === "PROVIDER_CANDIDATE_REQUEST_INVALID" &&
      /canonical-identity/.test(error.message),
  );
});
