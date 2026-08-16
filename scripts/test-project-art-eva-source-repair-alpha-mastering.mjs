#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  EVA_SOURCE_REPAIR_ALPHA_MASTERING_SCHEMA,
  compileEvaSourceRepairAlphaMastering,
  sha256EvaSourceRepairAlphaBytes,
  sha256EvaSourceRepairAlphaDocument,
  verifyEvaSourceRepairAlphaMasteringDocument,
} from './project-art/eva-source-repair-alpha-mastering.mjs';
import {
  runProjectArtEvaSourceRepairAlphaMasteringCli,
} from './compile-project-art-eva-source-repair-alpha-mastering.mjs';
import {
  encodeAvatarProviderFramePng,
  finishAvatarFinalPassProviderFrame,
} from './project-art/avatar-final-pass-provider-frame-finisher.mjs';

const WIDTH = 1024;
const HEIGHT = 1536;
const PIXELS = WIDTH * HEIGHT;
const FRAME_ID = 'eva-20260809-153620-frame-05';
const TASK_ID = 'repair-eva-153620-05';
const CANDIDATE_PATH =
  `scratch/avatar-final-pass/eva-source-repair-v1/${FRAME_ID}/candidate-01.png`;
const MATTE_PATH =
  `scratch/avatar-final-pass/eva-source-repair-v1/${FRAME_ID}/alpha-matte.png`;
const OUTPUT_PATH =
  `scratch/avatar-final-pass/eva-source-repair-v1/${FRAME_ID}/candidate-01.alpha-mastered.png`;

function selfHash(body, field) {
  return Object.freeze({
    ...body,
    [field]: sha256EvaSourceRepairAlphaDocument(body),
  });
}

function sourcePixels() {
  const pixels = Buffer.alloc(PIXELS * 4);
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    const offset = pixel * 4;
    const x = pixel % WIDTH;
    const y = Math.floor(pixel / WIDTH);
    pixels[offset] = (x * 7 + y * 3) & 0xff;
    pixels[offset + 1] = (x * 5 + y * 11) & 0xff;
    pixels[offset + 2] = (x * 13 + y * 2) & 0xff;
    pixels[offset + 3] = 255;
  }
  return pixels;
}

function mattePixels({ invalidRgb = false, edge = false } = {}) {
  const pixels = Buffer.alloc(PIXELS * 4);
  const left = edge ? 0 : 270;
  const top = 300;
  const right = 760;
  const bottom = 1240;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      const alpha =
        x === left || x === right - 1 || y === top || y === bottom - 1
          ? 128
          : 255;
      const rgb = invalidRgb ? 127 : 255;
      pixels[offset] = rgb;
      pixels[offset + 1] = rgb;
      pixels[offset + 2] = rgb;
      pixels[offset + 3] = alpha;
    }
  }
  return pixels;
}

function assurance(candidateSha256) {
  const body = {
    schema: 'evavo.project-art-eva-source-repair-candidate-assurance.v1',
    phase: 'post-provider-source-space-candidate',
    frameId: FRAME_ID,
    taskId: TASK_ID,
    inspectedAt: '2026-08-15T11:06:00.000Z',
    canvas: { width: WIDTH, height: HEIGHT },
    maskAssuranceSha256: 'a'.repeat(64),
    source: {
      path: 'frames/source.png',
      sha256: 'b'.repeat(64),
      gitBlobSha1: 'c'.repeat(40),
      encoding: 'rgb8',
    },
    mask: {
      path: 'masks/defect-mask.png',
      sha256: 'd'.repeat(64),
      editablePixels: 4200,
      components: [{ x: 410, y: 850, width: 190, height: 120 }],
    },
    candidate: {
      path: CANDIDATE_PATH,
      sha256: candidateSha256,
      encoding: 'rgba8',
      transparentPixels: 0,
      partialAlphaPixels: 0,
    },
    comparison: {
      changedEditablePixels: 4200,
      minimumMeaningfulChanges: 64,
      changedProtectedPixels: 0,
      protectedPixelsCompared: PIXELS - 4200,
      protectedPixelPolicy: 'exact-rgba-source-space-invariance',
    },
    gates: {
      maskAssurancePassed: true,
      sourceSpaceAssurancePassed: true,
      protectedPixelInvariancePassed: true,
      meaningfulMaskedEditPassed: true,
      alphaMasteringRequired: true,
      productionAlphaReady: false,
      creativeReviewRequired: true,
      candidateApproval: false,
      candidatePromotion: false,
      runtimeActivationAllowed: false,
      publicationAllowed: false,
    },
    nextRequiredActions: [
      'run-separate-alpha-mastering-with-non-target-evidence',
      'run-dual-independent-anatomy-and-identity-inspection',
      'record-separate-creative-approval',
    ],
    authority: {
      sourceMutation: false,
      maskMutation: false,
      providerExecution: false,
      candidateGeneration: false,
      candidateApproval: false,
      candidatePromotion: false,
      alphaMastering: false,
      creativeReview: false,
      repositoryMutation: false,
      gitCommit: false,
      gitPush: false,
      deployment: false,
      publication: false,
      runtimeActivation: false,
      forcePush: false,
    },
  };
  return selfHash(body, 'assuranceSha256');
}

