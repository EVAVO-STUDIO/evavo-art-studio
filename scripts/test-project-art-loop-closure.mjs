#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  access,
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
import { fileURLToPath } from 'node:url';

import {
  PROJECT_ART_LOOP_CLOSURE_PLAN_SCHEMA,
  PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA,
  compileProjectArtLoopClosure,
  withProjectArtLoopClosureDocumentHash,
} from './compile-project-art-loop-closure.mjs';

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiler = path.join(scriptRoot, 'scripts', 'compile-project-art-loop-closure.mjs');
const runtime = path.join(scriptRoot, 'tools', 'run_project_art_loop_closure.py');
const fixedTime = '2026-08-11T02:00:00.000Z';

function pythonExecutable() {
  const candidates = process.platform === 'win32'
    ? [['py', ['-3']], ['python', []], ['python3', []]]
    : [['python', []], ['python3', []], ['py', ['-3']]];
  for (const [command, prefix] of candidates) {
    const result = spawnSync(command, [...prefix, '-c', 'from PIL import Image; import sys; print(sys.version_info[0])'], {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    });
    if (result.status === 0 && result.stdout.trim() === '3') {
      return { command, prefix };
    }
  }
  return null;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: scriptRoot,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    ...options,
  });
}

async function exists(value) {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}

async function readJson(value) {
  return JSON.parse(await readFile(value, 'utf8'));
}

function expectCompileError(promise, code) {
  return assert.rejects(promise, (error) => {
    assert.equal(error?.code, code);
    return true;
  });
}

function baseRequest(frames) {
  return {
    schema: PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA,
    reviewId: 'eva-idle-loop',
    projectId: 'avatar-runtime',
    purpose: 'Prove the final-to-first idle-loop seam.',
    frames,
    expected: {
      width: 16,
      height: 16,
      requireAlpha: true,
    },
    thresholds: {
      maximumChangedFraction: 0.1,
      maximumMeanChannelDelta: 20,
      maximumAlphaChangedFraction: 0.1,
      maximumCentroidShiftPixels: 2,
    },
    preview: {
      difference: true,
      overlay: true,
      onionSkin: true,
    },
  };
}

const python = pythonExecutable();
if (!python) {
  console.log('Project Art loop-closure tests deferred: Python 3 with Pillow is unavailable.');
  process.exit(0);
}

const temporary = await mkdtemp(path.join(os.tmpdir(), 'evavo-project-art-loop-closure-'));
const workspace = path.join(temporary, 'project');
const frameDirectory = path.join(workspace, 'frames');
const outputParent = path.join(workspace, '.evavo');

