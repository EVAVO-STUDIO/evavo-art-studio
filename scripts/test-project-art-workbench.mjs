#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalJson,
  readJsonFileBounded,
  sha256,
  verifyDocumentHash,
  withDocumentHash,
  writeJsonCreateOnly,
} from './project-art/common.mjs';
import { compileProjectArtIntelligence } from './project-art/intelligence.mjs';
import {
  PROJECT_ART_OPERATIONS_SCHEMA,
  compileProjectArtSandbox,
} from './project-art/sandbox.mjs';
import {
  REFERENCE_BINDINGS_SCHEMA,
  compileReferenceDerivedImagePlan,
} from './project-art/reference-derived.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'evavo-project-art-workbench-'));
const workspace = path.join(fixtureRoot, 'project');
const external = path.join(fixtureRoot, 'external-art');
const fixedTime = '2026-08-09T10:00:00.000Z';
const png8 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGP8z8DwnwEPYMInOXwUAAASWwIOH0pJXQAAAABJRU5ErkJggg==',
  'base64',
);
const png16x8 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAICAYAAADwdn+XAAAAD0lEQVR4nGNgGAWjgIEBAAIIAAHpSvXHAAAAAElFTkSuQmCC',
  'base64',
);

function expectProjectArtError(promise, code) {
  return assert.rejects(promise, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}

function pythonExecutable() {
  const candidates = process.platform === 'win32'
    ? [['py', ['-3']], ['python', []], ['python3', []]]
    : [['python', []], ['python3', []], ['py', ['-3']]];
  for (const [command, prefix] of candidates) {
    const result = spawnSync(command, [...prefix, '-c', 'import sys; print(sys.version_info[0])'], {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    });
    if (result.status === 0 && result.stdout.trim() === '3') return { command, prefix };
  }
  return null;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    ...options,
  });
}

