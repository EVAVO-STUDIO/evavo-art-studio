import { createHash } from 'node:crypto';

import { LocalArtifactStore } from '../../packages/artifacts/dist/index.js';
import {
  COUNCIL_AVATAR_DIRECTION_MASTER_RUNTIME_SCHEMA,
  compileCouncilAvatarDirectionMasterRuntimePackage,
} from './council-avatar-direction-master-runtime.mjs';
import { COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY } from './council-avatar-provider-runtime.mjs';

export const COUNCIL_AVATAR_DIRECTION_MASTER_EXECUTION_AUTHORIZATION_SCHEMA =
  'evavo.project-art-council-avatar-direction-master-execution-authorization.v1';

const MAXIMUM_AUTHORIZATION_DURATION_MS = 60 * 60 * 1000;
const HEX64 = /^[a-f0-9]{64}$/u;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function boundedText(value, label, maximum = 4096) {
  if (typeof value !== 'string') throw new Error(`${label} is required`);
  const text = value.trim();
  if (!text || text.length > maximum || text.includes('\0')) {
    throw new Error(`${label} must contain 1-${maximum} safe characters`);
  }
  return text;
}

function canonicalTimestamp(value, label) {
  const text = boundedText(value, label, 64);
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== text) {
    throw new Error(`${label} must be a canonical UTC timestamp`);
  }
  return Object.freeze({ text, milliseconds });
}

