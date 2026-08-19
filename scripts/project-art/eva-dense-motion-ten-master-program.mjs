import {
  EVA_DENSE_MOTION_ACTIVE_ORDINALS,
  EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT,
  EVA_DENSE_MOTION_FAMILY_ID,
  EVA_DENSE_MOTION_PENDING_ORDINALS,
  EVA_DENSE_MOTION_WORK_ORDER_SCHEMA,
} from './eva-dense-motion-work-order.mjs';
import {
  CONTINUITY_EDGES,
  SOURCE_FRAMES,
  canonicalEvaDenseMotionWorkOrderJson,
  canonicalRelativePath,
  deepFreeze,
  frameJob,
  identifier,
  sha256EvaDenseMotionWorkOrderDocument,
  snapshot,
  timestamp,
} from './eva-dense-motion-work-order-common.mjs';

export const EVA_DENSE_MOTION_TEN_MASTER_PROGRAM_SCHEMA =
  'evavo.project-art-eva-dense-motion-ten-master-program.v2';
export const EVA_DENSE_MOTION_TEN_MASTER_REQUEST_SCHEMA =
  'evavo.project-art-eva-dense-motion-ten-master-request.v2';
export const EVA_DENSE_MOTION_TEN_MASTER_STATUS_SCHEMA =
  'evavo.project-art-eva-dense-motion-ten-master-status.v2';
export const EVA_DENSE_MOTION_TEN_MASTER_CAPABILITIES_SCHEMA =
  'evavo.project-art-eva-dense-motion-ten-master-capabilities.v2';

export const EVA_DENSE_MOTION_FINAL_MASTER_ORDINALS = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
]);
export const EVA_DENSE_MOTION_FALLBACK_REMASTER_ORDINALS =
  EVA_DENSE_MOTION_ACTIVE_ORDINALS;
export const EVA_DENSE_MOTION_TARGET_RUNTIME = Object.freeze({
  repository: 'EVAVO-STUDIO/evavo-avatar-runtime',
  packageVersion: '0.38.0',
  commit: 'c736a6d6648d3f02ac5745458a4cea0e02eab00c',
  tree: 'ab17548e5178acd4e33d74a9fb57569482381a33',
  councilProductionTruthAvailable: true,
});
export const EVA_DENSE_MOTION_TEN_MASTER_DEFAULT_OUTPUT_ROOT =
  'workspaces/eva-dense-motion/eva-20260809-153620-ten-master-v2';

const RELEASE_GATES = Object.freeze({
  allTenNewDenseMastersProduced: false,
  allTenCandidateAssurancePassed: false,
  allTenAlphaMastersPassed: false,
  allTenFrameFinisherChecksPassed: false,
  allTenTechnicalInspectionsPassed: false,
  allTenCreativeApprovalsRecorded: false,
  allTenImmutableCloudinaryMastersVerified: false,
  allTenUniqueNewMasterSha256Verified: false,
  legacyFallbackAssetsExcludedFromFinalMasterSet: false,
  allTenRuntimeFrameEvidenceComplete: false,
  allTenContinuityEdgesReviewed: false,
  finalToFirstLoopClosureReviewed: false,
  sequencePackRegenerated: false,
  releaseManifestRegenerated: false,
  browserPlaybackReverified: false,
  ownerApprovalRecorded: false,
  creativeDirectorApprovalRecorded: false,
  technicalDirectorApprovalRecorded: false,
  runtimeActivationApproved: false,
});

function exactArray(actual, expected, code) {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(code);
  }
}

export function createEvaDenseMotionTenMasterRequest({
  programId,
  actorId,
  createdAt,
  outputRoot = EVA_DENSE_MOTION_TEN_MASTER_DEFAULT_OUTPUT_ROOT,
} = {}) {
  return deepFreeze({
    schema: EVA_DENSE_MOTION_TEN_MASTER_REQUEST_SCHEMA,
    programId: identifier(programId, 'programId'),
    actorId: identifier(actorId, 'actorId'),
    createdAt: timestamp(createdAt, 'createdAt'),
    characterId: 'eva-female',
    familyId: EVA_DENSE_MOTION_FAMILY_ID,
    requiredFinalOrdinals: EVA_DENSE_MOTION_FINAL_MASTER_ORDINALS,
    outputRoot: canonicalRelativePath(outputRoot, 'outputRoot'),
    authority: EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  });
}

