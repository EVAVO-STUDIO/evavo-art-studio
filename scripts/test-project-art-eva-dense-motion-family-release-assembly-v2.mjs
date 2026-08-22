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
  "'2026-08-22.2'",
  "schema: 'evavo.project-art-eva-dense-motion-family-evidence-fingerprint.v1'",
  'familyReleaseManifest.familyEvidenceFingerprint === fingerprint',
  'value.familyEvidenceFingerprint === fingerprint',
  "familyApproval(familyReleaseManifest.approvals?.owner, 'owner'",
  "familyApproval(familyReleaseManifest.approvals?.creativeDirector, 'creative-director'",
  "familyApproval(familyReleaseManifest.approvals?.technicalDirector, 'technical-director'",
  'new Set([owner.reviewer.actorId, creativeDirector.reviewer.actorId, technicalDirector.reviewer.actorId]).size === 3',
  'compileEvaDenseMotionReleaseEvidence',
  'evaluateEvaDenseMotionReleaseEvidence',
  'evaluation.runtimeReceiptAssemblyReady === true',
  'evaluation.publicationAllowed === false',
  'evaluation.runtimeActivationAllowed === false',
]) assert.ok(source.includes(marker), marker);

for (const forbidden of [
  'approval.familyEvidenceSha256 === familyReleaseManifest.manifestSha256',
  'providerExecution: true',
  'cloudinaryUpload: true',
  'publication: true',
  'deployment: true',
  'runtimeActivation: true',
  'forcePush: true',
]) assert.equal(source.includes(forbidden), false, forbidden);

assert.equal(EVA_DENSE_MOTION_FAMILY_RELEASE_ASSEMBLY_PROTOCOL_VERSION_V2, '2026-08-22.2');
const capabilities = evaDenseMotionFamilyReleaseAssemblyV2Capabilities();
assert.equal(capabilities.nonCircularFamilyEvidenceFingerprintRequired, true);
assert.equal(capabilities.distinctFamilyApproversRequired, true);
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
console.log('- existing release evaluator remains authoritative');
console.log('- publication, deployment and activation remain closed');
