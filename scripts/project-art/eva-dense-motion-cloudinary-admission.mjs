import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  canonicalRelativePath,
  deepFreeze,
  sha256Bytes,
  sha256Document,
  timestamp,
} from './avatar-final-pass-provider-candidate-common.mjs';
import {
  EVA_DENSE_MOTION_CREATIVE_APPROVAL_EVIDENCE_SCHEMA,
  EVA_DENSE_MOTION_TECHNICAL_INSPECTION_SCHEMA,
} from './eva-dense-motion-reviewed-frame-evidence.mjs';
import { verifyEvaDenseMotionTenMasterProgram } from './eva-dense-motion-ten-master-program.mjs';

export const EVA_DENSE_MOTION_CLOUDINARY_UPLOAD_PLAN_SCHEMA =
  'evavo.project-art-eva-dense-motion-cloudinary-upload-plan.v1';
export const EVA_DENSE_MOTION_CLOUDINARY_PROVIDER_MANIFEST_SCHEMA =
  'evavo.project-art-eva-dense-motion-cloudinary-provider-manifest.v1';
export const EVA_DENSE_MOTION_CLOUDINARY_ADMISSION_RECEIPT_SCHEMA =
  'evavo.project-art-eva-dense-motion-cloudinary-admission-receipt.v1';
export const EVA_DENSE_MOTION_CLOUDINARY_FRAME_RECEIPT_SCHEMA =
  'evavo.project-art-eva-dense-motion-cloudinary-frame-receipt.v1';
export const EVA_DENSE_MOTION_CLOUDINARY_PROTOCOL_VERSION = '2026-08-22.2';

const FRAME_COUNT = 10;
const CLOUD_NAME = 'dntogqtey';
const MAX_JSON = 8 * 1024 * 1024;
const MAX_PNG = 64 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const HEX32 = /^[a-f0-9]{32}$/u;
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
    reviewedFrameRead: true,
    uploadPlanning: true,
    providerResponseAdmission: true,
    uploadReceiptPersistence: true,
    providerExecution: false,
    network: false,
    imageMutation: false,
    humanDecisionCreation: false,
    automaticCreativeDecision: false,
    candidatePromotion: false,
    cloudinaryDelete: false,
    cloudinaryOverwrite: false,
    sequenceAdmission: false,
    sequenceRelease: false,
    targetRepositoryMutation: false,
    gitMutation: false,
    deployment: false,
    publication: false,
    runtimeActivation: false,
    forcePush: false,
  });
}

function realDirectory(value, label) {
  assert(typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'), 'EVA_DENSE_CLOUDINARY_ROOT_INVALID', label);
  const normalized = path.normalize(value);
  const metadata = lstatSync(normalized);
  assert(metadata.isDirectory() && !metadata.isSymbolicLink() && realpathSync(normalized) === normalized, 'EVA_DENSE_CLOUDINARY_ROOT_INVALID', label);
  return normalized;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveRelative(root, relative, label) {
  const canonical = canonicalRelativePath(relative, label);
  const absolute = path.join(root, ...canonical.split('/'));
  assert(inside(root, absolute), 'EVA_DENSE_CLOUDINARY_PATH_ESCAPE', label);
  return absolute;
}

function stableFile(filePath, label, maximum, minimum) {
  const lexical = path.resolve(filePath);
  const before = lstatSync(lexical);
  assert(
    before.isFile() && !before.isSymbolicLink() && before.nlink === 1 &&
      before.size >= minimum && before.size <= maximum && realpathSync(lexical) === lexical,
    'EVA_DENSE_CLOUDINARY_INPUT_INVALID',
    label,
  );
  const bytes = readFileSync(lexical);
  const after = lstatSync(lexical);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(before[field] === after[field], 'EVA_DENSE_CLOUDINARY_INPUT_CHANGED', label);
  }
  return Object.freeze({ absolute: lexical, bytes, sha256: sha256Bytes(bytes) });
}

function stableJson(filePath, label) {
  const file = stableFile(filePath, label, MAX_JSON, 2);
  try {
    return Object.freeze({ ...file, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)) });
  } catch {
    assert(false, 'EVA_DENSE_CLOUDINARY_JSON_INVALID', label);
  }
}

function verifySelfHash(value, field, schema, code) {
  assert(value?.schema === schema && SHA256.test(value?.[field]), code);
  const body = { ...value };
  delete body[field];
  assert(sha256Document(body) === value[field], code);
  return value;
}

