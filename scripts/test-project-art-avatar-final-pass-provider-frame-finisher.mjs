#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  FRAME_FINISHER_PROTOCOL_VERSION,
  FRAME_REVIEW_DECISION_SCHEMA,
  encodeAvatarProviderFramePng,
  finishAvatarFinalPassProviderFrameFiles,
  inspectAvatarProviderFramePng,
  reviewAvatarFinalPassProviderFrameFiles,
  sha256FrameFinisherBytes,
  sha256FrameFinisherDocument,
} from './project-art/avatar-final-pass-provider-frame-finisher.mjs';

const MATERIALIZATION_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-candidate-materialization.v1';
const FINISHER_REQUEST_SCHEMA =
  'evavo.project-art-avatar-final-pass-provider-candidate-finisher-request.v1';
const CANDIDATE_PROTOCOL = '2026-08-13.2';
const FINISHED_AT = '2026-08-13T09:00:00.000Z';
const REVIEWED_AT = '2026-08-13T09:05:00.000Z';

function sealed(body, field) {
  return { ...body, [field]: sha256FrameFinisherDocument(body) };
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function digest(character) {
  return character.repeat(64);
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'avatar-frame-finisher-'));
  const relative = 'scratch/avatar-final-pass/eva/session/frame-01/candidate-01.png';
  const absolute = path.join(root, ...relative.split('/'));
  mkdirSync(path.dirname(absolute), { recursive: true });
  const pixels = Buffer.alloc(4 * 4 * 4);
  for (let index = 0; index < 4 * 4; index += 1) {
    const offset = index * 4;
    if (index === 0 || index === 5 || index === 6 || index === 9 || index === 10) {
      pixels[offset] = 30 + index;
      pixels[offset + 1] = 80;
      pixels[offset + 2] = 140;
      pixels[offset + 3] = index === 10 ? 128 : 255;
    } else {
      pixels[offset] = index % 3 === 0 ? 91 : 0;
      pixels[offset + 1] = index % 3 === 0 ? 77 : 0;
      pixels[offset + 2] = index % 3 === 0 ? 33 : 0;
      pixels[offset + 3] = 0;
    }
  }
  const png = encodeAvatarProviderFramePng(4, 4, pixels);
  writeFileSync(absolute, png);
  const pngInfo = inspectAvatarProviderFramePng(png, 4, 4);
  assert.ok(pngInfo.hiddenRgbTransparentPixels > 0);

  const materializationId = 'avatar-candidate-materialization:0123456789abcdef0123456789abcdef01234567';
  const receiptBody = {
    schema: MATERIALIZATION_SCHEMA,
    protocolVersion: CANDIDATE_PROTOCOL,
    status: 'candidate-materialized-awaiting-frame-finisher',
    materializationId,
    materializedAt: '2026-08-13T08:55:00.000Z',
    sourceCommit: 'e77aba8a7f78c5345b234e9803872723bad8ae43',
    source: { runtimeOutcomeSha256: digest('a') },
    output: {
      path: relative,
      reviewedTargetPath: 'reviewed/eva/frame-01.png',
      sha256: pngInfo.sha256,
      bytes: png.length,
      mediaType: 'image/png',
      width: 4,
      height: 4,
      createOnly: true,
      unapproved: true,
    },
    png: { hiddenRgbTransparentPixels: pngInfo.hiddenRgbTransparentPixels },
    authorization: { actorClass: 'human' },
    finisherHandoff: {
      path: relative.replace(/\.png$/u, '.finisher-request.json'),
      finisherRequestSha256: '',
    },
    requiredNextSteps: [],
    approvals: { creative: false },
    authority: { candidateApproval: false },
  };
  const requestBody = {
    schema: FINISHER_REQUEST_SCHEMA,
    protocolVersion: CANDIDATE_PROTOCOL,
    requestId: 'avatar-finisher:0123456789abcdef0123456789abcdef01234567',
    materializationId,
    createdAt: '2026-08-13T08:55:00.000Z',
    sourceCommit: 'e77aba8a7f78c5345b234e9803872723bad8ae43',
    sessionId: 'eva-session',
    characterId: 'eva',
    jobId: 'frame-01-redraw',
    frameId: 'frame-01',
    kind: 'provider-redraw',
    operation: 'edit',
    continuityPhase: 'key-pose',
    sourceCandidate: {
      path: relative,
      sha256: pngInfo.sha256,
      bytes: png.length,
      mediaType: 'image/png',
      width: 4,
      height: 4,
      visiblePixels: pngInfo.visiblePixels,
      transparentPixels: pngInfo.transparentPixels,
      partialAlphaPixels: pngInfo.partialAlphaPixels,
      hiddenRgbTransparentPixels: pngInfo.hiddenRgbTransparentPixels,
      edgeVisiblePixels: pngInfo.edgeVisiblePixels,
      visibleBounds: pngInfo.visibleBounds,
      artifactId: `artifact_${digest('1')}`,
      artifactDescriptorSha256: digest('2'),
      evidenceArtifactId: `artifact_${digest('3')}`,
      evidenceDescriptorSha256: digest('4'),
      runtimeOutcomeSha256: digest('5'),
    },
    reviewedTargetPath: 'reviewed/eva/frame-01.png',
    requiredOperations: [],
    requiredReviewGates: [],
    finalSha256RequiredBeforeInbetweenOrSequenceUse: true,
    candidateApproval: false,
    candidatePromotion: false,
    runtimeActivationAllowed: false,
    authority: { runtimeActivation: false },
  };
  const request = sealed(requestBody, 'finisherRequestSha256');
  receiptBody.finisherHandoff.finisherRequestSha256 = request.finisherRequestSha256;
  const receipt = sealed(receiptBody, 'materializationSha256');
  const receiptPath = path.join(root, 'records/materialization.json');
  const requestPath = path.join(root, 'records/finisher-request.json');
  writeJson(receiptPath, receipt);
  writeJson(requestPath, request);
  return { root, relative, absolute, png, pngInfo, receiptPath, requestPath };
}

