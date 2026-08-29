import { compileCouncilAvatarProviderRuntimePackage } from './council-avatar-provider-runtime.mjs';

export const COUNCIL_AVATAR_PROVIDER_READINESS_SCHEMA =
  'evavo.project-art-council-avatar-provider-readiness.v1';

const SECRET_NAMES = Object.freeze([
  'OPENAI_API_KEY',
  'OPENAI_ORGANIZATION',
  'OPENAI_PROJECT',
  'EVAVO_ART_COMFYUI_API_TOKEN',
]);

function present(environment, name) {
  return typeof environment[name] === 'string' && environment[name].trim().length > 0;
}

function sanitizedEnvironmentSummary(environment) {
  return Object.freeze({
    openAiApiKeyConfigured: present(environment, 'OPENAI_API_KEY'),
    openAiOrganizationConfigured: present(environment, 'OPENAI_ORGANIZATION'),
    openAiProjectConfigured: present(environment, 'OPENAI_PROJECT'),
    openAiImageModelConfigured: present(
      environment,
      'EVAVO_ART_OPENAI_IMAGE_MODEL',
    ),
    openAiImageModelsConfigured: present(
      environment,
      'EVAVO_ART_OPENAI_IMAGE_MODELS',
    ),
    customOpenAiBaseUrlConfigured: present(
      environment,
      'EVAVO_ART_OPENAI_BASE_URL',
    ),
    comfyUiCatalogConfigured: present(environment, 'EVAVO_ART_COMFYUI_CATALOG'),
  });
}

function assertNoSecretValues(value, environment) {
  const encoded = JSON.stringify(value);
  for (const name of SECRET_NAMES) {
    const secret = environment[name]?.trim();
    if (secret && encoded.includes(secret)) {
      throw new Error(`COUNCIL_AVATAR_PROVIDER_READINESS_SECRET_LEAK:${name}`);
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

export async function inspectCouncilAvatarProviderReadiness({
  environment = process.env,
} = {}) {
  const runtimePackage = compileCouncilAvatarProviderRuntimePackage();
  const desiredAdapterId = runtimePackage.preferredAdapterId;
  const desiredModel = runtimePackage.preferredModel;

  let registry;
  let workerImportReady = false;
  let registryError = null;
  try {
    const workerProviders = await import(
      '../../apps/worker/dist/provider-handlers.js'
    );
    workerImportReady = true;
    registry = workerProviders.createProviderRegistryFromEnvironment(environment);
  } catch (error) {
    registryError = error instanceof Error ? error.message : String(error);
  }

  const descriptors = registry
    ? Object.freeze(registry.list().map(descriptorSummary))
    : Object.freeze([]);
  const desiredAdapter = descriptors.find(
    (descriptor) => descriptor.id === desiredAdapterId,
  );
  const adapterRegistered = desiredAdapter !== undefined;
  const modelRegistered = Boolean(
    desiredAdapter?.models.includes(desiredModel),
  );
  const requiredCapabilities = new Set(
    runtimePackage.jobs.flatMap(
      (job) => job.contract.requiredAdapterCapabilities,
    ),
  );
  const missingCapabilities = desiredAdapter
    ? [...requiredCapabilities].filter(
        (capability) => !desiredAdapter.capabilities.includes(capability),
      )
    : [...requiredCapabilities];
  const adapterCapabilityReady =
    adapterRegistered && missingCapabilities.length === 0;
  const providerQueueEligible = descriptors.length > 0;
  const configuredWithoutSpend =
    workerImportReady &&
    adapterRegistered &&
    modelRegistered &&
    adapterCapabilityReady &&
    providerQueueEligible;

  const blockers = [];
  if (!workerImportReady) blockers.push('worker-build-not-ready');
  if (!present(environment, 'OPENAI_API_KEY')) {
    blockers.push('openai-api-key-not-configured');
  }
  if (workerImportReady && !adapterRegistered) {
    blockers.push('preferred-adapter-not-registered');
  }
  if (adapterRegistered && !modelRegistered) {
    blockers.push('preferred-model-not-registered');
  }
  if (adapterRegistered && !adapterCapabilityReady) {
    blockers.push('required-adapter-capabilities-missing');
  }
  if (workerImportReady && !providerQueueEligible) {
    blockers.push('provider-queue-not-eligible');
  }

  const result = Object.freeze({
    schema: COUNCIL_AVATAR_PROVIDER_READINESS_SCHEMA,
    zeroSpendInspection: true,
    remoteProviderCallPerformed: false,
    providerExecutionAuthorized: false,
    candidateApprovalEstablished: false,
    candidatePromotionEstablished: false,
    runtimeActivationAllowed: false,
    productionProgramSha256: runtimePackage.productionProgramSha256,
    candidatePlanSha256: runtimePackage.candidatePlanSha256,
    runtimePackageSha256: runtimePackage.runtimePackageSha256,
    desired: Object.freeze({
      adapterId: desiredAdapterId,
      model: desiredModel,
      jobCount: runtimePackage.jobs.length,
      maximumCandidateOutputs:
        runtimePackage.providerCallBudget.maximumCandidateOutputs,
      fallbackAuthorized: false,
      retriesAuthorized: 0,
      requiredAdapterCapabilities: Object.freeze([...requiredCapabilities].sort()),
    }),
    environment: sanitizedEnvironmentSummary(environment),
    worker: Object.freeze({
      importReady: workerImportReady,
      providerQueueEligible,
      registryErrorClass: registryError
        ? 'provider-registry-initialization-failed'
        : null,
    }),
    adapters: descriptors,
    readiness: Object.freeze({
      adapterRegistered,
      modelRegistered,
      adapterCapabilityReady,
      missingCapabilities: Object.freeze(missingCapabilities.sort()),
      configuredWithoutSpend,
      remoteCallabilityVerified: false,
      readyForBoundedExecutionAuthorization:
        configuredWithoutSpend && blockers.length === 0,
    }),
    blockers: Object.freeze([...new Set(blockers)].sort()),
    nextActions: Object.freeze(
      configuredWithoutSpend
        ? [
            'Create a separate bounded execution authorization for the exact Council identity runtime jobs.',
            'Perform at most the authorized provider calls through the existing Art Studio worker.',
            'Do not treat provider success as identity approval or runtime promotion.',
          ]
        : [
            'Build @evavo/art-providers and @evavo/art-studio-worker locally.',
            'Configure the missing provider environment settings on the Art Studio worker host.',
            'Run this zero-spend readiness inspection again before creating execution authorization.',
          ],
    ),
  });

  assertNoSecretValues(result, environment);
  return result;
}
