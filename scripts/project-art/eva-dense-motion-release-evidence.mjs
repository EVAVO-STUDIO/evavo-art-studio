import {
  EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT,
  EVA_DENSE_MOTION_FAMILY_ID,
  EVA_DENSE_MOTION_MINIMUM_RELEASE_VERSION,
  EVA_DENSE_MOTION_WORK_ORDER_INTERNALS,
  canonicalEvaDenseMotionWorkOrderJson,
  expectedEvaDenseMotionMasterPublicId,
  sha256EvaDenseMotionWorkOrderDocument,
  verifyEvaDenseMotionWorkOrder,
} from './eva-dense-motion-work-order.mjs';

export const EVA_DENSE_MOTION_RELEASE_EVIDENCE_REQUEST_SCHEMA =
  'evavo.project-art-eva-dense-motion-release-evidence-request.v2';
export const EVA_DENSE_MOTION_RELEASE_EVIDENCE_SCHEMA =
  'evavo.project-art-eva-dense-motion-release-evidence.v2';
export const EVA_DENSE_MOTION_RELEASE_EVIDENCE_STATUS_SCHEMA =
  'evavo.project-art-eva-dense-motion-release-evidence-status.v2';
export const EVA_DENSE_MOTION_RELEASE_EVIDENCE_CAPABILITIES_SCHEMA =
  'evavo.project-art-eva-dense-motion-release-evidence-capabilities.v2';

const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const HEX32 = /^[a-f0-9]{32}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;
const { runtime: SOURCE_RUNTIME, sourceFrames: SOURCE_FRAMES } =
  EVA_DENSE_MOTION_WORK_ORDER_INTERNALS;
const CONTINUITY_EDGES = EVA_DENSE_MOTION_WORK_ORDER_INTERNALS.continuityEdges;
const CANVAS = Object.freeze({ width: 1024, height: 1536 });
const CLOUD_NAME = 'dntogqtey';

const FRAME_EVIDENCE_KEYS = Object.freeze([
  'candidateAssuranceSha256',
  'alphaMasteringReceiptSha256',
  'frameFinisherReceiptSha256',
  'technicalInspectionSha256',
  'creativeApprovalSha256',
  'identityEvidenceSha256',
  'finalReviewedSha256',
]);
const ALPHA_KEYS = Object.freeze([
  'actualRgbaAlpha',
  'hiddenRgbTransparentPixels',
  'checkerboardRejected',
  'matteHaloRejected',
  'edgeVisiblePixels',
  'alphaPlaneSha256',
]);
const REVIEW_KEYS = Object.freeze([
  'technicalPassed',
  'creativeApproved',
  'anatomyPassed',
  'identityPassed',
  'silhouetteRegistrationPassed',
  'reviewedBy',
  'reviewedAt',
  'reviewDecisionSha256',
]);
const ASSET_KEYS = Object.freeze([
  'provider',
  'cloudName',
  'assetId',
  'publicId',
  'version',
  'bytes',
  'width',
  'height',
  'format',
  'etag',
  'secureUrl',
  'sha256',
  'createOnly',
  'overwrite',
  'immutable',
]);
const FRAME_KEYS = Object.freeze([
  'ordinal',
  'frameId',
  'sourceGitBlobSha1',
  'evidence',
  'masteredAsset',
  'alpha',
  'review',
]);
const CONTINUITY_KEYS = Object.freeze([
  'fromOrdinal',
  'toOrdinal',
  'evidenceSha256',
  'faceRegistrationPassed',
  'phashContinuityPassed',
  'motionReviewPassed',
  'reviewedBy',
  'reviewedAt',
]);
const RUNTIME_RELEASE_KEYS = Object.freeze([
  'repository',
  'version',
  'commit',
  'tree',
  'admissionReceiptSchema',
  'activationApproved',
  'deploymentApproved',
]);
const FAMILY_KEYS = Object.freeze([
  'sequencePackSha256',
  'releaseManifestSha256',
  'browserPlaybackSha256',
  'ownerApprovalSha256',
  'creativeDirectorApprovalSha256',
  'technicalDirectorApprovalSha256',
  'runtimeRelease',
]);

