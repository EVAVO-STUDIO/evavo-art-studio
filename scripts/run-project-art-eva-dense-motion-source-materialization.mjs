#!/usr/bin/env node
import {
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileEvaDenseMotionSourceMaterializationPlan,
  runEvaDenseMotionSourceMaterializationCampaign,
} from './project-art/eva-dense-motion-source-materialization.mjs';
import {
  verifyEvaDenseMotionTenMasterProgram,
} from './project-art/eva-dense-motion-ten-master-program.mjs';

const COMMANDS = new Set(['preflight', 'run']);
const REQUIRED_FLAGS = Object.freeze([
  '--program',
  '--runtime-root',
  '--workspace-root',
  '--materialized-at',
]);
const MAXIMUM_PROGRAM_BYTES = 8 * 1024 * 1024;

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function parseEvaDenseMotionSourceMaterializationCliArgs(argv) {
  if (!Array.isArray(argv) || argv.length < 1 || !COMMANDS.has(argv[0])) {
    fail(
      'EVA_DENSE_SOURCE_MATERIALIZATION_CLI_INVALID',
      'Command must be preflight or run.',
    );
  }
  const command = argv[0];
  const rest = argv.slice(1);
  if (rest.length !== REQUIRED_FLAGS.length * 2 || rest.length % 2 !== 0) {
    fail('EVA_DENSE_SOURCE_MATERIALIZATION_CLI_INVALID');
  }
  const allowed = new Set(REQUIRED_FLAGS);
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (
      !allowed.has(flag) ||
      values.has(flag) ||
      typeof value !== 'string' ||
      !value ||
      value.startsWith('--') ||
      /[\0\r\n]/u.test(value)
    ) {
      fail('EVA_DENSE_SOURCE_MATERIALIZATION_CLI_INVALID');
    }
    values.set(flag, value);
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!values.has(flag)) {
      fail(
        'EVA_DENSE_SOURCE_MATERIALIZATION_CLI_INVALID',
        `Missing ${flag}.`,
      );
    }
  }
  const materializedAt = values.get('--materialized-at');
  const milliseconds = Date.parse(materializedAt);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== materializedAt
  ) {
    fail(
      'EVA_DENSE_SOURCE_MATERIALIZATION_CLI_TIMESTAMP_INVALID',
      '--materialized-at must be canonical ISO-8601 UTC.',
    );
  }
  return Object.freeze({
    command,
    programPath: values.get('--program'),
    runtimeRoot: values.get('--runtime-root'),
    workspaceRoot: values.get('--workspace-root'),
    materializedAt,
  });
}

function readStableProgram(file) {
  const absolute = path.resolve(file);
  const before = lstatSync(absolute);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size < 2 ||
    before.size > MAXIMUM_PROGRAM_BYTES
  ) {
    fail('EVA_DENSE_SOURCE_MATERIALIZATION_CLI_PROGRAM_INVALID');
  }
  const real = realpathSync(absolute);
  if (real !== absolute) {
    fail('EVA_DENSE_SOURCE_MATERIALIZATION_CLI_PROGRAM_INVALID');
  }
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[key] !== after[key]) {
      fail('EVA_DENSE_SOURCE_MATERIALIZATION_CLI_PROGRAM_CHANGED');
    }
  }
  let parsed;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.charCodeAt(0) === 0xfeff) throw new Error('BOM forbidden');
    parsed = JSON.parse(text);
  } catch {
    fail('EVA_DENSE_SOURCE_MATERIALIZATION_CLI_PROGRAM_INVALID');
  }
  return verifyEvaDenseMotionTenMasterProgram(parsed);
}

export async function runEvaDenseMotionSourceMaterializationCli(argv) {
  const input = parseEvaDenseMotionSourceMaterializationCliArgs(argv);
  const tenMasterProgram = readStableProgram(input.programPath);
  const campaignInput = {
    tenMasterProgram,
    runtimeRoot: input.runtimeRoot,
    workspaceRoot: input.workspaceRoot,
    materializedAt: input.materializedAt,
  };
  if (input.command === 'preflight') {
    return compileEvaDenseMotionSourceMaterializationPlan(campaignInput);
  }
  return runEvaDenseMotionSourceMaterializationCampaign(campaignInput);
}

async function main() {
  try {
    const result = await runEvaDenseMotionSourceMaterializationCli(
      process.argv.slice(2),
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'error',
        code:
          error?.code ?? 'EVA_DENSE_SOURCE_MATERIALIZATION_CLI_FAILED',
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}

const invoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invoked) await main();
