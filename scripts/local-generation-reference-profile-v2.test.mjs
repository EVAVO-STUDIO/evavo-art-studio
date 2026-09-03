#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';

import { appendReferenceProfilesToDraft, compileReferenceProfileDraft } from './local-generation-reference-profile-v2.mjs';

const base = Object.freeze({
  profileId: 'sdxl-base-local-cinematic_stills',
  label: 'SDXL cinematic stills',
  description: 'Base reviewed SDXL workflow.',
  version: '1.0.0-quality.cinematic_stills',
  priority: 50,
  operations: ['generate'],
  assetKinds: ['illustration', 'sprite-frame'],
  continuityPhases: ['independent', 'identity-master', 'key-pose'],
  capabilities: ['generate', 'seed', 'custom-size', 'cancellation'],
  modelId: 'sdxl-base-1.0',
  workflow: {
    '1': { class_type: 'CLIPTextEncode', inputs: { text: 'prompt' } },
    '2': { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
    '3': { class_type: 'KSampler', inputs: { seed: 1, model: ['20', 0] } },
    '4': { class_type: 'SaveImage', inputs: { filename_prefix: 'base', images: ['3', 0] } },
  },
  bindings: {
    positivePrompt: { nodeId: '1', input: 'text' },
    width: { nodeId: '2', input: 'width' },
    height: { nodeId: '2', input: 'height' },
    seed: { nodeId: '3', input: 'seed' },
    filenamePrefix: { nodeId: '4', input: 'filename_prefix' },
    referenceImages: [],
  },
  outputNodeIds: ['4'],
  modelInventory: [{ id: 'sdxl-base-1.0', kind: 'checkpoint', sha256: 'a'.repeat(64) }],
  runtimeInventory: [{ id: 'comfyui', version: '0.34.0', sha256: 'b'.repeat(64) }],
  limits: { maximumCandidates: 4, maximumReferenceImages: 0, maximumSourceBytes: 64 * 1024 * 1024 },
});

function identitySpec() {
  return {
    baseProfileId: base.profileId,
    profileId: 'sdxl-base-local-cinematic_stills-identity',
    label: 'SDXL cinematic stills identity conditioned',
    description: 'Reviewed identity-conditioned workflow fixture.',
    version: '1.0.0-reference.identity',
    workflow: {
      ...base.workflow,
      '10': { class_type: 'LoadImage', inputs: { image: 'reference.png' } },
      '11': {
        class_type: 'IPAdapterAdvanced',
        inputs: {
          model: ['20', 0], ipadapter: ['12', 0], image: ['13', 0], clip_vision: ['14', 0],
          weight: 0.8, weight_type: 'linear', combine_embeds: 'concat', start_at: 0, end_at: 1,
          embeds_scaling: 'V only',
        },
      },
      '12': { class_type: 'IPAdapterModelLoader', inputs: { ipadapter_file: 'ip-adapter-plus_sdxl_vit-h.safetensors' } },
      '13': { class_type: 'PrepImageForClipVision', inputs: { image: ['10', 0], interpolation: 'LANCZOS', crop_position: 'top', sharpening: 0.15 } },
      '14': { class_type: 'CLIPVisionLoader', inputs: { clip_name: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors' } },
      '20': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' } },
    },
    bindings: base.bindings,
    referenceImages: [
      { role: 'canonical-identity', nodeId: '10', input: 'image', strength: { nodeId: '11', input: 'weight' } },
    ],
    runtimePolicy: { loadBuiltinExtras: false, customNodeFolders: ['ComfyUI_IPAdapter_plus'] },
    modelInventoryAdditions: [
      { id: 'ip-adapter-plus-sdxl', kind: 'ipadapter', sha256: 'c'.repeat(64) },
      { id: 'clip-vision-vit-h', kind: 'clip-vision', sha256: 'e'.repeat(64) },
    ],
    runtimeInventoryAdditions: [
      { id: 'comfyui-ipadapter-plus', version: 'a0f451a5113cf9becb0847b92884cb10cbdec0ef', sha256: 'd'.repeat(64) },
    ],
    maximumReferenceImages: 1,
  };
}

test('identity reference profile derives executable reference capabilities and runtime policy', () => {
  const result = compileReferenceProfileDraft(base, identitySpec());
  assert.equal(result.profile.profileId, 'sdxl-base-local-cinematic_stills-identity');
  assert.ok(result.profile.capabilities.includes('reference-images'));
  assert.ok(result.profile.capabilities.includes('identity-reference'));
  assert.deepEqual(result.profile.runtimePolicy, {
    loadBuiltinExtras: false,
    customNodeFolders: ['ComfyUI_IPAdapter_plus'],
  });
  assert.equal(result.profile.bindings.referenceImages[0].role, 'canonical-identity');
  assert.equal(result.profile.bindings.referenceImages[0].strength.input, 'weight');
  assert.equal(result.profile.limits.maximumReferenceImages, 1);
  assert.equal(result.profile.modelInventory.length, 3);
  assert.equal(result.profile.runtimeInventory.length, 2);
  assert.deepEqual(result.profile.runtimeInventory[1], {
    id: 'comfyui-ipadapter-plus',
    version: 'a0f451a5113cf9becb0847b92884cb10cbdec0ef',
    sha256: 'd'.repeat(64),
  });
  assert.match(result.specificationSha256, /^[a-f0-9]{64}$/u);
  assert.match(result.workflowSha256, /^[a-f0-9]{64}$/u);
});

test('multiple reference roles derive multiple-reference-images and role capabilities', () => {
  const spec = identitySpec();
  spec.profileId = 'sdxl-multi-reference';
  spec.workflow = {
    ...spec.workflow,
    '15': { class_type: 'LoadImage', inputs: { image: 'pose.png' } },
    '16': { class_type: 'ControlNetApplyAdvanced', inputs: { image: ['15', 0], strength: 0.7 } },
  };
  spec.referenceImages = [
    ...spec.referenceImages,
    { role: 'pose-control', nodeId: '15', input: 'image', strength: { nodeId: '16', input: 'strength' } },
  ];
  spec.runtimePolicy.customNodeFolders.push('comfyui_controlnet_aux');
  spec.maximumReferenceImages = 2;
  const result = compileReferenceProfileDraft(base, spec);
  assert.ok(result.profile.capabilities.includes('multiple-reference-images'));
  assert.ok(result.profile.capabilities.includes('identity-reference'));
  assert.ok(result.profile.capabilities.includes('pose-control'));
  assert.equal(result.profile.bindings.referenceImages.length, 2);
});

test('compiler rejects capability theater with missing workflow inputs or duplicate roles', () => {
  const missing = identitySpec();
  missing.referenceImages[0].nodeId = '999';
  assert.throws(() => compileReferenceProfileDraft(base, missing), /missing workflow node/u);

  const duplicate = identitySpec();
  duplicate.referenceImages.push({ role: 'canonical-identity', nodeId: '10', input: 'image' });
  duplicate.maximumReferenceImages = 2;
  assert.throws(() => compileReferenceProfileDraft(base, duplicate), /duplicate role/u);
});

test('compiler requires explicit custom-node runtime policy and sufficient reference limits', () => {
  const noFolders = identitySpec();
  noFolders.runtimePolicy.customNodeFolders = [];
  assert.throws(() => compileReferenceProfileDraft(base, noFolders), /customNodeFolders/u);

  const tooSmall = identitySpec();
  tooSmall.maximumReferenceImages = 0;
  assert.throws(() => compileReferenceProfileDraft(base, tooSmall), /maximumReferenceImages/u);
});

test('compiler enforces distinct canonical model and runtime inventory shapes', () => {
  const badRuntime = identitySpec();
  badRuntime.runtimeInventoryAdditions[0] = { id: 'bad-runtime', kind: 'custom-node', sha256: 'd'.repeat(64) };
  assert.throws(() => compileReferenceProfileDraft(base, badRuntime), /version/u);

  const badModel = identitySpec();
  badModel.modelInventoryAdditions[0] = { id: 'bad-model', version: '1.0', sha256: 'c'.repeat(64) };
  assert.throws(() => compileReferenceProfileDraft(base, badModel), /kind/u);
});

test('appendReferenceProfilesToDraft preserves base profiles and refuses collisions', () => {
  const draft = {
    schemaVersion: 'evavo.comfyui-workflow-catalog-draft.v1',
    catalogId: 'fixture',
    catalogVersion: '1.0.0',
    profiles: [base],
  };
  const result = appendReferenceProfilesToDraft(draft, [identitySpec()]);
  assert.equal(result.draft.profiles.length, 2);
  assert.equal(result.additions[0].profile.profileId, 'sdxl-base-local-cinematic_stills-identity');

  const collision = identitySpec();
  collision.profileId = base.profileId;
  assert.throws(() => appendReferenceProfilesToDraft(draft, [collision]), /already exists/u);
});