export class EvaDenseMotionReleaseEvidenceError extends Error {
  constructor(code, message = code) {
    super(message === code ? code : `${code}: ${message}`);
    this.name = 'EvaDenseMotionReleaseEvidenceError';
    this.code = code;
  }
}

function fail(code, message = code) {
  throw new EvaDenseMotionReleaseEvidenceError(code, message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected, code, label = code) {
  if (!isRecord(value)) fail(code, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(code, label);
  }
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function snapshot(value, label) {
  try {
    return deepFreeze(structuredClone(value));
  } catch (error) {
    fail(
      'EVA_DENSE_MOTION_RELEASE_EVIDENCE_SNAPSHOT_INVALID',
      `${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function identifier(value, label) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_ID_INVALID', label);
  }
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_SHA256_INVALID', label);
  }
  return value;
}

function sourceRef(value, label) {
  if (typeof value !== 'string' || !SHA1.test(value)) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_SHA1_INVALID', label);
  }
  return value;
}

function timestamp(value, label) {
  if (
    typeof value !== 'string' ||
    value.length > 40 ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_TIMESTAMP_INVALID', label);
  }
  return value;
}

function exactClosedAuthority(value, label) {
  exactKeys(
    value,
    Object.keys(EVA_DENSE_MOTION_CLOSED_AUTHORITY),
    'EVA_DENSE_MOTION_RELEASE_EVIDENCE_AUTHORITY_INVALID',
    label,
  );
  for (const key of Object.keys(EVA_DENSE_MOTION_CLOSED_AUTHORITY)) {
    if (value[key] !== false) {
      fail(
        'EVA_DENSE_MOTION_RELEASE_EVIDENCE_AUTHORITY_INVALID',
        `${label}.${key}`,
      );
    }
  }
}

function parseVersion(value, label) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/u.test(value)) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_VERSION_INVALID', label);
  }
  return value.split('.').map((part) => Number.parseInt(part, 10));
}

function versionAtLeast(value, minimum, label) {
  const current = parseVersion(value, label);
  const required = parseVersion(minimum, 'minimumDenseRuntimeVersion');
  for (let index = 0; index < 3; index += 1) {
    if (current[index] > required[index]) return;
    if (current[index] < required[index]) {
      fail(
        'EVA_DENSE_MOTION_RELEASE_EVIDENCE_RUNTIME_VERSION_TOO_OLD',
        label,
      );
    }
  }
}

function expectedSecureUrl(asset) {
  return (
    `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/` +
    `v${asset.version}/${asset.publicId}.png`
  );
}

function parseAsset(value, sourceFrame, label) {
  exactKeys(
    value,
    ASSET_KEYS,
    'EVA_DENSE_MOTION_RELEASE_EVIDENCE_ASSET_INVALID',
    label,
  );
  if (
    value.provider !== 'cloudinary' ||
    value.cloudName !== CLOUD_NAME ||
    !HEX32.test(value.assetId) ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1 ||
    !Number.isSafeInteger(value.bytes) ||
    value.bytes < 57 ||
    value.width !== CANVAS.width ||
    value.height !== CANVAS.height ||
    value.format !== 'png' ||
    !HEX32.test(value.etag) ||
    value.createOnly !== true ||
    value.overwrite !== false ||
    value.immutable !== true
  ) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_ASSET_INVALID', label);
  }
  digest(value.sha256, `${label}.sha256`);
  const expectedPublicId = expectedEvaDenseMotionMasterPublicId(
    sourceFrame.ordinal,
  );
  if (
    value.publicId !== expectedPublicId ||
    value.secureUrl !== expectedSecureUrl(value)
  ) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_ASSET_IDENTITY_INVALID', label);
  }
  if (
    sourceFrame.currentMaster &&
    (value.assetId === sourceFrame.currentMaster.assetId ||
      value.publicId === sourceFrame.currentMaster.publicId ||
      value.version === sourceFrame.currentMaster.version ||
      value.secureUrl === sourceFrame.currentMaster.secureUrl)
  ) {
    fail(
      'EVA_DENSE_MOTION_RELEASE_EVIDENCE_FALLBACK_REUSE_INVALID',
      label,
    );
  }
  return value;
}

function parseFrame(value, sourceFrame, assembledAt, index) {
  const label = `frames[${index}]`;
  exactKeys(
    value,
    FRAME_KEYS,
    'EVA_DENSE_MOTION_RELEASE_EVIDENCE_FRAME_INVALID',
    label,
  );
  if (
    value.ordinal !== sourceFrame.ordinal ||
    value.frameId !== sourceFrame.frameId ||
    value.sourceGitBlobSha1 !== sourceFrame.sourceGitBlobSha1
  ) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_FRAME_IDENTITY_INVALID', label);
  }
  sourceRef(value.sourceGitBlobSha1, `${label}.sourceGitBlobSha1`);
  exactKeys(
    value.evidence,
    FRAME_EVIDENCE_KEYS,
    'EVA_DENSE_MOTION_RELEASE_EVIDENCE_FRAME_EVIDENCE_INVALID',
    `${label}.evidence`,
  );
  for (const key of FRAME_EVIDENCE_KEYS) {
    digest(value.evidence[key], `${label}.evidence.${key}`);
  }
  parseAsset(value.masteredAsset, sourceFrame, `${label}.masteredAsset`);
  if (value.masteredAsset.sha256 !== value.evidence.finalReviewedSha256) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_FINAL_HASH_MISMATCH', label);
  }
  exactKeys(
    value.alpha,
    ALPHA_KEYS,
    'EVA_DENSE_MOTION_RELEASE_EVIDENCE_ALPHA_INVALID',
    `${label}.alpha`,
  );
  digest(value.alpha.alphaPlaneSha256, `${label}.alpha.alphaPlaneSha256`);
  if (
    value.alpha.actualRgbaAlpha !== true ||
    value.alpha.hiddenRgbTransparentPixels !== 0 ||
    value.alpha.checkerboardRejected !== true ||
    value.alpha.matteHaloRejected !== true ||
    value.alpha.edgeVisiblePixels !== 0
  ) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_ALPHA_INVALID', label);
  }
  exactKeys(
    value.review,
    REVIEW_KEYS,
    'EVA_DENSE_MOTION_RELEASE_EVIDENCE_REVIEW_INVALID',
    `${label}.review`,
  );
  identifier(value.review.reviewedBy, `${label}.review.reviewedBy`);
  timestamp(value.review.reviewedAt, `${label}.review.reviewedAt`);
  digest(
    value.review.reviewDecisionSha256,
    `${label}.review.reviewDecisionSha256`,
  );
  if (
    value.review.technicalPassed !== true ||
    value.review.creativeApproved !== true ||
    value.review.anatomyPassed !== true ||
    value.review.identityPassed !== true ||
    value.review.silhouetteRegistrationPassed !== true ||
    Date.parse(value.review.reviewedAt) > Date.parse(assembledAt)
  ) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_REVIEW_INVALID', label);
  }
  return value;
}

function parseContinuity(value, expected, assembledAt, index) {
  const label = `continuity[${index}]`;
  exactKeys(
    value,
    CONTINUITY_KEYS,
    'EVA_DENSE_MOTION_RELEASE_EVIDENCE_CONTINUITY_INVALID',
    label,
  );
  if (
    value.fromOrdinal !== expected.fromOrdinal ||
    value.toOrdinal !== expected.toOrdinal ||
    value.faceRegistrationPassed !== true ||
    value.phashContinuityPassed !== true ||
    value.motionReviewPassed !== true
  ) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_CONTINUITY_INVALID', label);
  }
  digest(value.evidenceSha256, `${label}.evidenceSha256`);
  identifier(value.reviewedBy, `${label}.reviewedBy`);
  timestamp(value.reviewedAt, `${label}.reviewedAt`);
  if (Date.parse(value.reviewedAt) > Date.parse(assembledAt)) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_CONTINUITY_INVALID', label);
  }
  return value;
}

function parseFamily(value) {
  exactKeys(
    value,
    FAMILY_KEYS,
    'EVA_DENSE_MOTION_RELEASE_EVIDENCE_FAMILY_INVALID',
    'family',
  );
  for (const key of FAMILY_KEYS.filter((key) => key !== 'runtimeRelease')) {
    digest(value[key], `family.${key}`);
  }
  exactKeys(
    value.runtimeRelease,
    RUNTIME_RELEASE_KEYS,
    'EVA_DENSE_MOTION_RELEASE_EVIDENCE_RUNTIME_RELEASE_INVALID',
    'family.runtimeRelease',
  );
  if (
    value.runtimeRelease.repository !== SOURCE_RUNTIME.repository ||
    value.runtimeRelease.admissionReceiptSchema !==
      SOURCE_RUNTIME.admissionReceiptSchema ||
    value.runtimeRelease.activationApproved !== false ||
    value.runtimeRelease.deploymentApproved !== false
  ) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_RUNTIME_RELEASE_INVALID');
  }
  versionAtLeast(
    value.runtimeRelease.version,
    EVA_DENSE_MOTION_MINIMUM_RELEASE_VERSION,
    'family.runtimeRelease.version',
  );
  sourceRef(value.runtimeRelease.commit, 'family.runtimeRelease.commit');
  sourceRef(value.runtimeRelease.tree, 'family.runtimeRelease.tree');
  return value;
}

function parseRequest(input) {
  const value = snapshot(input, 'release evidence request');
  exactKeys(
    value,
    [
      'schema',
      'admissionId',
      'actorId',
      'assembledAt',
      'workOrder',
      'frames',
      'continuity',
      'family',
      'authority',
    ],
    'EVA_DENSE_MOTION_RELEASE_EVIDENCE_REQUEST_INVALID',
  );
  if (value.schema !== EVA_DENSE_MOTION_RELEASE_EVIDENCE_REQUEST_SCHEMA) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_REQUEST_INVALID');
  }
  identifier(value.admissionId, 'admissionId');
  identifier(value.actorId, 'actorId');
  timestamp(value.assembledAt, 'assembledAt');
  const workOrder = verifyEvaDenseMotionWorkOrder(value.workOrder);
  if (
    workOrder.familyId !== EVA_DENSE_MOTION_FAMILY_ID ||
    workOrder.sourceFamily.expectedFrameCount !==
      EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT ||
    workOrder.runtimeReceiptHandoff.minimumRuntimeVersion !==
      EVA_DENSE_MOTION_MINIMUM_RELEASE_VERSION
  ) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_WORK_ORDER_INVALID');
  }
  if (
    !Array.isArray(value.frames) ||
    value.frames.length !== EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT
  ) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_FRAME_SET_INVALID');
  }
  const frames = value.frames.map((frame, index) =>
    parseFrame(frame, SOURCE_FRAMES[index], value.assembledAt, index),
  );
  const unique = (items, selector) => new Set(items.map(selector)).size;
  if (
    unique(frames, (frame) => frame.masteredAsset.assetId) !== frames.length ||
    unique(frames, (frame) => frame.masteredAsset.publicId) !== frames.length ||
    unique(frames, (frame) => frame.evidence.finalReviewedSha256) !==
      frames.length
  ) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_DUPLICATE_MASTER');
  }
  if (
    !Array.isArray(value.continuity) ||
    value.continuity.length !== CONTINUITY_EDGES.length
  ) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_CONTINUITY_SET_INVALID');
  }
  const continuity = value.continuity.map((edge, index) =>
    parseContinuity(edge, CONTINUITY_EDGES[index], value.assembledAt, index),
  );
  const family = parseFamily(value.family);
  exactClosedAuthority(value.authority, 'authority');
  return deepFreeze({ ...value, workOrder, frames, continuity, family });
}

export function createEvaDenseMotionReleaseEvidenceRequest(input = {}) {
  return snapshot(
    {
      schema: EVA_DENSE_MOTION_RELEASE_EVIDENCE_REQUEST_SCHEMA,
      admissionId: identifier(input.admissionId, 'admissionId'),
      actorId: identifier(input.actorId, 'actorId'),
      assembledAt: timestamp(input.assembledAt, 'assembledAt'),
      workOrder: input.workOrder,
      frames: input.frames,
      continuity: input.continuity,
      family: input.family,
      authority: input.authority ?? EVA_DENSE_MOTION_CLOSED_AUTHORITY,
    },
    'release evidence request',
  );
}

export function compileEvaDenseMotionReleaseEvidence(input) {
  const request = parseRequest(input);
  const body = {
    schema: EVA_DENSE_MOTION_RELEASE_EVIDENCE_SCHEMA,
    admissionId: request.admissionId,
    actorId: request.actorId,
    assembledAt: request.assembledAt,
    characterId: 'eva-female',
    familyId: EVA_DENSE_MOTION_FAMILY_ID,
    workOrder: request.workOrder,
    workOrderFingerprint: request.workOrder.workOrderFingerprint,
    sourceRuntime: SOURCE_RUNTIME,
    minimumDenseRuntimeVersion: EVA_DENSE_MOTION_MINIMUM_RELEASE_VERSION,
    frames: request.frames,
    continuity: request.continuity,
    family: request.family,
    gates: {
      allTenFrameEvidenceComplete: true,
      allTenFinalHashesUnique: true,
      allTenDenseMasterIdentitiesRequired: true,
      activeFallbackAssetsCannotSatisfyDenseSlots: true,
      allTenAssetsImmutable: true,
      allTenAlphaProfilesPassed: true,
      allTenNamedReviewsPassed: true,
      allTenContinuityEdgesPassed: true,
      finalToFirstLoopClosurePassed: true,
      browserPlaybackReverified: true,
      ownerApprovalRecorded: true,
      creativeDirectorApprovalRecorded: true,
      technicalDirectorApprovalRecorded: true,
      runtime037OrNewerPrepared: true,
      runtimeActivationApproved: false,
    },
    readiness: {
      releaseEvidenceComplete: true,
      runtimeReceiptAssemblyReady: true,
      publicationAllowed: false,
      deploymentAllowed: false,
      runtimeActivationAllowed: false,
      activeThreeFrameRigMustRemain: true,
    },
    authority: EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  };
  return deepFreeze({
    ...body,
    releaseEvidenceSha256: sha256EvaDenseMotionWorkOrderDocument(body),
  });
}

export function verifyEvaDenseMotionReleaseEvidence(input) {
  const value = snapshot(input, 'release evidence');
  exactKeys(
    value,
    [
      'schema',
      'admissionId',
      'actorId',
      'assembledAt',
      'characterId',
      'familyId',
      'workOrder',
      'workOrderFingerprint',
      'sourceRuntime',
      'minimumDenseRuntimeVersion',
      'frames',
      'continuity',
      'family',
      'gates',
      'readiness',
      'authority',
      'releaseEvidenceSha256',
    ],
    'EVA_DENSE_MOTION_RELEASE_EVIDENCE_INVALID',
  );
  if (
    value.schema !== EVA_DENSE_MOTION_RELEASE_EVIDENCE_SCHEMA ||
    value.characterId !== 'eva-female' ||
    value.familyId !== EVA_DENSE_MOTION_FAMILY_ID ||
    value.workOrderFingerprint !== value.workOrder?.workOrderFingerprint
  ) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_INVALID');
  }
  digest(value.releaseEvidenceSha256, 'releaseEvidenceSha256');
  const body = { ...value };
  delete body.releaseEvidenceSha256;
  if (
    sha256EvaDenseMotionWorkOrderDocument(body) !==
    value.releaseEvidenceSha256
  ) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_FINGERPRINT_INVALID');
  }
  const expected = compileEvaDenseMotionReleaseEvidence({
    schema: EVA_DENSE_MOTION_RELEASE_EVIDENCE_REQUEST_SCHEMA,
    admissionId: value.admissionId,
    actorId: value.actorId,
    assembledAt: value.assembledAt,
    workOrder: value.workOrder,
    frames: value.frames,
    continuity: value.continuity,
    family: value.family,
    authority: value.authority,
  });
  if (
    canonicalEvaDenseMotionWorkOrderJson(value) !==
    canonicalEvaDenseMotionWorkOrderJson(expected)
  ) {
    fail('EVA_DENSE_MOTION_RELEASE_EVIDENCE_CONTENT_DRIFT');
  }
  return value;
}

export function evaluateEvaDenseMotionReleaseEvidence(input) {
  try {
    const evidence = verifyEvaDenseMotionReleaseEvidence(input);
    return deepFreeze({
      schema: EVA_DENSE_MOTION_RELEASE_EVIDENCE_STATUS_SCHEMA,
      releaseEvidenceSha256: evidence.releaseEvidenceSha256,
      familyId: evidence.familyId,
      frameCount: evidence.frames.length,
      continuityEdgeCount: evidence.continuity.length,
      releaseEvidenceComplete: true,
      runtimeReceiptAssemblyReady: true,
      publicationAllowed: false,
      deploymentAllowed: false,
      runtimeActivationAllowed: false,
      blockingCodes: [
        'EVA_DENSE_MOTION_RUNTIME_RECEIPT_NOT_YET_ASSEMBLED',
        'EVA_DENSE_MOTION_PUBLICATION_SEPARATELY_AUTHORIZED',
        'EVA_DENSE_MOTION_DEPLOYMENT_SEPARATELY_AUTHORIZED',
        'EVA_DENSE_MOTION_ACTIVATION_SEPARATELY_AUTHORIZED',
      ],
      authority: EVA_DENSE_MOTION_CLOSED_AUTHORITY,
    });
  } catch (error) {
    return deepFreeze({
      schema: EVA_DENSE_MOTION_RELEASE_EVIDENCE_STATUS_SCHEMA,
      familyId: EVA_DENSE_MOTION_FAMILY_ID,
      frameCount: 0,
      continuityEdgeCount: 0,
      releaseEvidenceComplete: false,
      runtimeReceiptAssemblyReady: false,
      publicationAllowed: false,
      deploymentAllowed: false,
      runtimeActivationAllowed: false,
      blockingCodes: [
        error instanceof EvaDenseMotionReleaseEvidenceError
          ? error.code
          : 'EVA_DENSE_MOTION_RELEASE_EVIDENCE_INVALID',
      ],
      authority: EVA_DENSE_MOTION_CLOSED_AUTHORITY,
    });
  }
}

export function evaDenseMotionReleaseEvidenceCapabilities() {
  return deepFreeze({
    schema: EVA_DENSE_MOTION_RELEASE_EVIDENCE_CAPABILITIES_SCHEMA,
    requestSchema: EVA_DENSE_MOTION_RELEASE_EVIDENCE_REQUEST_SCHEMA,
    evidenceSchema: EVA_DENSE_MOTION_RELEASE_EVIDENCE_SCHEMA,
    exactWorkOrderFingerprintRequired: true,
    exactTenFrameSetRequired: true,
    exactSourceBlobIdentityRequired: true,
    allTenDenseMasterIdentitiesRequired: true,
    activeFallbackAssetsCannotSatisfyDenseSlots: true,
    immutableVersionedCloudinaryAssetsRequired: true,
    activeThreeFrameProvenanceRetained: true,
    uniqueFinalFrameHashesRequired: true,
    actualRgbaAlphaRequired: true,
    hiddenRgbZeroedRequired: true,
    checkerboardRejected: true,
    matteHaloRejected: true,
    namedHumanFrameReviewsRequired: true,
    allTenContinuityEdgesRequired: true,
    finalToFirstLoopClosureRequired: true,
    browserPlaybackEvidenceRequired: true,
    minimumDenseRuntimeVersion: EVA_DENSE_MOTION_MINIMUM_RELEASE_VERSION,
    runtimeReceiptAssemblySupported: true,
    providerExecution: false,
    cloudinaryUpload: false,
    publication: false,
    deployment: false,
    runtimeActivation: false,
    authority: EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  });
}
