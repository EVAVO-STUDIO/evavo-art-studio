import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

export const EVA_DENSE_MOTION_FAMILY_HUMAN_REVIEW_EVIDENCE_SCHEMA_V1 =
  'evavo.project-art-eva-dense-motion-family-human-review-evidence.v1';
export const EVA_DENSE_MOTION_FAMILY_APPROVAL_PROVENANCE_PROTOCOL_VERSION_V1 =
  '2026-09-09.1';

const MAXIMUM_REVIEW_EVIDENCE_BYTES = 4 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;
const ROLES = Object.freeze([
  Object.freeze({ key: 'owner', role: 'owner' }),
  Object.freeze({ key: 'creativeDirector', role: 'creative-director' }),
  Object.freeze({ key: 'technicalDirector', role: 'technical-director' }),
]);

function assert(condition, code, message = code) {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}

function validTimestamp(value) {
  return typeof value === 'string' && value.length >= 20 && Number.isFinite(Date.parse(value));
}

function realDirectory(value) {
  assert(
    typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'),
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_ROOT_INVALID',
  );
  let metadata;
  let real;
  try {
    metadata = lstatSync(value);
    real = realpathSync(value);
  } catch {
    assert(false, 'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_ROOT_INVALID');
  }
  const normalized = path.normalize(value);
  assert(
    metadata.isDirectory() && !metadata.isSymbolicLink() && real === normalized,
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_ROOT_INVALID',
  );
  return normalized;
}

function safeRelativePath(value, label) {
  assert(
    typeof value === 'string' && value.length >= 1 && value.length <= 1024 &&
      !value.includes('\0') && !value.includes('\\') &&
      !path.posix.isAbsolute(value) && !path.win32.isAbsolute(value),
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_EVIDENCE_PATH_INVALID',
    label,
  );
  const parts = value.split('/');
  assert(
    parts.every((part) => part.length >= 1 && part !== '.' && part !== '..'),
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_EVIDENCE_PATH_INVALID',
    label,
  );
  return parts;
}

function stableEvidenceJson(root, relativePath, label) {
  const parts = safeRelativePath(relativePath, label);
  const absolute = path.resolve(root, ...parts);
  const relative = path.relative(root, absolute);
  assert(
    relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative),
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_EVIDENCE_PATH_INVALID',
    label,
  );

  let before;
  let real;
  try {
    before = lstatSync(absolute);
    real = realpathSync(absolute);
  } catch {
    assert(false, 'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_EVIDENCE_FILE_INVALID', label);
  }
  assert(
    before.isFile() && !before.isSymbolicLink() && before.nlink === 1 &&
      before.size >= 1 && before.size <= MAXIMUM_REVIEW_EVIDENCE_BYTES &&
      real === absolute,
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_EVIDENCE_FILE_INVALID',
    label,
  );

  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(
      before[field] === after[field],
      'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_EVIDENCE_CHANGED',
      label,
    );
  }

  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    assert(false, 'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_EVIDENCE_JSON_INVALID', label);
  }

  return Object.freeze({
    relativePath,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    value,
  });
}

