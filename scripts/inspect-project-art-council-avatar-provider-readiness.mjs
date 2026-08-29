#!/usr/bin/env node
import { closeSync, openSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { inspectCouncilAvatarProviderReadiness } from './project-art/council-avatar-provider-readiness.mjs';

function usage() {
  return [
    'Project Art Council avatar provider readiness',
    '',
    'Prerequisites:',
    '  pnpm --filter @evavo/art-providers build',
    '  pnpm --filter @evavo/art-studio-worker build',
    '',
    'Usage:',
    '  node scripts/inspect-project-art-council-avatar-provider-readiness.mjs [--output <readiness.json>]',
    '',
    'This is a zero-spend local inspection. It never performs a remote provider call and never prints secret values.',
  ].join('\n');
}

function parseOptions(argv) {
  if (argv.length === 0) return Object.freeze({ output: null });
  if (argv.length !== 2 || argv[0] !== '--output' || !argv[1]?.trim()) {
    throw new Error(usage());
  }
  return Object.freeze({ output: argv[1].trim() });
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

export async function runCouncilAvatarProviderReadinessCli(
  argv = process.argv.slice(2),
) {
  const options = parseOptions(argv);
  const readiness = await inspectCouncilAvatarProviderReadiness();
  const output = options.output
    ? writeCreateOnly(options.output, readiness)
    : null;
  return Object.freeze({
    status: readiness.readiness.configuredWithoutSpend ? 'ready' : 'blocked',
    schema: readiness.schema,
    zeroSpendInspection: true,
    remoteProviderCallPerformed: false,
    providerExecutionAuthorized: false,
    desired: readiness.desired,
    environment: readiness.environment,
    worker: readiness.worker,
    adapters: readiness.adapters,
    readiness: readiness.readiness,
    blockers: readiness.blockers,
    output,
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.stdout.write(
      `${JSON.stringify(await runCouncilAvatarProviderReadinessCli())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'failed',
        code: 'COUNCIL_AVATAR_PROVIDER_READINESS_CLI_FAILED',
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}
