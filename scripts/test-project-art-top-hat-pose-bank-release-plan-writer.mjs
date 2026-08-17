#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  sha256Document,
} from './project-art/avatar-final-pass-provider-runtime-common.mjs';
import {
  TOP_HAT_POSE_SLOT_IDS,
} from './project-art/top-hat-pose-slot-candidate-admission.mjs';
import {
  parseProjectArtTopHatPoseBankReleasePlan,
} from './project-art/top-hat-pose-bank-release-plan.mjs';
import {
  createTopHatPoseBankReleasePlanFixture,
} from './project-art/top-hat-pose-bank-release-plan-fixture.mjs';
import {
  writeProjectArtTopHatPoseBankReleasePlan,
} from './write-project-art-top-hat-pose-bank-release-plan.mjs';

const fixture = createTopHatPoseBankReleasePlanFixture();

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
}

function exists(filePath) {
  try {
    lstatSync(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function prepare(directory, admissions = fixture.admissions) {
  const admissionPaths = {};
  for (const [index, slotId] of TOP_HAT_POSE_SLOT_IDS.entries()) {
    const filePath = path.join(directory, `${slotId}.admission.json`);
    writeJson(filePath, admissions[index]);
    admissionPaths[slotId] = filePath;
  }
  return Object.freeze({
    admissionPaths: Object.freeze(admissionPaths),
    outputPath: path.join(directory, 'top-hat-pose-bank-release-plan.json'),
  });
}

function errorCode(code) {
  return (error) => error?.code === code;
}

function rehashCandidate(value) {
  const body = { ...value };
  delete body.candidateAdmissionSha256;
  value.candidateAdmissionSha256 = sha256Document(body);
  return value;
}

test('writes and independently verifies one create-only six-slot release plan', () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'evavo-top-hat-release-plan-writer-'),
  );
  try {
    const paths = prepare(directory);
    const receipt = writeProjectArtTopHatPoseBankReleasePlan({
      ...paths,
      compiledAt: fixture.compiledAt,
    });
    const metadata = lstatSync(paths.outputPath);
    const plan = parseProjectArtTopHatPoseBankReleasePlan(
      JSON.parse(readFileSync(paths.outputPath, 'utf8')),
    );

    assert.equal(metadata.isFile(), true);
    assert.equal(metadata.isSymbolicLink(), false);
    assert.equal(metadata.nlink, 1);
    assert.equal(metadata.mode & 0o777, 0o600);
    assert.equal(receipt.slotCount, 6);
    assert.equal(receipt.status, plan.status);
    assert.equal(
      receipt.poseBankReleasePlanSha256,
      plan.poseBankReleasePlanSha256,
    );
    assert.deepEqual(
      plan.slots.map((slot) => slot.slotId),
      TOP_HAT_POSE_SLOT_IDS,
    );
    assert.equal(receipt.releaseApproved, false);
    assert.equal(receipt.poseSlotFillingPerformed, false);
    assert.equal(receipt.poseBankReleased, false);
    assert.equal(receipt.sequenceReleased, false);
    assert.equal(receipt.runtimeActivationPerformed, false);
    assert.equal(receipt.websiteInstallationPerformed, false);
    assert.equal(receipt.repositoryMutationAuthority, false);
    assert.equal(receipt.publicationAuthority, false);
    assert.equal(receipt.forcePushAuthority, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('refuses overwrite and preserves the first complete plan', () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'evavo-top-hat-release-plan-writer-'),
  );
  try {
    const paths = prepare(directory);
    writeProjectArtTopHatPoseBankReleasePlan({
      ...paths,
      compiledAt: fixture.compiledAt,
    });
    const before = readFileSync(paths.outputPath);
    assert.throws(
      () =>
        writeProjectArtTopHatPoseBankReleasePlan({
          ...paths,
          compiledAt: fixture.compiledAt,
        }),
      errorCode('TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_OUTPUT_EXISTS'),
    );
    assert.deepEqual(readFileSync(paths.outputPath), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects symbolic and multiply linked admission inputs', () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'evavo-top-hat-release-plan-writer-'),
  );
  try {
    const paths = prepare(directory);
    const firstSlot = TOP_HAT_POSE_SLOT_IDS[0];

    const symbolicPath = path.join(directory, 'symbolic-admission.json');
    symlinkSync(paths.admissionPaths[firstSlot], symbolicPath);
    const symbolicOutput = path.join(directory, 'symbolic-output.json');
    assert.throws(
      () =>
        writeProjectArtTopHatPoseBankReleasePlan({
          admissionPaths: {
            ...paths.admissionPaths,
            [firstSlot]: symbolicPath,
          },
          outputPath: symbolicOutput,
          compiledAt: fixture.compiledAt,
        }),
      errorCode('TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_INPUT_INVALID'),
    );
    assert.equal(exists(symbolicOutput), false);

    const hardPath = path.join(directory, 'hard-admission.json');
    linkSync(paths.admissionPaths[firstSlot], hardPath);
    const hardOutput = path.join(directory, 'hard-output.json');
    assert.throws(
      () =>
        writeProjectArtTopHatPoseBankReleasePlan({
          admissionPaths: paths.admissionPaths,
          outputPath: hardOutput,
          compiledAt: fixture.compiledAt,
        }),
      errorCode('TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_INPUT_INVALID'),
    );
    assert.equal(exists(hardOutput), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects relative paths and invalid evidence without partial output', () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'evavo-top-hat-release-plan-writer-'),
  );
  try {
    const paths = prepare(directory);
    const firstSlot = TOP_HAT_POSE_SLOT_IDS[0];
    assert.throws(
      () =>
        writeProjectArtTopHatPoseBankReleasePlan({
          admissionPaths: {
            ...paths.admissionPaths,
            [firstSlot]: 'relative-admission.json',
          },
          outputPath: path.join(directory, 'relative-output.json'),
          compiledAt: fixture.compiledAt,
        }),
      errorCode('TOP_HAT_POSE_BANK_RELEASE_PLAN_WRITER_PATH_INVALID'),
    );

    const invalidDirectory = path.join(directory, 'invalid');
    mkdirSync(invalidDirectory);
    const invalidAdmissions = structuredClone(fixture.admissions);
    invalidAdmissions[0].finalFrame.path =
      invalidAdmissions[1].finalFrame.path;
    rehashCandidate(invalidAdmissions[0]);
    const invalidPaths = prepare(invalidDirectory, invalidAdmissions);
    assert.throws(
      () =>
        writeProjectArtTopHatPoseBankReleasePlan({
          ...invalidPaths,
          compiledAt: fixture.compiledAt,
        }),
      errorCode('TOP_HAT_POSE_BANK_RELEASE_PLAN_FINAL_FRAME_INVALID'),
    );
    assert.equal(exists(invalidPaths.outputPath), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

console.log('Project Art Top Hat pose-bank release-plan writer regressions passed.');
