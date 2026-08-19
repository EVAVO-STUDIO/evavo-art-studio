#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  compileEvaDenseMotionSourceFrameBundle,
  compileEvaDenseMotionSourceMaterializationPlan,
  evaDenseMotionSourceMaterializationCapabilities,
  publishEvaDenseMotionSourceFrameBundleFiles,
} from './project-art/eva-dense-motion-source-materialization.mjs';
import {
  gitBlobSha1,
} from './project-art/eva-dense-motion-source-preflight.mjs';
import {
  compileEvaDenseMotionTenMasterProgram,
  createEvaDenseMotionTenMasterRequest,
} from './project-art/eva-dense-motion-ten-master-program.mjs';

function pngHeader({ width = 1024, height = 1536, colorType = 6 } = {}) {
  const buffer = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = colorType;
  buffer[26] = 0;
  buffer[27] = 0;
  buffer[28] = 0;
  return buffer;
}

function fixtureJob(sourceBytes) {
  const frameRoot = 'workspaces/eva-source-fixture/frames/frame-01';
  return {
    jobId: 'master-eva-source-fixture-frame-01',
    ordinal: 1,
    frameId: 'eva-20260809-153620-frame-01',
    source: {
      repository: 'EVAVO-STUDIO/evavo-avatar-runtime',
      runtimeCommit: '1'.repeat(40),
      sourceTreeSha1: '2'.repeat(40),
      sourceContractSha256: '3'.repeat(64),
      sourceFamilySha256: '4'.repeat(64),
      path: 'assets/eva-female/fixture-frame-01.png',
      gitBlobSha1: gitBlobSha1(sourceBytes),
      readOnly: true,
      runtimeDeliveryAllowed: false,
    },
    canvas: { width: 1024, height: 1536 },
    outputs: {
      frameRoot,
      sourceMaterialization: `${frameRoot}/source.materialization.json`,
      sourceInspection: `${frameRoot}/source.inspection.json`,
      denseCandidate: `${frameRoot}/candidate.png`,
      candidateAssurance: `${frameRoot}/candidate.assurance.json`,
      alphaMatte: `${frameRoot}/alpha-matte.png`,
      alphaMatteReview: `${frameRoot}/alpha-matte.review.json`,
    },
  };
}

function canonicalProgram() {
  return compileEvaDenseMotionTenMasterProgram(
    createEvaDenseMotionTenMasterRequest({
      programId: 'eva-source-materialization-plan-fixture',
      actorId: 'eva-source-materialization-test',
      createdAt: '2026-08-20T01:00:00.000Z',
      outputRoot: 'workspaces/eva-source-materialization-plan-fixture',
    }),
  );
}

test('compiles a byte-for-byte source frame bundle without creating a candidate', () => {
  const sourceBytes = Buffer.concat([pngHeader(), Buffer.from('source-frame-fixture')]);
  const job = fixtureJob(sourceBytes);
  const bundle = compileEvaDenseMotionSourceFrameBundle({
    programSha256: 'a'.repeat(64),
    job,
    sourceBytes,
    materializedAt: '2026-08-20T01:01:00.000Z',
  });

  assert.equal(bundle.status, 'source-materialized-awaiting-candidate-production');
  assert.equal(bundle.receipt.output.path, `${job.outputs.frameRoot}/source.png`);
  assert.equal(bundle.receipt.output.byteForByteCopy, true);
  assert.equal(bundle.receipt.source.gitBlobSha1, job.source.gitBlobSha1);
  assert.equal(bundle.inspection.png.width, 1024);
  assert.equal(bundle.inspection.png.height, 1536);
  assert.equal(bundle.inspection.gates.candidateCreationAllowed, false);
  assert.equal(bundle.receipt.effects.candidatesCreated, 0);
  assert.equal(bundle.receipt.effects.alphaMastersCreated, 0);
  assert.match(bundle.inspection.inspectionSha256, /^[a-f0-9]{64}$/u);
  assert.match(bundle.receipt.materializationSha256, /^[a-f0-9]{64}$/u);
  assert.equal(bundle.sourceBytes.equals(sourceBytes), true);
});

