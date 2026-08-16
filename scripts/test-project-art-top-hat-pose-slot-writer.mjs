#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  TOP_HAT_POSE_SLOT_PRODUCTION_RECEIPT_SCHEMA,
  writeProjectArtTopHatPoseSlotProductionPlan,
} from './write-project-art-top-hat-pose-slot-production.mjs';

function temporaryDirectory() {
  return mkdtempSync(path.join(os.tmpdir(), 'evavo-top-hat-pose-slots-'));
}

test('writes and verifies one create-only Runtime 0.34 pose-slot plan', () => {
  const directory = temporaryDirectory();
  try {
    const outputPath = path.join(directory, 'top-hat-pose-slots.json');
    const receipt = writeProjectArtTopHatPoseSlotProductionPlan({ outputPath });
    const bytes = readFileSync(outputPath);
    const plan = JSON.parse(bytes.toString('utf8'));

    assert.equal(
      receipt.schema,
      TOP_HAT_POSE_SLOT_PRODUCTION_RECEIPT_SCHEMA,
    );
    assert.equal(
      plan.schema,
      'evavo.project-art-top-hat-pose-slot-production-plan.v1',
    );
    assert.equal(receipt.outputPath, outputPath);
    assert.equal(receipt.outputBytes, bytes.length);
    assert.equal(
      receipt.outputSha256,
      createHash('sha256').update(bytes).digest('hex'),
    );
    assert.equal(receipt.planSha256, plan.planSha256);
    assert.equal(receipt.runtimeCommit, plan.runtime.commit);
    assert.equal(receipt.artStudioSourceCommit, plan.artStudio.commit);
    assert.equal(receipt.requiredPoseSlots, 6);
    assert.equal(receipt.plannedUnfilledPoseSlots, 6);
    assert.equal(receipt.activationEligiblePoseSlots, 0);
    assert.equal(receipt.currentRuntimeSafe, true);
    assert.equal(receipt.expandedPerformanceReady, false);
    assert.equal(receipt.artGenerationRequired, true);
    assert.equal(receipt.candidateApprovalAuthority, false);
    assert.equal(receipt.poseSlotFillingAuthority, false);
    assert.equal(receipt.runtimeActivationAuthority, false);
    assert.equal(receipt.repositoryMutationAuthority, false);
    assert.equal(receipt.publicationAuthority, false);
    assert.equal(lstatSync(outputPath).isFile(), true);
    assert.equal(lstatSync(outputPath).isSymbolicLink(), false);
    assert.equal(lstatSync(outputPath).nlink, 1);
    assert.equal(lstatSync(outputPath).mode & 0o777, 0o600);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('refuses to overwrite an existing plan', () => {
  const directory = temporaryDirectory();
  try {
    const outputPath = path.join(directory, 'top-hat-pose-slots.json');
    const first = writeProjectArtTopHatPoseSlotProductionPlan({ outputPath });
    const before = readFileSync(outputPath);
    assert.throws(
      () => writeProjectArtTopHatPoseSlotProductionPlan({ outputPath }),
      /PROJECT_ART_TOP_HAT_POSE_SLOT_OUTPUT_EXISTS/u,
    );
    assert.deepEqual(readFileSync(outputPath), before);
    assert.match(first.planSha256, /^[a-f0-9]{64}$/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects invalid output paths before creating anything', () => {
  for (const outputPath of ['', '\0bad', null, 42]) {
    assert.throws(
      () => writeProjectArtTopHatPoseSlotProductionPlan({ outputPath }),
      /PROJECT_ART_TOP_HAT_POSE_SLOT_OUTPUT_PATH_INVALID/u,
    );
  }
});
