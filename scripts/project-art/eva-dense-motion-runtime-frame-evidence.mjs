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
  verifyEvaDenseMotionCandidateAssurance,
} from './eva-dense-motion-candidate-assurance.mjs';
import {
  EVA_DENSE_MOTION_ALPHA_MASTERING_SCHEMA,
  verifyEvaDenseMotionAlphaMatteReview,
} from './eva-dense-motion-alpha-mastering.mjs';
import {
  EVA_DENSE_MOTION_CLOUDINARY_FRAME_RECEIPT_SCHEMA,
} from './eva-dense-motion-cloudinary-admission.mjs';
import {
  EVA_DENSE_MOTION_CREATIVE_APPROVAL_EVIDENCE_SCHEMA,
  EVA_DENSE_MOTION_TECHNICAL_INSPECTION_SCHEMA,
} from './eva-dense-motion-reviewed-frame-evidence.mjs';
import {
  EVA_DENSE_MOTION_IDENTITY_EVIDENCE_SCHEMA,
} from './eva-dense-motion-identity-continuity.mjs';
import {
  verifyEvaDenseMotionTenMasterProgram,
} from './eva-dense-motion-ten-master-program.mjs';

export const EVA_DENSE_MOTION_RUNTIME_FRAME_EVIDENCE_SCHEMA =
  'evavo.project-art-eva-dense-motion-runtime-frame-evidence.v1';
export const EVA_DENSE_MOTION_RUNTIME_FRAME_EVIDENCE_RECEIPT_SCHEMA =
  'evavo.project-art-eva-dense-motion-runtime-frame-evidence-receipt.v1';
export const EVA_DENSE_MOTION_RUNTIME_FRAME_EVIDENCE_PROTOCOL_VERSION =
  '2026-08-22.1';

const FRAME_COUNT = 10;
const MAXIMUM_JSON_BYTES = 8 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;

function assert(condition, code, message = code) {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}

