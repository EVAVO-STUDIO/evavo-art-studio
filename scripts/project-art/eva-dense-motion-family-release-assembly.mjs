import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';

import {
  canonicalRelativePath,
  deepFreeze,
  sha256Document,
  timestamp,
} from './avatar-final-pass-provider-candidate-common.mjs';
import {
  EVA_DENSE_MOTION_CONTINUITY_EVIDENCE_SCHEMA,
} from './eva-dense-motion-identity-continuity.mjs';
import {
  EVA_DENSE_MOTION_RUNTIME_FRAME_EVIDENCE_SCHEMA,
} from './eva-dense-motion-runtime-frame-evidence.mjs';
import {
  EVA_DENSE_MOTION_RELEASE_EVIDENCE_REQUEST_SCHEMA,
  compileEvaDenseMotionReleaseEvidence,
  evaluateEvaDenseMotionReleaseEvidence,
} from './eva-dense-motion-release-evidence.mjs';
import {
  verifyEvaDenseMotionTenMasterProgram,
} from './eva-dense-motion-ten-master-program.mjs';
import {
  verifyEvaDenseMotionWorkOrder,
} from './eva-dense-motion-work-order.mjs';

export const EVA_DENSE_MOTION_FAMILY_APPROVAL_SCHEMA =
  'evavo.project-art-eva-dense-motion-family-approval.v1';
export const EVA_DENSE_MOTION_FAMILY_RELEASE_MANIFEST_SCHEMA =
  'evavo.project-art-eva-dense-motion-family-release-manifest.v1';
export const EVA_DENSE_MOTION_FAMILY_RELEASE_ASSEMBLY_PROTOCOL_VERSION =
  '2026-08-22.1';

const FRAME_COUNT = 10;
const MAXIMUM_JSON_BYTES = 16 * 1024 * 1024;
const MAXIMUM_EVIDENCE_BYTES = 256 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
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
    sealedEvidenceRead: true,
    releaseEvidenceAssembly: true,
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
    'EVA_DENSE_FAMILY_ASSEMBLY_ROOT_INVALID',
    label,
  );
  const normalized = path.normalize(value);
  const metadata = lstatSync(normalized);
  assert(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      realpathSync(normalized) === normalized,
    'EVA_DENSE_FAMILY_ASSEMBLY_ROOT_INVALID',
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
  assert(inside(root, absolute), 'EVA_DENSE_FAMILY_ASSEMBLY_PATH_ESCAPE', label);
  return absolute;
}

function stableFile(filePath, label, maximum = MAXIMUM_EVIDENCE_BYTES) {
  const absolute = path.resolve(filePath);
  const before = lstatSync(absolute);
  assert(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      before.size >= 1 &&
      before.size <= maximum &&
      realpathSync(absolute) === absolute,
    'EVA_DENSE_FAMILY_ASSEMBLY_INPUT_INVALID',
    label,
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(before[field] === after[field], 'EVA_DENSE_FAMILY_ASSEMBLY_INPUT_CHANGED', label);
  }
  return Object.freeze({
    absolute,
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

function stableJson(filePath, label) {
  const file = stableFile(filePath, label, MAXIMUM_JSON_BYTES);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes));
  } catch {
    assert(false, 'EVA_DENSE_FAMILY_ASSEMBLY_JSON_INVALID', label);
  }
}

function verifySelfHash(value, field, schema, code) {
  assert(value?.schema === schema && SHA256.test(value?.[field]), code);
  const body = { ...value };
  delete body[field];
  assert(sha256Document(body) === value[field], code);
  return value;
}

function familyApproval(value, role, assembledAt) {
  verifySelfHash(
    value,
    'approvalSha256',
    EVA_DENSE_MOTION_FAMILY_APPROVAL_SCHEMA,
    'EVA_DENSE_FAMILY_APPROVAL_INVALID',
  );
  assert(
    value.protocolVersion === EVA_DENSE_MOTION_FAMILY_RELEASE_ASSEMBLY_PROTOCOL_VERSION &&
      value.decision === 'approve-dense-motion-family-release-evidence' &&
      value.role === role &&
      value.reviewer?.actorClass === 'human' &&
      SAFE_ID.test(value.reviewer?.actorId) &&
      SHA256.test(value.reviewer?.evidenceSha256) &&
      SHA256.test(value.familyEvidenceSha256) &&
      Date.parse(value.reviewedAt) <= Date.parse(assembledAt),
    'EVA_DENSE_FAMILY_APPROVAL_INVALID',
    role,
  );
  timestamp(value.reviewedAt, `${role}.reviewedAt`);
  return value;
}

