#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  canonicalJson,
  sha256,
  verifyDocumentHash,
} from './project-art/common.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONPYCACHEPREFIX: path.join(os.tmpdir(), 'evavo-mastering-motion-pycache'),
      PROJECT_ART_REQUIRE_PILLOW: '1',
    },
  });
  if (options.expectFailure) {
    assert.notEqual(result.status, 0, `Expected failure: ${commandName} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  } else {
    assert.equal(result.status, 0, `${commandName} ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function pythonCommand() {
  const candidates = process.platform === 'win32'
    ? [['py', ['-3']], ['python', []], ['python3', []]]
    : [['python', []], ['python3', []], ['py', ['-3']]];
  for (const [name, prefix] of candidates) {
    const result = spawnSync(name, [...prefix, '-c', 'import PIL,sys;print(sys.version_info[0])'], {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    });
    if (result.status === 0 && result.stdout.trim() === '3') return { name, prefix };
  }
  if (process.env.PROJECT_ART_REQUIRE_PILLOW === '1') {
    throw new Error('PROJECT_ART_REQUIRE_PILLOW=1 but no Python 3 executable with Pillow was found.');
  }
  return null;
}

function rehash(document) {
  const result = structuredClone(document);
  delete result.documentSha256;
  result.documentSha256 = sha256(canonicalJson(result));
  return result;
}

const python = pythonCommand();
if (!python) {
  console.log('Project Art mastering and motion runtime regressions skipped: Pillow unavailable; the dedicated Project Art workflow requires the exact backend.');
  process.exit(0);
}

const temporary = await mkdtemp(path.join(os.tmpdir(), 'evavo-project-art-mastering-motion-'));
const workspace = path.join(temporary, 'workspace');
await mkdir(workspace, { recursive: true });

try {
  const source = path.join(workspace, 'source.png');
  const mask = path.join(workspace, 'mask.png');
  const fixture = `
from PIL import Image, ImageDraw
from pathlib import Path
source = Path(${JSON.stringify(source)})
mask = Path(${JSON.stringify(mask)})
image = Image.new('RGBA', (48, 48), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.ellipse((8, 4, 39, 43), fill=(180, 72, 84, 255))
draw.rectangle((17, 12, 30, 35), fill=(235, 214, 180, 255))
draw.rectangle((11, 31, 36, 42), fill=(54, 40, 70, 255))
image.save(source)
matte = Image.new('RGBA', (48, 48), (0, 0, 0, 0))
matte_draw = ImageDraw.Draw(matte)
matte_draw.ellipse((5, 2, 42, 45), fill=(255, 255, 255, 255))
matte.save(mask)
`;
  command(python.name, [...python.prefix, '-c', fixture]);

  const requestPath = path.join(workspace, 'master-motion-request.json');
  const planPath = path.join(workspace, 'master-motion-plan.json');
  const outputRoot = path.join(workspace, 'master-motion-output');
  const identityCurve = [[0, 0], [64, 60], [192, 200], [255, 255]];
  const request = {
    schema: 'evavo.project-art-sandbox-request.v1',
    sandboxId: 'mastering-motion-regression-v1',
    projectId: 'artist-workspace-regression',
    purpose: 'Exercise deterministic professional mastering and keyframed motion.',
    tasks: [
      {
        id: 'master-sprite',
        kind: 'image-master',
        source: 'source.png',
        targetPath: 'masters/source-master.png',
        reportPath: 'masters/source-master.mastering.json',
        outputFormat: 'png',
        operations: [
          { op: 'rotate', angle: 7.5, expand: false, sampling: 'bicubic' },
          { op: 'affine-transform', matrix: [1, 0, 0, 0, 1, 0], sampling: 'bicubic' },
          { op: 'perspective-transform', coefficients: [1, 0, 0, 0, 1, 0, 0, 0], sampling: 'bicubic' },
          { op: 'hue-shift', degrees: 12 },
          { op: 'curves', channels: { master: identityCurve } },
          { op: 'channel-mixer', red: [1, 0, 0], green: [0, 1, 0], blue: [0, 0, 1] },
          { op: 'gamma', gamma: 1.05 },
          { op: 'box-blur', radius: 0.2 },
          { op: 'median-filter', size: 3 },
          { op: 'motion-blur', radius: 1.5, angle: 15, samples: 5 },
          { op: 'emboss', blend: 0.05 },
          { op: 'find-edges', blend: 0.03 },
          { op: 'edge-enhance', blend: 0.2 },
          { op: 'alpha-feather', radius: 0.4 },
          { op: 'defringe', radius: 1, maximumAlpha: 254, strength: 0.25 },
          { op: 'drop-shadow', offsetX: 2, offsetY: 2, radius: 1.5, opacity: 0.25, expandCanvas: false },
          { op: 'outer-glow', radius: 1, spread: 0, opacity: 0.1, colour: '#ffffff', expandCanvas: false },
        ],
        profile: {
          name: 'transparent-sprite-master',
          enforce: true,
          exactWidth: 48,
          exactHeight: 48,
          alphaMode: 'required',
          maximumTransparentRgbFraction: 1,
          maximumSemiTransparentFraction: 0.5,
          minimumOpaqueFraction: 0.05,
          maximumUniqueColours: 100000,
          maximumShadowClippingFraction: 1,
          maximumHighlightClippingFraction: 1,
          minimumLuminanceSpan: 5,
          maximumEdgeMatteFraction: 1,
        },
      },
      {
        id: 'motion-preview',
        kind: 'motion-sequence',
        sources: [
          { taskId: 'master-sprite' },
          'mask.png',
        ],
        targetDirectory: 'motion/idle-preview',
        frameCount: 5,
        fps: 12,
        canvas: { width: 80, height: 64, background: '#00000000' },
        layers: [
          {
            sourceIndex: 0,
            maskSourceIndex: 1,
            maskChannel: 'alpha',
            sampling: 'bicubic',
            blendMode: 'normal',
            anchor: { x: 0.5, y: 0.5 },
            keyframes: [
              { frame: 0, x: 24, y: 32, scaleX: 0.9, scaleY: 0.9, rotation: -4, opacity: 0.8, easing: 'ease-in-out' },
              { frame: 2, x: 40, y: 29, scaleX: 1, scaleY: 1, rotation: 2, opacity: 1, easing: 'ease-in-out' },
              { frame: 4, x: 56, y: 32, scaleX: 0.9, scaleY: 0.9, rotation: 4, opacity: 0.8, easing: 'ease-in-out' },
            ],
          },
        ],
        motionBlur: { samples: 3, shutterFraction: 0.5 },
        preview: { animatedGif: true },
      },
    ],
    authority: {
      sourceMutation: false,
      sourceDeletion: false,
      providerExecution: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      publication: false,
      deployment: false,
      forcePush: false,
    },
  };
  await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`);
  command(process.execPath, [
    'scripts/compile-project-art-sandbox.mjs',
    '--workspace-root', workspace,
    '--request', requestPath,
    '--output', planPath,
    '--compiled-at', '2026-08-11T09:10:00.000Z',
  ]);
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  verifyDocumentHash(plan);
  assert.deepEqual(plan.tasks.map((task) => task.kind), ['image-master', 'motion-sequence']);
  assert.equal(plan.limits.plannedMaximumOutputFiles, 10);

  command(python.name, [...python.prefix,
    'tools/run_project_art_sandbox.py',
    '--workspace-root', workspace,
    '--plan', planPath,
    '--output-root', outputRoot,
  ]);
  assert.equal((await lstat(outputRoot)).isDirectory(), true);
  const receipt = JSON.parse(await readFile(path.join(outputRoot, '_evavo', 'project-art-sandbox-receipt.json'), 'utf8'));
  verifyDocumentHash(receipt);
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.tasks.length, 2);

  const masterReport = JSON.parse(await readFile(path.join(outputRoot, 'masters', 'source-master.mastering.json'), 'utf8'));
  verifyDocumentHash(masterReport);
  assert.equal(masterReport.schema, 'evavo.project-art-mastering-report.v1');
  assert.equal(masterReport.status, 'passed');
  assert.equal(masterReport.metrics.dimensions.width, 48);
  assert.ok(masterReport.operations.some((operation) => operation.op === 'defringe'));
  assert.ok(masterReport.operations.some((operation) => operation.op === 'outer-glow'));

  const motionRoot = path.join(outputRoot, 'motion', 'idle-preview');
  const motionManifest = JSON.parse(await readFile(path.join(motionRoot, 'motion-sequence.json'), 'utf8'));
  verifyDocumentHash(motionManifest);
  assert.equal(motionManifest.schema, 'evavo.project-art-motion-sequence.v1');
  assert.equal(motionManifest.frameCount, 5);
  assert.equal(motionManifest.frames.length, 5);
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await lstat(path.join(motionRoot, `frame-${index.toString().padStart(4, '0')}.png`))).isFile(), true);
  }
  assert.equal((await lstat(path.join(motionRoot, 'motion-preview.gif'))).isFile(), true);

  const blockedRequest = structuredClone(request);
  blockedRequest.sandboxId = 'mastering-profile-block-v1';
  blockedRequest.tasks = [structuredClone(request.tasks[0])];
  blockedRequest.tasks[0].profile.exactWidth = 49;
  const blockedRequestPath = path.join(workspace, 'blocked-request.json');
  const blockedPlanPath = path.join(workspace, 'blocked-plan.json');
  const blockedOutputRoot = path.join(workspace, 'blocked-output');
  await writeFile(blockedRequestPath, `${JSON.stringify(blockedRequest, null, 2)}\n`);
  command(process.execPath, [
    'scripts/compile-project-art-sandbox.mjs',
    '--workspace-root', workspace,
    '--request', blockedRequestPath,
    '--output', blockedPlanPath,
  ]);
  const blockedResult = command(python.name, [...python.prefix,
    'tools/run_project_art_sandbox.py',
    '--workspace-root', workspace,
    '--plan', blockedPlanPath,
    '--output-root', blockedOutputRoot,
  ], { expectFailure: true });
  assert.match(`${blockedResult.stdout}
${blockedResult.stderr}`, /PROJECT_ART_MASTERING_PROFILE_FAILED/u);
  await assert.rejects(lstat(blockedOutputRoot));

  const tamperedPlan = structuredClone(plan);
  tamperedPlan.tasks[1].frameCount = 20_001;
  const tamperedPlanPath = path.join(workspace, 'tampered-plan.json');
  await writeFile(tamperedPlanPath, `${JSON.stringify(rehash(tamperedPlan), null, 2)}\n`);
  const tamperedOutputRoot = path.join(workspace, 'tampered-output');
  command(python.name, [...python.prefix,
    'tools/run_project_art_sandbox.py',
    '--workspace-root', workspace,
    '--plan', tamperedPlanPath,
    '--output-root', tamperedOutputRoot,
  ], { expectFailure: true });
  await assert.rejects(lstat(tamperedOutputRoot));

  const badCurve = structuredClone(request);
  badCurve.sandboxId = 'bad-curve-v1';
  badCurve.tasks = [structuredClone(request.tasks[0])];
  badCurve.tasks[0].operations = [{ op: 'curves', channels: { red: [[10, 0], [255, 255]] } }];
  const badCurvePath = path.join(workspace, 'bad-curve.json');
  await writeFile(badCurvePath, `${JSON.stringify(badCurve, null, 2)}\n`);
  command(process.execPath, [
    'scripts/compile-project-art-sandbox.mjs',
    '--workspace-root', workspace,
    '--request', badCurvePath,
    '--output', path.join(workspace, 'bad-curve-plan.json'),
  ], { expectFailure: true });

  console.log('Project Art mastering and motion regressions passed.');
  console.log('- professional geometry, colour, filter, alpha and layer-effect operations execute deterministically');
  console.log('- image-master emits an exact self-hashed mastering report and enforces release profiles');
  console.log('- motion-sequence renders bounded keyframed PNG frames, manifest and GIF evidence');
  console.log('- mastering blockers, malformed curves and correctly rehashed output-count attacks fail closed');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
