import { createHash } from 'node:crypto';

import { inspectCouncilAvatarProviderReadiness } from './council-avatar-provider-readiness.mjs';
import {
  COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
  compileCouncilAvatarProviderRuntimePackage,
} from './council-avatar-provider-runtime.mjs';

export const COUNCIL_AVATAR_PROVIDER_EXECUTION_AUTHORIZATION_SCHEMA =
  'evavo.project-art-council-avatar-provider-execution-authorization.v1';

const MAXIMUM_AUTHORIZATION_DURATION_MS = 60 * 60 * 1000;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

function boundedText(value, name, maximum = 4096) {
  if (typeof value !== 'string') throw new Error(`${name} is required`);
  const result = value.trim();
  if (!result || result.length > maximum) {
    throw new Error(`${name} must contain 1-${maximum} characters`);
  }
  return result;
}

function canonicalTimestamp(value, name) {
  const text = boundedText(value, name, 40);
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== text) {
    throw new Error(`${name} must be a canonical UTC timestamp`);
  }
  return Object.freeze({ text, milliseconds });
}

function authority() {
  return Object.freeze({
    providerExecution: true,
    candidateArtifactCreation: true,
    evidenceArtifactCreation: true,
    candidateApproval: false,
    candidatePromotion: false,
    sourceMutation: false,
    repositoryMutation: false,
    gitCommit: false,
    gitPush: false,
    publication: false,
    runtimeActivation: false,
    websiteActivation: false,
    deployment: false,
    forcePush: false,
  });
}

export async function compileCouncilAvatarProviderExecutionAuthorization({
  environment = process.env,
  authorizedAt,
  expiresAt,
  authorizedBy,
  reason,
} = {}) {
  const start = canonicalTimestamp(authorizedAt, 'authorizedAt');
  const end = canonicalTimestamp(expiresAt, 'expiresAt');
  if (
    end.milliseconds <= start.milliseconds ||
    end.milliseconds - start.milliseconds > MAXIMUM_AUTHORIZATION_DURATION_MS
  ) {
    throw new Error('authorization must expire within one hour after it begins');
  }

  const readiness = await inspectCouncilAvatarProviderReadiness({ environment });
  if (!readiness.readiness.readyForBoundedExecutionAuthorization) {
    throw new Error(
      `COUNCIL_AVATAR_PROVIDER_NOT_READY:${readiness.blockers.join(',') || 'unknown'}`,
    );
  }
  if (
    readiness.remoteProviderCallPerformed !== false ||
    readiness.readiness.remoteCallabilityVerified !== false
  ) {
    throw new Error('COUNCIL_AVATAR_PROVIDER_READINESS_SEMANTICS_DRIFT');
  }

  const runtimePackage = compileCouncilAvatarProviderRuntimePackage();
  if (
    readiness.runtimePackageSha256 !== runtimePackage.runtimePackageSha256 ||
    runtimePackage.executionCapability !==
      COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY ||
    runtimePackage.executionPolicy.genericProviderWorkerMayClaim !== false
  ) {
    throw new Error('COUNCIL_AVATAR_PROVIDER_AUTHORIZATION_RUNTIME_DRIFT');
  }

  const jobs = Object.freeze(
    runtimePackage.jobs.map((job) =>
      Object.freeze({
        characterId: job.characterId,
        characterLabel: job.characterLabel,
        identityBriefSha256: job.identityBriefSha256,
        sourceRequestSha256: job.sourceRequestSha256,
        canonicalContractSha256: job.canonicalContractSha256,
        runtimeJobSha256: job.runtimeJobSha256,
        idempotencyKey: job.runtimeJob.idempotencyKey,
        queue: job.runtimeJob.queue,
        kind: job.runtimeJob.kind,
        maximumAttempts: job.runtimeJob.maximumAttempts,
        candidateCount: job.runtimeJob.payload.candidateCount,
      }),
    ),
  );

  if (
    jobs.length !== 2 ||
    jobs.some(
      (job) =>
        job.maximumAttempts !== 1 ||
        job.queue !== 'provider' ||
        job.kind !== 'art.candidate.generate',
    )
  ) {
    throw new Error('COUNCIL_AVATAR_PROVIDER_AUTHORIZATION_JOB_DRIFT');
  }

  const body = Object.freeze({
    schema: COUNCIL_AVATAR_PROVIDER_EXECUTION_AUTHORIZATION_SCHEMA,
    status: 'authorized',
    authorizedAt: start.text,
    expiresAt: end.text,
    authorizedBy: boundedText(authorizedBy, 'authorizedBy', 256),
    reason: boundedText(reason, 'reason'),
    executionCapability: COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
    adapter: Object.freeze({
      id: runtimePackage.preferredAdapterId,
      model: runtimePackage.preferredModel,
      fallbackAllowed: false,
    }),
    source: Object.freeze({
      productionProgramSha256: runtimePackage.productionProgramSha256,
      candidatePlanSha256: runtimePackage.candidatePlanSha256,
      runtimePackageSha256: runtimePackage.runtimePackageSha256,
    }),
    budget: Object.freeze({
      maximumProviderJobs: jobs.length,
      maximumCandidateOutputs:
        runtimePackage.providerCallBudget.maximumCandidateOutputs,
      maximumAttemptsPerJob: 1,
      retriesAuthorized: 0,
      fallbackAuthorized: false,
    }),
    jobs,
    readinessEvidence: Object.freeze({
      zeroSpendInspection: true,
      configuredWithoutSpend: true,
      adapterRegistered: true,
      modelRegistered: true,
      adapterCapabilityReady: true,
      remoteCallabilityVerified: false,
      providerSecretValuesIncluded: false,
    }),
    executionPolicy: Object.freeze({
      dedicatedCouncilWorkerRequired: true,
      genericProviderWorkerMayClaim: false,
      exactRuntimeJobHashMatchRequired: true,
      exactAdapterMatchRequired: true,
      exactModelMatchRequired: true,
      authorizationExpiryRequired: true,
      automaticRetryAllowed: false,
      fallbackAllowed: false,
      providerSuccessMayApproveIdentity: false,
      providerSuccessMayPromoteCandidate: false,
      providerSuccessMayActivateRuntime: false,
    }),
    authority: authority(),
  });

  return Object.freeze({
    ...body,
    authorizationSha256: sha256(body),
  });
}

