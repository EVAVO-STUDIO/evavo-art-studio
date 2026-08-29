#!/usr/bin/env node
import { closeSync, openSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { compileCouncilAvatarProviderExecutionAuthorization } from './project-art/council-avatar-provider-authorization.mjs';

function usage() {
  return [
    'Project Art Council avatar provider execution authorization',
    '',
    'Prerequisites:',
    '  pnpm --filter @evavo/art-providers build',
    '  pnpm --filter @evavo/art-studio-worker build',
    '  zero-spend provider readiness must pass in the current environment',
    '',
    'Usage:',
    '  node scripts/authorize-project-art-council-avatar-provider-execution.mjs --authorized-at <ISO UTC> --expires-at <ISO UTC> --authorized-by <name> --reason <text> --output <authorization.json>',
    '',
    'Maximum authorization lifetime is one hour. This command does not submit or execute provider jobs.',
  ].join('\n');
}

const SUPPORTED = new Set([
  '--authorized-at',
  '--expires-at',
  '--authorized-by',
  '--reason',
  '--output',
]);

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
  for (const name of SUPPORTED) {
    if (!values.has(name)) throw new Error(`Missing ${name}.\n\n${usage()}`);
  }
  return values;
}

function writeCreateOnly(outputPath, value) {
  const absolute = path.resolve(outputPath);
  const handle = openSync(absolute, 'wx', 0o600);
  try {
    writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } finally {
    closeSync(handle);
  }
  return absolute;
}

export async function runCouncilAvatarProviderAuthorizationCli(
  argv = process.argv.slice(2),
) {
  const values = parse(argv);
  const authorization = await compileCouncilAvatarProviderExecutionAuthorization({
    authorizedAt: values.get('--authorized-at'),
    expiresAt: values.get('--expires-at'),
    authorizedBy: values.get('--authorized-by'),
    reason: values.get('--reason'),
  });
  const output = writeCreateOnly(values.get('--output'), authorization);
  return Object.freeze({
    status: authorization.status,
    schema: authorization.schema,
    authorizationSha256: authorization.authorizationSha256,
    expiresAt: authorization.expiresAt,
    adapter: authorization.adapter,
    budget: authorization.budget,
    executionCapability: authorization.executionCapability,
    providerCallPerformed: false,
    output,
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.stdout.write(
      `${JSON.stringify(await runCouncilAvatarProviderAuthorizationCli())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'failed',
        code: 'COUNCIL_AVATAR_PROVIDER_AUTHORIZATION_CLI_FAILED',
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}
