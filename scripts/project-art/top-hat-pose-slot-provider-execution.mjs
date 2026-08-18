import path from 'node:path';
import { lstat, mkdir } from 'node:fs/promises';
import process from 'node:process';

import { LocalArtifactStore } from '../../packages/artifacts/dist/index.js';
import {
  compileProviderCandidateRuntimeContract,
  compileProviderExecutionRoutingPlan,
  providerRequestSha256,
  validateProviderCandidateRequest,
} from '../../packages/providers/dist/index.js';
import {
  LocalRuntimeRepository,
  RuntimeWorker,
  normalizeRuntimeJobSubmission,
} from '../../packages/runtime/dist/index.js';
import {
  createProviderHandlers,
  createProviderRegistryFromEnvironment,
  providerWorkerCapabilities,
  providerWorkerCapabilityProfiles,
  restrictProviderRegistry,
} from '../../apps/worker/dist/provider-handlers.js';
import {
  compileProjectArtTopHatPoseSlotProviderRuntimeDispatch,
  parseProjectArtTopHatPoseSlotProviderRuntimeAdapter,
} from './top-hat-pose-slot-provider-runtime-adapter.mjs';
import {
  validateAvatarFinalPassCompiledProviderRuntimeContract,
} from './avatar-final-pass-provider-runtime-binding.mjs';
import {
  compileAvatarFinalPassProviderRuntimeOutcome,
} from './avatar-final-pass-provider-runtime-outcome.mjs';
import {
  canonicalJson,
  deepFreeze,
  identifier,
  sha256Document,
  timestamp,
  assert,
} from './avatar-final-pass-provider-runtime-common.mjs';

export const TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-provider-execution.v1';
export const TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_PROTOCOL_VERSION =
  '2026-08-18.1';
export const TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_CAPABILITY =
  'top-hat-pose.execution-authorized';

function executionAuthority() {
  return Object.freeze({
    providerExecution: false,
    runtimeSubmission: false,
    runtimeRedrive: false,
    candidateMaterialization: false,
    candidateApproval: false,
    candidatePromotion: false,
    poseSlotFilling: false,
    sequenceRelease: false,
    repositoryMutation: false,
    publication: false,
    deployment: false,
    runtimeActivation: false,
    forcePush: false,
  });
}

function executionEffects(providerCallPerformed) {
  return Object.freeze({
    providerCallPerformed,
    providerCallCount: providerCallPerformed ? 1 : 0,
    candidateStoredInArtifactStore: providerCallPerformed,
    candidateMaterializedToScratchPath: false,
    candidateApproved: false,
    candidatePromoted: false,
    poseSlotFilled: false,
    runtimeActivated: false,
    repositoryMutated: false,
    published: false,
  });
}

function absoluteDirectory(value, label) {
  assert(typeof value === 'string' && value.length > 0, 'TOP_HAT_PROVIDER_EXECUTION_PATH_INVALID');
  const resolved = path.resolve(value);
  assert(resolved === value, 'TOP_HAT_PROVIDER_EXECUTION_PATH_INVALID', `${label} must be absolute and normalized.`);
  return resolved;
}

async function ensureDirectory(value, label) {
  const resolved = absoluteDirectory(value, label);
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const state = await lstat(resolved);
  assert(state.isDirectory() && !state.isSymbolicLink(), 'TOP_HAT_PROVIDER_EXECUTION_PATH_INVALID', `${label} must be a real directory.`);
  return resolved;
}

function exactAdapterAllowlist(request) {
  const values = request.selection?.allowedAdapterIds;
  assert(Array.isArray(values) && values.length >= 1 && values.length <= 16, 'TOP_HAT_PROVIDER_EXECUTION_ADAPTER_ALLOWLIST_INVALID');
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const id = identifier(value, 'allowedAdapterId');
    assert(!seen.has(id), 'TOP_HAT_PROVIDER_EXECUTION_ADAPTER_ALLOWLIST_INVALID');
    seen.add(id);
    result.push(id);
  }
  assert(request.selection.allowFallback === false, 'TOP_HAT_PROVIDER_EXECUTION_FALLBACK_FORBIDDEN');
  if (request.selection.preferredAdapterId !== undefined) {
    assert(seen.has(request.selection.preferredAdapterId), 'TOP_HAT_PROVIDER_EXECUTION_PREFERRED_ADAPTER_INVALID');
  }
  return Object.freeze(result);
}

