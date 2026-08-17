import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runProjectArtEvaDenseMotionWorkOrderCli } from './compile-project-art-eva-dense-motion-work-order.mjs';
import {
  EVA_DENSE_MOTION_ACTIVE_ORDINALS,
  EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT,
  EVA_DENSE_MOTION_FAMILY_ID,
  EVA_DENSE_MOTION_MINIMUM_RELEASE_VERSION,
  EVA_DENSE_MOTION_PENDING_ORDINALS,
  EVA_DENSE_MOTION_WORK_ORDER_INTERNALS,
  canonicalEvaDenseMotionWorkOrderJson,
  compileEvaDenseMotionWorkOrder,
  createEvaDenseMotionWorkOrderRequest,
  evaDenseMotionWorkOrderCapabilities,
  evaluateEvaDenseMotionWorkOrder,
  expectedEvaDenseMotionMasterPublicId,
  inspectEvaDenseMotionWorkOrder,
  sha256EvaDenseMotionWorkOrderDocument,
  verifyEvaDenseMotionWorkOrder,
} from './project-art/eva-dense-motion-work-order.mjs';

function request(overrides = {}) {
  const base = createEvaDenseMotionWorkOrderRequest({
    workOrderId: 'eva-dense-motion-153620-001',
    actorId: 'evavo-art-studio-agent',
    createdAt: '2026-08-17T03:00:00.000Z',
    outputRoot: 'workspaces/eva-dense-motion/eva-20260809-153620',
  });
  return { ...structuredClone(base), ...overrides };
}

function refingerprint(workOrder) {
  const body = structuredClone(workOrder);
  delete body.workOrderFingerprint;
  return {
    ...body,
    workOrderFingerprint: sha256EvaDenseMotionWorkOrderDocument(body),
  };
}

test('binds the exact Runtime dense family and emits only seven pending jobs', () => {
  const workOrder = compileEvaDenseMotionWorkOrder(request());
  assert.equal(workOrder.familyId, EVA_DENSE_MOTION_FAMILY_ID);
  assert.equal(
    workOrder.sourceFamily.expectedFrameCount,
    EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT,
  );
  assert.equal(workOrder.sourceFamily.frames.length, 10);
  assert.deepEqual(workOrder.currentProduction.activeOrdinals, [4, 5, 6]);
  assert.deepEqual(workOrder.pendingMastering.ordinals, [1, 2, 3, 7, 8, 9, 10]);
  assert.equal(workOrder.pendingMastering.jobs.length, 7);
  assert.deepEqual(
    workOrder.pendingMastering.jobs.map((job) => job.ordinal),
    EVA_DENSE_MOTION_PENDING_ORDINALS,
  );
  assert.equal(
    workOrder.runtime.commit,
    '8b973623e78b48159b9f22dda7198cbb0cd8c898',
  );
  assert.equal(
    workOrder.runtime.tree,
    '814ab02bde751c784db34f68b2c54e7e18d11ea8',
  );
  assert.equal(
    workOrder.runtime.sourceFamilySha256,
    '7bcef71b34956703576ca008cc38046bd36c40a097235e19142b226e36b1ec15',
  );
});

test('preserves active ordinals 4, 5 and 6 as immutable current provenance', () => {
  const workOrder = compileEvaDenseMotionWorkOrder(request());
  const active = workOrder.sourceFamily.frames.filter(
    (frame) => frame.currentMaster,
  );
  assert.deepEqual(
    active.map((frame) => frame.ordinal),
    EVA_DENSE_MOTION_ACTIVE_ORDINALS,
  );
  assert.deepEqual(
    active.map((frame) => frame.currentMaster.rigFrameId),
    ['previous', 'middle', 'following'],
  );
  assert.deepEqual(
    active.map((frame) => frame.currentMaster.assetId),
    [
      'e4d2d49cc15b82371410c290fce81c34',
      'fb2386c215a1465860b62704f447dedf',
      'f52a7af56eed431b498c5c2c09db3a6a',
    ],
  );
  assert.equal(
    workOrder.currentProduction.activeRigRetentionPolicy,
    'retain-three-frame-rig-until-complete-ten-frame-admission',
  );
  assert.equal(workOrder.currentProduction.partialPromotionAllowed, false);
  assert.equal(workOrder.currentProduction.mixedFamilyPromotionAllowed, false);
});