test('publishes the source, inspection and completion receipt create-only', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'eva-source-publish-'));
  try {
    const sourceBytes = Buffer.concat([pngHeader(), Buffer.from('publish-fixture')]);
    const job = fixtureJob(sourceBytes);
    const bundle = compileEvaDenseMotionSourceFrameBundle({
      programSha256: 'b'.repeat(64),
      job,
      sourceBytes,
      materializedAt: '2026-08-20T01:02:00.000Z',
    });
    const published = publishEvaDenseMotionSourceFrameBundleFiles({
      workspaceRoot: root,
      job,
      bundle,
    });
    assert.equal(readFileSync(published.paths.source).equals(sourceBytes), true);
    assert.equal(
      JSON.parse(readFileSync(published.paths.inspection, 'utf8')).inspectionSha256,
      bundle.inspection.inspectionSha256,
    );
    assert.equal(
      JSON.parse(readFileSync(published.paths.materialization, 'utf8'))
        .materializationSha256,
      bundle.receipt.materializationSha256,
    );
    assert.throws(
      () =>
        publishEvaDenseMotionSourceFrameBundleFiles({
          workspaceRoot: root,
          job,
          bundle,
        }),
      /EVA_DENSE_SOURCE_MATERIALIZATION_OUTPUT_ALREADY_EXISTS/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects source bytes that do not match the bound Git blob identity', () => {
  const sourceBytes = Buffer.concat([pngHeader(), Buffer.from('identity-fixture')]);
  const job = fixtureJob(sourceBytes);
  job.source.gitBlobSha1 = '0'.repeat(40);
  assert.throws(
    () =>
      compileEvaDenseMotionSourceFrameBundle({
        programSha256: 'c'.repeat(64),
        job,
        sourceBytes,
        materializedAt: '2026-08-20T01:03:00.000Z',
      }),
    /EVA_DENSE_SOURCE_MATERIALIZATION_GIT_BLOB_MISMATCH/u,
  );
});

test('plans all ten canonical source frames before any write', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'eva-source-plan-'));
  try {
    const program = canonicalProgram();
    const plan = await compileEvaDenseMotionSourceMaterializationPlan({
      tenMasterProgram: program,
      runtimeRoot: '/not-read-by-plan-fixture',
      workspaceRoot: root,
      materializedAt: '2026-08-20T01:04:00.000Z',
      sourcePreflight: async ({ frames }) => ({
        ok: true,
        sourceFrameCount: 10,
        exactSourceIdentityVerified: true,
        exactCanvasVerified: true,
        allTenSourcesVerifiedBeforeMaterialization: true,
        sourceFrames: frames.map((frame, index) => ({
          ordinal: frame.ordinal,
          frameId: frame.frameId,
          relativePath: frame.relativePath,
          gitBlobSha1: frame.sourceGitBlobSha1,
          sha256: String(index).repeat(64),
          bytes: 1000 + index,
          width: 1024,
          height: 1536,
        })),
      }),
    });
    assert.equal(plan.status, 'ready-for-ten-source-frame-materialization');
    assert.equal(plan.frames.length, 10);
    assert.deepEqual(plan.frames.map((frame) => frame.ordinal), [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    assert.ok(plan.frames.every((frame) => frame.mode === 'execute-frame'));
    assert.equal(plan.policy.allTenSourcesPreflightBeforeFirstWrite, true);
    assert.equal(plan.policy.byteForByteCopy, true);
    assert.equal(plan.policy.candidateCreationAllowed, false);
    assert.equal(plan.policy.publicationAllowed, false);
    assert.equal(plan.policy.runtimeActivationAllowed, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('capabilities preserve every downstream authority boundary', () => {
  const capabilities = evaDenseMotionSourceMaterializationCapabilities();
  assert.equal(capabilities.exactTenSourceFrameCampaign, true);
  assert.equal(capabilities.allTenSourcesPreflightBeforeFirstWrite, true);
  assert.equal(capabilities.completedFrameBoundaryResumeSupported, true);
  assert.equal(capabilities.midFramePartialStateRejected, true);
  assert.equal(capabilities.completedCampaignReplayReverifiesSourceBytes, true);
  assert.equal(capabilities.candidateCreation, false);
  assert.equal(capabilities.alphaMastering, false);
  assert.equal(capabilities.cloudinaryUpload, false);
  assert.equal(capabilities.publication, false);
  assert.equal(capabilities.runtimeActivation, false);
});