try {
  await mkdir(path.join(workspace, 'art'), { recursive: true });
  await mkdir(path.join(workspace, 'scenes'), { recursive: true });
  await mkdir(path.join(workspace, 'scripts'), { recursive: true });
  await mkdir(external, { recursive: true });
  await writeFile(path.join(workspace, 'project.godot'), '[application]\nrun/main_scene="res://scenes/main.tscn"\n');
  await writeFile(
    path.join(workspace, 'scenes', 'main.tscn'),
    '[gd_scene load_steps=2 format=3]\n' +
      '[ext_resource type="Texture2D" path="res://art/hero.png" id="1"]\n' +
      '[ext_resource type="Texture2D" path="res://art/missing.png" id="2"]\n',
  );
  await writeFile(
    path.join(workspace, 'scripts', 'game.ts'),
    "this.load.spritesheet('hero', '../art/sheet.png', { frameWidth: 8, frameHeight: 8 });\n",
  );
  await writeFile(path.join(workspace, 'art', 'hero.png'), png8);
  await writeFile(path.join(workspace, 'art', 'sheet.png'), png16x8);
  await writeFile(path.join(workspace, 'art', 'source.psd'), Buffer.from('8BPSfixture'));
  await writeFile(path.join(external, 'hero-copy.png'), png8);

  const hashFixture = withDocumentHash({ schema: 'fixture', value: 1 });
  assert.equal(verifyDocumentHash(hashFixture), hashFixture.documentSha256);
  assert.throws(
    () => verifyDocumentHash({ ...hashFixture, value: 2 }),
    (error) => error.code === 'PROJECT_ART_DOCUMENT_HASH_MISMATCH',
  );
  assert.equal(sha256(canonicalJson({ b: 2, a: 1 })), sha256('{"a":1,"b":2}'));

  const intelligence = await compileProjectArtIntelligence({
    projectRoot: workspace,
    artRoots: [{ id: 'raw', path: external }],
    projectId: 'fixture-game',
    generatedAt: fixedTime,
  });
  assert.equal(intelligence.schema, 'evavo.project-art-intelligence.v1');
  assert.equal(intelligence.engineSurfaces[0].id, 'godot');
  assert.equal(intelligence.summary.unresolvedReferences, 1);
  assert.equal(intelligence.summary.exactDuplicateGroups, 1);
  assert.ok(intelligence.workItems.some((item) => item.action === 'create'));
  assert.ok(intelligence.queueSeed.items.every((item) => item.requiresFreshExecutionAuthorization === true));
  assert.equal(intelligence.authority.providerExecution, false);
  verifyDocumentHash(intelligence);

  const { value: registry, bytes: registryBytes } = await readJsonFileBounded(
    path.join(root, 'config', 'project-art-operations.v1.json'),
    'test registry',
  );
  assert.equal(registry.schema, PROJECT_ART_OPERATIONS_SCHEMA);
  const sandboxRequest = {
    schema: 'evavo.project-art-sandbox-request.v1',
    sandboxId: 'fixture-sandbox',
    projectId: 'fixture-game',
    purpose: 'Compile a bounded sandbox fixture.',
    tasks: [
      {
        id: 'inspect-hero',
        kind: 'image',
        source: 'art/hero.png',
        targetPath: 'clean/hero.png',
        operations: [{ op: 'inspect' }, { op: 'optimize' }],
      },
    ],
    authority: { providerExecution: false, candidateApproval: false },
  };
  const sandboxBytes = Buffer.from(JSON.stringify(sandboxRequest));
  const sandboxPlan = await compileProjectArtSandbox({
    workspaceRoot: workspace,
    request: sandboxRequest,
    requestBytes: sandboxBytes,
    registry,
    registryBytes,
    compiledAt: fixedTime,
  });
  assert.equal(sandboxPlan.externalSources.length, 1);
  assert.equal(sandboxPlan.tasks[0].source.kind, 'external');
  assert.equal(sandboxPlan.execution.wholeRunAtomicPublication, true);
  assert.equal(sandboxPlan.authority.sourceMutation, false);
  assert.equal(
    sandboxPlan.limits.boundExternalSourceBytes,
    sandboxPlan.externalSources[0].bytes,
  );
  assert.equal(sandboxPlan.limits.plannedMaximumOutputFiles, 2);
  verifyDocumentHash(sandboxPlan);

  const sourceByteBoundRegistry = {
    ...registry,
    maximumTotalSourceBytes: sandboxPlan.externalSources[0].bytes - 1,
  };
  await expectProjectArtError(
    compileProjectArtSandbox({
      workspaceRoot: workspace,
      request: sandboxRequest,
      requestBytes: sandboxBytes,
      registry: sourceByteBoundRegistry,
      registryBytes: Buffer.from(JSON.stringify(sourceByteBoundRegistry)),
      compiledAt: fixedTime,
    }),
    'PROJECT_ART_SANDBOX_SOURCE_BYTES_LIMIT',
  );

  const outputCountBoundRegistry = {
    ...registry,
    maximumOutputFiles: 4,
  };
  const outputCountRequest = {
    ...sandboxRequest,
    sandboxId: 'output-count-limit',
    tasks: [
      {
        id: 'output-count-limit',
        kind: 'slice-sheet',
        source: 'art/sheet.png',
        targetDirectory: 'output-count-limit',
        frameWidth: 8,
        frameHeight: 8,
        count: 3,
      },
    ],
  };
  await expectProjectArtError(
    compileProjectArtSandbox({
      workspaceRoot: workspace,
      request: outputCountRequest,
      requestBytes: Buffer.from(JSON.stringify(outputCountRequest)),
      registry: outputCountBoundRegistry,
      registryBytes: Buffer.from(JSON.stringify(outputCountBoundRegistry)),
      compiledAt: fixedTime,
    }),
    'PROJECT_ART_SANDBOX_OUTPUT_COUNT_LIMIT',
  );

  const implicitOutputCountRegistry = {
    ...registry,
    maximumOutputFiles: 3,
  };
  const implicitOutputCountRequest = {
    ...sandboxRequest,
    sandboxId: 'implicit-output-count-limit',
    tasks: [
      {
        id: 'implicit-output-count-limit',
        kind: 'slice-sheet',
        source: 'art/sheet.png',
        targetDirectory: 'implicit-output-count-limit',
        frameWidth: 8,
        frameHeight: 8,
      },
    ],
  };
  await expectProjectArtError(
    compileProjectArtSandbox({
      workspaceRoot: workspace,
      request: implicitOutputCountRequest,
      requestBytes: Buffer.from(JSON.stringify(implicitOutputCountRequest)),
      registry: implicitOutputCountRegistry,
      registryBytes: Buffer.from(JSON.stringify(implicitOutputCountRegistry)),
      compiledAt: fixedTime,
    }),
    'PROJECT_ART_SANDBOX_OUTPUT_COUNT_LIMIT',
  );

  const oversizedCompositeCases = [
    {
      id: 'oversized-composite-canvas',
      canvas: { width: 65_536, height: 65_536, background: '#00000000' },
      layers: [{ sourceIndex: 0 }],
    },
    {
      id: 'oversized-composite-layer',
      canvas: { width: 8, height: 8, background: '#00000000' },
      layers: [{ sourceIndex: 0, width: 65_536, height: 65_536 }],
    },
  ];
  for (const testCase of oversizedCompositeCases) {
    const oversizedRequest = {
      ...sandboxRequest,
      sandboxId: testCase.id,
      tasks: [
        {
          id: testCase.id,
          kind: 'image-composite',
          sources: [{ path: 'art/hero.png' }],
          targetPath: `${testCase.id}.png`,
          canvas: testCase.canvas,
          layers: testCase.layers,
        },
      ],
    };
    await expectProjectArtError(
      compileProjectArtSandbox({
        workspaceRoot: workspace,
        request: oversizedRequest,
        requestBytes: Buffer.from(JSON.stringify(oversizedRequest)),
        registry,
        registryBytes,
        compiledAt: fixedTime,
      }),
      'PROJECT_ART_SANDBOX_PIXEL_LIMIT',
    );
  }

  const normalMapCpuRequest = {
    ...sandboxRequest,
    sandboxId: 'normal-map-cpu-pixel-limit',
    tasks: [
      {
        id: 'normal-map-cpu-pixel-limit',
        kind: 'image',
        source: 'art/hero.png',
        targetPath: 'normal-map-cpu-pixel-limit.png',
        operations: [
          { op: 'resize', width: 3000, height: 3000 },
          { op: 'normal-map-from-height', source: 'alpha' },
        ],
      },
    ],
  };
  await expectProjectArtError(
    compileProjectArtSandbox({
      workspaceRoot: workspace,
      request: normalMapCpuRequest,
      requestBytes: Buffer.from(JSON.stringify(normalMapCpuRequest)),
      registry,
      registryBytes,
      compiledAt: fixedTime,
    }),
    'PROJECT_ART_SANDBOX_PIXEL_LIMIT',
  );

  const decodedPixelBudgetCases = [
    {
      id: 'oversized-image-operation',
      maximumDecodedPixels: 100,
      expectedCode: 'PROJECT_ART_SANDBOX_PIXEL_LIMIT',
      task: {
        id: 'oversized-image-operation',
        kind: 'image',
        source: 'art/hero.png',
        targetPath: 'oversized-image-operation.png',
        operations: [{ op: 'resize', width: 11, height: 10 }],
      },
    },
    {
      id: 'oversized-slice-frame',
      maximumDecodedPixels: 100,
      expectedCode: 'PROJECT_ART_SANDBOX_PIXEL_LIMIT',
      task: {
        id: 'oversized-slice-frame',
        kind: 'slice-sheet',
        source: 'art/sheet.png',
        targetDirectory: 'oversized-slice-frame',
        frameWidth: 11,
        frameHeight: 10,
      },
    },
    {
      id: 'assemble-working-set-limit',
      maximumDecodedPixels: 800,
      expectedCode: 'PROJECT_ART_SANDBOX_AGGREGATE_PIXEL_LIMIT',
      task: {
        id: 'assemble-working-set-limit',
        kind: 'assemble-sheet',
        sources: [{ path: 'art/hero.png' }],
        targetPath: 'assemble-working-set-limit.png',
        columns: 1,
        padding: 10,
      },
    },
    {
      id: 'review-source-set-limit',
      maximumDecodedPixels: 100,
      expectedCode: 'PROJECT_ART_SANDBOX_AGGREGATE_PIXEL_LIMIT',
      task: {
        id: 'review-source-set-limit',
        kind: 'sequence-review',
        sources: [{ path: 'art/hero.png' }, { path: 'art/hero.png' }],
        targetDirectory: 'review-source-set-limit',
        preview: { contactSheet: false, animatedGif: false },
      },
    },
    {
      id: 'review-contact-sheet-limit',
      maximumDecodedPixels: 500,
      expectedCode: 'PROJECT_ART_SANDBOX_AGGREGATE_PIXEL_LIMIT',
      task: {
        id: 'review-contact-sheet-limit',
        kind: 'sequence-review',
        sources: [{ path: 'art/hero.png' }, { path: 'art/hero.png' }],
        targetDirectory: 'review-contact-sheet-limit',
        preview: { contactSheet: true, animatedGif: false, columns: 1 },
      },
    },
    {
      id: 'compare-working-set-limit',
      maximumDecodedPixels: 150,
      expectedCode: 'PROJECT_ART_SANDBOX_AGGREGATE_PIXEL_LIMIT',
      task: {
        id: 'compare-working-set-limit',
        kind: 'image-compare',
        sources: [{ path: 'art/hero.png' }, { path: 'art/hero.png' }],
        targetDirectory: 'compare-working-set-limit',
      },
    },
    {
      id: 'composite-working-set-limit',
      maximumDecodedPixels: 300,
      expectedCode: 'PROJECT_ART_SANDBOX_AGGREGATE_PIXEL_LIMIT',
      task: {
        id: 'composite-working-set-limit',
        kind: 'image-composite',
        sources: [{ path: 'art/hero.png' }],
        targetPath: 'composite-working-set-limit.png',
        canvas: { width: 8, height: 8 },
        layers: [{ sourceIndex: 0 }],
      },
    },
  ];
  for (const testCase of decodedPixelBudgetCases) {
    const boundedRegistry = {
      ...registry,
      maximumDecodedPixels: testCase.maximumDecodedPixels,
    };
    const boundedRequest = {
      ...sandboxRequest,
      sandboxId: testCase.id,
      tasks: [testCase.task],
    };
    await expectProjectArtError(
      compileProjectArtSandbox({
        workspaceRoot: workspace,
        request: boundedRequest,
        requestBytes: Buffer.from(JSON.stringify(boundedRequest)),
        registry: boundedRegistry,
        registryBytes: Buffer.from(JSON.stringify(boundedRegistry)),
        compiledAt: fixedTime,
      }),
      testCase.expectedCode,
    );
  }

  await expectProjectArtError(
    compileProjectArtSandbox({
      workspaceRoot: workspace,
      request: {
        ...sandboxRequest,
        tasks: [
          {
            id: 'forward',
            kind: 'assemble-sheet',
            sources: [{ taskId: 'later' }],
            targetPath: 'forward.png',
            columns: 1,
          },
          {
            id: 'later',
            kind: 'image',
            source: 'art/hero.png',
            targetPath: 'later.png',
            operations: ['inspect'],
          },
        ],
      },
      requestBytes: sandboxBytes,
      registry,
      registryBytes,
      compiledAt: fixedTime,
    }),
    'PROJECT_ART_SANDBOX_DEPENDENCY_INVALID',
  );
  await expectProjectArtError(
    compileProjectArtSandbox({
      workspaceRoot: workspace,
      request: {
        ...sandboxRequest,
        tasks: [
          {
            id: 'escape',
            kind: 'image',
            source: '../outside.png',
            targetPath: 'safe.png',
            operations: ['inspect'],
          },
        ],
      },
      requestBytes: sandboxBytes,
      registry,
      registryBytes,
      compiledAt: fixedTime,
    }),
    'PROJECT_ART_PATH_INVALID',
  );
  try {
    await symlink(path.join(workspace, 'art', 'hero.png'), path.join(workspace, 'art', 'hero-link.png'));
    await expectProjectArtError(
      compileProjectArtSandbox({
        workspaceRoot: workspace,
        request: {
          ...sandboxRequest,
          tasks: [
            {
              id: 'symlink',
              kind: 'image',
              source: 'art/hero-link.png',
              targetPath: 'safe.png',
              operations: ['inspect'],
            },
          ],
        },
        requestBytes: sandboxBytes,
        registry,
        registryBytes,
        compiledAt: fixedTime,
      }),
      'PROJECT_ART_PATH_SYMLINK',
    );
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error?.code)) throw error;
  }

  const referenceRequest = {
    schema: 'evavo.reference-derived-image-request.v1',
    requestId: 'fixture-between-frame',
    projectId: 'fixture-game',
    operation: 'in-between-frame',
    assetKind: 'sprite-frame',
    assetId: 'hero-walk',
    candidateFamilyId: 'hero-walk-family',
    frameId: 'walk-01',
    creativeIntent: 'Create the exact in-between pose while preserving identity, palette, pivot and canvas.',
    negativeIntent: 'Do not redesign the character or add new accessories.',
    style: {
      styleName: 'Fixture pixel family',
      intent: 'Match the retained pixel-art family exactly.',
      mustHave: ['same identity', 'transparent background'],
      mustAvoid: ['antialiasing'],
      identityLocks: ['head shape'],
      palette: ['source-bound'],
      lineTreatment: ['hard pixel edges'],
      compositionRules: ['same pivot and canvas'],
    },
    shot: {
      subject: 'Hero walking',
      action: 'One in-between walking pose',
      direction: 'left to right',
      include: ['complete body'],
      exclude: ['cast shadow'],
      framing: ['same 8 by 8 canvas'],
    },
    target: { width: 8, height: 8, transparency: 'required', outputFormat: 'png' },
    candidateCount: 3,
    references: [
      { referenceId: 'identity', role: 'canonical-identity', path: 'art/hero.png', required: true },
      { referenceId: 'previous', role: 'previous-key-pose', path: 'art/hero.png', required: true },
      { referenceId: 'next', role: 'next-key-pose', path: 'art/sheet.png', required: true },
    ],
    selection: { allowedAdapterIds: ['openai-gpt-image'], allowFallback: false },
    authority: { providerExecution: false, candidateApproval: false },
  };
  const referenceBytes = Buffer.from(JSON.stringify(referenceRequest));
  const unboundPlan = await compileReferenceDerivedImagePlan({
    workspaceRoot: workspace,
    request: referenceRequest,
    requestBytes: referenceBytes,
    compiledAt: fixedTime,
  });
  assert.equal(unboundPlan.providerCompilable, false);
  assert.deepEqual([...unboundPlan.missingArtifactReferenceIds].sort(), ['identity', 'next', 'previous']);
  assert.equal(unboundPlan.workflow.requiresFreshAdmission, true);
  assert.equal(unboundPlan.authority.providerExecution, false);
  verifyDocumentHash(unboundPlan);

  const bindings = withDocumentHash({
    schema: REFERENCE_BINDINGS_SCHEMA,
    sourcePlanSha256: unboundPlan.documentSha256,
    requestId: unboundPlan.requestId,
    projectId: unboundPlan.projectId,
    artifactRoot: 'fixture',
    bindings: [
      { referenceId: 'identity', artifactId: `artifact_${'1'.repeat(64)}` },
      { referenceId: 'previous', artifactId: `artifact_${'2'.repeat(64)}` },
      { referenceId: 'next', artifactId: `artifact_${'3'.repeat(64)}` },
    ],
    effects: { artifactIngest: true, providerExecution: false },
  });
  const bindingsBytes = Buffer.from(`${JSON.stringify(bindings, null, 2)}\n`);
  const boundPlan = await compileReferenceDerivedImagePlan({
    workspaceRoot: workspace,
    request: referenceRequest,
    requestBytes: referenceBytes,
    bindings,
    bindingsBytes,
    compiledAt: fixedTime,
  });
  assert.equal(boundPlan.providerCompilable, true);
  assert.equal(boundPlan.providerRequest.operation, 'generate');
  assert.equal(boundPlan.providerRequest.continuityPhase, 'in-between');
  assert.ok(boundPlan.requiredCapabilities.includes('temporal-reference'));
  assert.equal(boundPlan.providerRequest.metadata.independentApprovalPerformed, false);
  verifyDocumentHash(boundPlan);

  await expectProjectArtError(
    compileReferenceDerivedImagePlan({
      workspaceRoot: workspace,
      request: {
        ...referenceRequest,
        references: referenceRequest.references.filter((reference) => reference.referenceId !== 'next'),
      },
      requestBytes: referenceBytes,
      compiledAt: fixedTime,
    }),
    'REFERENCE_DERIVED_TOPOLOGY_INVALID',
  );

  const python = pythonExecutable();
  const requirePillow = process.env.PROJECT_ART_REQUIRE_PILLOW === '1';
  if (requirePillow && !python) throw new Error('PROJECT_ART_REQUIRE_PILLOW=1 but no Python 3 executable was found.');
  if (requirePillow) {
    const generate = run(
      python.command,
      [
        ...python.prefix,
        '-c',
        [
          'from PIL import Image, ImageDraw',
          'from pathlib import Path',
          `root=Path(${JSON.stringify(path.join(workspace, 'art'))})`,
          "hero=Image.new('RGBA',(8,8),(255,255,255,255))",
          'draw=ImageDraw.Draw(hero)',
          "draw.rectangle((2,2,5,5), fill=(255,0,0,255))",
          "hero.save(root/'hero.png')",
          "sheet=Image.new('RGBA',(16,8),(0,0,0,0))",
          'draw=ImageDraw.Draw(sheet)',
          "draw.rectangle((1,1,6,6), fill=(0,255,0,255))",
          "draw.rectangle((9,1,14,6), fill=(0,0,255,255))",
          "sheet.save(root/'sheet.png')",
          "checker=Image.new('RGBA',(128,128),(0,0,0,255))",
          "pixels=checker.load()",
          "for y in range(128):",
          " for x in range(128):",
          "  value=176 if ((x//16+y//16)&1) else 224",
          "  pixels[x,y]=(value,value,value,255)",
          "ImageDraw.Draw(checker).rectangle((40,24,87,111),fill=(210,90,55,255))",
          "checker.save(root/'fake-checker.png')",
        ].join('\n'),
      ],
    );
    assert.equal(generate.status, 0, generate.stderr || generate.stdout);

    const fullRequest = {
      schema: 'evavo.project-art-sandbox-request.v1',
      sandboxId: 'fixture-full-sandbox',
      projectId: 'fixture-game',
      purpose: 'Exercise deterministic edit, sheet and review operations.',
      tasks: [
        {
          id: 'clean-hero',
          kind: 'image',
          source: 'art/hero.png',
          targetPath: 'clean/hero.png',
          operations: [
            { op: 'connected-matte-to-alpha', matteColour: '#ffffff', distance: 8 },
            { op: 'edge-decontaminate', matteColour: '#ffffff' },
            { op: 'trim-alpha', margin: 1 },
            { op: 'pad-canvas', width: 8, height: 8, anchor: 'bottom-centre' },
            { op: 'hidden-rgb-rebuild' },
            { op: 'translate', x: 0, y: 0 },
            { op: 'colour-replace', fromColour: '#ff0000', toColour: '#ff0000', distance: 0 },
            { op: 'brightness', factor: 1 },
            { op: 'contrast', factor: 1 },
            { op: 'saturation', factor: 1 },
            { op: 'sharpness', factor: 1 },
            { op: 'gaussian-blur', radius: 0 },
            { op: 'unsharp-mask', radius: 1, percent: 0, threshold: 0 },
            { op: 'alpha-dilate', width: 1 },
            { op: 'alpha-erode', width: 1 },
            { op: 'outline', colour: '#000000ff', width: 1 },
            { op: 'optimize' },
          ],
          expected: { width: 8, height: 8, meaningfulAlpha: true },
        },
        {
          id: 'compose-hero',
          kind: 'image-composite',
          sources: [
            { taskId: 'clean-hero' },
            { path: 'art/hero.png' },
          ],
          targetPath: 'composite/hero-pair.png',
          canvas: { width: 16, height: 8, background: '#00000000' },
          layers: [
            { sourceIndex: 0, x: 0, y: 0, opacity: 1, blendMode: 'normal' },
            {
              sourceIndex: 1,
              maskSourceIndex: 0,
              sourceRect: { x: 2, y: 2, width: 4, height: 4 },
              maskSourceRect: { x: 2, y: 2, width: 4, height: 4 },
              maskChannel: 'alpha',
              x: 8,
              y: 0,
              width: 8,
              height: 8,
              sampling: 'nearest',
              opacity: 0.75,
              blendMode: 'screen',
            },
          ],
        },
        {
          id: 'compare-clean-hero',
          kind: 'image-compare',
          sources: [
            { path: 'art/hero.png' },
            { taskId: 'clean-hero' },
          ],
          targetDirectory: 'comparison/hero',
          requireSameDimensions: true,
          thresholds: {
            maximumChangedFraction: 1,
            maximumMeanChannelDelta: 255,
            maximumAlphaChangedFraction: 1,
          },
          preview: { difference: true, overlay: true },
        },
        {
          id: 'slice-walk',
          kind: 'slice-sheet',
          source: 'art/sheet.png',
          targetDirectory: 'frames',
          frameWidth: 8,
          frameHeight: 8,
          count: 2,
        },
        {
          id: 'assemble-walk',
          kind: 'assemble-sheet',
          sources: [
            { taskId: 'slice-walk', outputIndex: 0 },
            { taskId: 'slice-walk', outputIndex: 1 },
          ],
          targetPath: 'assembled/walk.png',
          columns: 2,
        },
        {
          id: 'review-walk',
          kind: 'sequence-review',
          sources: [
            { taskId: 'slice-walk', outputIndex: 0 },
            { taskId: 'slice-walk', outputIndex: 1 },
          ],
          targetDirectory: 'review',
          expectedWidth: 8,
          expectedHeight: 8,
          requireAlpha: true,
          consistencyProfile: 'identity-locked',
          thresholds: { maximumVisibleMeanColourDistance: 441.672956 },
          preview: { contactSheet: true, animatedGif: true, onionSkins: true, columns: 2 },
        },
      ],
      authority: { providerExecution: false, candidateApproval: false },
    };
    const fullBytes = Buffer.from(JSON.stringify(fullRequest));
    const fullPlan = await compileProjectArtSandbox({
      workspaceRoot: workspace,
      request: fullRequest,
      requestBytes: fullBytes,
      registry,
      registryBytes,
      compiledAt: fixedTime,
    });
    assert.equal(fullPlan.tasks.find((task) => task.id === 'slice-walk').alphaPolicy, 'required');
    assert.equal(fullPlan.tasks.find((task) => task.id === 'assemble-walk').alphaPolicy, 'required');
    const planPath = path.join(workspace, 'full-sandbox-plan.json');
    await writeJsonCreateOnly(planPath, fullPlan);
    const sourceBefore = sha256(await readFile(path.join(workspace, 'art', 'hero.png')));
    const outputRoot = path.join(workspace, 'full-sandbox-output');
    const execution = run(
      python.command,
      [
        ...python.prefix,
        path.join(root, 'tools', 'run_project_art_sandbox.py'),
        '--workspace-root',
        workspace,
        '--plan',
        path.basename(planPath),
        '--output-root',
        path.basename(outputRoot),
      ],
    );
    assert.equal(execution.status, 0, execution.stderr || execution.stdout);
    const sourceAfter = sha256(await readFile(path.join(workspace, 'art', 'hero.png')));
    assert.equal(sourceAfter, sourceBefore);
    const receipt = JSON.parse(
      await readFile(path.join(outputRoot, '_evavo', 'project-art-sandbox-receipt.json'), 'utf8'),
    );
    assert.equal(receipt.status, 'passed');
    assert.equal(receipt.tasks.length, 6);
    assert.ok(receipt.outputs.some((output) => output.path === 'review/contact-sheet.png'));
    assert.ok(receipt.outputs.some((output) => output.path === 'comparison/hero/difference.png'));
    assert.ok(receipt.outputs.some((output) => output.path === 'composite/hero-pair.png'));
    const compositeResult = receipt.tasks.find((task) => task.taskId === 'compose-hero');
    assert.equal(compositeResult.kind, 'image-composite');
    assert.equal(compositeResult.layerCount, 2);
    assert.equal(compositeResult.status, 'passed');
    assert.deepEqual(compositeResult.layers[1].sourceRect, { x: 2, y: 2, width: 4, height: 4 });
    assert.deepEqual(compositeResult.layers[1].maskSourceRect, { x: 2, y: 2, width: 4, height: 4 });
    const compositePixels = run(
      python.command,
      [
        ...python.prefix,
        '-c',
        [
          'from PIL import Image',
          `image=Image.open(${JSON.stringify(path.join(outputRoot, 'composite', 'hero-pair.png'))}).convert('RGBA')`,
          'assert image.size == (16, 8)',
          'assert image.getpixel((12, 4)) == (255, 0, 0, 191)',
        ].join('\n'),
      ],
    );
    assert.equal(compositePixels.status, 0, compositePixels.stderr || compositePixels.stdout);
    const compareResult = receipt.tasks.find((task) => task.taskId === 'compare-clean-hero');
    assert.equal(compareResult.kind, 'image-compare');
    assert.equal(compareResult.status, 'passed');
    assert.equal(compareResult.metrics.sameDimensions, true);
    const comparisonManifest = JSON.parse(
      await readFile(path.join(outputRoot, 'comparison', 'hero', 'comparison.json'), 'utf8'),
    );
    assert.equal(comparisonManifest.schema, 'evavo.project-art-image-comparison.v1');
    assert.equal(comparisonManifest.creativeApprovalPerformed, false);
    assert.equal(comparisonManifest.identityApprovalPerformed, false);
    const sequenceManifest = JSON.parse(
      await readFile(path.join(outputRoot, 'review', 'sequence-review.json'), 'utf8'),
    );
    assert.equal(sequenceManifest.consistencyProfile, 'identity-locked');
    assert.equal(sequenceManifest.status, 'passed');
    assert.equal(sequenceManifest.transitions[0].centroidAlignedAlphaIoU, 1);
    assert.equal(typeof sequenceManifest.transitions[0].visibleMeanColourDistance, 'number');
    assert.equal(receipt.effects.sourceMutation, false);
    assert.equal(receipt.resourceUsage.externalSourceFiles, fullPlan.externalSources.length);
    assert.equal(
      receipt.resourceUsage.externalSourceBytes,
      fullPlan.limits.boundExternalSourceBytes,
    );
    assert.equal(receipt.resourceUsage.taskOutputFiles, receipt.outputs.length);
    assert.equal(
      receipt.resourceUsage.taskOutputBytes,
      receipt.outputs.reduce((total, output) => total + output.bytes, 0),
    );
    assert.equal(receipt.resourceUsage.receiptExcludedFromTaskOutputTotals, true);
    verifyDocumentHash(receipt);

    const fakeTransparencyRequest = {
      schema: 'evavo.project-art-sandbox-request.v1',
      sandboxId: 'fake-transparency-sandbox',
      projectId: 'fixture-game',
      purpose: 'Prove painted checkerboards cannot enter sheet slicing.',
      tasks: [
        {
          id: 'reject-fake-sheet',
          kind: 'slice-sheet',
          source: 'art/fake-checker.png',
          targetDirectory: 'fake-frames',
          frameWidth: 64,
          frameHeight: 64,
          count: 1,
          alphaPolicy: 'opaque',
        },
      ],
    };
    const fakeTransparencyPlan = await compileProjectArtSandbox({
      workspaceRoot: workspace,
      request: fakeTransparencyRequest,
      requestBytes: Buffer.from(JSON.stringify(fakeTransparencyRequest)),
      registry,
      registryBytes,
      compiledAt: fixedTime,
    });
    const fakeTransparencyPlanPath = path.join(workspace, 'fake-transparency-plan.json');
    await writeJsonCreateOnly(fakeTransparencyPlanPath, fakeTransparencyPlan);
    const fakeTransparencyOutput = path.join(workspace, 'fake-transparency-output');
    const fakeTransparencyExecution = run(
      python.command,
      [
        ...python.prefix,
        path.join(root, 'tools', 'run_project_art_sandbox.py'),
        '--workspace-root',
        workspace,
        '--plan',
        path.basename(fakeTransparencyPlanPath),
        '--output-root',
        path.basename(fakeTransparencyOutput),
      ],
    );
    assert.notEqual(fakeTransparencyExecution.status, 0);
    assert.match(fakeTransparencyExecution.stderr, /painted-checkerboard-detected/u);
    await assert.rejects(access(fakeTransparencyOutput), (error) => error?.code === 'ENOENT');

    const runtimePublicationBudgetCases = [
      {
        id: 'runtime-total-source-byte-budget',
        limits: {
          maximumTotalSourceBytes: fullPlan.limits.boundExternalSourceBytes - 1,
        },
        expected: /PROJECT_ART_SANDBOX_SOURCE_BYTES_LIMIT/u,
      },
      {
        id: 'runtime-bound-source-byte-evidence',
        limits: {
          boundExternalSourceBytes: fullPlan.limits.boundExternalSourceBytes + 1,
        },
        expected: /PROJECT_ART_SANDBOX_SOURCE_BYTES_LIMIT/u,
      },
      {
        id: 'runtime-bound-output-count-evidence',
        limits: {
          plannedMaximumOutputFiles: fullPlan.limits.plannedMaximumOutputFiles - 1,
        },
        expected: /PROJECT_ART_SANDBOX_OUTPUT_COUNT_LIMIT/u,
      },
      {
        id: 'runtime-raised-output-policy',
        limits: {
          maximumOutputFiles: 20_001,
        },
        expected: /maximumOutputFiles is outside the runtime boundary/u,
      },
      {
        id: 'runtime-raised-task-policy',
        limits: {
          maximumTasks: 2_001,
        },
        expected: /maximumTasks is outside the runtime boundary/u,
      },
      {
        id: 'runtime-output-file-budget',
        limits: {
          maximumOutputFiles: 1,
          plannedMaximumOutputFiles: 1,
        },
        expected: /PROJECT_ART_SANDBOX_OUTPUT_COUNT_LIMIT/u,
      },
      {
        id: 'runtime-per-output-byte-budget',
        limits: {
          maximumOutputBytes: 32,
        },
        expected: /PROJECT_ART_SANDBOX_OUTPUT_BYTES_LIMIT/u,
      },
      {
        id: 'runtime-total-output-byte-budget',
        limits: {
          maximumTotalOutputBytes: 32,
        },
        expected: /PROJECT_ART_SANDBOX_TOTAL_OUTPUT_BYTES_LIMIT/u,
      },
    ];
    for (const testCase of runtimePublicationBudgetCases) {
      const boundedPlan = withDocumentHash({
        ...fullPlan,
        sandboxId: testCase.id,
        runId: `project-art-sandbox:${testCase.id}`,
        limits: {
          ...fullPlan.limits,
          ...testCase.limits,
        },
      });
      const boundedPlanPath = path.join(workspace, `${testCase.id}.json`);
      await writeJsonCreateOnly(boundedPlanPath, boundedPlan);
      const boundedOutputRoot = path.join(workspace, `${testCase.id}-output`);
      const boundedExecution = run(
        python.command,
        [
          ...python.prefix,
          path.join(root, 'tools', 'run_project_art_sandbox.py'),
          '--workspace-root',
          workspace,
          '--plan',
          path.basename(boundedPlanPath),
          '--output-root',
          path.basename(boundedOutputRoot),
        ],
      );
      assert.notEqual(boundedExecution.status, 0);
      assert.match(boundedExecution.stderr, testCase.expected);
      await assert.rejects(access(boundedOutputRoot), (error) => error?.code === 'ENOENT');
    }

    const rectangleAttack = structuredClone(fullPlan);
    delete rectangleAttack.documentSha256;
    rectangleAttack.sandboxId = 'runtime-composite-source-rectangle-type-attack';
    rectangleAttack.runId = 'project-art-sandbox:runtime-composite-source-rectangle-type-attack';
    rectangleAttack.tasks.find((task) => task.id === 'compose-hero').layers[1].sourceRect.x = true;
    const rectangleAttackPlan = withDocumentHash(rectangleAttack);
    const rectangleAttackPlanPath = path.join(workspace, 'runtime-composite-source-rectangle-type-attack.json');
    await writeJsonCreateOnly(rectangleAttackPlanPath, rectangleAttackPlan);
    const rectangleAttackOutput = path.join(workspace, 'runtime-composite-source-rectangle-type-attack-output');
    const rectangleAttackExecution = run(
      python.command,
      [
        ...python.prefix,
        path.join(root, 'tools', 'run_project_art_sandbox.py'),
        '--workspace-root',
        workspace,
        '--plan',
        path.basename(rectangleAttackPlanPath),
        '--output-root',
        path.basename(rectangleAttackOutput),
      ],
    );
    assert.notEqual(rectangleAttackExecution.status, 0);
    assert.match(rectangleAttackExecution.stderr, /must contain integer x, y, width and height/u);
    await assert.rejects(access(rectangleAttackOutput), (error) => error?.code === 'ENOENT');

    const consistencyAttack = structuredClone(fullPlan);
    delete consistencyAttack.documentSha256;
    consistencyAttack.sandboxId = 'runtime-sequence-consistency-threshold-attack';
    consistencyAttack.runId = 'project-art-sandbox:runtime-sequence-consistency-threshold-attack';
    consistencyAttack.tasks.find((task) => task.id === 'review-walk').thresholds.maximumVisibleMeanColourDistance = 999;
    const consistencyAttackPlan = withDocumentHash(consistencyAttack);
    const consistencyAttackPlanPath = path.join(workspace, 'runtime-sequence-consistency-threshold-attack.json');
    await writeJsonCreateOnly(consistencyAttackPlanPath, consistencyAttackPlan);
    const consistencyAttackOutput = path.join(workspace, 'runtime-sequence-consistency-threshold-attack-output');
    const consistencyAttackExecution = run(
      python.command,
      [
        ...python.prefix,
        path.join(root, 'tools', 'run_project_art_sandbox.py'),
        '--workspace-root',
        workspace,
        '--plan',
        path.basename(consistencyAttackPlanPath),
        '--output-root',
        path.basename(consistencyAttackOutput),
      ],
    );
    assert.notEqual(consistencyAttackExecution.status, 0);
    assert.match(consistencyAttackExecution.stderr, /maximumVisibleMeanColourDistance must be a finite number/u);
    await assert.rejects(access(consistencyAttackOutput), (error) => error?.code === 'ENOENT');

    const runtimeWorkingSetCases = [
      {
        id: 'runtime-image-operation-budget',
        maximumDecodedPixels: 100,
        tasks: [
          {
            id: 'runtime-image-operation-budget',
            kind: 'image',
            source: 'art/hero.png',
            targetPath: 'runtime-image-operation-budget.png',
            operations: [{ op: 'resize', width: 11, height: 10 }],
          },
        ],
      },
      {
        id: 'runtime-assemble-task-output-working-set',
        maximumDecodedPixels: 150,
        tasks: [
          {
            id: 'runtime-assemble-slice',
            kind: 'slice-sheet',
            source: 'art/sheet.png',
            targetDirectory: 'runtime-assemble-frames',
            frameWidth: 8,
            frameHeight: 8,
            count: 2,
          },
          {
            id: 'runtime-assemble-task-output-working-set',
            kind: 'assemble-sheet',
            sources: [
              { taskId: 'runtime-assemble-slice', outputIndex: 0 },
              { taskId: 'runtime-assemble-slice', outputIndex: 1 },
            ],
            targetPath: 'runtime-assemble-task-output-working-set.png',
            columns: 2,
          },
        ],
      },
      {
        id: 'runtime-review-task-output-working-set',
        maximumDecodedPixels: 150,
        tasks: [
          {
            id: 'runtime-review-slice',
            kind: 'slice-sheet',
            source: 'art/sheet.png',
            targetDirectory: 'runtime-review-frames',
            frameWidth: 8,
            frameHeight: 8,
            count: 2,
          },
          {
            id: 'runtime-review-task-output-working-set',
            kind: 'sequence-review',
            sources: [
              { taskId: 'runtime-review-slice', outputIndex: 0 },
              { taskId: 'runtime-review-slice', outputIndex: 1 },
            ],
            targetDirectory: 'runtime-review-task-output-working-set',
            preview: { contactSheet: false, animatedGif: false },
          },
        ],
      },
      {
        id: 'runtime-review-contact-sheet-working-set',
        maximumDecodedPixels: 500,
        tasks: [
          {
            id: 'runtime-review-contact-sheet-working-set',
            kind: 'sequence-review',
            sources: [{ path: 'art/hero.png' }, { path: 'art/hero.png' }],
            targetDirectory: 'runtime-review-contact-sheet-working-set',
            preview: { contactSheet: true, animatedGif: false, columns: 1 },
          },
        ],
      },
      {
        id: 'runtime-compare-working-set',
        maximumDecodedPixels: 150,
        tasks: [
          {
            id: 'runtime-compare-working-set',
            kind: 'image-compare',
            sources: [{ path: 'art/hero.png' }, { path: 'art/hero.png' }],
            targetDirectory: 'runtime-compare-working-set',
          },
        ],
      },
      {
        id: 'runtime-composite-working-set',
        maximumDecodedPixels: 300,
        tasks: [
          {
            id: 'runtime-composite-working-set',
            kind: 'image-composite',
            sources: [{ path: 'art/hero.png' }],
            targetPath: 'runtime-composite-working-set.png',
            canvas: { width: 8, height: 8 },
            layers: [{ sourceIndex: 0 }],
          },
        ],
      },
    ];
    for (const testCase of runtimeWorkingSetCases) {
      const request = {
        schema: 'evavo.project-art-sandbox-request.v1',
        sandboxId: `${testCase.id}-source`,
        projectId: 'fixture-game',
        purpose: 'Compile a plan used to prove runtime decoded-pixel enforcement.',
        tasks: testCase.tasks,
        authority: { providerExecution: false, candidateApproval: false },
      };
      const sourcePlan = await compileProjectArtSandbox({
        workspaceRoot: workspace,
        request,
        requestBytes: Buffer.from(JSON.stringify(request)),
        registry,
        registryBytes,
        compiledAt: fixedTime,
      });
      const boundedPlan = withDocumentHash({
        ...sourcePlan,
        sandboxId: testCase.id,
        runId: `project-art-sandbox:${testCase.id}`,
        limits: {
          ...sourcePlan.limits,
          maximumDecodedPixels: testCase.maximumDecodedPixels,
        },
      });
      const boundedPlanPath = path.join(workspace, `${testCase.id}.json`);
      await writeJsonCreateOnly(boundedPlanPath, boundedPlan);
      const boundedOutputRoot = path.join(workspace, `${testCase.id}-output`);
      const boundedExecution = run(
        python.command,
        [
          ...python.prefix,
          path.join(root, 'tools', 'run_project_art_sandbox.py'),
          '--workspace-root',
          workspace,
          '--plan',
          path.basename(boundedPlanPath),
          '--output-root',
          path.basename(boundedOutputRoot),
        ],
      );
      assert.notEqual(boundedExecution.status, 0);
      assert.match(boundedExecution.stderr, /decoded-image boundary/u);
      await assert.rejects(access(boundedOutputRoot), (error) => error?.code === 'ENOENT');
    }

    const oversizedRuntimeCases = [
      {
        id: 'runtime-oversized-composite-canvas',
        mutate: (task) => ({
          ...task,
          canvas: { ...task.canvas, width: 65_536, height: 65_536 },
        }),
      },
      {
        id: 'runtime-oversized-composite-layer',
        mutate: (task) => ({
          ...task,
          layers: task.layers.map((layer, index) =>
            index === 1 ? { ...layer, width: 65_536, height: 65_536 } : layer,
          ),
        }),
      },
    ];
    for (const testCase of oversizedRuntimeCases) {
      const oversizedPlan = withDocumentHash({
        ...fullPlan,
        sandboxId: testCase.id,
        runId: `project-art-sandbox:${testCase.id}`,
        tasks: fullPlan.tasks.map((task) =>
          task.id === 'compose-hero' ? testCase.mutate(task) : task,
        ),
      });
      const oversizedPlanPath = path.join(workspace, `${testCase.id}.json`);
      await writeJsonCreateOnly(oversizedPlanPath, oversizedPlan);
      const oversizedOutputRoot = path.join(workspace, `${testCase.id}-output`);
      const oversizedExecution = run(
        python.command,
        [
          ...python.prefix,
          path.join(root, 'tools', 'run_project_art_sandbox.py'),
          '--workspace-root',
          workspace,
          '--plan',
          path.basename(oversizedPlanPath),
          '--output-root',
          path.basename(oversizedOutputRoot),
        ],
      );
      assert.notEqual(oversizedExecution.status, 0);
      assert.match(oversizedExecution.stderr, /decoded-image boundary/u);
      await assert.rejects(access(oversizedOutputRoot), (error) => error?.code === 'ENOENT');
    }

    const replay = run(
      python.command,
      [
        ...python.prefix,
        path.join(root, 'tools', 'run_project_art_sandbox.py'),
        '--workspace-root',
        workspace,
        '--plan',
        path.basename(planPath),
        '--output-root',
        path.basename(outputRoot),
      ],
    );
    assert.notEqual(replay.status, 0);
    assert.match(replay.stderr, /must not already exist/u);

    const tamperPlan = await compileProjectArtSandbox({
      workspaceRoot: workspace,
      request: {
        ...sandboxRequest,
        sandboxId: 'tamper-sandbox',
      },
      requestBytes: Buffer.from('tamper-plan'),
      registry,
      registryBytes,
      compiledAt: fixedTime,
    });
    const tamperPlanPath = path.join(workspace, 'tamper-plan.json');
    await writeJsonCreateOnly(tamperPlanPath, tamperPlan);
    const heroBytesBeforeTamper = await readFile(path.join(workspace, 'art', 'hero.png'));
    await writeFile(path.join(workspace, 'art', 'hero.png'), Buffer.concat([heroBytesBeforeTamper, Buffer.from('tamper')]));
    const tamperOutput = path.join(workspace, 'tamper-output');
    const tampered = run(
      python.command,
      [
        ...python.prefix,
        path.join(root, 'tools', 'run_project_art_sandbox.py'),
        '--workspace-root',
        workspace,
        '--plan',
        path.basename(tamperPlanPath),
        '--output-root',
        path.basename(tamperOutput),
      ],
    );
    assert.notEqual(tampered.status, 0);
    await assert.rejects(access(tamperOutput));
    await writeFile(path.join(workspace, 'art', 'hero.png'), heroBytesBeforeTamper);

    const providerDist = path.join(root, 'packages', 'providers', 'dist', 'index.js');
    const artifactDist = path.join(root, 'packages', 'artifacts', 'dist', 'index.js');
    if (process.env.PROJECT_ART_REQUIRE_PROVIDER_VALIDATION === '1') {
      await access(providerDist);
      await access(artifactDist);
      const currentUnboundPlan = await compileReferenceDerivedImagePlan({
        workspaceRoot: workspace,
        request: referenceRequest,
        requestBytes: referenceBytes,
        compiledAt: fixedTime,
      });
      const initialPlanPath = path.join(workspace, 'reference-plan-unbound.json');
      await writeJsonCreateOnly(initialPlanPath, currentUnboundPlan);
      const artifactRoot = path.join(fixtureRoot, 'artifacts');
      const bindingsPath = path.join(workspace, 'staged-bindings.json');
      const staged = run(process.execPath, [
        path.join(root, 'scripts', 'stage-reference-derived-artifacts.mjs'),
        '--workspace-root',
        workspace,
        '--plan',
        initialPlanPath,
        '--artifact-root',
        artifactRoot,
        '--output',
        bindingsPath,
      ]);
      assert.equal(staged.status, 0, staged.stderr || staged.stdout);
      const stagedBindings = JSON.parse(await readFile(bindingsPath, 'utf8'));
      verifyDocumentHash(stagedBindings);
      assert.equal(stagedBindings.bindings.length, 3);
      const stagedBoundPlan = await compileReferenceDerivedImagePlan({
        workspaceRoot: workspace,
        request: referenceRequest,
        requestBytes: referenceBytes,
        bindings: stagedBindings,
        bindingsBytes: await readFile(bindingsPath),
        compiledAt: fixedTime,
      });
      assert.equal(stagedBoundPlan.providerCompilable, true);
      const providers = await import(pathToFileURL(providerDist).href);
      const normalized = providers.validateProviderCandidateRequest(stagedBoundPlan.providerRequest);
      assert.equal(normalized.continuityPhase, 'in-between');
      assert.equal(normalized.references.length, 3);
      assert.equal(normalized.target.outputFormat, 'png');
    }
  }

  console.log('EVAVO project-art workbench regressions passed');
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}
