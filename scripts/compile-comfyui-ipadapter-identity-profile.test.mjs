#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildIpAdapterIdentityProfile } from './compile-comfyui-ipadapter-identity-profile.mjs';

const base = {
  profileId: 'sdxl-base-local-cinematic_stills',
  label: 'SDXL cinematic stills',
  description: 'Reviewed base SDXL workflow.',
  version: '1.0.0-quality.cinematic_stills',
  priority: 50,
  operations: ['generate'],
  assetKinds: ['illustration'],
  continuityPhases: ['independent', 'identity-master', 'key-pose'],
  capabilities: ['generate', 'seed', 'custom-size', 'cancellation'],
  modelId: 'sdxl-base-1.0',
  workflow: {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' } },
    '2': { class_type: 'KSampler', inputs: { model: ['1', 0], seed: 123, steps: 30, cfg: 6.5, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1 } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: 'prompt', clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
    '5': { class_type: 'SaveImage', inputs: { filename_prefix: 'fixture', images: ['2', 0] } },
  },
  bindings: {
    positivePrompt: { nodeId: '3', input: 'text' },
    width: { nodeId: '4', input: 'width' },
    height: { nodeId: '4', input: 'height' },
    seed: { nodeId: '2', input: 'seed' },
    filenamePrefix: { nodeId: '5', input: 'filename_prefix' },
    referenceImages: [],
  },
  outputNodeIds: ['5'],
  modelInventory: [{ id: 'sdxl-base-1.0', kind: 'checkpoint', sha256: 'a'.repeat(64) }],
  runtimeInventory: [{ id: 'comfyui', version: '0.34.0', sha256: 'b'.repeat(64) }],
  limits: { maximumCandidates: 1, maximumReferenceImages: 0, maximumSourceBytes: 64 * 1024 * 1024 },
};

const options = {
  ipAdapterFile: 'ip-adapter-plus_sdxl_vit-h.safetensors',
  clipVisionFile: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors',
  ipAdapterSha256: '3f5062b8400c94b7159665b21ba5c62acdcd7682262743d7f2aefedef00e6581',
  clipVisionSha256: '6ca9667da1ca9e0b0f75e46bb030f7e011f44f86cbfb8d5a36590fcd7507b030',
  customNodeVersion: 'a0f451a5113cf9becb0847b92884cb10cbdec0ef',
  customNodeSha256: 'c'.repeat(64),
};

test('identity transformer inserts real IP-Adapter nodes and reroutes sampler model', () => {
  const result = buildIpAdapterIdentityProfile(base, options);
  const { nodeIds } = result;
  assert.equal(result.profile.workflow[nodeIds.loadId].class_type, 'LoadImage');
  assert.equal(result.profile.workflow[nodeIds.prepId].class_type, 'PrepImageForClipVision');
  assert.equal(result.profile.workflow[nodeIds.modelLoaderId].class_type, 'IPAdapterModelLoader');
  assert.equal(result.profile.workflow[nodeIds.clipLoaderId].class_type, 'CLIPVisionLoader');
  assert.equal(result.profile.workflow[nodeIds.applyId].class_type, 'IPAdapterAdvanced');
  assert.deepEqual(result.profile.workflow[nodeIds.samplerId].inputs.model, [nodeIds.applyId, 0]);
  assert.deepEqual(result.profile.workflow[nodeIds.applyId].inputs.model, ['1', 0]);
  assert.equal(result.profile.workflow[nodeIds.applyId].inputs.weight, 0.8);
});

test('identity transformer publishes canonical identity binding and reviewed runtime policy', () => {
  const result = buildIpAdapterIdentityProfile(base, options);
  const ref = result.profile.bindings.referenceImages[0];
  assert.equal(ref.role, 'canonical-identity');
  assert.equal(ref.nodeId, result.nodeIds.loadId);
  assert.deepEqual(ref.strength, { nodeId: result.nodeIds.applyId, input: 'weight' });
  assert.ok(result.profile.capabilities.includes('reference-images'));
  assert.ok(result.profile.capabilities.includes('identity-reference'));
  assert.deepEqual(result.profile.runtimePolicy, {
    loadBuiltinExtras: false,
    customNodeFolders: ['ComfyUI_IPAdapter_plus'],
  });
  assert.equal(result.profile.limits.maximumReferenceImages, 1);
});

test('identity transformer records exact model and runtime provenance', () => {
  const result = buildIpAdapterIdentityProfile(base, options);
  assert.ok(result.profile.modelInventory.some((entry) => entry.kind === 'ipadapter' && entry.sha256 === options.ipAdapterSha256));
  assert.ok(result.profile.modelInventory.some((entry) => entry.kind === 'clip-vision' && entry.sha256 === options.clipVisionSha256));
  assert.ok(result.profile.runtimeInventory.some((entry) => entry.id === 'comfyui-ipadapter-plus' && entry.version === options.customNodeVersion));
  assert.equal(result.pinnedAssets.ipAdapterSha256, options.ipAdapterSha256);
  assert.equal(result.pinnedAssets.clipVisionSha256, options.clipVisionSha256);
});

test('identity transformer refuses already conditioned or structurally ambiguous bases', () => {
  const conditioned = structuredClone(base);
  conditioned.bindings.referenceImages = [{ role: 'base-image', nodeId: '4', input: 'image' }];
  assert.throws(() => buildIpAdapterIdentityProfile(conditioned, options), /already contains reference-image bindings/u);

  const ambiguous = structuredClone(base);
  ambiguous.workflow['6'] = { class_type: 'KSampler', inputs: { model: ['1', 0] } };
  assert.throws(() => buildIpAdapterIdentityProfile(ambiguous, options), /exactly one KSampler/u);
});

test('identity transformer rejects invalid weights and unverified hashes', () => {
  assert.throws(() => buildIpAdapterIdentityProfile(base, { ...options, defaultWeight: 3 }), /defaultWeight/u);
  assert.throws(() => buildIpAdapterIdentityProfile(base, { ...options, ipAdapterSha256: 'bad' }), /ipAdapterSha256/u);
});
