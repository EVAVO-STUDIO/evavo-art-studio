#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EVA_DENSE_MOTION_CLOUDINARY_PROTOCOL_VERSION,
  evaDenseMotionCloudinaryAdmissionCapabilities,
} from './project-art/eva-dense-motion-cloudinary-admission.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(
  path.join(root, 'scripts/project-art/eva-dense-motion-cloudinary-admission.mjs'),
  'utf8',
);

for (const marker of [
  "EVA_DENSE_MOTION_CLOUDINARY_PROTOCOL_VERSION = '2026-08-22.2'",
  'technical.programSha256 === program.programSha256',
  'creative.programSha256 === program.programSha256',
  'technical.jobId === job.jobId',
  'creative.jobId === job.jobId',
  'allTenReviewedBeforeProviderExecution: true',
  'providerExecutionRequiresSeparateNetworkAuthority: true',
  "public_id: job.cloudinary.publicId",
  'overwrite: false',
  'phash: true',
  'frame.localReviewedSha256 === expected.localFile.sha256',
  'frame.secureUrl === secureUrl(frame.version, frame.publicId)',
  'assetIds.size === FRAME_COUNT',
  'publicIds.size === FRAME_COUNT',
  'providerExecutionPerformedByThisCompiler: false',
  'networkUsedByThisCompiler: false',
  'uploadsPerformedByThisCompiler: 0',
  'unlinkSync(target)',
]) {
  assert.ok(source.includes(marker), marker);
}

for (const forbidden of [
  'providerExecution: true',
  'network: true',
  'cloudinaryOverwrite: true',
  'candidatePromotion: true',
  'sequenceRelease: true',
  'publication: true',
  'runtimeActivation: true',
  'forcePush: true',
]) {
  assert.equal(source.includes(forbidden), false, forbidden);
}

assert.equal(EVA_DENSE_MOTION_CLOUDINARY_PROTOCOL_VERSION, '2026-08-22.2');
const capabilities = evaDenseMotionCloudinaryAdmissionCapabilities();
assert.equal(capabilities.exactTenFrameSetRequired, true);
assert.equal(capabilities.reviewedTechnicalEvidenceRequired, true);
assert.equal(capabilities.namedHumanCreativeEvidenceRequired, true);
assert.equal(capabilities.exactTenMasterProgramHashRequired, true);
assert.equal(capabilities.exactReviewedPngSha256BoundBeforeUpload, true);
assert.equal(capabilities.exactCreateOnlyPublicIdsRequired, true);
assert.equal(capabilities.overwriteForbidden, true);
assert.equal(capabilities.providerPhashRequired, true);
assert.equal(capabilities.uniqueAssetIdsRequired, true);
assert.equal(capabilities.versionedSecureUrlsRequired, true);
assert.equal(capabilities.providerExecution, false);
assert.equal(capabilities.network, false);
assert.equal(capabilities.upload, false);
assert.equal(capabilities.publication, false);
assert.equal(capabilities.runtimeActivation, false);

console.log('EVA dense Cloudinary admission guard passed.');
console.log('- only exact reviewed ten-master frames can enter the upload plan');
console.log('- public IDs are exact, create-only and overwrite is forbidden');
console.log('- provider response identities are unique and versioned');
console.log('- Art Studio admission has no provider, network, publication or activation authority');
