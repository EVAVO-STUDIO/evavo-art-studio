#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'schemas/local-generation-reference-pack.v1.schema.json',
  'examples/local-generation-reference-pack.template.json',
  'scripts/compile-comfyui-reference-pack-draft.mjs',
  'scripts/compile-comfyui-reference-pack-draft.test.mjs',
  'scripts/preflight-comfyui-reference-profile.mjs',
  'scripts/preflight-comfyui-reference-profile.test.mjs',
];
for (const relative of required) {
  const file = path.join(root, relative);
  assert.equal(fs.existsSync(file), true, `missing ${relative}`);
  const state = fs.lstatSync(file);
  assert.equal(state.isFile(), true, `${relative} must be a regular file`);
  assert.equal(state.isSymbolicLink(), false, `${relative} must not be a symlink`);
  assert.ok(state.size > 0, `${relative} must not be empty`);
}
for (const relative of required.filter((value) => value.endsWith('.mjs'))) {
  const check = spawnSync(process.execPath, ['--check', path.join(root, relative)], { cwd: root, encoding: 'utf8', shell: false, windowsHide: true });
  assert.equal(check.status, 0, check.stderr || check.stdout || `${relative} syntax check failed`);
}
const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/local-generation-reference-pack.v1.schema.json'), 'utf8'));
assert.equal(schema.$id?.includes('local-generation-reference-pack.v1'), true, 'reference pack schema lost v1 identity');
const template = JSON.parse(fs.readFileSync(path.join(root, 'examples/local-generation-reference-pack.template.json'), 'utf8'));
assert.equal(template.schema, 'evavo.local-generation-reference-pack.v1', 'reference pack template schema drifted');
const compiler = fs.readFileSync(path.join(root, 'scripts/compile-comfyui-reference-pack-draft.mjs'), 'utf8');
for (const token of ['reference-images', 'maximumReferenceImages', 'referenceBindings', 'requiredNodeClasses', 'modelInventory', 'runtimeInventory', 'workflow.setInputs', 'may not overwrite existing workflow node']) {
  assert.equal(compiler.includes(token), true, `reference pack compiler lost ${token}`);
}
const preflight = fs.readFileSync(path.join(root, 'scripts/preflight-comfyui-reference-profile.mjs'), 'utf8');
for (const token of ['/object_info', 'maximumReferenceImages', 'physical model inventory', 'sha256File', 'loopback HTTP', 'evavo.comfyui-reference-profile-preflight.v1']) {
  assert.equal(preflight.includes(token), true, `reference profile preflight lost ${token}`);
}
console.log('Local generation reference pack source contract passed.');
