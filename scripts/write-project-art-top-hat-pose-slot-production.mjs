#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  TOP_HAT_POSE_SLOT_PRODUCTION_PLAN_SCHEMA,
  compileProjectArtTopHatPoseSlotProduction,
  createProjectArtTopHatPoseSlotProductionRequest,
} from './project-art/top-hat-pose-slot-production.mjs';

export const TOP_HAT_POSE_SLOT_PRODUCTION_RECEIPT_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-production-receipt.v1';

function fail(code, message = code) {
  const error = new Error(message === code ? code : `${code}: ${message}`);
  error.code = code;
  throw error;
}

function outputTarget(value) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 4096 ||
    value.includes('\0')
  ) {
    fail('PROJECT_ART_TOP_HAT_POSE_SLOT_OUTPUT_PATH_INVALID');
  }
  const absolute = path.resolve(value);
  const parent = realpathSync(path.dirname(absolute));
  const metadata = lstatSync(parent);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    fail('PROJECT_ART_TOP_HAT_POSE_SLOT_OUTPUT_PARENT_INVALID');
  }
  return path.join(parent, path.basename(absolute));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function removePartial(target) {
  try {
    unlinkSync(target);
  } catch {
    // The original write or verification failure remains authoritative.
  }
}

export function writeProjectArtTopHatPoseSlotProductionPlan({ outputPath }) {
  const target = outputTarget(outputPath);
  const plan = compileProjectArtTopHatPoseSlotProduction(
    createProjectArtTopHatPoseSlotProductionRequest(),
  );
  const bytes = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  let descriptor;
  let created = false;
  let writeError = null;
  try {
    descriptor = openSync(target, 'wx', 0o600);
    created = true;
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } catch (error) {
    writeError = error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }

  if (writeError) {
    if (created) removePartial(target);
    if (writeError?.code === 'EEXIST') {
      fail(
        'PROJECT_ART_TOP_HAT_POSE_SLOT_OUTPUT_EXISTS',
        'The production plan output is create-only and already exists.',
      );
    }
    fail(
      'PROJECT_ART_TOP_HAT_POSE_SLOT_OUTPUT_WRITE_FAILED',
      writeError instanceof Error ? writeError.message : String(writeError),
    );
  }

  try {
    const metadata = lstatSync(target);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
      fail('PROJECT_ART_TOP_HAT_POSE_SLOT_OUTPUT_VERIFY_FAILED');
    }
    const written = readFileSync(target);
    if (!written.equals(bytes)) {
      fail('PROJECT_ART_TOP_HAT_POSE_SLOT_OUTPUT_VERIFY_FAILED');
    }
  } catch (error) {
    if (created) removePartial(target);
    if (error?.code?.startsWith?.('PROJECT_ART_')) throw error;
    fail(
      'PROJECT_ART_TOP_HAT_POSE_SLOT_OUTPUT_VERIFY_FAILED',
      error instanceof Error ? error.message : String(error),
    );
  }

  return Object.freeze({
    schema: TOP_HAT_POSE_SLOT_PRODUCTION_RECEIPT_SCHEMA,
    planSchema: TOP_HAT_POSE_SLOT_PRODUCTION_PLAN_SCHEMA,
    outputPath: target,
    outputBytes: bytes.length,
    outputSha256: sha256(bytes),
    planSha256: plan.planSha256,
    characterId: plan.characterId,
    runtimeCommit: plan.runtime.commit,
    artStudioSourceCommit: plan.artStudio.commit,
    requiredPoseSlots: plan.counts.requiredPoseSlots,
    plannedUnfilledPoseSlots: plan.counts.plannedUnfilledPoseSlots,
    activationEligiblePoseSlots: plan.counts.activationEligiblePoseSlots,
    currentRuntimeSafe: plan.currentRuntimeSafe,
    expandedPerformanceReady: plan.expandedPerformanceReady,
    artGenerationRequired: plan.artGenerationRequired,
    candidateApprovalAuthority: false,
    poseSlotFillingAuthority: false,
    runtimeActivationAuthority: false,
    repositoryMutationAuthority: false,
    publicationAuthority: false,
  });
}

function parseCli(argv) {
  if (argv.length !== 2 || argv[0] !== '--output') {
    fail(
      'PROJECT_ART_TOP_HAT_POSE_SLOT_CLI_INVALID',
      'Usage: node scripts/write-project-art-top-hat-pose-slot-production.mjs --output <create-only-plan.json>',
    );
  }
  return Object.freeze({ outputPath: argv[1] });
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  try {
    const receipt = writeProjectArtTopHatPoseSlotProductionPlan(
      parseCli(process.argv.slice(2)),
    );
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
