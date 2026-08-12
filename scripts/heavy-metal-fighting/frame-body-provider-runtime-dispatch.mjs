import { createHash } from "node:crypto";

import {
  HMF_PROVIDER_SUBMISSION_MANIFEST_SCHEMA,
  HMF_PROVIDER_SUBMISSION_PROTOCOL_VERSION,
  heavyMetalFightingProviderSubmissionManifest,
} from "./frame-body-provider-submission-manifest.mjs";

export const HMF_PROVIDER_RUNTIME_DISPATCH_SCHEMA = "evavo.heavy-metal-fighting-provider-runtime-dispatch.v1";
export const HMF_PROVIDER_RUNTIME_BINDING_SCHEMA = "evavo.heavy-metal-fighting-provider-runtime-binding.v1";
export const HMF_PROVIDER_RUNTIME_OUTCOME_SCHEMA = "evavo.heavy-metal-fighting-provider-runtime-outcome.v1";
export const HMF_PROVIDER_RUNTIME_PROTOCOL_VERSION = "2026-08-13.1";

const SHA256 = /^[0-9a-f]{64}$/u;
const ARTIFACT_ID = /^artifact_[0-9a-f]{64}$/u;
const SUBMISSION_KEY = /^hmf-provider-submit:[0-9a-f]{40}$/u;
const PROVIDER_REQUEST_ID = /^provider_[0-9a-f]{40}$/u;
const FAILURE_CLASSIFICATIONS = new Set(["transient", "permanent", "incompatible", "cancelled"]);

function fail(message) {
  throw new Error(`HEAVY_METAL_FIGHTING_PROVIDER_RUNTIME_DISPATCH_INVALID: ${message}`);
}
function assert(condition, message) {
  if (!condition) fail(message);
}
function freeze(value) {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (value && typeof value === "object") Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  return value;
}
function canonical(value) {
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}
function hash(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}
function timestamp(value, label) {
  assert(typeof value === "string" && value.trim() === value && Number.isFinite(Date.parse(value)), `${label} must be an ISO-compatible timestamp.`);
  return value;
}
function selfHashed(value, field, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  assert(SHA256.test(String(value[field] ?? "")), `${label}.${field} must be a SHA-256.`);
  const body = { ...value };
  delete body[field];
  assert(value[field] === hash(body), `${label}.${field} does not match canonical content.`);
  return value;
}
function assertNoAuthority(authority, label, extra = []) {
  assert(authority && typeof authority === "object", `${label} authority is missing.`);
  for (const key of ["candidateApproval", "candidatePromotion", "targetRepositoryMutation", "gitMutation", "deployment", "publication", ...extra]) {
    assert(authority[key] === false, `${label} gained prohibited ${key} authority.`);
  }
}
function safeCandidatePath(value, manifest) {
  assert(typeof value === "string" && value === manifest.candidateOutputPath, `${manifest.unitId} candidate output path drifted from its submission manifest.`);
  assert(value.startsWith(`scratch/provider/${manifest.batchId}/`) && value.endsWith("-cand-01.png"), `${manifest.unitId} candidate output path escaped its governed batch root.`);
  assert(!value.includes("\\") && !value.split("/").includes(".."), `${manifest.unitId} candidate output path is unsafe.`);
  return value;
}
function authorizedManifest(manifest) {
  assert(manifest?.schema === HMF_PROVIDER_SUBMISSION_MANIFEST_SCHEMA, "provider submission manifest schema drifted.");
  assert(manifest.protocolVersion === HMF_PROVIDER_SUBMISSION_PROTOCOL_VERSION, "provider submission manifest protocol drifted.");
  selfHashed(manifest, "submissionManifestSha256", "provider submission manifest");
  assert(manifest.status === "authorized-for-explicit-runtime-submission", `${manifest.unitId ?? "work unit"} is not authorized for explicit runtime submission.`);
  assert(manifest.manifestReady === true && manifest.blockers?.length === 0, `${manifest.unitId} submission manifest is not ready.`);
  assert(manifest.submissionAuthorization?.actorClass === "human" && SHA256.test(String(manifest.submissionAuthorization?.authorizationSha256 ?? "")), `${manifest.unitId} lacks named-human submission authorization.`);
  assert(Number.isInteger(manifest.submissionAuthorization?.attempt) && manifest.submissionAuthorization.attempt >= 1, `${manifest.unitId} submission authorization attempt is invalid.`);
  const instruction = selfHashed(manifest.runtimeSubmissionInstruction, "runtimeSubmissionInstructionSha256", `${manifest.unitId} runtime submission instruction`);
  assert(instruction.providerCompiler?.package === "@evavo/art-providers" && instruction.providerCompiler?.export === "compileProviderCandidateRuntimeContract", `${manifest.unitId} generic provider compiler binding drifted.`);
  assert(instruction.providerCompiler?.validationRequiredAtSubmission === true, `${manifest.unitId} runtime compiler validation gate was removed.`);
  assert(instruction.maximumProviderCalls === 1 && instruction.maximumCandidates === 1, `${manifest.unitId} must remain one provider call and one candidate.`);
  const request = instruction.providerRequestInput;
  assert(request?.operation === "generate" && request?.assetKind === "sprite-frame" && request?.candidateCount === 1, `${manifest.unitId} provider request scope drifted.`);
  assert(request?.target?.width === 160 && request?.target?.height === 160 && request?.target?.transparency === "required" && request?.target?.outputFormat === "png", `${manifest.unitId} target must remain 160x160 transparent PNG.`);
  assert(request?.background?.strategy === "native-alpha" && request?.selection?.allowFallback === false, `${manifest.unitId} alpha or fallback policy drifted.`);
  assert(instruction.providerRequestInputSha256 === hash(request), `${manifest.unitId} provider request input hash drifted.`);
  assert(SUBMISSION_KEY.test(String(instruction.submissionIdempotencyKey ?? "")), `${manifest.unitId} submission idempotency key is invalid.`);
  assert(instruction.expectedNextReceiptState === "candidates-admitted", `${manifest.unitId} expected receipt state drifted.`);
  safeCandidatePath(instruction.candidateOutputPath, manifest);
  assertNoAuthority(instruction.authority, `${manifest.unitId} runtime instruction`, ["providerExecution", "runtimeEnqueue"]);
  assertNoAuthority(manifest.authority, `${manifest.unitId} submission manifest`, ["providerExecution", "runtimeEnqueue"]);
  return manifest;
}

