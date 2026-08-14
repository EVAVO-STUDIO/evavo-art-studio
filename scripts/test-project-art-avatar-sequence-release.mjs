#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  encodeAvatarProviderFramePng,
} from './project-art/avatar-final-pass-provider-frame-finisher.mjs';
import {
  AvatarSequenceReleaseError,
  avatarSequenceReleaseBasisSha256,
  avatarSequenceReleaseCapabilities,
  avatarSequenceTimingSha256,
  canonicalAvatarSequenceReleaseJson,
  sealAvatarSequenceReleaseFiles,
  sha256AvatarSequenceReleaseBytes,
  sha256AvatarSequenceReleaseDocument,
  withAvatarSequenceReleaseHash,
} from './project-art/avatar-sequence-release.mjs';
import {
  minimalAvatarSequenceMasteringPlan,
  REQUIRED_SEQUENCE_RELEASE_FAIL_CLOSED_CODES,
} from './project-art/avatar-sequence-release-fixture.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_PROTOCOL_VERSION = '2026-08-13.4';
const FRAME_FINISHER_PROTOCOL_VERSION = '2026-08-13.3';
const REVIEWED_AT = '2026-08-13T09:05:00.000Z';
const APPROVED_AT = '2026-08-13T09:10:00.000Z';
const SEALED_AT = '2026-08-13T09:30:00.000Z';
const REQUEST_AUTHORITY_KEYS = Object.freeze([
  'semanticAssignment',
  'sourceMutation',
  'sourceDeletion',
  'imageMutation',
  'providerExecution',
  'candidateApproval',
  'candidatePromotion',
  'sequenceRelease',
  'runtimeActivation',
  'repositoryMutation',
  'gitMutation',
  'deployment',
  'publication',
  'forcePush',
]);

function digest(character) {
  return character.repeat(64);
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function absoluteWorkspacePath(workspaceRoot, relativePath) {
  return path.join(workspaceRoot, ...relativePath.split('/'));
}

function writeWorkspaceBytes(workspaceRoot, relativePath, bytes) {
  const absolute = absoluteWorkspacePath(workspaceRoot, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true, mode: 0o700 });
  writeFileSync(absolute, bytes, { mode: 0o600 });
  return absolute;
}

function writeSealedDocument(
  workspaceRoot,
  relativePath,
  body,
  hashField,
) {
  const value = withAvatarSequenceReleaseHash(body, hashField);
  const bytes = jsonBytes(value);
  const absolute = writeWorkspaceBytes(workspaceRoot, relativePath, bytes);
  return Object.freeze({
    value,
    path: relativePath,
    absolute,
    bytes,
    fileSha256: sha256AvatarSequenceReleaseBytes(bytes),
    documentSha256: value[hashField],
  });
}

function allFalseAuthority() {
  return Object.fromEntries(REQUEST_AUTHORITY_KEYS.map((key) => [key, false]));
}

function expectReleaseError(code, action) {
  assert.throws(
    action,
    (error) => {
      assert.equal(error instanceof AvatarSequenceReleaseError, true);
      assert.equal(error.code, code);
      return true;
    },
  );
}

