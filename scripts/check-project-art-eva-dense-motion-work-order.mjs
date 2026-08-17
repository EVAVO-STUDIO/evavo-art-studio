#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = Object.freeze({
  data: 'scripts/project-art/eva-dense-motion-work-order-data.mjs',
  common: 'scripts/project-art/eva-dense-motion-work-order-common.mjs',
  workOrder: 'scripts/project-art/eva-dense-motion-work-order.mjs',
  cli: 'scripts/compile-project-art-eva-dense-motion-work-order.mjs',
  tests: 'scripts/test-project-art-eva-dense-motion-work-order.mjs',
  docs: 'docs/PROJECT_ART_EVA_DENSE_MOTION_WORK_ORDER.md',
  releaseEvidence:
    'scripts/project-art/eva-dense-motion-release-evidence.mjs',
  releaseCli:
    'scripts/compile-project-art-eva-dense-motion-release-evidence.mjs',
  releaseTests:
    'scripts/test-project-art-eva-dense-motion-release-evidence.mjs',
  releaseDocs:
    'docs/PROJECT_ART_EVA_DENSE_MOTION_RELEASE_EVIDENCE.md',
  pngInspection:
    'scripts/project-art/avatar-final-pass-provider-candidate-png.mjs',
  frameFinisher:
    'scripts/project-art/avatar-final-pass-provider-frame-finisher.mjs',
  avatarSequenceCommon: 'scripts/project-art/avatar-sequence-common.mjs',
  avatarSequenceCompiler: 'scripts/compile-project-art-avatar-sequence.mjs',
  loopClosureCompiler: 'scripts/compile-project-art-loop-closure.mjs',
});

const source = {};
for (const [label, relative] of Object.entries(files)) {
  const absolute = path.join(root, relative);
  const stat = lstatSync(absolute);
  assert.ok(
    stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1,
    `unsafe or missing EVA dense-motion file: ${relative}`,
  );
  source[label] = readFileSync(absolute, 'utf8');
  assert.ok(
    source[label].length > 0 && !source[label].includes('\r'),
    `empty or CRLF EVA dense-motion file: ${relative}`,
  );
}

function includes(label, tokens) {
  for (const token of tokens) {
    assert.ok(source[label].includes(token), `${label} missing ${token}`);
  }
}

