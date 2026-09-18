#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EVA_DENSE_MOTION_FAMILY_APPROVAL_PROVENANCE_PROTOCOL_VERSION_V1,
  EVA_DENSE_MOTION_FAMILY_HUMAN_REVIEW_EVIDENCE_SCHEMA_V1,
  evaDenseMotionFamilyApprovalProvenanceCapabilities,
  verifyEvaDenseMotionFamilyApprovalProvenance,
} from './project-art/eva-dense-motion-family-approval-provenance-v1.mjs';

const assembledAt = '2026-09-09T00:00:00.000Z';
const fingerprint = 'a'.repeat(64);
const root = mkdtempSync(path.join(os.tmpdir(), 'eva-family-approval-provenance-'));
const evidenceDir = path.join(root, 'human-approvals');
mkdirSync(evidenceDir, { recursive: true });

function reviewReceipt(role, actorId, reviewedAt) {
  return {
    schema: EVA_DENSE_MOTION_FAMILY_HUMAN_REVIEW_EVIDENCE_SCHEMA_V1,
    protocolVersion: EVA_DENSE_MOTION_FAMILY_APPROVAL_PROVENANCE_PROTOCOL_VERSION_V1,
    reviewScope: 'complete-dense-motion-family-release-evidence',
    decision: 'approve-dense-motion-family-release-evidence',
    role,
    familyEvidenceFingerprint: fingerprint,
    reviewer: { actorClass: 'human', actorId },
    reviewedAt,
    humanReviewCompleted: true,
    automaticDecision: false,
  };
}

