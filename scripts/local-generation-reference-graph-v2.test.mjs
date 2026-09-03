#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  automaticAnchorReferences,
  buildReferenceGraph,
  normalizeReferenceInputs,
  requiredReferenceCapabilities,
  resolveProviderReferences,
  validateProviderReferenceInputs,
} from './local-generation-reference-graph-v2.mjs';

const artifact = `artifact_${'a'.repeat(64)}`;

function profile(capabilities, maximumReferenceImages = 4) {
  return { profileId: 'test-profile', capabilities, limits: { maximumReferenceImages } };
}

test('normalizes real artifact and shot references', () => {
  const refs = normalizeReferenceInputs([
    { artifactId: artifact, role: 'palette-reference', strength: 0.8 },
    { sourceShotId: 'anchor', candidateIndex: 0, role: 'canonical-identity', required: true },
  ]);
  assert.equal(refs.length, 2);
  assert.equal(refs[0].kind, 'artifact');
  assert.equal(refs[1].kind, 'shot');
});

test('builds topological stages for anchor dependencies', () => {
  const frames = [
    { id: 'anchor', shot: {} },
    { id: 'left', shot: { referenceInputs: [{ sourceShotId: 'anchor', role: 'canonical-identity' }] } },
    { id: 'right', shot: { referenceInputs: [{ sourceShotId: 'anchor', role: 'canonical-identity' }] } },
    { id: 'final', shot: { referenceInputs: [{ sourceShotId: 'left', role: 'previous-key-pose' }, { sourceShotId: 'right', role: 'next-key-pose' }] } },
  ];
  const graph = buildReferenceGraph(frames);
  assert.deepEqual(graph.stages, [['anchor'], ['left', 'right'], ['final']]);
});

test('reference graph rejects cycles and missing sources', () => {
  assert.throws(() => buildReferenceGraph([
    { id: 'a', shot: { referenceInputs: [{ sourceShotId: 'b', role: 'canonical-identity' }] } },
    { id: 'b', shot: { referenceInputs: [{ sourceShotId: 'a', role: 'canonical-identity' }] } },
  ]), /cycle/u);
  assert.throws(() => buildReferenceGraph([
    { id: 'a', shot: { referenceInputs: [{ sourceShotId: 'missing', role: 'canonical-identity' }] } },
  ]), /missing source shot/u);
});

test('resolves shot dependencies to actual provider artifact IDs', () => {
  const frame = { id: 'next', shot: { referenceInputs: [{ sourceShotId: 'anchor', role: 'canonical-identity', strength: 1 }] } };
  const results = new Map([['anchor', [artifact]]]);
  const resolved = resolveProviderReferences(frame, results);
  assert.equal(resolved[0].artifactId, artifact);
  assert.equal(resolved[0].role, 'canonical-identity');
});

test('automatic sequential-anchor and sprite modes create real shot dependencies', () => {
  const sequential = automaticAnchorReferences({ mode: 'sequential-anchor', frames: [{ id: 'a', shot: {} }, { id: 'b', shot: {} }] });
  assert.equal(sequential[1].shot.referenceInputs[0].sourceShotId, 'a');
  assert.equal(sequential[1].shot.referenceInputs[0].role, 'canonical-identity');
  assert.equal(sequential[1].shot.referenceInputs.length, 1);

  const sprite = automaticAnchorReferences({ mode: 'sprite', frames: [{ id: 'a', shot: {} }, { id: 'b', shot: {} }] });
  assert.deepEqual(sprite[1].shot.referenceInputs.map((reference) => reference.role), ['canonical-identity', 'direction-master']);
  assert.equal(sprite[1].shot.referenceInputs.every((reference) => reference.sourceShotId === 'a'), true);
  assert.equal(sprite[1].shot.referenceInputs.every((reference) => reference.required === true), true);
  assert.deepEqual(requiredReferenceCapabilities(sprite[1].shot.referenceInputs), [
    'direction-reference', 'identity-reference', 'multiple-reference-images', 'reference-images',
  ]);
});

test('derives the same required reference capabilities as V1 routing', () => {
  const capabilities = requiredReferenceCapabilities([
    { artifactId: artifact, role: 'canonical-identity', required: true },
    { sourceShotId: 'anchor', role: 'palette-reference', required: false },
  ]);
  assert.deepEqual(capabilities, ['identity-reference', 'multiple-reference-images', 'reference-images']);
});

test('provider preflight rejects insufficient reference limits and missing role capabilities', () => {
  const refs = [{ artifactId: artifact, role: 'canonical-identity', required: true }];
  assert.throws(
    () => validateProviderReferenceInputs(refs, profile(['reference-images', 'identity-reference'], 0)),
    /allows 0/u,
  );
  assert.throws(
    () => validateProviderReferenceInputs(refs, profile(['reference-images'], 1)),
    /identity-reference/u,
  );
  assert.doesNotThrow(
    () => validateProviderReferenceInputs(refs, profile(['reference-images', 'identity-reference'], 1)),
  );
});

test('provider preflight mirrors V1 generation semantic reference requirements', () => {
  assert.throws(
    () => validateProviderReferenceInputs([{ artifactId: artifact, role: 'mask' }], profile(['reference-images', 'mask'], 1), { operation: 'generate' }),
    /may not contain mask/u,
  );
  assert.throws(
    () => validateProviderReferenceInputs([{ artifactId: artifact, role: 'direction-master' }], profile(['reference-images', 'direction-reference'], 1), { operation: 'generate', assetKind: 'sprite-frame', continuityPhase: 'key-pose' }),
    /canonical-identity/u,
  );
  const prior = `artifact_${'b'.repeat(64)}`;
  assert.throws(
    () => validateProviderReferenceInputs([{ artifactId: artifact, role: 'previous-key-pose' }], profile(['reference-images', 'temporal-reference'], 2), { operation: 'generate', assetKind: 'illustration', continuityPhase: 'in-between' }),
    /previous-key-pose and next-key-pose/u,
  );
  assert.doesNotThrow(
    () => validateProviderReferenceInputs([
      { artifactId: artifact, role: 'previous-key-pose' },
      { artifactId: prior, role: 'next-key-pose' },
    ], profile(['reference-images', 'multiple-reference-images', 'temporal-reference'], 2), { operation: 'generate', assetKind: 'illustration', continuityPhase: 'in-between' }),
  );
});