function authority() {
  return Object.freeze({
    providerExecution: true,
    candidateArtifactCreation: true,
    evidenceArtifactCreation: true,
    directionMasterApproval: false,
    candidatePromotion: false,
    identityLockMutation: false,
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

async function verifyCanonicalIdentities(runtimePackage, artifactRoot) {
  const store = new LocalArtifactStore({ root: artifactRoot });
  const unique = new Map();
  for (const job of runtimePackage.jobs) {
    unique.set(job.identityMasteredArtifactId, Object.freeze({
      characterId: job.characterId,
      artifactId: job.identityMasteredArtifactId,
      expectedContentSha256: job.identityMasteredContentSha256,
    }));
  }
  const verified = [];
  for (const identity of unique.values()) {
    const [descriptor, result] = await Promise.all([
      store.get(identity.artifactId),
      store.verify(identity.artifactId),
    ]);
    if (
      !descriptor ||
      result.exists !== true ||
      result.descriptorValid !== true ||
      result.contentValid !== true ||
      descriptor.mediaType !== 'image/png' ||
      descriptor.storageClass !== 'intermediate' ||
      descriptor.contentSha256 !== identity.expectedContentSha256 ||
      descriptor.labels.artifactRole !== 'provider-candidate-alpha-master' ||
      descriptor.labels.qualityState !== 'passed' ||
      descriptor.labels.approvalState !== 'unapproved'
    ) {
      throw new Error(`COUNCIL_DIRECTION_CANONICAL_IDENTITY_INVALID:${identity.characterId}`);
    }
    verified.push(Object.freeze({
      characterId: identity.characterId,
      artifactId: identity.artifactId,
      contentSha256: descriptor.contentSha256,
      descriptorSha256: descriptor.descriptorSha256,
      artifactRole: descriptor.labels.artifactRole,
      qualityState: descriptor.labels.qualityState,
      artifactApprovalState: descriptor.labels.approvalState,
      identityLockApprovedBySeparateRecord: true,
      promotedByAuthorization: false,
    }));
  }
  return Object.freeze(verified.sort((a, b) => a.characterId.localeCompare(b.characterId)));
}

export async function compileCouncilAvatarDirectionMasterExecutionAuthorization({
  identityLockApproval,
  artifactRoot,
  authorizedAt,
  expiresAt,
  authorizedBy,
  reason,
  candidateCount,
  preferredAdapterId,
  preferredModel,
} = {}) {
  const start = canonicalTimestamp(authorizedAt, 'authorizedAt');
  const end = canonicalTimestamp(expiresAt, 'expiresAt');
  if (
    end.milliseconds <= start.milliseconds ||
    end.milliseconds - start.milliseconds > MAXIMUM_AUTHORIZATION_DURATION_MS
  ) {
    throw new Error('authorization must expire within one hour after it begins');
  }
  const runtimePackage = compileCouncilAvatarDirectionMasterRuntimePackage({
    identityLockApproval,
    ...(candidateCount === undefined ? {} : { candidateCount }),
    ...(preferredAdapterId === undefined ? {} : { preferredAdapterId }),
    ...(preferredModel === undefined ? {} : { preferredModel }),
  });
  if (
    runtimePackage.schema !== COUNCIL_AVATAR_DIRECTION_MASTER_RUNTIME_SCHEMA ||
    runtimePackage.executionCapability !== COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY ||
    runtimePackage.executionPolicy.genericProviderWorkerMayClaim !== false ||
    runtimePackage.executionPolicy.normalizedRuntimeSpecsBound !== true
  ) {
    throw new Error('COUNCIL_DIRECTION_AUTHORIZATION_RUNTIME_DRIFT');
  }
  const canonicalIdentities = await verifyCanonicalIdentities(runtimePackage, artifactRoot);
  const jobs = Object.freeze(runtimePackage.jobs.map((job) => Object.freeze({
    characterId: job.characterId,
    viewId: job.viewId,
    identityMasteredArtifactId: job.identityMasteredArtifactId,
    identityMasteredContentSha256: job.identityMasteredContentSha256,
    sourceRequestSha256: job.sourceRequestSha256,
    canonicalContractSha256: job.canonicalContractSha256,
    runtimeSubmissionSha256: job.runtimeSubmissionSha256,
    runtimeSpecSha256: job.runtimeSpecSha256,
    runtimeJobId: job.normalizedRuntimeSpec.id,
    idempotencyKey: job.normalizedRuntimeSpec.idempotencyKey,
    queue: job.normalizedRuntimeSpec.queue,
    kind: job.normalizedRuntimeSpec.kind,
    maximumAttempts: job.normalizedRuntimeSpec.maximumAttempts,
    candidateCount: job.normalizedRuntimeSpec.payload.candidateCount,
  })));
  if (
    jobs.length !== runtimePackage.jobs.length ||
    jobs.length < 1 ||
    jobs.some((job) => job.maximumAttempts !== 1 || job.queue !== 'provider' || job.kind !== 'art.candidate.generate')
  ) {
    throw new Error('COUNCIL_DIRECTION_AUTHORIZATION_JOB_DRIFT');
  }

  const body = Object.freeze({
    schema: COUNCIL_AVATAR_DIRECTION_MASTER_EXECUTION_AUTHORIZATION_SCHEMA,
    status: 'authorized',
    authorizedAt: start.text,
    expiresAt: end.text,
    authorizedBy: boundedText(authorizedBy, 'authorizedBy', 256),
    reason: boundedText(reason, 'reason', 8192),
    executionCapability: COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
    adapter: Object.freeze({
      id: runtimePackage.preferredAdapterId,
      model: runtimePackage.preferredModel,
      fallbackAllowed: false,
    }),
    source: Object.freeze({
      identityApprovalSha256: runtimePackage.identityApprovalSha256,
      directionMasterPlanSha256: runtimePackage.directionMasterPlanSha256,
      runtimePackageSha256: runtimePackage.runtimePackageSha256,
    }),
    canonicalIdentities,
    budget: Object.freeze({
      maximumProviderJobs: jobs.length,
      maximumCandidateOutputs: runtimePackage.providerCallBudget.maximumCandidateOutputs,
      maximumAttemptsPerJob: 1,
      retriesAuthorized: 0,
      fallbackAuthorized: false,
    }),
    jobs,
    executionPolicy: Object.freeze({
      dedicatedCouncilWorkerRequired: true,
      genericProviderWorkerMayClaim: false,
      exactNormalizedRuntimeSpecHashRequired: true,
      exactAdapterMatchRequired: true,
      exactModelMatchRequired: true,
      exactCanonicalIdentityArtifactRequired: true,
      identityApprovalRecordIsAuthority: true,
      artifactPromotionRequiredBeforeExecution: false,
      authorizationExpiryRequired: true,
      automaticRetryAllowed: false,
      fallbackAllowed: false,
      providerSuccessMayApproveDirectionMaster: false,
      providerSuccessMayPromoteCandidate: false,
      providerSuccessMayActivateRuntime: false,
    }),
    authority: authority(),
  });
  return Object.freeze({ ...body, authorizationSha256: sha256(body) });
}

export function validateCouncilAvatarDirectionMasterExecutionAuthorization(
  authorization,
  { now = new Date(), runtimePackage } = {},
) {
  if (
    !authorization ||
    authorization.schema !== COUNCIL_AVATAR_DIRECTION_MASTER_EXECUTION_AUTHORIZATION_SCHEMA ||
    authorization.status !== 'authorized' ||
    !runtimePackage ||
    runtimePackage.schema !== COUNCIL_AVATAR_DIRECTION_MASTER_RUNTIME_SCHEMA
  ) {
    throw new Error('invalid Council direction-master execution authorization');
  }
  const { authorizationSha256, ...body } = authorization;
  if (!HEX64.test(authorizationSha256 ?? '') || sha256(body) !== authorizationSha256) {
    throw new Error('Council direction-master authorization hash mismatch');
  }
  const expires = canonicalTimestamp(authorization.expiresAt, 'expiresAt');
  if (now.getTime() >= expires.milliseconds) {
    throw new Error('Council direction-master execution authorization expired');
  }
  if (
    authorization.source?.runtimePackageSha256 !== runtimePackage.runtimePackageSha256 ||
    authorization.source?.identityApprovalSha256 !== runtimePackage.identityApprovalSha256 ||
    authorization.source?.directionMasterPlanSha256 !== runtimePackage.directionMasterPlanSha256 ||
    authorization.executionCapability !== runtimePackage.executionCapability ||
    authorization.adapter?.id !== runtimePackage.preferredAdapterId ||
    authorization.adapter?.model !== runtimePackage.preferredModel ||
    authorization.adapter?.fallbackAllowed !== false ||
    authorization.budget?.maximumAttemptsPerJob !== 1 ||
    authorization.budget?.retriesAuthorized !== 0 ||
    authorization.budget?.fallbackAuthorized !== false ||
    authorization.executionPolicy?.genericProviderWorkerMayClaim !== false ||
    authorization.executionPolicy?.exactCanonicalIdentityArtifactRequired !== true ||
    authorization.executionPolicy?.identityApprovalRecordIsAuthority !== true ||
    authorization.executionPolicy?.artifactPromotionRequiredBeforeExecution !== false
  ) {
    throw new Error('Council direction-master execution authorization binding drift');
  }
  if (!Array.isArray(authorization.jobs) || authorization.jobs.length !== runtimePackage.jobs.length) {
    throw new Error('Council direction-master authorization job count drift');
  }
  for (const [index, expected] of runtimePackage.jobs.entries()) {
    const actual = authorization.jobs[index];
    if (
      actual?.runtimeSpecSha256 !== expected.runtimeSpecSha256 ||
      actual?.runtimeSubmissionSha256 !== expected.runtimeSubmissionSha256 ||
      actual?.sourceRequestSha256 !== expected.sourceRequestSha256 ||
      actual?.runtimeJobId !== expected.normalizedRuntimeSpec.id ||
      actual?.idempotencyKey !== expected.normalizedRuntimeSpec.idempotencyKey ||
      actual?.identityMasteredArtifactId !== expected.identityMasteredArtifactId ||
      actual?.identityMasteredContentSha256 !== expected.identityMasteredContentSha256 ||
      actual?.maximumAttempts !== 1
    ) {
      throw new Error(`Council direction-master authorization job ${index} drifted`);
    }
  }
  return authorization;
}
