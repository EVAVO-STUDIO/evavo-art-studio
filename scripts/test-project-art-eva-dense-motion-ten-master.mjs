#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runEvaDenseMotionTenMasterCompiler } from './compile-project-art-eva-dense-motion-ten-master.mjs';
import {
  EVA_DENSE_MOTION_FALLBACK_REMASTER_ORDINALS,
  EVA_DENSE_MOTION_FINAL_MASTER_ORDINALS,
  EVA_DENSE_MOTION_TARGET_RUNTIME,
  compileEvaDenseMotionTenMasterProgram,
  createEvaDenseMotionTenMasterRequest,
  evaDenseMotionTenMasterCapabilities,
  inspectEvaDenseMotionTenMasterProgram,
  verifyEvaDenseMotionTenMasterProgram,
} from './project-art/eva-dense-motion-ten-master-program.mjs';
import {
  sha256EvaDenseMotionWorkOrderDocument,
} from './project-art/eva-dense-motion-work-order-common.mjs';

function request() {
  return createEvaDenseMotionTenMasterRequest({
    programId: 'eva-dense-ten-master-test-v2',
    actorId: 'eva-dense-ten-master-test',
    createdAt: '2026-08-19T13:30:00.000Z',
  });
}

function rehashProgram(program) {
  const body = { ...program };
  delete body.programSha256;
  program.programSha256 = sha256EvaDenseMotionWorkOrderDocument(body);
  return program;
}

test('compiles ten new deterministic master jobs while retaining the live three-frame rig only as fallback provenance', () => {
  const program = compileEvaDenseMotionTenMasterProgram(request());
  assert.equal(program.schema, 'evavo.project-art-eva-dense-motion-ten-master-program.v2');
  assert.deepEqual(EVA_DENSE_MOTION_FALLBACK_REMASTER_ORDINALS, [4, 5, 6]);
  assert.equal(program.production.requiredNewMasterCount, 10);
  assert.equal(program.production.jobCount, 10);
  assert.deepEqual(program.production.requiredFinalOrdinals, EVA_DENSE_MOTION_FINAL_MASTER_ORDINALS);
  assert.deepEqual(program.production.fallbackRemasterOrdinals, EVA_DENSE_MOTION_FALLBACK_REMASTER_ORDINALS);
  assert.equal(program.production.fallbackRemasterCount, 3);
  assert.deepEqual(program.production.newOnlyMasterOrdinals, [1, 2, 3, 7, 8, 9, 10]);
  assert.equal(program.production.newOnlyMasterCount, 7);
  assert.equal(program.production.existingFallbackMasterMayBeFinal, false);
  assert.equal(program.production.partialPromotionAllowed, false);
  assert.equal(program.production.mixedOldAndNewFamilyMayBePromoted, false);
  assert.equal(program.supersedes.legacyEvidenceRemainsImmutable, true);
  assert.equal(program.supersedes.legacyThreeFrameRuntimeRemainsLiveUntilAtomicActivation, true);
  assert.equal(program.targetRuntime.packageVersion, '0.38.0');
  assert.equal(program.targetRuntime.commit, EVA_DENSE_MOTION_TARGET_RUNTIME.commit);
  assert.equal(program.continuity.requiredEdgeCount, 10);
  assert.deepEqual(program.continuity.finalToFirstEdge, { fromOrdinal: 10, toOrdinal: 1 });
  assert.equal(program.releaseGates.allTenNewDenseMastersProduced, false);
  assert.equal(program.releaseGates.runtimeActivationApproved, false);
  assert.ok(Object.values(program.authority).every((value) => value === false));

  const publicIds = new Set();
  for (const job of program.production.jobs) {
    assert.equal(job.finalMasterPolicy.newDeterministicMasterRequired, true);
    assert.equal(job.finalMasterPolicy.targetAssetIdMustBeNew, true);
    assert.equal(job.finalMasterPolicy.targetSha256MustBeNew, true);
    assert.equal(job.cloudinary.createOnly, true);
    assert.equal(job.cloudinary.overwrite, false);
    assert.match(
      job.cloudinary.publicId,
      /^evavo\/avatar-runtime\/eva-female\/dense-motion\/eva-20260809-153620-frame-(?:0[1-9]|10)-master-v1$/u,
    );
    assert.ok(!job.cloudinary.publicId.includes('/identity-motion-v3/'));
    assert.equal(publicIds.has(job.cloudinary.publicId), false);
    publicIds.add(job.cloudinary.publicId);
    if ([4, 5, 6].includes(job.ordinal)) {
      assert.equal(job.productionRole, 'current-fallback-remaster-required');
      assert.equal(job.legacyFallback.retainedUntilAtomicTenMasterActivation, true);
      assert.equal(job.legacyFallback.maySatisfyFinalMasterGate, false);
      assert.match(job.legacyFallback.currentMaster.publicId, /identity-motion-v3/u);
      assert.notEqual(
        job.cloudinary.publicId,
        job.legacyFallback.currentMaster.publicId,
      );
    } else {
      assert.equal(job.productionRole, 'new-dense-master-required');
      assert.equal(job.legacyFallback, null);
    }
  }
  assert.equal(publicIds.size, 10);
  assert.match(program.programSha256, /^[a-f0-9]{64}$/u);
  assert.equal(
    compileEvaDenseMotionTenMasterProgram(request()).programSha256,
    program.programSha256,
  );
  assert.equal(verifyEvaDenseMotionTenMasterProgram(program).programSha256, program.programSha256);
});

