#!/usr/bin/env node
import { mkdir, open } from 'node:fs/promises';
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
    '  node scripts/execute-project-art-council-avatar-provider.mjs --authorization <authorization.json> --runtime-root <new-dir> --artifact-root <new-dir> --output <new-result.json> [--character-id <council-critic|council-open-reviewer>]',
    '',
    'Both roots and the result file must be new paths. The worker is isolated, single-concurrency, one-attempt and restricted to the authorized adapter.',
    'Generated candidates remain unapproved and are not promoted into Avatar Runtime or the website.',
  ].join('\n');
}

const REQUIRED = new Set([
  '--authorization',
  '--runtime-root',
  '--artifact-root',
  '--output',
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

async function writeCreateOnly(filePath, value) {
  const absolute = path.resolve(filePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  const handle = await open(absolute, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } finally {
    await handle.close();
  }
  return absolute;
}

export async function runCouncilAvatarProviderExecutionCli(
  argv = process.argv.slice(2),
) {
  const values = parse(argv);
  const result = await executeAuthorizedCouncilAvatarProviderJobs({
    authorizationPath: values.get('--authorization'),
    runtimeRoot: values.get('--runtime-root'),
    artifactRoot: values.get('--artifact-root'),
    ...(values.get('--character-id')
      ? { characterId: values.get('--character-id') }
      : {}),
  });
  const output = await writeCreateOnly(values.get('--output'), result);
  return Object.freeze({
    status: result.provider.failed === 0 ? 'completed' : 'completed-with-failures',
    schema: result.schema,
    authorizationSha256: result.authorizationSha256,
    runtimePackageSha256: result.runtimePackageSha256,
    provider: result.provider,
    technicalAssurance: Object.freeze({
      submitted: result.technicalAssurance.submitted,
      succeeded: result.technicalAssurance.succeeded,
      failed: result.technicalAssurance.failed,
    }),
    candidateApprovalEstablished: false,
    candidatePromotionEstablished: false,
    runtimeActivationAllowed: false,
    output,
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
