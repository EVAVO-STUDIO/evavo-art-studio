import {
  ART_STUDIO_BASELINE,
  CANVAS,
  CHARACTER_ID,
  DEFAULT_OUTPUT_ROOT,
  EVA_DENSE_MOTION_ACTIVE_ORDINALS,
  EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT,
  EVA_DENSE_MOTION_FAMILY_ID,
  EVA_DENSE_MOTION_MINIMUM_RELEASE_VERSION,
  EVA_DENSE_MOTION_PENDING_ORDINALS,
  EVA_DENSE_MOTION_WORK_ORDER_CAPABILITIES_SCHEMA,
  EVA_DENSE_MOTION_WORK_ORDER_REQUEST_SCHEMA,
  EVA_DENSE_MOTION_WORK_ORDER_SCHEMA,
  EVA_DENSE_MOTION_WORK_ORDER_STATUS_SCHEMA,
  FAMILY_RELEASE_GATES,
  RUNTIME,
  RUNTIME_FRAME_EVIDENCE_FIELDS,
  SHA1,
  SHA256,
  SOURCE_CONTRACT_SHA256,
  SOURCE_FAMILY_SHA256,
  SOURCE_TREE_SHA1,
} from './eva-dense-motion-work-order-data.mjs';
import {
  CONTINUITY_EDGES,
  EvaDenseMotionWorkOrderError,
  SOURCE_FRAMES,
  canonicalEvaDenseMotionWorkOrderJson,
  canonicalRelativePath,
  deepFreeze,
  exactClosedAuthority,
  exactKeys,
  exactObject,
  fail,
  frameJob,
  identifier,
  sha256EvaDenseMotionWorkOrderDocument,
  snapshot,
  timestamp,
} from './eva-dense-motion-work-order-common.mjs';

export {
  EVA_DENSE_MOTION_ACTIVE_ORDINALS,
  EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT,
  EVA_DENSE_MOTION_FAMILY_ID,
  EVA_DENSE_MOTION_MINIMUM_RELEASE_VERSION,
  EVA_DENSE_MOTION_PENDING_ORDINALS,
  EVA_DENSE_MOTION_WORK_ORDER_CAPABILITIES_SCHEMA,
  EVA_DENSE_MOTION_WORK_ORDER_REQUEST_SCHEMA,
  EVA_DENSE_MOTION_WORK_ORDER_SCHEMA,
  EVA_DENSE_MOTION_WORK_ORDER_STATUS_SCHEMA,
} from './eva-dense-motion-work-order-data.mjs';
export {
  EvaDenseMotionWorkOrderError,
  canonicalEvaDenseMotionWorkOrderJson,
  expectedEvaDenseMotionMasterPublicId,
  sha256EvaDenseMotionWorkOrderDocument,
} from './eva-dense-motion-work-order-common.mjs';

export function createEvaDenseMotionWorkOrderRequest({
  workOrderId,
  actorId,
  createdAt,
  outputRoot = DEFAULT_OUTPUT_ROOT,
} = {}) {
  return deepFreeze({
    schema: EVA_DENSE_MOTION_WORK_ORDER_REQUEST_SCHEMA,
    workOrderId: identifier(workOrderId, 'workOrderId'),
    actorId: identifier(actorId, 'actorId'),
    createdAt: timestamp(createdAt, 'createdAt'),
    characterId: CHARACTER_ID,
    familyId: EVA_DENSE_MOTION_FAMILY_ID,
    runtime: RUNTIME,
    requestedOrdinals: EVA_DENSE_MOTION_PENDING_ORDINALS,
    outputRoot: canonicalRelativePath(outputRoot, 'outputRoot'),
    authority: EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  });
}