function reviewedFrame(workspaceRoot, program, job) {
  const technical = verifySelfHash(
    stableJson(resolveRelative(workspaceRoot, job.outputs.technicalInspection, 'technicalInspection'), 'technical inspection').value,
    'technicalInspectionSha256',
    EVA_DENSE_MOTION_TECHNICAL_INSPECTION_SCHEMA,
    'EVA_DENSE_CLOUDINARY_TECHNICAL_INSPECTION_INVALID',
  );
  const creative = verifySelfHash(
    stableJson(resolveRelative(workspaceRoot, job.outputs.creativeApproval, 'creativeApproval'), 'creative approval evidence').value,
    'creativeApprovalSha256',
    EVA_DENSE_MOTION_CREATIVE_APPROVAL_EVIDENCE_SCHEMA,
    'EVA_DENSE_CLOUDINARY_CREATIVE_APPROVAL_INVALID',
  );
  assert(
    technical.status === 'passed-independent-technical-inspection' &&
      technical.programSha256 === program.programSha256 &&
      technical.jobId === job.jobId && technical.ordinal === job.ordinal && technical.frameId === job.frameId &&
      technical.independentChecks?.candidateAssurancePassed === true &&
      technical.independentChecks?.pngStructureParserPassed === true &&
      technical.independentChecks?.finalFramePixelInspectorPassed === true &&
      technical.independentChecks?.humanTechnicalGatePassed === true &&
      creative.status === 'named-human-creative-approval-lineage-sealed' &&
      creative.programSha256 === program.programSha256 &&
      creative.jobId === job.jobId && creative.ordinal === job.ordinal && creative.frameId === job.frameId &&
      creative.creativeApproved === true && creative.reviewer?.actorClass === 'human' &&
      creative.finalFrameSha256 === technical.finalFrame?.sha256,
    'EVA_DENSE_CLOUDINARY_REVIEWED_FRAME_INVALID',
  );
  const final = stableFile(resolveRelative(workspaceRoot, technical.finalFrame.path, 'finalFrame'), 'final reviewed frame', MAX_PNG, 57);
  assert(
    final.sha256 === technical.finalFrame.sha256 && final.sha256 === creative.finalFrameSha256 &&
      final.bytes.length === technical.finalFrame.bytes,
    'EVA_DENSE_CLOUDINARY_FINAL_FRAME_DRIFT',
  );
  return Object.freeze({ technical, creative, final });
}

