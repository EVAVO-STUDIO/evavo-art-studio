#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  requiredCapabilityProfile,
  routeScene,
  runtimeJob,
  validateLocalGenerationCampaign,
} from './run-local-generation-campaign.mjs';

const ARTIFACT_A = `artifact_${'a'.repeat(64)}`;
const ARTIFACT_B = `artifact_${'b'.repeat(64)}`;
const ARTIFACT_C = `artifact_${'c'.repeat(64)}`;

function manifestFor(scene) {
  return {
    schema: 'evavo.local-generation-campaign.v1',
    campaignId: 'reference-bridge-contract',
    contentClass: 'general',
    subject: {},
    provider: {
      baseUrl: 'http://127.0.0.1:8192',
      catalogPath: 'C:\\EVAVO\\comfyui\\catalog.json',
      adapterId: 'comfyui:reference-test',
    },
    defaults: {
      assetKind: 'illustration',
      continuityPhase: 'independent',
      candidateCount: 1,
      target: { width: 512, height: 512, transparency: 'opaque', outputFormat: 'png' },
    },
    style: {
      styleName: 'Reference bridge contract',
      intent: 'Keep test imagery deterministic and structurally consistent.',
      mustHave: ['clear subject'],
      mustAvoid: ['generic composition'],
    },
    scenes: [
      {
        id: 'shot-001',
        prompt: 'A clearly defined test subject in a controlled studio composition.',
        ...scene,
      },
    ],
  };
}

function profile(overrides = {}) {
  return {
    profileId: 'reference-test',
    modelId: 'sdxl-test',
    priority: 100,
    operations: ['generate'],
    assetKinds: ['illustration', 'sprite-frame', 'sprite-layer'],
    continuityPhases: ['independent', 'key-pose', 'in-between', 'repair'],
    capabilities: [
      'generate',
      'cancellation',
      'seed',
      'custom-size',
      'reference-images',
      'multiple-reference-images',
      'identity-reference',
      'direction-reference',
      'temporal-reference',
      'pose-control',
      'edge-control',
      'depth-control',
      'palette-reference',
      'line-reference',
      'material-reference',
      'layer-context-reference',
      'candidate-count',
    ],
    limits: { maximumCandidates: 16, maximumReferenceImages: 16 },
    ...overrides,
  };
}

test('typed provider references flow into runtime request and input artifacts', () => {
  const campaign = validateLocalGenerationCampaign(
    manifestFor({
      references: [
        { artifactId: ARTIFACT_A, role: 'canonical-identity', strength: 1.25, required: true, note: 'identity anchor' },
        { artifactId: ARTIFACT_B, role: 'pose-control', strength: 0.8, required: true },
        { artifactId: ARTIFACT_A, role: 'palette-reference', strength: 0.5, required: false },
      ],
    }),
  );
  const scene = campaign.scenes[0];
  const capabilities = requiredCapabilityProfile(scene);
  assert.deepEqual(capabilities, [
    'cancellation',
    'custom-size',
    'generate',
    'identity-reference',
    'multiple-reference-images',
    'pose-control',
    'reference-images',
    'seed',
  ]);

  const route = routeScene({ profiles: [profile()] }, scene);
  const job = runtimeJob(campaign, scene, route, 'run-reference-test');

  assert.deepEqual(job.payload.references, scene.references);
  assert.deepEqual(job.inputArtifacts, [ARTIFACT_A, ARTIFACT_B]);
  assert.equal(job.payload.metadata.referenceCount, 3);
  assert.deepEqual(job.requiredCapabilityProfile, capabilities);
  assert.equal(job.payload.selection.allowFallback, false);
});

test('optional reference roles do not demand role-specific provider capability', () => {
  const campaign = validateLocalGenerationCampaign(
    manifestFor({ references: [{ artifactId: ARTIFACT_A, role: 'pose-control', required: false }] }),
  );
  const capabilities = requiredCapabilityProfile(campaign.scenes[0]);
  assert.equal(capabilities.includes('reference-images'), true);
  assert.equal(capabilities.includes('pose-control'), false);
});

test('routing rejects a reviewed profile whose maximumReferenceImages is too small', () => {
  const campaign = validateLocalGenerationCampaign(
    manifestFor({
      references: [
        { artifactId: ARTIFACT_A, role: 'base-image', required: false },
        { artifactId: ARTIFACT_B, role: 'palette-reference', required: false },
      ],
    }),
  );
  assert.throws(
    () => routeScene({ profiles: [profile({ limits: { maximumCandidates: 16, maximumReferenceImages: 1 } })] }, campaign.scenes[0]),
    /no reviewed local ComfyUI profile can execute scene/u,
  );
});

test('generate-only V1 rejects mask references', () => {
  assert.throws(
    () => validateLocalGenerationCampaign(
      manifestFor({ references: [{ artifactId: ARTIFACT_A, role: 'mask', required: true }] }),
    ),
    /may not contain mask/u,
  );
});

test('continuity-locked sprite work requires a required canonical identity reference', () => {
  assert.throws(
    () => validateLocalGenerationCampaign(
      manifestFor({
        assetKind: 'sprite-frame',
        continuityPhase: 'key-pose',
        references: [{ artifactId: ARTIFACT_A, role: 'palette-reference', required: true }],
      }),
    ),
    /requires canonical-identity/u,
  );

  const valid = validateLocalGenerationCampaign(
    manifestFor({
      assetKind: 'sprite-frame',
      continuityPhase: 'key-pose',
      references: [{ artifactId: ARTIFACT_A, role: 'canonical-identity', required: true }],
    }),
  );
  assert.equal(valid.scenes[0].references[0].role, 'canonical-identity');
});

test('in-between work requires both previous and next key pose references', () => {
  assert.throws(
    () => validateLocalGenerationCampaign(
      manifestFor({
        continuityPhase: 'in-between',
        references: [{ artifactId: ARTIFACT_A, role: 'previous-key-pose', required: true }],
      }),
    ),
    /requires previous-key-pose and next-key-pose/u,
  );

  const valid = validateLocalGenerationCampaign(
    manifestFor({
      continuityPhase: 'in-between',
      references: [
        { artifactId: ARTIFACT_A, role: 'previous-key-pose', required: true },
        { artifactId: ARTIFACT_C, role: 'next-key-pose', required: true },
      ],
    }),
  );
  assert.equal(valid.scenes[0].references.length, 2);
});

test('reference validation rejects malformed artifact ids, duplicates, and over-capacity scenes', () => {
  assert.throws(
    () => validateLocalGenerationCampaign(
      manifestFor({ references: [{ artifactId: 'artifact_bad', role: 'base-image' }] }),
    ),
    /artifact_<sha256>/u,
  );
  assert.throws(
    () => validateLocalGenerationCampaign(
      manifestFor({
        references: [
          { artifactId: ARTIFACT_A, role: 'base-image' },
          { artifactId: ARTIFACT_A, role: 'base-image' },
        ],
      }),
    ),
    /duplicate base-image reference/u,
  );
  assert.throws(
    () => validateLocalGenerationCampaign(
      manifestFor({
        references: Array.from({ length: 17 }, (_, index) => ({
          artifactId: `artifact_${index.toString(16).padStart(64, '0')}`,
          role: 'base-image',
        })),
      }),
    ),
    /at most 16 references/u,
  );
});
