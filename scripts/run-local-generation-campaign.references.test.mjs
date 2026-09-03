#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  requiredCapabilityProfile,
  runtimeJob,
  routeScene,
  validateLocalGenerationCampaign,
} from './run-local-generation-campaign.mjs';

const artifactA = `artifact_${'a'.repeat(64)}`;
const artifactB = `artifact_${'b'.repeat(64)}`;

function campaign(references = []) {
  return {
    schema: 'evavo.local-generation-campaign.v1',
    campaignId: 'reference-bridge-test',
    contentClass: 'general',
    subject: { description: 'A recurring production character' },
    provider: { baseUrl: 'http://127.0.0.1:8192', catalogPath: 'C:\\temp\\catalog.json', adapterId: 'comfyui:test-reference-profile' },
    defaults: { candidateCount: 1 },
    style: { styleName: 'test', intent: 'Specific project art direction.' },
    scenes: [{
      id: 'shot-001', prompt: 'Specific reference bridge test scene.', subject: 'A recurring production character',
      assetKind: 'illustration', continuityPhase: 'key-pose', candidateCount: 1, seed: 10,
      target: { width: 1024, height: 1024, transparency: 'opaque', outputFormat: 'png' }, references,
    }],
  };
}

test('V1 normalizes provider artifact references in canonical role order', () => {
  const validated = validateLocalGenerationCampaign(campaign([
    { artifactId: artifactB, role: 'previous-key-pose', strength: 0.7, required: true },
    { artifactId: artifactA, role: 'canonical-identity', strength: 1.2, required: true, note: 'identity anchor' },
  ]), {});
  assert.deepEqual(validated.scenes[0].references.map((ref) => ref.role), ['canonical-identity', 'previous-key-pose']);
  assert.equal(validated.scenes[0].references[0].artifactId, artifactA);
  assert.equal(validated.scenes[0].references[0].strength, 1.2);
});

test('V1 derives reference and role-specific routing capabilities exactly', () => {
  const scene = validateLocalGenerationCampaign(campaign([
    { artifactId: artifactA, role: 'canonical-identity', required: true },
    { artifactId: artifactB, role: 'previous-key-pose', required: true },
  ]), {}).scenes[0];
  assert.deepEqual(requiredCapabilityProfile(scene), [
    'cancellation', 'custom-size', 'generate', 'identity-reference', 'multiple-reference-images', 'reference-images', 'seed', 'temporal-reference',
  ]);
});

test('optional role reference does not demand its role-specific capability', () => {
  const scene = validateLocalGenerationCampaign(campaign([
    { artifactId: artifactA, role: 'palette-reference', required: false },
  ]), {}).scenes[0];
  assert.deepEqual(requiredCapabilityProfile(scene), ['cancellation', 'custom-size', 'generate', 'reference-images', 'seed']);
});

test('runtime job passes reference descriptors and unique artifact IDs without fallback', () => {
  const scene = validateLocalGenerationCampaign(campaign([
    { artifactId: artifactA, role: 'canonical-identity', required: true },
    { artifactId: artifactA, role: 'palette-reference', required: false },
  ]), {}).scenes[0];
  const route = { adapterId: 'comfyui:test-reference-profile', modelId: 'test-model', requiredCapabilities: requiredCapabilityProfile(scene) };
  const job = runtimeJob({ campaignId: 'reference-bridge-test', contentClass: 'general' }, scene, route, 'run-1');
  assert.equal(job.payload.references.length, 2);
  assert.deepEqual(job.inputArtifacts, [artifactA]);
  assert.equal(job.payload.selection.allowFallback, false);
  assert.deepEqual(job.requiredCapabilityProfile, route.requiredCapabilities);
});

test('invalid and duplicate references fail closed', () => {
  assert.throws(() => validateLocalGenerationCampaign(campaign([{ artifactId: 'bad', role: 'canonical-identity' }]), {}), /artifact_<sha256>/u);
  assert.throws(() => validateLocalGenerationCampaign(campaign([
    { artifactId: artifactA, role: 'canonical-identity' },
    { artifactId: artifactA, role: 'canonical-identity' },
  ]), {}), /duplicate/u);
});