function createLoopEvidence(workspaceRoot, frame, status = 'passed') {
  const reviewId = 'eva-idle-loop-review-v1';
  const projectId = 'eva-female-avatar-sequence';
  const expected = {
    finalFramePath: frame.path,
    finalFrameSha256: frame.sha256,
    firstFramePath: frame.path,
    firstFrameSha256: frame.sha256,
  };
  const thresholds = {
    maximumChangedFraction: 0,
    maximumMeanChannelDelta: 0,
    maximumAlphaChangedFraction: 0,
    maximumCentroidShiftPixels: 0,
  };
  const request = {
    schema: 'evavo.project-art-loop-closure-request.v1',
    reviewId,
    projectId,
    expected,
    thresholds,
    frames: [{
      path: frame.path,
      expectedSha256: frame.sha256,
    }],
  };
  const plan = writeSealedDocument(
    workspaceRoot,
    'evidence/loops/idle-main/plan.json',
    {
      schema: 'evavo.project-art-loop-closure-plan.v1',
      reviewId,
      projectId,
      expected,
      thresholds,
      frames: request.frames.map((entry) => ({
        path: entry.path,
        sha256: entry.expectedSha256,
      })),
      authority: {},
    },
    'documentSha256',
  );
  const review = writeSealedDocument(
    workspaceRoot,
    'evidence/loops/idle-main/review.json',
    {
      schema: 'evavo.project-art-loop-closure-review.v1',
      reviewId,
      projectId,
      planSha256: plan.value.documentSha256,
      status,
      issues: status === 'passed' ? [] : ['final-to-first continuity failed'],
      creativeApprovalPerformed: false,
      runtimeApprovalPerformed: false,
      thresholds,
      metrics: {
        changedFraction: 0,
        meanChannelDelta: 0,
        alphaChangedFraction: 0,
        centroidShiftPixels: 0,
      },
      authority: {},
    },
    'documentSha256',
  );
  const receipt = writeSealedDocument(
    workspaceRoot,
    'evidence/loops/idle-main/receipt.json',
    {
      schema: 'evavo.project-art-loop-closure-receipt.v1',
      reviewId,
      projectId,
      planSha256: plan.value.documentSha256,
      reviewSha256: review.value.documentSha256,
      status: 'passed',
      sourceHashesRevalidatedBeforeExecution: true,
      sourceHashesRevalidatedAfterExecution: true,
      wholeRunAtomicPublication: true,
      outputs: [{
        role: 'loop-closure-review',
        path: review.path,
        sha256: review.fileSha256,
        bytes: review.bytes.byteLength,
      }],
      authority: {},
    },
    'documentSha256',
  );
  return Object.freeze({
    masteringEntry: {
      clipId: 'idle-main',
      request,
      requestCanonicalSha256: sha256AvatarSequenceReleaseDocument(request),
    },
    requestEntry: {
      clipId: 'idle-main',
      planPath: plan.path,
      planFileSha256: plan.fileSha256,
      planDocumentSha256: plan.documentSha256,
      reviewPath: review.path,
      reviewFileSha256: review.fileSha256,
      reviewDocumentSha256: review.documentSha256,
      receiptPath: receipt.path,
      receiptFileSha256: receipt.fileSha256,
      receiptDocumentSha256: receipt.documentSha256,
    },
    basisEntry: {
      clipId: 'idle-main',
      reviewDocumentSha256: review.documentSha256,
      receiptDocumentSha256: receipt.documentSha256,
    },
  });
}