function decisionFor(result, decisionName = 'approve-final-frame', overrides = {}) {
  const approval = decisionName === 'approve-final-frame';
  const gates = {
    technical: approval ? 'pass' : 'fail',
    handsAndAnatomy: approval ? 'pass' : 'fail',
    faceIdentity: approval ? 'pass' : 'fail',
    silhouetteRegistration: approval ? 'pass' : 'fail',
    adjacentFrameContinuity: approval ? 'pass' : 'fail',
    loopClosure: 'not-applicable',
    ...(overrides.gates ?? {}),
  };
  const body = {
    schema: FRAME_REVIEW_DECISION_SCHEMA,
    protocolVersion: FRAME_FINISHER_PROTOCOL_VERSION,
    reviewId: overrides.reviewId ?? `review-${decisionName}`,
    frameFinisherSha256: result.report.frameFinisherSha256,
    reviewRequestSha256: result.reviewRequest.reviewRequestSha256,
    frameId: result.report.frameId,
    decision: decisionName,
    reviewer: {
      actorClass: overrides.actorClass ?? 'human',
      actorId: 'greg.parker',
      occurredAt: '2026-08-13T09:04:00.000Z',
      evidenceSha256: digest('6'),
    },
    gates,
    evidence: {
      nativeScaleSha256: digest('7'),
      contactSheetSha256: digest('8'),
      identityReferenceSha256: digest('9'),
      adjacentFramesSha256: digest('a'),
      loopClosureSha256: gates.loopClosure === 'not-applicable' ? null : digest('b'),
    },
    notes: decisionName === 'approve-final-frame'
      ? 'Hands, anatomy, identity, registration and adjacent continuity reviewed.'
      : 'Return this frame to the explicit repair queue.',
    authority: {
      providerExecution: false,
      candidatePromotion: false,
      sequenceRelease: false,
      runtimeActivation: false,
      forcePush: false,
    },
  };
  return sealed(body, 'decisionSha256');
}

function finishFixture(source = fixture()) {
  const result = finishAvatarFinalPassProviderFrameFiles({
    workspaceRoot: source.root,
    materializationReceiptPath: source.receiptPath,
    finisherRequestPath: source.requestPath,
    finishedAt: FINISHED_AT,
  });
  return { source, result };
}

test('finishes one frame by clearing only hidden transparent RGB', () => {
  const { source, result } = finishFixture();
  assert.equal(result.status, 'frame-finished-awaiting-human-review');
  assert.equal(result.reused, false);
  const output = inspectAvatarProviderFramePng(
    readFileSync(result.finishedFramePath),
    4,
    4,
  );
  assert.equal(output.hiddenRgbTransparentPixels, 0);
  assert.equal(output.visiblePixelSha256, source.pngInfo.visiblePixelSha256);
  assert.equal(output.alphaSha256, source.pngInfo.alphaSha256);
  assert.deepEqual(output.visibleBounds, source.pngInfo.visibleBounds);
  assert.equal(result.report.preservation.visiblePixelsUnchanged, true);
  assert.equal(result.report.preservation.alphaUnchanged, true);
  assert.equal(result.report.authority.visiblePixelMutation, false);
  assert.equal(result.reviewRequest.finalSha256RequiredBeforeInbetweenOrSequenceUse, true);
});

test('exact retry reuses the complete matching finish bundle', () => {
  const { source, result } = finishFixture();
  const replay = finishAvatarFinalPassProviderFrameFiles({
    workspaceRoot: source.root,
    materializationReceiptPath: source.receiptPath,
    finisherRequestPath: source.requestPath,
    finishedAt: FINISHED_AT,
  });
  assert.equal(replay.reused, true);
  assert.equal(replay.report.frameFinisherSha256, result.report.frameFinisherSha256);
});

