import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
  EVA_DENSE_MOTION_FAMILY_APPROVAL_PROVENANCE_PROTOCOL_VERSION_V1,
  EVA_DENSE_MOTION_FAMILY_HUMAN_REVIEW_EVIDENCE_SCHEMA_V1,
} from './eva-dense-motion-family-approval-provenance-v1.mjs';

export const EVA_DENSE_MOTION_FAMILY_HUMAN_REVIEW_EVIDENCE_STAGE_VERSION_V1 =
  '2026-09-09.1';

const MAXIMUM_REVIEW_EVIDENCE_BYTES = 4 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;

function assert(condition, code, message = code) {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function realDirectory(value, code, label) {
  assert(typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'), code, label);
  const normalized = path.normalize(value);
  let metadata;
  let real;
  try {
    metadata = lstatSync(normalized);
    real = realpathSync(normalized);
  } catch {
    assert(false, code, label);
  }
  assert(metadata.isDirectory() && !metadata.isSymbolicLink() && real === normalized, code, label);
  return normalized;
}

function stableSourceFile(filePath) {
  assert(
    typeof filePath === 'string' && path.isAbsolute(filePath) && !filePath.includes('\0'),
    'EVA_DENSE_FAMILY_REVIEW_STAGE_SOURCE_INVALID',
  );
  const absolute = path.normalize(filePath);
  let before;
  let real;
  try {
    before = lstatSync(absolute);
    real = realpathSync(absolute);
  } catch {
    assert(false, 'EVA_DENSE_FAMILY_REVIEW_STAGE_SOURCE_INVALID');
  }
  assert(
    before.isFile() && !before.isSymbolicLink() && before.nlink === 1 &&
      before.size >= 1 && before.size <= MAXIMUM_REVIEW_EVIDENCE_BYTES && real === absolute,
    'EVA_DENSE_FAMILY_REVIEW_STAGE_SOURCE_INVALID',
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  for (const field of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
    assert(before[field] === after[field], 'EVA_DENSE_FAMILY_REVIEW_STAGE_SOURCE_CHANGED');
  }
  return Object.freeze({ absolute, bytes });
}

function safeDestination(root, relativePath) {
  assert(
    typeof relativePath === 'string' && relativePath.length >= 1 && relativePath.length <= 1024 &&
      !relativePath.includes('\0') && !relativePath.includes('\\') &&
      !path.posix.isAbsolute(relativePath) && !path.win32.isAbsolute(relativePath),
    'EVA_DENSE_FAMILY_REVIEW_STAGE_DESTINATION_INVALID',
  );
  const parts = relativePath.split('/');
  assert(
    parts.every((part) => part.length >= 1 && part !== '.' && part !== '..'),
    'EVA_DENSE_FAMILY_REVIEW_STAGE_DESTINATION_INVALID',
  );
  const absolute = path.resolve(root, ...parts);
  assert(inside(root, absolute) && absolute !== root, 'EVA_DENSE_FAMILY_REVIEW_STAGE_DESTINATION_INVALID');
  const parent = realDirectory(
    path.dirname(absolute),
    'EVA_DENSE_FAMILY_REVIEW_STAGE_DESTINATION_PARENT_INVALID',
    'destination parent',
  );
  assert(inside(root, parent), 'EVA_DENSE_FAMILY_REVIEW_STAGE_DESTINATION_PARENT_INVALID');
  return Object.freeze({ relativePath, absolute });
}

function parseHumanReview(bytes) {
  let document;
  try {
    document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    assert(false, 'EVA_DENSE_FAMILY_REVIEW_STAGE_DOCUMENT_JSON_INVALID');
  }
  return document;
}

function verifyExpected(document, expected) {
  assert(
    expected && SAFE_ID.test(expected.actorId) &&
      ['owner', 'creative-director', 'technical-director'].includes(expected.role) &&
      SHA256.test(expected.familyEvidenceFingerprint) &&
      expected.decision === 'approve-dense-motion-family-release-evidence' &&
      typeof expected.reviewedAt === 'string' && Number.isFinite(Date.parse(expected.reviewedAt)),
    'EVA_DENSE_FAMILY_REVIEW_STAGE_EXPECTED_BINDING_INVALID',
  );
  assert(
    document?.schema === EVA_DENSE_MOTION_FAMILY_HUMAN_REVIEW_EVIDENCE_SCHEMA_V1 &&
      document.protocolVersion === EVA_DENSE_MOTION_FAMILY_APPROVAL_PROVENANCE_PROTOCOL_VERSION_V1 &&
      document.reviewScope === 'complete-dense-motion-family-release-evidence' &&
      document.decision === expected.decision && document.role === expected.role &&
      document.familyEvidenceFingerprint === expected.familyEvidenceFingerprint &&
      document.reviewer?.actorClass === 'human' && document.reviewer?.actorId === expected.actorId &&
      document.reviewedAt === expected.reviewedAt &&
      document.humanReviewCompleted === true && document.automaticDecision === false,
    'EVA_DENSE_FAMILY_REVIEW_STAGE_DOCUMENT_BINDING_MISMATCH',
  );
}

function verifyWrittenFile(destination, expectedBytes) {
  const metadata = lstatSync(destination.absolute);
  assert(
    metadata.isFile() && !metadata.isSymbolicLink() && metadata.nlink === 1 &&
      metadata.size === expectedBytes.length && realpathSync(destination.absolute) === destination.absolute,
    'EVA_DENSE_FAMILY_REVIEW_STAGE_WRITE_INVALID',
  );
  const written = readFileSync(destination.absolute);
  assert(
    written.length === expectedBytes.length && written.equals(expectedBytes),
    'EVA_DENSE_FAMILY_REVIEW_STAGE_WRITE_MISMATCH',
  );
  return createHash('sha256').update(written).digest('hex');
}

export function stageEvaDenseMotionFamilyHumanReviewEvidenceV1({
  familyEvidenceRoot: rootInput,
  sourceEvidenceFile,
  destinationRelativePath,
  expected,
}) {
  const root = realDirectory(
    rootInput,
    'EVA_DENSE_FAMILY_REVIEW_STAGE_ROOT_INVALID',
    'familyEvidenceRoot',
  );
  const source = stableSourceFile(sourceEvidenceFile);
  const destination = safeDestination(root, destinationRelativePath);
  assert(source.absolute !== destination.absolute, 'EVA_DENSE_FAMILY_REVIEW_STAGE_SOURCE_DESTINATION_COLLISION');

  const document = parseHumanReview(source.bytes);
  verifyExpected(document, expected);
  const sha256 = createHash('sha256').update(source.bytes).digest('hex');

  let wrote = false;
  try {
    writeFileSync(destination.absolute, source.bytes, { flag: 'wx', mode: 0o600 });
    wrote = true;
    const writtenSha256 = verifyWrittenFile(destination, source.bytes);
    assert(writtenSha256 === sha256, 'EVA_DENSE_FAMILY_REVIEW_STAGE_WRITE_HASH_MISMATCH');
  } catch (error) {
    if (wrote) {
      try {
        unlinkSync(destination.absolute);
      } catch {
        // Preserve the original failure; cleanup is best-effort only.
      }
    }
    if (error?.code === 'EEXIST') {
      const collision = new Error('EVA_DENSE_FAMILY_REVIEW_STAGE_CREATE_ONLY_COLLISION');
      collision.code = 'EVA_DENSE_FAMILY_REVIEW_STAGE_CREATE_ONLY_COLLISION';
      throw collision;
    }
    throw error;
  }

  return Object.freeze({
    schema: 'evavo.project-art-eva-dense-motion-family-human-review-evidence-stage-receipt.v1',
    stageVersion: EVA_DENSE_MOTION_FAMILY_HUMAN_REVIEW_EVIDENCE_STAGE_VERSION_V1,
    status: 'exact-human-review-evidence-bytes-staged-create-only',
    evidencePath: destination.relativePath,
    evidenceSha256: sha256,
    byteLength: source.bytes.length,
    contentTransformed: false,
    humanDecisionCreated: false,
    automaticDecision: false,
    publicationAllowed: false,
    deploymentAllowed: false,
    runtimeActivationAllowed: false,
  });
}

export function evaDenseMotionFamilyHumanReviewEvidenceStageV1Capabilities() {
  return Object.freeze({
    schema: 'evavo.project-art-eva-dense-motion-family-human-review-evidence-stage-capabilities.v1',
    version: EVA_DENSE_MOTION_FAMILY_HUMAN_REVIEW_EVIDENCE_STAGE_VERSION_V1,
    exactSourceBytesPreserved: true,
    createOnlyDestination: true,
    containedDestinationRequired: true,
    sourceAndDestinationSymlinksRejected: true,
    semanticHumanReviewBindingRequiredBeforeWrite: true,
    reviewerEvidenceReferenceProduced: true,
    contentTransformation: false,
    humanDecisionCreation: false,
    automaticDecision: false,
    providerExecution: false,
    imageMutation: false,
    publication: false,
    deployment: false,
    runtimeActivation: false,
  });
}
