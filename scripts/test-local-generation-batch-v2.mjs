#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeTests = [
  'scripts/local-generation-batch-v2.test.mjs',
  'scripts/local-generation-batch-audit-v2.test.mjs',
  'scripts/compile-comfyui-quality-profile-draft.test.mjs',
  'scripts/compile-comfyui-reference-pack-draft.test.mjs',
  'scripts/compile-comfyui-ipadapter-reference-packs.test.mjs',
  'scripts/preflight-comfyui-reference-profile.test.mjs',
  'scripts/local-generation-managed-runtime-policy-v2.test.mjs',
  'scripts/local-generation-reference-graph-v2.test.mjs',
  'scripts/local-generation-reference-execution-v2.test.mjs',
  'scripts/local-generation-model-plan-v2.test.mjs',
  'scripts/local-generation-v1-reference-bridge.test.mjs',
];

function run(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${label} failed${detail ? `:\n${detail}` : ''}`);
  }
  if (result.stdout?.trim()) process.stdout.write(result.stdout.trimEnd() + '\n');
  if (result.stderr?.trim()) process.stderr.write(result.stderr.trimEnd() + '\n');
}

run(['--test', ...nodeTests], 'local generation V2 Node contracts');
run(['scripts/check-local-generation-batch-v2.mjs'], 'local generation V2 source contract');
run(['scripts/check-local-generation-reference-pack.mjs'], 'local generation reference pack source contract');
run(['scripts/check-local-generation-managed-runtime-policy-v2.mjs'], 'managed local generation runtime policy source contract');
run(['scripts/check-local-generation-ipadapter-reference-packs.mjs'], 'IP-Adapter reference pack source contract');

process.stdout.write(`${JSON.stringify({
  schema: 'evavo.local-generation-batch-v2-contract-receipt.v1',
  ok: true,
  testFiles: nodeTests,
  sourceContract: 'scripts/check-local-generation-batch-v2.mjs',
  referencePackSourceContract: 'scripts/check-local-generation-reference-pack.mjs',
  managedRuntimePolicySourceContract: 'scripts/check-local-generation-managed-runtime-policy-v2.mjs',
  ipAdapterReferencePackSourceContract: 'scripts/check-local-generation-ipadapter-reference-packs.mjs',
  includesDurableV1ReferenceBridge: true,
  includesReferencePackCompiler: true,
  includesIpAdapterReferencePackCompiler: true,
  includesLiveReferenceProfilePreflight: true,
  includesSelectiveManagedReferenceRuntime: true,
})}\n`);