function writeReview(role, actorId, reviewedAt, filename) {
  const relative = `human-approvals/${filename}`;
  const bytes = Buffer.from(`${JSON.stringify(reviewReceipt(role, actorId, reviewedAt), null, 2)}\n`);
  writeFileSync(path.join(root, relative), bytes, { flag: 'wx' });
  return {
    path: relative,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function approval(role, actorId, reviewedAt, evidence) {
  return {
    decision: 'approve-dense-motion-family-release-evidence',
    role,
    familyEvidenceFingerprint: fingerprint,
    reviewer: {
      actorClass: 'human',
      actorId,
      evidencePath: evidence.path,
      evidenceSha256: evidence.sha256,
    },
    reviewedAt,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function throwsCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code, code);
}

try {
  const ownerEvidence = writeReview('owner', 'reviewer-owner', '2026-09-08T20:00:00.000Z', 'owner.json');
  const creativeEvidence = writeReview(
    'creative-director',
    'reviewer-creative',
    '2026-09-08T20:10:00.000Z',
    'creative.json',
  );
  const technicalEvidence = writeReview(
    'technical-director',
    'reviewer-technical',
    '2026-09-08T20:20:00.000Z',
    'technical.json',
  );
  const manifest = {
    familyEvidenceFingerprint: fingerprint,
    approvals: {
      owner: approval('owner', 'reviewer-owner', '2026-09-08T20:00:00.000Z', ownerEvidence),
      creativeDirector: approval(
        'creative-director',
        'reviewer-creative',
        '2026-09-08T20:10:00.000Z',
        creativeEvidence,
      ),
      technicalDirector: approval(
        'technical-director',
        'reviewer-technical',
        '2026-09-08T20:20:00.000Z',
        technicalEvidence,
      ),
    },
  };

  const verified = verifyEvaDenseMotionFamilyApprovalProvenance({
    familyEvidenceRoot: root,
    familyReleaseManifest: manifest,
    assembledAt,
  });
  assert.equal(verified.status, 'file-backed-human-family-approval-provenance-verified');
  assert.equal(verified.approvalCount, 3);
  assert.equal(verified.guarantees.byteExactSha256Verified, true);
  assert.equal(verified.guarantees.distinctEvidenceFilesRequired, true);

  const missing = clone(manifest);
  missing.approvals.owner.reviewer.evidencePath = 'human-approvals/missing.json';
  throwsCode(
    () => verifyEvaDenseMotionFamilyApprovalProvenance({
      familyEvidenceRoot: root,
      familyReleaseManifest: missing,
      assembledAt,
    }),
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_EVIDENCE_FILE_INVALID',
  );

  const escaped = clone(manifest);
  escaped.approvals.owner.reviewer.evidencePath = '../outside.json';
  throwsCode(
    () => verifyEvaDenseMotionFamilyApprovalProvenance({
      familyEvidenceRoot: root,
      familyReleaseManifest: escaped,
      assembledAt,
    }),
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_EVIDENCE_PATH_INVALID',
  );

  const ownerPath = path.join(root, ownerEvidence.path);
  const originalOwnerBytes = readFileSync(ownerPath);
  writeFileSync(ownerPath, Buffer.from(`${originalOwnerBytes.toString('utf8').trim()} \n`));
  throwsCode(
    () => verifyEvaDenseMotionFamilyApprovalProvenance({
      familyEvidenceRoot: root,
      familyReleaseManifest: manifest,
      assembledAt,
    }),
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_EVIDENCE_HASH_MISMATCH',
  );
  writeFileSync(ownerPath, originalOwnerBytes);

  const swapped = clone(manifest);
  swapped.approvals.owner.reviewer.evidencePath = creativeEvidence.path;
  swapped.approvals.owner.reviewer.evidenceSha256 = creativeEvidence.sha256;
  throwsCode(
    () => verifyEvaDenseMotionFamilyApprovalProvenance({
      familyEvidenceRoot: root,
      familyReleaseManifest: swapped,
      assembledAt,
    }),
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_EVIDENCE_BINDING_MISMATCH',
  );

  const duplicateHuman = clone(manifest);
  duplicateHuman.approvals.technicalDirector.reviewer.actorId = 'reviewer-creative';
  const technicalPath = path.join(root, technicalEvidence.path);
  const originalTechnicalBytes = readFileSync(technicalPath);
  const duplicateReceipt = reviewReceipt(
    'technical-director',
    'reviewer-creative',
    duplicateHuman.approvals.technicalDirector.reviewedAt,
  );
  const duplicateBytes = Buffer.from(`${JSON.stringify(duplicateReceipt, null, 2)}\n`);
  writeFileSync(technicalPath, duplicateBytes);
  duplicateHuman.approvals.technicalDirector.reviewer.evidenceSha256 =
    createHash('sha256').update(duplicateBytes).digest('hex');
  throwsCode(
    () => verifyEvaDenseMotionFamilyApprovalProvenance({
      familyEvidenceRoot: root,
      familyReleaseManifest: duplicateHuman,
      assembledAt,
    }),
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_APPROVER_INDEPENDENCE_REQUIRED',
  );
  writeFileSync(technicalPath, originalTechnicalBytes);

  const future = clone(manifest);
  const futureReceipt = reviewReceipt('owner', 'reviewer-owner', '2026-09-10T00:00:00.000Z');
  const futureBytes = Buffer.from(`${JSON.stringify(futureReceipt, null, 2)}\n`);
  writeFileSync(ownerPath, futureBytes);
  future.approvals.owner.reviewedAt = futureReceipt.reviewedAt;
  future.approvals.owner.reviewer.evidenceSha256 = createHash('sha256').update(futureBytes).digest('hex');
  throwsCode(
    () => verifyEvaDenseMotionFamilyApprovalProvenance({
      familyEvidenceRoot: root,
      familyReleaseManifest: future,
      assembledAt,
    }),
    'EVA_DENSE_FAMILY_APPROVAL_PROVENANCE_APPROVAL_TIME_INVALID',
  );
  writeFileSync(ownerPath, originalOwnerBytes);

  const capabilities = evaDenseMotionFamilyApprovalProvenanceCapabilities();
  assert.equal(capabilities.fileBackedHumanFamilyApprovalEvidenceRequired, true);
  assert.equal(capabilities.byteExactSha256VerificationRequired, true);
  assert.equal(capabilities.semanticReviewBindingRequired, true);
  assert.equal(capabilities.distinctEvidenceFilesRequired, true);
  assert.equal(capabilities.humanDecisionCreation, false);
  assert.equal(capabilities.automaticDecision, false);
  assert.equal(capabilities.publication, false);
  assert.equal(capabilities.deployment, false);
  assert.equal(capabilities.runtimeActivation, false);

  const testRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const wrapperSource = readFileSync(
    path.join(testRoot, 'scripts/project-art/eva-dense-motion-family-release-assembly-v2-provenance.mjs'),
    'utf8',
  );
  assert.ok(
    wrapperSource.indexOf('verifyEvaDenseMotionFamilyApprovalProvenance') <
      wrapperSource.indexOf('compileEvaDenseMotionFamilyReleaseEvidenceV2(args)'),
  );
  assert.ok(wrapperSource.includes('approvalProvenance'));
  assert.equal(wrapperSource.includes('runtimeActivation: true'), false);
  assert.equal(wrapperSource.includes('publication: true'), false);

  console.log('EVA dense family approval provenance guard passed.');
  console.log('- owner, creative and technical approvals require byte-backed evidence files');
  console.log('- evidence paths are contained under the sealed family root');
  console.log('- reviewer, role, decision, family fingerprint and review time are semantically bound');
  console.log('- tampered, missing, swapped and future-dated evidence is rejected');
  console.log('- human approval creation, publication, deployment and runtime activation remain closed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