function providerSource(candidateBytes) {
  const candidateSha256 = sha256EvaSourceRepairAlphaBytes(candidateBytes);
  const materializationId = 'avatar-candidate-materialization:fixture';
  const requestBody = {
    schema:
      'evavo.project-art-avatar-final-pass-provider-candidate-finisher-request.v1',
    protocolVersion: '2026-08-13.2',
    requestId: 'avatar-finisher:fixture',
    materializationId,
    createdAt: '2026-08-15T11:05:00.000Z',
    sourceCommit: '1'.repeat(40),
    sessionId: 'eva-source-repair-v1',
    characterId: 'eva-female',
    jobId: `redraw:${FRAME_ID}`,
    frameId: FRAME_ID,
    kind: 'provider-redraw',
    operation: 'edit',
    continuityPhase: 'key-pose',
    sourceCandidate: {
      path: CANDIDATE_PATH,
      sha256: candidateSha256,
      bytes: candidateBytes.length,
      mediaType: 'image/png',
      width: WIDTH,
      height: HEIGHT,
    },
    reviewedTargetPath: `workfiles/eva-source-repairs/v1/source-candidates/${FRAME_ID}.png`,
    requiredOperations: [],
    requiredReviewGates: [],
    finalSha256RequiredBeforeInbetweenOrSequenceUse: true,
    candidateApproval: false,
    candidatePromotion: false,
    runtimeActivationAllowed: false,
    authority: {},
  };
  const request = selfHash(requestBody, 'finisherRequestSha256');
  const receiptBody = {
    schema:
      'evavo.project-art-avatar-final-pass-provider-candidate-materialization.v1',
    protocolVersion: '2026-08-13.2',
    status: 'candidate-materialized-awaiting-frame-finisher',
    materializationId,
    materializedAt: '2026-08-15T11:05:00.000Z',
    sourceCommit: '1'.repeat(40),
    source: {},
    output: {
      path: CANDIDATE_PATH,
      reviewedTargetPath: request.reviewedTargetPath,
      sha256: candidateSha256,
      bytes: candidateBytes.length,
      mediaType: 'image/png',
      width: WIDTH,
      height: HEIGHT,
      createOnly: true,
      unapproved: true,
    },
    png: {},
    authorization: {},
    finisherHandoff: {
      path: 'scratch/provider.finisher-request.json',
      finisherRequestSha256: request.finisherRequestSha256,
    },
    requiredNextSteps: [],
    approvals: {},
    authority: {},
  };
  return {
    request,
    receipt: selfHash(receiptBody, 'materializationSha256'),
  };
}

function fixture(matteOptions = {}) {
  const candidateBytes = encodeAvatarProviderFramePng(
    WIDTH,
    HEIGHT,
    sourcePixels(),
  );
  const matteBytes = encodeAvatarProviderFramePng(
    WIDTH,
    HEIGHT,
    mattePixels(matteOptions),
  );
  const candidateAssurance = assurance(
    sha256EvaSourceRepairAlphaBytes(candidateBytes),
  );
  const provider = providerSource(candidateBytes);
  return {
    candidateBytes,
    matteBytes,
    candidateAssurance,
    provider,
    authorization: {
      action: 'apply-production-alpha-once',
      actorClass: 'human',
      actorId: 'eva-alpha-matte-reviewer',
      occurredAt: '2026-08-15T11:07:00.000Z',
      evidenceSha256: sha256EvaSourceRepairAlphaBytes(
        Buffer.from('alpha-matte-review-evidence'),
      ),
      frameId: FRAME_ID,
      candidateAssuranceSha256: candidateAssurance.assuranceSha256,
      alphaMatteSha256: sha256EvaSourceRepairAlphaBytes(matteBytes),
    },
  };
}

function compile(value = fixture()) {
  return compileEvaSourceRepairAlphaMastering({
    frameId: FRAME_ID,
    candidateAssurance: value.candidateAssurance,
    providerMaterializationReceipt: value.provider.receipt,
    providerFinisherRequest: value.provider.request,
    sourceSpaceCandidateBytes: value.candidateBytes,
    sourceSpaceCandidatePath: CANDIDATE_PATH,
    alphaMatteBytes: value.matteBytes,
    alphaMattePath: MATTE_PATH,
    expectedAlphaMatteSha256: sha256EvaSourceRepairAlphaBytes(value.matteBytes),
    outputPath: OUTPUT_PATH,
    authorization: value.authorization,
    masteredAt: '2026-08-15T11:07:00.000Z',
  });
}

