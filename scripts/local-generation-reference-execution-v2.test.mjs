#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  attachProviderReferencesToLegacyManifest,
  framesForReferenceStage,
  prepareReferenceExecutionPlan,
  recordAcceptedArtifactResults,
} from './local-generation-reference-execution-v2.mjs';
import {
  validateProviderReferenceInputs,
} from './local-generation-reference-graph-v2.mjs';

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

function profile({ maximumReferenceImages = 4, capabilities = [] } = {}) {
  return {
    profileId: 'reference-test-profile',
    capabilities,
    limits: { maximumReferenceImages },
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

test('no-reference stages preserve the legacy scene contract exactly', () => {
  const manifest = { scenes: [{ id: 'one', prompt: 'one' }, { id: 'two', prompt: 'two' }] };
  const attached = attachProviderReferencesToLegacyManifest(manifest, [
    { id: 'one', providerReferences: [] },
    { id: 'two', providerReferences: [] },
  ]);
  assert.deepEqual(attached, manifest);
  assert.equal(Object.hasOwn(attached.scenes[0], 'references'), false);
  assert.equal(Object.hasOwn(attached.scenes[1], 'references'), false);
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

test('multi-candidate source references select the requested accepted provider artifact deterministically', () => {
  const plan = prepareReferenceExecutionPlan({
    mode: 'independent',
    source: {
      shots: [
        { id: 'anchor' },
        { id: 'follow', reference_inputs: [{ sourceShotId: 'anchor', candidateIndex: 1, role: 'canonical-identity', required: true }] },
      ],
    },
    frames: [
      { id: 'anchor', ordinal: 1, candidateCount: 2, shot: {} },
      { id: 'follow', ordinal: 2, candidateCount: 1, shot: {} },
    ],
  });
  const artifacts = new Map();
  const stageOne = framesForReferenceStage(plan, ['anchor'], artifacts);
  recordAcceptedArtifactResults(stageOne, new Map([['anchor', {
    candidates: [
      { artifactId: artifactA, qa: { ok: true } },
      { artifactId: artifactB, qa: { ok: true } },
    ],
  }]]), artifacts);
  const stageTwo = framesForReferenceStage(plan, ['follow'], artifacts);
  assert.equal(stageTwo[0].providerReferences.length, 1);
  assert.equal(stageTwo[0].providerReferences[0].artifactId, artifactB);
});

test('optional unresolved source artifact references are omitted instead of inventing conditioning', () => {
  const plan = prepareReferenceExecutionPlan({
    mode: 'independent',
    source: {
      shots: [
        { id: 'anchor' },
        { id: 'follow', reference_inputs: [{ sourceShotId: 'anchor', candidateIndex: 1, role: 'palette-reference', strength: 0.5, required: false }] },
      ],
    },
    frames: [
      { id: 'anchor', ordinal: 1, candidateCount: 1, shot: {} },
      { id: 'follow', ordinal: 2, candidateCount: 1, shot: {} },
    ],
  });
  const artifacts = new Map([['anchor', [artifactA]]]);
  const stageTwo = framesForReferenceStage(plan, ['follow'], artifacts);
  assert.deepEqual(stageTwo[0].providerReferences, []);
});

test('reviewed profile maximumReferenceImages is a hard pre-execution limit', () => {
  const refs = [
    { artifactId: artifactA, role: 'canonical-identity', required: true },
    { artifactId: artifactB, role: 'palette-reference', required: false },
  ];
  assert.throws(
    () => validateProviderReferenceInputs(refs, profile({
      maximumReferenceImages: 1,
      capabilities: ['reference-images', 'multiple-reference-images', 'identity-reference'],
    }), { operation: 'generate' }),
    /requests 2 reference image\(s\).*allows 1/u,
  );
});

test('reference semantic rules fail closed before provider execution', () => {
  const capable = profile({
    maximumReferenceImages: 4,
    capabilities: ['reference-images', 'multiple-reference-images', 'identity-reference', 'temporal-reference', 'mask'],
  });
  assert.throws(
    () => validateProviderReferenceInputs([{ artifactId: artifactA, role: 'mask', required: true }], capable, { operation: 'generate' }),
    /may not contain mask/u,
  );
  assert.throws(
    () => validateProviderReferenceInputs([{ artifactId: artifactA, role: 'previous-key-pose', required: true }], capable, {
      operation: 'generate', assetKind: 'sprite-frame', continuityPhase: 'in-between',
    }),
    /canonical-identity/u,
  );
  assert.throws(
    () => validateProviderReferenceInputs([
      { artifactId: artifactA, role: 'canonical-identity', required: true },
      { artifactId: artifactB, role: 'previous-key-pose', required: true },
    ], capable, { operation: 'generate', assetKind: 'illustration', continuityPhase: 'in-between' }),
    /previous-key-pose and next-key-pose/u,
  );
});

test('V1 durable job builder consumes resolved artifact references instead of dropping them', async () => {
  const source = await readFile(new URL('./run-local-generation-campaign.mjs', import.meta.url), 'utf8');
  assert.match(source, /profile\.limits\.maximumReferenceImages < scene\.references\.length/u);
  assert.match(source, /inputArtifacts:\s*Object\.freeze\(\[\.\.\.new Set\(references\.map\(\(reference\) => reference\.artifactId\)\)\]\)/u);
  assert.match(source, /references,\s*\n\s*provider:/u);
  assert.match(source, /requiredCapabilityProfile:\s*Object\.freeze\(\[\.\.\.route\.requiredCapabilities\]\)/u);
});
