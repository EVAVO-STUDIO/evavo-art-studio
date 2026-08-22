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
  compileEvaDenseMotionCloudinaryAdmission,
  compileEvaDenseMotionCloudinaryUploadPlan,
  persistEvaDenseMotionCloudinaryAdmission,
} from './project-art/eva-dense-motion-cloudinary-admission.mjs';

const MAXIMUM_JSON_BYTES = 8 * 1024 * 1024;

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function realDirectory(raw, label) {
  const lexical = path.resolve(raw);
  const metadata = lstatSync(lexical);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    realpathSync(lexical) !== lexical
  ) {
    fail('EVA_DENSE_CLOUDINARY_CLI_ROOT_INVALID', label);
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
    fail('EVA_DENSE_CLOUDINARY_CLI_INPUT_INVALID', label);
  }
  const bytes = readFileSync(lexical);
  const after = lstatSync(lexical);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[field] !== after[field]) {
      fail('EVA_DENSE_CLOUDINARY_CLI_INPUT_CHANGED', label);
    }
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('EVA_DENSE_CLOUDINARY_CLI_JSON_INVALID', label);
  }
}

function parseFlags(argv, required) {
  if (!Array.isArray(argv) || argv.length !== required.length * 2) {
    fail('EVA_DENSE_CLOUDINARY_CLI_ARGUMENT_INVALID');
  }
  const allowed = new Set(required);
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
      fail('EVA_DENSE_CLOUDINARY_CLI_ARGUMENT_INVALID');
    }
    values.set(flag, value);
  }
  return values;
}

function writeCreateOnly(outputRoot, filename, value) {
  const target = path.join(outputRoot, filename);
  if (existsSync(target)) fail('EVA_DENSE_CLOUDINARY_CLI_OUTPUT_EXISTS', target);
  const handle = openSync(target, 'wx', 0o600);
  try {
    writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  return target;
}

function runPlan(argv) {
  const args = parseFlags(argv, [
    '--program',
    '--workspace-root',
    '--output-root',
    '--prepared-at',
  ]);
  const workspaceRoot = realDirectory(args.get('--workspace-root'), 'workspaceRoot');
  const outputRoot = realDirectory(args.get('--output-root'), 'outputRoot');
  const plan = compileEvaDenseMotionCloudinaryUploadPlan({
    tenMasterProgram: stableJson(args.get('--program'), 'ten-master program'),
    workspaceRoot,
    preparedAt: args.get('--prepared-at'),
  });
  const planPath = writeCreateOnly(outputRoot, 'cloudinary-upload-plan.json', plan);
  return {
    command: 'plan',
    status: plan.status,
    frameCount: plan.frameCount,
    uploadPlanSha256: plan.uploadPlanSha256,
    planPath,
    networkUsed: false,
    providerExecutionPerformed: false,
    uploadPerformed: false,
    authority: plan.authority,
  };
}

function runAdmit(argv) {
  const args = parseFlags(argv, [
    '--program',
    '--workspace-root',
    '--output-root',
    '--upload-plan',
    '--provider-manifest',
    '--admitted-at',
  ]);
  const workspaceRoot = realDirectory(args.get('--workspace-root'), 'workspaceRoot');
  const outputRoot = realDirectory(args.get('--output-root'), 'outputRoot');
  const program = stableJson(args.get('--program'), 'ten-master program');
  const admission = compileEvaDenseMotionCloudinaryAdmission({
    uploadPlan: stableJson(args.get('--upload-plan'), 'Cloudinary upload plan'),
    providerManifest: stableJson(
      args.get('--provider-manifest'),
      'Cloudinary provider manifest',
    ),
    admittedAt: args.get('--admitted-at'),
  });
  persistEvaDenseMotionCloudinaryAdmission({
    tenMasterProgram: program,
    workspaceRoot,
    admission,
  });
  const receiptPath = writeCreateOnly(
    outputRoot,
    'cloudinary-admission-receipt.json',
    admission,
  );
  return {
    command: 'admit',
    status: admission.status,
    frameCount: admission.frames.length,
    receiptSha256: admission.receiptSha256,
    receiptPath,
    networkUsed: false,
    providerExecutionPerformed: false,
    uploadsPerformedByThisCommand: 0,
    authority: admission.authority,
  };
}

export function main(argv = process.argv.slice(2)) {
  try {
    const [command, ...rest] = argv;
    let result;
    if (command === 'plan') result = runPlan(rest);
    else if (command === 'admit') result = runAdmit(rest);
    else fail('EVA_DENSE_CLOUDINARY_CLI_COMMAND_INVALID');
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'error',
        code: error?.code ?? 'EVA_DENSE_CLOUDINARY_CLI_FAILED',
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    return 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) process.exitCode = main();
