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
import { GENERIC_PROVIDER_PROTOCOL_VERSION } from './avatar-final-pass-provider-runtime-constants.mjs';
import {
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
import {
  CHARACTER_IDENTITY_PROVIDER_EXECUTION_CAPABILITY,
  CHARACTER_IDENTITY_PROVIDER_EXECUTION_SCHEMA,
  CHARACTER_IDENTITY_PROVIDER_PROTOCOL_VERSION,
  CHARACTER_IDENTITY_SET_ANCHOR_VIEW_ID,
  characterIdentityFalseAuthority,
  parseCharacterIdentityProviderRuntimeAdapter,
} from './character-identity-provider-contract.mjs';

const MAXIMUM_AUTHORIZATION_MS = 24 * 60 * 60 * 1000;

function normalizedAbsolutePath(value, label) {
  assert(
    typeof value === 'string' && value.length >= 1 && !value.includes('\0'),
    'CHARACTER_IDENTITY_PROVIDER_PATH_INVALID',
    `${label} is invalid.`,
  );
  const resolved = path.resolve(value);
  assert(
    resolved === value,
    'CHARACTER_IDENTITY_PROVIDER_PATH_INVALID',
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
    'CHARACTER_IDENTITY_PROVIDER_PATH_INVALID',
    `${label} must be a real directory.`,
  );
  return root;
}

function activeAuthorization(adapter, now) {
  const authorization = adapter.authorization;
  const occurredAt = timestamp(
    authorization.occurredAt,
    'provider authorization.occurredAt',
  );
  const expiresAt = timestamp(
    authorization.expiresAt,
    'provider authorization.expiresAt',
  );
  const current = now.getTime();
  const occurred = Date.parse(occurredAt);
  const expires = Date.parse(expiresAt);
  assert(
    Number.isFinite(current) &&
      current >= occurred &&
      current < expires &&
      expires > occurred &&
      expires - occurred <= MAXIMUM_AUTHORIZATION_MS &&
      authorization.maximumProviderCalls === 1 &&
      authorization.oneShot === true,
    'CHARACTER_IDENTITY_PROVIDER_AUTHORIZATION_EXPIRED',
  );
  return authorization;
}

function reservationSha256(adapter) {
  return sha256Text(
    `${adapter.providerAdmission.providerAdmissionSha256}\0${adapter.authorization.authorizationSha256}\0${adapter.jobId}`,
  );
}

function oneShotRuntimeJob(compiled, adapter) {
  const source = compiled.runtimeJob;
  const reservation = reservationSha256(adapter);
  return Object.freeze({
    ...source,
    queue: `character-identity.provider.${reservation.slice(0, 20)}`,
    idempotencyKey: `character-identity-once:${reservation}`,
    maximumAttempts: 1,
    requiredCapabilities: Object.freeze(
      [...new Set([
        ...source.requiredCapabilities,
        CHARACTER_IDENTITY_PROVIDER_EXECUTION_CAPABILITY,
      ])].sort(),
    ),
    labels: Object.freeze({
      ...source.labels,
      characterIdentityExecution: 'one-shot-v1',
      characterIdentityCharacterId: adapter.characterId,
      characterIdentitySetId: adapter.setId,
      characterIdentityViewId: adapter.viewId,
      characterIdentityAuthorizationSha256:
        adapter.authorization.authorizationSha256,
      characterIdentityReservationSha256: reservation,
    }),
  });
}

async function verifiedArtifactSummary(artifacts, artifactIdValue, role) {
  const verification = await artifacts.verify(artifactIdValue);
  assert(
    verification.descriptorValid === true && verification.contentValid === true,
    'CHARACTER_IDENTITY_PROVIDER_ARTIFACT_INVALID',
  );
  const descriptor = await artifacts.get(artifactIdValue);
  assert(descriptor, 'CHARACTER_IDENTITY_PROVIDER_ARTIFACT_INVALID');
  if (role === 'candidate') {
    assert(
      descriptor.storageClass === 'intermediate' &&
        descriptor.labels.artifactRole === 'provider-candidate' &&
        descriptor.labels.approvalState === 'unapproved' &&
        descriptor.metadata?.finalDeliverable === false,
      'CHARACTER_IDENTITY_PROVIDER_CANDIDATE_ESCALATED',
    );
  } else {
    assert(
      descriptor.storageClass === 'evidence',
      'CHARACTER_IDENTITY_PROVIDER_EVIDENCE_INVALID',
    );
  }
  return Object.freeze({
    artifactId: artifactIdValue,
    contentHash: descriptor.contentSha256,
    mediaType: descriptor.mediaType,
    storageClass: descriptor.storageClass,
    artifactRole: descriptor.labels.artifactRole ?? null,
    approvalState: descriptor.labels.approvalState ?? null,
  });
}

async function verifyIdentityAnchorArtifact(artifacts, adapter) {
  const anchor = adapter.providerAdmission.identityAnchor;
  if (anchor === null) return null;
  const verification = await artifacts.verify(anchor.candidateArtifactId);
  const descriptor = await artifacts.get(anchor.candidateArtifactId);
  assert(
    verification.descriptorValid === true &&
      verification.contentValid === true &&
      descriptor?.contentSha256 === anchor.candidateContentHash &&
      descriptor?.storageClass === 'intermediate' &&
      descriptor?.labels.artifactRole === 'provider-candidate' &&
      descriptor?.labels.approvalState === 'unapproved' &&
      descriptor?.metadata?.finalDeliverable === false,
    'CHARACTER_IDENTITY_PROVIDER_ANCHOR_ARTIFACT_INVALID',
  );
  return anchor;
}

function providerFailureAttempt(completed) {
  const details = completed.failure?.details;
  if (!isRecord(details) || !Array.isArray(details.attempts) || details.attempts.length !== 1) {
    return null;
  }
  const attempt = details.attempts[0];
  if (!isRecord(attempt)) return null;
  const rawClassification = attempt.classification ?? completed.failure?.classification;
  const classification = ['transient', 'permanent', 'incompatible', 'cancelled'].includes(
    rawClassification,
  )
    ? rawClassification
    : ['timeout', 'deadline-exceeded', 'lease-expired'].includes(rawClassification)
      ? 'transient'
      : 'permanent';
  return Object.freeze({
    adapterId:
      typeof attempt.adapterId === 'string'
        ? boundedText(attempt.adapterId, 'provider failure.adapterId', 1, 128)
        : null,
    model:
      typeof attempt.model === 'string'
        ? boundedText(attempt.model, 'provider failure.model', 1, 256)
        : null,
    classification,
    code: boundedText(
      String(attempt.code ?? completed.failure?.code ?? 'PROVIDER_EXECUTION_FAILED'),
      'provider failure.code',
      1,
      256,
    ),
    message: boundedText(
      String(attempt.message ?? completed.failure?.message ?? 'Provider execution failed.'),
      'provider failure.message',
      1,
      4096,
    ),
  });
}

function executionReceiptBody({
  adapter,
  completed,
  completedAt,
  outcome,
  candidate,
  evidence,
  providerCallCountVerified,
}) {
  const success = completed.state === 'succeeded';
  return {
    schema: CHARACTER_IDENTITY_PROVIDER_EXECUTION_SCHEMA,
    protocolVersion: CHARACTER_IDENTITY_PROVIDER_PROTOCOL_VERSION,
    status: success ? 'succeeded' : 'failed',
    completedAt,
    characterId: adapter.characterId,
    setId: adapter.setId,
    continuityKey: adapter.continuityKey,
    jobId: adapter.jobId,
    admissionItemId: adapter.providerAdmission.admissionItemId,
    viewId: adapter.viewId,
    sourceIdentityRequestSha256: adapter.sourceIdentityRequestSha256,
    sourceIdentityMasterPlanSha256: adapter.sourceIdentityMasterPlanSha256,
    sourceBootstrapAdmissionSha256: adapter.sourceBootstrapAdmissionSha256,
    providerAdmissionSha256: adapter.providerAdmission.providerAdmissionSha256,
    authorizationSha256: adapter.authorization.authorizationSha256,
    sourceAdapterSha256: adapter.adapterSha256,
    runtimeDispatchSha256: adapter.genericRuntimeDispatch.runtimeDispatchSha256,
    runtimeOutcomeSha256: outcome?.runtimeOutcomeSha256 ?? null,
    provider: Object.freeze({
      preferredAdapterId: adapter.providerAdmission.selection.preferredAdapterId,
      preferredModel: adapter.providerAdmission.selection.preferredModel,
      fallbackAllowed: false,
      providerCallCount: 1,
      providerCallCountVerified,
    }),
    artifacts: Object.freeze({ candidate, evidence }),
    effects: Object.freeze({
      providerExecutionPerformed: true,
      candidateArtifactCreated: candidate !== null,
      evidenceArtifactCreated: evidence !== null,
      candidateBytesMaterialized: false,
      deterministicQaPerformed: false,
      creativeReviewPerformed: false,
      candidateApprovalPerformed: false,
      identityApprovalPerformed: false,
      animationProductionPerformed: false,
      candidatePromotionPerformed: false,
      runtimeAssetCreated: false,
      publicationPerformed: false,
      runtimeActivationPerformed: false,
      websiteActivationPerformed: false,
    }),
    requiredNextSteps: success
      ? Object.freeze([
          'materialize-candidate-create-only',
          'run-alpha-and-canvas-finishing',
          ...(adapter.viewId === CHARACTER_IDENTITY_SET_ANCHOR_VIEW_ID
            ? [
                'use-this-unapproved-candidate-only-as-same-set-continuity-reference-for-dependent-views',
              ]
            : []),
          'complete-three-view-candidate-set',
          'run-independent-identity-continuity-review',
          'approve-exactly-one-identity-set-under-separate-identity-approval-receipt',
        ])
      : Object.freeze([
          'record-provider-failure',
          'issue-fresh-one-shot-human-authorization-before-any-retry',
        ]),
    authority: characterIdentityFalseAuthority(),
  };
}

export async function executeCharacterIdentityProvider({
  adapter: adapterInput,
  runtimeRoot: runtimeRootInput,
  artifactRoot: artifactRootInput,
  workerId = 'character-identity-provider-worker',
  environment = process.env,
}) {
  const adapter = parseCharacterIdentityProviderRuntimeAdapter(adapterInput);
  const authorization = activeAuthorization(adapter, new Date());
  const runtimeRoot = await realDirectory(runtimeRootInput, 'runtimeRoot', true);
  const artifactRoot = await realDirectory(artifactRootInput, 'artifactRoot', true);
  assert(
    runtimeRoot !== artifactRoot,
    'CHARACTER_IDENTITY_PROVIDER_PATH_INVALID',
  );
  assert(
    PROVIDER_PROTOCOL_VERSION === GENERIC_PROVIDER_PROTOCOL_VERSION,
    'CHARACTER_IDENTITY_PROVIDER_PROTOCOL_DRIFT',
  );

  const dispatch = adapter.genericRuntimeDispatch;
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
      request.selection.allowFallback === false &&
      request.candidateCount === 1 &&
      request.continuityPhase === 'identity-master',
    'CHARACTER_IDENTITY_PROVIDER_REQUEST_MISMATCH',
  );
  const allowedAdapterIds = Object.freeze([...request.selection.allowedAdapterIds]);
  assert(
    allowedAdapterIds.length === 1 &&
      allowedAdapterIds[0] ===
        adapter.providerAdmission.selection.preferredAdapterId,
    'CHARACTER_IDENTITY_PROVIDER_ADAPTERS_INVALID',
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
    'CHARACTER_IDENTITY_PROVIDER_ROUTING_INVALID',
  );

  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  const artifacts = new LocalArtifactStore({ root: artifactRoot });
  await verifyIdentityAnchorArtifact(artifacts, adapter);

  const runtimeJob = oneShotRuntimeJob(compiled, adapter);
  const normalized = normalizeRuntimeJobSubmission(runtimeJob);
  assert(
    normalized.spec.maximumAttempts === 1 &&
      normalized.spec.requiredCapabilities.includes(
        CHARACTER_IDENTITY_PROVIDER_EXECUTION_CAPABILITY,
      ),
    'CHARACTER_IDENTITY_PROVIDER_RUNTIME_JOB_INVALID',
  );
  const existing = await runtime.get(normalized.spec.id);
  assert(
    existing === null,
    'CHARACTER_IDENTITY_PROVIDER_AUTHORIZATION_ALREADY_RESERVED',
  );
  const submitted = await runtime.submitBatch(
    [runtimeJob],
    `character-identity:${authorization.actorId}`,
    new Date(),
  );
  assert(
    submitted.length === 1 &&
      submitted[0].id === normalized.spec.id &&
      submitted[0].specHash === normalized.specHash &&
      submitted[0].state === 'queued',
    'CHARACTER_IDENTITY_PROVIDER_SUBMISSION_INVALID',
  );

  let providerRunResult = null;
  const providerHandlers = createProviderHandlers(providerRegistry);
  const providerHandler = providerHandlers[normalized.spec.kind];
  assert(
    typeof providerHandler === 'function',
    'CHARACTER_IDENTITY_PROVIDER_HANDLER_MISSING',
  );
  const handlers = Object.freeze({
    [normalized.spec.kind]: async (context) => {
      activeAuthorization(adapter, new Date());
      assert(
        context.job.id === normalized.spec.id &&
          context.job.specHash === normalized.specHash &&
          providerRequestSha256(
            validateProviderCandidateRequest(context.job.spec.payload),
          ) === binding.normalizedProviderRequestSha256,
        'CHARACTER_IDENTITY_PROVIDER_CLAIM_INVALID',
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
          CHARACTER_IDENTITY_PROVIDER_EXECUTION_CAPABILITY,
        ])].sort(),
      ),
      capabilityProfiles: providerWorkerCapabilityProfiles(providerRegistry),
      queues: Object.freeze([normalized.spec.queue]),
    },
    handlers,
    concurrency: 1,
  });
  await worker.runUntilIdle();
  const completed = await runtime.get(normalized.spec.id);
  assert(
    completed &&
      completed.specHash === normalized.specHash &&
      ['succeeded', 'failed', 'dead-letter', 'cancelled'].includes(completed.state),
    'CHARACTER_IDENTITY_PROVIDER_WORKER_INVALID',
  );

  const completedAt = new Date().toISOString();
  let outcome;
  let candidate = null;
  let evidence = null;
  let providerCallCountVerified = false;
  if (completed.state === 'succeeded') {
    assert(
      providerRunResult &&
        Array.isArray(providerRunResult.candidateArtifacts) &&
        providerRunResult.candidateArtifacts.length === 1,
      'CHARACTER_IDENTITY_PROVIDER_RESULT_INVALID',
    );
    outcome = compileAvatarFinalPassProviderRuntimeOutcome(dispatch, binding, {
      kind: 'candidate-run-result',
      submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
      providerCallCount: 1,
      completedAt,
      result: providerRunResult,
    });
    candidate = await verifiedArtifactSummary(
      artifacts,
      providerRunResult.candidateArtifacts[0],
      'candidate',
    );
    evidence = await verifiedArtifactSummary(
      artifacts,
      providerRunResult.evidenceArtifact,
      'evidence',
    );
    providerCallCountVerified = true;
  } else {
    const attempt = providerFailureAttempt(completed);
    assert(
      attempt,
      'CHARACTER_IDENTITY_PROVIDER_FAILURE_ATTEMPT_UNVERIFIED',
    );
    outcome = compileAvatarFinalPassProviderRuntimeOutcome(dispatch, binding, {
      kind: 'provider-failure',
      submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
      providerCallCount: 1,
      completedAt,
      failure: {
        code: attempt.code,
        classification: attempt.classification,
        message: attempt.message,
        adapterId: attempt.adapterId,
        model: attempt.model,
        attemptCount: 1,
        candidateCount: 0,
      },
    });
    providerCallCountVerified = true;
  }

  const body = executionReceiptBody({
    adapter,
    completed,
    completedAt,
    outcome,
    candidate,
    evidence,
    providerCallCountVerified,
  });
  const receipt = deepFreeze({
    ...body,
    executionSha256: sha256Document(body),
  });
  return Object.freeze({ dispatch, binding, outcome, receipt });
}

export function characterIdentityProviderExecutionCapabilities() {
  return Object.freeze({
    schema: 'evavo.character-identity-provider-execution-capabilities.v1',
    protocolVersion: CHARACTER_IDENTITY_PROVIDER_PROTOCOL_VERSION,
    genericProviderWorkerReused: true,
    genericCandidateMaterializerCompatible: true,
    maximumRuntimeAttempts: 1,
    maximumProviderCallsPerAuthorization: 1,
    authorizationReservationPerDurableRuntimeRoot: true,
    providerFallbackAllowed: false,
    sameSetAnchorArtifactReverifiedBeforeDependentExecution: true,
    candidateMaterialization: false,
    deterministicQa: false,
    creativeReview: false,
    candidateApproval: false,
    identityApproval: false,
    animationProduction: false,
    publication: false,
    runtimeActivation: false,
    websiteActivation: false,
    forcePush: false,
  });
}
