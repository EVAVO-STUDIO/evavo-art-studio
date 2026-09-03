#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import { compileQualityProfiledDraft } from './compile-comfyui-quality-profile-draft.mjs';

const draft = {
  schemaVersion: 'evavo.comfyui-workflow-catalog-draft.v1',
  catalogId: 'test',
  catalogVersion: '1',
  profiles: [
    {
      profileId: 'sdxl-base-local',
      label: 'SDXL Base Local',
      description: 'Test base profile.',
      version: '1',
      priority: 100,
      operations: ['generate'],
      assetKinds: ['illustration'],
      continuityPhases: ['independent', 'key-pose'],
      capabilities: ['generate', 'seed', 'custom-size', 'candidate-count', 'cancellation'],
      modelId: 'sdxl-base',
      workflow: {
        '1': { class_type: 'KSampler', inputs: { seed: 1, steps: 20, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1 } },
        '2': { class_type: 'CLIPTextEncode', inputs: { text: '' } }
      },
      bindings: { positivePrompt: { nodeId: '2', input: 'text' }, seed: { nodeId: '1', input: 'seed' }, referenceImages: [] },
      outputNodeIds: [], modelInventory: [], runtimeInventory: [], limits: { maximumCandidates: 4, maximumReferenceImages: 0, maximumSourceBytes: 1 }
    }
  ]
};

const profiles = {
  schema: 'evavo.local-generation-quality-profiles.v2',
  profiles: {
    cinematic_stills: { width: 1344, height: 768, steps: 36, cfg: 5.5, sampler: 'dpmpp_2m', scheduler: 'karras', denoise: 1, hiresScale: 1, faceDetailPass: true, outputFormat: 'png' },
    sprite_sheet_clean: { width: 1024, height: 1024, steps: 30, cfg: 5.5, sampler: 'dpmpp_2m', scheduler: 'karras', denoise: 1, hiresScale: 1, faceDetailPass: false, outputFormat: 'png' }
  }
};

test('quality compiler creates executable KSampler workflow variants', () => {
  const result = compileQualityProfiledDraft(draft, profiles, 'sdxl-base-local');
  assert.equal(result.profiles.length, 3);
  const cinematic = result.profiles.find((profile) => profile.profileId === 'sdxl-base-local-cinematic_stills');
  assert.ok(cinematic);
  assert.equal(cinematic.workflow['1'].inputs.steps, 36);
  assert.equal(cinematic.workflow['1'].inputs.cfg, 5.5);
  assert.equal(cinematic.workflow['1'].inputs.sampler_name, 'dpmpp_2m');
  assert.equal(cinematic.workflow['1'].inputs.scheduler, 'karras');
  assert.equal(cinematic.workflow['1'].inputs.denoise, 1);
  assert.equal(cinematic.bindings.seed.nodeId, '1');
});

test('quality compiler preserves base profile and does not mutate it', () => {
  const before = JSON.stringify(draft);
  const result = compileQualityProfiledDraft(draft, profiles);
  assert.equal(JSON.stringify(draft), before);
  assert.ok(result.profiles.some((profile) => profile.profileId === 'sdxl-base-local'));
});

test('quality compiler rejects workflows without a sampler node', () => {
  const invalid = structuredClone(draft);
  invalid.profiles[0].workflow = { '2': { class_type: 'CLIPTextEncode', inputs: { text: '' } } };
  assert.throws(() => compileQualityProfiledDraft(invalid, profiles), /no KSampler/u);
});
