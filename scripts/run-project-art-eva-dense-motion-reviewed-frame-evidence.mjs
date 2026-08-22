#!/usr/bin/env node
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  compileEvaDenseMotionReviewedFrameEvidence,
  persistEvaDenseMotionReviewedFrameEvidence,
} from './project-art/eva-dense-motion-reviewed-frame-evidence.mjs';

const MAXIMUM_JSON_BYTES = 8 * 1024 * 1024;
const REQUIRED = Object.freeze([
  '--program',
  '--mastering-campaign-receipt',
  '--review-intake-plan',
  '--review-intake-receipt',
  '--workspace-root',
  '--output-root',
  '--inspected-at',
]);

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseFlags(argv) {
  if (!Array.isArray(argv) || argv.length !== REQUIRED.length * 2) {
    fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_ARGUMENT_INVALID');
  }
  const allowed = new Set(REQUIRED);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !allowed.has(flag) ||
      values.has(flag) ||
      typeof value !== 'string' ||
      value.length === 0 ||
      value.startsWith('--') ||
      /[\0\r\n]/u.test(value)
    ) {
      fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_ARGUMENT_INVALID');
    }
    values.set(flag, value);
  }
  return values;
}

function realDirectory(raw, label) {
  const lexical = path.resolve(raw);
  const metadata = lstatSync(lexical);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    realpathSync(lexical) !== lexical
  ) {
    fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_ROOT_INVALID', label);
  }
  return lexical;
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
    fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_INPUT_INVALID', label);
  }
  const bytes = readFileSync(lexical);
  const after = lstatSync(lexical);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[field] !== after[field]) {
      fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_INPUT_CHANGED', label);
    }
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_JSON_INVALID', label);
  }
}

function writeReceipt(outputRoot, receipt) {
  const target = path.join(outputRoot, 'reviewed-frame-evidence.receipt.json');
  if (existsSync(target)) {
    fail('EVA_DENSE_REVIEWED_EVIDENCE_CLI_RECEIPT_EXISTS');
  }
  const handle = openSync(target, 'wx', 0o600);
  try {
    writeFileSync(handle, `${JSON.stringify(receipt, null, 2)}\n`);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  return target;
}

export function main(argv = process.argv.slice(2)) {
  try {
    const args = parseFlags(argv);
    const workspaceRoot = realDirectory(
      args.get('--workspace-root'),
      'workspaceRoot',
    );
    const outputRoot = realDirectory(args.get('--output-root'), 'outputRoot');
    const program = stableJson(args.get('--program'), 'ten-master program');
    const compiled = compileEvaDenseMotionReviewedFrameEvidence({
      tenMasterProgram: program,
      masteringCampaignReceipt: stableJson(
        args.get('--mastering-campaign-receipt'),
        'mastering campaign receipt',
      ),
      reviewIntakePlan: stableJson(
        args.get('--review-intake-plan'),
        'review intake plan',
      ),
      reviewIntakeReceipt: stableJson(
        args.get('--review-intake-receipt'),
        'review intake receipt',
      ),
      workspaceRoot,
      inspectedAt: args.get('--inspected-at'),
    });
    const receipt = persistEvaDenseMotionReviewedFrameEvidence({
      tenMasterProgram: program,
      workspaceRoot,
      compiled,
    });
    const receiptPath = writeReceipt(outputRoot, receipt);
    process.stdout.write(
      `${JSON.stringify({
        status: receipt.status,
        familyId: receipt.familyId,
        frameCount: receipt.frames.length,
        receiptSha256: receipt.receiptSha256,
        receiptPath,
        effects: receipt.effects,
        authority: receipt.authority,
      }, null, 2)}\n`,
    );
    return 0;
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'error',
        code: error?.code ?? 'EVA_DENSE_REVIEWED_EVIDENCE_CLI_FAILED',
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
