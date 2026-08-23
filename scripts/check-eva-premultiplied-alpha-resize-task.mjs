#!/usr/bin/env node
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync(new URL('../evavo.tasks.json', import.meta.url), 'utf8'));
const task = manifest?.tasks?.['eva-premultiplied-alpha-resize'];
if (!task) throw new Error('EVA_HIRES_RESIZE_TASK_MISSING');

const expectedArguments = [
  '--workspace-root', '{{workspaceRoot}}',
  '--plan', '{{plan}}',
  '--plan-sha256', '{{planSha256}}',
  '--receipt', '{{receipt}}',
];
const expectedRequired = ['workspaceRoot', 'plan', 'planSha256', 'receipt'];

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
if (task.runtime !== 'python-script') throw new Error('EVA_HIRES_RESIZE_RUNTIME_DRIFT');
if (task.pythonEnvironment !== 'image-finishing') throw new Error('EVA_HIRES_RESIZE_ENVIRONMENT_DRIFT');
if (task.entry !== 'tools/premultiplied_alpha_resize.py') throw new Error('EVA_HIRES_RESIZE_ENTRY_DRIFT');
if (!same(task.arguments, expectedArguments)) throw new Error('EVA_HIRES_RESIZE_ARGUMENT_DRIFT');
if (task.network !== 'disabled') throw new Error('EVA_HIRES_RESIZE_NETWORK_AUTHORITY_DRIFT');
if (!Number.isSafeInteger(task.timeoutSeconds) || task.timeoutSeconds < 60 || task.timeoutSeconds > 3600) {
  throw new Error('EVA_HIRES_RESIZE_TIMEOUT_DRIFT');
}
const schema = task.parameterSchema;
if (!schema || schema.schemaVersion !== 1 || schema.additionalProperties !== false) {
  throw new Error('EVA_HIRES_RESIZE_PARAMETER_SCHEMA_DRIFT');
}
if (!same(schema.required, expectedRequired)) throw new Error('EVA_HIRES_RESIZE_REQUIRED_PARAMETER_DRIFT');
if (!same(Object.keys(schema.properties ?? {}), expectedRequired)) throw new Error('EVA_HIRES_RESIZE_PARAMETER_SET_DRIFT');
for (const name of ['workspaceRoot', 'plan', 'receipt']) {
  const rule = schema.properties[name];
  const expected = name === 'workspaceRoot'
    ? { type: 'compute-path', pathKind: 'directory', access: 'input' }
    : name === 'plan'
      ? { type: 'compute-path', pathKind: 'file', access: 'input' }
      : { type: 'compute-path', pathKind: 'file', access: 'output' };
  if (!same(rule, expected)) throw new Error(`EVA_HIRES_RESIZE_${name.toUpperCase()}_RULE_DRIFT`);
}
const digest = schema.properties.planSha256;
if (!digest || digest.type !== 'string' || digest.minimumLength !== 64 || digest.maximumLength !== 64 || digest.pattern !== '^[0-9a-f]{64}$') {
  throw new Error('EVA_HIRES_RESIZE_PLAN_DIGEST_DRIFT');
}
if (!same(task.parameterOutputs, ['receipt'])) throw new Error('EVA_HIRES_RESIZE_OUTPUT_AUTHORITY_DRIFT');

const producer = fs.readFileSync(new URL('../tools/premultiplied_alpha_resize.py', import.meta.url), 'utf8');
for (const marker of [
  'evavo.premultiplied-alpha-resize-plan.v1',
  'evavo.premultiplied-alpha-resize-receipt.v1',
  'premultiplied-alpha-area',
  'clear_fully_transparent_rgb',
  'sourceOverwrite',
  'createOnlyOutput',
  'runtimeActivation',
  'websiteActivation',
  'publication',
]) {
  if (!producer.includes(marker)) throw new Error(`EVA_HIRES_RESIZE_PRODUCER_CONTRACT_MISSING:${marker}`);
}
for (const forbidden of ['subprocess.', 'requests.', 'urllib.request', 'git push', 'forcePush = True']) {
  if (producer.includes(forbidden)) throw new Error(`EVA_HIRES_RESIZE_PRODUCER_AUTHORITY_EXPANDED:${forbidden}`);
}

console.log(JSON.stringify({
  ok: true,
  schema: 'evavo_eva_hires_resize_named_task_guard_v1',
  task: 'eva-premultiplied-alpha-resize',
  producer: task.entry,
  pythonEnvironment: task.pythonEnvironment,
  network: task.network,
  parameterOutputs: task.parameterOutputs,
  executionPerformed: false,
  approvalAuthority: false,
  publicationAuthority: false,
  runtimeActivationAuthority: false,
  websiteActivationAuthority: false,
}));
