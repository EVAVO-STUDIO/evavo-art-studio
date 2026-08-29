import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectCouncilAvatarProviderReadiness } from './project-art/council-avatar-provider-readiness.mjs';

const FAKE_SECRET = 'sk-test-council-avatar-readiness-never-print-this';

function minimalEnvironment(overrides = {}) {
  return Object.freeze({
    OPENAI_API_KEY: FAKE_SECRET,
    EVAVO_ART_OPENAI_IMAGE_MODEL: 'gpt-image-2',
    EVAVO_ART_OPENAI_IMAGE_MODELS: 'gpt-image-2,gpt-image-2-2026-04-21',
    ...overrides,
  });
}

test('zero-spend readiness registers the desired OpenAI image route without a provider call', async () => {
  const result = await inspectCouncilAvatarProviderReadiness({
    environment: minimalEnvironment(),
  });

  assert.equal(result.zeroSpendInspection, true);
  assert.equal(result.remoteProviderCallPerformed, false);
  assert.equal(result.providerExecutionAuthorized, false);
  assert.equal(result.desired.adapterId, 'openai-gpt-image');
  assert.equal(result.desired.model, 'gpt-image-2');
  assert.equal(result.desired.jobCount, 2);
  assert.equal(result.desired.maximumCandidateOutputs, 8);
  assert.equal(result.desired.fallbackAuthorized, false);
  assert.equal(result.desired.retriesAuthorized, 0);
  assert.equal(result.environment.openAiApiKeyConfigured, true);
  assert.equal(result.worker.importReady, true);
  assert.equal(result.worker.providerQueueEligible, true);
  assert.equal(result.readiness.adapterRegistered, true);
  assert.equal(result.readiness.modelRegistered, true);
  assert.equal(result.readiness.adapterCapabilityReady, true);
  assert.deepEqual(result.readiness.missingCapabilities, []);
  assert.equal(result.readiness.configuredWithoutSpend, true);
  assert.equal(result.readiness.remoteCallabilityVerified, false);
  assert.equal(result.readiness.readyForBoundedExecutionAuthorization, true);
  assert.deepEqual(result.blockers, []);

  const openAi = result.adapters.find((entry) => entry.id === 'openai-gpt-image');
  assert.ok(openAi);
  assert.ok(openAi.models.includes('gpt-image-2'));
  assert.ok(openAi.capabilities.includes('generate'));
  assert.ok(openAi.capabilities.includes('candidate-count'));
  assert.ok(openAi.capabilities.includes('cancellation'));
});

test('readiness output never contains provider credential values', async () => {
  const environment = minimalEnvironment({
    OPENAI_ORGANIZATION: 'org-secret-test-value',
    OPENAI_PROJECT: 'proj-secret-test-value',
    EVAVO_ART_COMFYUI_API_TOKEN: 'comfy-secret-test-value',
  });
  const result = await inspectCouncilAvatarProviderReadiness({ environment });
  const serialized = JSON.stringify(result);

  for (const secret of [
    FAKE_SECRET,
    'org-secret-test-value',
    'proj-secret-test-value',
    'comfy-secret-test-value',
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(result.environment.openAiOrganizationConfigured, true);
  assert.equal(result.environment.openAiProjectConfigured, true);
});

test('missing OpenAI credential fails closed before bounded authorization', async () => {
  const result = await inspectCouncilAvatarProviderReadiness({
    environment: minimalEnvironment({ OPENAI_API_KEY: '' }),
  });

  assert.equal(result.environment.openAiApiKeyConfigured, false);
  assert.equal(result.readiness.adapterRegistered, false);
  assert.equal(result.readiness.modelRegistered, false);
  assert.equal(result.readiness.configuredWithoutSpend, false);
  assert.equal(result.readiness.readyForBoundedExecutionAuthorization, false);
  assert.ok(result.blockers.includes('openai-api-key-not-configured'));
  assert.ok(result.blockers.includes('preferred-adapter-not-registered'));
});

test('model allowlist drift is visible without provider execution', async () => {
  const result = await inspectCouncilAvatarProviderReadiness({
    environment: minimalEnvironment({
      EVAVO_ART_OPENAI_IMAGE_MODEL: 'gpt-image-2-2026-04-21',
      EVAVO_ART_OPENAI_IMAGE_MODELS: 'gpt-image-2-2026-04-21',
    }),
  });

  assert.equal(result.readiness.adapterRegistered, true);
  assert.equal(result.readiness.modelRegistered, false);
  assert.equal(result.readiness.configuredWithoutSpend, false);
  assert.equal(result.readiness.readyForBoundedExecutionAuthorization, false);
  assert.ok(result.blockers.includes('preferred-model-not-registered'));
});
