#!/usr/bin/env node
import { closeSync, openSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { compileCouncilAvatarProviderRuntimePackage } from './project-art/council-avatar-provider-runtime.mjs';

function usage() {
  return [
    'Project Art Council avatar provider runtime package',
    '',
    'Prerequisite:',
    '  pnpm --filter @evavo/art-providers build',
    '',
    'Usage:',
    '  node scripts/compile-project-art-council-avatar-provider-runtime.mjs --output <runtime-package.json> [--candidate-count <1-8>] [--adapter <adapter-id>] [--model <model-id>]',
    '',
    'This compiles canonical durable-worker runtime contracts only.',
    'It does not authorize or perform provider calls, approve candidates, promote media, mutate Avatar Runtime, publish or deploy.',
  ].join('\n');
}

const SUPPORTED = new Set([
  '--output',
  '--candidate-count',
  '--adapter',
  '--model',
]);

function parseOptions(argv) {
  if (argv.length % 2 !== 0) throw new Error(usage());
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !SUPPORTED.has(name) ||
      !value ||
      value.startsWith('--') ||
      values.has(name)
    ) {
      throw new Error(usage());
    }
    values.set(name, value);
  }
  return values;
}

function required(values, name) {
  const value = values.get(name);
  if (!value) throw new Error(`Missing ${name}.\n\n${usage()}`);
  return value;
}

function candidateCount(value) {
  if (value === undefined) return undefined;
  if (!/^[1-8]$/u.test(value)) {
    throw new Error('--candidate-count must be an integer from 1 to 8');
  }
  return Number.parseInt(value, 10);
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

export function runCouncilAvatarProviderRuntimeCli(
  argv = process.argv.slice(2),
) {
  const values = parseOptions(argv);
  const count = candidateCount(values.get('--candidate-count'));
  const runtimePackage = compileCouncilAvatarProviderRuntimePackage({
    ...(count === undefined ? {} : { candidateCount: count }),
    ...(values.get('--adapter')
      ? { preferredAdapterId: values.get('--adapter') }
      : {}),
    ...(values.get('--model')
      ? { preferredModel: values.get('--model') }
      : {}),
  });
  const output = writeCreateOnly(
    required(values, '--output'),
    runtimePackage,
  );
  return Object.freeze({
    status: 'passed',
    schema: runtimePackage.schema,
    runtimePackageSha256: runtimePackage.runtimePackageSha256,
    runtimeJobCount: runtimePackage.jobs.length,
    maximumCandidateOutputs:
      runtimePackage.providerCallBudget.maximumCandidateOutputs,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
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
      `${JSON.stringify(runCouncilAvatarProviderRuntimeCli())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'failed',
        code: 'COUNCIL_AVATAR_PROVIDER_RUNTIME_CLI_FAILED',
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}
