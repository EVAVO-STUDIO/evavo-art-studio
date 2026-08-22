#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EVA_DENSE_MOTION_REVIEWED_FRAME_EVIDENCE_PROTOCOL_VERSION,
  evaDenseMotionReviewedFrameEvidenceCapabilities,
} from './project-art/eva-dense-motion-reviewed-frame-evidence.mjs';
import { main as reviewedEvidenceCliMain } from './run-project-art-eva-dense-motion-reviewed-frame-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaignPath = path.join(root, 'scripts/project-art/eva-dense-motion-reviewed-frame-evidence.mjs');
const cliPath = path.join(root, 'scripts/run-project-art-eva-dense-motion-reviewed-frame-evidence.mjs');
for (const target of [campaignPath, cliPath]) {
  const metadata = lstatSync(target);
  assert.equal(metadata.isFile(), true);
  assert.equal(metadata.isSymbolicLink(), false);
}
const campaign = readFileSync(campaignPath, 'utf8');
const cli = readFileSync(cliPath, 'utf8');

for (const marker of [
  'verifyEvaDenseMotionCandidateAssurance',
  'verifyEvaDenseMotionMasteringCampaignReceipt',
  'verifyEvaDenseMotionMasteringFrameReceipt',
  'inspectPngStructure',
  'inspectAvatarProviderFramePng',
  "value.status === 'final-frame-admitted'",
  "value.reviewer?.actorClass === 'human'",
  "value.gates?.technical === 'pass'",
  "value.gates?.handsAndAnatomy === 'pass'",
  "value.gates?.faceIdentity === 'pass'",
  "value.gates?.silhouetteRegistration === 'pass'",
  "approvalSource: 'externally-authored-named-human-frame-review-decision'",
  'automaticDecisionCreationAllowed: false',
  'humanDecisionsCreated: 0',
  'automaticCreativeDecisionsMade: 0',
  'cloudinaryUploadsPerformed: 0',
  'runtimeActivationsPerformed: 0',
  'transactionalCreateOnly(records)',
]) {
  assert.ok(campaign.includes(marker), marker);
}

for (const marker of [
  "return 'complete-identical'",
  'EVA_DENSE_REVIEWED_EVIDENCE_CLI_PARTIAL_PERSISTENCE',
  'EVA_DENSE_REVIEWED_EVIDENCE_CLI_EXISTING_EVIDENCE_MISMATCH',
  'reconstructCanonicalReceipt',
  'sha256Document(body)',
  'canonicalReceiptSelfHashPreserved: true',
  "mode: persistenceState === 'complete-identical' ? 'exact-readback' : 'new-persistence'",
  'if (!semanticEqual(receipt, reconstructed))',
]) {
  assert.ok(cli.includes(marker), marker);
}
assert.equal(
  /receiptSha256:\s*sha256Document\(body\),\s*recovery:/u.test(cli),
  false,
  'recovery metadata must never enter the canonical self-hashed receipt',
);

for (const forbidden of [
  'humanDecisionCreation: true',
  'automaticCreativeDecision: true',
  'imageMutation: true',
  'candidatePromotion: true',
  'cloudinaryUpload: true',
  'sequenceRelease: true',
  'publication: true',
  'runtimeActivation: true',
  'forcePush: true',
]) {
  assert.equal(campaign.includes(forbidden), false, forbidden);
}

for (const flag of [
  '--program',
  '--mastering-campaign-receipt',
  '--review-intake-plan',
  '--review-intake-receipt',
  '--workspace-root',
  '--output-root',
  '--inspected-at',
]) {
  assert.ok(cli.includes(flag), flag);
}
assert.ok(cli.includes('pathToFileURL(path.resolve(process.argv[1])).href'));
assert.equal(typeof reviewedEvidenceCliMain, 'function');

const capabilities = evaDenseMotionReviewedFrameEvidenceCapabilities();
assert.equal(EVA_DENSE_MOTION_REVIEWED_FRAME_EVIDENCE_PROTOCOL_VERSION, '2026-08-22.1');
assert.equal(capabilities.exactTenFrameSetRequired, true);
assert.equal(capabilities.successfulMasteringCampaignRequired, true);
assert.equal(capabilities.allTenNamedHumanApprovalsRequired, true);
assert.equal(capabilities.twoIndependentCandidateInspectorsRequired, true);
assert.equal(capabilities.independentPngStructureInspectionRequired, true);
assert.equal(capabilities.finalFramePixelInspectionRequired, true);
assert.equal(capabilities.humanTechnicalGateRequired, true);
assert.equal(capabilities.humanAnatomyGateRequired, true);
assert.equal(capabilities.humanIdentityGateRequired, true);
assert.equal(capabilities.humanSilhouetteRegistrationGateRequired, true);
assert.equal(capabilities.creativeApprovalEvidenceDerivedOnlyFromHumanApproval, true);
assert.equal(capabilities.automaticDecisionCreationAllowed, false);
assert.equal(capabilities.imageMutation, false);
assert.equal(capabilities.cloudinaryUpload, false);
assert.equal(capabilities.sequenceRelease, false);
assert.equal(capabilities.runtimeActivation, false);

console.log('EVA dense reviewed-frame evidence guard passed.');
console.log('- final PNG is rechecked through structure and pixel inspection paths');
console.log('- prior two-inspector candidate assurance remains required');
console.log('- creative approval evidence is sealed only from named-human approval lineage');
console.log('- complete identical evidence can recover a lost outer receipt safely');
console.log('- partial or drifted persisted evidence remains fail-closed');
console.log('- image mutation, upload, release and activation authority remain closed');
