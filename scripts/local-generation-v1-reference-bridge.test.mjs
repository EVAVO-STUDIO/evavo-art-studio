#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  requiredCapabilityProfile,
  routeScene,
  runtimeJob,
  validateLocalGenerationCampaign,
} from './run-local-generation-campaign.mjs';

const artifactA = `artifact_${'a'.repeat(64)}`;
const artifactB = `artifact_${'b'.repeat(64)}`;

function manifest(references) {
  return {
    schema: 'evavo.local-generation-campaign.v1',
    campaignId: 'reference-bridge-test',
    contentClass: 'general',
    subject: { description: 'A fictional adult test subject.' },
    provider: {
      baseUrl: 'http://127.0.0.1:8192',
      catalogPath: 'C:\\Temp\\catalog.json',
    },
    defaults: {
      assetKind: 'illustration',
      continuityPhase: 'independent',
      candidateCount: 1,
      seed: 187100,
      target: { width: 1024, height: 1024, transparency: 'opaque', outputFormat: 'png' },
    },
    style: {
      styleName: 'Reference bridge test',
      intent: 'Preserve a concrete, consistent subject and composition.',
    },
    scenes: [
      {
        id: 'shot-001',
        prompt: 'A concrete cinematic character portrait with deliberate camera placement and stable facial geometry.',
        references,
      },
    ],
  };
}

function profile({ maximumReferenceImages = 4, capabilities }) {
  return {
    profileId: 'reference-capable-test',
    priority: 100,
    operations: ['generate'],
    assetKinds: ['illustration'],
    continuityPhases: ['independent'],
    capabilities,
    limits: { maximumCandidates: 4, maximumReferenceImages },
    modelId: 'test-model',
    profileSha256: 'c'.repeat(64),
  };
}

test('V1 bridge derives reference capabilities and routes only to a capable reviewed profile', () => {
  const campaign = validateLocalGenerationCampaign(manifest([
    { artifactId: artifactA, role: 'canonical-identity', strength: 0.85, required: true },
  ]));
  const scene = campaign.scenes[0];
  assert.deepEqual(requiredCapabilityProfile(scene), [
    'cancellation',
    'custom-size',
    'generate',
    'identity-reference',
    'reference-images',
    'seed',
  ]);

  assert.throws(
    () => routeScene({ profiles: [profile({
      maximumReferenceImages: 0,
      capabilities: ['generate', 'cancellation', 'seed', 'custom-size', 'reference-images', 'identity-reference'],
    })] }, scene),
    /no reviewed local ComfyUI profile/u,
  );

  const route = routeScene({ profiles: [profile({
    maximumReferenceImages: 1,
    capabilities: ['generate', 'cancellation', 'seed', 'custom-size', 'reference-images', 'identity-reference'],
  })] }, scene);
  assert.equal(route.adapterId, 'comfyui:reference-capable-test');
});

test('V1 runtime job carries the same typed references and unique artifact IDs into durable runtime inputs', () => {
  const campaign = validateLocalGenerationCampaign(manifest([
    { artifactId: artifactA, role: 'canonical-identity', strength: 0.9, required: true, note: 'identity anchor' },
    { artifactId: artifactB, role: 'palette-reference', strength: 0.6, required: false },
    { artifactId: artifactA, role: 'palette-reference', strength: 0.5, required: false },
  ]));
  const scene = campaign.scenes[0];
  const route = routeScene({ profiles: [profile({
    maximumReferenceImages: 3,
    capabilities: [
      'generate', 'cancellation', 'seed', 'custom-size',
      'reference-images', 'multiple-reference-images', 'identity-reference',
    ],
  })] }, scene);
  const job = runtimeJob(campaign, scene, route, 'run_reference_bridge');

  assert.deepEqual(job.payload.references, scene.references);
  assert.deepEqual(job.inputArtifacts, [artifactA, artifactB]);
  assert.equal(job.payload.metadata.referenceCount, 3);
  assert.equal(job.payload.selection.allowFallback, false);
  assert.deepEqual(job.requiredCapabilityProfile, route.requiredCapabilities);
});

test('V1 bridge keeps semantic generation reference rules fail-closed', () => {
  assert.throws(
    () => validateLocalGenerationCampaign(manifest([{ artifactId: artifactA, role: 'mask' }])),
    /may not contain mask/u,
  );

  const sprite = manifest([{ artifactId: artifactA, role: 'direction-master' }]);
  sprite.defaults.assetKind = 'sprite-frame';
  sprite.defaults.continuityPhase = 'key-pose';
  assert.throws(() => validateLocalGenerationCampaign(sprite), /canonical-identity/u);

  const inbetween = manifest([{ artifactId: artifactA, role: 'previous-key-pose' }]);
  inbetween.defaults.continuityPhase = 'in-between';
  assert.throws(() => validateLocalGenerationCampaign(inbetween), /previous-key-pose and next-key-pose/u);
});
