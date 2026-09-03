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
  'scripts/local-generation-managed-runtime-policy-v2.mjs',
  'scripts/local-generation-managed-runtime-policy-v2.test.mjs',
  'scripts/run-local-art-batch-managed.mjs',
  'scripts/run-local-art-batch-entry.mjs',
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

const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/local-generation-reference-pack.v1.schema.json'), 'utf8'));
assert.equal(schema.properties?.runtimePolicy?.properties?.loadBuiltinExtras?.type, 'boolean', 'reference pack schema lost loadBuiltinExtras');
assert.equal(schema.properties?.runtimePolicy?.properties?.customNodeFolders?.maxItems, 16, 'reference pack schema lost custom-node limit');

const template = JSON.parse(fs.readFileSync(path.join(root, 'examples/local-generation-reference-pack.template.json'), 'utf8'));
assert.equal(template.runtimePolicy?.loadBuiltinExtras, true, 'reference pack template lost built-in extras declaration');
assert.ok(Array.isArray(template.runtimePolicy?.customNodeFolders), 'reference pack template lost custom node folder whitelist');

const compiler = fs.readFileSync(path.join(root, 'scripts/compile-comfyui-reference-pack-draft.mjs'), 'utf8');
for (const token of ['runtimePolicy', 'loadBuiltinExtras', 'customNodeFolders', 'SAFE_CUSTOM_NODE_FOLDER', 'next.runtimePolicy']) {
  assert.equal(compiler.includes(token), true, `reference compiler lost ${token}`);
}

const policy = fs.readFileSync(path.join(root, 'scripts/local-generation-managed-runtime-policy-v2.mjs'), 'utf8');
for (const token of ['reviewed-reference', 'true-core', 'reference-capable profile', 'customNodeFolders', 'requiredNodeClasses', 'selectedAdapterIds']) {
  assert.equal(policy.includes(token), true, `managed runtime policy lost ${token}`);
}

const managed = fs.readFileSync(path.join(root, 'scripts/run-local-art-batch-managed.mjs'), 'utf8');
for (const token of [
  'deriveManagedRuntimePolicy',
  'provider-selection.json',
  'EVAVO_COMFYUI_SKIP_BUILTIN_EXTRAS',
  '--disable-all-custom-nodes',
  '--whitelist-custom-nodes',
  '--disable-api-nodes',
  'runtimeMode',
  'customNodeFolders',
  'required reviewed nodes',
]) {
  assert.equal(managed.includes(token), true, `managed launcher lost ${token}`);
}
assert.equal(managed.includes("'--listen', '127.0.0.1'"), true, 'managed launcher lost loopback-only binding');
assert.equal(managed.includes("'--database-url', 'sqlite:///:memory:'"), true, 'managed launcher lost isolated database');
assert.equal(managed.includes('enable all custom nodes'), false, 'managed launcher may not contain blanket custom-node enable behavior');

console.log('Managed local generation runtime policy v2 source contract passed.');
