#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { compileBatchPlan, LOCAL_GENERATION_BATCH_SCHEMA } from './local-generation-batch-v2.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRESETS = Object.freeze([
  ['cel-animation', 'examples/local-image-smoke-cel-animation.json'],
  ['90s-game-art', 'examples/local-image-smoke-90s-game-art.json'],
  ['realistic', 'examples/local-image-smoke-realistic.json'],
]);

async function load(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), 'utf8'));
}

for (const [preset, relativePath] of PRESETS) {
  test(`${preset} smoke preset compiles through the production batch contract`, async () => {
    const source = await load(relativePath);
    assert.equal(source.schema, LOCAL_GENERATION_BATCH_SCHEMA);
    const plan = compileBatchPlan(source);
    assert.equal(plan.batchSize, source.batch_size);
    assert.equal(plan.frames.length, source.shots.length);
    assert.ok(plan.frames.length > 0);
    for (const frame of plan.frames) {
      assert.ok(frame.prompt.positive.length > 100);
      assert.equal(frame.prompt.promptSha256.length, 64);
      assert.equal(frame.prompt.negativePromptSha256.length, 64);
      assert.match(frame.prompt.positiveLayers.style, /required visual directives:/u);
    }
  });
}

test('smoke presets remain distinct authored tests rather than aliases of one prompt', async () => {
  const plans = [];
  for (const [, relativePath] of PRESETS) plans.push(compileBatchPlan(await load(relativePath)));
  const promptHashes = new Set(plans.map((plan) => plan.frames[0].prompt.promptSha256));
  const campaignIds = new Set(plans.map((plan) => plan.campaignId));
  assert.equal(promptHashes.size, PRESETS.length);
  assert.equal(campaignIds.size, PRESETS.length);
});
