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
  verifyDocumentHash(sandboxPlan);

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
    assert.equal(receipt.effects.sourceMutation, false);
    verifyDocumentHash(receipt);

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