test('tampered source candidate fails closed', () => {
  const source = fixture();
  const bytes = Buffer.from(readFileSync(source.absolute));
  bytes[bytes.length - 1] ^= 0x01;
  writeFileSync(source.absolute, bytes);
  assert.throws(
    () => finishAvatarFinalPassProviderFrameFiles({
      workspaceRoot: source.root,
      materializationReceiptPath: source.receiptPath,
      finisherRequestPath: source.requestPath,
      finishedAt: FINISHED_AT,
    }),
    /SOURCE_HASH_MISMATCH/u,
  );
});

test('corrupt PNG CRC and fully opaque frames are rejected', () => {
  const source = fixture();
  const corrupt = Buffer.from(source.png);
  corrupt[corrupt.length - 5] ^= 0x01;
  assert.throws(() => inspectAvatarProviderFramePng(corrupt), /PNG_CRC_INVALID/u);

  const opaquePixels = Buffer.alloc(4 * 4 * 4, 255);
  const opaque = encodeAvatarProviderFramePng(4, 4, opaquePixels);
  assert.throws(() => inspectAvatarProviderFramePng(opaque), /PNG_FULLY_OPAQUE/u);
});

test('partial finish publication fails closed', () => {
  const { source, result } = finishFixture();
  unlinkSync(result.reviewRequestPath);
  assert.throws(
    () => finishAvatarFinalPassProviderFrameFiles({
      workspaceRoot: source.root,
      materializationReceiptPath: source.receiptPath,
      finisherRequestPath: source.requestPath,
      finishedAt: FINISHED_AT,
    }),
    /PARTIAL_PUBLICATION/u,
  );
});

test('named-human approval admits only the exact finished frame hash', () => {
  const { source, result } = finishFixture();
  const decisionPath = path.join(source.root, 'records/review-decision.json');
  writeJson(decisionPath, decisionFor(result));
  const reviewed = reviewAvatarFinalPassProviderFrameFiles({
    workspaceRoot: source.root,
    frameFinisherReportPath: result.reportPath,
    frameReviewRequestPath: result.reviewRequestPath,
    frameReviewDecisionPath: decisionPath,
    reviewedAt: REVIEWED_AT,
  });
  assert.equal(reviewed.status, 'final-frame-admitted');
  assert.equal(reviewed.outcome.finalFrameSha256, result.report.output.sha256);
  assert.equal(reviewed.outcome.dependentInbetweenEndpointAllowed, true);
  assert.equal(reviewed.outcome.sequenceDraftUseAllowed, true);
  assert.equal(reviewed.outcome.sequenceReleaseAllowed, false);
  assert.equal(reviewed.outcome.runtimeActivationAllowed, false);
  assert.equal(reviewed.outcome.authority.finalFrameHashAdmission, true);
});

test('non-human or failed-gate approval is rejected', () => {
  const first = finishFixture();
  const nonHumanPath = path.join(first.source.root, 'records/nonhuman.json');
  writeJson(nonHumanPath, decisionFor(first.result, 'approve-final-frame', {
    actorClass: 'agent',
  }));
  assert.throws(
    () => reviewAvatarFinalPassProviderFrameFiles({
      workspaceRoot: first.source.root,
      frameFinisherReportPath: first.result.reportPath,
      frameReviewRequestPath: first.result.reviewRequestPath,
      frameReviewDecisionPath: nonHumanPath,
      reviewedAt: REVIEWED_AT,
    }),
    /HUMAN_REQUIRED/u,
  );

  const second = finishFixture();
  const failedGatePath = path.join(second.source.root, 'records/failed-gate.json');
  writeJson(failedGatePath, decisionFor(second.result, 'approve-final-frame', {
    reviewId: 'review-failed-gate',
    gates: { handsAndAnatomy: 'fail' },
  }));
  assert.throws(
    () => reviewAvatarFinalPassProviderFrameFiles({
      workspaceRoot: second.source.root,
      frameFinisherReportPath: second.result.reportPath,
      frameReviewRequestPath: second.result.reviewRequestPath,
      frameReviewDecisionPath: failedGatePath,
      reviewedAt: REVIEWED_AT,
    }),
    /handsAndAnatomy/u,
  );
});

test('repair decisions remain outside in-between and sequence admission', () => {
  const { source, result } = finishFixture();
  const decisionPath = path.join(source.root, 'records/repair-decision.json');
  writeJson(decisionPath, decisionFor(result, 'repair-frame'));
  const reviewed = reviewAvatarFinalPassProviderFrameFiles({
    workspaceRoot: source.root,
    frameFinisherReportPath: result.reportPath,
    frameReviewRequestPath: result.reviewRequestPath,
    frameReviewDecisionPath: decisionPath,
    reviewedAt: REVIEWED_AT,
  });
  assert.equal(reviewed.status, 'frame-repair-required');
  assert.equal(reviewed.outcome.finalFrameSha256, null);
  assert.equal(reviewed.outcome.dependentInbetweenEndpointAllowed, false);
  assert.equal(reviewed.outcome.sequenceDraftUseAllowed, false);
  assert.equal(reviewed.outcome.authority.finalFrameHashAdmission, false);
});

console.log('Project Art avatar provider frame-finisher regressions passed.');