test('pins every pending source blob and deterministic immutable destination', () => {
  const workOrder = compileEvaDenseMotionWorkOrder(request());
  const expected = [
    [1, '0565ca0bfc5fea7e8a83b4187a98e05efd89785b'],
    [2, 'e0db2df40658c98fdf01907a2386066ee4ec6605'],
    [3, 'e76f242fb92743056b2cc558093cdc931af1aaf7'],
    [7, '30f04e522eb665cc40446226a7b3e19341aa5d86'],
    [8, '5efe57baabd0f99521741087c78f35b1a3773d8f'],
    [9, '0f73024a5214be4388c2807d051c78f0700d992a'],
    [10, '09c7cf413665dad48671c4304413dc1c34e531a2'],
  ];
  assert.deepEqual(
    workOrder.pendingMastering.jobs.map((job) => [
      job.ordinal,
      job.source.gitBlobSha1,
    ]),
    expected,
  );
  for (const job of workOrder.pendingMastering.jobs) {
    assert.equal(job.source.readOnly, true);
    assert.equal(job.source.runtimeDeliveryAllowed, false);
    assert.equal(
      job.cloudinary.publicId,
      expectedEvaDenseMotionMasterPublicId(job.ordinal),
    );
    assert.equal(job.cloudinary.createOnly, true);
    assert.equal(job.cloudinary.overwrite, false);
    assert.equal(job.cloudinary.versionedSecureUrlRequired, true);
    assert.match(
      job.cloudinary.expectedSecureUrlPattern,
      /\/image\/upload\/v<version>\//u,
    );
    assert.ok(
      Object.values(job.releaseGates).every((value) => value === false),
    );
    assert.ok(Object.values(job.authority).every((value) => value === false));
  }
});

test('maps each frame into the Runtime receipt and covers every continuity edge', () => {
  const workOrder = compileEvaDenseMotionWorkOrder(request());
  assert.deepEqual(workOrder.runtimeReceiptHandoff.requiredPerFrameFields, [
    'alphaMasteringReceiptSha256',
    'candidateAssuranceSha256',
    'technicalInspectionSha256',
    'creativeApprovalSha256',
    'masteredAsset',
    'alpha',
    'identity',
  ]);
  assert.equal(workOrder.continuity.edgeCount, 10);
  assert.deepEqual(
    workOrder.continuity.edges.map((edge) => [
      edge.fromOrdinal,
      edge.toOrdinal,
    ]),
    [
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [9, 10],
      [10, 1],
    ],
  );
  assert.deepEqual(workOrder.continuity.loopClosureEdge, {
    fromOrdinal: 10,
    toOrdinal: 1,
  });
  assert.equal(
    workOrder.runtimeReceiptHandoff.minimumRuntimeVersion,
    EVA_DENSE_MOTION_MINIMUM_RELEASE_VERSION,
  );
  assert.equal(
    workOrder.runtimeReceiptHandoff.receiptAssemblyAllowedBeforeAllGatesPass,
    false,
  );
});

test('reports the honest blocked production state without widening authority', () => {
  const status = inspectEvaDenseMotionWorkOrder(
    compileEvaDenseMotionWorkOrder(request()),
  );
  assert.equal(status.activeFrameCount, 3);
  assert.equal(status.pendingFrameCount, 7);
  assert.equal(status.requiredContinuityEdgeCount, 10);
  assert.equal(status.completedContinuityEdgeCount, 0);
  assert.equal(status.releaseReady, false);
  assert.equal(status.activationReady, false);
  assert.ok(
    status.blockingCodes.includes(
      'EVA_DENSE_MOTION_SEVEN_FRAME_MASTERING_PENDING',
    ),
  );
  assert.ok(
    status.blockingCodes.includes(
      'EVA_DENSE_MOTION_RUNTIME_037_RELEASE_PENDING',
    ),
  );
  assert.deepEqual(status.authority, EVA_DENSE_MOTION_CLOSED_AUTHORITY);
  assert.ok(Object.values(status.authority).every((value) => value === false));
});

