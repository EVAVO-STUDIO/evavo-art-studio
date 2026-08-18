#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileMobileIdentityProductionBrief } from './mobile-identity-contract.mjs';
import { compileMobileIdentityProviderRequest } from './compile-mobile-identity-provider-request.mjs';
import { compileMobileIdentityExecutionPlan } from './compile-mobile-identity-execution-plan.mjs';
import {
  createOpenAIProviderExecutionEnvironment,
  validateMobileIdentityProviderExecutionPlan,
} from './run-mobile-identity-provider-plan.mjs';

const RUNTIME_SCRIPT = 'scripts/mobile-identity-provider-runtime.mjs';
const production = compileMobileIdentityProductionBrief({
  app: { name: 'GODMODE', purpose: 'Premium EVAVO companion for Chronus M02S smart glasses.', productFamily: 'EVAVO Glasses' },
  brand: { studio: 'EVAVO Studio', palette: ['#060608', '#F7F7F9', '#FF244E'], principles: ['crafted, restrained, premium', 'never generic AI-looking'] },
  device: { family: 'Chronus M02S / M02SC251227A-YH', vendorCompanion: 'HeyCyan', usage: 'Primary companion identity beside HeyCyan.' },
  delivery: {
    ios1024: 'apps/mobile/ios/Resources/Assets.xcassets/AppIcon.appiconset/GODMODE-1024.png',
    androidAdaptiveForeground: 'apps/mobile/android/app/src/main/res/drawable/ic_launcher_foreground.xml',
    androidNotification: 'apps/mobile/android/app/src/main/res/drawable/ic_notification_glasses.xml',
  },
  candidateCount: 6,
  providerPreference: ['openai-gpt-image', 'comfyui'],
  preferredOpenAIModel: 'gpt-image-2',
  creativeMasterType: 'raster-provider-generation',
});
const providerRequest = compileMobileIdentityProviderRequest(production);
const baseInput = {
  providerRequest,
  workOrderId: 'godmode-mobile-identity-work-order',
  actor: 'evavo-mobile-identity-orchestrator',
  selectedAt: '2026-08-18T09:15:00Z',
  admittedAt: '2026-08-18T09:15:05Z',
  authorizedAt: '2026-08-18T09:15:10Z',
  expiresAt: '2026-08-18T09:45:10Z',
  paths: {
    providerRequest: '.data/mobile-identity/provider-request.json',
    runtimeBatch: '.data/mobile-identity/runtime-batch.json',
    selection: '.data/mobile-identity/selection.json',
    admissionReceipt: '.data/mobile-identity/admission.json',
    authorization: '.data/mobile-identity/authorization.json',
    executionReceipt: '.data/mobile-identity/execution.json',
    runtimeRoot: '.data/runtime',
    artifactRoot: '.data/artifacts',
  },
};
const plan = compileMobileIdentityExecutionPlan(baseInput);

const validated = validateMobileIdentityProviderExecutionPlan(plan);
assert.equal(validated.runtime.controlScript, RUNTIME_SCRIPT);
assert.equal(validated.runtime.gameMetadataRequired, false);
assert.equal(validated.runtime.campaignMetadataRequired, false);
assert.deepEqual(validated.preparation.argv.slice(0, 3), ['node', RUNTIME_SCRIPT, 'prepare']);
assert.deepEqual(validated.steps.map((step) => step.id), ['select', 'admit', 'authorize', 'execute']);
assert.deepEqual(validated.steps.map((step) => step.argv.slice(0, 3)), [
  ['node', RUNTIME_SCRIPT, 'select'],
  ['node', RUNTIME_SCRIPT, 'admit'],
  ['node', RUNTIME_SCRIPT, 'authorize'],
  ['node', RUNTIME_SCRIPT, 'execute'],
]);
assert.deepEqual(validated.provider.allowedAdapterIds, ['openai-gpt-image']);
assert.equal(validated.provider.preferredAdapterId, 'openai-gpt-image');
assert.equal(validated.provider.preferredModel, 'gpt-image-2');

const providerEnv = createOpenAIProviderExecutionEnvironment({
  PATH: process.env.PATH ?? '',
  OPENAI_API_KEY: 'test-provider-key-not-a-real-secret',
  OPENAI_PROJECT: 'project-test',
  NODE_OPTIONS: '--require /tmp/evil.js',
  GITHUB_TOKEN: 'github_pat_should_not_cross_provider_boundary',
  EVAVO_ART_COMFYUI_API_TOKEN: 'comfyui-token-must-not-cross',
});
assert.equal(providerEnv.OPENAI_API_KEY, 'test-provider-key-not-a-real-secret');
assert.equal(providerEnv.OPENAI_PROJECT, 'project-test');
assert.equal(providerEnv.EVAVO_ART_OPENAI_IMAGE_MODEL, 'gpt-image-2');
assert.equal(providerEnv.EVAVO_ART_OPENAI_IMAGE_MODELS, 'gpt-image-2,gpt-image-2-2026-04-21');
assert.equal(providerEnv.NODE_OPTIONS, undefined);
assert.equal(providerEnv.GITHUB_TOKEN, undefined);
assert.equal(providerEnv.EVAVO_ART_COMFYUI_API_TOKEN, undefined);
assert.equal(providerEnv.EVAVO_ART_OPENAI_BASE_URL, undefined);

assert.throws(
  () => createOpenAIProviderExecutionEnvironment({
    PATH: process.env.PATH ?? '',
    OPENAI_API_KEY: 'test-provider-key-not-a-real-secret',
    EVAVO_ART_OPENAI_BASE_URL: 'https://example.invalid/v1',
  }),
  /BASE_URL is forbidden/u,
);
assert.throws(
  () => createOpenAIProviderExecutionEnvironment({ PATH: process.env.PATH ?? '' }),
  /OPENAI_API_KEY/u,
);
const mutated = structuredClone(plan);
mutated.steps[3].argv[1] = 'scripts/not-reviewed.mjs';
assert.throws(() => validateMobileIdentityProviderExecutionPlan(mutated), /executionPlanSha256 mismatch|mobile-identity-provider-runtime/u);

const fallbackRequest = compileMobileIdentityProviderRequest(production, { comfyUiProfileId: 'godmode-icon' });
const fallbackPlan = compileMobileIdentityExecutionPlan({ ...baseInput, providerRequest: fallbackRequest });
assert.throws(
  () => validateMobileIdentityProviderExecutionPlan(fallbackPlan),
  /requires exactly the openai-gpt-image adapter/u,
);

console.log('Governed mobile identity provider runner contract passed.');