function parseRequest(input) {
  const value = snapshot(input, 'tenMasterRequest');
  if (
    value.schema !== EVA_DENSE_MOTION_TEN_MASTER_REQUEST_SCHEMA ||
    value.characterId !== 'eva-female' ||
    value.familyId !== EVA_DENSE_MOTION_FAMILY_ID ||
    canonicalEvaDenseMotionWorkOrderJson(value.authority) !==
      canonicalEvaDenseMotionWorkOrderJson(EVA_DENSE_MOTION_CLOSED_AUTHORITY)
  ) {
    throw new Error('EVA_DENSE_MOTION_TEN_MASTER_REQUEST_INVALID');
  }
  identifier(value.programId, 'programId');
  identifier(value.actorId, 'actorId');
  timestamp(value.createdAt, 'createdAt');
  canonicalRelativePath(value.outputRoot, 'outputRoot');
  exactArray(
    value.requiredFinalOrdinals,
    EVA_DENSE_MOTION_FINAL_MASTER_ORDINALS,
    'EVA_DENSE_MOTION_TEN_MASTER_ORDINALS_INVALID',
  );
  return value;
}

function finalMasterJob(source, outputRoot) {
  const base = frameJob(source, outputRoot);
  const currentFallback = EVA_DENSE_MOTION_ACTIVE_ORDINALS.includes(source.ordinal);
  return deepFreeze({
    ...base,
    productionRole: currentFallback
      ? 'current-fallback-remaster-required'
      : 'new-dense-master-required',
    legacyFallback: currentFallback
      ? Object.freeze({
          retainedUntilAtomicTenMasterActivation: true,
          maySatisfyFinalMasterGate: false,
          currentMaster: source.currentMaster,
        })
      : null,
    finalMasterPolicy: Object.freeze({
      newDeterministicMasterRequired: true,
      targetPublicIdMustDifferFromLegacyFallback: currentFallback,
      targetAssetIdMustBeNew: true,
      targetSha256MustBeNew: true,
      sourceBytesRemainReadOnly: true,
      partialPromotionAllowed: false,
    }),
  });
}

export function compileEvaDenseMotionTenMasterProgram(input) {
  const request = parseRequest(input);
  if (SOURCE_FRAMES.length !== EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT) {
    throw new Error('EVA_DENSE_MOTION_TEN_MASTER_SOURCE_COUNT_DRIFT');
  }
  exactArray(
    SOURCE_FRAMES.map((frame) => frame.ordinal),
    EVA_DENSE_MOTION_FINAL_MASTER_ORDINALS,
    'EVA_DENSE_MOTION_TEN_MASTER_SOURCE_ORDINAL_DRIFT',
  );
  if (CONTINUITY_EDGES.length !== 10) {
    throw new Error('EVA_DENSE_MOTION_TEN_MASTER_CONTINUITY_DRIFT');
  }

  const jobs = Object.freeze(
    SOURCE_FRAMES.map((frame) => finalMasterJob(frame, request.outputRoot)),
  );
  const fallbackJobs = jobs.filter((job) => job.legacyFallback !== null);
  const newOnlyJobs = jobs.filter((job) => job.legacyFallback === null);

  const body = {
    schema: EVA_DENSE_MOTION_TEN_MASTER_PROGRAM_SCHEMA,
    programId: request.programId,
    actorId: request.actorId,
    createdAt: request.createdAt,
    characterId: request.characterId,
    familyId: request.familyId,
    supersedes: Object.freeze({
      schema: EVA_DENSE_MOTION_WORK_ORDER_SCHEMA,
      reason:
        'The v1 seven-pending-frame work order cannot satisfy the later release requirement for ten new deterministic dense masters.',
      legacyPendingOrdinals: EVA_DENSE_MOTION_PENDING_ORDINALS,
      legacyActiveFallbackOrdinals: EVA_DENSE_MOTION_ACTIVE_ORDINALS,
      legacyEvidenceRemainsImmutable: true,
      legacyThreeFrameRuntimeRemainsLiveUntilAtomicActivation: true,
    }),
    targetRuntime: EVA_DENSE_MOTION_TARGET_RUNTIME,
    production: Object.freeze({
      requiredNewMasterCount: 10,
      requiredFinalOrdinals: EVA_DENSE_MOTION_FINAL_MASTER_ORDINALS,
      jobCount: jobs.length,
      jobs,
      fallbackRemasterCount: fallbackJobs.length,
      fallbackRemasterOrdinals: Object.freeze(
        fallbackJobs.map((job) => job.ordinal),
      ),
      newOnlyMasterCount: newOnlyJobs.length,
      newOnlyMasterOrdinals: Object.freeze(
        newOnlyJobs.map((job) => job.ordinal),
      ),
      existingFallbackMasterMayBeFinal: false,
      rawSourceMayBeRuntimeDelivered: false,
      mixedOldAndNewFamilyMayBePromoted: false,
      partialPromotionAllowed: false,
    }),
    continuity: Object.freeze({
      requiredEdgeCount: 10,
      edges: CONTINUITY_EDGES,
      identityAnchorSourceOrdinal: 4,
      finalToFirstEdge: Object.freeze({ fromOrdinal: 10, toOrdinal: 1 }),
      allEdgesRequiredBeforeRelease: true,
    }),
    releaseGates: RELEASE_GATES,
    authority: EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  };
  return deepFreeze({
    ...body,
    programSha256: sha256EvaDenseMotionWorkOrderDocument(body),
  });
}

