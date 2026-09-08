import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

export const EVA_DENSE_MOTION_HUMAN_REVIEW_EVIDENCE_SCHEMA_V1 =
  'evavo.project-art-eva-dense-motion-human-review-evidence.v1';

const MAXIMUM_REVIEW_EVIDENCE_BYTES = 16 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;
const SAFE_ROLE = new Set(['owner', 'creative-director', 'technical-director']);

function assert(condition, code, message = code) {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}

function canonicalEvidencePath(value, label) {
  assert(
    typeof value === 'string' &&
      value.length >= 1 &&
      value.length <= 1024 &&
      !/[\\\0\r\n]/u.test(value) &&
      !value.startsWith('/') &&
      !/^[A-Za-z]:/u.test(value),
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_PATH_INVALID',
    label,
  );
  const segments = value.split('/');
  assert(
    segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..') &&
      segments.join('/') === value,
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_PATH_INVALID',
    label,
  );
  return value;
}

function realDirectory(value) {
  assert(
    typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'),
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_ROOT_INVALID',
  );
  const normalized = path.normalize(value);
  let metadata;
  try {
    metadata = lstatSync(normalized);
  } catch {
    assert(false, 'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_ROOT_INVALID');
  }
  assert(
    metadata.isDirectory() &&
      !metadata.isSymbolicLink() &&
      realpathSync(normalized) === normalized,
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_ROOT_INVALID',
  );
  return normalized;
}

function stableReviewEvidenceFile(root, relativePath, label) {
  const canonical = canonicalEvidencePath(relativePath, label);
  const absolute = path.join(root, ...canonical.split('/'));
  const relative = path.relative(root, absolute);
  assert(
    relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative),
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_PATH_ESCAPE',
    label,
  );
  let before;
  try {
    before = lstatSync(absolute);
  } catch {
    assert(false, 'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_FILE_INVALID', label);
  }
  assert(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      before.size >= 2 &&
      before.size <= MAXIMUM_REVIEW_EVIDENCE_BYTES &&
      realpathSync(absolute) === absolute,
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_FILE_INVALID',
    label,
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(
      before[field] === after[field],
      'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_FILE_CHANGED',
      label,
    );
  }
  return Object.freeze({
    path: canonical,
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

function parseReviewEvidence(bytes, label) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    assert(false, 'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_JSON_INVALID', label);
  }
}

function exactReviewTimestamp(value, label) {
  assert(
    typeof value === 'string' &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_TIME_INVALID',
    label,
  );
  return value;
}

export function verifyEvaDenseMotionHumanReviewEvidence({
  familyEvidenceRoot,
  reviewer,
  role,
  familyEvidenceFingerprint,
  reviewedAt,
}) {
  assert(SAFE_ROLE.has(role), 'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_ROLE_INVALID', role);
  assert(
    SHA256.test(familyEvidenceFingerprint),
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_FINGERPRINT_INVALID',
    role,
  );
  const at = exactReviewTimestamp(reviewedAt, `${role}.reviewedAt`);
  assert(
    reviewer?.actorClass === 'human' &&
      SAFE_ID.test(reviewer?.actorId) &&
      typeof reviewer?.evidencePath === 'string' &&
      SHA256.test(reviewer?.evidenceSha256),
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_REVIEWER_INVALID',
    role,
  );

  const root = realDirectory(familyEvidenceRoot);
  const file = stableReviewEvidenceFile(root, reviewer.evidencePath, `${role}.reviewerEvidence`);
  assert(
    file.sha256 === reviewer.evidenceSha256,
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_HASH_MISMATCH',
    role,
  );
  const evidence = parseReviewEvidence(file.bytes, role);
  assert(
    evidence?.schema === EVA_DENSE_MOTION_HUMAN_REVIEW_EVIDENCE_SCHEMA_V1 &&
      evidence.familyEvidenceFingerprint === familyEvidenceFingerprint &&
      evidence.role === role &&
      evidence.decision === 'approve-dense-motion-family-release-evidence' &&
      evidence.reviewer?.actorClass === 'human' &&
      evidence.reviewer?.actorId === reviewer.actorId &&
      evidence.reviewedAt === at &&
      typeof evidence.summary === 'string' &&
      evidence.summary === evidence.summary.trim() &&
      evidence.summary.length >= 8 &&
      evidence.summary.length <= 4096,
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_BINDING_INVALID',
    role,
  );

  return Object.freeze({
    path: file.path,
    sha256: file.sha256,
    schema: evidence.schema,
    reviewer: Object.freeze({
      actorClass: 'human',
      actorId: reviewer.actorId,
    }),
    role,
    familyEvidenceFingerprint,
    reviewedAt: at,
  });
}

export function assertIndependentEvaDenseMotionHumanReviewEvidence(approvals) {
  assert(
    Array.isArray(approvals) &&
      approvals.length === 3 &&
      approvals.every((approval) => SHA256.test(approval?.reviewer?.evidenceSha256)),
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_SET_INVALID',
  );
  assert(
    new Set(approvals.map((approval) => approval.reviewer.evidenceSha256)).size === approvals.length,
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_INDEPENDENCE_REQUIRED',
  );
  return true;
}

export function evaDenseMotionHumanReviewEvidenceCapabilities() {
  return Object.freeze({
    schema: 'evavo.project-art-eva-dense-motion-human-review-evidence-capabilities.v1',
    fileBackedEvidenceRequired: true,
    familyFingerprintBindingRequired: true,
    reviewerIdentityBindingRequired: true,
    roleBindingRequired: true,
    decisionBindingRequired: true,
    reviewTimestampBindingRequired: true,
    nonEmptyHumanReviewSummaryRequired: true,
    canonicalRelativePathRequired: true,
    symlinkEvidenceAllowed: false,
    hardlinkedEvidenceAllowed: false,
    distinctApprovalEvidenceRequired: true,
    automaticApprovalCreationAllowed: false,
  });
}
