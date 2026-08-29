#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { executeAuthorizedCouncilAvatarProviderJobs } from './project-art/council-avatar-provider-executor.mjs';

function usage() {
  return [
    'Project Art Council avatar governed provider execution',
    '',
    'Prerequisites:',
    '  pnpm --filter @evavo/art-providers build',
    '  pnpm --filter @evavo/art-runtime build',
    '  pnpm --filter @evavo/art-artifacts build',
    '  pnpm --filter @evavo/art-studio-worker build',
    '  a non-expired Council avatar provider execution authorization',
    '',
    'Usage:',
    '  node scripts/execute-project-art-council-avatar-provider.mjs --authorization <authorization.json> --runtime-root <new-dir> --artifact-root <new-dir> [--character-id <council-critic|council-open-reviewer>]',
    '',
    'Both roots must be new paths. The worker is isolated, single-concurrency, one-attempt and restricted to the authorized adapter.',
    'Generated candidates remain unapproved and are not promoted into Avatar Runtime or the website.',
  ].join('\n');
}

const REQUIRED = new Set([
  '--authorization',
  '--runtime-root',
  '--artifact-root',
]);
const OPTIONAL = new Set(['--character-id']);
const SUPPORTED = new Set([...REQUIRED, ...OPTIONAL]);

function parse(argv) {
  if (argv.length % 2 !== 0) throw new Error(usage());
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!SUPPORTED.has(name) || !value?.trim() || values.has(name)) {
      throw new Error(usage());
    }
    values.set(name, value.trim());
  }
  for (const name of REQUIRED) {
    if (!values.has(name)) throw new Error(`Missing ${name}.\n\n${usage()}`);
  }
  const characterId = values.get('--character-id');
  if (
    characterId &&
    !new Set(['council-critic', 'council-open-reviewer']).has(characterId)
  ) {
    throw new Error('--character-id must be council-critic or council-open-reviewer');
  }
  return values;
}

export async function runCouncilAvatarProviderExecutionCli(
  argv = process.argv.slice(2),
) {
  const values = parse(argv);
  return executeAuthorizedCouncilAvatarProviderJobs({
    authorizationPath: values.get('--authorization'),
    runtimeRoot: values.get('--runtime-root'),
    artifactRoot: values.get('--artifact-root'),
    ...(values.get('--character-id')
      ? { characterId: values.get('--character-id') }
      : {}),
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.stdout.write(
      `${JSON.stringify(await runCouncilAvatarProviderExecutionCli())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'failed',
        code: 'COUNCIL_AVATAR_PROVIDER_EXECUTION_FAILED',
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}
