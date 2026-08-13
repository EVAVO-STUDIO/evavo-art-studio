#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  bindAvatarFinalPassProviderRuntimeContractFile,
  compileAvatarFinalPassProviderRuntimeDispatchFile,
  compileAvatarFinalPassProviderRuntimeOutcomeFile,
  verifyAvatarFinalPassProviderRuntime,
} from './project-art/avatar-final-pass-provider-runtime.mjs';

function usage() {
  return [
    'Project Art avatar final-pass provider runtime',
    '',
    'Usage:',
    '  node scripts/avatar-final-pass-provider-runtime-cli.mjs verify',
    '  node scripts/avatar-final-pass-provider-runtime-cli.mjs dispatch --batch <provider-batch.json> --job-id <jobId> --output <dispatch.json> [--compiled-at <ISO>]',
    '  node scripts/avatar-final-pass-provider-runtime-cli.mjs bind --dispatch <dispatch.json> --compiled-runtime-contract <contract.json> --output <binding.json>',
    '  node scripts/avatar-final-pass-provider-runtime-cli.mjs outcome --dispatch <dispatch.json> --binding <binding.json> --runtime-outcome <outcome.json> --output <normalized-outcome.json>',
    '',
    'The CLI compiles and validates immutable JSON records only. It does not enqueue a job, execute a provider, materialize an image, approve a candidate or mutate a repository.',
  ].join('\n');
}

function parseOptions(argv, allowed) {
  if (argv.length % 2 !== 0) throw new Error(usage());
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !allowed.includes(name) ||
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

export function runAvatarFinalPassProviderRuntimeCli(
  argv = process.argv.slice(2),
) {
  const command = argv[0] ?? 'verify';
  if (command === 'verify') {
    if (argv.length !== 1) throw new Error(usage());
    return verifyAvatarFinalPassProviderRuntime();
  }
  if (command === 'dispatch') {
    const options = parseOptions(argv.slice(1), [
      '--batch',
      '--job-id',
      '--output',
      '--compiled-at',
    ]);
    const { dispatch, outputPath } =
      compileAvatarFinalPassProviderRuntimeDispatchFile({
        batchPath: required(options, '--batch'),
        jobId: required(options, '--job-id'),
        outputPath: required(options, '--output'),
        ...(options.get('--compiled-at')
          ? { compiledAt: options.get('--compiled-at') }
          : {}),
      });
    return {
      status: 'passed',
      schema: dispatch.schema,
      jobId: dispatch.jobId,
      operation: dispatch.operation,
      runtimeDispatchSha256: dispatch.runtimeDispatchSha256,
      runtimeEnqueue: false,
      providerExecution: false,
      candidateApproval: false,
      outputPath,
    };
  }
  if (command === 'bind') {
    const options = parseOptions(argv.slice(1), [
      '--dispatch',
      '--compiled-runtime-contract',
      '--output',
    ]);
    const { binding, outputPath } =
      bindAvatarFinalPassProviderRuntimeContractFile({
        dispatchPath: required(options, '--dispatch'),
        compiledRuntimeContractPath: required(
          options,
          '--compiled-runtime-contract',
        ),
        outputPath: required(options, '--output'),
      });
    return {
      status: 'passed',
      schema: binding.schema,
      jobId: binding.jobId,
      normalizedProviderRequestId: binding.normalizedProviderRequestId,
      runtimeBindingSha256: binding.runtimeBindingSha256,
      runtimeEnqueue: false,
      providerExecution: false,
      outputPath,
    };
  }
  if (command === 'outcome') {
    const options = parseOptions(argv.slice(1), [
      '--dispatch',
      '--binding',
      '--runtime-outcome',
      '--output',
    ]);
    const { outcome, outputPath } =
      compileAvatarFinalPassProviderRuntimeOutcomeFile({
        dispatchPath: required(options, '--dispatch'),
        bindingPath: required(options, '--binding'),
        runtimeOutcomePath: required(options, '--runtime-outcome'),
        outputPath: required(options, '--output'),
      });
    return {
      status: 'passed',
      schema: outcome.schema,
      jobId: outcome.jobId,
      resultStatus: outcome.result.status,
      runtimeOutcomeSha256: outcome.runtimeOutcomeSha256,
      candidateMaterialization: false,
      candidateApproval: false,
      runtimeActivation: false,
      outputPath,
    };
  }
  throw new Error(`Unknown command ${command}.\n\n${usage()}`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.stdout.write(
      `${JSON.stringify(runAvatarFinalPassProviderRuntimeCli(), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'failed',
        code:
          error?.code ?? 'AVATAR_FINAL_PASS_PROVIDER_RUNTIME_CLI_FAILED',
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}
