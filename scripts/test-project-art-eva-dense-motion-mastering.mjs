#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AVATAR_FRAME_ASSURANCE_CHECKS,
  AVATAR_FRAME_ASSURANCE_SCHEMA,
} from './project-art/avatar-frame-assurance.mjs';
import {
  finishAvatarFinalPassProviderFrameFiles,
  encodeAvatarProviderFramePng,
} from './project-art/avatar-final-pass-provider-frame-finisher.mjs';
import { sha256Bytes } from './project-art/avatar-final-pass-provider-candidate-common.mjs';
import {
  EVA_DENSE_MOTION_MINIMUM_INSPECTOR_CONFIDENCE,
  compileEvaDenseMotionCandidateAssurance,
  evaDenseMotionCandidateAssuranceCapabilities,
  verifyEvaDenseMotionCandidateAssurance,
} from './project-art/eva-dense-motion-candidate-assurance.mjs';
import {
  compileEvaDenseMotionAlphaMastering,
  compileEvaDenseMotionAlphaMasteringAuthorization,
  compileEvaDenseMotionAlphaMatteReview,
  evaDenseMotionAlphaMasteringCapabilities,
  masterEvaDenseMotionAlphaFiles,
  verifyEvaDenseMotionAlphaMasteringAuthorization,
} from './project-art/eva-dense-motion-alpha-mastering.mjs';
import {
  compileEvaDenseMotionTenMasterProgram,
  createEvaDenseMotionTenMasterRequest,
} from './project-art/eva-dense-motion-ten-master-program.mjs';

const WIDTH = 1024;
const HEIGHT = 1536;
const PIXELS = WIDTH * HEIGHT;
const ZERO = '0'.repeat(64);
const ONE = '1'.repeat(64);
const TWO = '2'.repeat(64);

function program() {
  return compileEvaDenseMotionTenMasterProgram(
    createEvaDenseMotionTenMasterRequest({
      programId: 'eva-dense-mastering-fixture',
      actorId: 'eva-dense-mastering-fixture',
      createdAt: '2026-08-20T00:00:00.000Z',
      outputRoot: 'workspaces/eva-dense-motion/mastering-fixture',
    }),
  );
}

function opaqueCandidatePng() {
  const pixels = Buffer.alloc(PIXELS * 4);
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    const offset = pixel * 4;
    pixels[offset] = 44;
    pixels[offset + 1] = 61;
    pixels[offset + 2] = 79;
    pixels[offset + 3] = 255;
  }
  return encodeAvatarProviderFramePng(WIDTH, HEIGHT, pixels);
}

function mattePng() {
  const pixels = Buffer.alloc(PIXELS * 4);
  for (let y = 96; y < 1440; y += 1) {
    for (let x = 180; x < 844; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = 255;
    }
  }
  return encodeAvatarProviderFramePng(WIDTH, HEIGHT, pixels);
}

function genericAssurance(frameId, sourceSha256, confidence = 0.99) {
  return {
    schema: AVATAR_FRAME_ASSURANCE_SCHEMA,
    frameId,
    sourceSha256,
    checks: AVATAR_FRAME_ASSURANCE_CHECKS.map((check, checkIndex) => ({
      check,
      observations: [
        {
          inspectorId: 'inspector-alpha',
          inspectorVersion: 'fixture-1',
          applicability: 'visible',
          verdict: 'pass',
          confidence,
          evidenceSha256: checkIndex % 2 === 0 ? ZERO : ONE,
          note: 'Independent fixture inspection A.',
        },
        {
          inspectorId: 'inspector-beta',
          inspectorVersion: 'fixture-1',
          applicability: 'visible',
          verdict: 'pass',
          confidence,
          evidenceSha256: checkIndex % 2 === 0 ? TWO : ZERO,
          note: 'Independent fixture inspection B.',
        },
      ],
    })),
    publicationAuthority: false,
  };
}

function gateResults() {
  return {
    'subject-silhouette': true,
    'hair-and-fine-edge': true,
    'hands-and-fingers': true,
    'face-and-neck': true,
    'wardrobe-boundary': true,
    'checkerboard-and-matte-rejection': true,
    'canvas-edge-clearance': true,
  };
}

