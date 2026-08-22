#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EVA_DENSE_MOTION_FRAME_REVIEW_INTAKE_PROTOCOL_VERSION,
  evaDenseMotionFrameReviewIntakeCapabilities,
} from './project-art/eva-dense-motion-frame-review-intake.mjs';
import { main as reviewIntakeCliMain } from './run-project-art-eva-dense-motion-frame-review-intake.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = Object.freeze({
  campaign: 'scripts/project-art/eva-dense-motion-frame-review-intake.mjs',
  cli: 'scripts/run-project-art-eva-dense-motion-frame-review-intake.mjs',
  preflight: 'scripts/project-art/avatar-final-pass-provider-frame-review-preflight.mjs',
  pinned: 'scripts/project-art/avatar-final-pass-provider-frame-review-pinned.mjs',
  mastering: 'scripts/project-art/eva-dense-motion-mastering-campaign.mjs',
});

const source = {};
for (const [label, relative] of Object.entries(files)) {
  const absolute = path.join(root, relative);
  const metadata = lstatSync(absolute);
  assert.equal(metadata.isFile(), true, `${relative} must be a file`);
  assert.equal(metadata.isSymbolicLink(), false, `${relative} must not be a symlink`);
  source[label] = readFileSync(absolute, 'utf8');
  assert.ok(source[label].length > 0, `${relative} must not be empty`);
}

function includes(label, tokens) {
  for (const token of tokens) {
    assert.ok(source[label].includes(token), `${label} missing ${token}`);
  }
}

includes('campaign', [
  'preflightAvatarFinalPassProviderFrameReviewFiles',
  'reviewAvatarFinalPassProviderFrameFilesPinned',
  'verifyEvaDenseMotionMasteringCampaignReceipt',
  'verifyEvaDenseMotionTenMasterProgram',
  'allTenShadowReviewedBeforeFirstPersistentOutcome: true',
  'decisionsMustBeExternallyAuthoredNamedHumanEvidence: true',
  'automaticDecisionCreationAllowed: false',
  'exactDecisionFileShaPinnedAfterPreflight: true',
  'mixedHumanOutcomesPreserved: true',
  "'succeeded-all-ten-human-approved'",
  "'succeeded-human-review-recorded-repair-or-rejection-present'",
  'technicalInspectionsCreated: 0',
  'creativeApprovalsCreated: 0',
  'cloudinaryUploadsPerformed: 0',
  'runtimeActivationsPerformed: 0',
  'return deepFreeze({ plan, receipt });',
  'receipt?.planSha256 === plan?.planSha256',
]);

includes('preflight', [
  "decision.value.reviewer?.actorClass === 'human'",
  'decisionFileSha256',
  'expectedOutcome',
]);
includes('pinned', [
  'expectedDecisionFileSha256',
  'AVATAR_FRAME_REVIEW_PINNED_DECISION_CHANGED',
]);
includes('mastering', [
  "'succeeded-awaiting-technical-and-creative-review'",
  'technicalInspectionsCreated === 0',
  'creativeApprovalsCreated === 0',
]);
includes('cli', [
  '--program',
  '--mastering-campaign-receipt',
  '--workspace-root',
  '--output-root',
  '--reviewed-at',
  'pathToFileURL(path.resolve(process.argv[1])).href',
]);

for (const forbidden of [
  'humanDecisionCreation: true',
  'automaticCreativeDecision: true',
  'technicalInspectionCreation: true',
  'creativeApprovalCreation: true',
  'candidatePromotion: true',
  'cloudinaryUpload: true',
  'sequenceRelease: true',
  'publication: true',
  'runtimeActivation: true',
  'forcePush: true',
]) {
  assert.equal(source.campaign.includes(forbidden), false, forbidden);
}

const capabilities = evaDenseMotionFrameReviewIntakeCapabilities();
assert.equal(
  capabilities.protocolVersion,
  EVA_DENSE_MOTION_FRAME_REVIEW_INTAKE_PROTOCOL_VERSION,
);
assert.equal(capabilities.exactTenFrameSetRequired, true);
assert.equal(capabilities.successfulMasteringCampaignRequired, true);
assert.equal(capabilities.externallyAuthoredNamedHumanDecisionsRequired, true);
assert.equal(capabilities.allTenShadowReviewedBeforeFirstPersistentOutcome, true);
assert.equal(capabilities.exactDecisionFileShaPinnedAfterPreflight, true);
assert.equal(capabilities.executedPreflightPlanReturnedForEvidencePersistence, true);
assert.equal(capabilities.automaticDecisionCreationAllowed, false);
assert.equal(capabilities.technicalInspectionCreated, false);
assert.equal(capabilities.creativeApprovalCreated, false);
assert.equal(capabilities.cloudinaryUpload, false);
assert.equal(capabilities.sequenceRelease, false);
assert.equal(capabilities.runtimeActivation, false);
assert.equal(typeof reviewIntakeCliMain, 'function');

console.log('EVA dense-motion named-human frame-review intake guard passed.');
console.log('- all ten human decisions shadow-validate before first persistent outcome');
console.log('- decision bytes are pinned between preflight and persistence');
console.log('- approve, repair and reject outcomes remain human-authored and preserved');
console.log('- no technical/creative approval, upload, release or activation authority is granted');