function evidenceReference(root, value, label) {
  assert(
    value && typeof value.path === 'string' && SHA256.test(value.sha256),
    'EVA_DENSE_FAMILY_EVIDENCE_REFERENCE_INVALID',
    label,
  );
  const file = stableFile(resolveRelative(root, value.path, label), label);
  assert(file.sha256 === value.sha256, 'EVA_DENSE_FAMILY_EVIDENCE_HASH_MISMATCH', label);
  return value.sha256;
}

function runtimeRelease(value) {
  assert(
    value?.repository === 'EVAVO-STUDIO/evavo-avatar-runtime' &&
      /^\d+\.\d+\.\d+$/u.test(value.version) &&
      SHA1.test(value.commit) &&
      SHA1.test(value.tree) &&
      value.admissionReceiptSchema === 'evavo.avatar.eva-dense-motion-admission-receipt.v1' &&
      value.activationApproved === false &&
      value.deploymentApproved === false,
    'EVA_DENSE_FAMILY_RUNTIME_RELEASE_INVALID',
  );
  return value;
}

function runtimeFrame(workspaceRoot, program, job) {
  const value = verifySelfHash(
    stableJson(
      resolveRelative(workspaceRoot, job.outputs.runtimeFrameEvidence, 'runtimeFrameEvidence'),
      `runtime frame ${job.ordinal}`,
    ),
    'runtimeFrameEvidenceSha256',
    EVA_DENSE_MOTION_RUNTIME_FRAME_EVIDENCE_SCHEMA,
    'EVA_DENSE_FAMILY_RUNTIME_FRAME_INVALID',
  );
  assert(
    value.status === 'runtime-frame-evidence-complete-awaiting-family-release' &&
      value.programSha256 === program.programSha256 &&
      value.ordinal === job.ordinal &&
      value.frameId === job.frameId &&
      value.sourceGitBlobSha1 === job.source.gitBlobSha1,
    'EVA_DENSE_FAMILY_RUNTIME_FRAME_INVALID',
  );
  const evidence = value.releaseProjection?.evidence;
  assert(
    SHA256.test(evidence?.candidateAssuranceSha256) &&
      SHA256.test(evidence?.alphaMasteringReceiptSha256) &&
      SHA256.test(evidence?.technicalInspectionSha256) &&
      SHA256.test(evidence?.creativeApprovalSha256) &&
      SHA256.test(evidence?.identityEvidenceSha256) &&
      SHA256.test(evidence?.finalReviewedSha256),
    'EVA_DENSE_FAMILY_RUNTIME_FRAME_PROJECTION_INVALID',
  );
  const technical = stableJson(
    resolveRelative(workspaceRoot, job.outputs.technicalInspection, 'technicalInspection'),
    `technical inspection ${job.ordinal}`,
  );
  assert(
    technical?.technicalInspectionSha256 === evidence.technicalInspectionSha256 &&
      SHA256.test(technical.masteringFrameReceiptSha256),
    'EVA_DENSE_FAMILY_FRAME_FINISHER_LINEAGE_INVALID',
  );
  return Object.freeze({ value, frameFinisherReceiptSha256: technical.masteringFrameReceiptSha256 });
}

