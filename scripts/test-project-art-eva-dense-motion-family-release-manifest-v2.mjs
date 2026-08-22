#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EVA_DENSE_MOTION_FAMILY_FINGERPRINT_PLAN_SCHEMA_V2,
} from './project-art/eva-dense-motion-family-release-manifest-v2.mjs';
import { main as cliMain } from './run-project-art-eva-dense-motion-family-release-manifest-v2.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleSource = readFileSync(
  path.join(root, 'scripts/project-art/eva-dense-motion-family-release-manifest-v2.mjs'),
  'utf8',
);
const cliSource = readFileSync(
  path.join(root, 'scripts/run-project-art-eva-dense-motion-family-release-manifest-v2.mjs'),
  'utf8',
);

for (const marker of [
  "'evavo.project-art-eva-dense-motion-family-fingerprint-plan.v2'",
  "schema: 'evavo.project-art-eva-dense-motion-family-evidence-fingerprint.v1'",
  "requiredExternalApprovals: Object.freeze(['owner', 'creative-director', 'technical-director'])",
  'automaticApprovalCreationAllowed: false',
  "verifyApproval(ownerApproval, 'owner'",
  "verifyApproval(creativeDirectorApproval, 'creative-director'",
  "verifyApproval(technicalDirectorApproval, 'technical-director'",
  'new Set([owner.reviewer.actorId, creative.reviewer.actorId, technical.reviewer.actorId]).size === 3',
  'approvalSubjectIsNonCircularFamilyEvidenceFingerprint: true',
]) assert.ok(moduleSource.includes(marker), marker);

for (const forbidden of [
  'automaticApprovalCreationAllowed: true',
  'actorClass: \'human\', actorId:',
  'decision: \'approve-dense-motion-family-release-evidence\',' + ' reviewer:',
]) assert.equal(moduleSource.includes(forbidden), false, forbidden);

for (const marker of [
  "command === 'fingerprint'",
  "command === 'manifest'",
  '--owner-approval',
  '--creative-director-approval',
  '--technical-director-approval',
  'readEvaDenseMotionFamilyApprovalFileV2',
  'automaticApprovalCreationAllowed: result.policy.automaticApprovalCreationAllowed',
  'pathToFileURL(path.resolve(process.argv[1])).href',
]) assert.ok(cliSource.includes(marker), marker);

assert.equal(
  EVA_DENSE_MOTION_FAMILY_FINGERPRINT_PLAN_SCHEMA_V2,
  'evavo.project-art-eva-dense-motion-family-fingerprint-plan.v2',
);
assert.equal(typeof cliMain, 'function');

console.log('EVA dense family manifest v2 guard passed.');
console.log('- fingerprint is available before human approvals exist');
console.log('- manifest consumes externally authored approval files only');
console.log('- owner, creative director and technical director must be distinct');
console.log('- automatic approval creation remains unavailable');
