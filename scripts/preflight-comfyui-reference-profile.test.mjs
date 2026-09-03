#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { digestRuntimeTree } from './local-generation-runtime-tree-digest.mjs';
import { preflightReferenceProfile } from './preflight-comfyui-reference-profile.mjs';

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function profile(modelSha, runtimeSha = 'e'.repeat(64)) {
  return {
    profileId: 'reference-profile-test',
    capabilities: ['generate', 'reference-images', 'identity-reference'],
    workflow: {
      '1': { class_type: 'LoadImage', inputs: { image: 'identity.png' } },
      '2': { class_type: 'SyntheticReferenceApply', inputs: { image: ['1', 0], strength: 0.8 } },
    },
    bindings: {
      referenceImages: [{ role: 'canonical-identity', nodeId: '1', input: 'image', strength: { nodeId: '2', input: 'strength' } }],
    },
    nodeInventory: [
      { nodeId: '1', classType: 'LoadImage' },
      { nodeId: '2', classType: 'SyntheticReferenceApply' },
    ],
    modelInventory: [{ id: 'reference-model', kind: 'reference-model', sha256: modelSha }],
    runtimeInventory: [{ id: 'reference-runtime', version: 'fixture-v1', sha256: runtimeSha }],
    limits: { maximumReferenceImages: 1 },
    profileSha256: 'a'.repeat(64),
    workflowSha256: 'b'.repeat(64),
  };
}
async function server(classes) {
  const instance = createServer((request, response) => {
    if (request.url !== '/object_info') { response.statusCode = 404; response.end(); return; }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(Object.fromEntries(classes.map((name) => [name, { input: { required: {} }, output: [] }]))));
  });
  await new Promise((resolve, reject) => { instance.once('error', reject); instance.listen(0, '127.0.0.1', resolve); });
  const address = instance.address();
  return { instance, baseUrl: `http://127.0.0.1:${address.port}` };
}

test('reference profile preflight proves live node classes, physical model SHA and runtime tree SHA', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-reference-preflight-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const bytes = Buffer.from('reviewed local reference model fixture');
  const digest = sha256(bytes);
  const modelPath = path.join(root, 'reference-model.bin');
  const modelInventoryPath = path.join(root, 'model-inventory.json');
  await writeFile(modelPath, bytes);
  await writeFile(modelInventoryPath, JSON.stringify({
    schema: 'evavo.local-generation-physical-model-inventory.v1',
    entries: [{ id: 'reference-model', path: modelPath, sha256: digest }],
  }));

  const runtimePath = path.join(root, 'reference-runtime');
  await mkdir(path.join(runtimePath, 'module'), { recursive: true });
  await writeFile(path.join(runtimePath, 'runtime.py'), 'print("reviewed runtime")\n');
  await writeFile(path.join(runtimePath, 'module', 'nodes.py'), 'NODE_CLASS_MAPPINGS = {}\n');
  await mkdir(path.join(runtimePath, '__pycache__'), { recursive: true });
  await writeFile(path.join(runtimePath, '__pycache__', 'ignored.pyc'), Buffer.from([1, 2, 3]));
  const runtimeDigest = await digestRuntimeTree(runtimePath);
  const runtimeInventoryPath = path.join(root, 'runtime-inventory.json');
  await writeFile(runtimeInventoryPath, JSON.stringify({
    schema: 'evavo.local-generation-physical-runtime-inventory.v1',
    entries: [{ id: 'reference-runtime', version: 'fixture-v1', path: runtimePath, sha256: runtimeDigest.sha256 }],
  }));

  const live = await server(['LoadImage', 'SyntheticReferenceApply']);
  context.after(() => new Promise((resolve) => live.instance.close(resolve)));
  const result = await preflightReferenceProfile({
    catalog: { profiles: [profile(digest, runtimeDigest.sha256)] },
    profileId: 'reference-profile-test',
    baseUrl: live.baseUrl,
    modelInventoryPath,
    runtimeInventoryPath,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.referenceRoles, ['canonical-identity']);
  assert.deepEqual(result.requiredNodeClasses, ['LoadImage', 'SyntheticReferenceApply']);
  assert.equal(result.models.performed, true);
  assert.equal(result.models.verified[0].sha256, digest);
  assert.equal(result.models.verified[0].bytes, bytes.length);
  assert.equal(result.runtimes.performed, true);
  assert.equal(result.runtimes.verified[0].sha256, runtimeDigest.sha256);
  assert.equal(result.runtimes.verified[0].fileCount, 2);
});

test('runtime tree digest ignores transient caches but fails on reviewed source drift', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-reference-runtime-drift-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const runtimePath = path.join(root, 'runtime');
  await mkdir(runtimePath, { recursive: true });
  await writeFile(path.join(runtimePath, 'runtime.py'), 'value = 1\n');
  const initial = await digestRuntimeTree(runtimePath);
  await mkdir(path.join(runtimePath, '__pycache__'), { recursive: true });
  await writeFile(path.join(runtimePath, '__pycache__', 'runtime.pyc'), 'cache');
  assert.equal((await digestRuntimeTree(runtimePath)).sha256, initial.sha256);
  await writeFile(path.join(runtimePath, 'runtime.py'), 'value = 2\n');
  assert.notEqual((await digestRuntimeTree(runtimePath)).sha256, initial.sha256);
});

test('reference profile preflight fails closed when runtime tree differs from reviewed inventory', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-reference-runtime-mismatch-'));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const runtimePath = path.join(root, 'runtime');
  await mkdir(runtimePath, { recursive: true });
  await writeFile(path.join(runtimePath, 'runtime.py'), 'value = 1\n');
  const runtimeInventoryPath = path.join(root, 'runtime-inventory.json');
  await writeFile(runtimeInventoryPath, JSON.stringify({
    schema: 'evavo.local-generation-physical-runtime-inventory.v1',
    entries: [{ id: 'reference-runtime', version: 'fixture-v1', path: runtimePath, sha256: 'f'.repeat(64) }],
  }));
  const live = await server(['LoadImage', 'SyntheticReferenceApply']);
  context.after(() => new Promise((resolve) => live.instance.close(resolve)));
  await assert.rejects(
    () => preflightReferenceProfile({
      catalog: { profiles: [profile('c'.repeat(64), 'f'.repeat(64))] },
      profileId: 'reference-profile-test',
      baseUrl: live.baseUrl,
      runtimeInventoryPath,
    }),
    /physical runtime reference-runtime SHA-256 mismatch/u,
  );
});

test('reference profile preflight fails closed when live ComfyUI lacks a required class', async (context) => {
  const digest = 'c'.repeat(64);
  const live = await server(['LoadImage']);
  context.after(() => new Promise((resolve) => live.instance.close(resolve)));
  await assert.rejects(
    () => preflightReferenceProfile({ catalog: { profiles: [profile(digest)] }, profileId: 'reference-profile-test', baseUrl: live.baseUrl }),
    /missing required node classes.*SyntheticReferenceApply/u,
  );
});

test('reference profile preflight rejects non-loopback endpoints before network access', async () => {
  const digest = 'd'.repeat(64);
  await assert.rejects(
    () => preflightReferenceProfile({ catalog: { profiles: [profile(digest)] }, profileId: 'reference-profile-test', baseUrl: 'https://example.com' }),
    /base URL must be loopback HTTP/u,
  );
});
