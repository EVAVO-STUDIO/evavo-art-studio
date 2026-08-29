import { createHash } from 'node:crypto';

import { compileProviderCandidateRuntimeContract } from '../../packages/providers/dist/index.js';
import { normalizeRuntimeJobSubmission } from '../../packages/runtime/dist/index.js';
import {
  COUNCIL_AVATAR_PROVIDER_CANDIDATE_PLAN_SCHEMA,
  compileCouncilAvatarProviderCandidatePlan,
} from './council-avatar-provider-candidates.mjs';

export const COUNCIL_AVATAR_PROVIDER_RUNTIME_PACKAGE_SCHEMA =
  'evavo.project-art-council-avatar-provider-runtime-package.v1';
export const COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY =
  'council-avatar.execution-authorized';

const AUTHORITY = Object.freeze({
  providerExecution: false,
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

function governedRuntimeJob(runtimeJob) {
  const requiredCapabilities = Object.freeze([
    ...new Set([
      ...runtimeJob.requiredCapabilities,
      COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
    ]),
  ]);
  return Object.freeze({
    ...runtimeJob,
    idempotencyKey: `council-avatar:${runtimeJob.idempotencyKey}`,
    requiredCapabilities,
    maximumAttempts: 1,
  });
}

function compileJob(job, plan) {
  const contract = compileProviderCandidateRuntimeContract(job.request);
  if (
    contract.executionMode !== 'submit-runtime-job' ||
    contract.runtimeJob.queue !== 'provider' ||
    contract.runtimeJob.payload.metadata?.productionProgramSha256 !==
      plan.productionProgramSha256 ||
    contract.runtimeJob.payload.metadata?.identityBriefSha256 !==
      job.identityBriefSha256 ||
    contract.runtimeJob.payload.metadata?.providerExecutionAuthorized !== false ||
    contract.runtimeJob.payload.metadata?.candidateApprovalEstablished !== false ||
    contract.runtimeJob.payload.metadata?.candidatePromotionEstablished !== false ||
    contract.runtimeJob.payload.metadata?.runtimeActivationEstablished !== false
  ) {
    throw new Error(
      `COUNCIL_AVATAR_PROVIDER_RUNTIME_BINDING_INVALID:${job.characterId}`,
    );
  }
  const requiredAdapterCapabilities = new Set(
    contract.requiredAdapterCapabilities,
  );
  for (const capability of ['generate', 'candidate-count', 'cancellation']) {
    if (!requiredAdapterCapabilities.has(capability)) {
      throw new Error(
        `COUNCIL_AVATAR_PROVIDER_RUNTIME_CAPABILITY_MISSING:${job.characterId}:${capability}`,
      );
    }
  }

  const runtimeJob = governedRuntimeJob(contract.runtimeJob);
  const normalizedRuntime = normalizeRuntimeJobSubmission(runtimeJob);
  if (
    runtimeJob.maximumAttempts !== 1 ||
    normalizedRuntime.spec.maximumAttempts !== 1 ||
    !normalizedRuntime.spec.requiredCapabilities.includes(
      COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
    )
  ) {
    throw new Error(
      `COUNCIL_AVATAR_PROVIDER_RUNTIME_GOVERNANCE_INVALID:${job.characterId}`,
    );
  }

  return Object.freeze({
    seatId: job.seatId,
    characterId: job.characterId,
    characterLabel: job.characterLabel,
    identityBriefSha256: job.identityBriefSha256,
    sourceRequestSha256: job.requestSha256,
    candidateOutputDirectory: job.candidateOutputDirectory,
    canonicalContract: contract,
    canonicalContractSha256: sha256(contract),
    runtimeJob,
    runtimeSubmissionSha256: sha256(runtimeJob),
    normalizedRuntimeSpec: normalizedRuntime.spec,
    runtimeSpecSha256: normalizedRuntime.specHash,
    executionAuthorization: null,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    runtimeActivationAllowed: false,
    authority: AUTHORITY,
  });
}

export function compileCouncilAvatarProviderRuntimePackage(options = {}) {
  const plan = compileCouncilAvatarProviderCandidatePlan(options);
  if (plan.schema !== COUNCIL_AVATAR_PROVIDER_CANDIDATE_PLAN_SCHEMA) {
    throw new Error('COUNCIL_AVATAR_PROVIDER_CANDIDATE_PLAN_SCHEMA_DRIFT');
  }
  const jobs = Object.freeze(plan.jobs.map((job) => compileJob(job, plan)));
  if (jobs.length !== 2) {
    throw new Error('COUNCIL_AVATAR_PROVIDER_RUNTIME_JOB_COUNT_DRIFT');
  }

  const body = Object.freeze({
    schema: COUNCIL_AVATAR_PROVIDER_RUNTIME_PACKAGE_SCHEMA,
    productionProgramSha256: plan.productionProgramSha256,
    candidatePlanSha256: plan.planSha256,
    providerProtocolTarget: plan.providerProtocolTarget,
    preferredAdapterId: plan.preferredAdapterId,
    preferredModel: plan.preferredModel,
    candidateCountPerCharacter: plan.candidateCountPerCharacter,
    executionCapability: COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
    providerCallBudget: Object.freeze({
      maximumJobs: jobs.length,
      maximumCandidatesPerJob: plan.candidateCountPerCharacter,
      maximumCandidateOutputs:
        jobs.length * plan.candidateCountPerCharacter,
      maximumAttemptsPerJob: 1,
      retriesAuthorizedByThisPackage: 0,
      fallbackAuthorizedByThisPackage: false,
    }),
    jobs,
    executionPolicy: Object.freeze({
      canonicalProviderContractsCompiled: true,
      governedRuntimeJobsDerived: true,
      normalizedRuntimeSpecsBound: true,
      genericProviderWorkerMayClaim: false,
      exactExecutionCapabilityRequired:
        COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
      explicitExternalExecutionAuthorizationRequired: true,
      executionAuthorizationEmbedded: false,
      executionAuthorizationMayBeInferredFromCompilation: false,
      successfulProviderResponseMayApproveIdentity: false,
      successfulProviderResponseMayPromoteCandidate: false,
      successfulProviderResponseMayActivateRuntime: false,
      outputMustRemainInCandidateWorkspace: true,
      providerEvidenceBundleRequired: true,
    }),
    nextActions: Object.freeze([
      'Perform provider readiness inspection without a generation call.',
      'Create a separate bounded execution authorization for only the intended normalized runtime specs and adapter.',
      'Run only a dedicated Council avatar provider worker that holds the exact execution capability.',
      'Persist provider attempt evidence and generated bytes in the isolated candidate artifact workspace.',
      'Run candidate assurance and independent visual review before identity selection.',
      'Create an explicit identity-lock approval artifact for the selected candidate.',
      'Keep Avatar Runtime and website activation blocked until animation production and release assurance complete.',
    ]),
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    runtimeActivationAllowed: false,
    websiteActivationAllowed: false,
    authority: AUTHORITY,
  });

  return Object.freeze({
    ...body,
    runtimePackageSha256: sha256(body),
  });
}

export function councilAvatarProviderRuntimeCapabilities() {
  const runtimePackage = compileCouncilAvatarProviderRuntimePackage();
  return Object.freeze({
    schema: 'evavo.project-art-council-avatar-provider-runtime-capabilities.v1',
    runtimeContractCompilationAvailable: true,
    governedRuntimeJobsAvailable: true,
    normalizedRuntimeSpecsBound: true,
    genericProviderWorkerMayClaim: false,
    executionCapability: COUNCIL_AVATAR_PROVIDER_EXECUTION_CAPABILITY,
    runtimeJobCount: runtimePackage.jobs.length,
    maximumCandidateOutputs:
      runtimePackage.providerCallBudget.maximumCandidateOutputs,
    maximumAttemptsPerJob: 1,
    providerExecutionAuthorized: false,
    fallbackAuthorized: false,
    candidateApprovalEstablished: false,
    candidatePromotionEstablished: false,
    runtimeActivationAllowed: false,
    websiteActivationAllowed: false,
  });
}
