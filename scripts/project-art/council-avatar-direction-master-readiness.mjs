import path from 'node:path';

import { LocalArtifactStore } from '../../packages/artifacts/dist/index.js';
import { createProviderRegistryFromEnvironment } from '../../apps/worker/dist/provider-handlers.js';
import { compileCouncilAvatarDirectionMasterRuntimePackage } from './council-avatar-direction-master-runtime.mjs';
import { validateCouncilAvatarIdentityLockApproval } from './council-avatar-identity-lock-approval.mjs';

export const COUNCIL_AVATAR_DIRECTION_MASTER_READINESS_SCHEMA =
  'evavo.project-art-council-avatar-direction-master-readiness.v1';

const SECRET_NAMES = Object.freeze([
  'OPENAI_API_KEY',
  'OPENAI_ORGANIZATION',
  'OPENAI_PROJECT',
  'EVAVO_ART_COMFYUI_API_TOKEN',
]);

function present(environment, name) {
  return typeof environment[name] === 'string' && environment[name].trim().length > 0;
}

function assertNoSecrets(value, environment) {
  const encoded = JSON.stringify(value);
  for (const name of SECRET_NAMES) {
    const secret = environment[name]?.trim();
    if (secret && encoded.includes(secret)) {
      throw new Error(`COUNCIL_DIRECTION_READINESS_SECRET_LEAK:${name}`);
    }
  }
}

function descriptorSummary(descriptor) {
  return Object.freeze({
    id: descriptor.id,
    version: descriptor.version,
    models: Object.freeze([...descriptor.models]),
    capabilities: Object.freeze([...descriptor.capabilities]),
    maximumCandidates: descriptor.maximumCandidates,
  });
}

