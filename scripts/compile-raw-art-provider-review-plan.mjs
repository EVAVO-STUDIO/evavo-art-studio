#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileRawArtProviderCandidateReviewPlan,
} from './raw-art-provider/review.mjs';
import {
  readJsonRecord,
  writeCreateOnly,
} from './raw-art-provider/shared.mjs';

const SUPPORTED = new Set([
  '--authorization',
  '--execution-receipt',
  '--review-decisions',
  '--compiled-at',
  '--output',
]);

function parseArguments(argv) {
  if (argv.length % 2 !== 0) {
    throw new Error('arguments must be unique supported --name value pairs');
  }
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

async function boundSourceRecord(binding, label) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
    throw new Error(`${label} binding is invalid`);
  }
  return readJsonRecord(binding.path, label);
}

export async function compileRawArtProviderReviewPlanCli(
  argv = process.argv.slice(2),
) {
  const values = parseArguments(argv);
  const authorizationRecord = await readJsonRecord(
    required(values, '--authorization'),
    'RAW_ART provider runtime execution authorization',
  );
  const sourceRuntimeBatch = await boundSourceRecord(
    authorizationRecord.value.sourceRuntimeBatch,
    'RAW_ART provider runtime batch',
  );
  const sourceSelection = await boundSourceRecord(
    authorizationRecord.value.sourceSelection,
    'RAW_ART provider runtime admission selection',
  );
  const sourceAdmissionReceipt = await boundSourceRecord(
    authorizationRecord.value.sourceAdmissionReceipt,
    'RAW_ART provider runtime admission receipt',
  );
  const executionReceiptRecord = await readJsonRecord(
    required(values, '--execution-receipt'),
    'RAW_ART provider runtime execution receipt',
  );
  const reviewRecord = await readJsonRecord(
    required(values, '--review-decisions'),
    'RAW_ART provider candidate review decisions',
  );
  const plan = await compileRawArtProviderCandidateReviewPlan(
    sourceRuntimeBatch,
    sourceSelection,
    sourceAdmissionReceipt,
    authorizationRecord,
    executionReceiptRecord,
    reviewRecord,
    {
      ...(values.get('--compiled-at') === undefined
        ? {}
        : { compiledAt: values.get('--compiled-at') }),
    },
  );
  const output = path.resolve(required(values, '--output'));
  await writeCreateOnly(output, plan);
  return Object.freeze({
    status: plan.status,
    output,
    runId: plan.runId,
    reviewPlanSha256: plan.reviewPlanSha256,
    counts: plan.counts,
  });
}

const directlyInvoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (directlyInvoked) {
  compileRawArtProviderReviewPlanCli()
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