function activeTopHatAuthorization(request, now = new Date()) {
  const authorization = request.metadata?.topHatPoseSlot?.authorization;
  assert(authorization && authorization.actorClass === 'human', 'TOP_HAT_PROVIDER_EXECUTION_AUTHORIZATION_INVALID');
  assert(authorization.maximumProviderCalls === 1, 'TOP_HAT_PROVIDER_EXECUTION_AUTHORIZATION_INVALID');
  timestamp(authorization.occurredAt, 'authorization.occurredAt');
  timestamp(authorization.expiresAt, 'authorization.expiresAt');
  const milliseconds = now.getTime();
  assert(
    milliseconds >= Date.parse(authorization.occurredAt) &&
      milliseconds < Date.parse(authorization.expiresAt),
    'TOP_HAT_PROVIDER_EXECUTION_AUTHORIZATION_EXPIRED',
  );
  return authorization;
}

function isolatedRuntimeJob(compiled, dispatch) {
  const source = compiled.runtimeJob;
  return Object.freeze({
    ...source,
    queue: `top-hat-pose.provider.${dispatch.runtimeDispatchSha256.slice(0, 20)}`,
    idempotencyKey: dispatch.submissionIdempotencyKey,
    maximumAttempts: 1,
    requiredCapabilities: Object.freeze([
      ...new Set([
        ...(source.requiredCapabilities ?? []),
        TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_CAPABILITY,
      ]),
    ].sort()),
    labels: Object.freeze({
      ...(source.labels ?? {}),
      topHatPoseExecutionMode: 'single-authorized-call',
      topHatPoseSlotId: dispatch.frameId,
      topHatPoseRuntimeDispatchSha256: dispatch.runtimeDispatchSha256,
      topHatPoseRuntimeBindingSha256: validateAvatarFinalPassCompiledProviderRuntimeContract(
        dispatch,
        compiled,
      ).runtimeBindingSha256,
    }),
  });
}

async function verifyInputReferences(request, artifacts) {
  const verified = [];
  for (const reference of request.references ?? []) {
    const verification = await artifacts.verify(reference.artifactId);
    assert(verification?.exists === true && verification.descriptorValid === true && verification.contentValid === true, 'TOP_HAT_PROVIDER_EXECUTION_REFERENCE_ARTIFACT_INVALID', `Reference artifact failed verification: ${reference.artifactId}`);
    const descriptor = await artifacts.get(reference.artifactId);
    assert(descriptor, 'TOP_HAT_PROVIDER_EXECUTION_REFERENCE_ARTIFACT_INVALID', `Reference artifact is missing: ${reference.artifactId}`);
    verified.push(Object.freeze({
      artifactId: reference.artifactId,
      role: reference.role,
      contentHash: descriptor.contentHash,
      mediaType: descriptor.mediaType,
    }));
  }
  assert(verified.length === 3, 'TOP_HAT_PROVIDER_EXECUTION_REFERENCE_ARTIFACT_INVALID');
  return Object.freeze(verified);
}