function verifyApproval(root, approval, role, fingerprint, assembledAt) {
  const label = `${role} family approval evidence`;
  assert(
    approval && approval.decision === 'approve-dense-motion-family-release-evidence' &&
      approval.role === role && approval.familyEvidenceFingerprint === fingerprint &&
      approval.reviewer?.actorClass === 'human' && SAFE_ID.test(approval.reviewer?.actorId) &&
      typeof approval.reviewer?.evidencePath === 'string' &&
      SHA256.test(approval.reviewer?.evidenceSha256) &&
      validTimestamp(approval.reviewedAt),
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_APPROVAL_INVALID',
    role,
  );
  assert(
    Date.parse(approval.reviewedAt) <= Date.parse(assembledAt),
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_APPROVAL_TIME_INVALID',
    role,
  );

  const evidence = stableEvidenceJson(root, approval.reviewer.evidencePath, label);
  assert(
    evidence.sha256 === approval.reviewer.evidenceSha256,
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_EVIDENCE_HASH_MISMATCH',
    role,
  );

  const receipt = evidence.value;
  assert(
    receipt?.schema === EVA_DENSE_MOTION_FAMILY_HUMAN_REVIEW_EVIDENCE_SCHEMA_V1 &&
      receipt.protocolVersion === EVA_DENSE_MOTION_FAMILY_APPROVAL_PROVENANCE_PROTOCOL_VERSION_V1 &&
      receipt.reviewScope === 'complete-dense-motion-family-release-evidence' &&
      receipt.decision === approval.decision && receipt.role === role &&
      receipt.familyEvidenceFingerprint === fingerprint &&
      receipt.reviewer?.actorClass === 'human' &&
      receipt.reviewer?.actorId === approval.reviewer.actorId &&
      receipt.reviewedAt === approval.reviewedAt &&
      receipt.humanReviewCompleted === true &&
      receipt.automaticDecision === false,
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_EVIDENCE_BINDING_MISMATCH',
    role,
  );
  assert(
    validTimestamp(receipt.reviewedAt) && Date.parse(receipt.reviewedAt) <= Date.parse(assembledAt),
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_EVIDENCE_TIME_INVALID',
    role,
  );

  return Object.freeze({
    role,
    actorId: approval.reviewer.actorId,
    evidencePath: evidence.relativePath,
    evidenceSha256: evidence.sha256,
    reviewedAt: receipt.reviewedAt,
  });
}

export function verifyEvaDenseMotionFamilyApprovalProvenance({
  familyEvidenceRoot: rootInput,
  familyReleaseManifest,
  assembledAt,
}) {
  const root = realDirectory(rootInput);
  assert(
    familyReleaseManifest && SHA256.test(familyReleaseManifest.familyEvidenceFingerprint) &&
      familyReleaseManifest.approvals && validTimestamp(assembledAt),
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_INPUT_INVALID',
  );
  const fingerprint = familyReleaseManifest.familyEvidenceFingerprint;
  const verified = ROLES.map(({ key, role }) =>
    verifyApproval(root, familyReleaseManifest.approvals[key], role, fingerprint, assembledAt));

  assert(
    new Set(verified.map((entry) => entry.actorId)).size === ROLES.length,
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_APPROVER_INDEPENDENCE_REQUIRED',
  );
  assert(
    new Set(verified.map((entry) => entry.evidencePath)).size === ROLES.length &&
      new Set(verified.map((entry) => entry.evidenceSha256)).size === ROLES.length,
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_DISTINCT_EVIDENCE_REQUIRED',
  );

  return Object.freeze({
    schema: 'evavo.project-art-eva-dense-motion-family-approval-provenance-verification.v1',
    protocolVersion: EVA_DENSE_MOTION_FAMILY_APPROVAL_PROVENANCE_PROTOCOL_VERSION_V1,
    status: 'file-backed-human-family-approval-provenance-verified',
    familyEvidenceFingerprint: fingerprint,
    approvalCount: verified.length,
    approvals: Object.freeze(verified),
    guarantees: Object.freeze({
      evidenceFilesContainedUnderFamilyRoot: true,
      evidenceFilesRegularAndNonSymlink: true,
      byteExactSha256Verified: true,
      reviewerRoleDecisionFingerprintAndTimeBound: true,
      distinctHumanActorsRequired: true,
      distinctEvidenceFilesRequired: true,
      automaticDecisionRejected: true,
    }),
  });
}

export function evaDenseMotionFamilyApprovalProvenanceCapabilities() {
  return Object.freeze({
    schema: 'evavo.project-art-eva-dense-motion-family-approval-provenance-capabilities.v1',
    protocolVersion: EVA_DENSE_MOTION_FAMILY_APPROVAL_PROVENANCE_PROTOCOL_VERSION_V1,
    fileBackedHumanFamilyApprovalEvidenceRequired: true,
    byteExactSha256VerificationRequired: true,
    containedRelativeEvidencePathsRequired: true,
    symlinkEvidenceRejected: true,
    semanticReviewBindingRequired: true,
    distinctHumanApproversRequired: true,
    distinctEvidenceFilesRequired: true,
    humanDecisionCreation: false,
    automaticDecision: false,
    providerExecution: false,
    imageMutation: false,
    publication: false,
    deployment: false,
    runtimeActivation: false,
  });
}