export function validateCouncilAvatarProviderExecutionAuthorization(
  authorization,
  { now = new Date(), runtimePackage = compileCouncilAvatarProviderRuntimePackage() } = {},
) {
  if (
    !authorization ||
    typeof authorization !== 'object' ||
    authorization.schema !== COUNCIL_AVATAR_PROVIDER_EXECUTION_AUTHORIZATION_SCHEMA ||
    authorization.status !== 'authorized'
  ) {
    throw new Error('invalid Council avatar provider execution authorization');
  }
  const { authorizationSha256, ...body } = authorization;
  if (sha256(body) !== authorizationSha256) {
    throw new Error('Council avatar provider authorization hash mismatch');
  }
  const expires = canonicalTimestamp(authorization.expiresAt, 'expiresAt');
  if (now.getTime() >= expires.milliseconds) {
    throw new Error('Council avatar provider execution authorization expired');
  }
  if (
    authorization.source?.runtimePackageSha256 !== runtimePackage.runtimePackageSha256 ||
    authorization.executionCapability !== runtimePackage.executionCapability ||
    authorization.adapter?.id !== runtimePackage.preferredAdapterId ||
    authorization.adapter?.model !== runtimePackage.preferredModel ||
    authorization.adapter?.fallbackAllowed !== false ||
    authorization.budget?.maximumAttemptsPerJob !== 1 ||
    authorization.budget?.retriesAuthorized !== 0 ||
    authorization.budget?.fallbackAuthorized !== false ||
    authorization.executionPolicy?.genericProviderWorkerMayClaim !== false
  ) {
    throw new Error('Council avatar provider execution authorization binding drift');
  }
  if (
    !Array.isArray(authorization.jobs) ||
    authorization.jobs.length !== runtimePackage.jobs.length
  ) {
    throw new Error('Council avatar provider execution authorization job count drift');
  }
  for (const [index, expected] of runtimePackage.jobs.entries()) {
    const actual = authorization.jobs[index];
    if (
      actual?.runtimeJobSha256 !== expected.runtimeJobSha256 ||
      actual?.sourceRequestSha256 !== expected.sourceRequestSha256 ||
      actual?.maximumAttempts !== 1 ||
      actual?.idempotencyKey !== expected.runtimeJob.idempotencyKey
    ) {
      throw new Error(
        `Council avatar provider execution authorization job ${index} drifted`,
      );
    }
  }
  return authorization;
}
