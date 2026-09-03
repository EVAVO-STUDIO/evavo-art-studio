#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import { compileReferencePackedDraft } from './compile-comfyui-reference-pack-draft.mjs';

function baseDraft() {
  return {
    schemaVersion: 'evavo.comfyui-workflow-catalog-draft.v1',
    catalogId: 'evavo-local-comfyui',
    catalogVersion: '1.0.0',
    profiles: [{
      profileId: 'sdxl-base-local-cinematic_stills',
      label: 'SDXL cinematic',
      description: 'Reviewed base workflow.',
      version: '1.0.0-quality.cinematic_stills',
      priority: 100,
      operations: ['generate'],
      assetKinds: ['illustration'],
      continuityPhases: ['identity-master', 'independent'],
      capabilities: ['generate', 'seed', 'custom-size', 'cancellation'],
      modelId: 'sdxl-base-local',
      workflow: {
        '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sdxl.safetensors' } },
        '2': { class_type: 'CLIPTextEncode', inputs: { text: 'positive', clip: ['1', 1] } },
        '3': { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
        '4': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['2', 0], negative: ['2', 0], latent_image: ['3', 0], seed: 1, steps: 36, cfg: 5.5, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1 } },
        '5': { class_type: 'VAEDecode', inputs: { samples: ['4', 0], vae: ['1', 2] } },
        '6': { class_type: 'SaveImage', inputs: { images: ['5', 0], filename_prefix: 'evavo' } },
      },
      bindings: {
        positivePrompt: { nodeId: '2', input: 'text' },
        width: { nodeId: '3', input: 'width' },
        height: { nodeId: '3', input: 'height' },
        candidateCount: { nodeId: '3', input: 'batch_size' },
        seed: { nodeId: '4', input: 'seed' },
        filenamePrefix: { nodeId: '6', input: 'filename_prefix' },
        referenceImages: [],
      },
      outputNodeIds: ['6'],
      modelInventory: [{ id: 'sdxl-base-local', kind: 'checkpoint', sha256: 'a'.repeat(64) }],
      runtimeInventory: [{ id: 'comfyui', version: '0.34.0', sha256: 'b'.repeat(64) }],
      limits: { maximumCandidates: 4, maximumReferenceImages: 0, maximumSourceBytes: 16777216 },
    }],
  };
}

function pack(overrides = {}) {
  return {
    schema: 'evavo.local-generation-reference-pack.v1',
    packId: 'synthetic-identity-reference',
    version: '1.0.0',
    profileSuffix: 'identity_ref',
    label: 'Synthetic identity reference',
    description: 'Test-only reviewed reference graph.',
    capabilities: ['reference-images', 'identity-reference'],
    maximumReferenceImages: 1,
    requiredNodeClasses: ['LoadImage', 'SyntheticReferenceModelApply'],
    runtimePolicy: {
      loadBuiltinExtras: true,
      customNodeFolders: ['ComfyUI-SyntheticReference'],
    },
    workflow: {
      addNodes: {
        '100': { class_type: 'LoadImage', inputs: { image: 'identity.png' } },
        '101': { class_type: 'SyntheticReferenceModelApply', inputs: { model: ['1', 0], image: ['100', 0], strength: 0.8 } },
      },
      setInputs: [{ nodeId: '4', input: 'model', value: ['101', 0] }],
    },
    referenceBindings: [{ role: 'canonical-identity', nodeId: '100', input: 'image', strength: { nodeId: '101', input: 'strength' } }],
    modelInventory: [{ id: 'synthetic-reference-model', kind: 'reference-model', sha256: 'c'.repeat(64) }],
    runtimeInventory: [{ id: 'synthetic-reference-runtime', version: '1.0.0', sha256: 'd'.repeat(64) }],
    ...overrides,
  };
}

test('reference pack compiler creates an isolated reference-capable reviewed profile', () => {
  const result = compileReferencePackedDraft(baseDraft(), pack(), 'sdxl-base-local-cinematic_stills');
  assert.equal(result.profiles.length, 2);
  const profile = result.profiles.find((candidate) => candidate.profileId.endsWith('-identity_ref'));
  assert.ok(profile);
  assert.deepEqual(profile.workflow['4'].inputs.model, ['101', 0]);
  assert.equal(profile.workflow['100'].class_type, 'LoadImage');
  assert.equal(profile.bindings.referenceImages[0].role, 'canonical-identity');
  assert.deepEqual(profile.bindings.referenceImages[0].strength, { nodeId: '101', input: 'strength' });
  assert.equal(profile.capabilities.includes('reference-images'), true);
  assert.equal(profile.capabilities.includes('identity-reference'), true);
  assert.equal(profile.limits.maximumReferenceImages, 1);
  assert.equal(profile.modelInventory.some((item) => item.id === 'synthetic-reference-model'), true);
  assert.equal(profile.runtimeInventory.some((item) => item.id === 'synthetic-reference-runtime'), true);
  assert.deepEqual(profile.runtimePolicy, {
    loadBuiltinExtras: true,
    customNodeFolders: ['ComfyUI-SyntheticReference'],
  });
  assert.equal(result.profiles[0].workflow['4'].inputs.model[0], '1', 'base workflow must remain unchanged');
});

test('reference runtime policy is normalized and validated', () => {
  const defaultPolicy = compileReferencePackedDraft(baseDraft(), pack({ runtimePolicy: undefined }), 'sdxl-base-local-cinematic_stills')
    .profiles.find((candidate) => candidate.profileId.endsWith('-identity_ref')).runtimePolicy;
  assert.deepEqual(defaultPolicy, { loadBuiltinExtras: true, customNodeFolders: [] });

  assert.throws(
    () => compileReferencePackedDraft(baseDraft(), pack({ runtimePolicy: { customNodeFolders: ['bad folder'] } })),
    /customNodeFolders\[0\] is invalid/u,
  );
  assert.throws(
    () => compileReferencePackedDraft(baseDraft(), pack({ runtimePolicy: { loadBuiltinExtras: 'yes' } })),
    /loadBuiltinExtras must be a boolean/u,
  );
  assert.throws(
    () => compileReferencePackedDraft(baseDraft(), pack({ runtimePolicy: { customNodeFolders: ['A', 'A'] } })),
    /contains duplicates/u,
  );
});

test('reference pack compiler fails closed on workflow collisions and missing required classes', () => {
  const collision = pack();
  collision.workflow.addNodes['4'] = { class_type: 'LoadImage', inputs: { image: 'bad.png' } };
  assert.throws(() => compileReferencePackedDraft(baseDraft(), collision), /may not overwrite existing workflow node 4/u);

  const missingClass = pack({ requiredNodeClasses: ['NodeThatDoesNotExist'] });
  assert.throws(() => compileReferencePackedDraft(baseDraft(), missingClass), /required node class NodeThatDoesNotExist is absent/u);
});

test('reference pack compiler validates binding limits and existing inputs', () => {
  const tooSmall = pack({ maximumReferenceImages: 1, referenceBindings: [
    { role: 'canonical-identity', nodeId: '100', input: 'image' },
    { role: 'direction-master', nodeId: '100', input: 'image' },
  ] });
  assert.throws(() => compileReferencePackedDraft(baseDraft(), tooSmall), /may not be smaller/u);

  const missingInput = pack({ referenceBindings: [{ role: 'canonical-identity', nodeId: '100', input: 'missing' }] });
  assert.throws(() => compileReferencePackedDraft(baseDraft(), missingInput), /references missing input 100.missing/u);
});