test('rejects partial, reordered, mixed-runtime and authority-elevated requests', () => {
  const partial = request();
  partial.requestedOrdinals = [1, 2, 3, 7, 8, 9];
  assert.throws(
    () => compileEvaDenseMotionWorkOrder(partial),
    /EVA_DENSE_MOTION_WORK_ORDER_PENDING_SET_INVALID/u,
  );

  const reordered = request();
  reordered.requestedOrdinals = [1, 2, 3, 7, 8, 10, 9];
  assert.throws(
    () => compileEvaDenseMotionWorkOrder(reordered),
    /EVA_DENSE_MOTION_WORK_ORDER_PENDING_SET_INVALID/u,
  );

  const runtimeDrift = request();
  runtimeDrift.runtime.commit = '0'.repeat(40);
  assert.throws(
    () => compileEvaDenseMotionWorkOrder(runtimeDrift),
    /EVA_DENSE_MOTION_WORK_ORDER_RUNTIME_DRIFT/u,
  );

  const authority = request();
  authority.authority.providerExecution = true;
  assert.throws(
    () => compileEvaDenseMotionWorkOrder(authority),
    /EVA_DENSE_MOTION_WORK_ORDER_AUTHORITY_INVALID/u,
  );
});

test('rejects unsafe output roots and malformed metadata', () => {
  assert.throws(
    () =>
      createEvaDenseMotionWorkOrderRequest({
        workOrderId: 'eva-dense-motion-153620-001',
        actorId: 'evavo-art-studio-agent',
        createdAt: '2026-08-17T03:00:00.000Z',
        outputRoot: '../escape',
      }),
    /EVA_DENSE_MOTION_WORK_ORDER_PATH_INVALID/u,
  );
  assert.throws(
    () =>
      createEvaDenseMotionWorkOrderRequest({
        workOrderId: 'bad id',
        actorId: 'evavo-art-studio-agent',
        createdAt: '2026-08-17T03:00:00.000Z',
      }),
    /EVA_DENSE_MOTION_WORK_ORDER_ID_INVALID/u,
  );
  assert.throws(
    () =>
      createEvaDenseMotionWorkOrderRequest({
        workOrderId: 'eva-dense-motion-153620-001',
        actorId: 'evavo-art-studio-agent',
        createdAt: 'not-a-time',
      }),
    /EVA_DENSE_MOTION_WORK_ORDER_TIMESTAMP_INVALID/u,
  );
  assert.throws(
    () => expectedEvaDenseMotionMasterPublicId(0),
    /EVA_DENSE_MOTION_WORK_ORDER_ORDINAL_INVALID/u,
  );
});

test('verifies canonical fingerprints and rejects freshly rehashed content drift', () => {
  const workOrder = compileEvaDenseMotionWorkOrder(request());
  assert.deepEqual(verifyEvaDenseMotionWorkOrder(workOrder), workOrder);
  assert.match(workOrder.workOrderFingerprint, /^[a-f0-9]{64}$/u);

  const tamperedFingerprint = structuredClone(workOrder);
  tamperedFingerprint.workOrderFingerprint = 'f'.repeat(64);
  assert.throws(
    () => verifyEvaDenseMotionWorkOrder(tamperedFingerprint),
    /EVA_DENSE_MOTION_WORK_ORDER_FINGERPRINT_INVALID/u,
  );

  const contentDrift = structuredClone(workOrder);
  contentDrift.pendingMastering.jobs[0].source.gitBlobSha1 = '0'.repeat(40);
  assert.throws(
    () => verifyEvaDenseMotionWorkOrder(refingerprint(contentDrift)),
    /EVA_DENSE_MOTION_WORK_ORDER_CONTENT_DRIFT/u,
  );

  const extraField = structuredClone(workOrder);
  extraField.unreviewed = true;
  assert.throws(
    () => verifyEvaDenseMotionWorkOrder(refingerprint(extraField)),
    /EVA_DENSE_MOTION_WORK_ORDER_INVALID/u,
  );
});