export function verifyEvaDenseMotionTenMasterProgram(input) {
  const value = snapshot(input, 'tenMasterProgram');
  if (
    value.schema !== EVA_DENSE_MOTION_TEN_MASTER_PROGRAM_SCHEMA ||
    typeof value.programSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value.programSha256)
  ) {
    throw new Error('EVA_DENSE_MOTION_TEN_MASTER_PROGRAM_INVALID');
  }
  const body = { ...value };
  delete body.programSha256;
  if (
    sha256EvaDenseMotionWorkOrderDocument(body) !== value.programSha256 ||
    value.production?.jobCount !== 10 ||
    value.production?.requiredNewMasterCount !== 10 ||
    value.production?.fallbackRemasterCount !== 3 ||
    value.production?.newOnlyMasterCount !== 7 ||
    value.production?.existingFallbackMasterMayBeFinal !== false ||
    value.releaseGates?.runtimeActivationApproved !== false
  ) {
    throw new Error('EVA_DENSE_MOTION_TEN_MASTER_PROGRAM_INVALID');
  }
  exactArray(
    value.production.requiredFinalOrdinals,
    EVA_DENSE_MOTION_FINAL_MASTER_ORDINALS,
    'EVA_DENSE_MOTION_TEN_MASTER_PROGRAM_INVALID',
  );
  exactArray(
    value.production.fallbackRemasterOrdinals,
    EVA_DENSE_MOTION_ACTIVE_ORDINALS,
    'EVA_DENSE_MOTION_TEN_MASTER_PROGRAM_INVALID',
  );
  if (
    value.production.jobs.some(
      (job) =>
        job.finalMasterPolicy?.newDeterministicMasterRequired !== true ||
        job.cloudinary?.createOnly !== true ||
        job.cloudinary?.overwrite !== false ||
        job.authority?.runtimeActivation !== false,
    )
  ) {
    throw new Error('EVA_DENSE_MOTION_TEN_MASTER_JOB_AUTHORITY_INVALID');
  }
  return value;
}

export function inspectEvaDenseMotionTenMasterProgram(input) {
  const program = verifyEvaDenseMotionTenMasterProgram(input);
  return deepFreeze({
    schema: EVA_DENSE_MOTION_TEN_MASTER_STATUS_SCHEMA,
    programSha256: program.programSha256,
    characterId: program.characterId,
    familyId: program.familyId,
    requiredNewMasterCount: 10,
    currentFallbackCount: 3,
    fallbackRemasterCount: 3,
    masteredCount: 0,
    continuityEdgesReviewed: 0,
    releaseReady: false,
    runtimeActivationReady: false,
    blockingCodes: Object.freeze([
      'EVA_DENSE_MOTION_TEN_NEW_MASTERS_REQUIRED',
      'EVA_DENSE_MOTION_ALL_FRAME_ASSURANCE_PENDING',
      'EVA_DENSE_MOTION_ALL_FRAME_MASTERING_PENDING',
      'EVA_DENSE_MOTION_ALL_FRAME_APPROVAL_PENDING',
      'EVA_DENSE_MOTION_TEN_EDGE_CONTINUITY_PENDING',
      'EVA_DENSE_MOTION_LOOP_CLOSURE_PENDING',
      'EVA_DENSE_MOTION_RUNTIME_PUBLICATION_PENDING',
      'EVA_DENSE_MOTION_BROWSER_PLAYBACK_PENDING',
    ]),
    authority: EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  });
}

export function evaDenseMotionTenMasterCapabilities() {
  return deepFreeze({
    schema: EVA_DENSE_MOTION_TEN_MASTER_CAPABILITIES_SCHEMA,
    requestSchema: EVA_DENSE_MOTION_TEN_MASTER_REQUEST_SCHEMA,
    programSchema: EVA_DENSE_MOTION_TEN_MASTER_PROGRAM_SCHEMA,
    exactTenSourceFramesBound: true,
    exactTenNewMasterJobs: true,
    fallbackRemasterJobCount: 3,
    currentThreeFrameFallbackRetainedUntilAtomicActivation: true,
    legacyFallbackMaySatisfyFinalMasterGate: false,
    deterministicCreateOnlyCloudinaryPublicIds: true,
    immutableVersionedDeliveryRequired: true,
    perFrameCandidateAssuranceRequired: true,
    perFrameAlphaMasteringRequired: true,
    perFrameFinisherRequired: true,
    perFrameTechnicalInspectionRequired: true,
    perFrameCreativeApprovalRequired: true,
    allTenContinuityEdgesRequired: true,
    finalToFirstLoopClosureRequired: true,
    atomicTenMasterActivationRequired: true,
    partialPromotionAllowed: false,
    providerExecution: false,
    cloudinaryUpload: false,
    sequenceRelease: false,
    repositoryMutation: false,
    runtimeActivation: false,
    targetRuntime: EVA_DENSE_MOTION_TARGET_RUNTIME,
    authority: EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  });
}
