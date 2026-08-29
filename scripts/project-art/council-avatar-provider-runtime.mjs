import { createHash } from 'node:crypto';

import { compileProviderCandidateRuntimeContract } from '../../packages/providers/dist/index.js';
import {
  COUNCIL_AVATAR_PROVIDER_CANDIDATE_PLAN_SCHEMA,
  compileCouncilAvatarProviderCandidatePlan,
} from './council-avatar-provider-candidates.mjs';

export const COUNCIL_AVATAR_PROVIDER_RUNTIME_PACKAGE_SCHEMA =
  'evavo.project-art-council-avatar-provider-runtime-package.v1';

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
  const requiredCapabilities = new Set(contract.requiredAdapterCapabilities);
  for (const capability of ['generate', 'candidate-count', 'cancellation']) {
    if (!requiredCapabilities.has(capability)) {
      throw new Error(
        `COUNCIL_AVATAR_PROVIDER_RUNTIME_CAPABILITY_MISSING:${job.characterId}:${capability}`,
      );
    }
  }

  return Object.freeze({
    seatId: job.seatId,
    characterId: job.characterId,
    characterLabel: job.characterLabel,
    identityBriefSha256: job.identityBriefSha256,
    sourceRequestSha256: job.requestSha256,
    candidateOutputDirectory: job.candidateOutputDirectory,
    contract,
    contractSha256: sha256(contract),
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
    providerCallBudget: Object.freeze({
      maximumJobs: jobs.length,
      maximumCandidatesPerJob: plan.candidateCountPerCharacter,
      maximumCandidateOutputs:
        jobs.length * plan.candidateCountPerCharacter,
      retriesAuthorizedByThisPackage: 0,
      fallbackAuthorizedByThisPackage: false,
    }),
    jobs,
    executionPolicy: Object.freeze({
      canonicalProviderContractsCompiled: true,
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
      'Create a separate bounded execution authorization for only the intended runtime job ids and adapter.',
      'Submit only authorized runtime jobs through the existing Art Studio provider worker.',
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
    runtimeJobCount: runtimePackage.jobs.length,
    maximumCandidateOutputs:
      runtimePackage.providerCallBudget.maximumCandidateOutputs,
    providerExecutionAuthorized: false,
    fallbackAuthorized: false,
    candidateApprovalEstablished: false,
    candidatePromotionEstablished: false,
    runtimeActivationAllowed: false,
    websiteActivationAllowed: false,
  });
}