function parseRequest(input) {
  const value = snapshot(input, 'request');
  exactKeys(
    value,
    [
      'schema',
      'workOrderId',
      'actorId',
      'createdAt',
      'characterId',
      'familyId',
      'runtime',
      'requestedOrdinals',
      'outputRoot',
      'authority',
    ],
    'EVA_DENSE_MOTION_WORK_ORDER_REQUEST_INVALID',
  );
  if (
    value.schema !== EVA_DENSE_MOTION_WORK_ORDER_REQUEST_SCHEMA ||
    value.characterId !== CHARACTER_ID ||
    value.familyId !== EVA_DENSE_MOTION_FAMILY_ID
  ) {
    fail('EVA_DENSE_MOTION_WORK_ORDER_REQUEST_INVALID');
  }
  identifier(value.workOrderId, 'request.workOrderId');
  identifier(value.actorId, 'request.actorId');
  timestamp(value.createdAt, 'request.createdAt');
  canonicalRelativePath(value.outputRoot, 'request.outputRoot');
  exactObject(
    value.runtime,
    RUNTIME,
    'EVA_DENSE_MOTION_WORK_ORDER_RUNTIME_DRIFT',
    'request.runtime',
  );
  exactObject(
    value.requestedOrdinals,
    EVA_DENSE_MOTION_PENDING_ORDINALS,
    'EVA_DENSE_MOTION_WORK_ORDER_PENDING_SET_INVALID',
    'request.requestedOrdinals',
  );
  exactClosedAuthority(value.authority, 'request.authority');
  return value;
}

export function compileEvaDenseMotionWorkOrder(input) {
  const request = parseRequest(input);
  const pendingFrames = SOURCE_FRAMES.filter(
    (frame) => frame.currentState === 'pending-mastering',
  );
  const body = {
    schema: EVA_DENSE_MOTION_WORK_ORDER_SCHEMA,
    workOrderId: request.workOrderId,
    actorId: request.actorId,
    createdAt: request.createdAt,
    characterId: CHARACTER_ID,
    familyId: EVA_DENSE_MOTION_FAMILY_ID,
    runtime: RUNTIME,
    artStudio: ART_STUDIO_BASELINE,
    sourceFamily: {
      schema: RUNTIME.sourceFamilySchema,
      sourceTreeSha1: SOURCE_TREE_SHA1,
      sourceContractSha256: SOURCE_CONTRACT_SHA256,
      sourceFamilySha256: SOURCE_FAMILY_SHA256,
      canvas: CANVAS,
      expectedFrameCount: EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT,
      frames: SOURCE_FRAMES,
    },
    currentProduction: {
      runtimeVersion: RUNTIME.packageVersion,
      activeFrameCount: EVA_DENSE_MOTION_ACTIVE_ORDINALS.length,
      activeOrdinals: EVA_DENSE_MOTION_ACTIVE_ORDINALS,
      activeRigRetentionPolicy:
        'retain-three-frame-rig-until-complete-ten-frame-admission',
      partialPromotionAllowed: false,
      mixedFamilyPromotionAllowed: false,
      rawSourceRuntimeDeliveryAllowed: false,
    },
    pendingMastering: {
      count: pendingFrames.length,
      ordinals: EVA_DENSE_MOTION_PENDING_ORDINALS,
      outputRoot: request.outputRoot,
      jobs: pendingFrames.map((frame) => frameJob(frame, request.outputRoot)),
    },
    continuity: {
      edgeCount: CONTINUITY_EDGES.length,
      edges: CONTINUITY_EDGES,
      identityAnchorOrdinal: 4,
      maximumFaceCenterShiftPixels: 8,
      maximumPhashHammingDistance: 6,
      loopClosureEdge: { fromOrdinal: 10, toOrdinal: 1 },
      adjacencyReviewComplete: false,
      loopClosureReviewComplete: false,
    },
    runtimeReceiptHandoff: {
      schema: RUNTIME.admissionReceiptSchema,
      expectedFrameCount: EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT,
      requiredPerFrameFields: RUNTIME_FRAME_EVIDENCE_FIELDS,
      requiredFamilyFields: [
        'continuity',
        'release',
        'authority',
        'receiptFingerprint',
      ],
      minimumRuntimeVersion: EVA_DENSE_MOTION_MINIMUM_RELEASE_VERSION,
      receiptAssemblyAllowedBeforeAllGatesPass: false,
      runtimeActivationAllowed: false,
    },
    releaseGates: FAMILY_RELEASE_GATES,
    authority: EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  };
  return deepFreeze({
    ...body,
    workOrderFingerprint: sha256EvaDenseMotionWorkOrderDocument(body),
  });
}

