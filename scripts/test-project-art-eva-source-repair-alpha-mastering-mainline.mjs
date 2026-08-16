#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  compileEvaSourceRepairAlphaMastering,
  compileEvaSourceRepairAlphaMasteringFiles,
  evaSourceRepairAlphaMasteringCapabilities,
  sha256EvaSourceRepairAlphaBytes,
  sha256EvaSourceRepairAlphaDocument,
  verifyEvaSourceRepairAlphaMasteringDocument,
} from './project-art/eva-source-repair-alpha-mastering.mjs';
import {
  encodeAvatarProviderFramePng,
  finishAvatarFinalPassProviderFrame,
} from './project-art/avatar-final-pass-provider-frame-finisher.mjs';
import {
  inspectAvatarProviderCandidatePng,
} from './project-art/avatar-final-pass-provider-candidate-png.mjs';

const WIDTH = 1024;
const HEIGHT = 1536;
const PIXELS = WIDTH * HEIGHT;
const FRAME_ID = 'eva-20260809-153620-frame-05';
const CANDIDATE_PATH = `scratch/avatar-final-pass/eva-source-repair-v1/${FRAME_ID}/candidate-01.png`;
const MATTE_PATH = `scratch/avatar-final-pass/eva-source-repair-v1/${FRAME_ID}/alpha-matte.png`;
const OUTPUT_PATH = `scratch/avatar-final-pass/eva-source-repair-v1/${FRAME_ID}/candidate-01.alpha-mastered.png`;
const MATERIALIZED_AT = '2026-08-15T11:05:00.000Z';
const MASTERED_AT = '2026-08-15T11:08:00.000Z';

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
    pixels[offset] = (pixel * 7) & 0xff;
    pixels[offset + 1] = (pixel * 11) & 0xff;
    pixels[offset + 2] = (pixel * 13) & 0xff;
    pixels[offset + 3] = 255;
  }
  return pixels;
}

function mattePixels() {
  const pixels = Buffer.alloc(PIXELS * 4);
  for (let y = 300; y < 1240; y += 1) {
    for (let x = 270; x < 760; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      const alpha = x === 270 || x === 759 || y === 300 || y === 1239 ? 128 : 255;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = alpha;
    }
  }
  return pixels;
}

function falseMap(keys) {
  return Object.fromEntries(keys.map((key) => [key, false]));
}

