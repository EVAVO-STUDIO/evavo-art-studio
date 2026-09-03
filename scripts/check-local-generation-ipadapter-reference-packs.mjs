#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'schemas/local-generation-ipadapter-runtime.v1.schema.json',
  'examples/local-generation-ipadapter-runtime.template.json',
  'scripts/compile-comfyui-ipadapter-reference-packs.mjs',
  'scripts/compile-comfyui-ipadapter-reference-packs.test.mjs',
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
    shell: false,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || `${relative} syntax check failed`);
}

const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/local-generation-ipadapter-runtime.v1.schema.json'), 'utf8'));
assert.equal(schema.$id?.includes('local-generation-ipadapter-runtime.v1'), true, 'IP-Adapter runtime schema lost v1 identity');
for (const property of ['runtimeSha256', 'ipAdapterModel', 'clipVisionModel', 'roles', 'customNodeFolder']) {
  assert.ok(schema.properties?.[property], `IP-Adapter runtime schema lost ${property}`);
}

const template = JSON.parse(fs.readFileSync(path.join(root, 'examples/local-generation-ipadapter-runtime.template.json'), 'utf8'));
assert.equal(template.schema, 'evavo.local-generation-ipadapter-runtime.v1', 'IP-Adapter runtime template schema drifted');
assert.equal(template.customNodeFolder, 'ComfyUI_IPAdapter_plus', 'IP-Adapter runtime template lost reviewed custom-node folder convention');

const compiler = fs.readFileSync(path.join(root, 'scripts/compile-comfyui-ipadapter-reference-packs.mjs'), 'utf8');
for (const token of [
  'IPAdapterModelLoader',
  'IPAdapterAdvanced',
  'CLIPVisionLoader',
  'LoadImage',
  'reference-${role}',
  'runtimePolicy',
  'loadBuiltinExtras',
  'customNodeFolders',
  'non-placeholder lowercase SHA-256',
  'identity-reference',
  'direction-reference',
  'palette-reference',
  'material-reference',
]) {
  assert.equal(compiler.includes(token), true, `IP-Adapter compiler lost ${token}`);
}
assert.equal(compiler.includes("ZERO_SHA = /^0{64}$/u"), true, 'IP-Adapter compiler no longer refuses zero placeholder hashes');

console.log('Local generation IP-Adapter reference pack source contract passed.');