export function verifyEvaDenseMotionWorkOrder(input) {
  const value = snapshot(input, 'workOrder');
  exactKeys(
    value,
    [
      'schema',
      'workOrderId',
      'actorId',
      'createdAt',
      'characterId',
      'familyId',
      'runtime',
      'artStudio',
      'sourceFamily',
      'currentProduction',
      'pendingMastering',
      'continuity',
      'runtimeReceiptHandoff',
      'releaseGates',
      'authority',
      'workOrderFingerprint',
    ],
    'EVA_DENSE_MOTION_WORK_ORDER_INVALID',
  );
  if (
    value.schema !== EVA_DENSE_MOTION_WORK_ORDER_SCHEMA ||
    typeof value.workOrderFingerprint !== 'string' ||
    !SHA256.test(value.workOrderFingerprint)
  ) {
    fail('EVA_DENSE_MOTION_WORK_ORDER_INVALID');
  }
  const body = { ...value };
  delete body.workOrderFingerprint;
  if (
    sha256EvaDenseMotionWorkOrderDocument(body) !==
    value.workOrderFingerprint
  ) {
    fail('EVA_DENSE_MOTION_WORK_ORDER_FINGERPRINT_INVALID');
  }
  const expected = compileEvaDenseMotionWorkOrder(
    createEvaDenseMotionWorkOrderRequest({
      workOrderId: value.workOrderId,
      actorId: value.actorId,
      createdAt: value.createdAt,
      outputRoot: value.pendingMastering?.outputRoot,
    }),
  );
  if (
    canonicalEvaDenseMotionWorkOrderJson(value) !==
    canonicalEvaDenseMotionWorkOrderJson(expected)
  ) {
    fail('EVA_DENSE_MOTION_WORK_ORDER_CONTENT_DRIFT');
  }
  return value;
}

export function inspectEvaDenseMotionWorkOrder(input) {
  const workOrder = verifyEvaDenseMotionWorkOrder(input);
  return deepFreeze({
    schema: EVA_DENSE_MOTION_WORK_ORDER_STATUS_SCHEMA,
    workOrderFingerprint: workOrder.workOrderFingerprint,
    characterId: CHARACTER_ID,
    familyId: EVA_DENSE_MOTION_FAMILY_ID,
    expectedFrameCount: EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT,
    activeFrameCount: EVA_DENSE_MOTION_ACTIVE_ORDINALS.length,
    activeOrdinals: EVA_DENSE_MOTION_ACTIVE_ORDINALS,
    pendingFrameCount: EVA_DENSE_MOTION_PENDING_ORDINALS.length,
    pendingOrdinals: EVA_DENSE_MOTION_PENDING_ORDINALS,
    requiredContinuityEdgeCount: CONTINUITY_EDGES.length,
    completedContinuityEdgeCount: 0,
    releaseReady: false,
    activationReady: false,
    blockingCodes: [
      'EVA_DENSE_MOTION_SEVEN_FRAME_MASTERING_PENDING',
      'EVA_DENSE_MOTION_TEN_FRAME_EVIDENCE_INCOMPLETE',
      'EVA_DENSE_MOTION_CONTINUITY_REVIEW_PENDING',
      'EVA_DENSE_MOTION_LOOP_CLOSURE_REVIEW_PENDING',
      'EVA_DENSE_MOTION_BROWSER_PLAYBACK_PENDING',
      'EVA_DENSE_MOTION_RUNTIME_037_RELEASE_PENDING',
    ],
    activeRuntimePolicy:
      workOrder.currentProduction.activeRigRetentionPolicy,
    authority: EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  });
}

