#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  prepareManifest,
} from './run-local-art-batch-entry.mjs';

function drawThingsCatalog() {
  const common = {
    version: '1.0.0',
    operations: ['generate'],
    assetKinds: ['illustration'],
    limits: {
      maximumCandidates: 4,
      maximumReferenceImages: 0,
      maximumSourceBytes: 67108864,
    },
    nodeInventory: [
      { nodeId: '3', classType: 'DrawThingsSampler' },
    ],
  };
  return {
    schemaVersion: 'evavo.comfyui-workflow-catalog.v1',
    catalogId: 'draw-things-v2-test',
    catalogVersion: '1.0.0',
    catalogSha256: 'a'.repeat(64),
    profiles: [
      {
        ...common,
        profileId: 'dt-fixture-generate',
        label: 'fixture base',
        priority: 220,
        modelId: 'fixture-model',
        continuityPhases: ['identity-master', 'independent'],
        capabilities: [
          'generate',
          'seed',
          'custom-size',
          'candidate-count',
          'cancellation',
        ],
      },
      {
        ...common,
        profileId: 'dt-fixture-generate-identity-ref',
        label: 'fixture identity',
        priority: 219,
        modelId: 'fixture-model',
        continuityPhases: ['key-pose', 'repair', 'independent'],
        capabilities: [
          'generate',
          'seed',
          'custom-size',
          'candidate-count',
          'cancellation',
          'reference-images',
          'identity-reference',
        ],
        limits: {
          maximumCandidates: 4,
          maximumReferenceImages: 1,
          maximumSourceBytes: 67108864,
        },
        nodeInventory: [
          { nodeId: '3', classType: 'DrawThingsSampler' },
          { nodeId: '5', classType: 'LoadImage' },
        ],
      },
    ],
  };
}

async function sourceManifest(root, catalogPath) {
  const templatePath = path.resolve(
    'examples',
    'local-generation-batch.template.json',
  );
  const document = JSON.parse(await readFile(templatePath, 'utf8'));
  document.campaignId = 'draw-things-v2-entry-test';
  document.batch_size = 2;
  document.shots = document.shots.slice(0, 2);
  document.provider = {
    backend: 'draw-things',
    baseUrl: 'http://127.0.0.1:8193',
    catalogPath,
  };
  document.quality_overrides = {
    width: 1024,
    height: 1024,
    outputFormat: 'png',
  };
  delete document.model_plan;
  delete document.modelPlan;
  const source = path.join(root, 'batch.json');
  await writeFile(source, `${JSON.stringify(document, null, 2)}\n`);
  return source;
}

test('batch V2 Draw Things preflight writes provider-neutral execution and exact frame routes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-dt-v2-entry-'));
  const catalogPath = path.join(root, 'catalog.json');
  await writeFile(
    catalogPath,
    `${JSON.stringify(drawThingsCatalog(), null, 2)}\n`,
  );
  const source = await sourceManifest(root, catalogPath);
  const priorLocalAppData = process.env.LOCALAPPDATA;
  const priorVram =
    process.env.EVAVO_CREATIVE_GPU_AVAILABLE_VRAM_GB_AT_ADMISSION;
  process.env.LOCALAPPDATA = root;
  delete process.env.EVAVO_CREATIVE_GPU_AVAILABLE_VRAM_GB_AT_ADMISSION;
  try {
    const prepared = await prepareManifest(source, 8192);
    assert.equal(prepared.backend, 'draw-things');
    assert.equal(prepared.adapterId, null);
    assert.equal(prepared.baseUrl, 'http://127.0.0.1:8193');
    assert.equal(prepared.catalogPath, catalogPath);
    assert.equal(prepared.referenceInputCount, 1);
    assert.deepEqual(prepared.referenceStages, [
      ['001-anchor-front'],
      ['002-standing-side'],
    ]);
    assert.deepEqual(prepared.referenceAdapterIds, [
      'draw-things:dt-fixture-generate',
      'draw-things:dt-fixture-generate-identity-ref',
    ]);

    const execution = JSON.parse(
      await readFile(prepared.execution, 'utf8'),
    );
    assert.equal(execution.provider.backend, 'draw-things');
    assert.equal(execution.provider.baseUrl, 'http://127.0.0.1:8193');
    assert.equal(execution.provider.catalogPath, catalogPath);
    assert.equal(
      Object.hasOwn(execution.provider, 'adapterId'),
      false,
    );

    const providerSelection = JSON.parse(
      await readFile(prepared.providerPath, 'utf8'),
    );
    assert.equal(providerSelection.backend, 'draw-things');
    assert.equal(providerSelection.adapterId, null);
    assert.deepEqual(
      providerSelection.frameRoutes.map((route) => route.adapterId),
      [
        'draw-things:dt-fixture-generate',
        'draw-things:dt-fixture-generate-identity-ref',
      ],
    );
    assert.equal(
      providerSelection.referenceExecutionBridge,
      'v2-staged-to-v1-runtime',
    );
  } finally {
    if (priorLocalAppData === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = priorLocalAppData;
    if (priorVram === undefined) {
      delete process.env.EVAVO_CREATIVE_GPU_AVAILABLE_VRAM_GB_AT_ADMISSION;
    } else {
      process.env.EVAVO_CREATIVE_GPU_AVAILABLE_VRAM_GB_AT_ADMISSION =
        priorVram;
    }
  }
});

test('batch V2 Draw Things preflight rejects caller-controlled sampler overrides', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-dt-v2-overrides-'));
  const catalogPath = path.join(root, 'catalog.json');
  await writeFile(
    catalogPath,
    `${JSON.stringify(drawThingsCatalog(), null, 2)}\n`,
  );
  const source = await sourceManifest(root, catalogPath);
  const document = JSON.parse(await readFile(source, 'utf8'));
  document.quality_overrides.steps = 99;
  await writeFile(source, `${JSON.stringify(document, null, 2)}\n`);
  await assert.rejects(
    () => prepareManifest(source, 8192),
    /Draw Things V2 uses governed model sampling defaults.*steps/u,
  );
});

test('batch V2 Draw Things preflight rejects caller-controlled model plans', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-dt-v2-model-plan-'));
  const catalogPath = path.join(root, 'catalog.json');
  await writeFile(
    catalogPath,
    `${JSON.stringify(drawThingsCatalog(), null, 2)}\n`,
  );
  const source = await sourceManifest(root, catalogPath);
  const document = JSON.parse(await readFile(source, 'utf8'));
  document.model_plan = { modelId: 'unreviewed-caller-choice' };
  await writeFile(source, `${JSON.stringify(document, null, 2)}\n`);
  await assert.rejects(
    () => prepareManifest(source, 8192),
    /model_plan is not caller-selectable/u,
  );
});
