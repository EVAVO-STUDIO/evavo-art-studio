#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { executeAuthorizedCouncilAvatarDirectionMasterJobs } from './project-art/council-avatar-direction-master-executor.mjs';

function usage() {
  return [
    'Project Art Council avatar direction-master execution',
    '',
    'Usage:',
    '  node scripts/execute-project-art-council-avatar-direction-masters.mjs --authorization <authorization.json> --identity-approval <approval.json> --runtime-root <new-runtime-dir> --artifact-root <existing-artifact-store> [--character <character-id>] [--view <view-id>]',
    '',
    'This command may perform provider calls only when the supplied short-lived authorization is currently active and the exact zero-spend readiness checks pass.',
    'The existing artifact store must contain the exact approved identity-master artifacts. Generated outputs remain unapproved and are technically mastered for independent review.',
  ].join('\n');
}

const REQUIRED = new Set([
  '--authorization',
  '--identity-approval',
  '--runtime-root',
  '--artifact-root',
]);
const SUPPORTED = new Set([...REQUIRED, '--character', '--view']);

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

export async function runCouncilAvatarDirectionExecutionCli(argv = process.argv.slice(2)) {
  const values = parse(argv);
  return executeAuthorizedCouncilAvatarDirectionMasterJobs({
    authorizationPath: path.resolve(values.get('--authorization')),
    identityApprovalPath: path.resolve(values.get('--identity-approval')),
    runtimeRoot: path.resolve(values.get('--runtime-root')),
    artifactRoot: path.resolve(values.get('--artifact-root')),
    ...(values.get('--character') ? { characterId: values.get('--character') } : {}),
    ...(values.get('--view') ? { viewId: values.get('--view') } : {}),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(await runCouncilAvatarDirectionExecutionCli())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      status: 'failed',
      code: 'COUNCIL_AVATAR_DIRECTION_MASTER_EXECUTION_FAILED',
      error: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 1;
  }
}
