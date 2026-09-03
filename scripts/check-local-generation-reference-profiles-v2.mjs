#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'scripts/local-generation-reference-profile-v2.mjs',
  'scripts/local-generation-reference-profile-v2.test.mjs',
  'schemas/local-generation-reference-profile.v2.schema.json',
  'scripts/local-generation-reference-graph-v2.mjs',
  'scripts/local-generation-managed-runtime-policy-v2.mjs',
  'scripts/compile-comfyui-core-reference-catalog.mjs',
];
for (const relative of required) {
  const file = path.join(root, relative);
  assert.equal(fs.existsSync(file), true, `missing ${relative}`);
  const state = fs.lstatSync(file);
  assert.equal(state.isFile(), true, `${relative} must be a file`);
  assert.equal(state.isSymbolicLink(), false, `${relative} must not be a symlink`);
  assert.ok(state.size > 0, `${relative} must not be empty`);
}
for (const relative of required.filter((value) => value.endsWith('.mjs'))) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || `${relative} syntax failed`);
}

const compiler = fs.readFileSync(path.join(root, 'scripts/local-generation-reference-profile-v2.mjs'), 'utf8');
const tests = fs.readFileSync(path.join(root, 'scripts/local-generation-reference-profile-v2.test.mjs'), 'utf8');
const runtimePolicy = fs.readFileSync(path.join(root, 'scripts/local-generation-managed-runtime-policy-v2.mjs'), 'utf8');
const coreCompiler = fs.readFileSync(path.join(root, 'scripts/compile-comfyui-core-reference-catalog.mjs'), 'utf8');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/local-generation-reference-profile.v2.schema.json'), 'utf8'));

for (const token of [
  'compileReferenceProfileDraft', 'appendReferenceProfilesToDraft',
  'referenceImages', 'runtimePolicy', 'customNodeFolders',
  'modelInventoryAdditions', 'runtimeInventoryAdditions', 'maximumReferenceImages',
  'specificationSha256', 'workflowSha256', 'REFERENCE_CAPABILITY_REQUIREMENTS',
]) assert.equal(compiler.includes(token), true, `reference profile compiler lost ${token}`);

for (const token of [
  'identity reference profile derives executable reference capabilities',
  'multiple-reference-images', 'missing workflow node', 'duplicate role',
  'custom-node runtime policy', 'maximumReferenceImages',
]) assert.equal(tests.includes(token), true, `reference profile tests lost ${token}`);

for (const token of [
  'reference-capable profile', 'runtimePolicy', 'loadBuiltinExtras', 'customNodeFolders',
  'reviewed-reference', 'requiredNodeClasses',
]) assert.equal(runtimePolicy.includes(token), true, `managed reference runtime policy lost ${token}`);

assert.equal(coreCompiler.includes("'canonical-identity'"), false, 'core img2img compiler must not publish canonical-identity semantics');
for (const role of ['base-image', 'direction-master', 'previous-key-pose', 'next-key-pose']) {
  assert.equal(coreCompiler.includes(`'${role}'`), true, `core img2img compiler lost ${role}`);
}
for (const token of ['whole-image latent guidance only', 'not IP-Adapter identity conditioning', 'not an honest core img2img reference role']) {
  assert.equal(coreCompiler.includes(token), true, `core img2img truth boundary lost ${token}`);
}

assert.equal(schema.$id?.includes('local-generation-reference-profile.v2'), true, 'reference profile schema identity drifted');
assert.equal(schema.properties?.schema?.const, 'evavo.local-generation-reference-profiles.v2', 'reference profile schema discriminator drifted');
assert.ok(schema.$defs?.referenceBinding, 'reference profile schema lost binding definition');
assert.ok(schema.$defs?.profile?.properties?.runtimePolicy, 'reference profile schema lost runtimePolicy');

const testRun = spawnSync(process.execPath, ['--test', path.join(root, 'scripts/local-generation-reference-profile-v2.test.mjs')], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
  shell: false,
});
assert.equal(testRun.status, 0, testRun.stderr || testRun.stdout || 'reference profile tests failed');
console.log('Local generation reference profile v2 source contract passed.');
