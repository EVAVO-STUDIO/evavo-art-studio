#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEGACY_CHUNK_SIZE,
  LOCAL_GENERATION_BATCH_SCHEMA,
  QUALITY_PROFILES,
  chunkFrames,
  compileBatchPlan,
  compileLegacyManifest,
  imageMetadata,
  validateLocalGenerationBatch,
} from './local-generation-batch-v2.mjs';

function manifest({ count = 4, mode = 'sequential-anchor', consistency = 'strict', quality = 'cinematic_stills' } = {}) {
  return {
    schema: LOCAL_GENERATION_BATCH_SCHEMA,
    campaignId: `test-${count}-${mode}`,
    contentClass: 'general',
    batch_size: count,
    generation_mode: mode,
    consistency_mode: consistency,
    quality_profile: quality,
    character: {
      id: 'test-character',
      description: 'A deliberately specific recurring character with a stable face and silhouette',
      face: 'angular face with a distinct brow and nose shape',
      hair: 'short dark swept hair',
      build: 'tall athletic proportions',
      costume: 'dark fitted campaign costume',
      palette: ['black', 'red'],
      signatureDetails: ['distinct left eyebrow scar'],
    },
    style: {
      name: 'test-style',
      description: 'Specific authored production art with disciplined composition and physical materials',
      medium: 'digital production illustration',
      lighting: 'motivated practical lighting',
      mustHave: ['clear silhouette'],
      mustAvoid: ['generic AI look'],
    },
    continuity_locks: ['do not redesign face', 'do not change proportions'],
    negative: ['extra limbs'],
    seed_strategy: { base: 1000, stride: 1 },
    output_rules: { exactCount: true, requireUniqueHashes: true, requireNonZeroBytes: true, requireDimensions: true, writeImageMetadata: true },
    retry_rules: { maxShotAttempts: 3, retryMissing: true, retryInvalidFile: true, retryDimensionMismatch: true, retryDuplicate: true, seedBump: 1009 },
    provider: { baseUrl: 'http://127.0.0.1:8192', catalogPath: 'C:\\temp\\catalog.json', adapterId: 'comfyui:sdxl-base-local' },
    shots: Array.from({ length: count }, (_, index) => ({
      id: `shot-${String(index + 1).padStart(3, '0')}`,
      description: `Purposeful shot ${index + 1}`,
      pose: index === 0 ? 'identity-establishing standing pose' : `distinct pose ${index + 1}`,
      camera: 'eye-level controlled camera',
      expression: 'specific readable expression',
      background: 'coherent project environment',
      framing: 'stable full-character framing',
    })),
  };
}

test('quality profiles provide actual generation settings and anti-generic prompt guidance', () => {
  for (const name of ['portrait_high_quality', 'sprite_sheet_clean', 'concept_art_painterly', 'comic_inked', 'cinematic_stills', 'product_mockups']) {
    const profile = QUALITY_PROFILES[name];
    assert.ok(profile);
    assert.ok(profile.width >= 64 && profile.height >= 64);
    assert.ok(profile.steps >= 1);
    assert.ok(typeof profile.cfg === 'number');
    assert.ok(profile.sampler);
    assert.ok(profile.scheduler);
    assert.ok(profile.prompt.length >= 3);
    assert.ok(profile.negative.length >= 3);
  }
});

test('120-shot campaign validates and chunks without fixed-count assumptions', () => {
  const source = manifest({ count: 120 });
  const validated = validateLocalGenerationBatch(source);
  assert.equal(validated.batchSize, 120);
  const plan = compileBatchPlan(source);
  assert.equal(plan.frames.length, 120);
  const chunks = chunkFrames(plan.frames);
  assert.equal(LEGACY_CHUNK_SIZE, 100);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, 100);
  assert.equal(chunks[1].length, 20);
});

test('strict sequential-anchor campaign generates deterministic related seeds and anchor phase', () => {
  const plan = compileBatchPlan(manifest({ count: 4, mode: 'sequential-anchor', consistency: 'strict' }));
  assert.deepEqual(plan.frames.map((frame) => frame.seed), [1000, 1001, 1002, 1003]);
  assert.equal(plan.frames[0].continuityPhase, 'identity-master');
  assert.equal(plan.frames[1].continuityPhase, 'key-pose');
  assert.match(plan.frames[1].prompt.positive, /same identity and proportions/u);
  assert.match(plan.frames[1].prompt.positive, /distinct pose 2/u);
});

test('paired and variation modes alter per-shot candidate counts without changing batch size', () => {
  const paired = compileBatchPlan(manifest({ count: 3, mode: 'paired' }));
  const variation = compileBatchPlan(manifest({ count: 3, mode: 'variation' }));
  assert.equal(paired.batchSize, 3);
  assert.deepEqual(paired.frames.map((frame) => frame.candidateCount), [2, 2, 2]);
  assert.deepEqual(variation.frames.map((frame) => frame.candidateCount), [4, 4, 4]);
});

test('compiled legacy manifest preserves structured prompt layers and reviewed local provider routing', () => {
  const plan = compileBatchPlan(manifest({ count: 2 }));
  const legacy = compileLegacyManifest(plan, plan.frames, 1);
  assert.equal(legacy.schema, 'evavo.local-generation-campaign.v1');
  assert.equal(legacy.scenes.length, 2);
  assert.equal(legacy.provider.adapterId, 'comfyui:sdxl-base-local');
  assert.match(legacy.scenes[0].prompt, /A deliberately specific recurring character/u);
  assert.match(legacy.scenes[0].prompt, /Specific authored production art/u);
  assert.match(legacy.scenes[0].prompt, /cinematic production still/u);
  assert.match(legacy.scenes[0].negativePrompt, /generic AI look/u);
});

test('image metadata contains reproducibility and QA fields', () => {
  const plan = compileBatchPlan(manifest({ count: 1 }));
  const frame = plan.frames[0];
  const metadata = imageMetadata(plan, frame, {
    attempt: 2,
    route: { adapterId: 'comfyui:sdxl-base-local', modelId: 'sdxl-base' },
    candidate: { artifactId: 'artifact-1', contentHash: 'sha256:abc', outputFileName: '001.png' },
    qa: { ok: true, sha256: 'abc', bytes: 123, dimensions: { width: 1344, height: 768 } },
  });
  assert.equal(metadata.schema, 'evavo.local-generation-image-metadata.v2');
  assert.equal(metadata.retryAttempt, 2);
  assert.equal(metadata.qualityProfile, 'cinematic_stills');
  assert.equal(metadata.settings.steps, QUALITY_PROFILES.cinematic_stills.steps);
  assert.ok(metadata.promptSha256.length === 64);
  assert.ok(metadata.negativePromptSha256.length === 64);
  assert.equal(metadata.qa.ok, true);
});

test('invalid campaign counts and duplicate shot IDs fail closed', () => {
  const badCount = manifest({ count: 2 });
  badCount.batch_size = 3;
  assert.throws(() => validateLocalGenerationBatch(badCount), /shots length/u);

  const duplicate = manifest({ count: 2 });
  duplicate.shots[1].id = duplicate.shots[0].id;
  assert.throws(() => validateLocalGenerationBatch(duplicate), /shot IDs must be unique/u);
});
