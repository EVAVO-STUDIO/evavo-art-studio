#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveManagedRuntimePolicy } from './local-generation-managed-runtime-policy-v2.mjs';

function profile(id, overrides = {}) {
  return {
    profileId: id,
    capabilities: ['generate', 'seed', 'custom-size', 'cancellation'],
    workflow: {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: {} },
      '2': { class_type: 'KSampler', inputs: {} },
      '3': { class_type: 'SaveImage', inputs: {} },
    },
    nodeInventory: [
      { nodeId: '1', classType: 'CheckpointLoaderSimple' },
      { nodeId: '2', classType: 'KSampler' },
      { nodeId: '3', classType: 'SaveImage' },
    ],
    ...overrides,
  };
}

test('core-only selection remains true-core with no custom-node whitelist', () => {
  const policy = deriveManagedRuntimePolicy(
    { adapterId: 'comfyui:sdxl-base-local-cinematic_stills', referenceAdapterIds: [] },
    { profiles: [profile('sdxl-base-local-cinematic_stills')] },
  );
  assert.equal(policy.mode, 'true-core');
  assert.equal(policy.loadBuiltinExtras, false);
  assert.deepEqual(policy.customNodeFolders, []);
  assert.deepEqual(policy.requiredNodeClasses, ['CheckpointLoaderSimple', 'KSampler', 'SaveImage']);
});

test('reference selection merges only reviewed profile runtime policies', () => {
  const policy = deriveManagedRuntimePolicy(
    {
      adapterId: 'comfyui:sdxl-base-local-cinematic_stills',
      referenceAdapterIds: [
        'comfyui:sdxl-base-local-cinematic_stills-reference-canonical-identity',
        'comfyui:sdxl-base-local-cinematic_stills-reference-pose-control',
      ],
    },
    {
      profiles: [
        profile('sdxl-base-local-cinematic_stills'),
        profile('sdxl-base-local-cinematic_stills-reference-canonical-identity', {
          capabilities: ['generate', 'seed', 'custom-size', 'cancellation', 'reference-images', 'identity-reference'],
          runtimePolicy: { loadBuiltinExtras: true, customNodeFolders: ['ComfyUI_IPAdapter_plus'] },
          nodeInventory: [{ nodeId: '100', classType: 'IPAdapterAdvanced' }],
        }),
        profile('sdxl-base-local-cinematic_stills-reference-pose-control', {
          capabilities: ['generate', 'seed', 'custom-size', 'cancellation', 'reference-images', 'pose-control'],
          runtimePolicy: { loadBuiltinExtras: true, customNodeFolders: ['comfyui_controlnet_aux'] },
          nodeInventory: [{ nodeId: '200', classType: 'AIO_Preprocessor' }],
        }),
      ],
    },
  );
  assert.equal(policy.mode, 'reviewed-reference');
  assert.equal(policy.loadBuiltinExtras, true);
  assert.deepEqual(policy.customNodeFolders, ['ComfyUI_IPAdapter_plus', 'comfyui_controlnet_aux']);
  assert.deepEqual(policy.requiredNodeClasses, ['AIO_Preprocessor', 'CheckpointLoaderSimple', 'IPAdapterAdvanced', 'KSampler', 'SaveImage']);
});

test('reference-capable profiles fail closed without an explicit runtime policy', () => {
  assert.throws(
    () => deriveManagedRuntimePolicy(
      {
        adapterId: 'comfyui:base',
        referenceAdapterIds: ['comfyui:base-reference-canonical-identity'],
      },
      {
        profiles: [
          profile('base'),
          profile('base-reference-canonical-identity', {
            capabilities: ['generate', 'reference-images', 'identity-reference'],
          }),
        ],
      },
    ),
    /must declare runtimePolicy/u,
  );
});

test('runtime policy refuses invalid custom node folders and missing selected profiles', () => {
  assert.throws(
    () => deriveManagedRuntimePolicy(
      { adapterId: 'comfyui:base', referenceAdapterIds: ['comfyui:bad-ref'] },
      {
        profiles: [
          profile('base'),
          profile('bad-ref', {
            capabilities: ['generate', 'reference-images'],
            runtimePolicy: { loadBuiltinExtras: true, customNodeFolders: ['bad folder'] },
          }),
        ],
      },
    ),
    /customNodeFolders is invalid/u,
  );

  assert.throws(
    () => deriveManagedRuntimePolicy(
      { adapterId: 'comfyui:missing', referenceAdapterIds: [] },
      { profiles: [profile('base')] },
    ),
    /missing from the physical catalog/u,
  );
});