function createReleaseFixture({
  approvalOccurredAt = APPROVED_AT,
  includeLoop = false,
  loopReviewStatus = 'passed',
  outcomeMutator = null,
  requestedTimingSha256 = null,
} = {}) {
  const workspaceRoot = mkdtempSync(
    path.join(os.tmpdir(), 'evavo-sequence-release-fixture-'),
  );
  const framePath = 'assets/eva-female/reviewed/idle-a.png';
  const pixels = Buffer.from([
    22, 60, 120, 255,
    0, 0, 0, 0,
    45, 90, 150, 255,
    0, 0, 0, 0,
  ]);
  const png = encodeAvatarProviderFramePng(2, 2, pixels);
  writeWorkspaceBytes(workspaceRoot, framePath, png);
  const frame = {
    id: 'idle-a',
    path: framePath,
    sha256: sha256AvatarSequenceReleaseBytes(png),
    bytes: png.byteLength,
    width: 2,
    height: 2,
  };

  const planInput = minimalAvatarSequenceMasteringPlan();
  planInput.workspace.root = workspaceRoot;
  planInput.runtimeDraft.canvas = { width: 2, height: 2 };
  planInput.runtimeDraft.frames = [frame];
  planInput.runtimeDraft.clips[0].frames = [{
    frameId: frame.id,
    durationMs: 120,
  }];
  planInput.runtimeDraft.clips[0].durationMs = 120;
  planInput.runtimeDraft.clips[0].neutralFrameId = frame.id;

  let loop = null;
  if (includeLoop) {
    loop = createLoopEvidence(workspaceRoot, frame, loopReviewStatus);
    planInput.runtimeDraft.clips[0].loopMode = 'loop';
    planInput.loopClosureRequests = [loop.masteringEntry];
    planInput.finalizationRequirements.loopReviewsRequired = 1;
  }

  const masteringPlan = writeSealedDocument(
    workspaceRoot,
    'plans/avatar-sequence-mastering-plan.json',
    planInput,
    'documentSha256',
  );

  const reviewRequest = writeSealedDocument(
    workspaceRoot,
    'evidence/frames/idle-a/review-request.json',
    {
      schema: 'evavo.project-art-avatar-final-pass-provider-frame-review-request.v1',
      protocolVersion: FRAME_FINISHER_PROTOCOL_VERSION,
      frameId: frame.id,
      characterId: planInput.characterId,
      reviewedTargetPath: frame.path,
      finishedFrame: {
        sha256: frame.sha256,
        bytes: frame.bytes,
        width: frame.width,
        height: frame.height,
      },
      finalSha256RequiredBeforeInbetweenOrSequenceUse: true,
      sequenceReleaseAllowed: false,
      runtimeActivationAllowed: false,
    },
    'reviewRequestSha256',
  );

  const reviewOutcomeBody = {
    schema: 'evavo.project-art-avatar-final-pass-provider-frame-review-outcome.v1',
    protocolVersion: FRAME_FINISHER_PROTOCOL_VERSION,
    status: 'final-frame-admitted',
    frameId: frame.id,
    characterId: planInput.characterId,
    reviewRequestSha256: reviewRequest.value.reviewRequestSha256,
    finishedFrame: {
      sha256: frame.sha256,
      bytes: frame.bytes,
      width: frame.width,
      height: frame.height,
    },
    finalFrameSha256: frame.sha256,
    dependentInbetweenEndpointAllowed: true,
    sequenceDraftUseAllowed: true,
    sequenceReleaseAllowed: false,
    runtimeActivationAllowed: false,
    reviewer: {
      actorClass: 'human',
      actorId: 'greg.parker',
      occurredAt: '2026-08-13T09:04:00.000Z',
      evidenceSha256: digest('4'),
    },
    reviewedAt: REVIEWED_AT,
    gates: {
      technical: 'pass',
      handsAndAnatomy: 'pass',
      faceIdentity: 'pass',
      silhouetteRegistration: 'pass',
      adjacentFrameContinuity: 'pass',
      loopClosure: includeLoop ? 'pass' : 'not-applicable',
    },
    evidence: {
      nativeScaleSha256: digest('5'),
      contactSheetSha256: digest('6'),
      identityReferenceSha256: digest('7'),
      adjacentFramesSha256: digest('8'),
      loopClosureSha256: includeLoop ? digest('9') : null,
    },
    authority: {
      namedHumanReviewEvidence: true,
      finalFrameHashAdmission: true,
    },
  };
  if (outcomeMutator) outcomeMutator(reviewOutcomeBody);
  const reviewOutcome = writeSealedDocument(
    workspaceRoot,
    'evidence/frames/idle-a/review-outcome.json',
    reviewOutcomeBody,
    'reviewOutcomeSha256',
  );

  const actualTimingSha256 = avatarSequenceTimingSha256(masteringPlan.value);
  const timingSha256 = requestedTimingSha256 ?? actualTimingSha256;
  const loopBasisEvidence = loop ? [loop.basisEntry] : [];
  const releaseBasisSha256 = avatarSequenceReleaseBasisSha256({
    plan: masteringPlan.value,
    loopEvidence: loopBasisEvidence,
    timingSha256,
  });
  const approvals = ['art', 'animation', 'runtime'].map((discipline, index) => ({
    discipline,
    actorClass: 'human',
    actorId: `greg.parker.${discipline}`,
    occurredAt: approvalOccurredAt,
    decision: 'approve-sequence-release',
    releaseBasisSha256,
    timingSha256,
    evidenceSha256: String(index + 1).repeat(64),
  }));
  const releaseId = 'eva-sequence-release-v1';
  const request = writeSealedDocument(
    workspaceRoot,
    'requests/eva-sequence-release.json',
    {
      schema: 'evavo.project-art-avatar-sequence-release-request.v1',
      protocolVersion: RELEASE_PROTOCOL_VERSION,
      releaseId,
      characterId: masteringPlan.value.characterId,
      revision: masteringPlan.value.revision,
      masteringPlan: {
        path: masteringPlan.path,
        fileSha256: masteringPlan.fileSha256,
        documentSha256: masteringPlan.documentSha256,
      },
      frameEvidence: [{
        frameId: frame.id,
        reviewRequestPath: reviewRequest.path,
        reviewRequestFileSha256: reviewRequest.fileSha256,
        reviewRequestSha256: reviewRequest.documentSha256,
        reviewOutcomePath: reviewOutcome.path,
        reviewOutcomeFileSha256: reviewOutcome.fileSha256,
        reviewOutcomeSha256: reviewOutcome.documentSha256,
      }],
      loopEvidence: loop ? [loop.requestEntry] : [],
      timingSha256,
      releaseBasisSha256,
      approvals,
      outputDirectory: `releases/${masteringPlan.value.characterId}/${releaseId}`,
      authority: allFalseAuthority(),
    },
    'requestSha256',
  );
  return Object.freeze({
    workspaceRoot,
    requestPath: request.path,
    sealedAt: SEALED_AT,
    outputDirectory: absoluteWorkspacePath(
      workspaceRoot,
      `releases/${masteringPlan.value.characterId}/${releaseId}`,
    ),
    actualTimingSha256,
    request,
  });
}