function secureUrl(version, publicId) {
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/v${version}/${publicId}.png`;
}

export function compileEvaDenseMotionCloudinaryUploadPlan({ tenMasterProgram, workspaceRoot: workspaceInput, preparedAt }) {
  const program = verifyEvaDenseMotionTenMasterProgram(tenMasterProgram);
  const workspaceRoot = realDirectory(workspaceInput, 'workspaceRoot');
  const at = timestamp(preparedAt, 'preparedAt');
  const frames = program.production.jobs.map((job) => {
    const reviewed = reviewedFrame(workspaceRoot, program, job);
    return deepFreeze({
      ordinal: job.ordinal,
      frameId: job.frameId,
      localFile: Object.freeze({
        path: reviewed.technical.finalFrame.path,
        sha256: reviewed.final.sha256,
        bytes: reviewed.final.bytes.length,
        width: 1024,
        height: 1536,
      }),
      technicalInspectionSha256: reviewed.technical.technicalInspectionSha256,
      creativeApprovalSha256: reviewed.creative.creativeApprovalSha256,
      humanReviewer: reviewed.creative.reviewer,
      uploadRequest: Object.freeze({
        resource_type: 'image',
        type: 'upload',
        public_id: job.cloudinary.publicId,
        format: 'png',
        overwrite: false,
        phash: true,
        backup: true,
        unique_filename: false,
      }),
      expected: Object.freeze({
        cloudName: CLOUD_NAME,
        publicId: job.cloudinary.publicId,
        createOnly: true,
        overwrite: false,
        uniqueAssetIdRequired: true,
        versionedSecureUrlRequired: true,
        localSha256MustRemainMasterSha256: true,
      }),
    });
  });
  assert(frames.length === FRAME_COUNT, 'EVA_DENSE_CLOUDINARY_FRAME_COUNT_INVALID');
  const body = {
    schema: EVA_DENSE_MOTION_CLOUDINARY_UPLOAD_PLAN_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_CLOUDINARY_PROTOCOL_VERSION,
    status: 'ready-for-explicit-reviewed-frame-cloudinary-upload',
    preparedAt: at,
    familyId: program.familyId,
    programSha256: program.programSha256,
    frameCount: FRAME_COUNT,
    frames: Object.freeze(frames),
    policy: Object.freeze({
      allTenReviewedBeforeProviderExecution: true,
      exactPublicIdsRequired: true,
      createOnly: true,
      overwrite: false,
      uploadMustPreserveReviewedPngBytes: true,
      providerExecutionRequiresSeparateNetworkAuthority: true,
      partialFamilyActivationAllowed: false,
    }),
    authority: authority(),
  };
  return deepFreeze({ ...body, uploadPlanSha256: sha256Document(body) });
}

function verifyUploadPlan(input) {
  assert(input?.schema === EVA_DENSE_MOTION_CLOUDINARY_UPLOAD_PLAN_SCHEMA && input.protocolVersion === EVA_DENSE_MOTION_CLOUDINARY_PROTOCOL_VERSION && SHA256.test(input.uploadPlanSha256) && input.frameCount === FRAME_COUNT && input.frames?.length === FRAME_COUNT, 'EVA_DENSE_CLOUDINARY_UPLOAD_PLAN_INVALID');
  const body = { ...input };
  delete body.uploadPlanSha256;
  assert(sha256Document(body) === input.uploadPlanSha256, 'EVA_DENSE_CLOUDINARY_UPLOAD_PLAN_HASH_MISMATCH');
  return input;
}

function verifyProviderManifest(input, plan, admittedAt) {
  assert(
    input?.schema === EVA_DENSE_MOTION_CLOUDINARY_PROVIDER_MANIFEST_SCHEMA &&
      input.protocolVersion === EVA_DENSE_MOTION_CLOUDINARY_PROTOCOL_VERSION &&
      input.uploadPlanSha256 === plan.uploadPlanSha256 && input.frames?.length === FRAME_COUNT,
    'EVA_DENSE_CLOUDINARY_PROVIDER_MANIFEST_INVALID',
  );
  timestamp(input.completedAt, 'providerManifest.completedAt');
  assert(Date.parse(input.completedAt) <= Date.parse(admittedAt), 'EVA_DENSE_CLOUDINARY_PROVIDER_MANIFEST_TIME_INVALID');
  const assetIds = new Set();
  const versionKeys = new Set();
  const publicIds = new Set();
  const frames = input.frames.map((frame, index) => {
    const expected = plan.frames[index];
    assert(
      frame.ordinal === expected.ordinal && frame.frameId === expected.frameId &&
      frame.provider === 'cloudinary' && frame.cloudName === CLOUD_NAME && HEX32.test(frame.assetId) &&
      frame.publicId === expected.uploadRequest.public_id && Number.isSafeInteger(frame.version) && frame.version > 0 &&
      Number.isSafeInteger(frame.bytes) && frame.bytes === expected.localFile.bytes && frame.width === 1024 && frame.height === 1536 &&
      frame.format === 'png' && HEX32.test(frame.etag) && frame.secureUrl === secureUrl(frame.version, frame.publicId) &&
      frame.localReviewedSha256 === expected.localFile.sha256 && PHASH.test(frame.phash) &&
      SHA256.test(frame.providerResponseSha256) && frame.createOnly === true && frame.overwrite === false,
      'EVA_DENSE_CLOUDINARY_PROVIDER_FRAME_INVALID',
      `frame ${index + 1}`,
    );
    assetIds.add(frame.assetId);
    versionKeys.add(`${frame.publicId}@${frame.version}`);
    publicIds.add(frame.publicId);
    return frame;
  });
  assert(assetIds.size === FRAME_COUNT && versionKeys.size === FRAME_COUNT && publicIds.size === FRAME_COUNT, 'EVA_DENSE_CLOUDINARY_PROVIDER_IDENTITY_DUPLICATE');
  return Object.freeze(frames);
}

export function compileEvaDenseMotionCloudinaryAdmission({ uploadPlan: planInput, providerManifest, admittedAt }) {
  const plan = verifyUploadPlan(planInput);
  const at = timestamp(admittedAt, 'admittedAt');
  const frames = verifyProviderManifest(providerManifest, plan, at).map((provider, index) => {
    const planned = plan.frames[index];
    const body = {
      schema: EVA_DENSE_MOTION_CLOUDINARY_FRAME_RECEIPT_SCHEMA,
      protocolVersion: EVA_DENSE_MOTION_CLOUDINARY_PROTOCOL_VERSION,
      status: 'immutable-reviewed-dense-master-admitted',
      admittedAt: at,
      familyId: plan.familyId,
      programSha256: plan.programSha256,
      uploadPlanSha256: plan.uploadPlanSha256,
      ordinal: planned.ordinal,
      frameId: planned.frameId,
      technicalInspectionSha256: planned.technicalInspectionSha256,
      creativeApprovalSha256: planned.creativeApprovalSha256,
      masteredAsset: Object.freeze({
        provider: 'cloudinary', cloudName: CLOUD_NAME, assetId: provider.assetId, publicId: provider.publicId,
        version: provider.version, bytes: provider.bytes, width: provider.width, height: provider.height,
        format: 'png', etag: provider.etag, secureUrl: provider.secureUrl, sha256: planned.localFile.sha256,
        createOnly: true, overwrite: false, immutable: true,
      }),
      providerEvidence: Object.freeze({ phash: provider.phash, providerResponseSha256: provider.providerResponseSha256 }),
      effects: Object.freeze({
        providerExecutionPerformedByThisCompiler: false,
        networkUsedByThisCompiler: false,
        uploadsPerformedByThisCompiler: 0,
        publicationPerformed: false,
        runtimeActivationPerformed: false,
      }),
      authority: authority(),
    };
    return deepFreeze({ ...body, admissionSha256: sha256Document(body) });
  });
  const body = {
    schema: EVA_DENSE_MOTION_CLOUDINARY_ADMISSION_RECEIPT_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_CLOUDINARY_PROTOCOL_VERSION,
    status: 'succeeded-ten-immutable-reviewed-dense-masters-admitted',
    admittedAt: at,
    familyId: plan.familyId,
    programSha256: plan.programSha256,
    uploadPlanSha256: plan.uploadPlanSha256,
    frames: Object.freeze(frames),
    effects: Object.freeze({ admittedAssets: FRAME_COUNT, providerExecutionsPerformedByThisCompiler: 0, uploadsPerformedByThisCompiler: 0, publicationsPerformed: 0, runtimeActivationsPerformed: 0 }),
    authority: authority(),
  };
  return deepFreeze({ ...body, receiptSha256: sha256Document(body) });
}

export function persistEvaDenseMotionCloudinaryAdmission({ tenMasterProgram, workspaceRoot: workspaceInput, admission }) {
  const program = verifyEvaDenseMotionTenMasterProgram(tenMasterProgram);
  const workspaceRoot = realDirectory(workspaceInput, 'workspaceRoot');
  assert(
    admission?.schema === EVA_DENSE_MOTION_CLOUDINARY_ADMISSION_RECEIPT_SCHEMA && admission.protocolVersion === EVA_DENSE_MOTION_CLOUDINARY_PROTOCOL_VERSION &&
      admission.programSha256 === program.programSha256 && admission.frames?.length === FRAME_COUNT && SHA256.test(admission.receiptSha256),
    'EVA_DENSE_CLOUDINARY_ADMISSION_INVALID',
  );
  const body = { ...admission };
  delete body.receiptSha256;
  assert(sha256Document(body) === admission.receiptSha256, 'EVA_DENSE_CLOUDINARY_ADMISSION_HASH_MISMATCH');
  const targets = program.production.jobs.map((job, index) => ({
    path: resolveRelative(workspaceRoot, job.outputs.cloudinaryUploadReceipt, 'cloudinaryUploadReceipt'),
    value: admission.frames[index],
  }));
  for (const target of targets) assert(!existsSync(target.path), 'EVA_DENSE_CLOUDINARY_ADMISSION_OUTPUT_EXISTS');
  const written = [];
  try {
    for (const target of targets) {
      mkdirSync(path.dirname(target.path), { recursive: true, mode: 0o700 });
      const handle = openSync(target.path, 'wx', 0o600);
      try {
        writeFileSync(handle, `${JSON.stringify(target.value, null, 2)}\n`);
        fsyncSync(handle);
      } finally {
        closeSync(handle);
      }
      written.push(target.path);
    }
  } catch (error) {
    for (const target of written.reverse()) {
      try { unlinkSync(target); } catch {}
    }
    throw error;
  }
  return admission;
}

export function evaDenseMotionCloudinaryAdmissionCapabilities() {
  return deepFreeze({
    schema: 'evavo.project-art-eva-dense-motion-cloudinary-admission-capabilities.v1',
    exactTenFrameSetRequired: true,
    reviewedTechnicalEvidenceRequired: true,
    namedHumanCreativeEvidenceRequired: true,
    exactTenMasterProgramHashRequired: true,
    exactReviewedPngSha256BoundBeforeUpload: true,
    exactCreateOnlyPublicIdsRequired: true,
    overwriteForbidden: true,
    providerPhashRequired: true,
    uniqueAssetIdsRequired: true,
    versionedSecureUrlsRequired: true,
    providerExecution: false,
    network: false,
    upload: false,
    publication: false,
    runtimeActivation: false,
    authority: authority(),
  });
}
