#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TOP_HAT_ADMITTED_BODY_ANCHORS,
  TOP_HAT_POSE_SLOT_RUNTIME_PIN,
  compileProjectArtTopHatPoseSlotProduction,
  createProjectArtTopHatPoseSlotProductionRequest,
  projectArtTopHatPoseSlotProductionCapabilities,
} from './project-art/top-hat-pose-slot-production.mjs';

const EXPECTED_REPOSITORY = 'EVAVO-STUDIO/evavo-avatar-runtime';
const EXPECTED_COMMIT = '524066fc95fee329e1a20f7c9aa7d805d94c8cc8';
const EXPECTED_TREE = 'db8af48a71f1a2708c99f5cea220c7e7dd324e84';
const EXPECTED_HASHES = Object.freeze([
  '92cb290246a7629024dcb7768f4119f6a139d9c9f59e3d0545563e1f5b35575a',
  '476ff3c1ca56e1f4ec622b94abfebf35a94b593a388177b3d9b3bce9347ed9a5',
  'bd64eba4f22fd2d524ee7eb1826b2cc9cc9723cff5a764e36946d568b8cfd358',
]);

test('binds every admitted Top Hat anchor to the exact Runtime source', () => {
  assert.equal(TOP_HAT_POSE_SLOT_RUNTIME_PIN.repository, EXPECTED_REPOSITORY);
  assert.equal(TOP_HAT_POSE_SLOT_RUNTIME_PIN.commit, EXPECTED_COMMIT);
  assert.equal(TOP_HAT_POSE_SLOT_RUNTIME_PIN.tree, EXPECTED_TREE);
  assert.equal(TOP_HAT_ADMITTED_BODY_ANCHORS.length, 3);
  assert.deepEqual(
    TOP_HAT_ADMITTED_BODY_ANCHORS.map((anchor) => anchor.sha256),
    EXPECTED_HASHES,
  );
  for (const anchor of TOP_HAT_ADMITTED_BODY_ANCHORS) {
    assert.equal(anchor.repository, EXPECTED_REPOSITORY);
    assert.equal(anchor.commit, EXPECTED_COMMIT);
    assert.equal(anchor.tree, EXPECTED_TREE);
    assert.equal(anchor.width, 1024);
    assert.equal(anchor.height, 1536);
    assert.equal(anchor.pixelFormat, 'rgba8-straight');
    assert.equal(anchor.approvalStatus, 'approved-production-anchor');
  }

  const plan = compileProjectArtTopHatPoseSlotProduction(
    createProjectArtTopHatPoseSlotProductionRequest(),
  );
  assert.deepEqual(plan.identityAnchors, TOP_HAT_ADMITTED_BODY_ANCHORS);
  assert.equal(plan.qualityGates.exactApprovedAnchorSourceCommitRequired, true);
});

test('rejects substituted anchor repository, commit or tree provenance', () => {
  for (const field of ['repository', 'commit', 'tree']) {
    const request = JSON.parse(
      JSON.stringify(createProjectArtTopHatPoseSlotProductionRequest()),
    );
    request.identityAnchors[0][field] =
      field === 'repository'
        ? 'EVAVO-STUDIO/evavo-art-studio'
        : '0'.repeat(40);
    assert.throws(
      () => compileProjectArtTopHatPoseSlotProduction(request),
      /PROJECT_ART_TOP_HAT_POSE_SLOT_ANCHOR_INVALID/u,
    );
  }
});

test('exposes source provenance without widening production authority', () => {
  const capabilities = projectArtTopHatPoseSlotProductionCapabilities();
  assert.equal(
    capabilities.admittedBodyAnchorSourceRepository,
    EXPECTED_REPOSITORY,
  );
  assert.equal(capabilities.admittedBodyAnchorSourceCommit, EXPECTED_COMMIT);
  assert.equal(capabilities.admittedBodyAnchorSourceTree, EXPECTED_TREE);
  assert.equal(capabilities.providerExecution, false);
  assert.equal(capabilities.candidateApproval, false);
  assert.equal(capabilities.runtimeActivation, false);
  assert.equal(capabilities.publication, false);
});
