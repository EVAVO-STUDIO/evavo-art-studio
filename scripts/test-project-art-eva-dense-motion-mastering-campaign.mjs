#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  existsSync,
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
  encodeAvatarProviderFramePng,
} from './project-art/avatar-final-pass-provider-frame-finisher.mjs';
import {
  sha256Bytes,
} from './project-art/avatar-final-pass-provider-candidate-common.mjs';
import {
  compileEvaDenseMotionCandidateAssurance,
} from './project-art/eva-dense-motion-candidate-assurance.mjs';
import {
  compileEvaDenseMotionAlphaMasteringAuthorization,
  compileEvaDenseMotionAlphaMatteReview,
} from './project-art/eva-dense-motion-alpha-mastering.mjs';
import {
  compileEvaDenseMotionMasteringCampaignPlan,
  evaDenseMotionMasteringCampaignCapabilities,
  runEvaDenseMotionMasteringCampaign,
  verifyEvaDenseMotionMasteringCampaignReceipt,
} from './project-art/eva-dense-motion-mastering-campaign.mjs';
import {
  compileEvaDenseMotionTenMasterProgram,
  createEvaDenseMotionTenMasterRequest,
} from './project-art/eva-dense-motion-ten-master-program.mjs';

const WIDTH = 1024;
const HEIGHT = 1536;
const PIXELS = WIDTH * HEIGHT;
const HASHES = Object.freeze([
  '0'.repeat(64),
  '1'.repeat(64),
  '2'.repeat(64),
  '3'.repeat(64),
]);

function buildProgram() {
  return compileEvaDenseMotionTenMasterProgram(
    createEvaDenseMotionTenMasterRequest({
      programId: 'eva-dense-mastering-campaign-fixture',
      actorId: 'eva-dense-mastering-campaign-fixture',
      createdAt: '2026-08-20T00:10:00.000Z',
      outputRoot: 'workspaces/eva-dense-motion/campaign-fixture',
    }),
  );
}

function candidatePng(ordinal) {
  const pixels = Buffer.alloc(PIXELS * 4);
  const red = 24 + ordinal * 7;
  const green = 48 + ordinal * 5;
  const blue = 72 + ordinal * 3;
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    const offset = pixel * 4;
    pixels[offset] = red;
    pixels[offset + 1] = green;
    pixels[offset + 2] = blue;
    pixels[offset + 3] = 255;
  }
  return encodeAvatarProviderFramePng(WIDTH, HEIGHT, pixels);
}

function mattePng(ordinal) {
  const pixels = Buffer.alloc(PIXELS * 4);
  const inset = 160 + ordinal;
  const top = 88 + ordinal;
  const bottom = 1448 - ordinal;
  for (let y = top; y < bottom; y += 1) {
    for (let x = inset; x < WIDTH - inset; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = 255;
    }
  }
  return encodeAvatarProviderFramePng(WIDTH, HEIGHT, pixels);
}