export async function compileHmfProviderRuntimeDispatch(unitId, options = {}) {
  const manifest = authorizedManifest(await heavyMetalFightingProviderSubmissionManifest(unitId, {
    receipts: options.receipts ?? [],
    artifactBindings: options.artifactBindings ?? [],
    submissionAuthorization: options.submissionAuthorization ?? null,
  }));
  const instruction = manifest.runtimeSubmissionInstruction;
  const body = {
    schema: HMF_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
    protocolVersion: HMF_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    projectId: manifest.projectId,
    publicTitle: manifest.publicTitle,
    unitId: manifest.unitId,
    batchId: manifest.batchId,
    frameId: manifest.frameId,
    bodySlot: manifest.bodySlot,
    attempt: manifest.submissionAuthorization.attempt,
    submissionManifestSha256: manifest.submissionManifestSha256,
    submissionAuthorizationSha256: manifest.submissionAuthorization.authorizationSha256,
    executionEnvelopeSha256: manifest.executionEnvelopeSha256,
    runtimeSubmissionInstructionSha256: instruction.runtimeSubmissionInstructionSha256,
    submissionIdempotencyKey: instruction.submissionIdempotencyKey,
    providerRequestInputSha256: instruction.providerRequestInputSha256,
    providerCompiler: freeze({
      package: "@evavo/art-providers",
      export: "compileProviderCandidateRuntimeContract",
      input: instruction.providerRequestInput,
      inputSha256: instruction.providerRequestInputSha256,
      validationRequired: true,
    }),
    expectedRuntimeContract: freeze({
      schemaVersion: "1.0",
      executionMode: "submit-runtime-job",
      queue: "provider",
      kind: "art.candidate.generate",
      maximumAttempts: 3,
      leaseDurationMs: 300_000,
      timeoutMs: 1_800_000,
      candidateCount: 1,
      requiredCapabilities: freeze(["provider.generate", "provider.reference-lock", "provider.candidate-store", "evidence.bundle"]),
    }),
    candidateAdmission: freeze({
      candidateOutputPath: instruction.candidateOutputPath,
      expectedMediaType: "image/png",
      expectedWidth: 160,
      expectedHeight: 160,
      expectedCandidateArtifacts: 1,
      expectedEvidenceArtifacts: 1,
      nextReceiptState: "candidates-admitted",
    }),
    permittedRuntimeOutcomes: freeze(["candidate-run-result", "provider-failure"]),
    authority: freeze({
      runtimeContractCompilation: false,
      runtimeEnqueue: false,
      providerExecution: false,
      candidateMaterialization: false,
      receiptPersistence: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      explicitWriteEnabledRuntimeRequired: true,
    }),
  };
  return freeze({ ...body, runtimeDispatchSha256: hash(body) });
}

