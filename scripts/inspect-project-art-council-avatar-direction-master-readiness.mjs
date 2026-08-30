#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { inspectCouncilAvatarDirectionMasterReadiness } from './project-art/council-avatar-direction-master-readiness.mjs';

function usage() {
  return [
    'Project Art Council avatar direction-master readiness',
    '',
    'Usage:',
    '  node scripts/inspect-project-art-council-avatar-direction-master-readiness.mjs --identity-approval <approval.json> --artifact-root <artifact-store> [--candidate-count <1-4>] [--adapter <adapter-id>] [--model <model-id>]',
    '',
    'This command performs a zero-spend local readiness inspection. It makes no remote provider call and prints no secret values.',
  ].join('\n');
}

const REQUIRED = new Set(['--identity-approval', '--artifact-root']);
const SUPPORTED = new Set([...REQUIRED, '--candidate-count', '--adapter', '--model']);

function parse(argv) {
  if (argv.length % 2 !== 0) throw new Error(usage());
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!SUPPORTED.has(name) || !value?.trim() || values.has(name)) throw new Error(usage());
    values.set(name, value.trim());
  }
  for (const name of REQUIRED) {
    if (!values.has(name)) throw new Error(`Missing ${name}.\n\n${usage()}`);
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

export async function runCouncilAvatarDirectionReadinessCli(argv = process.argv.slice(2)) {
  const values = parse(argv);
  const candidateCountRaw = values.get('--candidate-count');
  const candidateCount = candidateCountRaw === undefined ? undefined : Number(candidateCountRaw);
  const readiness = await inspectCouncilAvatarDirectionMasterReadiness({
    identityLockApproval: await readJson(values.get('--identity-approval')),
    artifactRoot: path.resolve(values.get('--artifact-root')),
    ...(candidateCount === undefined ? {} : { candidateCount }),
    ...(values.get('--adapter') ? { preferredAdapterId: values.get('--adapter') } : {}),
    ...(values.get('--model') ? { preferredModel: values.get('--model') } : {}),
  });
  return Object.freeze({
    status: readiness.readiness.readyForBoundedExecutionAuthorization ? 'ready' : 'blocked',
    schema: readiness.schema,
    zeroSpendInspection: readiness.zeroSpendInspection,
    remoteProviderCallPerformed: readiness.remoteProviderCallPerformed,
    identityApprovalSha256: readiness.identityApprovalSha256,
    directionMasterPlanSha256: readiness.directionMasterPlanSha256,
    runtimePackageSha256: readiness.runtimePackageSha256,
    desired: readiness.desired,
    worker: readiness.worker,
    identityArtifacts: readiness.identityArtifacts,
    readiness: readiness.readiness,
    blockers: readiness.blockers,
    providerExecutionAuthorized: false,
    directionMasterApprovalEstablished: false,
    candidatePromotionEstablished: false,
    runtimeActivationAllowed: false,
    websiteActivationAllowed: false,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(await runCouncilAvatarDirectionReadinessCli())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      status: 'failed',
      code: 'COUNCIL_AVATAR_DIRECTION_MASTER_READINESS_FAILED',
      error: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 1;
  }
}
