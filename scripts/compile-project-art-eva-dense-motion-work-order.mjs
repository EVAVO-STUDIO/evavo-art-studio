#!/usr/bin/env node
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compileEvaDenseMotionWorkOrder,
  createEvaDenseMotionWorkOrderRequest,
  inspectEvaDenseMotionWorkOrder,
} from './project-art/eva-dense-motion-work-order.mjs';

const ALLOWED_ARGUMENTS = new Set([
  '--work-order-id',
  '--actor-id',
  '--created-at',
  '--output-root',
  '--output',
]);

function argumentsFor(argv) {
  if (argv.length % 2 !== 0) {
    throw new Error('Arguments must be supplied as --name value pairs.');
  }
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !ALLOWED_ARGUMENTS.has(name) ||
      typeof value !== 'string' ||
      value.length === 0 ||
      value.startsWith('--') ||
      values.has(name)
    ) {
      throw new Error(`Invalid argument ${name ?? ''}.`);
    }
    values.set(name, value);
  }
  for (const required of [
    '--work-order-id',
    '--actor-id',
    '--created-at',
    '--output',
  ]) {
    if (!values.has(required)) throw new Error(`Missing ${required}.`);
  }
  return values;
}

function writeCreateOnlyJson(outputPath, value) {
  const absolute = path.resolve(outputPath);
  const parent = path.dirname(absolute);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const parentMetadata = lstatSync(parent);
  if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink()) {
    throw new Error('Output parent must be a non-symbolic directory.');
  }
  if (realpathSync(parent) !== parent) {
    throw new Error('Output path cannot traverse symbolic directory components.');
  }

  let descriptor;
  let completed = false;
  try {
    descriptor = openSync(absolute, 'wx', 0o600);
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fsyncSync(descriptor);
    completed = true;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (!completed && descriptor !== undefined) {
      try {
        unlinkSync(absolute);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  }
  return absolute;
}

export function runProjectArtEvaDenseMotionWorkOrderCli(
  argv = process.argv.slice(2),
) {
  const values = argumentsFor(argv);
  const request = createEvaDenseMotionWorkOrderRequest({
    workOrderId: values.get('--work-order-id'),
    actorId: values.get('--actor-id'),
    createdAt: values.get('--created-at'),
    ...(values.has('--output-root')
      ? { outputRoot: values.get('--output-root') }
      : {}),
  });
  const workOrder = compileEvaDenseMotionWorkOrder(request);
  const status = inspectEvaDenseMotionWorkOrder(workOrder);
  const output = writeCreateOnlyJson(values.get('--output'), workOrder);
  return Object.freeze({
    status: 'passed',
    schema: workOrder.schema,
    workOrderFingerprint: workOrder.workOrderFingerprint,
    expectedFrameCount: status.expectedFrameCount,
    activeFrameCount: status.activeFrameCount,
    pendingFrameCount: status.pendingFrameCount,
    pendingOrdinals: status.pendingOrdinals,
    releaseReady: status.releaseReady,
    activationReady: status.activationReady,
    providerExecution: false,
    cloudinaryUpload: false,
    runtimeActivationAllowed: false,
    output,
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.stdout.write(
      `${JSON.stringify(runProjectArtEvaDenseMotionWorkOrderCli())}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: 'failed',
        code:
          error?.code ?? 'PROJECT_ART_EVA_DENSE_MOTION_WORK_ORDER_CLI_FAILED',
        error: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  }
}
