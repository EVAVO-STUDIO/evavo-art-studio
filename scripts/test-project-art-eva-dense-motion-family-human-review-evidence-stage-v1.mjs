#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  EVA_DENSE_MOTION_FAMILY_APPROVAL_PROVENANCE_PROTOCOL_VERSION_V1,
  EVA_DENSE_MOTION_FAMILY_HUMAN_REVIEW_EVIDENCE_SCHEMA_V1,
} from './project-art/eva-dense-motion-family-approval-provenance-v1.mjs';
import {
  evaDenseMotionFamilyHumanReviewEvidenceStageV1Capabilities,
  stageEvaDenseMotionFamilyHumanReviewEvidenceV1,
} from './project-art/eva-dense-motion-family-human-review-evidence-stage-v1.mjs';

const root = mkdtempSync(path.join(os.tmpdir(), 'eva-family-review-stage-root-'));
const sourceRoot = mkdtempSync(path.join(os.tmpdir(), 'eva-family-review-source-'));
mkdirSync(path.join(root, 'human-approvals'));

const fingerprint = 'b'.repeat(64);
const reviewedAt = '2026-09-09T00:00:00.000Z';
const expected = {
  role: 'owner',
  actorId: 'reviewer-owner',
  familyEvidenceFingerprint: fingerprint,
  decision: 'approve-dense-motion-family-release-evidence',
  reviewedAt,
};

function humanReview(overrides = {}) {
  return {
    schema: EVA_DENSE_MOTION_FAMILY_HUMAN_REVIEW_EVIDENCE_SCHEMA_V1,
    protocolVersion: EVA_DENSE_MOTION_FAMILY_APPROVAL_PROVENANCE_PROTOCOL_VERSION_V1,
    reviewScope: 'complete-dense-motion-family-release-evidence',
    decision: expected.decision,
    role: expected.role,
    familyEvidenceFingerprint: fingerprint,
    reviewer: { actorClass: 'human', actorId: expected.actorId },
    reviewedAt,
    humanReviewCompleted: true,
    automaticDecision: false,
    ...overrides,
  };
}

function sourceFile(name, document) {
  const file = path.join(sourceRoot, name);
  const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
  writeFileSync(file, bytes, { flag: 'wx' });
  return { file, bytes };
}

function throwsCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code, code);
}

try {
  const valid = sourceFile('owner.json', humanReview());
  const receipt = stageEvaDenseMotionFamilyHumanReviewEvidenceV1({
    familyEvidenceRoot: root,
    sourceEvidenceFile: valid.file,
    destinationRelativePath: 'human-approvals/owner.json',
    expected,
  });
  const stagedPath = path.join(root, 'human-approvals', 'owner.json');
  assert.deepEqual(readFileSync(stagedPath), valid.bytes);
  assert.equal(receipt.evidencePath, 'human-approvals/owner.json');
  assert.equal(receipt.evidenceSha256, createHash('sha256').update(valid.bytes).digest('hex'));
  assert.equal(receipt.contentTransformed, false);
  assert.equal(receipt.humanDecisionCreated, false);
  assert.equal(receipt.automaticDecision, false);
  assert.equal(receipt.publicationAllowed, false);
  assert.equal(receipt.deploymentAllowed, false);
  assert.equal(receipt.runtimeActivationAllowed, false);

  throwsCode(
    () => stageEvaDenseMotionFamilyHumanReviewEvidenceV1({
      familyEvidenceRoot: root,
      sourceEvidenceFile: valid.file,
      destinationRelativePath: 'human-approvals/owner.json',
      expected,
    }),
    'EVA_DENSE_FAMILY_REVIEW_STAGE_CREATE_ONLY_COLLISION',
  );

  const escapedSource = sourceFile('escaped.json', humanReview());
  throwsCode(
    () => stageEvaDenseMotionFamilyHumanReviewEvidenceV1({
      familyEvidenceRoot: root,
      sourceEvidenceFile: escapedSource.file,
      destinationRelativePath: '../escaped.json',
      expected,
    }),
    'EVA_DENSE_FAMILY_REVIEW_STAGE_DESTINATION_INVALID',
  );
  assert.equal(existsSync(path.join(path.dirname(root), 'escaped.json')), false);

  const automatic = sourceFile('automatic.json', humanReview({ automaticDecision: true }));
  throwsCode(
    () => stageEvaDenseMotionFamilyHumanReviewEvidenceV1({
      familyEvidenceRoot: root,
      sourceEvidenceFile: automatic.file,
      destinationRelativePath: 'human-approvals/automatic.json',
      expected,
    }),
    'EVA_DENSE_FAMILY_REVIEW_STAGE_DOCUMENT_BINDING_MISMATCH',
  );
  assert.equal(existsSync(path.join(root, 'human-approvals', 'automatic.json')), false);

  const wrongActor = sourceFile(
    'wrong-actor.json',
    humanReview({ reviewer: { actorClass: 'human', actorId: 'different-reviewer' } }),
  );
  throwsCode(
    () => stageEvaDenseMotionFamilyHumanReviewEvidenceV1({
      familyEvidenceRoot: root,
      sourceEvidenceFile: wrongActor.file,
      destinationRelativePath: 'human-approvals/wrong-actor.json',
      expected,
    }),
    'EVA_DENSE_FAMILY_REVIEW_STAGE_DOCUMENT_BINDING_MISMATCH',
  );
  assert.equal(existsSync(path.join(root, 'human-approvals', 'wrong-actor.json')), false);

  const wrongFingerprint = sourceFile(
    'wrong-fingerprint.json',
    humanReview({ familyEvidenceFingerprint: 'c'.repeat(64) }),
  );
  throwsCode(
    () => stageEvaDenseMotionFamilyHumanReviewEvidenceV1({
      familyEvidenceRoot: root,
      sourceEvidenceFile: wrongFingerprint.file,
      destinationRelativePath: 'human-approvals/wrong-fingerprint.json',
      expected,
    }),
    'EVA_DENSE_FAMILY_REVIEW_STAGE_DOCUMENT_BINDING_MISMATCH',
  );

  const capabilities = evaDenseMotionFamilyHumanReviewEvidenceStageV1Capabilities();
  assert.equal(capabilities.exactSourceBytesPreserved, true);
  assert.equal(capabilities.createOnlyDestination, true);
  assert.equal(capabilities.semanticHumanReviewBindingRequiredBeforeWrite, true);
  assert.equal(capabilities.reviewerEvidenceReferenceProduced, true);
  assert.equal(capabilities.contentTransformation, false);
  assert.equal(capabilities.humanDecisionCreation, false);
  assert.equal(capabilities.automaticDecision, false);
  assert.equal(capabilities.publication, false);
  assert.equal(capabilities.deployment, false);
  assert.equal(capabilities.runtimeActivation, false);

  console.log('EVA dense family human-review evidence staging guard passed.');
  console.log('- exact human-authored review bytes are preserved create-only');
  console.log('- staged evidence returns a byte-exact SHA-256 approval reference');
  console.log('- path escape, overwrite, semantic mismatch and automatic decision evidence are rejected');
  console.log('- staging does not create review decisions, publish, deploy, or activate Runtime');
} finally {
  rmSync(root, { recursive: true, force: true });
  rmSync(sourceRoot, { recursive: true, force: true });
}
