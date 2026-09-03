#!/usr/bin/env node

import assert from 'node:assert/strict';

import { compileComfyUIWorkflowCatalog } from '../packages/providers/dist/index.js';
import { compileCoreReferenceCatalog } from './compile-comfyui-core-reference-catalog.mjs';

const SHA0 = '0'.repeat(64);
const SHA1 = '1'.repeat(64);

function baseCatalog() {
  return compileComfyUIWorkflowCatalog({
    schemaVersion: 'evavo.comfyui-workflow-catalog-draft.v1',
    catalogId: 'test-local-sdxl',
    catalogVersion: '1.0-quality-v2',
    profiles: [{
      profileId: 'sdxl-base-local-cinematic_stills',
      label: 'SDXL cinematic stills',
      description: 'Reviewed core SDXL text-to-image workflow.',
      version: '1.0-quality.cinematic_stills',
      priority: 100,
      operations: ['generate'],
      assetKinds: ['illustration', 'sprite-frame'],
      continuityPhases: ['identity-master', 'direction-master', 'key-pose', 'independent'],
      capabilities: ['generate', 'cancellation', 'seed', 'custom-size', 'candidate-count'],
      modelId: 'sd_xl_base_1.0.safetensors',
      workflow: {
        '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' } },
        '2': { class_type: 'CLIPTextEncode', inputs: { text: 'positive', clip: ['1', 1] } },
        '3': { class_type: 'CLIPTextEncode', inputs: { text: 'negative', clip: ['1', 1] } },
        '4': { class_type: 'EmptyLatentImage', inputs: { width: 1344, height: 768, batch_size: 1 } },
        '5': { class_type: 'KSampler', inputs: { seed: 42, steps: 36, cfg: 5.5, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 0.55, model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0] } },
        '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
        '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'evavo/test', images: ['6', 0] } },
      },
      bindings: {
        positivePrompt: { nodeId: '2', input: 'text' },
        negativePrompt: { nodeId: '3', input: 'text' },
        width: { nodeId: '4', input: 'width' },
        height: { nodeId: '4', input: 'height' },
        seed: { nodeId: '5', input: 'seed' },
        candidateCount: { nodeId: '4', input: 'batch_size' },
        filenamePrefix: { nodeId: '7', input: 'filename_prefix' },
        referenceImages: [],
      },
      outputNodeIds: ['7'],
      modelInventory: [{ id: 'sd_xl_base_1.0.safetensors', kind: 'checkpoint', sha256: SHA0 }],
      runtimeInventory: [{ id: 'comfyui', version: '0.34.0', sha256: SHA1 }],
      limits: { maximumCandidates: 8, maximumReferenceImages: 0, maximumSourceBytes: 67108864 },
    }],
  });
}

const compiled = compileCoreReferenceCatalog(baseCatalog(), { roles: ['canonical-identity'] });
assert.equal(compiled.profiles.length, 2);
const reference = compiled.profiles.find((profile) => profile.profileId.endsWith('-reference-canonical-identity'));
assert.ok(reference);
assert.equal(reference.limits.maximumCandidates, 1);
assert.equal(reference.limits.maximumReferenceImages, 1);
assert.ok(reference.capabilities.includes('reference-images'));
assert.ok(reference.capabilities.includes('identity-reference'));
assert.ok(!reference.capabilities.includes('candidate-count'));
assert.deepEqual(reference.bindings.referenceImages.map((entry) => entry.role), ['canonical-identity']);
assert.equal(reference.bindings.candidateCount, undefined);

const load = Object.entries(reference.workflow).find(([, node]) => node.class_type === 'LoadImage');
const scale = Object.entries(reference.workflow).find(([, node]) => node.class_type === 'ImageScale');
const encode = Object.entries(reference.workflow).find(([, node]) => node.class_type === 'VAEEncode');
const sampler = Object.entries(reference.workflow).find(([, node]) => node.class_type === 'KSampler');
assert.ok(load && scale && encode && sampler);
assert.deepEqual(scale[1].inputs.image, [load[0], 0]);
assert.deepEqual(encode[1].inputs.pixels, [scale[0], 0]);
assert.deepEqual(encode[1].inputs.vae, ['1', 2]);
assert.deepEqual(sampler[1].inputs.latent_image, [encode[0], 0]);
assert.deepEqual(reference.bindings.width, { nodeId: scale[0], input: 'width' });
assert.deepEqual(reference.bindings.height, { nodeId: scale[0], input: 'height' });
assert.equal(scale[1].inputs.width, 1344);
assert.equal(scale[1].inputs.height, 768);
assert.equal(sampler[1].inputs.steps, 36);
assert.equal(sampler[1].inputs.cfg, 5.5);
assert.equal(sampler[1].inputs.sampler_name, 'dpmpp_2m');
assert.equal(sampler[1].inputs.scheduler, 'karras');
assert.equal(sampler[1].inputs.denoise, 0.55);
assert.ok(!reference.version.includes('+'));
assert.ok(!compiled.catalogVersion.includes('+'));

assert.throws(
  () => compileCoreReferenceCatalog(baseCatalog(), { roles: ['mask'] }),
  /unsupported reference role/u,
);

console.log('Core-only ComfyUI reference catalog tests passed.');
