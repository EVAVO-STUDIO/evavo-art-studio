#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  admitRawArtProviderRuntimeSelection,
  validateRawArtProviderRuntimeAdmissionSelection,
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
        '--selection',
        '--runtime-root',
        '--actor',
        '--admitted-at',
        '--receipt',
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

export async function runRawArtProviderRuntimeAdmissionCli(
  argv = process.argv.slice(2),
) {
  const values = parseArguments(argv);
  const runtimeBatchRecord = await readJsonRecord(
    required(values, '--runtime-batch'),
    'RAW_ART provider runtime batch',
  );
  const selectionRecord = await readJsonRecord(
    required(values, '--selection'),
    'RAW_ART provider runtime admission selection',
  );
  const receipt = await admitRawArtProviderRuntimeSelection(
    runtimeBatchRecord,
    selectionRecord,
    {
      runtimeRoot: required(values, '--runtime-root'),
      actor: required(values, '--actor'),
      admittedAt: required(values, '--admitted-at'),
    },
  );
  const output = required(values, '--receipt');
  await writeCreateOnly(output, receipt);
  return {
    status: receipt.status,
    output: path.resolve(output),
    runId: receipt.runId,
    admissionSha256: receipt.admissionSha256,
    runtimeProtocolVersion: receipt.runtimeProtocolVersion,
    counts: receipt.counts,
  };
}

const directlyInvoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (directlyInvoked) {
  runRawArtProviderRuntimeAdmissionCli()
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
  admitRawArtProviderRuntimeSelection,
  validateRawArtProviderRuntimeAdmissionSelection,
  validateRawArtProviderRuntimeBatch,
};