export function evaluateEvaDenseMotionWorkOrder(input) {
  try {
    return inspectEvaDenseMotionWorkOrder(input);
  } catch (error) {
    return deepFreeze({
      schema: EVA_DENSE_MOTION_WORK_ORDER_STATUS_SCHEMA,
      characterId: CHARACTER_ID,
      familyId: EVA_DENSE_MOTION_FAMILY_ID,
      expectedFrameCount: EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT,
      activeFrameCount: EVA_DENSE_MOTION_ACTIVE_ORDINALS.length,
      activeOrdinals: EVA_DENSE_MOTION_ACTIVE_ORDINALS,
      pendingFrameCount: EVA_DENSE_MOTION_PENDING_ORDINALS.length,
      pendingOrdinals: EVA_DENSE_MOTION_PENDING_ORDINALS,
      requiredContinuityEdgeCount: CONTINUITY_EDGES.length,
      completedContinuityEdgeCount: 0,
      releaseReady: false,
      activationReady: false,
      blockingCodes: [
        error instanceof EvaDenseMotionWorkOrderError
          ? error.code
          : 'EVA_DENSE_MOTION_WORK_ORDER_INVALID',
      ],
      activeRuntimePolicy:
        'retain-three-frame-rig-until-complete-ten-frame-admission',
      authority: EVA_DENSE_MOTION_CLOSED_AUTHORITY,
    });
  }
}

export function evaDenseMotionWorkOrderCapabilities() {
  return deepFreeze({
    schema: EVA_DENSE_MOTION_WORK_ORDER_CAPABILITIES_SCHEMA,
    requestSchema: EVA_DENSE_MOTION_WORK_ORDER_REQUEST_SCHEMA,
    workOrderSchema: EVA_DENSE_MOTION_WORK_ORDER_SCHEMA,
    runtimeSourceFamilySchema: RUNTIME.sourceFamilySchema,
    runtimeAdmissionReceiptSchema: RUNTIME.admissionReceiptSchema,
    exactTenFrameSourceBinding: true,
    exactSevenPendingFrameWorkOrder: true,
    currentThreeFrameProvenanceRetained: true,
    deterministicCloudinaryPublicIds: true,
    immutableVersionedDeliveryRequired: true,
    actualRgbaAlphaRequired: true,
    hiddenRgbZeroedRequired: true,
    fakeCheckerboardRejected: true,
    matteHaloRejected: true,
    canvasEdgesClearRequired: true,
    perFrameTechnicalInspectionRequired: true,
    perFrameCreativeApprovalRequired: true,
    allTenContinuityEdgesRequired: true,
    finalToFirstLoopClosureRequired: true,
    browserPlaybackEvidenceRequired: true,
    minimumDenseRuntimeVersion: EVA_DENSE_MOTION_MINIMUM_RELEASE_VERSION,
    partialPromotionAllowed: false,
    mixedFamilyPromotionAllowed: false,
    sourceRepairMaskSubstitutionAllowed: false,
    providerExecution: false,
    cloudinaryUpload: false,
    sequenceRelease: false,
    repositoryMutation: false,
    runtimeActivation: false,
    authority: EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  });
}

export const EVA_DENSE_MOTION_WORK_ORDER_INTERNALS = Object.freeze({
  runtime: RUNTIME,
  artStudioBaseline: ART_STUDIO_BASELINE,
  sourceFrames: SOURCE_FRAMES,
  continuityEdges: CONTINUITY_EDGES,
  sourceTreeSha1: SOURCE_TREE_SHA1,
  sourceContractSha256: SOURCE_CONTRACT_SHA256,
  sourceFamilySha256: SOURCE_FAMILY_SHA256,
  defaultOutputRoot: DEFAULT_OUTPUT_ROOT,
  sha1Pattern: SHA1,
  sha256Pattern: SHA256,
});
