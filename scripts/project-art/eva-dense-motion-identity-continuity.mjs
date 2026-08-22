import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  canonicalRelativePath,
  deepFreeze,
  sha256Document,
  timestamp,
} from './avatar-final-pass-provider-candidate-common.mjs';
import {
  EVA_DENSE_MOTION_CLOUDINARY_FRAME_RECEIPT_SCHEMA,
} from './eva-dense-motion-cloudinary-admission.mjs';
import {
  verifyEvaDenseMotionTenMasterProgram,
} from './eva-dense-motion-ten-master-program.mjs';

export const EVA_DENSE_MOTION_IDENTITY_MEASUREMENT_MANIFEST_SCHEMA =
  'evavo.project-art-eva-dense-motion-identity-measurement-manifest.v1';
export const EVA_DENSE_MOTION_CONTINUITY_REVIEW_MANIFEST_SCHEMA =
  'evavo.project-art-eva-dense-motion-continuity-review-manifest.v1';
export const EVA_DENSE_MOTION_IDENTITY_EVIDENCE_SCHEMA =
  'evavo.project-art-eva-dense-motion-identity-evidence.v1';
export const EVA_DENSE_MOTION_CONTINUITY_EVIDENCE_SCHEMA =
  'evavo.project-art-eva-dense-motion-continuity-evidence.v1';
export const EVA_DENSE_MOTION_IDENTITY_CONTINUITY_RECEIPT_SCHEMA =
  'evavo.project-art-eva-dense-motion-identity-continuity-receipt.v1';
export const EVA_DENSE_MOTION_IDENTITY_CONTINUITY_PROTOCOL_VERSION =
  '2026-08-22.1';

const FRAME_COUNT = 10;
const ANCHOR_ORDINAL = 4;
const MAX_FACE_CENTER_SHIFT = 8;
const MAX_PHASH_HAMMING = 6;
const MAXIMUM_JSON_BYTES = 8 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const PHASH = /^[a-f0-9]{16}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;

function assert(condition, code, message = code) {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}

function authority() {
  return Object.freeze({
    cloudinaryAdmissionRead: true,
    deterministicIdentityCalculation: true,
    namedHumanContinuityReviewRead: true,
    identityEvidencePersistence: true,
    continuityEvidencePersistence: true,
    faceDetectorExecution: false,
    humanDecisionCreation: false,
    automaticMotionApproval: false,
    imageMutation: false,
    cloudinaryUpload: false,
    sequenceRelease: false,
    repositoryMutation: false,
    gitMutation: false,
    publication: false,
    deployment: false,
    runtimeActivation: false,
    forcePush: false,
  });
}

function realDirectory(value, label) {
  assert(
    typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'),
    'EVA_DENSE_IDENTITY_ROOT_INVALID',
    label,
  );
  const normalized = path.normalize(value);
  const metadata = lstatSync(normalized);
  assert(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      realpathSync(normalized) === normalized,
    'EVA_DENSE_IDENTITY_ROOT_INVALID',
    label,
  );
  return normalized;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveRelative(root, relative, label) {
  const canonical = canonicalRelativePath(relative, label);
  const absolute = path.join(root, ...canonical.split('/'));
  assert(inside(root, absolute), 'EVA_DENSE_IDENTITY_PATH_ESCAPE', label);
  return absolute;
}

function stableJson(filePath, label) {
  const absolute = path.resolve(filePath);
  const before = lstatSync(absolute);
  assert(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      before.size >= 2 &&
      before.size <= MAXIMUM_JSON_BYTES &&
      realpathSync(absolute) === absolute,
    'EVA_DENSE_IDENTITY_INPUT_INVALID',
    label,
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(before[field] === after[field], 'EVA_DENSE_IDENTITY_INPUT_CHANGED', label);
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    assert(false, 'EVA_DENSE_IDENTITY_JSON_INVALID', label);
  }
}

function verifySelfHash(value, field, schema, code) {
  assert(value?.schema === schema && SHA256.test(value?.[field]), code);
  const body = { ...value };
  delete body[field];
  assert(sha256Document(body) === value[field], code);
  return value;
}

function namedHuman(value, label) {
  assert(
    value?.actorClass === 'human' &&
      typeof value.actorId === 'string' &&
      SAFE_ID.test(value.actorId) &&
      typeof value.occurredAt === 'string' &&
      new Date(value.occurredAt).toISOString() === value.occurredAt &&
      SHA256.test(value.evidenceSha256),
    'EVA_DENSE_IDENTITY_HUMAN_REVIEWER_INVALID',
    label,
  );
  return value;
}

function rect(value, label) {
  assert(
    value &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y) &&
      Number.isFinite(value.width) &&
      Number.isFinite(value.height) &&
      value.x >= 0 &&
      value.y >= 0 &&
      value.width > 0 &&
      value.height > 0 &&
      value.x + value.width <= 1024 &&
      value.y + value.height <= 1536,
    'EVA_DENSE_IDENTITY_FACE_RECT_INVALID',
    label,
  );
  return Object.freeze({
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
  });
}