function preparedInputs(ordinal = 1) {
  const tenMasterProgram = program();
  const job = tenMasterProgram.production.jobs.find((entry) => entry.ordinal === ordinal);
  const candidateBytes = opaqueCandidatePng();
  const candidateSha256 = sha256Bytes(candidateBytes);
  const candidateAssurance = compileEvaDenseMotionCandidateAssurance({
    tenMasterProgram,
    ordinal,
    candidateBytes,
    candidatePath: job.outputs.denseCandidate,
    frameAssurance: genericAssurance(job.frameId, candidateSha256),
    inspectedAt: '2026-08-20T00:01:00.000Z',
  });
  const alphaMatteBytes = mattePng();
  const alphaMatteSha256 = sha256Bytes(alphaMatteBytes);
  const alphaMatteReview = compileEvaDenseMotionAlphaMatteReview({
    tenMasterProgram,
    ordinal,
    candidateAssurance,
    alphaMatteSha256,
    reviewer: { actorClass: 'human', actorId: 'fixture-reviewer' },
    evidenceSha256: ONE,
    reviewedAt: '2026-08-20T00:02:00.000Z',
    gateResults: gateResults(),
  });
  const authorization = compileEvaDenseMotionAlphaMasteringAuthorization({
    tenMasterProgram,
    ordinal,
    candidateAssurance,
    alphaMatteReview,
    actorId: 'fixture-authorizer',
    evidenceSha256: TWO,
    occurredAt: '2026-08-20T00:03:00.000Z',
    notAfter: '2026-08-20T06:03:00.000Z',
  });
  return {
    tenMasterProgram,
    job,
    candidateBytes,
    candidateAssurance,
    alphaMatteBytes,
    alphaMatteReview,
    authorization,
  };
}

test('dense candidate assurance raises the generic inspector floor to 0.95 without granting approval', () => {
  const fixture = preparedInputs();
  const verified = verifyEvaDenseMotionCandidateAssurance(
    fixture.candidateAssurance,
    { program: fixture.tenMasterProgram },
  );
  assert.equal(
    verified.independentInspection.minimumConfidence,
    EVA_DENSE_MOTION_MINIMUM_INSPECTOR_CONFIDENCE,
  );
  assert.equal(verified.independentInspection.inspectorCount, 2);
  assert.equal(verified.gates.candidateApproval, false);
  assert.equal(verified.gates.runtimeActivationAllowed, false);
  assert.ok(Object.values(verified.authority).every((value) => value === false));

  const candidateSha256 = sha256Bytes(fixture.candidateBytes);
  assert.throws(
    () => compileEvaDenseMotionCandidateAssurance({
      tenMasterProgram: fixture.tenMasterProgram,
      ordinal: 1,
      candidateBytes: fixture.candidateBytes,
      candidatePath: fixture.job.outputs.denseCandidate,
      frameAssurance: genericAssurance(fixture.job.frameId, candidateSha256, 0.94),
      inspectedAt: '2026-08-20T00:01:00.000Z',
    }),
    /EVA_DENSE_MOTION_CANDIDATE_ASSURANCE_CONFIDENCE_TOO_LOW/u,
  );

  const capabilities = evaDenseMotionCandidateAssuranceCapabilities();
  assert.equal(capabilities.minimumIndependentInspectors, 2);
  assert.equal(capabilities.minimumInspectorConfidence, 0.95);
  assert.equal(capabilities.publicationAuthority, false);
});

test('dense alpha mastering preserves visible RGB, applies reviewed alpha and emits a finisher handoff', () => {
  const fixture = preparedInputs();
  const result = compileEvaDenseMotionAlphaMastering({
    tenMasterProgram: fixture.tenMasterProgram,
    ordinal: 1,
    candidateAssurance: fixture.candidateAssurance,
    sourceSpaceCandidateBytes: fixture.candidateBytes,
    sourceSpaceCandidatePath: fixture.job.outputs.denseCandidate,
    alphaMatteBytes: fixture.alphaMatteBytes,
    alphaMattePath: fixture.job.outputs.alphaMatte,
    alphaMatteReview: fixture.alphaMatteReview,
    authorization: fixture.authorization,
    masteredAt: '2026-08-20T00:04:00.000Z',
  });
  assert.equal(result.status, 'alpha-mastered-awaiting-frame-finisher');
  assert.equal(result.report.output.width, WIDTH);
  assert.equal(result.report.output.height, HEIGHT);
  assert.equal(result.report.output.hiddenRgbTransparentPixels, 0);
  assert.equal(result.report.output.edgeVisiblePixels, 0);
  assert.equal(result.report.comparison.visibleRgbMismatches, 0);
  assert.equal(result.report.comparison.alphaPlaneMatchesReviewedMatte, true);
  assert.equal(result.report.gates.productionAlphaReady, true);
  assert.equal(result.report.gates.creativeReviewRequired, true);
  assert.equal(result.report.gates.cloudinaryUploadAllowed, false);
  assert.equal(result.report.gates.runtimeActivationAllowed, false);
  assert.equal(result.materializationReceipt.output.unapproved, true);
  assert.equal(result.finisherRequest.candidateApproval, false);
  assert.equal(result.finisherRequest.runtimeActivationAllowed, false);
  assert.match(result.report.alphaMasteringSha256, /^[a-f0-9]{64}$/u);
  assert.match(result.materializationReceipt.materializationSha256, /^[a-f0-9]{64}$/u);
  assert.match(result.finisherRequest.finisherRequestSha256, /^[a-f0-9]{64}$/u);
});

