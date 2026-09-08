#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EVA_DENSE_MOTION_FAMILY_RELEASE_ASSEMBLY_PROTOCOL_VERSION_V2,
  evaDenseMotionFamilyReleaseAssemblyV2Capabilities,
} from './project-art/eva-dense-motion-family-release-assembly-v2.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(
  path.join(root, 'scripts/project-art/eva-dense-motion-family-release-assembly-v2.mjs'),
  'utf8',
);
for (const marker of [
  "'2026-09-08.1'",
  "schema: 'evavo.project-art-eva-dense-motion-family-evidence-fingerprint.v1'",
  'familyReleaseManifest.familyEvidenceFingerprint === fingerprint',
  'value.familyEvidenceFingerprint === fingerprint',
  'verifyEvaDenseMotionHumanReviewEvidence',
  'assertIndependentEvaDenseMotionHumanReviewEvidence([owner, creativeDirector, technicalDirector])',
  "familyApproval(familyEvidenceRoot, familyReleaseManifest.approvals?.owner, 'owner'",
  "familyApproval(familyEvidenceRoot, familyReleaseManifest.approvals?.creativeDirector, 'creative-director'",
  "familyApproval(familyEvidenceRoot, familyReleaseManifest.approvals?.technicalDirector, 'technical-director'",
  "typeof value.reviewer?.evidencePath === 'string'",
  'new Set([owner.reviewer.actorId, creativeDirector.reviewer.actorId, technicalDirector.reviewer.actorId]).size === 3',
  'fileBackedHumanApprovalEvidenceRequired: true',
  'distinctHumanApprovalEvidenceRequired: true',
  'compileEvaDenseMotionReleaseEvidence',
  'evaluateEvaDenseMotionReleaseEvidence',
  'evaluation.runtimeReceiptAssemblyReady === true',
  'evaluation.publicationAllowed === false',
  'evaluation.runtimeActivationAllowed === false',
]) assert.ok(source.includes(marker), marker);

for (const forbidden of [
  "'2026-08-22.2'",
  'approval.familyEvidenceSha256 === familyReleaseManifest.manifestSha256',
  'providerExecution: true',
  'cloudinaryUpload: true',
  'publication: true',
  'deployment: true',
  'runtimeActivation: true',
  'forcePush: true',
]) assert.equal(source.includes(forbidden), false, forbidden);

assert.equal(EVA_DENSE_MOTION_FAMILY_RELEASE_ASSEMBLY_PROTOCOL_VERSION_V2, '2026-09-08.1');
const capabilities = evaDenseMotionFamilyReleaseAssemblyV2Capabilities();
assert.equal(capabilities.nonCircularFamilyEvidenceFingerprintRequired, true);
assert.equal(capabilities.fileBackedHumanApprovalEvidenceRequired, true);
assert.equal(capabilities.distinctFamilyApproversRequired, true);
assert.equal(capabilities.distinctHumanApprovalEvidenceRequired, true);
assert.equal(capabilities.exactTenRuntimeFrameEvidenceRequired, true);
assert.equal(capabilities.exactTenContinuityEdgesRequired, true);
assert.equal(capabilities.runtime037OrNewerRequired, true);
assert.equal(capabilities.providerExecution, false);
assert.equal(capabilities.cloudinaryUpload, false);
assert.equal(capabilities.publication, false);
assert.equal(capabilities.deployment, false);
assert.equal(capabilities.runtimeActivation, false);

console.log('EVA dense family release assembler v2 guard passed.');
console.log('- family approvals sign non-circular evidence fingerprint');
console.log('- owner, creative director and technical director must be distinct humans');
console.log('- each approval is backed by distinct hash-matched human review evidence');
console.log('- existing release evaluator remains authoritative');
console.log('- publication, deployment and activation remain closed');
