#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  sha256Document,
} from './project-art/avatar-final-pass-provider-runtime-common.mjs';
import {
  verifyProjectArtTopHatPoseBankReleaseApprovalAdmission,
} from './project-art/top-hat-pose-bank-release-approval.mjs';
import {
  createTopHatPoseBankReleaseApprovalFixture,
} from './project-art/top-hat-pose-bank-release-approval-fixture.mjs';
import {
  writeProjectArtTopHatPoseBankReleaseApproval,
} from './write-project-art-top-hat-pose-bank-release-approval.mjs';

function errorCode(code) {
  return (error) => error?.code === code;
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
}

function prepare(directory, fixture) {
  const paths = {
    releasePlanPath: path.join(directory, 'release-plan.json'),
    decisionPath: path.join(directory, 'release-approval-decision.json'),
    outputPath: path.join(directory, 'release-approval-admission.json'),
  };
  writeJson(paths.releasePlanPath, fixture.releasePlan);
  writeJson(paths.decisionPath, fixture.decision);
  return paths;
}

test('writes and independently verifies one create-only release approval', () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'evavo-top-hat-release-approval-writer-'),
  );
  try {
    const fixture = createTopHatPoseBankReleaseApprovalFixture();
    const paths = prepare(directory, fixture);
    const receipt = writeProjectArtTopHatPoseBankReleaseApproval({
      ...paths,
      admittedAt: fixture.admittedAt,
    });
    const metadata = lstatSync(paths.outputPath);
    const admission = verifyProjectArtTopHatPoseBankReleaseApprovalAdmission(
      JSON.parse(readFileSync(paths.outputPath, 'utf8')),
      { releasePlan: fixture.releasePlan, decision: fixture.decision },
    );
    assert.equal(metadata.isFile(), true);
    assert.equal(metadata.isSymbolicLink(), false);
    assert.equal(metadata.nlink, 1);
    assert.equal(metadata.mode & 0o777, 0o600);
    assert.equal(
      receipt.releaseApprovalAdmissionSha256,
      admission.releaseApprovalAdmissionSha256,
    );
    assert.equal(receipt.releaseApproved, true);
    assert.equal(receipt.runtimePublicationEligible, true);
    assert.equal(receipt.poseSlotFillingPerformed, false);
    assert.equal(receipt.poseBankReleased, false);
    assert.equal(receipt.runtimePublicationPerformed, false);
    assert.equal(receipt.repositoryMutationAuthority, false);
    assert.equal(receipt.publicationAuthority, false);
    assert.equal(receipt.forcePushAuthority, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('refuses overwrite without changing the existing admission', () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'evavo-top-hat-release-approval-writer-'),
  );
  try {
    const fixture = createTopHatPoseBankReleaseApprovalFixture();
    const paths = prepare(directory, fixture);
    writeProjectArtTopHatPoseBankReleaseApproval({
      ...paths,
      admittedAt: fixture.admittedAt,
    });
    const before = readFileSync(paths.outputPath);
    assert.throws(
      () =>
        writeProjectArtTopHatPoseBankReleaseApproval({
          ...paths,
          admittedAt: fixture.admittedAt,
        }),
      errorCode('TOP_HAT_POSE_BANK_RELEASE_APPROVAL_WRITER_OUTPUT_EXISTS'),
    );
    assert.deepEqual(readFileSync(paths.outputPath), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects symbolic and multiply linked inputs before output creation', () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'evavo-top-hat-release-approval-writer-'),
  );
  try {
    const fixture = createTopHatPoseBankReleaseApprovalFixture();
    const paths = prepare(directory, fixture);
    const symbolicPlan = path.join(directory, 'symbolic-plan.json');
    symlinkSync(paths.releasePlanPath, symbolicPlan);
    assert.throws(
      () =>
        writeProjectArtTopHatPoseBankReleaseApproval({
          ...paths,
          releasePlanPath: symbolicPlan,
          admittedAt: fixture.admittedAt,
        }),
      errorCode('TOP_HAT_POSE_BANK_RELEASE_APPROVAL_WRITER_INPUT_INVALID'),
    );
    assert.equal(existsSync(paths.outputPath), false);

    const hardLink = path.join(directory, 'decision-hard-link.json');
    linkSync(paths.decisionPath, hardLink);
    assert.throws(
      () =>
        writeProjectArtTopHatPoseBankReleaseApproval({
          ...paths,
          admittedAt: fixture.admittedAt,
        }),
      errorCode('TOP_HAT_POSE_BANK_RELEASE_APPROVAL_WRITER_INPUT_INVALID'),
    );
    assert.equal(existsSync(paths.outputPath), false);
    unlinkSync(hardLink);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rejects a rehashed substituted decision and leaves no partial output', () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'evavo-top-hat-release-approval-writer-'),
  );
  try {
    const fixture = createTopHatPoseBankReleaseApprovalFixture();
    const paths = prepare(directory, fixture);
    const decision = structuredClone(fixture.decision);
    decision.slots[0].alphaSha256 = 'f'.repeat(64);
    const body = { ...decision };
    delete body.releaseApprovalDecisionSha256;
    decision.releaseApprovalDecisionSha256 = sha256Document(body);
    rmSync(paths.decisionPath);
    writeJson(paths.decisionPath, decision);
    assert.throws(
      () =>
        writeProjectArtTopHatPoseBankReleaseApproval({
          ...paths,
          admittedAt: fixture.admittedAt,
        }),
      errorCode('TOP_HAT_POSE_BANK_RELEASE_APPROVAL_PLAN_BINDING_INVALID'),
    );
    assert.equal(existsSync(paths.outputPath), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

console.log('Project Art Top Hat release-approval writer regressions passed.');
