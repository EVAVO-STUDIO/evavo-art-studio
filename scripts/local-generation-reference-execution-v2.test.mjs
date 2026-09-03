#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  attachProviderReferencesToLegacyManifest,
  framesForReferenceStage,
  prepareReferenceExecutionPlan,
  recordAcceptedArtifactResults,
} from './local-generation-reference-execution-v2.mjs';

const artifactA = `artifact_${'a'.repeat(64)}`;
const artifactB = `artifact_${'b'.repeat(64)}`;

function basePlan(mode = 'independent') {
  return {
    mode,
    source: {
      shots: [
        { id: 'anchor' },
        { id: 'follow', reference_inputs: [{ sourceShotId: 'anchor', candidateIndex: 0, role: 'canonical-identity', strength: 1, required: true }] },
      ],
    },
    frames: [
      {
        id: 'anchor', ordinal: 1, candidateCount: 1,
        shot: {},
      },
      {
        id: 'follow', ordinal: 2, candidateCount: 1,
        shot: {},
      },
    ],
  };
}

test('rehydrates authored source-shot references and resolves accepted artifact IDs', () => {
  const plan = prepareReferenceExecutionPlan(basePlan());
  assert.deepEqual(plan.referenceGraph.stages, [['anchor'], ['follow']]);
  assert.equal(plan.referenceInputCount, 1);
  const artifacts = new Map();
  const stageOne = framesForReferenceStage(plan, plan.referenceGraph.stages[0], artifacts);
  assert.deepEqual(stageOne[0].providerReferences, []);
  const results = new Map([['anchor', { candidates: [{ artifactId: artifactA, qa: { ok: true } }] }]]);
  recordAcceptedArtifactResults(stageOne, results, artifacts);
  const stageTwo = framesForReferenceStage(plan, plan.referenceGraph.stages[1], artifacts);
  assert.deepEqual(stageTwo[0].providerReferences, [{ artifactId: artifactA, role: 'canonical-identity', strength: 1, required: true }]);
});

test('external artifacts resolve without an upstream generation stage', () => {
  const plan = prepareReferenceExecutionPlan({
    mode: 'independent',
    source: { shots: [{ id: 'external', reference_inputs: [{ artifactId: artifactB, role: 'palette-reference', strength: 0.6, required: false }] }] },
    frames: [{
      id: 'external', ordinal: 1, candidateCount: 1,
      shot: {},
    }],
  });
  const frames = framesForReferenceStage(plan, plan.referenceGraph.stages[0], new Map());
  assert.deepEqual(frames[0].providerReferences, [{ artifactId: artifactB, role: 'palette-reference', strength: 0.6, required: false }]);
});

test('resolved provider references are attached to matching V1 scenes only', () => {
  const manifest = { scenes: [{ id: 'anchor', prompt: 'anchor' }, { id: 'follow', prompt: 'follow' }] };
  const stageFrames = [{ id: 'follow', providerReferences: [{ artifactId: artifactA, role: 'canonical-identity', strength: 1, required: true }] }];
  const attached = attachProviderReferencesToLegacyManifest(manifest, stageFrames);
  assert.equal(attached.scenes[0].references, undefined);
  assert.deepEqual(attached.scenes[1].references, stageFrames[0].providerReferences);
});

test('required downstream artifact must exist before the stage executes', () => {
  const plan = prepareReferenceExecutionPlan(basePlan());
  assert.throws(() => framesForReferenceStage(plan, ['follow'], new Map()), /required reference anchor\[0\].*unavailable/u);
});

test('accepted stage refuses to record missing or malformed provider artifact IDs', () => {
  const plan = prepareReferenceExecutionPlan({ mode: 'independent', source: { shots: [{ id: 'one' }] }, frames: [{ id: 'one', ordinal: 1, candidateCount: 1, shot: {} }] });
  const frames = framesForReferenceStage(plan, ['one'], new Map());
  assert.throws(() => recordAcceptedArtifactResults(frames, new Map([['one', { candidates: [{ qa: { ok: true } }] }]]), new Map()), /valid provider artifact ID/u);
  assert.throws(() => recordAcceptedArtifactResults(frames, new Map([['one', { candidates: [{ artifactId: 'artifact_bad', qa: { ok: true } }] }]]), new Map()), /valid provider artifact ID/u);
});

test('sequential-anchor mode creates a real automatic dependency after authored refs are hydrated', () => {
  const plan = prepareReferenceExecutionPlan({
    mode: 'sequential-anchor',
    source: { shots: [{ id: 'anchor' }, { id: 'follow' }] },
    frames: [
      { id: 'anchor', ordinal: 1, candidateCount: 1, shot: {} },
      { id: 'follow', ordinal: 2, candidateCount: 1, shot: {} },
    ],
  });
  assert.deepEqual(plan.referenceGraph.stages, [['anchor'], ['follow']]);
  assert.equal(plan.frames[1].shot.referenceInputs[0].role, 'canonical-identity');
});
