#!/usr/bin/env node
import { lstatSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileEvaDenseMotionTenMasterProgram,
  createEvaDenseMotionTenMasterRequest,
  inspectEvaDenseMotionTenMasterProgram,
} from './project-art/eva-dense-motion-ten-master-program.mjs';

const FLAGS = Object.freeze([
  '--program-id',
  '--actor-id',
  '--created-at',
  '--output-root',
  '--output',
]);

function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length % 2 !== 0) {
    throw new Error('EVA_DENSE_MOTION_TEN_MASTER_CLI_INVALID');
  }
  const allowed = new Set(FLAGS);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      !allowed.has(flag) ||
      values.has(flag) ||
      typeof value !== 'string' ||
      !value ||
      value.startsWith('--') ||
      /[\0\r\n]/u.test(value)
    ) {
      throw new Error('EVA_DENSE_MOTION_TEN_MASTER_CLI_INVALID');
    }
    values.set(flag, value);
  }
  for (const required of ['--program-id', '--actor-id', '--created-at', '--output']) {
    if (!values.has(required)) {
      throw new Error(`EVA_DENSE_MOTION_TEN_MASTER_CLI_MISSING_${required.slice(2).toUpperCase().replaceAll('-', '_')}`);
    }
  }
  return values;
}

function createOnlyOutput(value) {
  const absolute = path.resolve(value);
  const parent = path.dirname(absolute);
  const parentState = lstatSync(parent);
  if (
    !parentState.isDirectory() ||
    parentState.isSymbolicLink() ||
    realpathSync(parent) !== parent
  ) {
    throw new Error('EVA_DENSE_MOTION_TEN_MASTER_OUTPUT_PARENT_INVALID');
  }
  try {
    lstatSync(absolute);
    throw new Error('EVA_DENSE_MOTION_TEN_MASTER_OUTPUT_EXISTS');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return absolute;
}

export function runEvaDenseMotionTenMasterCompiler(argv = process.argv.slice(2)) {
  const values = parseArgs(argv);
  const request = createEvaDenseMotionTenMasterRequest({
    programId: values.get('--program-id'),
    actorId: values.get('--actor-id'),
    createdAt: values.get('--created-at'),
    ...(values.has('--output-root')
      ? { outputRoot: values.get('--output-root') }
      : {}),
  });
  const program = compileEvaDenseMotionTenMasterProgram(request);
  const status = inspectEvaDenseMotionTenMasterProgram(program);
  const output = createOnlyOutput(values.get('--output'));
  writeFileSync(output, `${JSON.stringify(program, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  return Object.freeze({
    status: 'passed',
    output,
    programSha256: program.programSha256,
    requiredNewMasterCount: status.requiredNewMasterCount,
    fallbackRemasterCount: status.fallbackRemasterCount,
    releaseReady: false,
    runtimeActivationReady: false,
  });
}

const invoked = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (invoked) {
  try {
    process.stdout.write(
      `${JSON.stringify(runEvaDenseMotionTenMasterCompiler(), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error?.code ?? 'EVA_DENSE_MOTION_TEN_MASTER_CLI_FAILED'}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
