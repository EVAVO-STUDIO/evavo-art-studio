#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  lstatSync,
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
  parseProjectArtTopHatPoseSlotCandidateAdmission,
} from './project-art/top-hat-pose-slot-candidate-admission.mjs';
import {
  createTopHatPoseSlotCandidateAdmissionFixture,
} from './project-art/top-hat-pose-slot-candidate-admission-fixture.mjs';
import {
  writeProjectArtTopHatPoseSlotCandidateAdmission,
} from './write-project-art-top-hat-pose-slot-candidate-admission.mjs';

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
}

function prepare(directory, fixture) {
  const paths = {
    adapterPath: path.join(directory, 'adapter.json'),
    dispatchPath: path.join(directory, 'dispatch.json'),
    bindingPath: path.join(directory, 'binding.json'),
    outcomePath: path.join(directory, 'outcome.json'),
    materializationReceiptPath: path.join(directory, 'materialization.json'),
    finisherRequestPath: path.join(directory, 'finisher-request.json'),
    frameFinisherReportPath: path.join(directory, 'finisher-report.json'),
    frameReviewRequestPath: path.join(directory, 'review-request.json'),
    frameReviewDecisionPath: path.join(directory, 'review-decision.json'),
    frameReviewOutcomePath: path.join(directory, 'review-outcome.json'),
    finishedFramePath: path.join(directory, 'finished.png'),
    outputPath: path.join(directory, 'candidate-admission.json'),
  };
  writeJson(paths.adapterPath, fixture.adapter);
  writeJson(paths.dispatchPath, fixture.dispatch);
  writeJson(paths.bindingPath, fixture.binding);
  writeJson(paths.outcomePath, fixture.outcome);
  writeJson(
    paths.materializationReceiptPath,
    fixture.materializationReceipt,
  );
  writeJson(paths.finisherRequestPath, fixture.finisherRequest);
  writeJson(paths.frameFinisherReportPath, fixture.frameFinisherReport);
  writeJson(paths.frameReviewRequestPath, fixture.frameReviewRequest);
  writeJson(paths.frameReviewDecisionPath, fixture.frameReviewDecision);
  writeJson(paths.frameReviewOutcomePath, fixture.frameReviewOutcome);
  writeFileSync(paths.finishedFramePath, fixture.finishedFrameBytes, {
    mode: 0o600,
    flag: 'wx',
  });
  return paths;
}

test('writes and independently verifies one create-only candidate admission', () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'evavo-top-hat-admission-writer-'),
  );
  try {
    const fixture = createTopHatPoseSlotCandidateAdmissionFixture();
    const paths = prepare(directory, fixture);
    const receipt = writeProjectArtTopHatPoseSlotCandidateAdmission({
      slotId: fixture.slotId,
      ...paths,
      admittedAt: fixture.admittedAt,
    });
    const metadata = lstatSync(paths.outputPath);
    const admission = parseProjectArtTopHatPoseSlotCandidateAdmission(
      JSON.parse(readFileSync(paths.outputPath, 'utf8')),
    );
    assert.equal(receipt.slotId, fixture.slotId);
    assert.equal(receipt.status, admission.status);
    assert.equal(
      receipt.candidateAdmissionSha256,
      admission.candidateAdmissionSha256,
    );
    assert.equal(metadata.isFile(), true);
    assert.equal(metadata.isSymbolicLink(), false);
    assert.equal(metadata.nlink, 1);
    assert.equal(metadata.mode & 0o777, 0o600);
    assert.equal(receipt.poseSlotFilled, false);
    assert.equal(receipt.poseBankReleased, false);
    assert.equal(receipt.runtimeActivationPerformed, false);
    assert.equal(receipt.repositoryMutationAuthority, false);
    assert.equal(receipt.publicationAuthority, false);
    assert.equal(receipt.forcePushAuthority, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('refuses overwrite and symbolic input without changing prior output', () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), 'evavo-top-hat-admission-writer-'),
  );
  try {
    const fixture = createTopHatPoseSlotCandidateAdmissionFixture();
    const paths = prepare(directory, fixture);
    writeProjectArtTopHatPoseSlotCandidateAdmission({
      slotId: fixture.slotId,
      ...paths,
      admittedAt: fixture.admittedAt,
    });
    const before = readFileSync(paths.outputPath);
    assert.throws(
      () =>
        writeProjectArtTopHatPoseSlotCandidateAdmission({
          slotId: fixture.slotId,
          ...paths,
          admittedAt: fixture.admittedAt,
        }),
      /TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_OUTPUT_EXISTS/u,
    );
    assert.deepEqual(readFileSync(paths.outputPath), before);

    const link = path.join(directory, 'adapter-link.json');
    symlinkSync(paths.adapterPath, link);
    const symbolicOutput = path.join(directory, 'symbolic-output.json');
    assert.throws(
      () =>
        writeProjectArtTopHatPoseSlotCandidateAdmission({
          slotId: fixture.slotId,
          ...paths,
          adapterPath: link,
          outputPath: symbolicOutput,
          admittedAt: fixture.admittedAt,
        }),
      /TOP_HAT_POSE_CANDIDATE_ADMISSION_WRITER_INPUT_INVALID/u,
    );
    assert.equal(
      (() => {
        try {
          lstatSync(symbolicOutput);
          return true;
        } catch {
          return false;
        }
      })(),
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

console.log('Project Art Top Hat candidate-admission writer regressions passed.');