test('status and capabilities refuse partial release or legacy fallback promotion', () => {
  const program = compileEvaDenseMotionTenMasterProgram(request());
  const status = inspectEvaDenseMotionTenMasterProgram(program);
  const capabilities = evaDenseMotionTenMasterCapabilities();
  assert.equal(status.requiredNewMasterCount, 10);
  assert.equal(status.currentFallbackCount, 3);
  assert.equal(status.fallbackRemasterCount, 3);
  assert.equal(status.masteredCount, 0);
  assert.equal(status.releaseReady, false);
  assert.equal(status.runtimeActivationReady, false);
  assert.ok(status.blockingCodes.includes('EVA_DENSE_MOTION_TEN_NEW_MASTERS_REQUIRED'));
  assert.equal(capabilities.exactTenNewMasterJobs, true);
  assert.equal(capabilities.legacyFallbackMaySatisfyFinalMasterGate, false);
  assert.equal(capabilities.atomicTenMasterActivationRequired, true);
  assert.equal(capabilities.partialPromotionAllowed, false);
  assert.equal(capabilities.providerExecution, false);
  assert.equal(capabilities.cloudinaryUpload, false);
  assert.equal(capabilities.runtimeActivation, false);
});

test('verification rejects a tampered job that reuses the legacy fallback public id', () => {
  const program = compileEvaDenseMotionTenMasterProgram(request());
  const tampered = structuredClone(program);
  const frame4 = tampered.production.jobs.find((job) => job.ordinal === 4);
  frame4.cloudinary.publicId = frame4.legacyFallback.currentMaster.publicId;
  assert.throws(
    () => verifyEvaDenseMotionTenMasterProgram(tampered),
    /EVA_DENSE_MOTION_TEN_MASTER_PROGRAM_INVALID/u,
  );
});

test('verification rejects self-hashed canonical source and Runtime substitutions', () => {
  const sourceTampered = structuredClone(
    compileEvaDenseMotionTenMasterProgram(request()),
  );
  sourceTampered.production.jobs[0].source.path =
    'assets/eva-female/substituted-frame.png';
  sourceTampered.production.jobs[0].source.gitBlobSha1 = '0'.repeat(40);
  rehashProgram(sourceTampered);
  assert.throws(
    () => verifyEvaDenseMotionTenMasterProgram(sourceTampered),
    /EVA_DENSE_MOTION_TEN_MASTER_PROGRAM_CONTENT_DRIFT/u,
  );

  const runtimeTampered = structuredClone(
    compileEvaDenseMotionTenMasterProgram(request()),
  );
  runtimeTampered.targetRuntime.commit = '0'.repeat(40);
  rehashProgram(runtimeTampered);
  assert.throws(
    () => verifyEvaDenseMotionTenMasterProgram(runtimeTampered),
    /EVA_DENSE_MOTION_TEN_MASTER_PROGRAM_CONTENT_DRIFT/u,
  );
});

test('create-only CLI writes a verified ten-master program and refuses overwrite', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'evavo-eva-ten-master-'));
  try {
    const output = path.join(root, 'program.json');
    const argv = [
      '--program-id',
      'eva-dense-ten-master-cli-v2',
      '--actor-id',
      'eva-dense-ten-master-cli-test',
      '--created-at',
      '2026-08-19T13:30:00.000Z',
      '--output',
      output,
    ];
    const result = runEvaDenseMotionTenMasterCompiler(argv);
    assert.equal(result.status, 'passed');
    assert.equal(result.requiredNewMasterCount, 10);
    assert.equal(result.fallbackRemasterCount, 3);
    const program = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(verifyEvaDenseMotionTenMasterProgram(program).programSha256, result.programSha256);
    assert.throws(
      () => runEvaDenseMotionTenMasterCompiler(argv),
      /EVA_DENSE_MOTION_TEN_MASTER_OUTPUT_EXISTS/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
