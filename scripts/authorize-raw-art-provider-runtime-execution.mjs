#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileRawArtProviderRuntimeExecutionAuthorization,
} from './raw-art-provider/execution.mjs';
import {
  readJsonRecord,
  writeCreateOnly,
} from './raw-art-provider/shared.mjs';

const SUPPORTED = new Set([
  '--runtime-batch',
  '--selection',
  '--admission-receipt',
  '--runtime-root',
  '--artifact-root',
  '--authorized-at',
  '--expires-at',
  '--authorized-by',
  '--reason',
  '--allowed-adapters',
  '--output',
]);

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !name?.startsWith('--') ||
      !value ||
      value.startsWith('--') ||
      values.has(name) ||
      !SUPPORTED.has(name)
    ) {
      throw new Error('arguments must be unique supported --name value pairs');
    }
    values.set(name, value);
  }
  return values;
}

function required(values, name) {
  const value = values.get(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function commaList(value) {
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!entries.length) throw new Error('--allowed-adapters must not be empty');
  return entries;
}

export async function runRawArtProviderExecutionAuthorizationCli(
  argv = process.argv.slice(2),
) {
  const values = parseArguments(argv);
  const runtimeBatch = await readJsonRecord(
    required(values, '--runtime-batch'),
    'RAW_ART provider runtime batch',
  );
  const selection = await readJsonRecord(
    required(values, '--selection'),
    'RAW_ART provider runtime admission selection',
  );
  const receipt = await readJsonRecord(
    required(values, '--admission-receipt'),
    'RAW_ART provider runtime admission receipt',
  );
  const authorization =
    await compileRawArtProviderRuntimeExecutionAuthorization(
      runtimeBatch,
      selection,
      receipt,
      {
        runtimeRoot: path.resolve(required(values, '--runtime-root')),
        artifactRoot: path.resolve(required(values, '--artifact-root')),
        authorizedAt: required(values, '--authorized-at'),
        expiresAt: required(values, '--expires-at'),
        authorizedBy: required(values, '--authorized-by'),
        reason: required(values, '--reason'),
        allowedAdapterIds: commaList(required(values, '--allowed-adapters')),
      },
    );
  const output = required(values, '--output');
  await writeCreateOnly(output, authorization);
  return {
    status: authorization.status,
    output: path.resolve(output),
    runId: authorization.runId,
    authorizationSha256: authorization.authorizationSha256,
    counts: authorization.counts,
    expiresAt: authorization.expiresAt,
  };
}

const directlyInvoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (directlyInvoked) {
  runRawArtProviderExecutionAuthorizationCli()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(
        `${JSON.stringify({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        })}\n`,
      );
      process.exitCode = 2;
    });
}
