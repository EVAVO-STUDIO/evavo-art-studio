#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import { assertModelPlanExecutable, normalizeModelPlan, resolveQualityAdapterId } from './local-generation-model-plan-v2.mjs';

test('model plan normalizes and hashes ordered LoRAs', () => {
  const plan = normalizeModelPlan({ modelProfile: 'sdxl-base-local', modelId: 'sdxl-base', loras: [{ id: 'character-lora', strengthModel: 0.8, strengthClip: 0.7 }] });
  assert.equal(plan.modelProfile, 'sdxl-base-local');
  assert.equal(plan.loras[0].strengthModel, 0.8);
  assert.equal(plan.sha256.length, 64);
});

test('quality adapter ID is derived from reviewed model profile and quality profile', () => {
  assert.equal(resolveQualityAdapterId({ baseAdapterId: 'comfyui:sdxl-base-local', qualityProfile: 'cinematic_stills', modelPlan: { modelProfile: 'sdxl-base-local' } }), 'comfyui:sdxl-base-local-cinematic_stills');
});

test('LoRA execution fails closed unless workflow and inventory support it', () => {
  const modelPlan = { modelId: 'sdxl-base', loras: [{ id: 'character-lora' }] };
  assert.throws(() => assertModelPlanExecutable(modelPlan, { profileId: 'p', modelId: 'sdxl-base', modelInventory: [], workflow: {} }), /does not declare required LoRAs/u);
  const executable = assertModelPlanExecutable(modelPlan, {
    profileId: 'p', modelId: 'sdxl-base', modelInventory: [{ id: 'character-lora', kind: 'lora', sha256: 'a'.repeat(64) }],
    workflow: { '10': { class_type: 'LoraLoader', inputs: {} } },
  });
  assert.equal(executable.executable, true);
});
