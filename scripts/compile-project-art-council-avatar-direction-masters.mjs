#!/usr/bin/env node
import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { compileCouncilAvatarDirectionMasterPlan } from './project-art/council-avatar-direction-master-candidates.mjs';

function usage() {
  return [
    'Project Art Council avatar direction-master candidate plan',
    '',
    'Usage:',
    '  node scripts/compile-project-art-council-avatar-direction-masters.mjs --identity-approval <approval.json> --output <new-plan.json> [--candidate-count <1-4>] [--adapter <adapter-id>] [--model <model-id>]',
    '',
    'This command compiles requests only. It performs no provider call and grants no direction approval, promotion, runtime activation or website activation.',
  ].join('\n');
}

const SUPPORTED = new Set([
  '--identity-approval',
  '--output',
  '--candidate-count',
  '--adapter',
  '--model',
]);

function parse(argv) {
  if (argv.length % 2 !== 0) throw new Error(usage());
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!SUPPORTED.has(name) || !value?.trim() || values.has(name)) throw new Error(usage());
    values.set(name, value.trim());
  }
  if (!values.has('--identity-approval') || !values.has('--output')) {
    throw new Error(usage());
  }
  return values;
}

async function readJson(filePath) {
  const value = JSON.parse(await readFile(path.resolve(filePath), 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('identity approval must be a JSON object');
  }
  return value;
}

async function writeCreateOnly(filePath, value) {
  const absolute = path.resolve(filePath);
  const handle = await open(absolute, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } finally {
    await handle.close();
  }
  return absolute;
}

export async function runCouncilAvatarDirectionMasterPlanCli(argv = process.argv.slice(2)) {
  const values = parse(argv);
  const candidateCountRaw = values.get('--candidate-count');
  const candidateCount = candidateCountRaw === undefined ? undefined : Number(candidateCountRaw);
  const plan = compileCouncilAvatarDirectionMasterPlan({
    identityLockApproval: await readJson(values.get('--identity-approval')),
    ...(candidateCount === undefined ? {} : { candidateCount }),
    ...(values.get('--adapter') ? { preferredAdapterId: values.get('--adapter') } : {}),
    ...(values.get('--model') ? { preferredModel: values.get('--model') } : {}),
  });
  const output = await writeCreateOnly(values.get('--output'), plan);
  return Object.freeze({
    status: 'compiled',
    schema: plan.schema,
    planSha256: plan.planSha256,
    approvedCharacterIds: plan.approvedCharacterIds,
    viewCount: plan.viewCount,
    candidateCountPerView: plan.candidateCountPerView,
    maximumCandidateOutputs: plan.maximumCandidateOutputs,
    output,
    providerExecutionPerformed: false,
    directionMasterApprovalPerformed: false,
    candidatePromotionPerformed: false,
    runtimeActivationPerformed: false,
    websiteActivationPerformed: false,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(await runCouncilAvatarDirectionMasterPlanCli())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      status: 'failed',
      code: 'COUNCIL_AVATAR_DIRECTION_MASTER_PLAN_FAILED',
      error: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 1;
  }
}
