#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import { compileQualityProfiledDraft } from './compile-comfyui-quality-profile-draft.mjs';

const baseDraft = {
  schemaVersion: 'evavo.comfyui-workflow-catalog-draft.v1',
  catalogId: 'test-catalog',
  catalogVersion: '1.0.0',
  profiles: [
    {
      profileId: 'sdxl-base-local',
      label: 'SDXL Base Local',
      description: 'Reviewed base workflow.',
      version: '1.0.0',
      priority: 10,
      operations: ['generate'],
      assetKinds: ['illustration'],
      continuityPhases: ['independent', 'key-pose'],
      capabilities: ['generate', 'seed', 'custom-size', 'candidate-count', 'cancellation'],
      modelId: 'sdxl-base',
      workflow: {
        '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' } },
        '2': { class_type: 'KSampler', inputs: { seed: 1, steps: 20, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1 } },
      },
      bindings: {
        positivePrompt: { nodeId: '3', input: 'text' },
        seed: { nodeId: '2', input: 'seed' },
        referenceImages: [],
      },
      outputNodeIds: ['9'],
      modelInventory: [{ id: 'sdxl-base', kind: 'checkpoint', sha256: 'a'.repeat(64) }],
      runtimeInventory: [{ id: 'comfyui', version: '0.34.0', sha256: 'b'.repeat(64) }],
      limits: { maximumCandidates: 16, maximumReferenceImages: 0, maximumSourceBytes: 67108864 },
    },
  ],
};

const qualityDocument = {
  schema: 'evavo.local-generation-quality-profiles.v2',
  profiles: {
    cinematic_stills: {
      steps: 36,
      cfg: 5.5,
      sampler: 'dpmpp_2m',
      scheduler: 'karras',
      denoise: 0.92,
    },
    sprite_sheet_clean: {
      steps: 30,
      cfg: 5.25,
      sampler: 'dpmpp_2m',
      scheduler: 'karras',
      denoise: 1,
    },
  },
};

test('quality compiler bakes sampling controls into real KSampler inputs', () => {
  const result = compileQualityProfiledDraft(baseDraft, qualityDocument, 'sdxl-base-local');
  const cinematic = result.profiles.find((profile) => profile.profileId === 'sdxl-base-local-cinematic_stills');
  assert.ok(cinematic);
  assert.equal(cinematic.workflow['2'].inputs.steps, 36);
  assert.equal(cinematic.workflow['2'].inputs.cfg, 5.5);
  assert.equal(cinematic.workflow['2'].inputs.sampler_name, 'dpmpp_2m');
  assert.equal(cinematic.workflow['2'].inputs.scheduler, 'karras');
  assert.equal(cinematic.workflow['2'].inputs.denoise, 0.92);
  assert.equal(cinematic.priority, 20);
});

test('quality compiler emits catalog-contract-safe version identifiers', () => {
  const result = compileQualityProfiledDraft(baseDraft, qualityDocument, 'sdxl-base-local');
  assert.match(result.catalogVersion, /^[A-Za-z0-9._:-]+$/u);
  assert.equal(result.catalogVersion.includes('+'), false);
  for (const profile of result.profiles.filter((entry) => entry.profileId !== 'sdxl-base-local')) {
    assert.match(profile.version, /^[A-Za-z0-9._:-]+$/u);
    assert.equal(profile.version.includes('+'), false);
  }
});

test('quality compiler preserves base workflow while producing isolated variants', () => {
  const result = compileQualityProfiledDraft(baseDraft, qualityDocument, 'sdxl-base-local');
  const base = result.profiles.find((profile) => profile.profileId === 'sdxl-base-local');
  const sprite = result.profiles.find((profile) => profile.profileId === 'sdxl-base-local-sprite_sheet_clean');
  assert.equal(base.workflow['2'].inputs.steps, 20);
  assert.equal(sprite.workflow['2'].inputs.steps, 30);
  assert.notStrictEqual(base.workflow, sprite.workflow);
});