test('dense alpha authorization is bounded and rejected after expiry', () => {
  const fixture = preparedInputs();
  assert.throws(
    () => verifyEvaDenseMotionAlphaMasteringAuthorization(
      fixture.authorization,
      {
        program: fixture.tenMasterProgram,
        assurance: fixture.candidateAssurance,
        review: fixture.alphaMatteReview,
        masteredAt: '2026-08-20T06:03:00.001Z',
      },
    ),
    /EVA_DENSE_ALPHA_AUTHORIZATION_EXPIRED/u,
  );
  const capabilities = evaDenseMotionAlphaMasteringCapabilities();
  assert.equal(capabilities.maximumAuthorizationLifetimeHours, 24);
  assert.equal(capabilities.maximumExecutionsPerAuthorization, 1);
  assert.equal(capabilities.visibleRgbMutationAllowed, false);
  assert.equal(capabilities.cloudinaryUpload, false);
  assert.equal(capabilities.runtimeActivation, false);
});

test('file executor publishes create-only alpha bundle and the standard frame finisher consumes it', () => {
  const fixture = preparedInputs();
  const root = mkdtempSync(path.join(os.tmpdir(), 'eva-dense-mastering-fixture-'));
  try {
    const toAbsolute = (relative) => path.join(root, ...relative.split('/'));
    const writeSemantic = (relative, value) => {
      const absolute = toAbsolute(relative);
      mkdirSync(path.dirname(absolute), { recursive: true });
      writeFileSync(
        absolute,
        Buffer.isBuffer(value) ? value : `${JSON.stringify(value, null, 2)}\n`,
      );
      return absolute;
    };
    writeSemantic(fixture.job.outputs.denseCandidate, fixture.candidateBytes);
    const assurancePath = writeSemantic(
      fixture.job.outputs.candidateAssurance,
      fixture.candidateAssurance,
    );
    writeSemantic(fixture.job.outputs.alphaMatte, fixture.alphaMatteBytes);
    const reviewPath = writeSemantic(
      fixture.job.outputs.alphaMatteReview,
      fixture.alphaMatteReview,
    );
    const authorizationPath = writeSemantic(
      `${path.posix.dirname(fixture.job.outputs.alphaMatteReview)}/alpha-mastering.authorization.json`,
      fixture.authorization,
    );

    const mastered = masterEvaDenseMotionAlphaFiles({
      tenMasterProgram: fixture.tenMasterProgram,
      ordinal: 1,
      workspaceRoot: root,
      candidateAssurancePath: assurancePath,
      alphaMatteReviewPath: reviewPath,
      authorizationPath,
      masteredAt: '2026-08-20T00:04:00.000Z',
    });
    assert.equal(mastered.status, 'alpha-mastered-awaiting-frame-finisher');
    assert.equal(mastered.nextRequiredStage, 'avatar-frame-finisher');
    assert.ok(readFileSync(mastered.paths.mastered).length > 57);

    const finish = finishAvatarFinalPassProviderFrameFiles({
      workspaceRoot: root,
      materializationReceiptPath: mastered.paths.materialization,
      finisherRequestPath: mastered.paths.finisherRequest,
      finishedAt: '2026-08-20T00:05:00.000Z',
    });
    assert.equal(finish.status, 'frame-finished-awaiting-human-review');
    assert.equal(finish.reused, false);
    assert.equal(finish.report.output.hiddenRgbTransparentPixels, 0);
    assert.equal(finish.report.preservation.visiblePixelsUnchanged, true);
    assert.equal(finish.report.preservation.alphaUnchanged, true);
    assert.equal(finish.reviewRequest.sequenceReleaseAllowed, false);
    assert.equal(finish.reviewRequest.runtimeActivationAllowed, false);

    assert.throws(
      () => masterEvaDenseMotionAlphaFiles({
        tenMasterProgram: fixture.tenMasterProgram,
        ordinal: 1,
        workspaceRoot: root,
        candidateAssurancePath: assurancePath,
        alphaMatteReviewPath: reviewPath,
        authorizationPath,
        masteredAt: '2026-08-20T00:04:30.000Z',
      }),
      /EVA_DENSE_ALPHA_OUTPUT_ALREADY_EXISTS/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