function continuityRecord(root, index, program, assembledAt) {
  const fromOrdinal = index + 1;
  const toOrdinal = fromOrdinal === FRAME_COUNT ? 1 : fromOrdinal + 1;
  const filename = `continuity-${String(fromOrdinal).padStart(2, '0')}-to-${String(toOrdinal).padStart(2, '0')}.json`;
  const value = verifySelfHash(
    stableJson(path.join(root, filename), `continuity ${fromOrdinal}->${toOrdinal}`),
    'evidenceSha256',
    EVA_DENSE_MOTION_CONTINUITY_EVIDENCE_SCHEMA,
    'EVA_DENSE_FAMILY_CONTINUITY_INVALID',
  );
  assert(
    value.programSha256 === program.programSha256 &&
      value.fromOrdinal === fromOrdinal &&
      value.toOrdinal === toOrdinal &&
      value.faceRegistrationPassed === true &&
      value.phashContinuityPassed === true &&
      value.motionReviewPassed === true &&
      value.reviewer?.actorClass === 'human' &&
      SAFE_ID.test(value.reviewer?.actorId) &&
      Date.parse(value.reviewer?.occurredAt) <= Date.parse(assembledAt),
    'EVA_DENSE_FAMILY_CONTINUITY_INVALID',
  );
  timestamp(value.reviewer.occurredAt, `continuity ${fromOrdinal}->${toOrdinal}`);
  return Object.freeze({
    fromOrdinal,
    toOrdinal,
    evidenceSha256: value.evidenceSha256,
    faceRegistrationPassed: true,
    phashContinuityPassed: true,
    motionReviewPassed: true,
    reviewedBy: value.reviewer.actorId,
    reviewedAt: value.reviewer.occurredAt,
  });
}

