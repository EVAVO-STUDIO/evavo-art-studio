import { createHash } from 'node:crypto';

import { compileProviderCandidateRuntimeContract } from '../../packages/providers/dist/index.js';
import { normalizeRuntimeJobSubmission } from '../../packages/runtime/dist/index.js';
import {
  COUNCIL_AVATAR_DIRECTION_MASTER_PLAN_SCHEMA,
  compileCouncilAvatarDirectionMasterPlan,
} from './council-avatar-direction-master-candidates.mjs';
import {
  COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
} from './council-avatar-provider-runtime.mjs';

export const COUNCIL_AVATAR_DIRECTION_MASTER_RUNTIME_SCHEMA =
  'evavo.project-art-council-avatar-direction-master-runtime-package.v1';

const AUTHORITY = Object.freeze({
  providerExecution: false,
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

function compileJob(job, plan) {
  const contract = compileProviderCandidateRuntimeContract(job.request);
  if (
    contract.executionMode !== 'submit-runtime-job' ||
    contract.runtimeJob.queue !== 'provider' ||
    contract.runtimeJob.payload.continuityPhase !== 'direction-master' ||
    contract.runtimeJob.payload.metadata?.identityApprovalSha256 !== plan.identityApprovalSha256 ||
    contract.runtimeJob.payload.metadata?.identityMasteredArtifactId !== job.identityMasteredArtifactId ||
    contract.runtimeJob.payload.metadata?.providerExecutionAuthorized !== false ||
    contract.runtimeJob.payload.metadata?.directionMasterApprovalEstablished !== false ||
    contract.runtimeJob.payload.references.length !== 1 ||
    contract.runtimeJob.payload.references[0].artifactId !== job.identityMasteredArtifactId ||
    contract.runtimeJob.payload.references[0].role !== 'canonical-identity' ||
    contract.runtimeJob.payload.references[0].required !== true ||
    contract.runtimeJob.payload.references[0].strength !== 1
  ) {
    throw new Error(`COUNCIL_DIRECTION_RUNTIME_BINDING_INVALID:${job.characterId}:${job.viewId}`);
  }
  const requiredAdapterCapabilities = new Set(contract.requiredAdapterCapabilities);
  for (const capability of ['generate', 'reference-images', 'identity-reference', 'candidate-count', 'cancellation']) {
    if (!requiredAdapterCapabilities.has(capability)) {
      throw new Error(`COUNCIL_DIRECTION_RUNTIME_CAPABILITY_MISSING:${job.characterId}:${job.viewId}:${capability}`);
    }
  }
  const runtimeJob = Object.freeze({
    ...contract.runtimeJob,
    idempotencyKey: `council-avatar:direction:${contract.runtimeJob.idempotencyKey}`,
    inputArtifacts: Object.freeze([job.identityMasteredArtifactId]),
    requiredCapabilities: Object.freeze([
      ...new Set([
        ...contract.runtimeJob.requiredCapabilities,
        COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
      ]),
    ]),
    maximumAttempts: 1,
  });
  const normalized = normalizeRuntimeJobSubmission(runtimeJob);
  if (
    normalized.spec.maximumAttempts !== 1 ||
    !normalized.spec.inputArtifacts.includes(job.identityMasteredArtifactId) ||
    !normalized.spec.requiredCapabilities.includes(COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY)
  ) {
    throw new Error(`COUNCIL_DIRECTION_RUNTIME_GOVERNANCE_INVALID:${job.characterId}:${job.viewId}`);
  }
  return Object.freeze({
    characterId: job.characterId,
    characterLabel: job.characterLabel,
    viewId: job.viewId,
    viewLabel: job.viewLabel,
    identityMasteredArtifactId: job.identityMasteredArtifactId,
    identityMasteredContentSha256: job.identityMasteredContentSha256,
    sourceRequestSha256: job.requestSha256,
    canonicalContract: contract,
    canonicalContractSha256: sha256(contract),
    runtimeJob,
    runtimeSubmissionSha256: sha256(runtimeJob),
    normalizedRuntimeSpec: normalized.spec,
    runtimeSpecSha256: normalized.specHash,
    executionAuthorization: null,
    providerExecution: false,
    directionMasterApproval: false,
    candidatePromotion: false,
    runtimeActivationAllowed: false,
    websiteActivationAllowed: false,
    authority: AUTHORITY,
  });
}

export function compileCouncilAvatarDirectionMasterRuntimePackage(options = {}) {
  const plan = compileCouncilAvatarDirectionMasterPlan(options);
  if (plan.schema !== COUNCIL_AVATAR_DIRECTION_MASTER_PLAN_SCHEMA) {
    throw new Error('COUNCIL_DIRECTION_MASTER_PLAN_SCHEMA_DRIFT');
  }
  const jobs = Object.freeze(plan.jobs.map((job) => compileJob(job, plan)));
  if (jobs.length !== plan.viewCount) {
    throw new Error('COUNCIL_DIRECTION_MASTER_RUNTIME_JOB_COUNT_DRIFT');
  }
  const body = Object.freeze({
    schema: COUNCIL_AVATAR_DIRECTION_MASTER_RUNTIME_SCHEMA,
    directionMasterPlanSha256: plan.planSha256,
    identityApprovalSha256: plan.identityApprovalSha256,
    approvedCharacterIds: plan.approvedCharacterIds,
    preferredAdapterId: plan.preferredAdapterId,
    preferredModel: plan.preferredModel,
    candidateCountPerView: plan.candidateCountPerView,
    executionCapability: COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
    jobs,
    providerCallBudget: Object.freeze({
      maximumJobs: jobs.length,
      maximumCandidatesPerJob: plan.candidateCountPerView,
      maximumCandidateOutputs: jobs.length * plan.candidateCountPerView,
      maximumAttemptsPerJob: 1,
      retriesAuthorized: 0,
      fallbackAuthorized: false,
    }),
    executionPolicy: Object.freeze({
      canonicalProviderContractsCompiled: true,
      normalizedRuntimeSpecsBound: true,
      canonicalIdentityInputArtifactRequired: true,
      genericProviderWorkerMayClaim: false,
      exactExecutionCapabilityRequired: COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
      explicitExternalExecutionAuthorizationRequired: true,
      executionAuthorizationEmbedded: false,
      providerSuccessMayApproveDirectionMaster: false,
      providerSuccessMayPromoteRuntime: false,
      outputMustRemainUnapproved: true,
    }),
    nextActions: Object.freeze([
      'Verify every canonical identity artifact exists in the exact execution artifact store and matches the approved descriptor/content hashes.',
      'Perform zero-spend provider readiness inspection.',
      'Create a separate short-lived authorization bound to these exact normalized runtime specs.',
      'Execute only explicitly authorized direction jobs through a dedicated Council worker.',
      'Master and independently review every view against its approved identity before direction-master approval.',
    ]),
    providerExecution: false,
    directionMasterApproval: false,
    candidatePromotion: false,
    runtimeActivationAllowed: false,
    websiteActivationAllowed: false,
    authority: AUTHORITY,
  });
  return Object.freeze({ ...body, runtimePackageSha256: sha256(body) });
}
