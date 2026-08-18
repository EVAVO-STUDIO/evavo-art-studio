import path from 'node:path';
import { lstat, mkdir } from 'node:fs/promises';

import { LocalArtifactStore } from '../../packages/artifacts/dist/index.js';
import {
  PROVIDER_PROTOCOL_VERSION,
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
  compileAvatarFinalPassProviderRuntimeOutcome,
  validateAvatarFinalPassCompiledProviderRuntimeContract,
} from './avatar-final-pass-provider-runtime-dispatch.mjs';
import {
  GENERIC_PROVIDER_PROTOCOL_VERSION,
} from './avatar-final-pass-provider-runtime-constants.mjs';
import {
  compileProjectArtTopHatPoseSlotProviderRuntimeDispatch,
  parseProjectArtTopHatPoseSlotProviderRuntimeAdapter,
} from './top-hat-pose-slot-provider-runtime-adapter.mjs';
import {
  artifactId,
  assert,
  boundedText,
  deepFreeze,
  digest,
  identifier,
  isRecord,
  sha256Document,
  sha256Text,
  timestamp,
} from './avatar-final-pass-provider-runtime-common.mjs';

export const TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-provider-execution.v1';
export const TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_PROTOCOL_VERSION =
  '2026-08-19.1';
export const TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_CAPABILITY =
  'top-hat-pose.execution-authorized';

function normalizedAbsolutePath(value, label) {
  assert(
    typeof value === 'string' && value.length >= 1 && !value.includes('\0'),
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_PATH_INVALID',
    `${label} is invalid.`,
  );
  const resolved = path.resolve(value);
  assert(
    resolved === value,
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_PATH_INVALID',
    `${label} must be absolute and normalized.`,
  );
  return resolved;
}

async function realDirectory(value, label, create = false) {
  const root = normalizedAbsolutePath(value, label);
  if (create) await mkdir(root, { recursive: true, mode: 0o700 });
  const state = await lstat(root);
  assert(
    state.isDirectory() && !state.isSymbolicLink(),
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_PATH_INVALID',
    `${label} must be a real directory.`,
  );
  return root;
}