function assurance(candidateSha256) {
  const body = {
    schema: 'evavo.project-art-eva-source-repair-candidate-assurance.v1',
    phase: 'post-provider-source-space-candidate',
    frameId: FRAME_ID,
    taskId: 'repair-eva-153620-05',
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
  const png = inspectAvatarProviderCandidatePng(candidateBytes, WIDTH, HEIGHT, {
    requireTransparentPixels: false,
  });
  const materializationId = 'avatar-candidate-materialization:fixture';
  const candidateArtifactId = `artifact_${'1'.repeat(64)}`;
  const evidenceArtifactId = `artifact_${'2'.repeat(64)}`;
  const requestBody = {
    schema: 'evavo.project-art-avatar-final-pass-provider-candidate-finisher-request.v1',
    protocolVersion: '2026-08-13.2',
    requestId: 'avatar-finisher:fixture',
    materializationId,
    createdAt: MATERIALIZED_AT,
    sourceCommit: '3'.repeat(40),
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
      visiblePixels: png.visiblePixels,
      transparentPixels: png.transparentPixels,
      partialAlphaPixels: png.partialAlphaPixels,
      hiddenRgbTransparentPixels: png.hiddenRgbTransparentPixels,
      edgeVisiblePixels: png.edgeVisiblePixels,
      visibleBounds: png.visibleBounds,
      artifactId: candidateArtifactId,
      artifactDescriptorSha256: '4'.repeat(64),
      evidenceArtifactId,
      evidenceDescriptorSha256: '5'.repeat(64),
      runtimeOutcomeSha256: '6'.repeat(64),
    },
    reviewedTargetPath: `workfiles/eva-source-repairs/v1/source-candidates/${FRAME_ID}.png`,
    requiredOperations: [
      'clear-hidden-rgb-under-fully-transparent-pixels',
      'preserve-canonical-canvas-and-registration',
      'run-avatar-frame-finisher',
      'run-native-scale-and-contact-sheet-inspection',
      'rerun-sequence-and-final-to-first-loop-closure-after-admission',
    ],
    requiredReviewGates: [
      'technical',
      'hands-and-anatomy',
      'face-identity',
      'silhouette-and-registration',
      'adjacent-frame-continuity',
      'final-to-first-loop-closure-when-applicable',
    ],
    finalSha256RequiredBeforeInbetweenOrSequenceUse: true,
    candidateApproval: false,
    candidatePromotion: false,
    runtimeActivationAllowed: false,
    authority: falseMap([
      'sourceMutation', 'sourceDeletion', 'deterministicQa', 'creativeReview',
      'candidateApproval', 'candidatePromotion', 'targetRepositoryMutation',
      'gitMutation', 'deployment', 'publication', 'runtimeActivation', 'forcePush',
    ]),
  };
  const request = selfHash(requestBody, 'finisherRequestSha256');
  const receiptBody = {
    schema: 'evavo.project-art-avatar-final-pass-provider-candidate-materialization.v1',
    protocolVersion: '2026-08-13.2',
    status: 'candidate-materialized-awaiting-frame-finisher',
    materializationId,
    materializedAt: MATERIALIZED_AT,
    sourceCommit: '3'.repeat(40),
    source: {
      runtimeDispatchSha256: '7'.repeat(64),
      runtimeBindingSha256: '8'.repeat(64),
      runtimeOutcomeSha256: '6'.repeat(64),
      providerRequestId: `provider_${'9'.repeat(40)}`,
      providerRequestSha256: 'a'.repeat(64),
      compiledPromptSha256: 'b'.repeat(64),
      candidateArtifactId,
      candidateArtifactDescriptorSha256: '4'.repeat(64),
      evidenceArtifactId,
      evidenceArtifactDescriptorSha256: '5'.repeat(64),
      providerEvidenceContentSha256: 'c'.repeat(64),
    },
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
    png,
    authorization: {
      action: 'materialize-unapproved-provider-candidate',
      actorClass: 'human',
      actorId: 'provider-candidate-reviewer',
      occurredAt: '2026-08-15T11:04:00.000Z',
      evidenceSha256: 'd'.repeat(64),
    },
    finisherHandoff: {
      path: 'scratch/provider.finisher-request.json',
      finisherRequestSha256: request.finisherRequestSha256,
    },
    requiredNextSteps: [
      'rerun-avatar-frame-finisher',
      'review-hands-anatomy-face-identity-and-continuity',
      'record-final-reviewed-frame-sha256',
      'rerun-animation-timing-and-loop-closure',
      'admit-frame-to-dependent-inbetween-or-sequence-only-after-review',
    ],
    approvals: {
      technical: false,
      creative: false,
      anatomy: false,
      identity: false,
      continuity: false,
      loop: false,
      runtime: false,
      publication: false,
    },
    authority: {
      artifactRead: true,
      evidenceRead: true,
      candidateMaterialization: true,
      receiptPersistence: true,
      finisherRequestPersistence: true,
      alphaExtraction: false,
      deterministicQa: false,
      creativeReview: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      runtimeActivation: false,
      forcePush: false,
    },
  };
  return { request, receipt: selfHash(receiptBody, 'materializationSha256') };
}

function fixture() {
  const candidateBytes = encodeAvatarProviderFramePng(WIDTH, HEIGHT, sourcePixels());
  const matteBytes = encodeAvatarProviderFramePng(WIDTH, HEIGHT, mattePixels());
  const candidateAssurance = assurance(sha256EvaSourceRepairAlphaBytes(candidateBytes));
  const provider = providerSource(candidateBytes);
  return {
    frameId: FRAME_ID,
    candidateAssurance,
    providerMaterializationReceipt: provider.receipt,
    providerFinisherRequest: provider.request,
    sourceSpaceCandidateBytes: candidateBytes,
    sourceSpaceCandidatePath: CANDIDATE_PATH,
    alphaMatteBytes: matteBytes,
    alphaMattePath: MATTE_PATH,
    expectedAlphaMatteSha256: sha256EvaSourceRepairAlphaBytes(matteBytes),
    outputPath: OUTPUT_PATH,
    authorization: {
      action: 'apply-production-alpha-once',
      actorClass: 'human',
      actorId: 'eva-alpha-matte-reviewer',
      occurredAt: '2026-08-15T11:07:00.000Z',
      evidenceSha256: sha256EvaSourceRepairAlphaBytes(Buffer.from('alpha-matte-review-evidence')),
      frameId: FRAME_ID,
      candidateAssuranceSha256: candidateAssurance.assuranceSha256,
      alphaMatteSha256: sha256EvaSourceRepairAlphaBytes(matteBytes),
    },
    masteredAt: MASTERED_AT,
  };
}