function center(faceRect) {
  return Object.freeze({
    x: faceRect.x + faceRect.width / 2,
    y: faceRect.y + faceRect.height / 2,
  });
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function hamming(left, right) {
  assert(PHASH.test(left) && PHASH.test(right), 'EVA_DENSE_IDENTITY_PHASH_INVALID');
  let count = 0;
  for (let index = 0; index < left.length; index += 1) {
    count += (
      Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16)
    ).toString(2).replaceAll('0', '').length;
  }
  return count;
}

function parseMeasurements(input, program) {
  assert(
    input?.schema === EVA_DENSE_MOTION_IDENTITY_MEASUREMENT_MANIFEST_SCHEMA &&
      input.protocolVersion === EVA_DENSE_MOTION_IDENTITY_CONTINUITY_PROTOCOL_VERSION &&
      input.programSha256 === program.programSha256 &&
      Array.isArray(input.frames) &&
      input.frames.length === FRAME_COUNT,
    'EVA_DENSE_IDENTITY_MEASUREMENT_MANIFEST_INVALID',
  );
  namedHuman(input.reviewer, 'identity measurement reviewer');
  return Object.freeze(
    input.frames.map((entry, index) => {
      const job = program.production.jobs[index];
      assert(
        entry.ordinal === job.ordinal &&
          entry.frameId === job.frameId &&
          entry.measurementSource === 'independent-face-registration-review' &&
          SHA256.test(entry.measurementEvidenceSha256) &&
          entry.humanVerified === true,
        'EVA_DENSE_IDENTITY_MEASUREMENT_FRAME_INVALID',
        `frame ${index + 1}`,
      );
      return Object.freeze({ ...entry, faceRect: rect(entry.faceRect, `frame ${index + 1}`) });
    }),
  );
}

function parseContinuity(input, program) {
  assert(
    input?.schema === EVA_DENSE_MOTION_CONTINUITY_REVIEW_MANIFEST_SCHEMA &&
      input.protocolVersion === EVA_DENSE_MOTION_IDENTITY_CONTINUITY_PROTOCOL_VERSION &&
      input.programSha256 === program.programSha256 &&
      Array.isArray(input.edges) &&
      input.edges.length === FRAME_COUNT,
    'EVA_DENSE_CONTINUITY_REVIEW_MANIFEST_INVALID',
  );
  return Object.freeze(
    input.edges.map((edge, index) => {
      const expectedFrom = index + 1;
      const expectedTo = expectedFrom === FRAME_COUNT ? 1 : expectedFrom + 1;
      assert(
        edge.fromOrdinal === expectedFrom &&
          edge.toOrdinal === expectedTo &&
          edge.faceRegistrationPassed === true &&
          edge.motionReviewPassed === true &&
          SHA256.test(edge.reviewEvidenceSha256),
        'EVA_DENSE_CONTINUITY_REVIEW_EDGE_INVALID',
        `edge ${expectedFrom}->${expectedTo}`,
      );
      namedHuman(edge.reviewer, `edge ${expectedFrom}->${expectedTo}`);
      return edge;
    }),
  );
}

function cloudinaryFrameReceipt(workspaceRoot, program, job) {
  const value = stableJson(
    resolveRelative(workspaceRoot, job.outputs.cloudinaryUploadReceipt, 'cloudinaryUploadReceipt'),
    `Cloudinary admission frame ${job.ordinal}`,
  );
  verifySelfHash(
    value,
    'admissionSha256',
    EVA_DENSE_MOTION_CLOUDINARY_FRAME_RECEIPT_SCHEMA,
    'EVA_DENSE_IDENTITY_CLOUDINARY_RECEIPT_INVALID',
  );
  assert(
    value.status === 'immutable-reviewed-dense-master-admitted' &&
      value.programSha256 === program.programSha256 &&
      value.ordinal === job.ordinal &&
      value.frameId === job.frameId &&
      value.masteredAsset?.sha256 &&
      PHASH.test(value.providerEvidence?.phash),
    'EVA_DENSE_IDENTITY_CLOUDINARY_RECEIPT_INVALID',
  );
  return value;
}

