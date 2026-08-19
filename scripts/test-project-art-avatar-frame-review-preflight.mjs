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
  FRAME_FINISHER_PROTOCOL_VERSION,
  FRAME_REVIEW_DECISION_SCHEMA,
  reviewAvatarFinalPassProviderFrameFiles,
  sha256FrameFinisherBytes,
  sha256FrameFinisherDocument,
} from './project-art/avatar-final-pass-provider-frame-finisher.mjs';
import {
  preflightAvatarFinalPassProviderFrameReviewFiles,
} from './project-art/avatar-final-pass-provider-frame-review-preflight.mjs';

const digest = (character) => character.repeat(64);

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

function createFinishedFixture(root) {
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
  const materializationPath = path.join(root, 'fixture.materialization.json');
  const finisherRequestPath = path.join(root, 'fixture.finisher-request.json');
  writeJson(materializationPath, receipt);
  writeJson(finisherRequestPath, request);
  const finished = finishAvatarFinalPassProviderFrameFiles({
    workspaceRoot: root,
    materializationReceiptPath: materializationPath,
    finisherRequestPath,
    finishedAt: '2026-08-19T00:30:00.000Z',
  });
  return Object.freeze({ finished });
}

function humanDecision(finished, actorClass = 'human') {
  const body = {
    schema: FRAME_REVIEW_DECISION_SCHEMA,
    protocolVersion: FRAME_FINISHER_PROTOCOL_VERSION,
    reviewId: 'fixture-review:blink-closed',
    frameFinisherSha256: finished.report.frameFinisherSha256,
    reviewRequestSha256: finished.reviewRequest.reviewRequestSha256,
    frameId: finished.report.frameId,
    decision: 'approve-final-frame',
    reviewer: Object.freeze({
      actorClass,
      actorId: 'fixture-human-reviewer',
      occurredAt: '2026-08-19T00:40:00.000Z',
      evidenceSha256: digest('a'),
    }),
    gates: Object.freeze({
      technical: 'pass',
      handsAndAnatomy: 'pass',
      faceIdentity: 'pass',
      silhouetteRegistration: 'pass',
      adjacentFrameContinuity: 'pass',
      loopClosure: 'not-applicable',
    }),
    evidence: Object.freeze({
      nativeScaleSha256: digest('1'),
      contactSheetSha256: digest('2'),
      identityReferenceSha256: digest('3'),
      adjacentFramesSha256: digest('4'),
      loopClosureSha256: null,
    }),
    notes: 'Fixture human review evidence.',
    authority: Object.freeze({
      candidatePromotion: false,
      sequenceRelease: false,
      repositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      runtimeActivation: false,
      forcePush: false,
    }),
  };
  return selfHash(body, 'decisionSha256');
}

async function withWorkspace(callback) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'frame-review-preflight-test-'));
  try {
    return await callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('shadow preflight validates a genuine human decision without writing the real outcome', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = createFinishedFixture(workspaceRoot);
    const decision = humanDecision(fixture.finished);
    const decisionPath = path.join(workspaceRoot, 'human-review-decision.json');
    writeJson(decisionPath, decision);
    const expectedOutcomePath = fixture.finished.finishedFramePath.replace(
      /\.finished\.png$/u,
      '.frame-review-outcome.json',
    );
    assert.equal(existsSync(expectedOutcomePath), false);

    const preflight = preflightAvatarFinalPassProviderFrameReviewFiles({
      workspaceRoot,
      frameFinisherReportPath: fixture.finished.reportPath,
      frameReviewRequestPath: fixture.finished.reviewRequestPath,
      frameReviewDecisionPath: decisionPath,
      reviewedAt: '2026-08-19T00:45:00.000Z',
    });
    assert.equal(preflight.status, 'frame-review-preflight-ready');
    assert.equal(preflight.reviewer.actorClass, 'human');
    assert.equal(preflight.decision, 'approve-final-frame');
    assert.equal(preflight.expectedOutcome.status, 'final-frame-admitted');
    assert.equal(existsSync(expectedOutcomePath), false);

    const real = reviewAvatarFinalPassProviderFrameFiles({
      workspaceRoot,
      frameFinisherReportPath: fixture.finished.reportPath,
      frameReviewRequestPath: fixture.finished.reviewRequestPath,
      frameReviewDecisionPath: decisionPath,
      reviewedAt: '2026-08-19T00:45:00.000Z',
    });
    assert.equal(real.reused, false);
    assert.equal(real.outcome.reviewOutcomeSha256, preflight.expectedOutcome.reviewOutcomeSha256);
    assert.equal(real.outcome.status, 'final-frame-admitted');
    assert.equal(real.outcome.reviewer.actorClass, 'human');
    assert.equal(real.outcome.sequenceReleaseAllowed, false);
    assert.equal(real.outcome.runtimeActivationAllowed, false);
  });
});

test('shadow preflight rejects an agent-authored decision before any review outcome exists', async () => {
  await withWorkspace(async (workspaceRoot) => {
    const fixture = createFinishedFixture(workspaceRoot);
    const decision = humanDecision(fixture.finished, 'agent');
    const decisionPath = path.join(workspaceRoot, 'agent-review-decision.json');
    writeJson(decisionPath, decision);
    const expectedOutcomePath = fixture.finished.finishedFramePath.replace(
      /\.finished\.png$/u,
      '.frame-review-outcome.json',
    );
    assert.throws(
      () =>
        preflightAvatarFinalPassProviderFrameReviewFiles({
          workspaceRoot,
          frameFinisherReportPath: fixture.finished.reportPath,
          frameReviewRequestPath: fixture.finished.reviewRequestPath,
          frameReviewDecisionPath: decisionPath,
          reviewedAt: '2026-08-19T00:45:00.000Z',
        }),
      (error) => error?.code === 'AVATAR_FRAME_REVIEW_PREFLIGHT_BINDING_INVALID',
    );
    assert.equal(existsSync(expectedOutcomePath), false);
  });
});

console.log('Project Art avatar named-human review shadow-preflight regressions passed.');
