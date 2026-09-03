#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  automaticAnchorReferences,
  buildReferenceGraph,
  normalizeReferenceInputs,
  resolveProviderReferences,
} from './local-generation-reference-graph-v2.mjs';

const artifact = `artifact_${'a'.repeat(64)}`;

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
  const sprite = automaticAnchorReferences({ mode: 'sprite', frames: [{ id: 'a', shot: {} }, { id: 'b', shot: {} }] });
  assert.equal(sprite[1].shot.referenceInputs[0].role, 'direction-master');
});