function executionAuthority() {
  return Object.freeze({
    providerExecution: false,
    runtimeSubmission: false,
    runtimeRedrive: false,
    candidateMaterialization: false,
    deterministicQa: false,
    creativeReview: false,
    candidateApproval: false,
    candidatePromotion: false,
    poseSlotFilling: false,
    sequenceRelease: false,
    targetRepositoryMutation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}

function sourceAuthorization(dispatch, now) {
  const metadata = dispatch.providerCompiler.input?.metadata?.topHatPoseSlot;
  assert(
    isRecord(metadata) &&
      metadata.guardedDispatchRequired === true &&
      metadata.slotId === dispatch.frameId &&
      isRecord(metadata.authorization) &&
      metadata.authorization.actorClass === 'human' &&
      metadata.authorization.maximumProviderCalls === 1,
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_AUTHORIZATION_INVALID',
  );
  const occurredAt = timestamp(
    metadata.authorization.occurredAt,
    'topHatPoseSlot.authorization.occurredAt',
  );
  const expiresAt = timestamp(
    metadata.authorization.expiresAt,
    'topHatPoseSlot.authorization.expiresAt',
  );
  const current = now.getTime();
  assert(
    Number.isFinite(current) &&
      current >= Date.parse(occurredAt) &&
      current < Date.parse(expiresAt),
    'TOP_HAT_PROVIDER_RUNTIME_AUTHORIZATION_EXPIRED',
    `${dispatch.frameId} provider authorization is not active.`,
  );
  return Object.freeze({
    actorClass: 'human',
    actorId: boundedText(
      metadata.authorization.actorId,
      'topHatPoseSlot.authorization.actorId',
      1,
      256,
    ),
    occurredAt,
    expiresAt,
    evidenceSha256: digest(
      metadata.authorization.evidenceSha256,
      'topHatPoseSlot.authorization.evidenceSha256',
    ),
    maximumProviderCalls: 1,
  });
}

function authorizationReservationKey(dispatch, authorization) {
  return sha256Text(
    `${dispatch.providerCompiler.input.metadata.topHatPoseSlot.providerPackageSha256}\0${dispatch.frameId}\0${authorization.evidenceSha256}`,
  );
}

function oneShotQueue(dispatch, authorization) {
  return `top-hat-pose.provider.${authorizationReservationKey(dispatch, authorization).slice(0, 20)}`;
}

function oneShotRuntimeJob(compiled, dispatch, authorization) {
  const source = compiled.runtimeJob;
  const reservationKey = authorizationReservationKey(dispatch, authorization);
  const queue = oneShotQueue(dispatch, authorization);
  return Object.freeze({
    ...source,
    queue,
    idempotencyKey: `top-hat-pose-once:${reservationKey}`,
    maximumAttempts: 1,
    requiredCapabilities: Object.freeze(
      [...new Set([
        ...source.requiredCapabilities,
        TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_CAPABILITY,
      ])].sort(),
    ),
    labels: Object.freeze({
      ...source.labels,
      topHatPoseExecution: 'one-shot-v1',
      topHatPoseSlotId: dispatch.frameId,
      topHatRuntimeDispatchSha256: dispatch.runtimeDispatchSha256,
      topHatSubmissionIdempotencyKey: dispatch.submissionIdempotencyKey,
      topHatAuthorizationEvidenceSha256: authorization.evidenceSha256,
      topHatAuthorizationReservationSha256: reservationKey,
    }),
  });
}

function mapFailureClassification(value) {
  if (['transient', 'permanent', 'incompatible', 'cancelled'].includes(value)) {
    return value;
  }
  if (['timeout', 'deadline-exceeded', 'lease-expired'].includes(value)) {
    return 'transient';
  }
  return 'permanent';
}

async function verifiedArtifactSummary(artifacts, artifactId, role) {
  const verification = await artifacts.verify(artifactId);
  assert(
    verification.descriptorValid === true && verification.contentValid === true,
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_ARTIFACT_INVALID',
    `${role} artifact failed immutable verification.`,
  );
  const descriptor = await artifacts.get(artifactId);
  assert(
    descriptor,
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_ARTIFACT_INVALID',
    `${role} artifact descriptor is missing.`,
  );
  if (role === 'candidate') {
    assert(
      descriptor.storageClass === 'intermediate' &&
        descriptor.labels.artifactRole === 'provider-candidate' &&
        descriptor.labels.approvalState === 'unapproved' &&
        descriptor.metadata?.finalDeliverable === false,
      'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_CANDIDATE_ESCALATED',
      'Provider candidate crossed its unapproved intermediate boundary.',
    );
  } else {
    assert(
      descriptor.storageClass === 'evidence',
      'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_ARTIFACT_INVALID',
      'Provider evidence must remain evidence storage.',
    );
  }
  return Object.freeze({
    artifactId,
    contentHash: descriptor.contentHash,
    mediaType: descriptor.mediaType,
    storageClass: descriptor.storageClass,
    artifactRole: descriptor.labels.artifactRole ?? null,
    approvalState: descriptor.labels.approvalState ?? null,
  });
}

async function preflightProviderReferences(artifacts, request, selectedAdapter) {
  let totalBytes = 0;
  const summaries = [];
  for (const [index, reference] of request.references.entries()) {
    const descriptor = await artifacts.get(reference.artifactId);
    if (!descriptor) {
      assert(
        reference.required !== true,
        'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_REFERENCE_MISSING',
        `Required provider reference ${index} is missing from artifactRoot.`,
      );
      continue;
    }
    const verification = await artifacts.verify(reference.artifactId);
    assert(
      verification.descriptorValid === true && verification.contentValid === true,
      'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_REFERENCE_INVALID',
      `Provider reference ${index} failed immutable artifact verification.`,
    );
    assert(
      descriptor.mediaType.startsWith('image/'),
      'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_REFERENCE_INVALID',
      `Provider reference ${index} is not an image artifact.`,
    );
    assert(
      descriptor.sizeBytes <= 32 * 1024 * 1024 &&
        descriptor.sizeBytes <= selectedAdapter.maximumSourceBytes,
      'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_REFERENCE_TOO_LARGE',
      `Provider reference ${index} exceeds the admitted provider source limit.`,
    );
    totalBytes += descriptor.sizeBytes;
    assert(
      totalBytes <= 128 * 1024 * 1024,
      'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_REFERENCES_TOO_LARGE',
      'Provider references exceed the aggregate source limit.',
    );
    summaries.push(Object.freeze({
      artifactId: reference.artifactId,
      role: reference.role,
      contentHash: descriptor.contentHash,
      mediaType: descriptor.mediaType,
      sizeBytes: descriptor.sizeBytes,
      required: reference.required,
    }));
  }
  return Object.freeze(summaries);
}

function providerFailureAttempt(completed) {
  const details = completed.failure?.details;
  if (!isRecord(details) || !Array.isArray(details.attempts)) {
    return Object.freeze({ verified: false, providerCallCount: null });
  }
  if (details.attempts.length !== 1 || !isRecord(details.attempts[0])) {
    return Object.freeze({ verified: false, providerCallCount: null });
  }
  const attempt = details.attempts[0];
  const classification = mapFailureClassification(
    attempt.classification ?? completed.failure?.classification,
  );
  const evidenceArtifactId =
    typeof details.evidenceArtifactId === 'string'
      ? artifactId(details.evidenceArtifactId, 'provider failure evidenceArtifactId')
      : null;
  return Object.freeze({
    verified: true,
    providerCallCount: 1,
    adapterId: boundedText(attempt.adapterId, 'provider failure adapterId', 1, 128),
    model:
      typeof attempt.model === 'string'
        ? boundedText(attempt.model, 'provider failure model', 1, 256)
        : null,
    classification,
    code: boundedText(
      String(attempt.code ?? completed.failure?.code ?? 'PROVIDER_EXECUTION_FAILED'),
      'provider failure code',
      1,
      256,
    ),
    message: boundedText(
      String(attempt.message ?? completed.failure?.message ?? 'Provider execution failed.'),
      'provider failure message',
      1,
      4096,
    ),
    evidenceArtifactId,
  });
}

function runtimeFailureOutcome(dispatch, completed, completedAt, attempt) {
  assert(
    attempt?.verified === true && attempt.providerCallCount === 1,
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_FAILURE_ATTEMPT_UNVERIFIED',
  );
  return Object.freeze({
    kind: 'provider-failure',
    submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
    providerCallCount: 1,
    completedAt,
    failure: Object.freeze({
      code: attempt.code,
      classification: attempt.classification,
      message: attempt.message,
      adapterId: attempt.adapterId,
      model: attempt.model,
      attemptCount: 1,
      candidateCount: 0,
    }),
  });
}

export async function executeTopHatPoseSlotProvider({
  adapter: adapterInput,
  slotId,
  runtimeRoot: runtimeRootInput,
  artifactRoot: artifactRootInput,
  workerId = 'top-hat-pose-provider-worker',
  environment = process.env,
}) {
  const adapter = parseProjectArtTopHatPoseSlotProviderRuntimeAdapter(adapterInput);
  const selectedSlotId = identifier(slotId, 'slotId');
  const now = new Date();
  const compiledAt = now.toISOString();
  const dispatch = compileProjectArtTopHatPoseSlotProviderRuntimeDispatch({
    adapter,
    slotId: selectedSlotId,
    compiledAt,
  });
  const authorization = sourceAuthorization(dispatch, now);

  const runtimeRoot = await realDirectory(runtimeRootInput, 'runtimeRoot', true);
  const artifactRoot = await realDirectory(artifactRootInput, 'artifactRoot', true);
  assert(
    runtimeRoot !== artifactRoot,
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_PATH_INVALID',
    'runtimeRoot and artifactRoot must be separate directories.',
  );

  assert(
    PROVIDER_PROTOCOL_VERSION === GENERIC_PROVIDER_PROTOCOL_VERSION,
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_PROTOCOL_DRIFT',
    `Avatar provider bridge ${GENERIC_PROVIDER_PROTOCOL_VERSION} does not match provider runtime ${PROVIDER_PROTOCOL_VERSION}.`,
  );
  const compiled = compileProviderCandidateRuntimeContract(
    dispatch.providerCompiler.input,
  );
  const binding = validateAvatarFinalPassCompiledProviderRuntimeContract(
    dispatch,
    compiled,
  );
  const request = validateProviderCandidateRequest(compiled.request);
  assert(
    providerRequestSha256(request) === binding.normalizedProviderRequestSha256 &&
      request.selection.allowFallback === false,
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_REQUEST_MISMATCH',
  );

  const allowedAdapterIds = Object.freeze([
    ...request.selection.allowedAdapterIds,
  ]);
  assert(
    allowedAdapterIds.length >= 1,
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_ADAPTERS_INVALID',
    'Top Hat provider execution requires at least one exact allowed adapter.',
  );
  const baseRegistry = createProviderRegistryFromEnvironment(environment);
  const providerRegistry = restrictProviderRegistry(baseRegistry, allowedAdapterIds);
  const routing = compileProviderExecutionRoutingPlan(
    request,
    providerRegistry.rank(request),
  );
  assert(
    routing.eligibleAdapters.length >= 1 &&
      routing.inspection.fallbackAllowed === false &&
      routing.inspection.providerCallPerformedByInspection === false,
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_ROUTING_INVALID',
  );
  const selectedAdapter = routing.eligibleAdapters[0].adapter.descriptor;
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  const artifacts = new LocalArtifactStore({ root: artifactRoot });
  const referencePreflight = await preflightProviderReferences(
    artifacts,
    request,
    selectedAdapter,
  );

  const runtimeJob = oneShotRuntimeJob(compiled, dispatch, authorization);
  const normalized = normalizeRuntimeJobSubmission(runtimeJob);
  assert(
    normalized.spec.maximumAttempts === 1 &&
      normalized.spec.queue === oneShotQueue(dispatch, authorization) &&
      normalized.spec.requiredCapabilities.includes(
        TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_CAPABILITY,
      ),
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_JOB_INVALID',
  );

  const existing = await runtime.get(normalized.spec.id);
  assert(
    existing === null,
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_AUTHORIZATION_ALREADY_RESERVED',
    `${selectedSlotId} run-once authorization is already reserved in this runtime root.`,
  );
  const submitted = await runtime.submitBatch(
    [runtimeJob],
    `top-hat-pose:${authorization.actorId}`,
    now,
  );
  assert(
    submitted.length === 1 &&
      submitted[0].id === normalized.spec.id &&
      submitted[0].specHash === normalized.specHash &&
      submitted[0].state === 'queued',
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_SUBMISSION_INVALID',
  );

  let providerRunResult = null;
  const providerHandlers = createProviderHandlers(providerRegistry);
  const providerHandler = providerHandlers[normalized.spec.kind];
  assert(
    typeof providerHandler === 'function',
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_HANDLER_MISSING',
  );
  const handlers = Object.freeze({
    [normalized.spec.kind]: async (context) => {
      sourceAuthorization(dispatch, new Date());
      assert(
        context.job.id === normalized.spec.id &&
          context.job.specHash === normalized.specHash &&
          context.job.spec.maximumAttempts === 1 &&
          context.job.spec.queue === normalized.spec.queue &&
          context.job.spec.requiredCapabilities.includes(
            TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_CAPABILITY,
          ) &&
          providerRequestSha256(
            validateProviderCandidateRequest(context.job.spec.payload),
          ) === binding.normalizedProviderRequestSha256,
        'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_CLAIM_INVALID',
      );
      const result = await providerHandler(context);
      providerRunResult = result?.result ?? null;
      return result;
    },
  });

  const resolvedWorkerId = identifier(workerId, 'workerId');
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: resolvedWorkerId,
      capabilities: Object.freeze(
        [...new Set([
          ...providerWorkerCapabilities(providerRegistry),
          TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_CAPABILITY,
        ])].sort(),
      ),
      capabilityProfiles: providerWorkerCapabilityProfiles(providerRegistry),
      queues: Object.freeze([normalized.spec.queue]),
    },
    handlers,
    concurrency: 1,
  });
  const workerResult = await worker.runUntilIdle();
  const completed = await runtime.get(normalized.spec.id);
  assert(
    completed &&
      completed.specHash === normalized.specHash &&
      ['succeeded', 'failed', 'dead-letter', 'cancelled'].includes(completed.state) &&
      completed.attempts.length === 1,
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_COMPLETION_INVALID',
  );
  assert(
    workerResult.claimed === 1 &&
      workerResult.succeeded +
        workerResult.failed +
        workerResult.cancelled +
        workerResult.paused ===
        1,
    'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_WORKER_INVALID',
  );

  const completedAt = new Date().toISOString();
  let outcome = null;
  let candidateArtifact = null;
  let evidenceArtifact = null;
  let failureEvidenceArtifact = null;
  let providerCallCount = null;
  let providerCallCountVerified = false;
  let failureAttempt = null;
  if (completed.state === 'succeeded') {
    assert(
      isRecord(providerRunResult),
      'TOP_HAT_PROVIDER_RUNTIME_EXECUTION_RESULT_MISSING',
    );
    const outcomeInput = Object.freeze({
      kind: 'candidate-run-result',
      submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
      providerCallCount: 1,
      completedAt,
      result: providerRunResult,
    });
    candidateArtifact = await verifiedArtifactSummary(
      artifacts,
      providerRunResult.candidateArtifacts[0],
      'candidate',
    );
    evidenceArtifact = await verifiedArtifactSummary(
      artifacts,
      providerRunResult.evidenceArtifact,
      'evidence',
    );
    outcome = compileAvatarFinalPassProviderRuntimeOutcome(
      dispatch,
      binding,
      outcomeInput,
    );
    providerCallCount = 1;
    providerCallCountVerified = true;
  } else {
    failureAttempt = providerFailureAttempt(completed);
    providerCallCount = failureAttempt.providerCallCount;
    providerCallCountVerified = failureAttempt.verified;
    if (failureAttempt.evidenceArtifactId) {
      failureEvidenceArtifact = await verifiedArtifactSummary(
        artifacts,
        failureAttempt.evidenceArtifactId,
        'evidence',
      );
    }
    if (failureAttempt.verified) {
      outcome = compileAvatarFinalPassProviderRuntimeOutcome(
        dispatch,
        binding,
        runtimeFailureOutcome(dispatch, completed, completedAt, failureAttempt),
      );
    }
  }

  const receiptBody = {
    schema: TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_SCHEMA,
    protocolVersion: TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_PROTOCOL_VERSION,
    status: completed.state,
    completedAt,
    slotId: selectedSlotId,
    sourceAdapterSha256: adapter.adapterSha256,
    sourceProviderPackageSha256: adapter.sourceProviderPackageSha256,
    runtimeDispatchSha256: dispatch.runtimeDispatchSha256,
    runtimeBindingSha256: binding.runtimeBindingSha256,
    runtimeOutcomeSha256: outcome?.runtimeOutcomeSha256 ?? null,
    submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
    authorization,
    runtime: Object.freeze({
      root: runtimeRoot,
      jobId: normalized.spec.id,
      specSha256: normalized.specHash,
      queue: normalized.spec.queue,
      maximumAttempts: 1,
      attempts: completed.attempts.length,
      workerId: resolvedWorkerId,
    }),
    provider: Object.freeze({
      allowedAdapterIds,
      fallbackAllowed: false,
      providerCallCount,
      providerCallCountVerified,
      adapterId:
        completed.state === 'succeeded'
          ? providerRunResult.adapterId
          : failureAttempt?.adapterId ?? null,
      model:
        completed.state === 'succeeded'
          ? providerRunResult.model
          : failureAttempt?.model ?? null,
    }),
    artifacts: Object.freeze({
      root: artifactRoot,
      candidate: candidateArtifact,
      evidence: evidenceArtifact,
      failureEvidence: failureEvidenceArtifact,
      references: referencePreflight,
    }),
    failure:
      completed.state === 'succeeded'
        ? null
        : Object.freeze({
            runtimeFailure: completed.failure ?? null,
            providerAttempt: failureAttempt,
            freshHumanAuthorizationRequiredForRetry: true,
          }),
    effects: Object.freeze({
      runtimeEnqueuePerformed: true,
      providerExecutionPerformed: providerCallCount === 1,
      candidateArtifactCreated: completed.state === 'succeeded',
      evidenceArtifactCreated:
        completed.state === 'succeeded' || failureEvidenceArtifact !== null,
      candidateBytesMaterialized: false,
      candidateApprovalPerformed: false,
      candidatePromotionPerformed: false,
      poseSlotFilled: false,
      sequenceReleased: false,
      repositoryMutationPerformed: false,
      publicationPerformed: false,
      runtimeActivationPerformed: false,
    }),
    authority: executionAuthority(),
  };
  const receipt = deepFreeze({
    ...receiptBody,
    executionSha256: sha256Document(receiptBody),
  });
  return Object.freeze({
    dispatch,
    compiledRuntimeContract: compiled,
    binding,
    outcome,
    receipt,
  });
}

export function projectArtTopHatPoseSlotProviderExecutionCapabilities() {
  return Object.freeze({
    schema: 'evavo.project-art-top-hat-pose-slot-provider-execution-capabilities.v1',
    protocolVersion: TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_PROTOCOL_VERSION,
    executionSchema: TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_SCHEMA,
    requiredExecutionCapability:
      TOP_HAT_POSE_SLOT_PROVIDER_EXECUTION_CAPABILITY,
    exactTopHatAdapterRequired: true,
    activeNamedHumanRunOnceAuthorizationRequired: true,
    genericProviderContractCompiledAndBound: true,
    durableRuntimeSubmission: true,
    isolatedRuntimeQueue: true,
    maximumRuntimeAttempts: 1,
    authorizationReservationPerDurableRuntimeRoot: true,
    providerReferencePreflightBeforeReservation: true,
    providerFallbackAllowed: false,
    exactAdapterAllowlistEnforced: true,
    oneCandidatePerSlot: true,
    immutableCandidateAndEvidenceVerification: true,
    candidateMaterialization: false,
    candidateApproval: false,
    candidatePromotion: false,
    poseSlotFilling: false,
    sequenceRelease: false,
    repositoryMutation: false,
    gitPush: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}
