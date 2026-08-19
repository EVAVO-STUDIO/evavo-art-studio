#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  encodeAvatarProviderFramePng,
  finishAvatarFinalPassProviderFrameFiles,
  sha256FrameFinisherBytes,
  sha256FrameFinisherDocument,
} from './project-art/avatar-final-pass-provider-frame-finisher.mjs';
import {
  preflightAvatarFinalPassProviderFrameFiles,
} from './project-art/avatar-final-pass-provider-frame-finisher-preflight.mjs';

function selfHash(body, field) {
  return Object.freeze({
    ...body,
    [field]: sha256FrameFinisherDocument(body),
  });
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
}

function createFixture(root) {
  const relative = 'top-hat/blink-closed.png';
  const candidatePath = path.join(root, ...relative.split('/'));
  mkdirSync(path.dirname(candidatePath), { recursive: true, mode: 0o700 });
  const pixels = Buffer.from([
    231, 17, 99, 0,
    40, 50, 60, 255,
    70, 80, 90, 128,
    0, 0, 0, 0,
  ]);
  const png = encodeAvatarProviderFramePng(2, 2, pixels);
  writeFileSync(candidatePath, png, { flag: 'wx', mode: 0o600 });
  const candidateSha256 = sha256FrameFinisherBytes(png);
  const reviewedTargetPath = 'top-hat/reviewed/blink-closed.png';
  const materializationId = 'fixture-materialization:blink-closed';
  const requestBody = {
    schema:
      'evavo.project-art-avatar-final-pass-provider-candidate-finisher-request.v1',
    protocolVersion: '2026-08-13.2',
    materializationId,
    createdAt: '2026-08-19T00:20:00.000Z',
    sourceCommit: '1111111111111111111111111111111111111111',
    sessionId: 'fixture-session',
    characterId: 'top-hat',
    jobId: 'redraw:blink-closed',
    frameId: 'blink-closed',
    kind: 'pose-bank',
    operation: 'redraw',
    continuityPhase: 'pose-bank',
    sourceCandidate: Object.freeze({
      path: relative,
      sha256: candidateSha256,
      bytes: png.length,
      width: 2,
      height: 2,
    }),
    reviewedTargetPath,
    finalSha256RequiredBeforeInbetweenOrSequenceUse: true,
    candidateApproval: false,
    candidatePromotion: false,
    runtimeActivationAllowed: false,
  };
  const request = selfHash(requestBody, 'finisherRequestSha256');
  const receiptBody = {
    schema:
      'evavo.project-art-avatar-final-pass-provider-candidate-materialization.v1',
    protocolVersion: '2026-08-13.2',
    status: 'candidate-materialized-awaiting-frame-finisher',
    materializationId,
    output: Object.freeze({
      path: relative,
      sha256: candidateSha256,
      bytes: png.length,
      width: 2,
      height: 2,
      reviewedTargetPath,
      createOnly: true,
      unapproved: true,
    }),
    finisherHandoff: Object.freeze({
      finisherRequestSha256: request.finisherRequestSha256,
    }),
  };
  const receipt = selfHash(receiptBody, 'materializationSha256');
  const receiptPath = path.join(root, 'fixture.materialization.json');
  const requestPath = path.join(root, 'fixture.finisher-request.json');
  writeJson(receiptPath, receipt);
  writeJson(requestPath, request);
  return Object.freeze({
    candidatePath,
    receiptPath,
    requestPath,
    receipt,
    request,
  });
}

async function withWorkspace(callback) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'frame-finisher-preflight-test-'));
  try {
    return await callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('shadow preflight uses the real finisher without publishing to the real workspace', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = createFixture(workspaceRoot);
    const finishedAt = '2026-08-19T00:30:00.000Z';
    const preflight = preflightAvatarFinalPassProviderFrameFiles({
      workspaceRoot,
      materializationReceiptPath: fixture.receiptPath,
      finisherRequestPath: fixture.requestPath,
      finishedAt,
    });
    assert.equal(preflight.status, 'frame-finisher-preflight-ready');
    assert.equal(preflight.frameId, 'blink-closed');
    assert.equal(
      preflight.materializationSha256,
      fixture.receipt.materializationSha256,
    );
    assert.equal(
      preflight.finisherRequestSha256,
      fixture.request.finisherRequestSha256,
    );
    assert.equal(existsSync(preflight.outputs.absolute.finished), false);
    assert.equal(existsSync(preflight.outputs.absolute.report), false);
    assert.equal(existsSync(preflight.outputs.absolute.reviewRequest), false);
    assert.equal(existsSync(preflight.outputs.absolute.reviewOutcome), false);

    const actual = finishAvatarFinalPassProviderFrameFiles({
      workspaceRoot,
      materializationReceiptPath: fixture.receiptPath,
      finisherRequestPath: fixture.requestPath,
      finishedAt,
    });
    assert.equal(actual.reused, false);
    assert.equal(
      actual.report.output.sha256,
      preflight.expectedFinishedFrame.sha256,
    );
    assert.equal(
      actual.report.frameFinisherSha256,
      preflight.expectedFrameFinisherSha256,
    );
    assert.equal(
      actual.reviewRequest.reviewRequestSha256,
      preflight.expectedReviewRequestSha256,
    );
    assert.equal(actual.report.source.hiddenRgbTransparentPixels, 1);
    assert.equal(actual.report.output.hiddenRgbTransparentPixels, 0);
    assert.equal(actual.report.output.hiddenRgbPixelsCleared, 1);
    assert.equal(actual.report.preservation.visiblePixelsUnchanged, true);
    assert.equal(actual.report.preservation.alphaUnchanged, true);
    assert.equal(actual.report.preservation.canvasUnchanged, true);
    assert.equal(actual.report.output.approvalState, 'unapproved');
    assert.equal(actual.reviewRequest.sequenceReleaseAllowed, false);
    assert.equal(actual.reviewRequest.runtimeActivationAllowed, false);
  });
});

test('shadow preflight rejects a stale review outcome before finishing', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = createFixture(workspaceRoot);
    const reviewOutcomePath = fixture.candidatePath.replace(
      /\.png$/u,
      '.frame-review-outcome.json',
    );
    writeJson(reviewOutcomePath, { stale: true });
    assert.throws(
      () =>
        preflightAvatarFinalPassProviderFrameFiles({
          workspaceRoot,
          materializationReceiptPath: fixture.receiptPath,
          finisherRequestPath: fixture.requestPath,
          finishedAt: '2026-08-19T00:30:00.000Z',
        }),
      (error) =>
        error?.code === 'AVATAR_FRAME_FINISHER_PREFLIGHT_OUTPUT_ALREADY_EXISTS',
    );
  });
});

console.log('Project Art avatar frame-finisher shadow preflight regressions passed.');
