import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import {
  canonicalRelativePath,
  deepFreeze,
  sha256Document,
  timestamp,
} from './avatar-final-pass-provider-candidate-common.mjs';
import {
  EVA_DENSE_MOTION_FAMILY_APPROVAL_SCHEMA_V2,
  EVA_DENSE_MOTION_FAMILY_RELEASE_ASSEMBLY_PROTOCOL_VERSION_V2,
  EVA_DENSE_MOTION_FAMILY_RELEASE_MANIFEST_SCHEMA_V2,
} from './eva-dense-motion-family-release-assembly-v2.mjs';
import { verifyEvaDenseMotionTenMasterProgram } from './eva-dense-motion-ten-master-program.mjs';
import { verifyEvaDenseMotionWorkOrder } from './eva-dense-motion-work-order.mjs';

export const EVA_DENSE_MOTION_FAMILY_FINGERPRINT_PLAN_SCHEMA_V2 =
  'evavo.project-art-eva-dense-motion-family-fingerprint-plan.v2';

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

function realDirectory(value, label) {
  assert(typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'), 'EVA_DENSE_FAMILY_MANIFEST_V2_ROOT_INVALID', label);
  const normalized = path.normalize(value);
  const metadata = lstatSync(normalized);
  assert(metadata.isDirectory() && !metadata.isSymbolicLink() && realpathSync(normalized) === normalized, 'EVA_DENSE_FAMILY_MANIFEST_V2_ROOT_INVALID', label);
  return normalized;
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveRelative(root, relative, label) {
  const canonical = canonicalRelativePath(relative, label);
  const absolute = path.join(root, ...canonical.split('/'));
  assert(inside(root, absolute), 'EVA_DENSE_FAMILY_MANIFEST_V2_PATH_ESCAPE', label);
  return absolute;
}

function stableFile(filePath, label, maximum = MAXIMUM_EVIDENCE_BYTES) {
  const absolute = path.resolve(filePath);
  const before = lstatSync(absolute);
  assert(
    before.isFile() && !before.isSymbolicLink() && before.nlink === 1 &&
      before.size >= 1 && before.size <= maximum && realpathSync(absolute) === absolute,
    'EVA_DENSE_FAMILY_MANIFEST_V2_INPUT_INVALID',
    label,
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(before[field] === after[field], 'EVA_DENSE_FAMILY_MANIFEST_V2_INPUT_CHANGED', label);
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
    assert(false, 'EVA_DENSE_FAMILY_MANIFEST_V2_JSON_INVALID', label);
  }
}

function evidenceReference(root, value, label) {
  assert(value && typeof value.path === 'string' && SHA256.test(value.sha256), 'EVA_DENSE_FAMILY_MANIFEST_V2_EVIDENCE_REFERENCE_INVALID', label);
  const file = stableFile(resolveRelative(root, value.path, label), label);
  assert(file.sha256 === value.sha256, 'EVA_DENSE_FAMILY_MANIFEST_V2_EVIDENCE_HASH_MISMATCH', label);
  return Object.freeze({ path: value.path, sha256: value.sha256 });
}

function runtimeRelease(value) {
  assert(
    value?.repository === 'EVAVO-STUDIO/evavo-avatar-runtime' && /^\d+\.\d+\.\d+$/u.test(value.version) &&
      SHA1.test(value.commit) && SHA1.test(value.tree) &&
      value.admissionReceiptSchema === 'evavo.avatar.eva-dense-motion-admission-receipt.v1' &&
      value.activationApproved === false && value.deploymentApproved === false,
    'EVA_DENSE_FAMILY_MANIFEST_V2_RUNTIME_RELEASE_INVALID',
  );
  const [major, minor] = value.version.split('.').map((entry) => Number.parseInt(entry, 10));
  assert(major > 0 || (major === 0 && minor >= 37), 'EVA_DENSE_FAMILY_MANIFEST_V2_RUNTIME_VERSION_TOO_OLD');
  return Object.freeze({ ...value });
}

function fingerprintBody({ programSha256, workOrderFingerprint, sequencePack, releaseManifest, browserPlayback, runtime }) {
  return {
    schema: 'evavo.project-art-eva-dense-motion-family-evidence-fingerprint.v1',
    programSha256,
    workOrderFingerprint,
    sequencePackSha256: sequencePack.sha256,
    releaseManifestSha256: releaseManifest.sha256,
    browserPlaybackSha256: browserPlayback.sha256,
    runtimeRelease: runtime,
  };
}

export function compileEvaDenseMotionFamilyFingerprintPlanV2({
  tenMasterProgram,
  workOrder,
  familyEvidenceRoot: familyRootInput,
  sequencePack,
  releaseManifest,
  browserPlayback,
  runtimeRelease: runtimeInput,
  preparedAt,
}) {
  const program = verifyEvaDenseMotionTenMasterProgram(tenMasterProgram);
  const order = verifyEvaDenseMotionWorkOrder(workOrder);
  const familyRoot = realDirectory(familyRootInput, 'familyEvidenceRoot');
  const at = timestamp(preparedAt, 'preparedAt');
  const sequence = evidenceReference(familyRoot, sequencePack, 'sequencePack');
  const release = evidenceReference(familyRoot, releaseManifest, 'releaseManifest');
  const browser = evidenceReference(familyRoot, browserPlayback, 'browserPlayback');
  const runtime = runtimeRelease(runtimeInput);
  const body = fingerprintBody({
    programSha256: program.programSha256,
    workOrderFingerprint: order.workOrderFingerprint,
    sequencePack: sequence,
    releaseManifest: release,
    browserPlayback: browser,
    runtime,
  });
  const familyEvidenceFingerprint = sha256Document(body);
  return deepFreeze({
    schema: EVA_DENSE_MOTION_FAMILY_FINGERPRINT_PLAN_SCHEMA_V2,
    protocolVersion: EVA_DENSE_MOTION_FAMILY_RELEASE_ASSEMBLY_PROTOCOL_VERSION_V2,
    status: 'family-evidence-fingerprint-ready-for-three-external-human-approvals',
    preparedAt: at,
    programSha256: program.programSha256,
    workOrderFingerprint: order.workOrderFingerprint,
    sequencePack: sequence,
    releaseManifest: release,
    browserPlayback: browser,
    runtimeRelease: runtime,
    familyEvidenceFingerprint,
    requiredExternalApprovals: Object.freeze(['owner', 'creative-director', 'technical-director']),
    automaticApprovalCreationAllowed: false,
  });
}

function verifyApproval(value, expectedRole, fingerprint, manifestAt) {
  assert(value?.schema === EVA_DENSE_MOTION_FAMILY_APPROVAL_SCHEMA_V2 && SHA256.test(value.approvalSha256), 'EVA_DENSE_FAMILY_MANIFEST_V2_APPROVAL_INVALID', expectedRole);
  const body = { ...value };
  delete body.approvalSha256;
  assert(sha256Document(body) === value.approvalSha256, 'EVA_DENSE_FAMILY_MANIFEST_V2_APPROVAL_HASH_INVALID', expectedRole);
  assert(
    value.protocolVersion === EVA_DENSE_MOTION_FAMILY_RELEASE_ASSEMBLY_PROTOCOL_VERSION_V2 &&
      value.decision === 'approve-dense-motion-family-release-evidence' && value.role === expectedRole &&
      value.familyEvidenceFingerprint === fingerprint && value.reviewer?.actorClass === 'human' &&
      SAFE_ID.test(value.reviewer?.actorId) && SHA256.test(value.reviewer?.evidenceSha256),
    'EVA_DENSE_FAMILY_MANIFEST_V2_APPROVAL_INVALID',
    expectedRole,
  );
  timestamp(value.reviewedAt, `${expectedRole}.reviewedAt`);
  assert(Date.parse(value.reviewedAt) <= Date.parse(manifestAt), 'EVA_DENSE_FAMILY_MANIFEST_V2_APPROVAL_TIME_INVALID', expectedRole);
  return Object.freeze({ ...value });
}

export function compileEvaDenseMotionFamilyReleaseManifestV2({
  fingerprintPlan,
  ownerApproval,
  creativeDirectorApproval,
  technicalDirectorApproval,
  manifestedAt,
}) {
  assert(
    fingerprintPlan?.schema === EVA_DENSE_MOTION_FAMILY_FINGERPRINT_PLAN_SCHEMA_V2 &&
      fingerprintPlan.protocolVersion === EVA_DENSE_MOTION_FAMILY_RELEASE_ASSEMBLY_PROTOCOL_VERSION_V2 &&
      SHA256.test(fingerprintPlan.familyEvidenceFingerprint),
    'EVA_DENSE_FAMILY_MANIFEST_V2_FINGERPRINT_PLAN_INVALID',
  );
  const at = timestamp(manifestedAt, 'manifestedAt');
  const fingerprint = fingerprintPlan.familyEvidenceFingerprint;
  const owner = verifyApproval(ownerApproval, 'owner', fingerprint, at);
  const creative = verifyApproval(creativeDirectorApproval, 'creative-director', fingerprint, at);
  const technical = verifyApproval(technicalDirectorApproval, 'technical-director', fingerprint, at);
  assert(
    new Set([owner.reviewer.actorId, creative.reviewer.actorId, technical.reviewer.actorId]).size === 3,
    'EVA_DENSE_FAMILY_MANIFEST_V2_APPROVER_INDEPENDENCE_REQUIRED',
  );
  const body = {
    schema: EVA_DENSE_MOTION_FAMILY_RELEASE_MANIFEST_SCHEMA_V2,
    protocolVersion: EVA_DENSE_MOTION_FAMILY_RELEASE_ASSEMBLY_PROTOCOL_VERSION_V2,
    manifestedAt: at,
    programSha256: fingerprintPlan.programSha256,
    workOrderFingerprint: fingerprintPlan.workOrderFingerprint,
    familyEvidenceFingerprint: fingerprint,
    sequencePack: fingerprintPlan.sequencePack,
    releaseManifest: fingerprintPlan.releaseManifest,
    browserPlayback: fingerprintPlan.browserPlayback,
    runtimeRelease: fingerprintPlan.runtimeRelease,
    approvals: Object.freeze({
      owner,
      creativeDirector: creative,
      technicalDirector: technical,
    }),
    policy: Object.freeze({
      approvalsExternallyAuthored: true,
      automaticApprovalCreationAllowed: false,
      distinctHumanApproversRequired: true,
      approvalSubjectIsNonCircularFamilyEvidenceFingerprint: true,
    }),
  };
  return deepFreeze({ ...body, manifestSha256: sha256Document(body) });
}

export function readEvaDenseMotionFamilyApprovalFileV2(filePath, role, fingerprint, manifestAt) {
  return verifyApproval(stableJson(filePath, `${role} approval`), role, fingerprint, manifestAt);
}
