#!/usr/bin/env node
import {
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  persistEvaDenseMotionFrameReviewIntakeEvidence,
  runEvaDenseMotionFrameReviewIntake,
} from './project-art/eva-dense-motion-frame-review-intake.mjs';

const MAXIMUM_JSON_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set([
  '--program',
  '--mastering-campaign-receipt',
  '--workspace-root',
  '--output-root',
  '--reviewed-at',
]);

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function argumentsFor(argv) {
  if (argv.length % 2 !== 0) fail('EVA_DENSE_FRAME_REVIEW_CLI_ARGUMENT_INVALID');
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !ALLOWED.has(name) ||
      typeof value !== 'string' ||
      value.length === 0 ||
      value.startsWith('--') ||
      /[\0\r\n]/u.test(value) ||
      values.has(name)
    ) {
      fail('EVA_DENSE_FRAME_REVIEW_CLI_ARGUMENT_INVALID', name ?? 'argument');
    }
    values.set(name, value);
  }
  for (const name of ALLOWED) {
    if (!values.has(name)) fail('EVA_DENSE_FRAME_REVIEW_CLI_ARGUMENT_MISSING', name);
  }
  return values;
}

function stableJson(raw, label) {
  const lexical = path.resolve(raw);
  const before = lstatSync(lexical);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size < 2 ||
    before.size > MAXIMUM_JSON_BYTES ||
    realpathSync(lexical) !== lexical
  ) {
    fail('EVA_DENSE_FRAME_REVIEW_CLI_INPUT_INVALID', label);
  }
  const bytes = readFileSync(lexical);
  const after = lstatSync(lexical);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[field] !== after[field]) {
      fail('EVA_DENSE_FRAME_REVIEW_CLI_INPUT_CHANGED', label);
    }
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('EVA_DENSE_FRAME_REVIEW_CLI_JSON_INVALID', label);
  }
}

export function main(argv = process.argv.slice(2)) {
  try {
    const args = argumentsFor(argv);
    const result = runEvaDenseMotionFrameReviewIntake({
      tenMasterProgram: stableJson(args.get('--program'), 'ten-master program'),
      masteringCampaignReceipt: stableJson(
        args.get('--mastering-campaign-receipt'),
        'mastering campaign receipt',
      ),
      workspaceRoot: path.resolve(args.get('--workspace-root')),
      reviewedAt: args.get('--reviewed-at'),
    });
    const evidence = persistEvaDenseMotionFrameReviewIntakeEvidence({
      outputRoot: path.resolve(args.get('--output-root')),
      plan: result.plan,
      receipt: result.receipt,
    });
    process.stdout.write(
      `${JSON.stringify({
        status: result.receipt.status,
        planSha256: result.plan.planSha256,
        receiptSha256: result.receipt.receiptSha256,
        counts: result.receipt.counts,
        nextStage: result.receipt.nextStage,
        evidence,
        authority: result.receipt.authority,
      }, null, 2)}\n`,
    );
    return 0;
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'error',
        code: error?.code ?? 'EVA_DENSE_FRAME_REVIEW_CLI_FAILED',
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    return 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  process.exitCode = main();
}
