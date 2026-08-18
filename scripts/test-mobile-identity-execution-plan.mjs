#!/usr/bin/env node
import assert from 'node:assert/strict';
import { compileMobileIdentityProductionBrief } from './mobile-identity-contract.mjs';
import { compileMobileIdentityProviderRequest } from './compile-mobile-identity-provider-request.mjs';
import { compileMobileIdentityExecutionPlan } from './compile-mobile-identity-execution-plan.mjs';

const RUNTIME_ENTRY = 'scripts/mobile-identity-provider-runtime-entry.mjs';
const RUNTIME_ENGINE = 'scripts/mobile-identity-provider-runtime.mjs';

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
const providerRequest = compileMobileIdentityProviderRequest(production, { comfyUiProfileId: 'godmode-icon' });
const input = {
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

const plan = compileMobileIdentityExecutionPlan(input);
assert.equal(plan.schema, 'evavo.mobile-identity-provider-execution-plan.v1');
assert.equal(plan.status, 'governed-execution-ready');
assert.equal(plan.provider.preferredAdapterId, 'openai-gpt-image');
assert.equal(plan.provider.preferredModel, 'gpt-image-2');
assert.deepEqual(plan.provider.allowedAdapterIds, ['openai-gpt-image', 'comfyui:godmode-icon']);
assert.equal(plan.runtime.schema, 'evavo.mobile-identity-provider-runtime-batch.v1');
assert.equal(plan.runtime.controlScript, RUNTIME_ENTRY);
assert.equal(plan.runtime.engineScript, RUNTIME_ENGINE);
assert.equal(plan.runtime.campaignMetadataRequired, false);
assert.equal(plan.runtime.gameMetadataRequired, false);
assert.equal(plan.runtime.repositoryRelativePlanPaths, true);
assert.equal(plan.runtime.absoluteEngineRootsResolvedByEntry, true);
assert.equal(plan.preparation.id, 'prepare');
assert.deepEqual(plan.preparation.argv.slice(0, 3), ['node', RUNTIME_ENTRY, 'prepare']);
assert.match(plan.preparation.command, /mobile-identity-provider-runtime-entry\.mjs prepare/u);
assert.match(plan.preparation.command, /--provider-request \.data\/mobile-identity\/provider-request\.json/u);
assert.deepEqual(plan.steps.map((step) => step.id), ['select', 'admit', 'authorize', 'execute']);
for (const [index, id] of ['select', 'admit', 'authorize', 'execute'].entries()) {
  assert.deepEqual(plan.steps[index].argv.slice(0, 3), ['node', RUNTIME_ENTRY, id]);
}
assert.match(plan.steps[2].command, /--allowed-adapters openai-gpt-image,comfyui:godmode-icon/u);
assert.match(plan.steps[3].command, /mobile-identity-provider-runtime-entry\.mjs execute/u);
assert.equal(plan.authority.bypassSelection, false);
assert.equal(plan.authority.bypassAdmission, false);
assert.equal(plan.authority.bypassAuthorization, false);
assert.equal(plan.authority.generationEqualsApproval, false);
assert.equal(plan.authority.runtimePublication, false);
assert.equal(plan.authority.deviceAuthority, false);
assert.equal(plan.authority.protocolAuthority, false);
assert.equal(plan.authority.forcePush, false);
assert.match(plan.executionPlanSha256, /^[a-f0-9]{64}$/u);

assert.throws(
  () => compileMobileIdentityExecutionPlan({ ...input, expiresAt: input.authorizedAt }),
  /expiresAt must be after authorizedAt/u,
);
assert.throws(
  () => compileMobileIdentityExecutionPlan({ ...input, paths: { ...input.paths, providerRequest: '../escape.json' } }),
  /repository-relative/u,
);
const badRequest = structuredClone(providerRequest);
badRequest.providerRequest.selection.allowedAdapterIds = ['gpt-image'];
badRequest.providerRequest.selection.preferredAdapterId = 'gpt-image';
assert.throws(
  () => compileMobileIdentityExecutionPlan({ ...input, providerRequest: badRequest }),
  /generic provider aliases/u,
);

console.log('Governed mobile identity provider execution plan contract passed.');
