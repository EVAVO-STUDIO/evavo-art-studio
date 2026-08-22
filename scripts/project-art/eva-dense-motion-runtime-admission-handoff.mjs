import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import {
  canonicalRelativePath,
  deepFreeze,
  sha256Document,
} from './avatar-final-pass-provider-candidate-common.mjs';
import {
  EVA_DENSE_MOTION_ALPHA_MASTERING_SCHEMA,
} from './eva-dense-motion-alpha-mastering.mjs';
import {
  EVA_DENSE_MOTION_CONTINUITY_EVIDENCE_SCHEMA,
  EVA_DENSE_MOTION_IDENTITY_EVIDENCE_SCHEMA,
} from './eva-dense-motion-identity-continuity.mjs';
import {
  verifyEvaDenseMotionReleaseEvidence,
} from './eva-dense-motion-release-evidence.mjs';
import {
  verifyEvaDenseMotionTenMasterProgram,
} from './eva-dense-motion-ten-master-program.mjs';

export const EVA_DENSE_MOTION_RUNTIME_ADMISSION_HANDOFF_SCHEMA =
  'evavo.project-art-eva-dense-motion-runtime-admission-handoff.v1';
export const EVA_DENSE_MOTION_RUNTIME_ADMISSION_HANDOFF_PROTOCOL_VERSION =
  '2026-08-22.1';

const FRAME_COUNT = 10;
const PIXEL_COUNT = 1024 * 1536;
const MAXIMUM_JSON_BYTES = 16 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const PHASH = /^[a-f0-9]{16}$/u;

function assert(condition, code, message = code) {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}

