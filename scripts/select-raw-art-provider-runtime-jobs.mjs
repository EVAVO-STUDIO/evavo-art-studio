#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileRawArtProviderRuntimeAdmissionSelection,
  validateRawArtProviderRuntimeBatch,
} from './raw-art-provider/admission.mjs';
import { readJsonRecord, writeCreateOnly } from './raw-art-provider/shared.mjs';

function parseArguments(argv) {
  if (argv.length % 2 !== 0) {
    throw new Error('arguments must be unique --name value pairs');
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
      throw new Error('arguments must be unique --name value pairs');
    }
    values.set(name, value);
  }
  for (const name of values.keys()) {
    if (
      ![
        '--runtime-batch',
        '--work-orders',
        '--selected-at',
        '--selected-by',
        '--reason',
        '--output',
      ].includes(name)
    ) {
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

function workOrderIds(value) {
  const ids = value.split(',');
  if (ids.length === 0 || ids.some((entry) => !entry || entry.trim() !== entry)) {
    throw new Error('--work-orders must be a comma-separated list without empty or padded entries');
  }
  return ids;
}

export async function runRawArtProviderRuntimeSelectionCli(
  argv = process.argv.slice(2),
) {
  const values = parseArguments(argv);
  const runtimeBatchRecord = await readJsonRecord(
    required(values, '--runtime-batch'),
    'RAW_ART provider runtime batch',
  );
  const selection = compileRawArtProviderRuntimeAdmissionSelection(
    runtimeBatchRecord,
    {
      workOrderIds: workOrderIds(required(values, '--work-orders')),
      selectedAt: required(values, '--selected-at'),
      selectedBy: required(values, '--selected-by'),
      reason: required(values, '--reason'),
    },
  );
  const output = required(values, '--output');
  await writeCreateOnly(output, selection);
  return {
    status: selection.status,
    output: path.resolve(output),
    runId: selection.runId,
    selectionSha256: selection.selectionSha256,
    runtimeBatchSha256: selection.runtimeBatchSha256,
    counts: selection.counts,
  };
}

const directlyInvoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (directlyInvoked) {
  runRawArtProviderRuntimeSelectionCli()
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
  compileRawArtProviderRuntimeAdmissionSelection,
  validateRawArtProviderRuntimeBatch,
};