function writeCreateOnly(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const handle = openSync(filePath, 'wx', 0o600);
  try {
    writeFileSync(handle, `${JSON.stringify(value, null, 2)}\n`);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

export function compileEvaDenseMotionIdentityContinuityEvidence({
  tenMasterProgram,
  workspaceRoot: workspaceInput,
  identityMeasurementManifest,
  continuityReviewManifest,
  compiledAt,
}) {
  const program = verifyEvaDenseMotionTenMasterProgram(tenMasterProgram);
  const workspaceRoot = realDirectory(workspaceInput, 'workspaceRoot');
  const at = timestamp(compiledAt, 'compiledAt');
  const measurements = parseMeasurements(identityMeasurementManifest, program);
  const reviews = parseContinuity(continuityReviewManifest, program);
  const cloudinary = program.production.jobs.map((job) =>
    cloudinaryFrameReceipt(workspaceRoot, program, job),
  );
  const anchorIndex = ANCHOR_ORDINAL - 1;
  const anchorCenter = center(measurements[anchorIndex].faceRect);
  const anchorPhash = cloudinary[anchorIndex].providerEvidence.phash;

  const identities = program.production.jobs.map((job, index) => {
    const faceCenter = center(measurements[index].faceRect);
    const faceCenterShiftPixels = distance(faceCenter, anchorCenter);
    const phashHammingDistance = hamming(
      cloudinary[index].providerEvidence.phash,
      anchorPhash,
    );
    assert(
      faceCenterShiftPixels <= MAX_FACE_CENTER_SHIFT &&
        phashHammingDistance <= MAX_PHASH_HAMMING,
      'EVA_DENSE_IDENTITY_THRESHOLD_EXCEEDED',
      `frame ${job.ordinal}`,
    );
    const body = {
      schema: EVA_DENSE_MOTION_IDENTITY_EVIDENCE_SCHEMA,
      protocolVersion: EVA_DENSE_MOTION_IDENTITY_CONTINUITY_PROTOCOL_VERSION,
      status: 'identity-registration-passed',
      compiledAt: at,
      programSha256: program.programSha256,
      ordinal: job.ordinal,
      frameId: job.frameId,
      anchorOrdinal: ANCHOR_ORDINAL,
      masteredAssetSha256: cloudinary[index].masteredAsset.sha256,
      cloudinaryAdmissionSha256: cloudinary[index].admissionSha256,
      providerPhash: cloudinary[index].providerEvidence.phash,
      anchorPhash,
      phashHammingDistance,
      maximumPhashHammingDistance: MAX_PHASH_HAMMING,
      faceRect: measurements[index].faceRect,
      faceCenter,
      anchorFaceCenter: anchorCenter,
      faceCenterShiftPixels,
      maximumFaceCenterShiftPixels: MAX_FACE_CENTER_SHIFT,
      measurementEvidenceSha256: measurements[index].measurementEvidenceSha256,
      reviewer: identityMeasurementManifest.reviewer,
      humanVerified: true,
      authority: authority(),
    };
    return deepFreeze({ ...body, identityEvidenceSha256: sha256Document(body) });
  });

  const continuity = reviews.map((review, index) => {
    const fromIndex = index;
    const toIndex = index === FRAME_COUNT - 1 ? 0 : index + 1;
    const computedPhashDistance = hamming(
      cloudinary[fromIndex].providerEvidence.phash,
      cloudinary[toIndex].providerEvidence.phash,
    );
    const computedFaceCenterShift = distance(
      center(measurements[fromIndex].faceRect),
      center(measurements[toIndex].faceRect),
    );
    assert(
      computedPhashDistance <= MAX_PHASH_HAMMING &&
        computedFaceCenterShift <= MAX_FACE_CENTER_SHIFT,
      'EVA_DENSE_CONTINUITY_THRESHOLD_EXCEEDED',
      `edge ${review.fromOrdinal}->${review.toOrdinal}`,
    );
    const body = {
      schema: EVA_DENSE_MOTION_CONTINUITY_EVIDENCE_SCHEMA,
      protocolVersion: EVA_DENSE_MOTION_IDENTITY_CONTINUITY_PROTOCOL_VERSION,
      status: 'named-human-continuity-review-passed',
      compiledAt: at,
      programSha256: program.programSha256,
      fromOrdinal: review.fromOrdinal,
      toOrdinal: review.toOrdinal,
      fromIdentityEvidenceSha256: identities[fromIndex].identityEvidenceSha256,
      toIdentityEvidenceSha256: identities[toIndex].identityEvidenceSha256,
      computedFaceCenterShiftPixels: computedFaceCenterShift,
      computedPhashHammingDistance: computedPhashDistance,
      faceRegistrationPassed: true,
      phashContinuityPassed: true,
      motionReviewPassed: true,
      reviewEvidenceSha256: review.reviewEvidenceSha256,
      reviewer: review.reviewer,
      authority: authority(),
    };
    return deepFreeze({ ...body, evidenceSha256: sha256Document(body) });
  });

  return deepFreeze({
    status: 'ready-to-persist-identity-and-continuity-evidence',
    familyId: program.familyId,
    programSha256: program.programSha256,
    compiledAt: at,
    anchorOrdinal: ANCHOR_ORDINAL,
    identities: Object.freeze(identities),
    continuity: Object.freeze(continuity),
    effects: Object.freeze({
      identityEvidencePrepared: FRAME_COUNT,
      continuityEvidencePrepared: FRAME_COUNT,
      faceDetectorExecutionsPerformed: 0,
      humanDecisionsCreated: 0,
      automaticMotionApprovalsMade: 0,
      imagesMutated: 0,
      cloudinaryUploadsPerformed: 0,
      sequencesReleased: 0,
      runtimeActivationsPerformed: 0,
    }),
    authority: authority(),
  });
}

export function persistEvaDenseMotionIdentityContinuityEvidence({
  tenMasterProgram,
  workspaceRoot: workspaceInput,
  outputRoot: outputInput,
  compiled,
}) {
  const program = verifyEvaDenseMotionTenMasterProgram(tenMasterProgram);
  const workspaceRoot = realDirectory(workspaceInput, 'workspaceRoot');
  const outputRoot = realDirectory(outputInput, 'outputRoot');
  assert(
    compiled?.programSha256 === program.programSha256 &&
      compiled.identities?.length === FRAME_COUNT &&
      compiled.continuity?.length === FRAME_COUNT,
    'EVA_DENSE_IDENTITY_COMPILED_INVALID',
  );
  const identityTargets = program.production.jobs.map((job, index) => ({
    path: resolveRelative(workspaceRoot, job.outputs.identityEvidence, 'identityEvidence'),
    value: compiled.identities[index],
  }));
  const continuityTargets = compiled.continuity.map((value) => ({
    path: path.join(
      outputRoot,
      `continuity-${String(value.fromOrdinal).padStart(2, '0')}-to-${String(value.toOrdinal).padStart(2, '0')}.json`,
    ),
    value,
  }));
  const targets = [...identityTargets, ...continuityTargets];
  for (const target of targets) {
    assert(!existsSync(target.path), 'EVA_DENSE_IDENTITY_OUTPUT_EXISTS', target.path);
  }
  for (const target of targets) writeCreateOnly(target.path, target.value);

  const body = {
    schema: EVA_DENSE_MOTION_IDENTITY_CONTINUITY_RECEIPT_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_IDENTITY_CONTINUITY_PROTOCOL_VERSION,
    status: 'succeeded-ten-identity-and-continuity-records-persisted',
    familyId: compiled.familyId,
    programSha256: compiled.programSha256,
    compiledAt: compiled.compiledAt,
    anchorOrdinal: compiled.anchorOrdinal,
    identities: Object.freeze(compiled.identities.map((value) => Object.freeze({
      ordinal: value.ordinal,
      identityEvidenceSha256: value.identityEvidenceSha256,
    }))),
    continuity: Object.freeze(compiled.continuity.map((value) => Object.freeze({
      fromOrdinal: value.fromOrdinal,
      toOrdinal: value.toOrdinal,
      evidenceSha256: value.evidenceSha256,
      reviewer: value.reviewer,
    }))),
    effects: compiled.effects,
    authority: authority(),
  };
  return deepFreeze({ ...body, receiptSha256: sha256Document(body) });
}

export function evaDenseMotionIdentityContinuityCapabilities() {
  return deepFreeze({
    schema: 'evavo.project-art-eva-dense-motion-identity-continuity-capabilities.v1',
    exactFrameCount: FRAME_COUNT,
    anchorOrdinal: ANCHOR_ORDINAL,
    maximumFaceCenterShiftPixels: MAX_FACE_CENTER_SHIFT,
    maximumPhashHammingDistance: MAX_PHASH_HAMMING,
    providerPhashBoundToAdmittedAsset: true,
    independentFaceMeasurementManifestRequired: true,
    namedHumanMeasurementVerificationRequired: true,
    namedHumanMotionReviewRequiredForEveryEdge: true,
    loopClosureTenToOneRequired: true,
    automaticMotionApprovalAllowed: false,
    faceDetectorExecution: false,
    imageMutation: false,
    cloudinaryUpload: false,
    sequenceRelease: false,
    runtimeActivation: false,
    authority: authority(),
  });
}