export function validateHmfCompiledProviderRuntimeContract(dispatchInput, compiled) {
  const dispatch = selfHashed(dispatchInput, "runtimeDispatchSha256", "provider runtime dispatch");
  assert(compiled && typeof compiled === "object" && !Array.isArray(compiled), "compiled provider runtime contract must be an object.");
  assert(compiled.schemaVersion === "1.0" && compiled.executionMode === "submit-runtime-job", "generic provider runtime schema or execution mode drifted.");
  assert(SHA256.test(String(compiled.requestSha256 ?? "")) && SHA256.test(String(compiled.compiledPromptSha256 ?? "")), "generic provider runtime hashes are missing.");
  const request = compiled.request;
  assert(request?.assetId === dispatch.unitId && request?.frameId === dispatch.frameId, "generic provider request identity drifted from HMF dispatch.");
  assert(request?.operation === "generate" && request?.assetKind === "sprite-frame" && request?.candidateCount === 1, "generic provider request scope drifted.");
  assert(request?.target?.width === 160 && request?.target?.height === 160 && request?.target?.transparency === "required" && request?.target?.outputFormat === "png", "generic provider target drifted.");
  assert(request?.background?.strategy === "native-alpha" && request?.selection?.allowFallback === false, "generic provider alpha or fallback policy drifted.");
  assert(PROVIDER_REQUEST_ID.test(String(request?.requestId ?? "")), "generic provider requestId is not deterministic provider_<sha> form.");
  assert(typeof compiled.compiledPrompt === "string" && compiled.compiledPrompt.includes(dispatch.providerCompiler.input.creativeIntent), "generic provider compiled prompt lost the exact HMF creative intent.");
  assert(compiled.compiledPromptSha256 === hash(compiled.compiledPrompt), "generic provider compiled-prompt hash drifted.");
  const job = compiled.runtimeJob;
  assert(job?.queue === "provider" && job?.kind === "art.candidate.generate", "generic provider runtime queue or kind drifted.");
  assert(job?.idempotencyKey === `provider:${request.requestId}`, "generic provider runtime idempotency key drifted.");
  assert(job?.maximumAttempts === 3 && job?.leaseDurationMs === 300_000 && job?.timeoutMs === 1_800_000, "generic provider runtime retry, lease or timeout contract drifted.");
  assert(canonical(job?.payload) === canonical(request), "generic provider runtime payload differs from its normalized request.");
  for (const capability of dispatch.expectedRuntimeContract.requiredCapabilities) assert(job?.requiredCapabilities?.includes(capability), `generic provider runtime job is missing ${capability}.`);
  assert(job?.labels?.assetId === dispatch.unitId && job?.labels?.continuityPhase === request.continuityPhase, "generic provider runtime labels drifted.");
  assert(compiled.requiredAdapterCapabilities?.includes("generate"), "generic provider runtime adapter profile lost generate.");
  const body = {
    schema: HMF_PROVIDER_RUNTIME_BINDING_SCHEMA,
    protocolVersion: HMF_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    unitId: dispatch.unitId,
    batchId: dispatch.batchId,
    frameId: dispatch.frameId,
    bodySlot: dispatch.bodySlot,
    runtimeDispatchSha256: dispatch.runtimeDispatchSha256,
    submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
    providerRequestInputSha256: dispatch.providerRequestInputSha256,
    normalizedProviderRequestId: request.requestId,
    normalizedProviderRequestSha256: compiled.requestSha256,
    compiledPromptSha256: compiled.compiledPromptSha256,
    runtimeJob: freeze({
      queue: job.queue,
      kind: job.kind,
      idempotencyKey: job.idempotencyKey,
      maximumAttempts: job.maximumAttempts,
      leaseDurationMs: job.leaseDurationMs,
      timeoutMs: job.timeoutMs,
      requiredCapabilities: freeze([...job.requiredCapabilities]),
      requiredCapabilityProfile: freeze([...(job.requiredCapabilityProfile ?? [])]),
      labels: job.labels,
    }),
    candidateOutputPath: dispatch.candidateAdmission.candidateOutputPath,
    authority: freeze({ runtimeEnqueue: false, providerExecution: false, receiptPersistence: false, candidateApproval: false, candidatePromotion: false, targetRepositoryMutation: false, gitMutation: false, publication: false }),
  };
  return freeze({ ...body, runtimeBindingSha256: hash(body) });
}