async function verifyOutputArtifacts(result, completed, artifacts) {
  assert(Array.isArray(result.candidateArtifacts) && result.candidateArtifacts.length === 1, 'TOP_HAT_PROVIDER_EXECUTION_CANDIDATE_COUNT_INVALID');
  assert(typeof result.evidenceArtifact === 'string' && result.evidenceArtifact.length > 0, 'TOP_HAT_PROVIDER_EXECUTION_EVIDENCE_INVALID');
  const expected = [result.candidateArtifacts[0], result.evidenceArtifact].sort();
  const actual = [...completed.outputArtifacts].sort();
  assert(canonicalJson(actual) === canonicalJson(expected), 'TOP_HAT_PROVIDER_EXECUTION_OUTPUT_ARTIFACT_MISMATCH');

  const records = [];
  for (const artifactId of expected) {
    const verification = await artifacts.verify(artifactId);
    assert(verification?.exists === true && verification.descriptorValid === true && verification.contentValid === true, 'TOP_HAT_PROVIDER_EXECUTION_OUTPUT_ARTIFACT_INVALID', `Output artifact failed verification: ${artifactId}`);
    const descriptor = await artifacts.get(artifactId);
    assert(descriptor, 'TOP_HAT_PROVIDER_EXECUTION_OUTPUT_ARTIFACT_INVALID', `Output artifact is missing: ${artifactId}`);
    if (artifactId === result.candidateArtifacts[0]) {
      assert(
        descriptor.mediaType === 'image/png' &&
          descriptor.storageClass === 'intermediate' &&
          descriptor.labels?.artifactRole === 'provider-candidate' &&
          descriptor.labels?.approvalState === 'unapproved' &&
          descriptor.metadata?.finalDeliverable === false,
        'TOP_HAT_PROVIDER_EXECUTION_CANDIDATE_AUTHORITY_INVALID',
      );
    }
    records.push(Object.freeze({
      artifactId,
      contentHash: descriptor.contentHash,
      mediaType: descriptor.mediaType,
      storageClass: descriptor.storageClass,
      artifactRole: descriptor.labels?.artifactRole ?? null,
      approvalState: descriptor.labels?.approvalState ?? null,
    }));
  }
  return Object.freeze(records);
}