function frameAssurance(frameId, sourceSha256, ordinal, confidence = 0.99) {
  return {
    schema: AVATAR_FRAME_ASSURANCE_SCHEMA,
    frameId,
    sourceSha256,
    checks: AVATAR_FRAME_ASSURANCE_CHECKS.map((check, checkIndex) => ({
      check,
      observations: [
        {
          inspectorId: 'campaign-inspector-alpha',
          inspectorVersion: 'fixture-1',
          applicability: 'visible',
          verdict: 'pass',
          confidence,
          evidenceSha256: HASHES[(ordinal + checkIndex) % HASHES.length],
          note: 'Campaign fixture independent inspection A.',
        },
        {
          inspectorId: 'campaign-inspector-beta',
          inspectorVersion: 'fixture-1',
          applicability: 'visible',
          verdict: 'pass',
          confidence,
          evidenceSha256: HASHES[(ordinal + checkIndex + 1) % HASHES.length],
          note: 'Campaign fixture independent inspection B.',
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

function absolute(root, relative) {
  return path.join(root, ...relative.split('/'));
}

function writeSemantic(root, relative, value) {
  const target = absolute(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(
    target,
    Buffer.isBuffer(value) ? value : `${JSON.stringify(value, null, 2)}\n`,
  );
  return target;
}

function authorizationRelative(job) {
  return `${job.outputs.frameRoot}/alpha-mastering.authorization.json`;
}

function finishedRelative(job) {
  return `${job.outputs.alphaMastered.slice(0, -4)}.finished.png`;
}

function prepareWorkspace(root) {
  const program = buildProgram();
  for (const job of program.production.jobs) {
    const candidate = candidatePng(job.ordinal);
    const candidateSha256 = sha256Bytes(candidate);
    writeSemantic(root, job.outputs.denseCandidate, candidate);
    const assurance = compileEvaDenseMotionCandidateAssurance({
      tenMasterProgram: program,
      ordinal: job.ordinal,
      candidateBytes: candidate,
      candidatePath: job.outputs.denseCandidate,
      frameAssurance: frameAssurance(job.frameId, candidateSha256, job.ordinal, 0.99),
      inspectedAt: '2026-08-20T00:11:00.000Z',
    });
    writeSemantic(root, job.outputs.candidateAssurance, assurance);

    const matte = mattePng(job.ordinal);
    const matteSha256 = sha256Bytes(matte);
    writeSemantic(root, job.outputs.alphaMatte, matte);
    const matteReview = compileEvaDenseMotionAlphaMatteReview({
      tenMasterProgram: program,
      ordinal: job.ordinal,
      candidateAssurance: assurance,
      alphaMatteSha256: matteSha256,
      reviewer: { actorClass: 'human', actorId: 'campaign-matte-reviewer' },
      evidenceSha256: HASHES[job.ordinal % HASHES.length],
      reviewedAt: '2026-08-20T00:12:00.000Z',
      gateResults: gateResults(),
    });
    writeSemantic(root, job.outputs.alphaMatteReview, matteReview);
    const authorization = compileEvaDenseMotionAlphaMasteringAuthorization({
      tenMasterProgram: program,
      ordinal: job.ordinal,
      candidateAssurance: assurance,
      alphaMatteReview: matteReview,
      actorId: 'campaign-alpha-authorizer',
      evidenceSha256: HASHES[(job.ordinal + 1) % HASHES.length],
      occurredAt: '2026-08-20T00:13:00.000Z',
      notAfter: '2026-08-20T06:13:00.000Z',
    });
    writeSemantic(root, authorizationRelative(job), authorization);
  }
  return program;
}

test('preflights all ten frames, executes sequentially, and rejects tampered replay bytes', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'eva-dense-mastering-campaign-'));
  try {
    const program = prepareWorkspace(root);
    const plan = await compileEvaDenseMotionMasteringCampaignPlan({
      tenMasterProgram: program,
      workspaceRoot: root,
      masteredAt: '2026-08-20T00:14:00.000Z',
      finishedAt: '2026-08-20T00:15:00.000Z',
    });
    assert.equal(plan.status, 'ready-for-ten-frame-deterministic-mastering');
    assert.equal(plan.frames.length, 10);
    assert.ok(plan.frames.every((frame) => frame.mode === 'execute-frame'));
    assert.equal(plan.policy.allPendingFramesAlphaPreflightBeforeFirstWrite, true);
    assert.equal(plan.policy.sequential, true);
    assert.equal(plan.policy.stopOnFirstFailure, true);
    assert.equal(plan.policy.completedCampaignReplayReverifiesFinishedFrameBytes, true);
    assert.equal(plan.policy.cloudinaryUploadAllowed, false);
    assert.equal(plan.policy.runtimeActivationAllowed, false);
    assert.equal(Object.values(plan.authority).filter((value) => value === true).length, 6);

    const result = await runEvaDenseMotionMasteringCampaign({
      tenMasterProgram: program,
      workspaceRoot: root,
      masteredAt: '2026-08-20T00:14:00.000Z',
      finishedAt: '2026-08-20T00:15:00.000Z',
    });
    assert.equal(result.status, 'succeeded-awaiting-technical-and-creative-review');
    assert.equal(result.reused, false);
    assert.equal(result.receipt.frames.length, 10);
    assert.equal(result.receipt.effects.alphaMastersPresent, 10);
    assert.equal(result.receipt.effects.frameFinisherBundlesPresent, 10);
    assert.equal(result.receipt.effects.frameExecutionReceiptsPresent, 10);
    assert.equal(result.receipt.effects.framesExecutedThisRun, 10);
    assert.equal(result.receipt.effects.framesReusedThisRun, 0);
    assert.equal(result.receipt.effects.technicalInspectionsCreated, 0);
    assert.equal(result.receipt.effects.creativeApprovalsCreated, 0);
    assert.equal(result.receipt.effects.cloudinaryUploadsPerformed, 0);
    assert.equal(result.receipt.effects.sequencesReleased, 0);
    assert.equal(result.receipt.effects.runtimeActivationsPerformed, 0);
    verifyEvaDenseMotionMasteringCampaignReceipt(result.receipt, program);

    const finishedHashes = new Set(result.receipt.frames.map((frame) => frame.finishedFrameSha256));
    assert.equal(finishedHashes.size, 10);
    for (const job of program.production.jobs) {
      assert.ok(existsSync(absolute(root, job.outputs.alphaMastered)));
      assert.ok(existsSync(absolute(root, job.outputs.alphaMasteringReceipt)));
      assert.ok(existsSync(absolute(root, job.outputs.frameFinisherReceipt)));
      assert.equal(existsSync(absolute(root, job.outputs.technicalInspection)), false);
      assert.equal(existsSync(absolute(root, job.outputs.creativeApproval)), false);
      assert.equal(existsSync(absolute(root, job.outputs.cloudinaryUploadReceipt)), false);
      assert.equal(existsSync(absolute(root, job.outputs.runtimeFrameEvidence)), false);
    }

    const replay = await runEvaDenseMotionMasteringCampaign({
      tenMasterProgram: program,
      workspaceRoot: root,
      masteredAt: '2026-08-20T00:14:00.000Z',
      finishedAt: '2026-08-20T00:15:00.000Z',
    });
    assert.equal(replay.reused, true);
    assert.equal(replay.completedFrameEvidenceReverified, true);
    assert.equal(
      replay.receipt.campaignReceiptSha256,
      result.receipt.campaignReceiptSha256,
    );

    const firstFinished = absolute(root, finishedRelative(program.production.jobs[0]));
    const tampered = Buffer.from(readFileSync(firstFinished));
    tampered[Math.max(8, tampered.length - 16)] ^= 0x01;
    writeFileSync(firstFinished, tampered);
    await assert.rejects(
      () => runEvaDenseMotionMasteringCampaign({
        tenMasterProgram: program,
        workspaceRoot: root,
        masteredAt: '2026-08-20T00:14:00.000Z',
        finishedAt: '2026-08-20T00:15:00.000Z',
      }),
      /EVA_DENSE_MASTERING_COMPLETED_FRAME_BYTES_INVALID/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a late bad frame prevents the campaign from writing frame one', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'eva-dense-mastering-preflight-'));
  try {
    const program = buildProgram();
    for (const job of program.production.jobs) {
      const candidate = candidatePng(job.ordinal);
      const assurance = compileEvaDenseMotionCandidateAssurance({
        tenMasterProgram: program,
        ordinal: job.ordinal,
        candidateBytes: candidate,
        candidatePath: job.outputs.denseCandidate,
        frameAssurance: frameAssurance(
          job.frameId,
          sha256Bytes(candidate),
          job.ordinal,
          0.99,
        ),
        inspectedAt: '2026-08-20T00:11:00.000Z',
      });
      writeSemantic(root, job.outputs.denseCandidate, candidate);
      writeSemantic(root, job.outputs.candidateAssurance, assurance);
      const matte = mattePng(job.ordinal);
      writeSemantic(root, job.outputs.alphaMatte, matte);
      const matteReview = compileEvaDenseMotionAlphaMatteReview({
        tenMasterProgram: program,
        ordinal: job.ordinal,
        candidateAssurance: assurance,
        alphaMatteSha256: sha256Bytes(matte),
        reviewer: { actorClass: 'human', actorId: 'campaign-matte-reviewer' },
        evidenceSha256: HASHES[job.ordinal % HASHES.length],
        reviewedAt: '2026-08-20T00:12:00.000Z',
        gateResults: gateResults(),
      });
      writeSemantic(root, job.outputs.alphaMatteReview, matteReview);
      const authorization = compileEvaDenseMotionAlphaMasteringAuthorization({
        tenMasterProgram: program,
        ordinal: job.ordinal,
        candidateAssurance: assurance,
        alphaMatteReview: matteReview,
        actorId: 'campaign-alpha-authorizer',
        evidenceSha256: HASHES[(job.ordinal + 1) % HASHES.length],
        occurredAt: '2026-08-20T00:13:00.000Z',
        notAfter: job.ordinal === 10
          ? '2026-08-20T00:13:30.000Z'
          : '2026-08-20T06:13:00.000Z',
      });
      writeSemantic(root, authorizationRelative(job), authorization);
    }

    await assert.rejects(
      () => runEvaDenseMotionMasteringCampaign({
        tenMasterProgram: program,
        workspaceRoot: root,
        masteredAt: '2026-08-20T00:14:00.000Z',
        finishedAt: '2026-08-20T00:15:00.000Z',
      }),
      /EVA_DENSE_ALPHA_AUTHORIZATION_EXPIRED/u,
    );
    assert.equal(
      existsSync(absolute(root, program.production.jobs[0].outputs.alphaMastered)),
      false,
    );
    assert.equal(
      existsSync(absolute(root, program.production.jobs[0].outputs.frameFinisherReceipt)),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('campaign capabilities preserve review, publication and runtime boundaries', () => {
  const capabilities = evaDenseMotionMasteringCampaignCapabilities();
  assert.equal(capabilities.exactTenFrameCampaign, true);
  assert.equal(capabilities.allPendingFramesAlphaPreflightBeforeFirstWrite, true);
  assert.equal(capabilities.completedFrameBoundaryResumeSupported, true);
  assert.equal(capabilities.midFramePartialStateRejected, true);
  assert.equal(capabilities.resumedFrameBytesReverifiedBySha256, true);
  assert.equal(capabilities.completedCampaignReplayReverifiesFinishedFrameBytes, true);
  assert.equal(capabilities.technicalInspectionExecution, false);
  assert.equal(capabilities.creativeReviewExecution, false);
  assert.equal(capabilities.cloudinaryUpload, false);
  assert.equal(capabilities.sequenceRelease, false);
  assert.equal(capabilities.runtimeActivation, false);
});