export function compileEvaDenseMotionFamilyReleaseEvidence({
  tenMasterProgram,
  workOrder,
  workspaceRoot: workspaceInput,
  continuityRoot: continuityInput,
  familyEvidenceRoot: familyRootInput,
  familyReleaseManifest,
  admissionId,
  actorId,
  assembledAt,
}) {
  const program = verifyEvaDenseMotionTenMasterProgram(tenMasterProgram);
  const verifiedWorkOrder = verifyEvaDenseMotionWorkOrder(workOrder);
  const workspaceRoot = realDirectory(workspaceInput, 'workspaceRoot');
  const continuityRoot = realDirectory(continuityInput, 'continuityRoot');
  const familyEvidenceRoot = realDirectory(familyRootInput, 'familyEvidenceRoot');
  const at = timestamp(assembledAt, 'assembledAt');

  assert(
    familyReleaseManifest?.schema === EVA_DENSE_MOTION_FAMILY_RELEASE_MANIFEST_SCHEMA &&
      familyReleaseManifest.protocolVersion === EVA_DENSE_MOTION_FAMILY_RELEASE_ASSEMBLY_PROTOCOL_VERSION &&
      familyReleaseManifest.programSha256 === program.programSha256 &&
      familyReleaseManifest.workOrderFingerprint === verifiedWorkOrder.workOrderFingerprint,
    'EVA_DENSE_FAMILY_MANIFEST_INVALID',
  );
  const manifestBody = { ...familyReleaseManifest };
  delete manifestBody.manifestSha256;
  assert(
    SHA256.test(familyReleaseManifest.manifestSha256) &&
      sha256Document(manifestBody) === familyReleaseManifest.manifestSha256,
    'EVA_DENSE_FAMILY_MANIFEST_HASH_INVALID',
  );

  const sequencePackSha256 = evidenceReference(
    familyEvidenceRoot,
    familyReleaseManifest.sequencePack,
    'sequencePack',
  );
  const releaseManifestSha256 = evidenceReference(
    familyEvidenceRoot,
    familyReleaseManifest.releaseManifest,
    'releaseManifest',
  );
  const browserPlaybackSha256 = evidenceReference(
    familyEvidenceRoot,
    familyReleaseManifest.browserPlayback,
    'browserPlayback',
  );

  const owner = familyApproval(familyReleaseManifest.approvals?.owner, 'owner', at);
  const creativeDirector = familyApproval(
    familyReleaseManifest.approvals?.creativeDirector,
    'creative-director',
    at,
  );
  const technicalDirector = familyApproval(
    familyReleaseManifest.approvals?.technicalDirector,
    'technical-director',
    at,
  );
  for (const approval of [owner, creativeDirector, technicalDirector]) {
    assert(
      approval.familyEvidenceSha256 === familyReleaseManifest.manifestSha256,
      'EVA_DENSE_FAMILY_APPROVAL_MANIFEST_MISMATCH',
    );
  }

  const runtimeFrames = program.production.jobs.map((job) =>
    runtimeFrame(workspaceRoot, program, job),
  );
  const frames = runtimeFrames.map(({ value, frameFinisherReceiptSha256 }, index) => {
    const job = program.production.jobs[index];
    return Object.freeze({
      ordinal: job.ordinal,
      frameId: job.frameId,
      sourceGitBlobSha1: job.source.gitBlobSha1,
      evidence: Object.freeze({
        candidateAssuranceSha256: value.releaseProjection.evidence.candidateAssuranceSha256,
        alphaMasteringReceiptSha256: value.releaseProjection.evidence.alphaMasteringReceiptSha256,
        frameFinisherReceiptSha256,
        technicalInspectionSha256: value.releaseProjection.evidence.technicalInspectionSha256,
        creativeApprovalSha256: value.releaseProjection.evidence.creativeApprovalSha256,
        identityEvidenceSha256: value.releaseProjection.evidence.identityEvidenceSha256,
        finalReviewedSha256: value.releaseProjection.evidence.finalReviewedSha256,
      }),
      masteredAsset: value.releaseProjection.masteredAsset,
      alpha: value.releaseProjection.alpha,
      review: value.releaseProjection.review,
    });
  });
  const continuity = Array.from({ length: FRAME_COUNT }, (_, index) =>
    continuityRecord(continuityRoot, index, program, at),
  );
  const family = Object.freeze({
    sequencePackSha256,
    releaseManifestSha256,
    browserPlaybackSha256,
    ownerApprovalSha256: owner.approvalSha256,
    creativeDirectorApprovalSha256: creativeDirector.approvalSha256,
    technicalDirectorApprovalSha256: technicalDirector.approvalSha256,
    runtimeRelease: runtimeRelease(familyReleaseManifest.runtimeRelease),
  });

  const request = {
    schema: EVA_DENSE_MOTION_RELEASE_EVIDENCE_REQUEST_SCHEMA,
    admissionId,
    actorId,
    assembledAt: at,
    workOrder: verifiedWorkOrder,
    frames,
    continuity,
    family,
    authority: verifiedWorkOrder.authority,
  };
  const evidence = compileEvaDenseMotionReleaseEvidence(request);
  const status = evaluateEvaDenseMotionReleaseEvidence(evidence);
  assert(
    status.releaseEvidenceComplete === true &&
      status.runtimeReceiptAssemblyReady === true &&
      status.publicationAllowed === false &&
      status.deploymentAllowed === false &&
      status.runtimeActivationAllowed === false,
    'EVA_DENSE_FAMILY_RELEASE_EVIDENCE_NOT_READY',
  );
  return deepFreeze({
    status: 'release-evidence-complete-runtime-receipt-assembly-ready',
    evidence,
    evaluation: status,
    effects: Object.freeze({
      humanDecisionsCreated: 0,
      providerExecutionsPerformed: 0,
      imagesMutated: 0,
      cloudinaryUploadsPerformed: 0,
      sequencesReleased: 0,
      publicationsPerformed: 0,
      deploymentsPerformed: 0,
      runtimeActivationsPerformed: 0,
    }),
    authority: authority(),
  });
}

export function evaDenseMotionFamilyReleaseAssemblyCapabilities() {
  return deepFreeze({
    schema: 'evavo.project-art-eva-dense-motion-family-release-assembly-capabilities.v1',
    exactTenRuntimeFrameEvidenceRequired: true,
    exactTenContinuityEvidenceRequired: true,
    sequencePackFileHashRequired: true,
    releaseManifestFileHashRequired: true,
    browserPlaybackFileHashRequired: true,
    namedHumanOwnerApprovalRequired: true,
    namedHumanCreativeDirectorApprovalRequired: true,
    namedHumanTechnicalDirectorApprovalRequired: true,
    runtimeRelease037OrNewerRequiredByAuthoritativeCompiler: true,
    authoritativeV2ReleaseCompilerUsed: true,
    authoritativeV2ReleaseEvaluatorUsed: true,
    runtimeReceiptAssemblyOnly: true,
    publication: false,
    deployment: false,
    runtimeActivation: false,
    authority: authority(),
  });
}