function authority() {
  return Object.freeze({
    sealedEvidenceRead: true,
    runtimeAdmissionHandoffCompilation: true,
    humanDecisionCreation: false,
    runtimeAdmissionApproval: false,
    providerExecution: false,
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
  assert(typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'), 'EVA_DENSE_RUNTIME_HANDOFF_ROOT_INVALID', label);
  const normalized = path.normalize(value);
  const metadata = lstatSync(normalized);
  assert(metadata.isDirectory() && !metadata.isSymbolicLink() && realpathSync(normalized) === normalized, 'EVA_DENSE_RUNTIME_HANDOFF_ROOT_INVALID', label);
  return normalized;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveRelative(root, relative, label) {
  const canonical = canonicalRelativePath(relative, label);
  const absolute = path.join(root, ...canonical.split('/'));
  assert(inside(root, absolute), 'EVA_DENSE_RUNTIME_HANDOFF_PATH_ESCAPE', label);
  return absolute;
}

function stableJson(filePath, label) {
  const absolute = path.resolve(filePath);
  const before = lstatSync(absolute);
  assert(
    before.isFile() && !before.isSymbolicLink() && before.nlink === 1 &&
      before.size >= 2 && before.size <= MAXIMUM_JSON_BYTES && realpathSync(absolute) === absolute,
    'EVA_DENSE_RUNTIME_HANDOFF_INPUT_INVALID',
    label,
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(before[field] === after[field], 'EVA_DENSE_RUNTIME_HANDOFF_INPUT_CHANGED', label);
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    assert(false, 'EVA_DENSE_RUNTIME_HANDOFF_JSON_INVALID', label);
  }
}

function verifySelfHash(value, field, schema, code) {
  assert(value?.schema === schema && SHA256.test(value?.[field]), code);
  const body = { ...value };
  delete body[field];
  assert(sha256Document(body) === value[field], code);
  return value;
}

function alphaRecord(workspaceRoot, program, job) {
  const value = verifySelfHash(
    stableJson(resolveRelative(workspaceRoot, job.outputs.alphaMasteringReceipt, 'alphaMasteringReceipt'), `alpha mastering ${job.ordinal}`),
    'alphaMasteringSha256',
    EVA_DENSE_MOTION_ALPHA_MASTERING_SCHEMA,
    'EVA_DENSE_RUNTIME_HANDOFF_ALPHA_INVALID',
  );
  assert(
    value.programSha256 === program.programSha256 && value.ordinal === job.ordinal &&
      value.frameId === job.frameId && value.output?.width === 1024 && value.output?.height === 1536 &&
      Number.isSafeInteger(value.output?.transparentPixels) &&
      Number.isSafeInteger(value.output?.partialAlphaPixels) &&
      Number.isSafeInteger(value.output?.visiblePixels) &&
      value.output.transparentPixels > 0 && value.output.visiblePixels > 0 &&
      value.output.hiddenRgbTransparentPixels === 0 && value.output.edgeVisiblePixels === 0,
    'EVA_DENSE_RUNTIME_HANDOFF_ALPHA_INVALID',
  );
  const opaque = value.output.visiblePixels - value.output.partialAlphaPixels;
  assert(
    opaque > 0 && value.output.transparentPixels + value.output.partialAlphaPixels + opaque === PIXEL_COUNT,
    'EVA_DENSE_RUNTIME_HANDOFF_ALPHA_PIXEL_TOTAL_INVALID',
  );
  return Object.freeze({ value, opaque });
}

function identityRecord(workspaceRoot, program, job) {
  const value = verifySelfHash(
    stableJson(resolveRelative(workspaceRoot, job.outputs.identityEvidence, 'identityEvidence'), `identity ${job.ordinal}`),
    'identityEvidenceSha256',
    EVA_DENSE_MOTION_IDENTITY_EVIDENCE_SCHEMA,
    'EVA_DENSE_RUNTIME_HANDOFF_IDENTITY_INVALID',
  );
  assert(
    value.programSha256 === program.programSha256 && value.ordinal === job.ordinal &&
      value.frameId === job.frameId && value.humanVerified === true && PHASH.test(value.providerPhash) &&
      value.faceRect && Number.isFinite(value.faceRect.x) && Number.isFinite(value.faceRect.y) &&
      Number.isFinite(value.faceRect.width) && Number.isFinite(value.faceRect.height),
    'EVA_DENSE_RUNTIME_HANDOFF_IDENTITY_INVALID',
  );
  return value;
}

function continuityRecord(root, index, program) {
  const fromOrdinal = index + 1;
  const toOrdinal = fromOrdinal === FRAME_COUNT ? 1 : fromOrdinal + 1;
  const filename = `continuity-${String(fromOrdinal).padStart(2, '0')}-to-${String(toOrdinal).padStart(2, '0')}.json`;
  const value = verifySelfHash(
    stableJson(path.join(root, filename), `continuity ${fromOrdinal}->${toOrdinal}`),
    'evidenceSha256',
    EVA_DENSE_MOTION_CONTINUITY_EVIDENCE_SCHEMA,
    'EVA_DENSE_RUNTIME_HANDOFF_CONTINUITY_INVALID',
  );
  assert(
    value.programSha256 === program.programSha256 && value.fromOrdinal === fromOrdinal &&
      value.toOrdinal === toOrdinal && value.faceRegistrationPassed === true &&
      value.phashContinuityPassed === true && value.motionReviewPassed === true &&
      Number.isFinite(value.computedFaceCenterShiftPixels) &&
      Number.isSafeInteger(value.computedPhashHammingDistance) &&
      SHA256.test(value.reviewEvidenceSha256),
    'EVA_DENSE_RUNTIME_HANDOFF_CONTINUITY_INVALID',
  );
  return value;
}

function runtimeAsset(asset) {
  return Object.freeze({
    provider: asset.provider,
    cloudName: asset.cloudName,
    resourceType: 'image',
    deliveryType: 'upload',
    assetId: asset.assetId,
    publicId: asset.publicId,
    version: asset.version,
    bytes: asset.bytes,
    width: asset.width,
    height: asset.height,
    format: asset.format,
    etag: asset.etag,
    sha256: asset.sha256,
    secureUrl: asset.secureUrl,
  });
}

export function compileEvaDenseMotionRuntimeAdmissionHandoff({
  tenMasterProgram,
  releaseEvidence: releaseInput,
  workspaceRoot: workspaceInput,
  continuityRoot: continuityInput,
}) {
  const program = verifyEvaDenseMotionTenMasterProgram(tenMasterProgram);
  const release = verifyEvaDenseMotionReleaseEvidence(releaseInput);
  const workspaceRoot = realDirectory(workspaceInput, 'workspaceRoot');
  const continuityRoot = realDirectory(continuityInput, 'continuityRoot');
  assert(release.familyId === program.familyId && release.frames?.length === FRAME_COUNT, 'EVA_DENSE_RUNTIME_HANDOFF_RELEASE_MISMATCH');

  const frames = program.production.jobs.map((job, index) => {
    const source = release.frames[index];
    const alpha = alphaRecord(workspaceRoot, program, job);
    const identity = identityRecord(workspaceRoot, program, job);
    assert(
      source.ordinal === job.ordinal && source.frameId === job.frameId &&
        source.sourceGitBlobSha1 === job.source.gitBlobSha1 &&
        source.evidence.alphaMasteringReceiptSha256 === alpha.value.alphaMasteringSha256 &&
        source.evidence.identityEvidenceSha256 === identity.identityEvidenceSha256 &&
        source.masteredAsset.sha256 === identity.masteredAssetSha256,
      'EVA_DENSE_RUNTIME_HANDOFF_FRAME_LINEAGE_INVALID',
      `frame ${job.ordinal}`,
    );
    return Object.freeze({
      ordinal: job.ordinal,
      frameId: job.frameId,
      sourcePath: job.source.path,
      sourceGitBlobSha1: job.source.gitBlobSha1,
      alphaMasteringReceiptSha256: source.evidence.alphaMasteringReceiptSha256,
      candidateAssuranceSha256: source.evidence.candidateAssuranceSha256,
      technicalInspectionSha256: source.evidence.technicalInspectionSha256,
      creativeApprovalSha256: source.evidence.creativeApprovalSha256,
      masteredAsset: runtimeAsset(source.masteredAsset),
      alpha: Object.freeze({
        actualRgbaAlpha: true,
        transparentPixelCount: alpha.value.output.transparentPixels,
        semiTransparentPixelCount: alpha.value.output.partialAlphaPixels,
        opaquePixelCount: alpha.opaque,
        hiddenRgbZeroed: alpha.value.output.hiddenRgbTransparentPixels === 0,
        checkerboardRejected: source.alpha.checkerboardRejected,
        matteHaloRejected: source.alpha.matteHaloRejected,
        canvasEdgesClear: alpha.value.output.edgeVisiblePixels === 0,
        verificationSha256: alpha.value.alphaMasteringSha256,
      }),
      identity: Object.freeze({
        faceRect: identity.faceRect,
        phash: identity.providerPhash,
        identityReviewSha256: identity.identityEvidenceSha256,
      }),
    });
  });

  const continuityRecords = Array.from({ length: FRAME_COUNT }, (_, index) => continuityRecord(continuityRoot, index, program));
  const continuity = Object.freeze({
    adjacency: Object.freeze(continuityRecords.map((value) => Object.freeze({
      fromOrdinal: value.fromOrdinal,
      toOrdinal: value.toOrdinal,
      faceCenterShiftPixels: value.computedFaceCenterShiftPixels,
      phashHammingDistance: value.computedPhashHammingDistance,
      registrationReviewSha256: value.evidenceSha256,
      motionReviewSha256: value.reviewEvidenceSha256,
      approved: true,
    }))),
    loopClosureReviewSha256: continuityRecords[FRAME_COUNT - 1].evidenceSha256,
    interpolationReviewSha256: release.family.browserPlaybackSha256,
    approved: true,
  });

  const body = {
    schema: EVA_DENSE_MOTION_RUNTIME_ADMISSION_HANDOFF_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_RUNTIME_ADMISSION_HANDOFF_PROTOCOL_VERSION,
    status: 'ready-for-separate-runtime-admission-approval',
    familyId: release.familyId,
    sourceFamilySha256: release.sourceRuntime.sourceFamilySha256,
    releaseEvidenceSha256: release.releaseEvidenceSha256,
    receiptCreatedAt: release.assembledAt,
    frames: Object.freeze(frames),
    continuity,
    releaseBasis: Object.freeze({
      ownerApprovalSha256: release.family.ownerApprovalSha256,
      creativeDirectorApprovalSha256: release.family.creativeDirectorApprovalSha256,
      technicalDirectorApprovalSha256: release.family.technicalDirectorApprovalSha256,
      sequencePackSha256: release.family.sequencePackSha256,
      releaseManifestSha256: release.family.releaseManifestSha256,
      browserPlaybackEvidenceSha256: release.family.browserPlaybackSha256,
      runtimeVersion: release.family.runtimeRelease.version,
    }),
    runtimeAdmissionApprovalRequired: true,
    activationAuthorityGranted: false,
    authority: authority(),
  };
  return deepFreeze({ ...body, handoffSha256: sha256Document(body) });
}

export function evaDenseMotionRuntimeAdmissionHandoffCapabilities() {
  return deepFreeze({
    schema: 'evavo.project-art-eva-dense-motion-runtime-admission-handoff-capabilities.v1',
    exactTenFramesRequired: true,
    alphaPixelCountsReconstructedFromMasteringEvidence: true,
    exactIdentityFaceRectAndPhashRequired: true,
    exactTenContinuityEdgesRequired: true,
    externalRuntimeAdmissionApprovalRequired: true,
    automaticRuntimeApprovalAllowed: false,
    activationAuthorityGranted: false,
    providerExecution: false,
    cloudinaryUpload: false,
    publication: false,
    deployment: false,
    runtimeActivation: false,
    authority: authority(),
  });
}