test('generation-only V1 rejects mask references before provider routing', () => {
  assert.throws(() => validateLocalGenerationCampaign(campaign([
    { artifactId: artifactA, role: 'mask', required: true },
  ]), {}), /may not contain mask/u);
});

test('continuity-locked sprite work requires a required canonical identity reference', () => {
  const input = campaign([{ artifactId: artifactA, role: 'previous-key-pose', required: true }]);
  input.scenes[0].assetKind = 'sprite-frame';
  input.scenes[0].continuityPhase = 'key-pose';
  assert.throws(() => validateLocalGenerationCampaign(input, {}), /requires canonical-identity/u);

  const valid = campaign([
    { artifactId: artifactA, role: 'canonical-identity', required: true },
    { artifactId: artifactB, role: 'previous-key-pose', required: true },
  ]);
  valid.scenes[0].assetKind = 'sprite-frame';
  valid.scenes[0].continuityPhase = 'key-pose';
  assert.equal(validateLocalGenerationCampaign(valid, {}).scenes[0].references[0].role, 'canonical-identity');
});

test('in-between work requires both required temporal key-pose references', () => {
  const incomplete = campaign([
    { artifactId: artifactA, role: 'canonical-identity', required: true },
    { artifactId: artifactB, role: 'previous-key-pose', required: true },
  ]);
  incomplete.scenes[0].assetKind = 'sprite-frame';
  incomplete.scenes[0].continuityPhase = 'in-between';
  assert.throws(() => validateLocalGenerationCampaign(incomplete, {}), /previous-key-pose and next-key-pose/u);

  const complete = campaign([
    { artifactId: artifactA, role: 'canonical-identity', required: true },
    { artifactId: artifactA, role: 'previous-key-pose', required: true },
    { artifactId: artifactB, role: 'next-key-pose', required: true },
  ]);
  complete.scenes[0].assetKind = 'sprite-frame';
  complete.scenes[0].continuityPhase = 'in-between';
  const scene = validateLocalGenerationCampaign(complete, {}).scenes[0];
  assert.ok(scene.references.some((reference) => reference.role === 'next-key-pose'));
});


test('routing fails closed when reviewed profile reference capacity is below the scene requirement', () => {
  const scene = validateLocalGenerationCampaign(campaign([
    { artifactId: artifactA, role: 'canonical-identity', required: true },
    { artifactId: artifactB, role: 'previous-key-pose', required: true },
  ]), {}).scenes[0];
  const required = requiredCapabilityProfile(scene);
  const profile = {
    profileId: 'test-reference-profile',
    modelId: 'test-model',
    priority: 100,
    operations: ['generate'],
    assetKinds: ['illustration'],
    continuityPhases: ['key-pose'],
    capabilities: required,
    limits: { maximumCandidates: 4, maximumReferenceImages: 1 },
  };
  assert.throws(() => routeScene({ profiles: [profile] }, scene), /no reviewed local ComfyUI profile/u);

  profile.limits.maximumReferenceImages = 2;
  const route = routeScene({ profiles: [profile] }, scene);
  assert.equal(route.profileId, 'test-reference-profile');
  assert.deepEqual(route.requiredCapabilities, required);
});

test('routing rejects a reference-capable profile with an undeclared reference-image limit', () => {
  const scene = validateLocalGenerationCampaign(campaign([
    { artifactId: artifactA, role: 'canonical-identity', required: true },
  ]), {}).scenes[0];
  const required = requiredCapabilityProfile(scene);
  const profile = {
    profileId: 'test-reference-profile',
    modelId: 'test-model',
    operations: ['generate'],
    assetKinds: ['illustration'],
    continuityPhases: ['key-pose'],
    capabilities: required,
    limits: { maximumCandidates: 4 },
  };
  assert.throws(() => routeScene({ profiles: [profile] }, scene), /no reviewed local ComfyUI profile/u);
});

test('sprite direction-master may establish the master without a prior canonical identity reference', () => {
  const input = campaign([]);
  input.scenes[0].assetKind = 'sprite-frame';
  input.scenes[0].continuityPhase = 'direction-master';
  const scene = validateLocalGenerationCampaign(input, {}).scenes[0];
  assert.equal(scene.continuityPhase, 'direction-master');
  assert.deepEqual(scene.references, []);
});