export async function inspectCouncilAvatarDirectionMasterReadiness({
  identityLockApproval,
  artifactRoot,
  environment = process.env,
} = {}) {
  const approval = validateCouncilAvatarIdentityLockApproval(identityLockApproval);
  const runtimePackage = compileCouncilAvatarDirectionMasterRuntimePackage({
    identityLockApproval: approval,
  });
  const store = new LocalArtifactStore({ root: path.resolve(artifactRoot) });
  const identityArtifacts = [];
  const artifactBlockers = [];
  for (const lock of approval.locks) {
    const [descriptor, verification] = await Promise.all([
      store.get(lock.masteredArtifactId),
      store.verify(lock.masteredArtifactId),
    ]);
    const descriptorMatches = Boolean(
      descriptor && descriptor.descriptorSha256 === lock.masteredDescriptorSha256,
    );
    const contentMatches = Boolean(
      descriptor && descriptor.contentSha256 === lock.masteredContentSha256,
    );
    const stateValid = Boolean(
      descriptor &&
      descriptor.mediaType === 'image/png' &&
      descriptor.storageClass === 'intermediate' &&
      descriptor.labels.artifactRole === 'provider-candidate-alpha-master' &&
      descriptor.labels.approvalState === 'unapproved' &&
      descriptor.labels.qualityState === 'passed',
    );
    const ready = Boolean(
      descriptor &&
      verification.exists &&
      verification.descriptorValid &&
      verification.contentValid &&
      descriptorMatches &&
      contentMatches &&
      stateValid,
    );
    if (!ready) artifactBlockers.push(`identity-artifact-not-ready:${lock.characterId}`);
    identityArtifacts.push(Object.freeze({
      characterId: lock.characterId,
      artifactId: lock.masteredArtifactId,
      exists: verification.exists,
      descriptorValid: verification.descriptorValid,
      contentValid: verification.contentValid,
      descriptorMatchesApproval: descriptorMatches,
      contentMatchesApproval: contentMatches,
      stateValid,
      ready,
    }));
  }

  let registry;
  let workerImportReady = false;
  let registryError = null;
  try {
    registry = createProviderRegistryFromEnvironment(environment);
    workerImportReady = true;
  } catch (error) {
    registryError = error instanceof Error ? error.message : String(error);
  }
  const descriptors = registry
    ? Object.freeze(registry.list().map(descriptorSummary))
    : Object.freeze([]);
  const desiredAdapter = descriptors.find(
    (descriptor) => descriptor.id === runtimePackage.preferredAdapterId,
  );
  const adapterRegistered = Boolean(desiredAdapter);
  const modelRegistered = Boolean(
    desiredAdapter?.models.includes(runtimePackage.preferredModel),
  );
  const requiredCapabilities = new Set(
    runtimePackage.jobs.flatMap(
      (job) => job.canonicalContract.requiredAdapterCapabilities,
    ),
  );
  const missingCapabilities = desiredAdapter
    ? [...requiredCapabilities].filter(
        (capability) => !desiredAdapter.capabilities.includes(capability),
      )
    : [...requiredCapabilities];
  const adapterCapabilityReady = adapterRegistered && missingCapabilities.length === 0;
  const providerQueueEligible = descriptors.length > 0;
  const identityArtifactsReady = identityArtifacts.every((entry) => entry.ready);
  const configuredWithoutSpend =
    workerImportReady &&
    adapterRegistered &&
    modelRegistered &&
    adapterCapabilityReady &&
    providerQueueEligible &&
    identityArtifactsReady;

  const blockers = [...artifactBlockers];
  if (!workerImportReady) blockers.push('worker-provider-registry-not-ready');
  if (!present(environment, 'OPENAI_API_KEY')) blockers.push('openai-api-key-not-configured');
  if (workerImportReady && !adapterRegistered) blockers.push('preferred-adapter-not-registered');
  if (adapterRegistered && !modelRegistered) blockers.push('preferred-model-not-registered');
  if (adapterRegistered && !adapterCapabilityReady) blockers.push('required-adapter-capabilities-missing');
  if (workerImportReady && !providerQueueEligible) blockers.push('provider-queue-not-eligible');

  const result = Object.freeze({
    schema: COUNCIL_AVATAR_DIRECTION_MASTER_READINESS_SCHEMA,
    zeroSpendInspection: true,
    remoteProviderCallPerformed: false,
    providerExecutionAuthorized: false,
    directionMasterApprovalEstablished: false,
    candidatePromotionEstablished: false,
    runtimeActivationAllowed: false,
    websiteActivationAllowed: false,
    identityApprovalSha256: approval.approvalSha256,
    runtimePackageSha256: runtimePackage.runtimePackageSha256,
    artifactRoot: path.resolve(artifactRoot),
    desired: Object.freeze({
      adapterId: runtimePackage.preferredAdapterId,
      model: runtimePackage.preferredModel,
      jobCount: runtimePackage.jobs.length,
      maximumCandidateOutputs: runtimePackage.providerCallBudget.maximumCandidateOutputs,
      maximumAttemptsPerJob: 1,
      fallbackAuthorized: false,
      requiredAdapterCapabilities: Object.freeze([...requiredCapabilities].sort()),
    }),
    environment: Object.freeze({
      openAiApiKeyConfigured: present(environment, 'OPENAI_API_KEY'),
      openAiImageModelConfigured: present(environment, 'EVAVO_ART_OPENAI_IMAGE_MODEL'),
      openAiImageModelsConfigured: present(environment, 'EVAVO_ART_OPENAI_IMAGE_MODELS'),
      customOpenAiBaseUrlConfigured: present(environment, 'EVAVO_ART_OPENAI_BASE_URL'),
    }),
    worker: Object.freeze({
      importReady: workerImportReady,
      providerQueueEligible,
      registryErrorClass: registryError ? 'provider-registry-initialization-failed' : null,
    }),
    adapters: descriptors,
    identityArtifacts: Object.freeze(identityArtifacts),
    readiness: Object.freeze({
      identityArtifactsReady,
      adapterRegistered,
      modelRegistered,
      adapterCapabilityReady,
      missingCapabilities: Object.freeze(missingCapabilities.sort()),
      configuredWithoutSpend,
      remoteCallabilityVerified: false,
      readyForBoundedExecutionAuthorization: configuredWithoutSpend && blockers.length === 0,
    }),
    blockers: Object.freeze([...new Set(blockers)].sort()),
    nextActions: Object.freeze(
      configuredWithoutSpend
        ? [
            'Create a separate short-lived direction-master execution authorization bound to the exact normalized runtime specs.',
            'Run only explicitly authorized direction jobs through the dedicated Council provider worker.',
            'Keep all resulting direction candidates unapproved until technical mastering and independent continuity review complete.',
          ]
        : [
            'Restore or verify the exact approved identity artifacts in the execution artifact store.',
            'Build the Art Studio provider/runtime/worker packages and configure the provider environment.',
            'Run this zero-spend direction readiness inspection again before creating execution authorization.',
          ],
    ),
  });
  assertNoSecrets(result, environment);
  return result;
}
