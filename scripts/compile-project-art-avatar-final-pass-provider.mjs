#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileProjectArtAvatarFinalPassProviderBatchFile,
} from './project-art/avatar-final-pass-provider.mjs';

function parseArguments(argv) {
  if (argv.length % 2 !== 0) {
    throw new Error('Arguments must be unique --name value pairs.');
  }
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !name?.startsWith('--') ||
      !value ||
      value.startsWith('--') ||
      values.has(name)
    ) {
      throw new Error('Arguments must be unique --name value pairs.');
    }
    if (!['--plan', '--request', '--output', '--compiled-at'].includes(name)) {
      throw new Error(`Unsupported argument ${name}.`);
    }
    values.set(name, value);
  }
  return values;
}

function required(values, name) {
  const value = values.get(name);
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

export function runAvatarFinalPassProviderCli(argv = process.argv.slice(2)) {
  const values = parseArguments(argv);
  const outputPath = required(values, '--output');
  const batch = compileProjectArtAvatarFinalPassProviderBatchFile({
    planPath: required(values, '--plan'),
    requestPath: required(values, '--request'),
    outputPath,
    ...(values.get('--compiled-at')
      ? { compiledAt: values.get('--compiled-at') }
      : {}),
  });
  return {
    status: 'passed',
    schema: batch.schema,
    requestId: batch.requestId,
    batchSha256: batch.batchSha256,
    requested: batch.counts.requested,
    ready: batch.counts.ready,
    blocked: batch.counts.blocked,
    providerExecution: false,
    candidateApproval: false,
    runtimeActivationAllowed: false,
    output: path.resolve(outputPath),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(runAvatarFinalPassProviderCli())}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'failed',
        code: error?.code ?? 'AVATAR_FINAL_PASS_PROVIDER_CLI_FAILED',
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}