function rehash(value, field) {
  const body = structuredClone(value);
  delete body[field];
  return selfHash(body, field);
}

function mutateProvider(input, mutateRequest, mutateReceipt) {
  const next = structuredClone(input);
  mutateRequest?.(next.providerFinisherRequest);
  next.providerFinisherRequest = rehash(next.providerFinisherRequest, 'finisherRequestSha256');
  next.providerMaterializationReceipt.finisherHandoff.finisherRequestSha256 =
    next.providerFinisherRequest.finisherRequestSha256;
  mutateReceipt?.(next.providerMaterializationReceipt);
  next.providerMaterializationReceipt = rehash(
    next.providerMaterializationReceipt,
    'materializationSha256',
  );
  return next;
}

function writeFileFixture(root) {
  const value = fixture();
  const inputRoot = path.join(root, 'inputs');
  mkdirSync(inputRoot, { recursive: true });
  const files = {
    assurance: path.join(inputRoot, 'assurance.json'),
    receipt: path.join(inputRoot, 'materialization.json'),
    request: path.join(inputRoot, 'finisher-request.json'),
    candidate: path.join(inputRoot, 'candidate.png'),
    matte: path.join(inputRoot, 'alpha-matte.png'),
  };
  writeFileSync(files.assurance, `${JSON.stringify(value.candidateAssurance)}\n`, { mode: 0o600 });
  writeFileSync(files.receipt, `${JSON.stringify(value.providerMaterializationReceipt)}\n`, { mode: 0o600 });
  writeFileSync(files.request, `${JSON.stringify(value.providerFinisherRequest)}\n`, { mode: 0o600 });
  writeFileSync(files.candidate, value.sourceSpaceCandidateBytes, { mode: 0o600 });
  writeFileSync(files.matte, value.alphaMatteBytes, { mode: 0o600 });
  return {
    value,
    files,
    input: {
      workspaceRoot: root,
      frameId: FRAME_ID,
      candidateAssuranceFile: files.assurance,
      providerMaterializationReceiptFile: files.receipt,
      providerFinisherRequestFile: files.request,
      sourceSpaceCandidateFile: files.candidate,
      sourceSpaceCandidatePath: CANDIDATE_PATH,
      alphaMatteFile: files.matte,
      alphaMattePath: MATTE_PATH,
      expectedAlphaMatteSha256: value.expectedAlphaMatteSha256,
      outputPath: OUTPUT_PATH,
      authorization: value.authorization,
      masteredAt: MASTERED_AT,
    },
  };
}

test('strict mainline boundary compiles one source-space candidate into production alpha', () => {
  const result = compileEvaSourceRepairAlphaMastering(fixture());
  assert.equal(result.status, 'alpha-mastered-awaiting-frame-finisher');
  assert.equal(result.report.comparison.visibleRgbMismatches, 0);
  assert.equal(result.report.comparison.alphaPlaneMatchesMatte, true);
  assert.equal(result.report.output.hiddenRgbTransparentPixels, 0);
  assert.equal(result.report.gates.candidateApproval, false);
  assert.equal(result.report.gates.candidatePromotion, false);
  assert.equal(result.report.gates.runtimeActivationAllowed, false);
  assert.equal(verifyEvaSourceRepairAlphaMasteringDocument(result.report).alphaMasteringSha256, result.report.alphaMasteringSha256);
  const capabilities = evaSourceRepairAlphaMasteringCapabilities();
  assert.equal(capabilities.inputSnapshotsBeforeExecution, true);
  assert.equal(capabilities.directSymlinkInputsRejected, true);
  assert.equal(capabilities.workspaceRootSymlinkRejected, true);
  assert.equal(capabilities.alphaAssociation, 'straight');
  assert.equal(capabilities.premultiplied, false);
});