function sealFixture(fixture) {
  return sealAvatarSequenceReleaseFiles({
    workspaceRoot: fixture.workspaceRoot,
    requestPath: fixture.requestPath,
    sealedAt: fixture.sealedAt,
  });
}

test('reports bounded sequence release capabilities with all downstream authority false', () => {
  const capabilities = avatarSequenceReleaseCapabilities();
  assert.equal(capabilities.schema, 'evavo.project-art-avatar-sequence-release-capabilities.v1');
  assert.deepEqual(capabilities.tools, [
    'evavo_art_avatar_sequence_release_capabilities',
    'evavo_art_seal_avatar_sequence_release',
  ]);
  assert.equal(capabilities.requiredInputs.finalFrameAdmissionForEveryRuntimeFrame, true);
  assert.equal(capabilities.requiredInputs.passedLoopReceiptForEveryTrueLoop, true);
  assert.equal(capabilities.outputs.sealedSequenceRelease, true);
  assert.equal(capabilities.outputs.runtimeActivationAllowed, false);
  for (const key of [
    'imageBytesThroughMcp',
    'arbitraryShell',
    'semanticAssignment',
    'imageMutation',
    'providerExecution',
    'candidateApproval',
    'candidatePromotion',
    'sequenceReleaseSealing',
    'repositoryMutation',
    'gitPublication',
    'deployment',
    'publication',
    'runtimeActivation',
    'forcePush',
  ]) assert.equal(capabilities[key], false, `${key} must remain false`);
});

test('canonical JSON and document hashing ignore object insertion order', () => {
  const first = { z: 2, a: { y: 1, x: true } };
  const second = { a: { x: true, y: 1 }, z: 2 };
  assert.equal(canonicalAvatarSequenceReleaseJson(first), '{"a":{"x":true,"y":1},"z":2}');
  assert.equal(
    sha256AvatarSequenceReleaseDocument(first),
    sha256AvatarSequenceReleaseDocument(second),
  );
});

test('byte hashing uses exact SHA-256 content identity', () => {
  const bytes = Buffer.from('avatar-sequence-release\n', 'utf8');
  assert.equal(
    sha256AvatarSequenceReleaseBytes(bytes),
    createHash('sha256').update(bytes).digest('hex'),
  );
});

test('self-hashed documents remain deterministic and do not mutate their input', () => {
  const input = { schema: 'fixture.v1', value: 7 };
  const output = withAvatarSequenceReleaseHash(input, 'documentSha256');
  assert.equal('documentSha256' in input, false);
  assert.equal(
    output.documentSha256,
    sha256AvatarSequenceReleaseDocument(input),
  );
  assert.deepEqual(
    withAvatarSequenceReleaseHash(input, 'documentSha256'),
    output,
  );
});

test('timing hash is stable for the same owner-declared plan', () => {
  const plan = minimalAvatarSequenceMasteringPlan();
  assert.equal(avatarSequenceTimingSha256(plan), avatarSequenceTimingSha256(structuredClone(plan)));
});

test('timing hash changes when an owner-declared frame duration changes', () => {
  const first = minimalAvatarSequenceMasteringPlan();
  const second = minimalAvatarSequenceMasteringPlan();
  second.runtimeDraft.clips[0].frames[0].durationMs = 160;
  second.runtimeDraft.clips[0].durationMs = 160;
  assert.notEqual(avatarSequenceTimingSha256(first), avatarSequenceTimingSha256(second));
});