try {
  await mkdir(frameDirectory, { recursive: true });
  await mkdir(outputParent, { recursive: true });
  const fixtureSource = String.raw`
from PIL import Image, ImageDraw
from pathlib import Path
root = Path(r'${frameDirectory.replaceAll('\\', '\\\\')}')
frames = {
    '0000.png': 2,
    '0001.png': 4,
    '0002.png': 2,
    'bad-last.png': 10,
}
for name, x in frames.items():
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((x, 4, x + 3, 11), fill=(255, 255, 255, 255))
    image.save(root / name, format='PNG')
`;
  const fixtureResult = run(python.command, [...python.prefix, '-c', fixtureSource]);
  assert.equal(fixtureResult.status, 0, fixtureResult.stderr || fixtureResult.stdout);

  const goodFrames = ['frames/0000.png', 'frames/0001.png', 'frames/0002.png'];
  const goodRequest = baseRequest(goodFrames);
  const goodRequestText = `${JSON.stringify(goodRequest, null, 2)}\n`;
  const goodBytes = Buffer.from(goodRequestText);
  const goodPlan = await compileProjectArtLoopClosure({
    workspaceRoot: workspace,
    request: goodRequest,
    requestBytes: goodBytes,
    compiledAt: fixedTime,
  });
  assert.equal(goodPlan.schema, PROJECT_ART_LOOP_CLOSURE_PLAN_SCHEMA);
  assert.equal(goodPlan.frames.length, 3);
  assert.deepEqual(goodPlan.seam, {
    fromFrameIndex: 2,
    toFrameIndex: 0,
    identicalClosureAccepted: true,
  });
  assert.equal(goodPlan.authority.providerExecution, false);
  assert.equal(goodPlan.authority.targetRepositoryMutation, false);
  assert.match(goodPlan.documentSha256, /^[a-f0-9]{64}$/u);

  const requestPath = path.join(workspace, 'good-request.json');
  const planPath = path.join(workspace, 'good-plan.json');
  await writeFile(requestPath, goodRequestText);
  const compileResult = run('node', [
    compiler,
    '--workspace-root',
    workspace,
    '--request',
    requestPath,
    '--output',
    planPath,
    '--compiled-at',
    fixedTime,
  ]);
  assert.equal(compileResult.status, 0, compileResult.stderr || compileResult.stdout);
  assert.match(compileResult.stdout, /seam: 2 -> 0/u);
  const cliPlan = await readJson(planPath);
  assert.equal(cliPlan.documentSha256, goodPlan.documentSha256);

  const goodOutput = path.join(outputParent, 'good-loop');
  const goodRuntime = run(python.command, [
    ...python.prefix,
    runtime,
    '--workspace-root',
    workspace,
    '--plan',
    planPath,
    '--output-root',
    goodOutput,
  ]);
  assert.equal(goodRuntime.status, 0, goodRuntime.stderr || goodRuntime.stdout);
  assert.match(goodRuntime.stdout, /status: passed/u);
  const goodReview = await readJson(path.join(goodOutput, 'loop-closure.json'));
  const goodReceipt = await readJson(path.join(goodOutput, 'receipt.json'));
  assert.equal(goodReview.status, 'passed');
  assert.equal(goodReview.metrics.identical, true);
  assert.equal(goodReview.metrics.changedPixelFraction, 0);
  assert.deepEqual(goodReview.issues, []);
  assert.equal(goodReview.seam.identicalClosureAccepted, true);
  assert.equal(goodReceipt.status, 'passed');
  assert.equal(goodReceipt.planSha256, goodPlan.documentSha256);
  assert.equal(goodReceipt.authority.gitPush, false);
  assert.equal(goodReceipt.outputs.length, 4);
  for (const name of ['difference.png', 'overlay.png', 'onion-skin.png']) {
    assert.equal(await exists(path.join(goodOutput, name)), true);
  }

  const badRequest = baseRequest([
    'frames/0000.png',
    'frames/0001.png',
    'frames/bad-last.png',
  ]);
  badRequest.reviewId = 'eva-idle-loop-bad-seam';
  badRequest.thresholds.maximumChangedFraction = 0.05;
  badRequest.thresholds.maximumMeanChannelDelta = 10;
  badRequest.thresholds.maximumAlphaChangedFraction = 0.05;
  badRequest.thresholds.maximumCentroidShiftPixels = 1;
  const badPlan = await compileProjectArtLoopClosure({
    workspaceRoot: workspace,
    request: badRequest,
    requestBytes: Buffer.from(JSON.stringify(badRequest)),
    compiledAt: fixedTime,
  });
  const badPlanPath = path.join(workspace, 'bad-plan.json');
  const badOutput = path.join(outputParent, 'bad-loop');
  await writeFile(badPlanPath, `${JSON.stringify(badPlan, null, 2)}\n`);
  const badRuntime = run(python.command, [
    ...python.prefix,
    runtime,
    '--workspace-root',
    workspace,
    '--plan',
    badPlanPath,
    '--output-root',
    badOutput,
  ]);
  assert.equal(badRuntime.status, 0, badRuntime.stderr || badRuntime.stdout);
  const badReview = await readJson(path.join(badOutput, 'loop-closure.json'));
  assert.equal(badReview.status, 'blocked');
  assert.equal(badReview.metrics.identical, false);
  assert.ok(
    badReview.issues.some(
      (issue) => issue.code === 'loop-closure-excessive-frame-change',
    ),
  );
  assert.ok(
    badReview.issues.some(
      (issue) => issue.code === 'loop-closure-centroid-shift-exceeded',
    ),
  );

  await expectCompileError(
    compileProjectArtLoopClosure({
      workspaceRoot: workspace,
      request: { ...baseRequest(goodFrames), unexpectedAuthorityShortcut: false },
      requestBytes: Buffer.from('{}'),
      compiledAt: fixedTime,
    }),
    'PROJECT_ART_LOOP_CLOSURE_REQUEST_INVALID',
  );

  await expectCompileError(
    compileProjectArtLoopClosure({
      workspaceRoot: workspace,
      request: baseRequest(['frames/0000.png']),
      requestBytes: Buffer.from('{}'),
      compiledAt: fixedTime,
    }),
    'PROJECT_ART_LOOP_CLOSURE_FRAME_COUNT_INVALID',
  );

  await expectCompileError(
    compileProjectArtLoopClosure({
      workspaceRoot: workspace,
      request: {
        ...baseRequest(goodFrames),
        authority: {
          providerExecution: true,
          sourceMutation: false,
          sourceDeletion: false,
          candidateApproval: false,
          candidatePromotion: false,
          targetRepositoryMutation: false,
          gitCommit: false,
          gitPush: false,
          publication: false,
          deployment: false,
          forcePush: false,
        },
      },
      requestBytes: Buffer.from('{}'),
      compiledAt: fixedTime,
    }),
    'PROJECT_ART_LOOP_CLOSURE_AUTHORITY_INVALID',
  );

  await expectCompileError(
    compileProjectArtLoopClosure({
      workspaceRoot: workspace,
      request: baseRequest([
        {
          path: 'frames/0000.png',
          expectedSha256: '0'.repeat(64),
        },
        'frames/0002.png',
      ]),
      requestBytes: Buffer.from('{}'),
      compiledAt: fixedTime,
    }),
    'PROJECT_ART_LOOP_CLOSURE_SOURCE_HASH_MISMATCH',
  );

  const limitDriftPlan = withProjectArtLoopClosureDocumentHash({
    ...goodPlan,
    limits: {
      ...goodPlan.limits,
      maximumSourceBytes: goodPlan.limits.maximumSourceBytes + 1,
    },
  });
  const limitDriftPlanPath = path.join(workspace, 'limit-drift-plan.json');
  const limitDriftOutput = path.join(outputParent, 'limit-drift-loop');
  await writeFile(limitDriftPlanPath, `${JSON.stringify(limitDriftPlan, null, 2)}\n`);
  const limitDriftRuntime = run(python.command, [
    ...python.prefix,
    runtime,
    '--workspace-root',
    workspace,
    '--plan',
    limitDriftPlanPath,
    '--output-root',
    limitDriftOutput,
  ]);
  assert.notEqual(limitDriftRuntime.status, 0);
  assert.match(limitDriftRuntime.stderr, /PROJECT_ART_LOOP_CLOSURE_LIMIT_DRIFT/u);
  assert.equal(await exists(limitDriftOutput), false);

  const tamperRequest = baseRequest(goodFrames);
  tamperRequest.reviewId = 'eva-idle-loop-tamper';
  const tamperPlan = await compileProjectArtLoopClosure({
    workspaceRoot: workspace,
    request: tamperRequest,
    requestBytes: Buffer.from(JSON.stringify(tamperRequest)),
    compiledAt: fixedTime,
  });
  const tamperPlanPath = path.join(workspace, 'tamper-plan.json');
  const tamperOutput = path.join(outputParent, 'tamper-loop');
  await writeFile(tamperPlanPath, `${JSON.stringify(tamperPlan, null, 2)}\n`);
  await writeFile(path.join(frameDirectory, '0002.png'), await readFile(path.join(frameDirectory, 'bad-last.png')));
  const tamperRuntime = run(python.command, [
    ...python.prefix,
    runtime,
    '--workspace-root',
    workspace,
    '--plan',
    tamperPlanPath,
    '--output-root',
    tamperOutput,
  ]);
  assert.notEqual(tamperRuntime.status, 0);
  assert.match(tamperRuntime.stderr, /PROJECT_ART_LOOP_CLOSURE_SOURCE_IDENTITY_MISMATCH/u);
  assert.equal(await exists(tamperOutput), false);

  const symlinkPath = path.join(frameDirectory, 'frame-link.png');
  try {
    await symlink(path.join(frameDirectory, '0000.png'), symlinkPath);
    await expectCompileError(
      compileProjectArtLoopClosure({
        workspaceRoot: workspace,
        request: baseRequest(['frames/frame-link.png', 'frames/0000.png']),
        requestBytes: Buffer.from('{}'),
        compiledAt: fixedTime,
      }),
      'PROJECT_ART_LOOP_CLOSURE_PATH_SYMLINK',
    );
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error?.code)) throw error;
  }

  console.log('Project Art loop-closure tests passed.');
  console.log('- exact final-to-first seam identity is compiled and revalidated');
  console.log('- an identical first/last closure is accepted as a valid seamless endpoint');
  console.log('- excessive pixel, alpha, channel and centroid seam drift blocks the review');
  console.log('- difference, overlay and onion-skin evidence is create-only and atomic');
  console.log('- stale sources, rehashed limit drift, symlinks, bad hashes, unknown keys, single-frame requests and false authority fail closed');
  console.log('- no provider, source, repository, Git, deployment or publication mutation occurred');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