test('is deterministic for identical metadata and changes with a different request identity', () => {
  const first = compileEvaDenseMotionWorkOrder(request());
  const second = compileEvaDenseMotionWorkOrder(request());
  assert.equal(
    canonicalEvaDenseMotionWorkOrderJson(first),
    canonicalEvaDenseMotionWorkOrderJson(second),
  );
  assert.equal(first.workOrderFingerprint, second.workOrderFingerprint);

  const different = compileEvaDenseMotionWorkOrder(
    request({ workOrderId: 'eva-dense-motion-153620-002' }),
  );
  assert.notEqual(first.workOrderFingerprint, different.workOrderFingerprint);
});

test('CLI writes one permission-restricted create-only work order', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'eva-dense-work-order-'));
  try {
    const output = path.join(directory, 'work-order.json');
    const summary = runProjectArtEvaDenseMotionWorkOrderCli([
      '--work-order-id',
      'eva-dense-motion-153620-cli-001',
      '--actor-id',
      'evavo-art-studio-agent',
      '--created-at',
      '2026-08-17T03:15:00.000Z',
      '--output',
      output,
    ]);
    assert.equal(summary.pendingFrameCount, 7);
    assert.equal(summary.releaseReady, false);
    assert.equal(summary.activationReady, false);
    assert.equal(summary.providerExecution, false);
    assert.equal(summary.cloudinaryUpload, false);
    assert.equal(summary.runtimeActivationAllowed, false);
    const written = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(
      verifyEvaDenseMotionWorkOrder(written).workOrderFingerprint,
      summary.workOrderFingerprint,
    );
    assert.equal(statSync(output).mode & 0o777, 0o600);

    const before = readFileSync(output, 'utf8');
    assert.throws(
      () =>
        runProjectArtEvaDenseMotionWorkOrderCli([
          '--work-order-id',
          'eva-dense-motion-153620-cli-002',
          '--actor-id',
          'evavo-art-studio-agent',
          '--created-at',
          '2026-08-17T03:16:00.000Z',
          '--output',
          output,
        ]),
      /EEXIST/u,
    );
    assert.equal(readFileSync(output, 'utf8'), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});


test('invalid documents evaluate to a blocked status instead of granting readiness', () => {
  const invalid = compileEvaDenseMotionWorkOrder(request());
  const changed = structuredClone(invalid);
  changed.authority.runtimeActivation = true;
  const status = evaluateEvaDenseMotionWorkOrder(refingerprint(changed));
  assert.equal(status.releaseReady, false);
  assert.equal(status.activationReady, false);
  assert.equal(status.pendingFrameCount, 7);
  assert.deepEqual(status.blockingCodes, [
    'EVA_DENSE_MOTION_WORK_ORDER_CONTENT_DRIFT',
  ]);
});

test('capabilities expose orchestration without provider, publication or activation power', () => {
  const capabilities = evaDenseMotionWorkOrderCapabilities();
  assert.equal(capabilities.exactTenFrameSourceBinding, true);
  assert.equal(capabilities.exactSevenPendingFrameWorkOrder, true);
  assert.equal(capabilities.currentThreeFrameProvenanceRetained, true);
  assert.equal(capabilities.deterministicCloudinaryPublicIds, true);
  assert.equal(capabilities.actualRgbaAlphaRequired, true);
  assert.equal(capabilities.hiddenRgbZeroedRequired, true);
  assert.equal(capabilities.allTenContinuityEdgesRequired, true);
  assert.equal(capabilities.finalToFirstLoopClosureRequired, true);
  assert.equal(capabilities.minimumDenseRuntimeVersion, '0.37.0');
  assert.equal(capabilities.sourceRepairMaskSubstitutionAllowed, false);
  assert.equal(capabilities.providerExecution, false);
  assert.equal(capabilities.cloudinaryUpload, false);
  assert.equal(capabilities.sequenceRelease, false);
  assert.equal(capabilities.repositoryMutation, false);
  assert.equal(capabilities.runtimeActivation, false);
  assert.ok(
    Object.values(capabilities.authority).every((value) => value === false),
  );
  assert.equal(
    EVA_DENSE_MOTION_WORK_ORDER_INTERNALS.sourceFrames.length,
    EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT,
  );
  assert.ok(EVA_DENSE_MOTION_WORK_ORDER_INTERNALS.sha1Pattern.test('a'.repeat(40)));
  assert.ok(
    EVA_DENSE_MOTION_WORK_ORDER_INTERNALS.sha256Pattern.test('b'.repeat(64)),
  );
});