export async function executeTopHatPoseSlotProvider({
  adapter,
  slotId,
  runtimeRoot,
  artifactRoot,
  workerId = 'top-hat-pose-provider-worker',
  compiledAt = new Date().toISOString(),
  environment = process.env,
}) {
  const parsedAdapter = parseProjectArtTopHatPoseSlotProviderRuntimeAdapter(adapter);
  const selectedSlotId = identifier(slotId, 'slotId');
  timestamp(compiledAt, 'compiledAt');
  const dispatch = compileProjectArtTopHatPoseSlotProviderRuntimeDispatch({
    adapter: parsedAdapter,
    slotId: selectedSlotId,
    compiledAt,
  });
  const compiled = compileProviderCandidateRuntimeContract(
    dispatch.providerCompiler.input,
  );
  const binding = validateAvatarFinalPassCompiledProviderRuntimeContract(
    dispatch,
    compiled,
  );
  const request = validateProviderCandidateRequest(compiled.request);
  assert(
    providerRequestSha256(request) === binding.normalizedProviderRequestSha256,
    'TOP_HAT_PROVIDER_EXECUTION_REQUEST_HASH_MISMATCH',
  );
  const authorization = activeTopHatAuthorization(request);
  assert(
    request.metadata.topHatPoseSlot.slotId === selectedSlotId,
    'TOP_HAT_PROVIDER_EXECUTION_SLOT_MISMATCH',
  );
  const allowedAdapterIds = exactAdapterAllowlist(request);

  const normalizedRuntimeRoot = await ensureDirectory(runtimeRoot, 'runtimeRoot');
  const normalizedArtifactRoot = await ensureDirectory(artifactRoot, 'artifactRoot');
  assert(normalizedRuntimeRoot !== normalizedArtifactRoot, 'TOP_HAT_PROVIDER_EXECUTION_ROOT_COLLISION');

  const runtime = new LocalRuntimeRepository({ root: normalizedRuntimeRoot });
  const artifacts = new LocalArtifactStore({ root: normalizedArtifactRoot });
  const inputArtifacts = await verifyInputReferences(request, artifacts);

  const baseRegistry = createProviderRegistryFromEnvironment(environment);
  const providerRegistry = restrictProviderRegistry(baseRegistry, allowedAdapterIds);
  const routing = compileProviderExecutionRoutingPlan(request, providerRegistry.rank(request));
  assert(
    routing.outcome === 'eligible' &&
      routing.fallbackAllowed === false &&
      routing.providerCallPerformedByInspection === false &&
      routing.eligibleAdapters.length >= 1,
    'TOP_HAT_PROVIDER_EXECUTION_ROUTING_INVALID',
  );

  const runtimeJob = isolatedRuntimeJob(compiled, dispatch);
  const normalized = normalizeRuntimeJobSubmission(runtimeJob);
  const submitted = await runtime.submitBatch(
    [runtimeJob],
    `top-hat-pose:${authorization.actorId}`,
    new Date(compiledAt),
  );
  assert(Array.isArray(submitted) && submitted.length === 1, 'TOP_HAT_PROVIDER_EXECUTION_RUNTIME_SUBMISSION_INVALID');
  const admitted = submitted[0];
  assert(
    admitted.id === normalized.spec.id &&
      admitted.specHash === normalized.specHash &&
      canonicalJson(admitted.spec) === canonicalJson(normalized.spec) &&
      admitted.spec.maximumAttempts === 1 &&
      admitted.attempts.length === 0 &&
      admitted.state === 'queued',
    'TOP_HAT_PROVIDER_EXECUTION_RUNTIME_SUBMISSION_INVALID',
  );

  let capturedResult = null;
  let handlerInvocations = 0;
  const rawHandlers = createProviderHandlers(providerRegistry);
  const handlers = Object.fromEntries(
    Object.entries(rawHandlers).map(([kind, handler]) => [kind, async (context) => {
      activeTopHatAuthorization(request);
      assert(handlerInvocations === 0, 'TOP_HAT_PROVIDER_EXECUTION_MULTIPLE_PROVIDER_CALLS');
      assert(
        context.job.id === admitted.id &&
          context.job.specHash === admitted.specHash &&
          context.job.spec.maximumAttempts === 1 &&
          context.job.spec.queue === admitted.spec.queue &&
          context.job.spec.requiredCapabilities.includes(TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_CAPABILITY) &&
          providerRequestSha256(validateProviderCandidateRequest(context.job.spec.payload)) === binding.normalizedProviderRequestSha256,
        'TOP_HAT_PROVIDER_EXECUTION_WORKER_CLAIM_INVALID',
      );
      handlerInvocations += 1;
      const response = await handler(context);
      capturedResult = response?.result ?? null;
      return response;
    }]),
  );

  const executorId = identifier(workerId, 'workerId');
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: executorId,
      capabilities: Object.freeze([
        ...new Set([
          ...providerWorkerCapabilities(providerRegistry),
          TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_CAPABILITY,
        ]),
      ].sort()),
      capabilityProfiles: providerWorkerCapabilityProfiles(providerRegistry),
      queues: Object.freeze([admitted.spec.queue]),
    },
    handlers,
    concurrency: 1,
  });

  const runResult = await worker.runUntilIdle();
  const completed = await runtime.get(admitted.id);
  assert(completed && completed.specHash === admitted.specHash, 'TOP_HAT_PROVIDER_EXECUTION_RUNTIME_COMPLETION_INVALID');
  assert(handlerInvocations <= 1 && completed.attempts.length <= 1, 'TOP_HAT_PROVIDER_EXECUTION_MULTIPLE_PROVIDER_CALLS');

  if (completed.state !== 'succeeded') {
    const body = {
      schema: TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_SCHEMA,
      protocolVersion: TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_PROTOCOL_VERSION,
      status: 'provider-failed-review-required',
      slotId: selectedSlotId,
      completedAt: completed.finishedAt ?? new Date().toISOString(),
      sourceAdapterSha256: parsedAdapter.adapterSha256,
      runtimeDispatchSha256: dispatch.runtimeDispatchSha256,
      runtimeBindingSha256: binding.runtimeBindingSha256,
      runtime: Object.freeze({
        jobId: completed.id,
        specSha256: completed.specHash,
        state: completed.state,
        attempts: completed.attempts.length,
        maximumAttempts: completed.spec.maximumAttempts,
        queue: completed.spec.queue,
        failure: completed.failure ?? null,
      }),
      worker: Object.freeze({ id: executorId, runResult }),
      effects: executionEffects(handlerInvocations === 1),
      authority: executionAuthority(),
      requiredNextStep: 'fresh-human-run-provider-once-authorization-before-any-retry',
    };
    return deepFreeze({
      ...body,
      executionSha256: sha256Document(body),
    });
  }

  assert(handlerInvocations === 1 && completed.attempts.length === 1, 'TOP_HAT_PROVIDER_EXECUTION_PROVIDER_CALL_COUNT_INVALID');
  assert(capturedResult && typeof capturedResult === 'object', 'TOP_HAT_PROVIDER_EXECUTION_RESULT_MISSING');
  const outputArtifacts = await verifyOutputArtifacts(capturedResult, completed, artifacts);
  const completedAt = completed.finishedAt ?? new Date().toISOString();
  const runtimeOutcome = compileAvatarFinalPassProviderRuntimeOutcome(
    dispatch,
    binding,
    {
      kind: 'candidate-run-result',
      submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
      providerCallCount: 1,
      completedAt,
      result: capturedResult,
    },
  );
  assert(
    runtimeOutcome.result.status === 'candidate-materialization-required' &&
      runtimeOutcome.result.materializationRequest.createOnly === true &&
      runtimeOutcome.result.approvals.runtime === false &&
      runtimeOutcome.result.approvals.publication === false,
    'TOP_HAT_PROVIDER_EXECUTION_OUTCOME_AUTHORITY_INVALID',
  );

  const body = {
    schema: TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_SCHEMA,
    protocolVersion: TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_PROTOCOL_VERSION,
    status: 'candidate-generated-review-required',
    slotId: selectedSlotId,
    completedAt,
    sourceAdapterSha256: parsedAdapter.adapterSha256,
    sourceProviderPackageSha256: parsedAdapter.sourceProviderPackageSha256,
    productionPlanSha256: parsedAdapter.productionPlanSha256,
    runtimeDispatch: dispatch,
    runtimeBinding: binding,
    providerRuntimeOutcome: runtimeOutcome,
    runtime: Object.freeze({
      jobId: completed.id,
      specSha256: completed.specHash,
      state: completed.state,
      attempts: completed.attempts.length,
      maximumAttempts: completed.spec.maximumAttempts,
      queue: completed.spec.queue,
      automaticRetry: false,
    }),
    provider: Object.freeze({
      allowedAdapterIds,
      fallbackAllowed: false,
      providerCallCount: 1,
      candidateCount: 1,
      adapterId: capturedResult.adapterId,
      model: capturedResult.model,
    }),
    worker: Object.freeze({ id: executorId, runResult }),
    inputArtifacts,
    outputArtifacts,
    effects: executionEffects(true),
    authority: executionAuthority(),
    requiredNextSteps: Object.freeze([
      'materialize-candidate-create-only',
      ...(runtimeOutcome.result.requiresAlphaExtraction
        ? ['perform-governed-alpha-extraction']
        : []),
      'rerun-avatar-frame-finisher',
      'independent-art-anatomy-identity-continuity-review',
      'named-human-candidate-admission',
      'six-slot-release-review-after-all-slots-pass',
    ]),
  };
  return deepFreeze({
    ...body,
    executionSha256: sha256Document(body),
  });
}

export function projectArtTopHatPoseSlotProviderExecutionCapabilities() {
  return Object.freeze({
    schema: 'evavo.project-art-top-hat-pose-slot-provider-execution-capabilities.v1',
    protocolVersion: TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_PROTOCOL_VERSION,
    perSlotExecutionOnly: true,
    exactExistingAdapterRequired: true,
    sourceNamedHumanAuthorizationRequired: true,
    sourceAuthorizationMustBeActiveAtCallTime: true,
    maximumProviderCalls: 1,
    maximumRuntimeAttempts: 1,
    fallbackAllowed: false,
    exactAdapterAllowlistRequired: true,
    durableRuntimeUsed: true,
    immutableArtifactStoreUsed: true,
    genericRuntimeBindingReused: true,
    genericRuntimeOutcomeReused: true,
    candidateMaterialization: false,
    candidateApproval: false,
    poseSlotFilling: false,
    sequenceRelease: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}
