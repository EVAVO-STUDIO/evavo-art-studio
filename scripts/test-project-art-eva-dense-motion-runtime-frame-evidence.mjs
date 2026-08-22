#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EVA_DENSE_MOTION_RUNTIME_FRAME_EVIDENCE_PROTOCOL_VERSION,
  evaDenseMotionRuntimeFrameEvidenceCapabilities,
} from './project-art/eva-dense-motion-runtime-frame-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(
  path.join(root, 'scripts/project-art/eva-dense-motion-runtime-frame-evidence.mjs'),
  'utf8',
);

for (const marker of [
  'verifyEvaDenseMotionCandidateAssurance',
  'verifyEvaDenseMotionAlphaMatteReview',
  'EVA_DENSE_MOTION_ALPHA_MASTERING_SCHEMA',
  'EVA_DENSE_MOTION_TECHNICAL_INSPECTION_SCHEMA',
  'EVA_DENSE_MOTION_CREATIVE_APPROVAL_EVIDENCE_SCHEMA',
  'EVA_DENSE_MOTION_CLOUDINARY_FRAME_RECEIPT_SCHEMA',
  'EVA_DENSE_MOTION_IDENTITY_EVIDENCE_SCHEMA',
  "matteReview.gateResults?.['checkerboard-and-matte-rejection'] === true",
  'hiddenRgbTransparentPixels: mastering.output.hiddenRgbTransparentPixels',
  'edgeVisiblePixels: mastering.output.edgeVisiblePixels',
  'alphaPlaneSha256: mastering.output.alphaSha256',
  'creative.reviewer?.actorClass === \'human\'',
  'identity.humanVerified === true',
  'finalReviewedSha256: cloudinary.masteredAsset.sha256',
  'reviewDecisionSha256: creative.reviewDecisionSha256',
  'runtimeFrameEvidenceCreated: FRAME_COUNT',
]) {
  assert.ok(source.includes(marker), marker);
}

for (const forbidden of [
  'providerExecution: true',
  'imageMutation: true',
  'humanDecisionCreation: true',
  'automaticCreativeDecision: true',
  'cloudinaryUpload: true',
  'sequenceRelease: true',
  'runtimeActivation: true',
  'forcePush: true',
]) {
  assert.equal(source.includes(forbidden), false, forbidden);
}

assert.equal(EVA_DENSE_MOTION_RUNTIME_FRAME_EVIDENCE_PROTOCOL_VERSION, '2026-08-22.1');
const capabilities = evaDenseMotionRuntimeFrameEvidenceCapabilities();
assert.equal(capabilities.exactFrameCount, 10);
assert.equal(capabilities.completeUpstreamEvidenceRequired, true);
assert.equal(capabilities.releaseProjectionProduced, true);
assert.equal(capabilities.actualRgbaAlphaRequired, true);
assert.equal(capabilities.hiddenRgbZeroedRequired, true);
assert.equal(capabilities.checkerboardAndMatteRejectedRequired, true);
assert.equal(capabilities.canvasEdgesClearRequired, true);
assert.equal(capabilities.namedHumanCreativeApprovalRequired, true);
assert.equal(capabilities.identityEvidenceRequired, true);
assert.equal(capabilities.providerExecution, false);
assert.equal(capabilities.runtimeActivation, false);

console.log('EVA dense Runtime-frame evidence guard passed.');
console.log('- candidate, alpha, technical, human creative, Cloudinary and identity lineage remain bound');
console.log('- release projection preserves alpha and human-review facts');
console.log('- provider, mutation, sequence-release and Runtime activation authority remain closed');
