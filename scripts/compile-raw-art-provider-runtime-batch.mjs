#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileRawArtProviderRuntimeBatch,
  validateRawArtProviderRequestBatch,
} from './raw-art-provider/runtime.mjs';
import {
  readJsonRecord,
  writeCreateOnly,
} from './raw-art-provider/shared.mjs';

function parseArguments(argv) {
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
      throw new Error('arguments must be unique --name value pairs');
    }
    values.set(name, value);
  }
  for (const name of values.keys()) {
    if (!['--provider-batch', '--output'].includes(name)) {
      throw new Error(`unsupported argument ${name}`);
    }
  }
  return values;
}

function required(values, name) {
  const value = values.get(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

export async function runRawArtProviderRuntimeBatchCli(
  argv = process.argv.slice(2),
) {
  const values = parseArguments(argv);
  const input = await readJsonRecord(
    required(values, '--provider-batch'),
    'RAW_ART provider request batch',
  );
  const batch = compileRawArtProviderRuntimeBatch(input);
  const output = required(values, '--output');
  await writeCreateOnly(output, batch);
  return {
    status: batch.status,
    output: path.resolve(output),
    runId: batch.runId,
    runtimeBatchSha256: batch.runtimeBatchSha256,
    providerProtocolVersion: batch.providerProtocolVersion,
    counts: batch.counts,
  };
}

const directlyInvoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (directlyInvoked) {
  runRawArtProviderRuntimeBatchCli()
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

export {
  compileRawArtProviderRuntimeBatch,
  validateRawArtProviderRequestBatch,
};
