import { createHash } from 'node:crypto';

import {
  ACTIVE_MASTER_BY_ORDINAL,
  CANVAS,
  CLOUD_NAME,
  EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT,
  EVA_DENSE_MOTION_FAMILY_ID,
  FRAME_RELEASE_GATES,
  RAW_FRAMES,
  REQUIRED_STAGES,
  RUNTIME,
  RUNTIME_FRAME_EVIDENCE_FIELDS,
  SAFE_ID,
  SOURCE_CONTRACT_SHA256,
  SOURCE_FAMILY_SHA256,
  SOURCE_TREE_SHA1,
} from './eva-dense-motion-work-order-data.mjs';

export class EvaDenseMotionWorkOrderError extends Error {
  constructor(code, message = code) {
    super(message === code ? code : `${code}: ${message}`);
    this.name = 'EvaDenseMotionWorkOrderError';
    this.code = code;
  }
}

export function fail(code, message = code) {
  throw new EvaDenseMotionWorkOrderError(code, message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function exactKeys(value, expected, code, label = code) {
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

export function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return Object.is(value, -0) ? 0 : value;
  }
  fail('EVA_DENSE_MOTION_WORK_ORDER_JSON_INVALID');
}

export function canonicalEvaDenseMotionWorkOrderJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256EvaDenseMotionWorkOrderDocument(value) {
  return createHash('sha256')
    .update(canonicalEvaDenseMotionWorkOrderJson(value), 'utf8')
    .digest('hex');
}

export function snapshot(value, label) {
  try {
    return deepFreeze(canonicalize(structuredClone(value)));
  } catch (error) {
    fail(
      'EVA_DENSE_MOTION_WORK_ORDER_SNAPSHOT_INVALID',
      `${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function identifier(value, label) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    fail('EVA_DENSE_MOTION_WORK_ORDER_ID_INVALID', label);
  }
  return value;
}

export function timestamp(value, label) {
  if (
    typeof value !== 'string' ||
    value.length > 40 ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    fail('EVA_DENSE_MOTION_WORK_ORDER_TIMESTAMP_INVALID', label);
  }
  return value;
}

export function canonicalRelativePath(value, label) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 2048 ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    value.startsWith('../') ||
    value.includes('/../') ||
    value.includes('//') ||
    value === '.' ||
    value === '..'
  ) {
    fail('EVA_DENSE_MOTION_WORK_ORDER_PATH_INVALID', label);
  }
  const normalized = value.split('/').reduce((parts, part) => {
    if (part === '' || part === '.') return parts;
    if (part === '..') fail('EVA_DENSE_MOTION_WORK_ORDER_PATH_INVALID', label);
    parts.push(part);
    return parts;
  }, []).join('/');
  if (normalized !== value || /^[A-Za-z]:/u.test(value)) {
    fail('EVA_DENSE_MOTION_WORK_ORDER_PATH_INVALID', label);
  }
  return value;
}

export function exactClosedAuthority(value, label) {
  exactKeys(
    value,
    Object.keys(EVA_DENSE_MOTION_CLOSED_AUTHORITY),
    'EVA_DENSE_MOTION_WORK_ORDER_AUTHORITY_INVALID',
    label,
  );
  for (const [key, expected] of Object.entries(
    EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  )) {
    if (value[key] !== expected) {
      fail('EVA_DENSE_MOTION_WORK_ORDER_AUTHORITY_INVALID', `${label}.${key}`);
    }
  }
}

export function exactObject(value, expected, code, label) {
  if (
    canonicalEvaDenseMotionWorkOrderJson(value) !==
    canonicalEvaDenseMotionWorkOrderJson(expected)
  ) {
    fail(code, label);
  }
}

function expectedPublicId(ordinal) {
  return (
    'evavo/avatar-runtime/eva-female/dense-motion/' +
    `${EVA_DENSE_MOTION_FAMILY_ID}-frame-${String(ordinal).padStart(2, '0')}-master-v1`
  );
}

export function expectedEvaDenseMotionMasterPublicId(ordinal) {
  if (
    !Number.isSafeInteger(ordinal) ||
    ordinal < 1 ||
    ordinal > EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT
  ) {
    fail('EVA_DENSE_MOTION_WORK_ORDER_ORDINAL_INVALID', 'ordinal');
  }
  return expectedPublicId(ordinal);
}

export const SOURCE_FRAMES = Object.freeze(
  RAW_FRAMES.map(([ordinal, timestampText, sourceGitBlobSha1]) => {
    const currentMaster = ACTIVE_MASTER_BY_ORDINAL[ordinal] ?? null;
    return deepFreeze({
      ordinal,
      frameId:
        `${EVA_DENSE_MOTION_FAMILY_ID}-frame-` +
        String(ordinal).padStart(2, '0'),
      sourcePath:
        `assets/eva-female/ChatGPT Image Aug 9, 2026, ${timestampText}.png`,
      sourceGitBlobSha1,
      currentState: currentMaster
        ? 'active-three-frame-master'
        : 'pending-mastering',
      currentMaster,
    });
  }),
);

function frameOutputs(outputRoot, ordinal) {
  const root =
    `${outputRoot}/frames/frame-${String(ordinal).padStart(2, '0')}`;
  return deepFreeze({
    frameRoot: root,
    sourceMaterialization: `${root}/source.materialization.json`,
    sourceInspection: `${root}/source.inspection.json`,
    denseCandidate: `${root}/candidate.png`,
    candidateAssurance: `${root}/candidate.assurance.json`,
    alphaMatte: `${root}/alpha-matte.png`,
    alphaMatteReview: `${root}/alpha-matte.review.json`,
    alphaMastered: `${root}/master.alpha-mastered.png`,
    alphaMasteringReceipt: `${root}/master.alpha-mastering.json`,
    frameFinisherReceipt: `${root}/master.frame-finisher.json`,
    technicalInspection: `${root}/master.technical-inspection.json`,
    creativeApproval: `${root}/master.creative-approval.json`,
    cloudinaryUploadReceipt: `${root}/master.cloudinary-upload.json`,
    identityEvidence: `${root}/master.identity-evidence.json`,
    runtimeFrameEvidence: `${root}/master.runtime-frame-evidence.json`,
  });
}

export function frameJob(source, outputRoot) {
  const publicId = expectedPublicId(source.ordinal);
  return deepFreeze({
    jobId:
      `master-${EVA_DENSE_MOTION_FAMILY_ID}-frame-` +
      String(source.ordinal).padStart(2, '0'),
    ordinal: source.ordinal,
    frameId: source.frameId,
    source: {
      repository: RUNTIME.repository,
      runtimeCommit: RUNTIME.commit,
      sourceTreeSha1: SOURCE_TREE_SHA1,
      sourceContractSha256: SOURCE_CONTRACT_SHA256,
      sourceFamilySha256: SOURCE_FAMILY_SHA256,
      path: source.sourcePath,
      gitBlobSha1: source.sourceGitBlobSha1,
      readOnly: true,
      runtimeDeliveryAllowed: false,
    },
    canvas: CANVAS,
    stages: REQUIRED_STAGES,
    outputs: frameOutputs(outputRoot, source.ordinal),
    runtimeAdmissionEvidenceFields: RUNTIME_FRAME_EVIDENCE_FIELDS,
    cloudinary: {
      provider: 'cloudinary',
      cloudName: CLOUD_NAME,
      resourceType: 'image',
      deliveryType: 'upload',
      format: 'png',
      publicId,
      versionedSecureUrlRequired: true,
      expectedSecureUrlPattern:
        `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/` +
        `v<version>/${publicId}.png`,
      createOnly: true,
      overwrite: false,
      uniqueAssetIdRequired: true,
      uniqueMasterSha256Required: true,
    },
    qualityPolicy: {
      actualRgbaAlphaRequired: true,
      hiddenRgbZeroedRequired: true,
      checkerboardRejected: true,
      matteHaloRejected: true,
      canvasEdgesClearRequired: true,
      width: CANVAS.width,
      height: CANVAS.height,
      identityAnchorOrdinal: 4,
      maximumFaceCenterShiftPixels: 8,
      maximumPhashHammingDistance: 6,
      independentTechnicalInspectionRequired: true,
      independentCreativeApprovalRequired: true,
    },
    releaseGates: FRAME_RELEASE_GATES,
    authority: EVA_DENSE_MOTION_CLOSED_AUTHORITY,
  });
}

export const CONTINUITY_EDGES = Object.freeze(
  Array.from({ length: EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT }, (_, index) =>
    deepFreeze({
      fromOrdinal: index + 1,
      toOrdinal:
        index + 1 === EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT
          ? 1
          : index + 2,
      fromFrameId:
        `${EVA_DENSE_MOTION_FAMILY_ID}-frame-` +
        String(index + 1).padStart(2, '0'),
      toFrameId:
        `${EVA_DENSE_MOTION_FAMILY_ID}-frame-` +
        String(
          index + 1 === EVA_DENSE_MOTION_EXPECTED_FRAME_COUNT
            ? 1
            : index + 2,
        ).padStart(2, '0'),
      faceRegistrationReviewRequired: true,
      phashContinuityReviewRequired: true,
      motionReviewRequired: true,
      approved: false,
    }),
  ),
);
