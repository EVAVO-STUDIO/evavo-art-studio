#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  framesForReferenceStage,
  prepareReferenceExecutionPlan,
  recordAcceptedArtifactResults,
} from './local-generation-reference-execution-v2.mjs';

const artifactA = `artifact_${'a'.repeat(64)}`;
const artifactB = `artifact_${'b'.repeat(64)}`;

function basePlan(mode = 'independent') {
  return {
    mode,
    frames: [
      {
        id: 'anchor', ordinal: 1, candidateCount: 1,
        shot: { referenceInputs: [] },
      },
      {
        id: 'follow', ordinal: 2, candidateCount: 1,
        shot: { referenceInputs: [{ kind: 'shot', sourceShotId: 'anchor', candidateIndex: 0, role: 'canonical-identity', strength: 1, required: true }] },
      },
    ],
  };
}

test('stages shot dependencies and resolves accepted artifact IDs', () => {
  const plan = prepareReferenceExecutionPlan(basePlan());
  assert.deepEqual(plan.referenceGraph.stages, [['anchor'], ['follow']]);
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
    frames: [{
      id: 'external', ordinal: 1, candidateCount: 1,
      shot: { referenceInputs: [{ kind: 'artifact', artifactId: artifactB, role: 'palette-reference', strength: 0.6, required: false }] },
    }],
  });
  const frames = framesForReferenceStage(plan, plan.referenceGraph.stages[0], new Map());
  assert.deepEqual(frames[0].providerReferences, [{ artifactId: artifactB, role: 'palette-reference', strength: 0.6, required: false }]);
});

test('required downstream artifact must exist before the stage executes', () => {
  const plan = prepareReferenceExecutionPlan(basePlan());
  assert.throws(() => framesForReferenceStage(plan, ['follow'], new Map()), /required reference anchor\[0\].*unavailable/u);
});

test('accepted stage refuses to record missing provider artifact IDs', () => {
  const plan = prepareReferenceExecutionPlan({ mode: 'independent', frames: [{ id: 'one', ordinal: 1, candidateCount: 1, shot: { referenceInputs: [] } }] });
  const frames = framesForReferenceStage(plan, ['one'], new Map());
  assert.throws(() => recordAcceptedArtifactResults(frames, new Map([['one', { candidates: [{ qa: { ok: true } }] }]]), new Map()), /usable provider artifact IDs/u);
});
