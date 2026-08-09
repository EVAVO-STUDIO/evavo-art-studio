import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BUILD_TOOL,
  callTool,
  policy,
  toolDefinitions,
} from './pixel-font-studio-mcp.mjs';
import {
  buildFamily,
  planFamily,
  validateFamily,
} from './pixel-font/builder.mjs';

function request() {
  return {
    schema: 'evavo.pixel-font-family-request.v1',
    familyId: 'test-dos',
    displayName: 'Test DOS',
    version: '1.0.0',
    copyright: 'Copyright 2026 EVAVO Studio.',
    license: {
      type: 'EVAVO Original',
      holder: 'EVAVO Studio',
      terms: 'Test-only original font family.',
    },
    sourceGrid: 'evavo-5x7-v1',
    characterSets: ['basic-latin', 'currency-core', 'punctuation-extended'],
    additionalGlyphs: ['✓'],
    faces: [
      {
        id: 'test_ui',
        displayName: 'Test UI',
        role: 'ui',
        preset: 'dos-ui',
        fill: '#FFFFFFFF',
        outlineColor: '#000000FF',
        shadowColor: '#00000088',
      },
      {
        id: 'test_ledger',
        displayName: 'Test Ledger',
        role: 'ledger',
        preset: 'dos-ledger',
        fill: '#FF244EFF',
        outlineColor: '#000000FF',
        shadowColor: '#00000088',
      },
    ],
    roleMap: {
      title: 'test_ui',
      body: 'test_ui',
      numeric_hud: 'test_ledger',
    },
    specimenLines: [
      'Sail Sell Survive',
      '0123456789 £ ¥ €',
      'AVATAR WATER WAY',
    ],
    godot: {
      minimumVersion: '4.6.2',
      targetVersion: '4.6.2',
      resourceBasePath: 'assets/fonts/evavo/test-dos',
      textureFilter: 'nearest',
      integerScaleOnly: true,
      subpixelPositioning: false,
      mipmaps: false,
    },
    quality: {
      maximumAtlasEdge: 1024,
      maximumGlyphs: 256,
      minimumVisiblePixels: 1,
      requireDistinctConfusables: true,
    },
  };
}

async function fixture(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-pixel-font-'));
  const requestPath = path.join(root, 'request.json');
  const value = request();
  if (options.compact) {
    value.delivery = {
      includeSpecimens: false,
      includeDetailedGlyphRecords: false,
    };
  }
  await writeFile(requestPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return { root, requestPath, outputRoot: path.join(root, 'output') };
}

test('builds and independently validates a deterministic multi-face family', async () => {
  const value = await fixture();
  try {
    await mkdir(value.outputRoot);
    const result = await buildFamily(value);
    assert.equal(result.validation.status, 'passed');
    assert.equal(result.family.faces.length, 2);
    assert.equal(result.family.buildPolicy.externalFontBinaryUsed, false);
    assert.equal(Object.values(result.family.authority).every((entry) => entry === false), true);
    const validation = await validateFamily({ familyPath: result.familyPath });
    assert.equal(validation.status, 'passed');
    assert.equal(validation.familySha256, result.family.familySha256);
    const fnt = await readFile(path.join(value.outputRoot, 'faces/test_ui/test_ui.fnt'), 'utf8');
    assert.match(fnt, /chars count=/u);
    assert.match(fnt, /char id=65 /u);
    assert.match(fnt, /char id=48 /u);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test('build output is deterministic across separate roots', async () => {
  const left = await fixture();
  const right = await fixture();
  try {
    await mkdir(left.outputRoot);
    await mkdir(right.outputRoot);
    const first = await buildFamily(left);
    const second = await buildFamily(right);
    assert.equal(first.family.familySha256, second.family.familySha256);
    assert.equal(first.validation.validationSha256, second.validation.validationSha256);
    const files = [
      'faces/test_ui/test_ui.png',
      'faces/test_ui/test_ui.fnt',
      'faces/test_ui/test_ui.face.json',
      'godot/pixel-font-role-map.json',
      'pixel-font-family.json',
    ];
    for (const relative of files) {
      assert.deepEqual(
        await readFile(path.join(left.outputRoot, relative)),
        await readFile(path.join(right.outputRoot, relative)),
      );
    }
  } finally {
    await rm(left.root, { recursive: true, force: true });
    await rm(right.root, { recursive: true, force: true });
  }
});

test('create-only output rejects replacement', async () => {
  const value = await fixture();
  try {
    await mkdir(value.outputRoot);
    await buildFamily(value);
    await assert.rejects(() => buildFamily(value), /already exists/iu);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test('tampered atlas fails independent validation', async () => {
  const value = await fixture();
  try {
    await mkdir(value.outputRoot);
    const result = await buildFamily(value);
    const atlasPath = path.join(value.outputRoot, 'faces/test_ui/test_ui.png');
    const atlas = await readFile(atlasPath);
    atlas[atlas.length - 1] ^= 1;
    await writeFile(atlasPath, atlas);
    await assert.rejects(() => validateFamily({ familyPath: result.familyPath }), /CRC|identity/iu);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test('MCP keeps build hidden in read-only mode and requires per-call confirmation', async () => {
  const readOnly = Object.freeze({ mode: 'read-only', writesEnabled: false, roots: Object.freeze([]) });
  assert.equal(toolDefinitions(readOnly).some((tool) => tool.name === BUILD_TOOL), false);
  assert.throws(() => policy({ EVAVO_PIXEL_FONT_STUDIO_MODE: 'read-write' }), /ALLOW_WRITES/iu);
  const value = await fixture();
  try {
    await mkdir(value.outputRoot);
    const writePolicy = Object.freeze({ mode: 'read-write', writesEnabled: true, roots: Object.freeze([value.root]) });
    assert.equal(toolDefinitions(writePolicy).some((tool) => tool.name === BUILD_TOOL), true);
    await assert.rejects(
      () => callTool(BUILD_TOOL, { requestPath: value.requestPath, outputRoot: value.outputRoot }, { policy: writePolicy }),
      /confirmWrite/iu,
    );
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test('compact runtime delivery omits specimens and detailed glyph records while preserving coverage', async () => {
  const value = await fixture({ compact: true });
  try {
    await mkdir(value.outputRoot);
    const result = await buildFamily(value);
    assert.equal(result.validation.status, 'passed');
    assert.equal(result.family.delivery.includeSpecimens, false);
    assert.equal(result.family.delivery.includeDetailedGlyphRecords, false);
    const face = JSON.parse(await readFile(path.join(value.outputRoot, 'faces/test_ui/test_ui.face.json'), 'utf8'));
    assert.equal(Object.hasOwn(face, 'glyphs'), false);
    assert.equal(Object.hasOwn(face.outputs, 'specimen'), false);
    await assert.rejects(
      () => readFile(path.join(value.outputRoot, 'faces/test_ui/test_ui.specimen.png')),
      /ENOENT/u,
    );
    const validation = await validateFamily({ familyPath: result.familyPath });
    assert.equal(validation.status, 'passed');
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test('plan self-hash binds the exact output root without weakening deterministic family identity', async () => {
  const value = await fixture();
  try {
    const plan = await planFamily(value);
    assert.match(plan.planSha256, /^[0-9a-f]{64}$/u);
    assert.equal(plan.runId, plan.planSha256.slice(0, 20));
    assert.equal(plan.outputRoot, value.outputRoot);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