test('rehashed provider authority, byte-count, commit and chronology drift fail closed', () => {
  const base = fixture();
  assert.throws(() => compileEvaSourceRepairAlphaMastering(mutateProvider(
    base,
    (request) => { request.authority.candidateApproval = true; },
  )));
  assert.throws(() => compileEvaSourceRepairAlphaMastering(mutateProvider(
    base,
    (request) => { request.sourceCandidate.bytes += 1; },
  )));
  assert.throws(() => compileEvaSourceRepairAlphaMastering(mutateProvider(
    base,
    (request) => { request.sourceCommit = 'f'.repeat(40); },
  )));
  assert.throws(() => compileEvaSourceRepairAlphaMastering(mutateProvider(
    base,
    (request) => { request.createdAt = '2026-08-15T11:09:00.000Z'; },
    (receipt) => { receipt.materializedAt = '2026-08-15T11:09:00.000Z'; },
  )));
  assert.throws(() => compileEvaSourceRepairAlphaMastering(mutateProvider(
    base,
    (request) => { request.unexpectedAuthority = false; },
  )));
  assert.throws(() => compileEvaSourceRepairAlphaMastering(mutateProvider(
    base,
    undefined,
    (receipt) => { receipt.source.candidateArtifactDescriptorSha256 = 'e'.repeat(64); },
  )));
});

test('freshly rehashed report authority and unknown top-level fields fail closed', () => {
  const report = compileEvaSourceRepairAlphaMastering(fixture()).report;
  const escalated = structuredClone(report);
  escalated.authority.candidateApproval = true;
  assert.throws(() => verifyEvaSourceRepairAlphaMasteringDocument(
    rehash(escalated, 'alphaMasteringSha256'),
  ));
  const widened = structuredClone(report);
  widened.unexpected = false;
  assert.throws(() => verifyEvaSourceRepairAlphaMasteringDocument(
    rehash(widened, 'alphaMasteringSha256'),
  ));
});

test('file operator snapshots exact inputs, publishes atomically and remains frame-finisher compatible', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'eva-alpha-mainline-'));
  try {
    const written = writeFileFixture(root);
    const result = compileEvaSourceRepairAlphaMasteringFiles(written.input);
    assert.equal(result.status, 'alpha-mastered-awaiting-frame-finisher');
    assert.equal(
      readdirSync(root).some((entry) => entry.startsWith('.eva-alpha-input-')),
      false,
    );
    for (const filePath of Object.values(result.outputFiles)) {
      assert.equal(readFileSync(filePath).byteLength > 0, true);
    }
    const finished = finishAvatarFinalPassProviderFrame({
      workspaceRoot: root,
      materializationReceipt: result.materializationReceipt,
      finisherRequest: result.finisherRequest,
      finishedAt: '2026-08-15T11:09:00.000Z',
    });
    assert.equal(finished.report.preservation.visiblePixelsUnchanged, true);
    assert.equal(finished.report.output.hiddenRgbTransparentPixels, 0);
    assert.equal(finished.report.approvals.creative, false);
    assert.throws(
      () => compileEvaSourceRepairAlphaMasteringFiles(written.input),
      /EVA_SOURCE_REPAIR_ALPHA_OUTPUT_ALREADY_EXISTS/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('file operator rejects a direct symlinked candidate before processing', (context) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'eva-alpha-symlink-'));
  try {
    const written = writeFileFixture(root);
    const linkedCandidate = path.join(root, 'inputs', 'candidate-link.png');
    try {
      symlinkSync(written.files.candidate, linkedCandidate, 'file');
    } catch (error) {
      if (error?.code === 'EPERM' || error?.code === 'EACCES') {
        context.skip('The current platform does not permit test symlink creation.');
        return;
      }
      throw error;
    }
    assert.throws(
      () => compileEvaSourceRepairAlphaMasteringFiles({
        ...written.input,
        sourceSpaceCandidateFile: linkedCandidate,
      }),
      /EVA_SOURCE_REPAIR_ALPHA_INPUT_FILE_INVALID/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
