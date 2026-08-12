import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  compileHmfProviderRuntimeDispatch,
  compileHmfProviderRuntimeOutcome,
  validateHmfCompiledProviderRuntimeContract,
  verifyHmfProviderRuntimeDispatch,
} from "./frame-body-provider-runtime-dispatch.mjs";
import { createHmfProviderSubmissionAuthorization } from "./frame-body-provider-submission-manifest.mjs";
import { heavyMetalFightingProviderExecutionEnvelope } from "./frame-body-provider-execution-envelope.mjs";
import { createHmfProductionReceipt } from "./work-orders.mjs";

const UNIT_ID = "hmf.frame-animation.bastion.slot-121";
const sha256 = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

function artifactBindings(envelope) {
  return envelope.referenceRequirements.map((requirement) => ({
    unitId: envelope.unitId,
    bindingKey: requirement.bindingKey,
    sourcePath: requirement.sourcePath,
    artifactId: `artifact_${sha256(`${envelope.unitId}:${requirement.bindingKey}:${requirement.sourcePath}`)}`,
    evidenceSha256: sha256(`runtime-dispatch-reference:${envelope.unitId}:${requirement.bindingKey}`),
    actorClass: "human",
    actorId: "named-human-reviewer",
    occurredAt: "2026-08-13T05:00:00.000Z",
  }));
}

async function authorizedEvidence() {
  const blocked = await heavyMetalFightingProviderExecutionEnvelope(UNIT_ID);
  const referencesLocked = await createHmfProductionReceipt({
    unitId: UNIT_ID,
    state: "references-locked",
    attempt: 1,
    evidenceSha256: sha256("runtime-dispatch-references-locked"),
    actorClass: "agent",
    actorId: "runtime-dispatch-agent",
    occurredAt: "2026-08-13T05:01:00.000Z",
  });
  const generationAuthorized = await createHmfProductionReceipt({
    unitId: UNIT_ID,
    state: "generation-authorized",
    attempt: 1,
    evidenceSha256: sha256("runtime-dispatch-generation-authorized"),
    actorClass: "human",
    actorId: "named-human-reviewer",
    occurredAt: "2026-08-13T05:02:00.000Z",
  }, referencesLocked);
  const evidence = { receipts: [referencesLocked, generationAuthorized], artifactBindings: artifactBindings(blocked) };
  const envelope = await heavyMetalFightingProviderExecutionEnvelope(UNIT_ID, evidence);
  const submissionAuthorization = createHmfProviderSubmissionAuthorization(envelope, {
    actorClass: "human",
    actorId: "named-human-reviewer",
    occurredAt: "2026-08-13T05:03:00.000Z",
    evidenceSha256: sha256("runtime-dispatch-submission-authorized"),
    reason: "Authorize one exact provider runtime submission for the governed GRAVEBELL hero-impact cel.",
  });
  return { ...evidence, submissionAuthorization };
}

function fakeCompiledRuntimeContract(dispatch) {
  const requestId = `provider_${sha256(dispatch.providerCompiler.input).slice(0, 40)}`;
  const request = Object.freeze({ ...dispatch.providerCompiler.input, protocolVersion: "2026-08-07.3", requestId });
  const compiledPrompt = `EVAVO ART STUDIO — GOVERNED CANDIDATE CONTRACT\n\n${request.creativeIntent}\n`;
  return Object.freeze({
    schemaVersion: "1.0",
    request,
    requestSha256: sha256(`normalized:${requestId}`),
    requiredAdapterCapabilities: Object.freeze(["generate", "reference-images", "identity-reference", "temporal-reference", "native-alpha", "custom-size", "candidate-count"]),
    compiledPrompt,
    compiledPromptSha256: sha256(compiledPrompt),
    runtimeJob: Object.freeze({
      queue: "provider",
      kind: "art.candidate.generate",
      idempotencyKey: `provider:${requestId}`,
      payload: request,
      requiredCapabilities: Object.freeze(["provider.generate", "provider.reference-lock", "provider.candidate-store", "evidence.bundle"]),
      requiredCapabilityProfile: Object.freeze(["generate", "reference-images", "identity-reference", "temporal-reference", "native-alpha", "custom-size", "candidate-count"]),
      maximumAttempts: 3,
      leaseDurationMs: 300_000,
      timeoutMs: 1_800_000,
      labels: Object.freeze({ providerRequestId: requestId, candidateFamilyId: request.candidateFamilyId, assetId: request.assetId, continuityPhase: request.continuityPhase }),
    }),
    executionMode: "submit-runtime-job",
  });
}