test('opaque source-space candidate becomes exact production alpha and a frame-finisher-compatible handoff', () => {
  const result = compile();
  assert.equal(result.report.schema, EVA_SOURCE_REPAIR_ALPHA_MASTERING_SCHEMA);
  assert.equal(result.report.gates.productionAlphaReady, true);
  assert.equal(result.report.comparison.visibleRgbMismatches, 0);
  assert.equal(result.report.output.hiddenRgbTransparentPixels, 0);
  assert.equal(result.report.output.edgeVisiblePixels, 0);
  assert.equal(
    result.materializationReceipt.output.sha256,
    result.finisherRequest.sourceCandidate.sha256,
  );
  assert.deepEqual(
    verifyEvaSourceRepairAlphaMasteringDocument(result.report),
    result.report,
  );

  const root = mkdtempSync(path.join(os.tmpdir(), 'eva-alpha-finisher-'));
  try {
    const candidate = path.join(root, ...result.paths.mastered.split('/'));
    mkdirSync(path.dirname(candidate), { recursive: true });
    writeFileSync(candidate, result.outputBytes);
    const finished = finishAvatarFinalPassProviderFrame({
      workspaceRoot: root,
      materializationReceipt: result.materializationReceipt,
      finisherRequest: result.finisherRequest,
      finishedAt: '2026-08-15T11:08:00.000Z',
    });
    assert.equal(finished.report.preservation.visiblePixelsUnchanged, true);
    assert.equal(finished.report.output.hiddenRgbTransparentPixels, 0);
    assert.equal(finished.report.approvals.creative, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('assurance drift, non-canonical matte RGB and canvas-edge foreground fail closed', () => {
  const drift = fixture();
  const body = structuredClone(drift.candidateAssurance);
  delete body.assuranceSha256;
  body.gates.alphaMasteringRequired = false;
  drift.candidateAssurance = selfHash(body, 'assuranceSha256');
  drift.authorization.candidateAssuranceSha256 =
    drift.candidateAssurance.assuranceSha256;
  assert.throws(
    () => compile(drift),
    /EVA_SOURCE_REPAIR_ALPHA_CANDIDATE_ASSURANCE_INVALID/u,
  );
  assert.throws(
    () => compile(fixture({ invalidRgb: true })),
    /EVA_SOURCE_REPAIR_ALPHA_MATTE_RGB_INVALID/u,
  );
  assert.throws(
    () => compile(fixture({ edge: true })),
    /EVA_SOURCE_REPAIR_ALPHA_MATTE_PROFILE_INVALID/u,
  );
});

test('file operator publishes one private create-only four-file bundle and refuses replacement', () => {
  const value = fixture();
  const root = mkdtempSync(path.join(os.tmpdir(), 'eva-alpha-files-'));
  try {
    const input = path.join(root, 'inputs');
    mkdirSync(input, { recursive: true });
    const files = {
      assurance: path.join(input, 'assurance.json'),
      receipt: path.join(input, 'materialization.json'),
      request: path.join(input, 'finisher-request.json'),
      candidate: path.join(input, 'candidate.png'),
      matte: path.join(input, 'alpha-matte.png'),
    };
    writeFileSync(files.assurance, `${JSON.stringify(value.candidateAssurance)}\n`, { mode: 0o600 });
    writeFileSync(files.receipt, `${JSON.stringify(value.provider.receipt)}\n`, { mode: 0o600 });
    writeFileSync(files.request, `${JSON.stringify(value.provider.request)}\n`, { mode: 0o600 });
    writeFileSync(files.candidate, value.candidateBytes, { mode: 0o600 });
    writeFileSync(files.matte, value.matteBytes, { mode: 0o600 });
    const args = [
      '--workspace-root', root,
      '--frame-id', FRAME_ID,
      '--candidate-assurance', files.assurance,
      '--provider-materialization', files.receipt,
      '--provider-finisher-request', files.request,
      '--candidate', files.candidate,
      '--candidate-path', CANDIDATE_PATH,
      '--alpha-matte', files.matte,
      '--alpha-matte-path', MATTE_PATH,
      '--alpha-matte-sha256', sha256EvaSourceRepairAlphaBytes(value.matteBytes),
      '--output', OUTPUT_PATH,
      '--actor-id', value.authorization.actorId,
      '--authorization-evidence-sha256', value.authorization.evidenceSha256,
      '--mastered-at', '2026-08-15T11:07:00.000Z',
    ];
    const invoke = () => runProjectArtEvaSourceRepairAlphaMasteringCli(args);
    const first = invoke();
    assert.equal(first.productionAlphaReady, true);
    assert.equal(first.candidateApproval, false);
    for (const filePath of Object.values(first.outputFiles)) {
      assert.equal(readFileSync(filePath).length > 0, true);
    }
    assert.throws(invoke, /EVA_SOURCE_REPAIR_ALPHA_OUTPUT_ALREADY_EXISTS/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
