#!/usr/bin/env node
import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileCouncilAvatarDirectionMasterExecutionAuthorization,
  validateCouncilAvatarDirectionMasterExecutionAuthorization,
} from './project-art/council-avatar-direction-master-authorization.mjs';
import { compileCouncilAvatarDirectionMasterRuntimePackage } from './project-art/council-avatar-direction-master-runtime.mjs';

function usage() {
  return [
    'Project Art Council avatar direction-master execution authorization',
    '',
    'Usage:',
    '  node scripts/authorize-project-art-council-avatar-direction-masters.mjs --identity-approval <approval.json> --artifact-root <artifact-store> --authorized-at <canonical-UTC> --expires-at <canonical-UTC> --authorized-by <identity> --reason <reason> --output <new-authorization.json> [--candidate-count <1-4>] [--adapter <adapter-id>] [--model <model-id>]',
    '',
    'This command performs zero provider calls. It verifies the exact approved identity-master artifacts and creates one short-lived authorization bound to the exact direction-master runtime specs.',
    'It grants no direction approval, promotion, runtime activation, website activation, publication or deployment authority.',
  ].join('\n');
}

const REQUIRED = Object.freeze([
  '--identity-approval',
  '--artifact-root',
  '--authorized-at',
  '--expires-at',
  '--authorized-by',
  '--reason',
  '--output',
]);
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

export async function runCouncilAvatarDirectionAuthorizationCli(argv = process.argv.slice(2)) {
  const values = parse(argv);
  const identityLockApproval = await readJson(values.get('--identity-approval'));
  const candidateCountRaw = values.get('--candidate-count');
  const candidateCount = candidateCountRaw === undefined ? undefined : Number(candidateCountRaw);
  const options = {
    identityLockApproval,
    artifactRoot: path.resolve(values.get('--artifact-root')),
    authorizedAt: values.get('--authorized-at'),
    expiresAt: values.get('--expires-at'),
    authorizedBy: values.get('--authorized-by'),
    reason: values.get('--reason'),
    ...(candidateCount === undefined ? {} : { candidateCount }),
    ...(values.get('--adapter') ? { preferredAdapterId: values.get('--adapter') } : {}),
    ...(values.get('--model') ? { preferredModel: values.get('--model') } : {}),
  };
  const authorization = await compileCouncilAvatarDirectionMasterExecutionAuthorization(options);
  const runtimePackage = compileCouncilAvatarDirectionMasterRuntimePackage({
    identityLockApproval,
    ...(candidateCount === undefined ? {} : { candidateCount }),
    ...(values.get('--adapter') ? { preferredAdapterId: values.get('--adapter') } : {}),
    ...(values.get('--model') ? { preferredModel: values.get('--model') } : {}),
  });
  validateCouncilAvatarDirectionMasterExecutionAuthorization(authorization, {
    now: new Date(authorization.authorizedAt),
    runtimePackage,
  });
  const output = await writeCreateOnly(values.get('--output'), authorization);
  return Object.freeze({
    status: authorization.status,
    schema: authorization.schema,
    authorizationSha256: authorization.authorizationSha256,
    runtimePackageSha256: authorization.source.runtimePackageSha256,
    directionMasterPlanSha256: authorization.source.directionMasterPlanSha256,
    jobCount: authorization.jobs.length,
    maximumCandidateOutputs: authorization.budget.maximumCandidateOutputs,
    canonicalIdentityCount: authorization.canonicalIdentities.length,
    output,
    zeroSpendAuthorization: true,
    providerExecutionPerformed: false,
    directionMasterApprovalPerformed: false,
    candidatePromotionPerformed: false,
    runtimeActivationPerformed: false,
    websiteActivationPerformed: false,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(await runCouncilAvatarDirectionAuthorizationCli())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      status: 'failed',
      code: 'COUNCIL_AVATAR_DIRECTION_MASTER_AUTHORIZATION_FAILED',
      error: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 1;
  }
}