includes('data', [
  'evavo.project-art-eva-dense-motion-work-order-request.v1',
  'evavo.project-art-eva-dense-motion-work-order.v1',
  'eva-20260809-153620',
  '8b973623e78b48159b9f22dda7198cbb0cd8c898',
  '814ab02bde751c784db34f68b2c54e7e18d11ea8',
  '7bcef71b34956703576ca008cc38046bd36c40a097235e19142b226e36b1ec15',
  '0565ca0bfc5fea7e8a83b4187a98e05efd89785b',
  '09c7cf413665dad48671c4304413dc1c34e531a2',
  'dense-specific-adapter-required',
  'source-repair-mask-assurance-for-unmasked-dense-frame',
]);
includes('common', [
  'actualRgbaAlphaRequired: true',
  'hiddenRgbZeroedRequired: true',
  'checkerboardRejected: true',
  'matteHaloRejected: true',
  'canvasEdgesClearRequired: true',
]);
includes('workOrder', [
  'EVA_DENSE_MOTION_PENDING_ORDINALS',
  'retain-three-frame-rig-until-complete-ten-frame-admission',
  'receiptAssemblyAllowedBeforeAllGatesPass: false',
  'minimumDenseRuntimeVersion',
  'EVA_DENSE_MOTION_WORK_ORDER_CONTENT_DRIFT',
]);
includes('cli', [
  '--work-order-id',
  '--actor-id',
  '--created-at',
  '--output-root',
  '--output',
  "openSync(absolute, 'wx', 0o600)",
  'providerExecution: false',
  'cloudinaryUpload: false',
  'runtimeActivationAllowed: false',
]);
includes('tests', [
  'emits only seven pending jobs',
  'immutable current provenance',
  'deterministic immutable destination',
  'covers every continuity edge',
  'freshly rehashed content drift',
  'permission-restricted create-only work order',
  'sourceRepairMaskSubstitutionAllowed',
]);
includes('docs', [
  '# Project Art EVA dense-motion work order',
  'ordinals `1`, `2`, `3`, `7`, `8`, `9`, and `10`',
  'source-repair mask-assurance',
  'actual RGBA alpha',
  '10→1',
  'Runtime `0.37.0`',
  'create-only',
]);
includes('releaseEvidence', [
  'evavo.project-art-eva-dense-motion-release-evidence-request.v1',
  'evavo.project-art-eva-dense-motion-release-evidence.v1',
  'exactTenFrameSetRequired: true',
  'immutableVersionedCloudinaryAssetsRequired: true',
  'activeThreeFrameProvenanceRetained: true',
  'allTenContinuityEdgesRequired: true',
  'finalToFirstLoopClosureRequired: true',
  'runtimeReceiptAssemblyReady: true',
  'activeThreeFrameRigMustRemain: true',
  'EVA_DENSE_MOTION_RELEASE_EVIDENCE_CONTENT_DRIFT',
]);
includes('releaseCli', [
  '--request',
  '--output',
  'MAXIMUM_REQUEST_BYTES',
  'Request path cannot contain symbolic path components.',
  "openSync(absolute, 'wx', 0o600)",
  'providerExecution: false',
  'cloudinaryUpload: false',
  'publicationAllowed: false',
  'deploymentAllowed: false',
  'runtimeActivationAllowed: false',
]);
includes('releaseTests', [
  'exact ten-frame release-evidence package',
  'deterministic destinations for pending frames',
  'duplicate and mutable frame evidence',
  'continuity, runtime and authority drift',
  'rehashed semantic drift',
  'permission-restricted create-only evidence package',
]);
includes('releaseDocs', [
  '# Project Art EVA dense-motion release evidence',
  'final reviewed frame SHA-256',
  'immutable Cloudinary asset identity',
  '10→1',
  'Runtime `0.37.0`',
  'runtimeActivationAllowed: false',
  'create-only',
]);

for (const forbidden of [
  'providerExecution: true',
  'candidateApproval: true',
  'candidatePromotion: true',
  'assetOverwrite: true',
  'cloudinaryUpload: true',
  'sequenceRelease: true',
  'runtimeActivation: true',
  'forcePush: true',
  'git push',
]) {
  assert.ok(
    !source.workOrder.includes(forbidden),
    `dense work order contains ${forbidden}`,
  );
  assert.ok(!source.cli.includes(forbidden), `dense CLI contains ${forbidden}`);
  assert.ok(
    !source.releaseEvidence.includes(forbidden),
    `dense release evidence contains ${forbidden}`,
  );
  assert.ok(
    !source.releaseCli.includes(forbidden),
    `dense release CLI contains ${forbidden}`,
  );
}

for (const relative of [
  files.data,
  files.common,
  files.workOrder,
  files.cli,
  files.tests,
  files.releaseEvidence,
  files.releaseCli,
  files.releaseTests,
]) {
  const syntax = spawnSync(process.execPath, ['--check', path.join(root, relative)], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(
    syntax.status,
    0,
    `syntax check failed for ${relative}\n${syntax.stdout}\n${syntax.stderr}`,
  );
}

const focused = spawnSync(
  process.execPath,
  [
    '--test',
    path.join(root, files.tests),
    path.join(root, files.releaseTests),
  ],
  { cwd: root, encoding: 'utf8' },
);
assert.equal(
  focused.status,
  0,
  `EVA dense-motion tests failed\n${focused.stdout}\n${focused.stderr}`,
);

console.log('Project Art EVA dense-motion work-order guard passed.');
console.log('- exact ten-frame Runtime source identity is pinned to current governance');
console.log('- only ordinals 1, 2, 3, 7, 8, 9 and 10 become mastering jobs');
console.log('- the active 4, 5 and 6 provenance remains the production fallback');
console.log('- release evidence binds ten final hashes and ten continuity edges');
console.log('- alpha, identity, immutable delivery and named reviews fail closed');
console.log('- Runtime receipt assembly is supported without publication or activation');