function candidateRunResult(binding) {
  return {
    kind: "candidate-run-result",
    submissionIdempotencyKey: binding.submissionIdempotencyKey,
    providerCallCount: 1,
    completedAt: "2026-08-13T05:05:00.000Z",
    result: {
      schemaVersion: "1.0",
      protocolVersion: "2026-08-07.3",
      requestId: binding.normalizedProviderRequestId,
      requestSha256: binding.normalizedProviderRequestSha256,
      compiledPromptSha256: binding.compiledPromptSha256,
      routingInspection: { outcome: "eligible", providerCallPerformedByInspection: false },
      adapterId: "test-adapter",
      model: "test-model",
      candidateArtifacts: [`artifact_${"a".repeat(64)}`],
      evidenceArtifact: `artifact_${"b".repeat(64)}`,
      attempts: [{ adapterId: "test-adapter", model: "test-model", startedAt: "2026-08-13T05:04:00.000Z", completedAt: "2026-08-13T05:05:00.000Z", outcome: "succeeded" }],
      requiresAlphaExtraction: false,
    },
  };
}

test("runtime dispatch cannot compile before both human provider gates are satisfied", async () => {
  await assert.rejects(compileHmfProviderRuntimeDispatch(UNIT_ID), /not authorized for explicit runtime submission|provider-execution-envelope-not-submit-ready/);
});