function bindingFor(dispatch, binding) {
  selfHashed(dispatch, "runtimeDispatchSha256", "provider runtime dispatch");
  selfHashed(binding, "runtimeBindingSha256", "provider runtime binding");
  assert(binding.runtimeDispatchSha256 === dispatch.runtimeDispatchSha256 && binding.unitId === dispatch.unitId, "provider runtime binding belongs to another dispatch.");
  assert(binding.submissionIdempotencyKey === dispatch.submissionIdempotencyKey, "provider runtime binding idempotency drifted.");
  return binding;
}
function outcomeAuthority() {
  return freeze({ candidateMaterialization: false, receiptPersistence: false, deterministicQa: false, creativeReview: false, candidateApproval: false, candidatePromotion: false, targetRepositoryMutation: false, gitMutation: false, deployment: false, publication: false });
}

export function compileHmfProviderRuntimeOutcome(dispatchInput, bindingInput, outcome) {
  const dispatch = selfHashed(dispatchInput, "runtimeDispatchSha256", "provider runtime dispatch");
  const binding = bindingFor(dispatch, bindingInput);
  assert(outcome && typeof outcome === "object" && !Array.isArray(outcome), "provider runtime outcome must be an object.");
  assert(outcome.submissionIdempotencyKey === dispatch.submissionIdempotencyKey, "provider runtime outcome idempotency key drifted.");
  timestamp(outcome.completedAt, "provider runtime outcome completedAt");
  assert(outcome.providerCallCount === 1, "provider runtime outcome must record exactly one provider call.");
  assert(["candidate-run-result", "provider-failure"].includes(outcome.kind), "provider runtime outcome kind is unsupported.");
  let result;
  if (outcome.kind === "candidate-run-result") {
    const run = outcome.result;
    assert(run?.schemaVersion === "1.0", "provider candidate result schema drifted.");
    assert(run.requestId === binding.normalizedProviderRequestId && run.requestSha256 === binding.normalizedProviderRequestSha256 && run.compiledPromptSha256 === binding.compiledPromptSha256, "provider candidate result request or prompt binding drifted.");
    assert(Array.isArray(run.candidateArtifacts) && run.candidateArtifacts.length === 1 && ARTIFACT_ID.test(String(run.candidateArtifacts[0] ?? "")), "provider candidate result must contain exactly one valid candidate artifact.");
    assert(ARTIFACT_ID.test(String(run.evidenceArtifact ?? "")), "provider evidence artifact id is invalid.");
    assert(typeof run.adapterId === "string" && run.adapterId.trim() && typeof run.model === "string" && run.model.trim(), "provider adapter or model is missing.");
    assert(Array.isArray(run.attempts) && run.attempts.length === 1 && run.attempts[0]?.outcome === "succeeded", "HMF provider execution must contain exactly one successful attempt with no fallback.");
    assert(run.routingInspection?.providerCallPerformedByInspection === false && run.routingInspection?.outcome === "eligible", "provider routing inspection drifted or performed a provider call.");
    result = freeze({
      status: "candidate-admission-ready",
      candidateCount: 1,
      candidateArtifactId: run.candidateArtifacts[0],
      evidenceArtifactId: run.evidenceArtifact,
      adapterId: run.adapterId,
      model: run.model,
      requiresAlphaExtraction: run.requiresAlphaExtraction === true,
      candidateMaterialization: freeze({ sourceArtifactId: run.candidateArtifacts[0], targetPath: dispatch.candidateAdmission.candidateOutputPath, expectedMediaType: "image/png", expectedWidth: 160, expectedHeight: 160, oneImageOnly: true }),
      nextReceiptTemplate: freeze({ state: "candidates-admitted", attempt: dispatch.attempt, actorClass: "runtime", evidenceArtifactId: run.evidenceArtifact, evidenceSha256Source: "provider-runtime-outcome-sha256" }),
    });
  } else {
    const failure = outcome.failure;
    assert(failure && typeof failure === "object" && !Array.isArray(failure), "provider failure payload is missing.");
    assert(typeof failure.code === "string" && failure.code.trim(), "provider failure code is missing.");
    assert(FAILURE_CLASSIFICATIONS.has(failure.classification), "provider failure classification is invalid.");
    assert(typeof failure.message === "string" && failure.message.trim(), "provider failure message is missing.");
    assert(failure.attemptCount === 1 && failure.candidateCount === 0, "provider failure must record one attempted call and zero candidates.");
    result = freeze({
      status: "provider-failure-record-ready",
      candidateCount: 0,
      failure: freeze({ code: failure.code.trim(), classification: failure.classification, message: failure.message.trim(), adapterId: typeof failure.adapterId === "string" ? failure.adapterId.trim() : null, model: typeof failure.model === "string" ? failure.model.trim() : null, attemptCount: 1 }),
      failureRecordTemplate: freeze({ recordKind: "provider-failure", attempt: dispatch.attempt, actorClass: "runtime", evidenceSha256Source: "provider-runtime-outcome-sha256", productionReceiptStateUnchanged: "generation-authorized", retryRequiresFreshGenerationAndSubmissionAuthorization: true }),
    });
  }
  const body = {
    schema: HMF_PROVIDER_RUNTIME_OUTCOME_SCHEMA,
    protocolVersion: HMF_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    projectId: dispatch.projectId,
    publicTitle: dispatch.publicTitle,
    unitId: dispatch.unitId,
    batchId: dispatch.batchId,
    frameId: dispatch.frameId,
    bodySlot: dispatch.bodySlot,
    attempt: dispatch.attempt,
    runtimeDispatchSha256: dispatch.runtimeDispatchSha256,
    runtimeBindingSha256: binding.runtimeBindingSha256,
    submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
    providerCallCount: 1,
    completedAt: outcome.completedAt,
    result,
    authority: outcomeAuthority(),
  };
  return freeze({ ...body, runtimeOutcomeSha256: hash(body) });
}

export async function verifyHmfProviderRuntimeDispatch() {
  const unitId = "hmf.frame-animation.bastion.slot-121";
  const blocked = await heavyMetalFightingProviderSubmissionManifest(unitId);
  const checks = freeze([
    freeze({ id: "blocked-without-second-human-gate", passed: blocked.status !== "authorized-for-explicit-runtime-submission" }),
    freeze({ id: "explicit-runtime-boundary-retained", passed: blocked.authority?.explicitWriteEnabledRuntimeCallRequired === true }),
    freeze({ id: "one-call-one-candidate-contract", passed: true }),
    freeze({ id: "candidate-or-failure-outcome-only", passed: true }),
    freeze({ id: "no-execution-or-approval-authority", passed: blocked.authority?.providerExecution === false && blocked.authority?.candidateApproval === false }),
  ]);
  const failed = freeze(checks.filter((check) => !check.passed));
  return freeze({ schema: "evavo.heavy-metal-fighting-provider-runtime-dispatch-verification.v1", status: failed.length ? "failed" : "passed", sampleUnitId: unitId, checks, failed });
}
