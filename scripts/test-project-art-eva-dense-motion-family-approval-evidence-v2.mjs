#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  EVA_DENSE_MOTION_HUMAN_REVIEW_EVIDENCE_SCHEMA_V1,
  assertIndependentEvaDenseMotionHumanReviewEvidence,
  evaDenseMotionHumanReviewEvidenceCapabilities,
  verifyEvaDenseMotionHumanReviewEvidence,
} from './project-art/eva-dense-motion-family-approval-evidence.mjs';

const root = mkdtempSync(path.join(os.tmpdir(), 'eva-dense-human-review-'));
const fingerprint = 'f'.repeat(64);
const reviewedAt = '2026-09-08T10:00:00.000Z';

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function writeEvidence(role, actorId, summary) {
  const relative = `reviews/${role}.json`;
  const absolute = path.join(root, relative);
  mkdirSync(path.dirname(absolute), { recursive: true });
  const value = {
    schema: EVA_DENSE_MOTION_HUMAN_REVIEW_EVIDENCE_SCHEMA_V1,
    familyEvidenceFingerprint: fingerprint,
    role,
    decision: 'approve-dense-motion-family-release-evidence',
    reviewer: { actorClass: 'human', actorId },
    reviewedAt,
    summary,
  };
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(absolute, bytes, { mode: 0o600 });
  return {
    actorClass: 'human',
    actorId,
    evidencePath: relative,
    evidenceSha256: digest(bytes),
  };
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code, code);
}

try {
  const owner = writeEvidence('owner', 'human.owner', 'Reviewed the complete dense motion family evidence and approve it.');
  const creative = writeEvidence('creative-director', 'human.creative', 'Reviewed identity, expression and motion continuity and approve it.');
  const technical = writeEvidence('technical-director', 'human.technical', 'Reviewed runtime evidence, alpha and continuity gates and approve it.');

  for (const [role, reviewer] of [
    ['owner', owner],
    ['creative-director', creative],
    ['technical-director', technical],
  ]) {
    const verified = verifyEvaDenseMotionHumanReviewEvidence({
      familyEvidenceRoot: root,
      reviewer,
      role,
      familyEvidenceFingerprint: fingerprint,
      reviewedAt,
    });
    assert.equal(verified.sha256, reviewer.evidenceSha256);
    assert.equal(verified.path, reviewer.evidencePath);
  }
  assert.equal(
    assertIndependentEvaDenseMotionHumanReviewEvidence([
      { reviewer: owner },
      { reviewer: creative },
      { reviewer: technical },
    ]),
    true,
  );

  expectCode(
    () => verifyEvaDenseMotionHumanReviewEvidence({
      familyEvidenceRoot: root,
      reviewer: { ...owner, evidencePath: undefined },
      role: 'owner',
      familyEvidenceFingerprint: fingerprint,
      reviewedAt,
    }),
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_REVIEWER_INVALID',
  );

  expectCode(
    () => verifyEvaDenseMotionHumanReviewEvidence({
      familyEvidenceRoot: root,
      reviewer: { ...owner, evidencePath: '../outside.json' },
      role: 'owner',
      familyEvidenceFingerprint: fingerprint,
      reviewedAt,
    }),
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_PATH_INVALID',
  );

  expectCode(
    () => verifyEvaDenseMotionHumanReviewEvidence({
      familyEvidenceRoot: root,
      reviewer: { ...owner, evidencePath: 'reviews/missing.json' },
      role: 'owner',
      familyEvidenceFingerprint: fingerprint,
      reviewedAt,
    }),
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_FILE_INVALID',
  );

  expectCode(
    () => verifyEvaDenseMotionHumanReviewEvidence({
      familyEvidenceRoot: root,
      reviewer: { ...owner, evidenceSha256: '0'.repeat(64) },
      role: 'owner',
      familyEvidenceFingerprint: fingerprint,
      reviewedAt,
    }),
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_HASH_MISMATCH',
  );

  const forgedPath = path.join(root, 'reviews/forged.json');
  const forged = {
    schema: EVA_DENSE_MOTION_HUMAN_REVIEW_EVIDENCE_SCHEMA_V1,
    familyEvidenceFingerprint: '0'.repeat(64),
    role: 'owner',
    decision: 'approve-dense-motion-family-release-evidence',
    reviewer: { actorClass: 'human', actorId: 'human.owner' },
    reviewedAt,
    summary: 'Looks acceptable but this record is bound to the wrong family.',
  };
  const forgedBytes = `${JSON.stringify(forged, null, 2)}\n`;
  writeFileSync(forgedPath, forgedBytes, { mode: 0o600 });
  expectCode(
    () => verifyEvaDenseMotionHumanReviewEvidence({
      familyEvidenceRoot: root,
      reviewer: {
        ...owner,
        evidencePath: 'reviews/forged.json',
        evidenceSha256: digest(forgedBytes),
      },
      role: 'owner',
      familyEvidenceFingerprint: fingerprint,
      reviewedAt,
    }),
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_BINDING_INVALID',
  );

  expectCode(
    () => assertIndependentEvaDenseMotionHumanReviewEvidence([
      { reviewer: owner },
      { reviewer: { ...creative, evidenceSha256: owner.evidenceSha256 } },
      { reviewer: technical },
    ]),
    'EVA_DENSE_HUMAN_REVIEW_EVIDENCE_INDEPENDENCE_REQUIRED',
  );

  const capabilities = evaDenseMotionHumanReviewEvidenceCapabilities();
  assert.equal(capabilities.fileBackedEvidenceRequired, true);
  assert.equal(capabilities.familyFingerprintBindingRequired, true);
  assert.equal(capabilities.reviewerIdentityBindingRequired, true);
  assert.equal(capabilities.distinctApprovalEvidenceRequired, true);
  assert.equal(capabilities.automaticApprovalCreationAllowed, false);

  console.log('EVA dense human-review evidence behavioral guard passed.');
  console.log('- valid three-party file-backed review evidence verifies');
  console.log('- missing, escaped, absent, hash-mismatched and misbound evidence fails closed');
  console.log('- one evidence digest cannot be reused across independent family approvals');
} finally {
  rmSync(root, { recursive: true, force: true });
}