test("authorized manifest compiles one immutable generic-provider runtime dispatch", async () => {
  const dispatch = await compileHmfProviderRuntimeDispatch(UNIT_ID, await authorizedEvidence());
  assert.equal(dispatch.unitId, UNIT_ID);
  assert.equal(dispatch.frameId, "bastion");
  assert.equal(dispatch.bodySlot, 121);
  assert.equal(dispatch.attempt, 1);
  assert.equal(dispatch.providerCompiler.package, "@evavo/art-providers");
  assert.equal(dispatch.providerCompiler.export, "compileProviderCandidateRuntimeContract");
  assert.equal(dispatch.providerCompiler.input.candidateCount, 1);
  assert.equal(dispatch.expectedRuntimeContract.queue, "provider");
  assert.equal(dispatch.expectedRuntimeContract.kind, "art.candidate.generate");
  assert.equal(dispatch.expectedRuntimeContract.maximumAttempts, 3);
  assert.equal(dispatch.candidateAdmission.expectedCandidateArtifacts, 1);
  assert.match(dispatch.candidateAdmission.candidateOutputPath, /^scratch\/provider\/hmf-b\d{4}\//);
  assert.match(dispatch.submissionIdempotencyKey, /^hmf-provider-submit:[0-9a-f]{40}$/);
  assert.match(dispatch.runtimeDispatchSha256, /^[0-9a-f]{64}$/);
  assert.equal(dispatch.authority.providerExecution, false);
  assert.equal(dispatch.authority.runtimeEnqueue, false);
});

test("generic provider compiler output is bound back to the exact HMF dispatch", async () => {
  const dispatch = await compileHmfProviderRuntimeDispatch(UNIT_ID, await authorizedEvidence());
  const compiled = fakeCompiledRuntimeContract(dispatch);
  const binding = validateHmfCompiledProviderRuntimeContract(dispatch, compiled);
  assert.equal(binding.unitId, UNIT_ID);
  assert.equal(binding.runtimeDispatchSha256, dispatch.runtimeDispatchSha256);
  assert.equal(binding.runtimeJob.queue, "provider");
  assert.equal(binding.runtimeJob.kind, "art.candidate.generate");
  assert.equal(binding.runtimeJob.maximumAttempts, 3);
  assert.ok(binding.runtimeJob.requiredCapabilities.includes("provider.candidate-store"));
  assert.match(binding.normalizedProviderRequestId, /^provider_[0-9a-f]{40}$/);
  assert.match(binding.runtimeBindingSha256, /^[0-9a-f]{64}$/);
  assert.equal(binding.authority.providerExecution, false);
  const tampered = structuredClone(compiled);
  tampered.runtimeJob.maximumAttempts = 4;
  assert.throws(() => validateHmfCompiledProviderRuntimeContract(dispatch, tampered), /retry, lease or timeout contract drifted/);
});

test("one successful runtime result becomes a non-persisting candidate-admission plan", async () => {
  const dispatch = await compileHmfProviderRuntimeDispatch(UNIT_ID, await authorizedEvidence());
  const binding = validateHmfCompiledProviderRuntimeContract(dispatch, fakeCompiledRuntimeContract(dispatch));
  const outcome = compileHmfProviderRuntimeOutcome(dispatch, binding, candidateRunResult(binding));
  assert.equal(outcome.result.status, "candidate-admission-ready");
  assert.equal(outcome.result.candidateCount, 1);
  assert.equal(outcome.result.candidateArtifactId, `artifact_${"a".repeat(64)}`);
  assert.equal(outcome.result.candidateMaterialization.targetPath, dispatch.candidateAdmission.candidateOutputPath);
  assert.equal(outcome.result.candidateMaterialization.oneImageOnly, true);
  assert.equal(outcome.result.nextReceiptTemplate.state, "candidates-admitted");
  assert.equal(outcome.result.nextReceiptTemplate.actorClass, "runtime");
  assert.match(outcome.runtimeOutcomeSha256, /^[0-9a-f]{64}$/);
  assert.equal(outcome.authority.candidateMaterialization, false);
  assert.equal(outcome.authority.receiptPersistence, false);
  assert.equal(outcome.authority.candidateApproval, false);
});

test("provider failure becomes a separate bounded failure record and never fabricates a candidate or invalid lifecycle state", async () => {
  const dispatch = await compileHmfProviderRuntimeDispatch(UNIT_ID, await authorizedEvidence());
  const binding = validateHmfCompiledProviderRuntimeContract(dispatch, fakeCompiledRuntimeContract(dispatch));
  const outcome = compileHmfProviderRuntimeOutcome(dispatch, binding, {
    kind: "provider-failure",
    submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
    providerCallCount: 1,
    completedAt: "2026-08-13T05:05:00.000Z",
    failure: { code: "PROVIDER_TIMEOUT", classification: "transient", message: "The single governed provider call timed out.", attemptCount: 1, candidateCount: 0, adapterId: "test-adapter", model: "test-model" },
  });
  assert.equal(outcome.result.status, "provider-failure-record-ready");
  assert.equal(outcome.result.candidateCount, 0);
  assert.equal(outcome.result.failure.code, "PROVIDER_TIMEOUT");
  assert.equal(outcome.result.failureRecordTemplate.recordKind, "provider-failure");
  assert.equal(outcome.result.failureRecordTemplate.productionReceiptStateUnchanged, "generation-authorized");
  assert.equal(outcome.result.failureRecordTemplate.retryRequiresFreshGenerationAndSubmissionAuthorization, true);
  assert.equal(outcome.result.nextReceiptTemplate, undefined);
  assert.equal(outcome.authority.candidatePromotion, false);
});

test("runtime outcome rejects multiple candidates, fallback attempts and idempotency drift", async () => {
  const dispatch = await compileHmfProviderRuntimeDispatch(UNIT_ID, await authorizedEvidence());
  const binding = validateHmfCompiledProviderRuntimeContract(dispatch, fakeCompiledRuntimeContract(dispatch));
  const multiple = candidateRunResult(binding);
  multiple.result.candidateArtifacts.push(`artifact_${"c".repeat(64)}`);
  assert.throws(() => compileHmfProviderRuntimeOutcome(dispatch, binding, multiple), /exactly one valid candidate artifact/);
  const fallback = candidateRunResult(binding);
  fallback.result.attempts.push({ ...fallback.result.attempts[0], adapterId: "fallback-adapter" });
  assert.throws(() => compileHmfProviderRuntimeOutcome(dispatch, binding, fallback), /exactly one successful attempt/);
  const drifted = candidateRunResult(binding);
  drifted.submissionIdempotencyKey = `hmf-provider-submit:${"f".repeat(40)}`;
  assert.throws(() => compileHmfProviderRuntimeOutcome(dispatch, binding, drifted), /idempotency key drifted/);
});

test("runtime dispatch verification remains provider-free and approval-free", async () => {
  const verification = await verifyHmfProviderRuntimeDispatch();
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.every((check) => check.passed));
  assert.equal(verification.failed.length, 0);
});
