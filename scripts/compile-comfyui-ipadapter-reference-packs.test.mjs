#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import { compileIpAdapterReferencePacks } from './compile-comfyui-ipadapter-reference-packs.mjs';

function runtime(overrides = {}) {
  return {
    schema: 'evavo.local-generation-ipadapter-runtime.v1',
    runtimeId: 'comfyui-ipadapter-plus',
    version: 'abcdef123456',
    customNodeFolder: 'ComfyUI_IPAdapter_plus',
    runtimeSha256: '1'.repeat(64),
    ipAdapterModel: {
      id: 'sdxl-ipadapter',
      fileName: 'ip-adapter-plus_sdxl_vit-h.safetensors',
      sha256: '2'.repeat(64),
    },
    clipVisionModel: {
      id: 'clip-vit-h',
      fileName: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors',
      sha256: '3'.repeat(64),
    },
    roles: ['canonical-identity', 'direction-master', 'palette-reference'],
    weight: 0.72,
    weightType: 'linear',
    combineEmbeds: 'concat',
    startAt: 0.05,
    endAt: 0.95,
    embedsScaling: 'V only',
    baseModelNodeId: '1',
    samplerNodeId: '4',
    ...overrides,
  };
}

test('IP-Adapter compiler emits one reviewed reference pack per requested role', () => {
  const packs = compileIpAdapterReferencePacks(runtime());
  assert.equal(packs.length, 3);
  assert.deepEqual(packs.map((pack) => pack.profileSuffix), [
    'reference-canonical-identity',
    'reference-direction-master',
    'reference-palette-reference',
  ]);
  assert.deepEqual(packs.map((pack) => pack.capabilities[1]), [
    'identity-reference',
    'direction-reference',
    'palette-reference',
  ]);
});

test('compiled IP-Adapter pack wires reviewed models, image binding and sampler model path', () => {
  const [pack] = compileIpAdapterReferencePacks(runtime({ roles: ['canonical-identity'] }));
  assert.equal(pack.workflow.addNodes['900'].class_type, 'IPAdapterModelLoader');
  assert.equal(pack.workflow.addNodes['900'].inputs.ipadapter_file, 'ip-adapter-plus_sdxl_vit-h.safetensors');
  assert.equal(pack.workflow.addNodes['901'].class_type, 'CLIPVisionLoader');
  assert.equal(pack.workflow.addNodes['902'].class_type, 'LoadImage');
  assert.equal(pack.workflow.addNodes['903'].class_type, 'IPAdapterAdvanced');
  assert.deepEqual(pack.workflow.addNodes['903'].inputs.model, ['1', 0]);
  assert.deepEqual(pack.workflow.addNodes['903'].inputs.ipadapter, ['900', 0]);
  assert.deepEqual(pack.workflow.addNodes['903'].inputs.clip_vision, ['901', 0]);
  assert.equal(pack.workflow.addNodes['903'].inputs.weight, 0.72);
  assert.equal(pack.workflow.addNodes['903'].inputs.start_at, 0.05);
  assert.equal(pack.workflow.addNodes['903'].inputs.end_at, 0.95);
  assert.deepEqual(pack.workflow.setInputs, [{ nodeId: '4', input: 'model', value: ['903', 0] }]);
  assert.deepEqual(pack.referenceBindings, [{
    role: 'canonical-identity',
    nodeId: '902',
    input: 'image',
    strength: { nodeId: '903', input: 'weight' },
  }]);
});

test('compiled packs carry explicit selective runtime and physical model inventories', () => {
  const [pack] = compileIpAdapterReferencePacks(runtime({ roles: ['material-reference'] }));
  assert.deepEqual(pack.runtimePolicy, {
    loadBuiltinExtras: true,
    customNodeFolders: ['ComfyUI_IPAdapter_plus'],
  });
  assert.deepEqual(pack.requiredNodeClasses, ['LoadImage', 'IPAdapterModelLoader', 'CLIPVisionLoader', 'IPAdapterAdvanced']);
  assert.deepEqual(pack.modelInventory.map((item) => item.kind), ['ipadapter', 'clip-vision']);
  assert.equal(pack.runtimeInventory[0].id, 'comfyui-ipadapter-plus');
  assert.deepEqual(pack.capabilities, ['reference-images', 'material-reference']);
});

test('compiler refuses placeholder hashes, unsupported roles and invalid timing', () => {
  assert.throws(
    () => compileIpAdapterReferencePacks(runtime({ runtimeSha256: '0'.repeat(64) })),
    /non-placeholder lowercase SHA-256/u,
  );
  assert.throws(
    () => compileIpAdapterReferencePacks(runtime({ ipAdapterModel: { id: 'x', fileName: 'x.safetensors', sha256: '0'.repeat(64) } })),
    /non-placeholder lowercase SHA-256/u,
  );
  assert.throws(
    () => compileIpAdapterReferencePacks(runtime({ roles: ['pose-control'] })),
    /unsupported by the IP-Adapter pack compiler/u,
  );
  assert.throws(
    () => compileIpAdapterReferencePacks(runtime({ startAt: 0.9, endAt: 0.2 })),
    /startAt may not be greater than endAt/u,
  );
});
