#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EVA_DENSE_MOTION_IDENTITY_CONTINUITY_PROTOCOL_VERSION,
  evaDenseMotionIdentityContinuityCapabilities,
} from './project-art/eva-dense-motion-identity-continuity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(
  path.join(root, 'scripts/project-art/eva-dense-motion-identity-continuity.mjs'),
  'utf8',
);

for (const marker of [
  'const ANCHOR_ORDINAL = 4',
  'const MAX_FACE_CENTER_SHIFT = 8',
  'const MAX_PHASH_HAMMING = 6',
  "value?.actorClass === 'human'",
  "entry.measurementSource === 'independent-face-registration-review'",
  'entry.humanVerified === true',
  'edge.faceRegistrationPassed === true',
  'edge.motionReviewPassed === true',
  'expectedFrom === FRAME_COUNT ? 1 : expectedFrom + 1',
  'faceCenterShiftPixels <= MAX_FACE_CENTER_SHIFT',
  'phashHammingDistance <= MAX_PHASH_HAMMING',
  'computedPhashDistance <= MAX_PHASH_HAMMING',
  'computedFaceCenterShift <= MAX_FACE_CENTER_SHIFT',
  'automaticMotionApprovalsMade: 0',
  'faceDetectorExecutionsPerformed: 0',
]) {
  assert.ok(source.includes(marker), marker);
}

for (const forbidden of [
  'faceDetectorExecution: true',
  'humanDecisionCreation: true',
  'automaticMotionApproval: true',
  'imageMutation: true',
  'cloudinaryUpload: true',
  'sequenceRelease: true',
  'runtimeActivation: true',
  'forcePush: true',
]) {
  assert.equal(source.includes(forbidden), false, forbidden);
}

assert.equal(EVA_DENSE_MOTION_IDENTITY_CONTINUITY_PROTOCOL_VERSION, '2026-08-22.1');
const capabilities = evaDenseMotionIdentityContinuityCapabilities();
assert.equal(capabilities.exactFrameCount, 10);
assert.equal(capabilities.anchorOrdinal, 4);
assert.equal(capabilities.maximumFaceCenterShiftPixels, 8);
assert.equal(capabilities.maximumPhashHammingDistance, 6);
assert.equal(capabilities.providerPhashBoundToAdmittedAsset, true);
assert.equal(capabilities.independentFaceMeasurementManifestRequired, true);
assert.equal(capabilities.namedHumanMeasurementVerificationRequired, true);
assert.equal(capabilities.namedHumanMotionReviewRequiredForEveryEdge, true);
assert.equal(capabilities.loopClosureTenToOneRequired, true);
assert.equal(capabilities.automaticMotionApprovalAllowed, false);
assert.equal(capabilities.faceDetectorExecution, false);
assert.equal(capabilities.runtimeActivation, false);

console.log('EVA dense identity/continuity guard passed.');
console.log('- ordinal 4 remains the identity anchor');
console.log('- face-centre and pHash thresholds are deterministic and fail-closed');
console.log('- all ten edges including 10->1 require named-human motion review');
console.log('- no detector, upload, release or activation authority is granted');
