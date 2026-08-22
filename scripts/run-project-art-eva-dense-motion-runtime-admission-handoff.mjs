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
  compileEvaDenseMotionRuntimeAdmissionHandoff,
} from './project-art/eva-dense-motion-runtime-admission-handoff.mjs';

const MAXIMUM_JSON_BYTES = 32 * 1024 * 1024;
const REQUIRED = Object.freeze([
  '--program',
  '--release-evidence',
  '--workspace-root',
  '--continuity-root',
  '--output',
]);

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseFlags(argv) {
  if (!Array.isArray(argv) || argv.length !== REQUIRED.length * 2) {
    fail('EVA_DENSE_RUNTIME_HANDOFF_CLI_ARGUMENT_INVALID');
  }
  const allowed = new Set(REQUIRED);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !allowed.has(flag) || values.has(flag) || typeof value !== 'string' ||
      value.length === 0 || value.startsWith('--') || /[\0\r\n]/u.test(value)
    ) fail('EVA_DENSE_RUNTIME_HANDOFF_CLI_ARGUMENT_INVALID', flag ?? 'argument');
    values.set(flag, value);
  }
  return values;
}

function realDirectory(raw, label) {
  const absolute = path.resolve(raw);
  const metadata = lstatSync(absolute);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || realpathSync(absolute) !== absolute) {
    fail('EVA_DENSE_RUNTIME_HANDOFF_CLI_ROOT_INVALID', label);
  }
  return absolute;
}

function stableJson(raw, label) {
  const absolute = path.resolve(raw);
  const before = lstatSync(absolute);
  if (
    !before.isFile() || before.isSymbolicLink() || before.nlink !== 1 ||
    before.size < 2 || before.size > MAXIMUM_JSON_BYTES || realpathSync(absolute) !== absolute
  ) fail('EVA_DENSE_RUNTIME_HANDOFF_CLI_INPUT_INVALID', label);
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[field] !== after[field]) fail('EVA_DENSE_RUNTIME_HANDOFF_CLI_INPUT_CHANGED', label);
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('EVA_DENSE_RUNTIME_HANDOFF_CLI_JSON_INVALID', label);
  }
}

function writeOutput(raw, value) {
  const target = path.resolve(raw);
  if (existsSync(target)) fail('EVA_DENSE_RUNTIME_HANDOFF_CLI_OUTPUT_EXISTS');
  const parent = path.dirname(target);
  const metadata = lstatSync(parent);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || realpathSync(parent) !== parent) {
    fail('EVA_DENSE_RUNTIME_HANDOFF_CLI_OUTPUT_PARENT_INVALID');
  }
  const handle = openSync(target, 'wx', 0o600);
  try {
    writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
  return target;
}

export function main(argv = process.argv.slice(2)) {
  try {
    const args = parseFlags(argv);
    const result = compileEvaDenseMotionRuntimeAdmissionHandoff({
      tenMasterProgram: stableJson(args.get('--program'), 'ten-master program'),
      releaseEvidence: stableJson(args.get('--release-evidence'), 'release evidence'),
      workspaceRoot: realDirectory(args.get('--workspace-root'), 'workspaceRoot'),
      continuityRoot: realDirectory(args.get('--continuity-root'), 'continuityRoot'),
    });
    const outputPath = writeOutput(args.get('--output'), result);
    process.stdout.write(`${JSON.stringify({
      status: result.status,
      handoffSha256: result.handoffSha256,
      releaseEvidenceSha256: result.releaseEvidenceSha256,
      runtimeAdmissionApprovalRequired: result.runtimeAdmissionApprovalRequired,
      activationAuthorityGranted: result.activationAuthorityGranted,
      outputPath,
      authority: result.authority,
    }, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      status: 'error',
      code: error?.code ?? 'EVA_DENSE_RUNTIME_HANDOFF_CLI_FAILED',
      message: error instanceof Error ? error.message : String(error),
    })}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) process.exitCode = main();