function authority() {
  return Object.freeze({
    upstreamEvidenceRead: true,
    runtimeFrameEvidencePersistence: true,
    providerExecution: false,
    imageMutation: false,
    humanDecisionCreation: false,
    automaticCreativeDecision: false,
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
    'EVA_DENSE_RUNTIME_FRAME_ROOT_INVALID',
    label,
  );
  const normalized = path.normalize(value);
  const metadata = lstatSync(normalized);
  assert(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      realpathSync(normalized) === normalized,
    'EVA_DENSE_RUNTIME_FRAME_ROOT_INVALID',
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
  assert(inside(root, absolute), 'EVA_DENSE_RUNTIME_FRAME_PATH_ESCAPE', label);
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
    'EVA_DENSE_RUNTIME_FRAME_INPUT_INVALID',
    label,
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(before[field] === after[field], 'EVA_DENSE_RUNTIME_FRAME_INPUT_CHANGED', label);
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    assert(false, 'EVA_DENSE_RUNTIME_FRAME_JSON_INVALID', label);
  }
}

function verifySelfHash(value, field, schema, code) {
  assert(value?.schema === schema && SHA256.test(value?.[field]), code);
  const body = { ...value };
  delete body[field];
  assert(sha256Document(body) === value[field], code);
  return value;
}

function alphaMastering(value, program, job) {
  verifySelfHash(
    value,
    'alphaMasteringSha256',
    EVA_DENSE_MOTION_ALPHA_MASTERING_SCHEMA,
    'EVA_DENSE_RUNTIME_FRAME_ALPHA_MASTERING_INVALID',
  );
  assert(
    value.status === 'alpha-mastered-awaiting-frame-finisher' &&
      value.programSha256 === program.programSha256 &&
      value.jobId === job.jobId &&
      value.ordinal === job.ordinal &&
      value.frameId === job.frameId &&
      value.output?.width === 1024 &&
      value.output?.height === 1536 &&
      value.output?.hiddenRgbTransparentPixels === 0 &&
      value.output?.edgeVisiblePixels === 0 &&
      SHA256.test(value.output?.alphaSha256),
    'EVA_DENSE_RUNTIME_FRAME_ALPHA_MASTERING_INVALID',
  );
  return value;
}

function compiledFrame({ program, job, workspaceRoot, compiledAt }) {
  const assurance = verifyEvaDenseMotionCandidateAssurance(
    stableJson(
      resolveRelative(workspaceRoot, job.outputs.candidateAssurance, 'candidateAssurance'),
      'candidate assurance',
    ),
    { program },
  );
  const matteReview = verifyEvaDenseMotionAlphaMatteReview(
    stableJson(
      resolveRelative(workspaceRoot, job.outputs.alphaMatteReview, 'alphaMatteReview'),
      'alpha matte review',
    ),
    { program, assurance },
  );
  const mastering = alphaMastering(
    stableJson(
      resolveRelative(workspaceRoot, job.outputs.alphaMasteringReceipt, 'alphaMasteringReceipt'),
      'alpha mastering receipt',
    ),
    program,
    job,
  );
  const technical = verifySelfHash(
    stableJson(
      resolveRelative(workspaceRoot, job.outputs.technicalInspection, 'technicalInspection'),
      'technical inspection',
    ),
    'technicalInspectionSha256',
    EVA_DENSE_MOTION_TECHNICAL_INSPECTION_SCHEMA,
    'EVA_DENSE_RUNTIME_FRAME_TECHNICAL_INVALID',
  );
  const creative = verifySelfHash(
    stableJson(
      resolveRelative(workspaceRoot, job.outputs.creativeApproval, 'creativeApproval'),
      'creative approval evidence',
    ),
    'creativeApprovalSha256',
    EVA_DENSE_MOTION_CREATIVE_APPROVAL_EVIDENCE_SCHEMA,
    'EVA_DENSE_RUNTIME_FRAME_CREATIVE_INVALID',
  );
  const cloudinary = verifySelfHash(
    stableJson(
      resolveRelative(workspaceRoot, job.outputs.cloudinaryUploadReceipt, 'cloudinaryUploadReceipt'),
      'Cloudinary frame admission',
    ),
    'admissionSha256',
    EVA_DENSE_MOTION_CLOUDINARY_FRAME_RECEIPT_SCHEMA,
    'EVA_DENSE_RUNTIME_FRAME_CLOUDINARY_INVALID',
  );
  const identity = verifySelfHash(
    stableJson(
      resolveRelative(workspaceRoot, job.outputs.identityEvidence, 'identityEvidence'),
      'identity evidence',
    ),
    'identityEvidenceSha256',
    EVA_DENSE_MOTION_IDENTITY_EVIDENCE_SCHEMA,
    'EVA_DENSE_RUNTIME_FRAME_IDENTITY_INVALID',
  );

  assert(
    mastering.source?.candidateAssuranceSha256 === assurance.assuranceSha256 &&
      mastering.alphaMatte?.reviewSha256 === matteReview.reviewSha256 &&
      technical.programSha256 === program.programSha256 &&
      creative.programSha256 === program.programSha256 &&
      cloudinary.programSha256 === program.programSha256 &&
      identity.programSha256 === program.programSha256 &&
      technical.ordinal === job.ordinal &&
      creative.ordinal === job.ordinal &&
      cloudinary.ordinal === job.ordinal &&
      identity.ordinal === job.ordinal &&
      technical.finalFrame?.sha256 === creative.finalFrameSha256 &&
      creative.finalFrameSha256 === cloudinary.masteredAsset?.sha256 &&
      cloudinary.masteredAsset.sha256 === identity.masteredAssetSha256 &&
      creative.creativeApproved === true &&
      creative.reviewer?.actorClass === 'human' &&
      identity.humanVerified === true,
    'EVA_DENSE_RUNTIME_FRAME_LINEAGE_INVALID',
  );

  const frameEvidence = Object.freeze({
    candidateAssuranceSha256: assurance.assuranceSha256,
    alphaMasteringReceiptSha256: mastering.alphaMasteringSha256,
    technicalInspectionSha256: technical.technicalInspectionSha256,
    creativeApprovalSha256: creative.creativeApprovalSha256,
    masteredAsset: cloudinary.masteredAsset,
    alpha: Object.freeze({
      actualRgbaAlpha: true,
      hiddenRgbTransparentPixels: mastering.output.hiddenRgbTransparentPixels,
      checkerboardRejected:
        matteReview.gateResults?.['checkerboard-and-matte-rejection'] === true,
      matteHaloRejected:
        matteReview.gateResults?.['checkerboard-and-matte-rejection'] === true,
      edgeVisiblePixels: mastering.output.edgeVisiblePixels,
      alphaPlaneSha256: mastering.output.alphaSha256,
    }),
    identity: Object.freeze({
      identityEvidenceSha256: identity.identityEvidenceSha256,
      anchorOrdinal: identity.anchorOrdinal,
      faceCenterShiftPixels: identity.faceCenterShiftPixels,
      maximumFaceCenterShiftPixels: identity.maximumFaceCenterShiftPixels,
      phashHammingDistance: identity.phashHammingDistance,
      maximumPhashHammingDistance: identity.maximumPhashHammingDistance,
      humanVerified: true,
      reviewer: identity.reviewer,
    }),
  });
  assert(
    frameEvidence.alpha.checkerboardRejected === true &&
      frameEvidence.alpha.matteHaloRejected === true &&
      frameEvidence.alpha.hiddenRgbTransparentPixels === 0 &&
      frameEvidence.alpha.edgeVisiblePixels === 0,
    'EVA_DENSE_RUNTIME_FRAME_ALPHA_INVALID',
  );

  const body = {
    schema: EVA_DENSE_MOTION_RUNTIME_FRAME_EVIDENCE_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_RUNTIME_FRAME_EVIDENCE_PROTOCOL_VERSION,
    status: 'runtime-frame-evidence-complete-awaiting-family-release',
    compiledAt,
    familyId: program.familyId,
    programSha256: program.programSha256,
    ordinal: job.ordinal,
    frameId: job.frameId,
    sourceGitBlobSha1: job.source.gitBlobSha1,
    runtimeAdmissionEvidence: frameEvidence,
    releaseProjection: Object.freeze({
      evidence: Object.freeze({
        candidateAssuranceSha256: assurance.assuranceSha256,
        alphaMasteringReceiptSha256: mastering.alphaMasteringSha256,
        technicalInspectionSha256: technical.technicalInspectionSha256,
        creativeApprovalSha256: creative.creativeApprovalSha256,
        identityEvidenceSha256: identity.identityEvidenceSha256,
        finalReviewedSha256: cloudinary.masteredAsset.sha256,
      }),
      masteredAsset: cloudinary.masteredAsset,
      alpha: frameEvidence.alpha,
      review: Object.freeze({
        technicalPassed: technical.status === 'passed-independent-technical-inspection',
        creativeApproved: creative.creativeApproved === true,
        anatomyPassed: creative.gates?.handsAndAnatomy === 'pass',
        identityPassed: creative.gates?.faceIdentity === 'pass',
        silhouetteRegistrationPassed:
          creative.gates?.silhouetteRegistration === 'pass',
        reviewedBy: creative.reviewer.actorId,
        reviewedAt: creative.reviewedAt,
        reviewDecisionSha256: creative.reviewDecisionSha256,
      }),
    }),
    authority: authority(),
  };
  return deepFreeze({ ...body, runtimeFrameEvidenceSha256: sha256Document(body) });
}

export function compileEvaDenseMotionRuntimeFrameEvidence({
  tenMasterProgram,
  workspaceRoot: workspaceInput,
  compiledAt,
}) {
  const program = verifyEvaDenseMotionTenMasterProgram(tenMasterProgram);
  const workspaceRoot = realDirectory(workspaceInput, 'workspaceRoot');
  const at = timestamp(compiledAt, 'compiledAt');
  const frames = program.production.jobs.map((job) =>
    compiledFrame({ program, job, workspaceRoot, compiledAt: at }),
  );
  assert(frames.length === FRAME_COUNT, 'EVA_DENSE_RUNTIME_FRAME_COUNT_INVALID');
  return deepFreeze({
    status: 'ready-to-persist-ten-runtime-frame-evidence-records',
    familyId: program.familyId,
    programSha256: program.programSha256,
    compiledAt: at,
    frames: Object.freeze(frames),
    authority: authority(),
  });
}

export function persistEvaDenseMotionRuntimeFrameEvidence({
  tenMasterProgram,
  workspaceRoot: workspaceInput,
  compiled,
}) {
  const program = verifyEvaDenseMotionTenMasterProgram(tenMasterProgram);
  const workspaceRoot = realDirectory(workspaceInput, 'workspaceRoot');
  assert(
    compiled?.programSha256 === program.programSha256 &&
      compiled.frames?.length === FRAME_COUNT,
    'EVA_DENSE_RUNTIME_FRAME_COMPILED_INVALID',
  );
  const targets = program.production.jobs.map((job, index) => ({
    path: resolveRelative(workspaceRoot, job.outputs.runtimeFrameEvidence, 'runtimeFrameEvidence'),
    value: compiled.frames[index],
  }));
  for (const target of targets) {
    assert(!existsSync(target.path), 'EVA_DENSE_RUNTIME_FRAME_OUTPUT_EXISTS', target.path);
  }
  for (const target of targets) {
    mkdirSync(path.dirname(target.path), { recursive: true, mode: 0o700 });
    const handle = openSync(target.path, 'wx', 0o600);
    try {
      writeFileSync(handle, `${JSON.stringify(target.value, null, 2)}\n`);
      fsyncSync(handle);
    } finally {
      closeSync(handle);
    }
  }
  const body = {
    schema: EVA_DENSE_MOTION_RUNTIME_FRAME_EVIDENCE_RECEIPT_SCHEMA,
    protocolVersion: EVA_DENSE_MOTION_RUNTIME_FRAME_EVIDENCE_PROTOCOL_VERSION,
    status: 'succeeded-ten-runtime-frame-evidence-records-persisted',
    familyId: compiled.familyId,
    programSha256: compiled.programSha256,
    compiledAt: compiled.compiledAt,
    frames: Object.freeze(compiled.frames.map((frame) => Object.freeze({
      ordinal: frame.ordinal,
      frameId: frame.frameId,
      runtimeFrameEvidenceSha256: frame.runtimeFrameEvidenceSha256,
    }))),
    effects: Object.freeze({
      runtimeFrameEvidenceCreated: FRAME_COUNT,
      providerExecutionsPerformed: 0,
      imagesMutated: 0,
      humanDecisionsCreated: 0,
      cloudinaryUploadsPerformed: 0,
      sequencesReleased: 0,
      runtimeActivationsPerformed: 0,
    }),
    authority: authority(),
  };
  return deepFreeze({ ...body, receiptSha256: sha256Document(body) });
}

export function evaDenseMotionRuntimeFrameEvidenceCapabilities() {
  return deepFreeze({
    schema: 'evavo.project-art-eva-dense-motion-runtime-frame-evidence-capabilities.v1',
    exactFrameCount: FRAME_COUNT,
    completeUpstreamEvidenceRequired: true,
    releaseProjectionProduced: true,
    actualRgbaAlphaRequired: true,
    hiddenRgbZeroedRequired: true,
    checkerboardAndMatteRejectedRequired: true,
    canvasEdgesClearRequired: true,
    namedHumanCreativeApprovalRequired: true,
    identityEvidenceRequired: true,
    providerExecution: false,
    imageMutation: false,
    cloudinaryUpload: false,
    sequenceRelease: false,
    runtimeActivation: false,
    authority: authority(),
  });
}
