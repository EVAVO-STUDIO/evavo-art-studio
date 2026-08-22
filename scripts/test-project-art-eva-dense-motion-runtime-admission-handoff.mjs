#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EVA_DENSE_MOTION_RUNTIME_ADMISSION_HANDOFF_PROTOCOL_VERSION,
  evaDenseMotionRuntimeAdmissionHandoffCapabilities,
} from './project-art/eva-dense-motion-runtime-admission-handoff.mjs';
import { main as cliMain } from './run-project-art-eva-dense-motion-runtime-admission-handoff.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(
  path.join(root, 'scripts/project-art/eva-dense-motion-runtime-admission-handoff.mjs'),
  'utf8',
);
const cli = readFileSync(
  path.join(root, 'scripts/run-project-art-eva-dense-motion-runtime-admission-handoff.mjs'),
  'utf8',
);

for (const marker of [
  "'ready-for-separate-runtime-admission-approval'",
  'runtimeAdmissionApprovalRequired: true',
  'activationAuthorityGranted: false',
  'alpha.value.output.transparentPixels',
  'alpha.value.output.partialAlphaPixels',
  'const opaque = value.output.visiblePixels - value.output.partialAlphaPixels',
  'identity.faceRect',
  'identity.providerPhash',
  'computedFaceCenterShiftPixels',
  'computedPhashHammingDistance',
  'loopClosureReviewSha256: continuityRecords[FRAME_COUNT - 1].evidenceSha256',
  'interpolationReviewSha256: release.family.browserPlaybackSha256',
]) assert.ok(source.includes(marker), marker);

for (const forbidden of [
  'runtimeAdmissionApproval: true',
  'activationAuthorityGranted: true',
  'humanDecisionCreation: true',
  'providerExecution: true',
  'cloudinaryUpload: true',
  'publication: true',
  'deployment: true',
  'runtimeActivation: true',
]) assert.equal(source.includes(forbidden), false, forbidden);

for (const marker of [
  '--program',
  '--release-evidence',
  '--workspace-root',
  '--continuity-root',
  '--output',
  'runtimeAdmissionApprovalRequired: result.runtimeAdmissionApprovalRequired',
  'activationAuthorityGranted: result.activationAuthorityGranted',
  'pathToFileURL(path.resolve(process.argv[1])).href',
]) assert.ok(cli.includes(marker), marker);

assert.equal(
  EVA_DENSE_MOTION_RUNTIME_ADMISSION_HANDOFF_PROTOCOL_VERSION,
  '2026-08-22.1',
);
const capabilities = evaDenseMotionRuntimeAdmissionHandoffCapabilities();
assert.equal(capabilities.exactTenFramesRequired, true);
assert.equal(capabilities.alphaPixelCountsReconstructedFromMasteringEvidence, true);
assert.equal(capabilities.exactIdentityFaceRectAndPhashRequired, true);
assert.equal(capabilities.exactTenContinuityEdgesRequired, true);
assert.equal(capabilities.externalRuntimeAdmissionApprovalRequired, true);
assert.equal(capabilities.automaticRuntimeApprovalAllowed, false);
assert.equal(capabilities.activationAuthorityGranted, false);
assert.equal(capabilities.runtimeActivation, false);
assert.equal(typeof cliMain, 'function');

console.log('EVA dense Runtime admission handoff guard passed.');
console.log('- Runtime-only alpha and identity detail is reconstructed from sealed Art Studio evidence');
console.log('- all ten continuity measurements are preserved');
console.log('- separate named-human Runtime admission approval remains required');
console.log('- handoff cannot publish, deploy or activate the Runtime');