test('release basis binds exact frames, timing, defaults and loop evidence', () => {
  const first = minimalAvatarSequenceMasteringPlan();
  const timing = avatarSequenceTimingSha256(first);
  const basis = avatarSequenceReleaseBasisSha256({
    plan: first,
    loopEvidence: [],
    timingSha256: timing,
  });
  const second = minimalAvatarSequenceMasteringPlan();
  second.runtimeDraft.frames[0].sha256 = 'b'.repeat(64);
  assert.notEqual(
    basis,
    avatarSequenceReleaseBasisSha256({
      plan: second,
      loopEvidence: [],
      timingSha256: avatarSequenceTimingSha256(second),
    }),
  );
});

test('invalid inferred mastering plans fail closed through AvatarSequenceReleaseError', () => {
  const plan = minimalAvatarSequenceMasteringPlan();
  plan.assignment.mode = 'inferred';
  assert.throws(
    () => avatarSequenceTimingSha256(plan),
    (error) => {
      assert.equal(error instanceof AvatarSequenceReleaseError, true);
      assert.equal(error.code, 'AVATAR_SEQUENCE_RELEASE_MASTERING_PLAN_INVALID');
      return true;
    },
  );
});

test('malformed release request files fail closed before any output publication', () => {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), 'evavo-sequence-release-invalid-'));
  writeFileSync(path.join(workspaceRoot, 'request.json'), '{\n', { mode: 0o600 });
  assert.throws(
    () => sealAvatarSequenceReleaseFiles({
      workspaceRoot,
      requestPath: 'request.json',
      sealedAt: SEALED_AT,
    }),
    (error) => {
      assert.equal(error instanceof AvatarSequenceReleaseError, true);
      assert.equal(error.code, 'AVATAR_SEQUENCE_RELEASE_REQUEST_INVALID');
      return true;
    },
  );
});

test('non-admitted final frame evidence blocks sequence release', () => {
  const fixture = createReleaseFixture({
    outcomeMutator(outcome) {
      outcome.status = 'frame-repair-required';
      outcome.finalFrameSha256 = null;
      outcome.dependentInbetweenEndpointAllowed = false;
      outcome.sequenceDraftUseAllowed = false;
      outcome.authority.finalFrameHashAdmission = false;
    },
  });
  expectReleaseError(
    'AVATAR_SEQUENCE_RELEASE_FRAME_NOT_ADMITTED',
    () => sealFixture(fixture),
  );
});

test('failed true-loop review blocks sequence release', () => {
  const fixture = createReleaseFixture({
    includeLoop: true,
    loopReviewStatus: 'failed',
  });
  expectReleaseError(
    'AVATAR_SEQUENCE_RELEASE_LOOP_REVIEW_FAILED',
    () => sealFixture(fixture),
  );
});

test('caller-supplied timing hash must match the owner-declared mastering plan', () => {
  const fixture = createReleaseFixture({
    requestedTimingSha256: digest('f'),
  });
  assert.notEqual(fixture.actualTimingSha256, digest('f'));
  expectReleaseError(
    'AVATAR_SEQUENCE_RELEASE_TIMING_HASH_MISMATCH',
    () => sealFixture(fixture),
  );
});

test('release approval timestamps cannot postdate the seal', () => {
  const fixture = createReleaseFixture({
    approvalOccurredAt: '2026-08-13T09:31:00.000Z',
  });
  expectReleaseError(
    'AVATAR_SEQUENCE_RELEASE_APPROVAL_TIME_INVALID',
    () => sealFixture(fixture),
  );
});

test('partial or unexpected existing release bundles fail closed', () => {
  const fixture = createReleaseFixture();
  const first = sealFixture(fixture);
  assert.equal(first.reused, false);
  const replay = sealFixture(fixture);
  assert.equal(replay.reused, true);
  writeFileSync(
    path.join(fixture.outputDirectory, 'unexpected.txt'),
    'unexpected\n',
    { mode: 0o600 },
  );
  expectReleaseError(
    'AVATAR_SEQUENCE_RELEASE_EXISTING_BUNDLE_INVALID',
    () => sealFixture(fixture),
  );
});

test('permanent source retains all critical fail-closed release codes and admitted-frame status', () => {
  const source = readFileSync(
    path.join(root, 'scripts/project-art/avatar-sequence-release.mjs'),
    'utf8',
  );
  assert.equal(source.includes("'final-frame-admitted'"), true);
  for (const code of REQUIRED_SEQUENCE_RELEASE_FAIL_CLOSED_CODES) {
    assert.equal(source.includes(code), true, `core is missing ${code}`);
  }
});
