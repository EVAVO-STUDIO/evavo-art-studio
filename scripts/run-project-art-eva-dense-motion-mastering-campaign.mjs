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
  compileEvaDenseMotionMasteringCampaignPlan,
  runEvaDenseMotionMasteringCampaign,
} from './project-art/eva-dense-motion-mastering-campaign.mjs';
import {
  verifyEvaDenseMotionTenMasterProgram,
} from './project-art/eva-dense-motion-ten-master-program.mjs';

const COMMANDS = new Set(['preflight', 'run']);
const REQUIRED_FLAGS = Object.freeze([
  '--program',
  '--workspace-root',
  '--mastered-at',
  '--finished-at',
]);
const MAXIMUM_PROGRAM_BYTES = 8 * 1024 * 1024;

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function parseEvaDenseMotionMasteringCliArgs(argv) {
  if (!Array.isArray(argv) || argv.length < 1 || !COMMANDS.has(argv[0])) {
    fail('EVA_DENSE_MASTERING_CLI_INVALID', 'Command must be preflight or run.');
  }
  const command = argv[0];
  const rest = argv.slice(1);
  if (rest.length !== REQUIRED_FLAGS.length * 2 || rest.length % 2 !== 0) {
    fail('EVA_DENSE_MASTERING_CLI_INVALID');
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
      fail('EVA_DENSE_MASTERING_CLI_INVALID');
    }
    values.set(flag, value);
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!values.has(flag)) fail('EVA_DENSE_MASTERING_CLI_INVALID', `Missing ${flag}.`);
  }
  for (const flag of ['--mastered-at', '--finished-at']) {
    const value = values.get(flag);
    const milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
      fail('EVA_DENSE_MASTERING_CLI_TIMESTAMP_INVALID', `${flag} must be canonical ISO-8601 UTC.`);
    }
  }
  if (Date.parse(values.get('--finished-at')) < Date.parse(values.get('--mastered-at'))) {
    fail('EVA_DENSE_MASTERING_CLI_TIME_ORDER_INVALID');
  }
  return Object.freeze({
    command,
    programPath: values.get('--program'),
    workspaceRoot: values.get('--workspace-root'),
    masteredAt: values.get('--mastered-at'),
    finishedAt: values.get('--finished-at'),
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
    fail('EVA_DENSE_MASTERING_CLI_PROGRAM_INVALID');
  }
  const real = realpathSync(absolute);
  if (real !== absolute) fail('EVA_DENSE_MASTERING_CLI_PROGRAM_INVALID');
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    if (before[key] !== after[key]) fail('EVA_DENSE_MASTERING_CLI_PROGRAM_CHANGED');
  }
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('EVA_DENSE_MASTERING_CLI_PROGRAM_INVALID');
  }
  return verifyEvaDenseMotionTenMasterProgram(parsed);
}

export async function runEvaDenseMotionMasteringCli(argv) {
  const input = parseEvaDenseMotionMasteringCliArgs(argv);
  const tenMasterProgram = readStableProgram(input.programPath);
  const campaignInput = {
    tenMasterProgram,
    workspaceRoot: input.workspaceRoot,
    masteredAt: input.masteredAt,
    finishedAt: input.finishedAt,
  };
  if (input.command === 'preflight') {
    return compileEvaDenseMotionMasteringCampaignPlan(campaignInput);
  }
  return runEvaDenseMotionMasteringCampaign(campaignInput);
}

async function main() {
  try {
    const result = await runEvaDenseMotionMasteringCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      status: 'error',
      code: error?.code ?? 'EVA_DENSE_MASTERING_CLI_FAILED',
      message: error instanceof Error ? error.message : String(error),
    })}\n`);
    process.exitCode = 1;
  }
}

const invoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invoked) await main();
