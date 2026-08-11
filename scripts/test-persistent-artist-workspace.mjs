#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFile,
  link,
  lstat,
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

import { canonicalJson, sha256, verifyDocumentHash } from './project-art/common.mjs';

function run(executable, args, { expectFailure = false } = {}) {
  const result = spawnSync(executable, args, {
    cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      PYTHONPYCACHEPREFIX: path.join(os.tmpdir(), 'evavo-persistent-workspace-pycache'),
    },
  });
  if (expectFailure) {
    assert.notEqual(result.status, 0, `Expected failure: ${executable} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
    return result;
  }
  assert.equal(result.status, 0, `${executable} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result;
}

function parseSummary(result) {
  const lines = result.stdout.trim().split(/\r?\n/u).filter(Boolean);
  return JSON.parse(lines.at(-1));
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
    throw new Error('PROJECT_ART_REQUIRE_PILLOW=1 but no Python 3 executable with Pillow was found for the Persistent Artist Workspace.');
  }
  return null;
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const python = pythonCommand();
if (!python) {
  console.log('Persistent Artist Workspace runtime regressions skipped: Pillow unavailable; the dedicated Project Art workflow requires the exact backend.');
  process.exit(0);
}
const temporary = await mkdtemp(path.join(os.tmpdir(), 'evavo-persistent-artist-workspace-'));
try {
  const parent = path.join(temporary, 'workspaces');
  await mkdir(parent);
  const createRequestPath = path.join(temporary, 'create-request.json');
  const createPlanPath = path.join(temporary, 'create-plan.json');
  const createRequest = {
    schema: 'evavo.persistent-artist-workspace-create-request.v1',
    workspaceId: 'battle-chess-art-v1',
    projectId: 'battle-chess',
    title: 'Battle Chess Artist Workspace',
    purpose: 'Persistent source, working, review, mastering and export workspace.',
    createdBy: 'chatgpt-test',
    tags: ['battle-chess', 'sprites'],
    storage: {
      enabled: true,
      vaultId: 'art',
      logicalPrefix: 'Projects/BattleChess/Art',
      tags: ['game-art'],
    },
  };
  const createBytes = Buffer.from(`${JSON.stringify(createRequest, null, 2)}\n`);
  await writeFile(createRequestPath, createBytes);
  const compileCreate = run(process.execPath, [
    'scripts/persistent-artist-workspace.mjs',
    'compile-create',
    '--parent-root',
    parent,
    '--request',
    createRequestPath,
    '--output',
    createPlanPath,
    '--compiled-at',
    '2026-08-11T09:00:00.000Z',
  ]);
  const createSummary = parseSummary(compileCreate);
  assert.equal(createSummary.workspaceId, 'battle-chess-art-v1');
  const createPlan = JSON.parse(await readFile(createPlanPath, 'utf8'));
  verifyDocumentHash(createPlan);
  assert.equal(createPlan.requestSha256, sha256(createBytes));
  assert.equal(createPlan.authority.storageWrite, false);
  assert.equal(createPlan.authority.targetRepositoryMutation, false);


  if (process.platform !== 'win32') {
    const requestSymlinkPath = path.join(temporary, 'create-request-symlink.json');
    await symlink(createRequestPath, requestSymlinkPath);
    const requestSymlink = run(process.execPath, [
      'scripts/persistent-artist-workspace.mjs',
      'compile-create',
      '--parent-root',
      parent,
      '--request',
      requestSymlinkPath,
      '--output',
      path.join(temporary, 'request-symlink-plan.json'),
    ], { expectFailure: true });
    assert.match(`${requestSymlink.stderr}\n${requestSymlink.stdout}`, /regular non-symbolic file/iu);

    const requestHardLinkPath = path.join(temporary, 'create-request-hardlink.json');
    await link(createRequestPath, requestHardLinkPath);
    const requestHardLink = run(process.execPath, [
      'scripts/persistent-artist-workspace.mjs',
      'compile-create',
      '--parent-root',
      parent,
      '--request',
      requestHardLinkPath,
      '--output',
      path.join(temporary, 'request-hardlink-plan.json'),
    ], { expectFailure: true });
    assert.match(`${requestHardLink.stderr}\n${requestHardLink.stdout}`, /exactly one filesystem link/iu);
    await rm(requestHardLinkPath);

    const planSymlinkPath = path.join(temporary, 'create-plan-symlink.json');
    await symlink(createPlanPath, planSymlinkPath);
    const planSymlink = run(process.execPath, [
      'scripts/persistent-artist-workspace.mjs',
      'run-create',
      '--plan',
      planSymlinkPath,
    ], { expectFailure: true });
    assert.match(`${planSymlink.stderr}\n${planSymlink.stdout}`, /regular non-symbolic file/iu);

    const planHardLinkPath = path.join(temporary, 'create-plan-hardlink.json');
    await link(createPlanPath, planHardLinkPath);
    const planHardLink = run(process.execPath, [
      'scripts/persistent-artist-workspace.mjs',
      'run-create',
      '--plan',
      planHardLinkPath,
    ], { expectFailure: true });
    assert.match(`${planHardLink.stderr}\n${planHardLink.stdout}`, /exactly one filesystem link/iu);
    await rm(planHardLinkPath);
  }

  const runCreate = run(process.execPath, [
    'scripts/persistent-artist-workspace.mjs',
    'run-create',
    '--plan',
    createPlanPath,
  ]);
  const createReceiptSummary = parseSummary(runCreate);
  const workspace = createReceiptSummary.workspaceRoot;
  const manifest = JSON.parse(await readFile(path.join(workspace, 'manifests', 'workspace.json'), 'utf8'));
  verifyDocumentHash(manifest);
  assert.equal(manifest.policy.immutableSources, true);
  assert.equal(manifest.policy.appendOnlyVersions, true);
  assert.equal(manifest.storage.storageWrite, false);
  for (const relative of ['sources', 'working', 'versions', 'masks', 'scratch', 'review', 'masters', 'exports', 'manifests/storage-handoffs', 'journals']) {
    assert.equal((await lstat(path.join(workspace, ...relative.split('/')))).isDirectory(), true);
  }
  run(process.execPath, [
    'scripts/persistent-artist-workspace.mjs',
    'run-create',
    '--plan',
    createPlanPath,
  ], { expectFailure: true });

  const workingDir = path.join(workspace, 'working', 'characters', 'white-king', 'idle');
  await mkdir(workingDir, { recursive: true });
  const workingImage = path.join(workingDir, 'white-king-idle-0001.png');
  const fixture = [
    'from PIL import Image, ImageDraw',
    'from pathlib import Path',
    `target = Path(${JSON.stringify(workingImage)})`,
    "image = Image.new('RGBA', (32, 40), (0, 0, 0, 0))",
    'draw = ImageDraw.Draw(image)',
    'draw.rectangle((8, 8, 23, 35), fill=(230, 215, 190, 255))',
    'draw.rectangle((6, 20, 25, 30), fill=(100, 40, 50, 255))',
    'image.save(target)',
  ].join('\n');
  run(python.name, [...python.prefix, '-c', fixture]);
  const sourceBytes = await readFile(workingImage);
  const sourceSha256 = sha256(sourceBytes);

  const snapshotRequestPath = path.join(temporary, 'snapshot-request.json');
  const snapshotPlanPath = path.join(temporary, 'snapshot-plan.json');
  const snapshotRequest = {
    schema: 'evavo.persistent-artist-workspace-snapshot-request.v1',
    workspaceId: 'battle-chess-art-v1',
    assetId: 'white-king-idle-0001',
    versionId: 'v001-clean-alpha',
    sourcePath: 'working/characters/white-king/idle/white-king-idle-0001.png',
    expectedSha256: sourceSha256,
    role: 'sprite-frame-working-version',
    note: 'First exact clean-alpha working snapshot.',
    createdBy: 'chatgpt-test',
    tags: ['white-king', 'idle', 'alpha-clean'],
  };
  const snapshotBytes = Buffer.from(`${JSON.stringify(snapshotRequest, null, 2)}\n`);
  await writeFile(snapshotRequestPath, snapshotBytes);
  run(process.execPath, [
    'scripts/persistent-artist-workspace.mjs',
    'compile-snapshot',
    '--workspace-root',
    workspace,
    '--request',
    snapshotRequestPath,
    '--output',
    snapshotPlanPath,
    '--compiled-at',
    '2026-08-11T09:01:00.000Z',
  ]);
  const snapshotPlan = JSON.parse(await readFile(snapshotPlanPath, 'utf8'));
  verifyDocumentHash(snapshotPlan);
  assert.equal(snapshotPlan.source.sha256, sourceSha256);
  const snapshotRun = run(process.execPath, [
    'scripts/persistent-artist-workspace.mjs',
    'run-snapshot',
    '--workspace-root',
    workspace,
    '--plan',
    snapshotPlanPath,
  ]);
  const snapshotSummary = parseSummary(snapshotRun);
  const versionFile = path.join(workspace, ...snapshotSummary.versionPath.split('/'));
  assert.deepEqual(await readFile(versionFile), sourceBytes);
  const versionDirectory = path.dirname(versionFile);
  const versionDocument = JSON.parse(await readFile(path.join(versionDirectory, 'version.json'), 'utf8'));
  const snapshotReceipt = JSON.parse(await readFile(path.join(versionDirectory, 'receipt.json'), 'utf8'));
  verifyDocumentHash(versionDocument);
  verifyDocumentHash(snapshotReceipt);
  assert.equal(snapshotReceipt.byteExact, true);
  assert.equal(snapshotReceipt.sourceMutation, false);
  assert.deepEqual(await readFile(workingImage), sourceBytes);
  run(process.execPath, [
    'scripts/persistent-artist-workspace.mjs',
    'run-snapshot',
    '--workspace-root',
    workspace,
    '--plan',
    snapshotPlanPath,
  ], { expectFailure: true });


  if (process.platform !== 'win32') {
    const lateRequestPath = path.join(temporary, 'late-link-snapshot-request.json');
    const latePlanPath = path.join(temporary, 'late-link-snapshot-plan.json');
    const lateRequest = {
      ...snapshotRequest,
      assetId: 'late-link',
      versionId: 'v001',
    };
    await writeFile(lateRequestPath, `${JSON.stringify(lateRequest, null, 2)}\n`);
    run(process.execPath, [
      'scripts/persistent-artist-workspace.mjs',
      'compile-snapshot',
      '--workspace-root',
      workspace,
      '--request',
      lateRequestPath,
      '--output',
      latePlanPath,
    ]);
    const outsideVersions = path.join(temporary, 'outside-versions');
    await mkdir(outsideVersions);
    await symlink(outsideVersions, path.join(workspace, 'versions', 'late-link'), 'dir');
    const lateRun = run(process.execPath, [
      'scripts/persistent-artist-workspace.mjs',
      'run-snapshot',
      '--workspace-root',
      workspace,
      '--plan',
      latePlanPath,
    ], { expectFailure: true });
    assert.match(`${lateRun.stderr}\n${lateRun.stdout}`, /symbolic or non-directory component/iu);
    await assert.rejects(
      lstat(path.join(outsideVersions, 'v001')),
      (error) => error?.code === 'ENOENT',
    );
  }

  const handoffRequestPath = path.join(temporary, 'handoff-request.json');
  const handoffOutput = path.join(workspace, 'manifests', 'storage-handoffs', 'battle-chess-master-v1.json');
  const handoffRequest = {
    schema: 'evavo.persistent-artist-workspace-storage-handoff-request.v1',
    workspaceId: 'battle-chess-art-v1',
    handoffId: 'battle-chess-master-v1',
    vaultId: 'art',
    logicalPrefix: 'Projects/BattleChess/Art',
    tags: ['battle-chess', 'reviewed'],
    items: [
      {
        assetId: 'white-king-idle-0001-v001',
        path: snapshotSummary.versionPath,
        logicalPath: 'characters/white-king/idle/white-king-idle-0001.png',
        expectedSha256: sourceSha256,
        title: 'White King idle frame 0001 clean alpha',
        role: 'sprite-frame-master-source',
        tags: ['white-king', 'idle'],
      },
    ],
  };
  const handoffBytes = Buffer.from(`${JSON.stringify(handoffRequest, null, 2)}\n`);
  await writeFile(handoffRequestPath, handoffBytes);
  const handoffRun = run(process.execPath, [
    'scripts/persistent-artist-workspace.mjs',
    'storage-handoff',
    '--workspace-root',
    workspace,
    '--request',
    handoffRequestPath,
    '--output',
    handoffOutput,
    '--compiled-at',
    '2026-08-11T09:02:00.000Z',
  ]);
  const handoffSummary = parseSummary(handoffRun);
  assert.equal(handoffSummary.itemCount, 1);
  const handoff = JSON.parse(await readFile(handoffOutput, 'utf8'));
  verifyDocumentHash(handoff, 'requestSha256');
  assert.equal(handoff.schema, 'evavo.storage-art-ingest-request.v1');
  assert.equal(handoff.items[0].sha256, sourceSha256);
  assert.equal(handoff.authority.storageWrite, false);
  assert.equal(handoff.bytesFlowThroughMcp, false);
  run(process.execPath, [
    'scripts/persistent-artist-workspace.mjs',
    'storage-handoff',
    '--workspace-root',
    workspace,
    '--request',
    handoffRequestPath,
    '--output',
    handoffOutput,
  ], { expectFailure: true });

  const mismatchedRequestPath = path.join(temporary, 'mismatched-snapshot-request.json');
  await writeFile(mismatchedRequestPath, `${JSON.stringify({ ...snapshotRequest, expectedSha256: '0'.repeat(64), versionId: 'v002-bad' }, null, 2)}\n`);
  run(process.execPath, [
    'scripts/persistent-artist-workspace.mjs',
    'compile-snapshot',
    '--workspace-root',
    workspace,
    '--request',
    mismatchedRequestPath,
    '--output',
    path.join(temporary, 'mismatched-plan.json'),
  ], { expectFailure: true });

  const tamperedPlanPath = path.join(temporary, 'tampered-snapshot-plan.json');
  const tamperedPlan = structuredClone(snapshotPlan);
  tamperedPlan.source.sha256 = '0'.repeat(64);
  delete tamperedPlan.documentSha256;
  tamperedPlan.documentSha256 = sha256(canonicalJson(tamperedPlan));
  await writeFile(tamperedPlanPath, `${JSON.stringify(tamperedPlan, null, 2)}\n`);
  run(process.execPath, [
    'scripts/persistent-artist-workspace.mjs',
    'run-snapshot',
    '--workspace-root',
    workspace,
    '--plan',
    tamperedPlanPath,
  ], { expectFailure: true });

  if (process.platform !== 'win32') {
    const linked = path.join(workspace, 'working', 'linked.png');
    await symlink(workingImage, linked);
    const linkedRequest = {
      ...snapshotRequest,
      versionId: 'v003-linked',
      sourcePath: 'working/linked.png',
    };
    const linkedRequestPath = path.join(temporary, 'linked-request.json');
    await writeFile(linkedRequestPath, `${JSON.stringify(linkedRequest, null, 2)}\n`);
    run(process.execPath, [
      'scripts/persistent-artist-workspace.mjs',
      'compile-snapshot',
      '--workspace-root',
      workspace,
      '--request',
      linkedRequestPath,
      '--output',
      path.join(temporary, 'linked-plan.json'),
    ], { expectFailure: true });
  }

  const outside = path.join(temporary, 'outside.png');
  await copyFile(workingImage, outside);
  const escapeRequestPath = path.join(temporary, 'escape-request.json');
  await writeFile(escapeRequestPath, `${JSON.stringify({ ...snapshotRequest, versionId: 'v004-escape', sourcePath: '../outside.png' }, null, 2)}\n`);
  run(process.execPath, [
    'scripts/persistent-artist-workspace.mjs',
    'compile-snapshot',
    '--workspace-root',
    workspace,
    '--request',
    escapeRequestPath,
    '--output',
    path.join(temporary, 'escape-plan.json'),
  ], { expectFailure: true });

  console.log('Persistent Artist Workspace regressions passed.');
  console.log('- create-only persistent workspace layout and immutable manifest');
  console.log('- append-only exact snapshots with source revalidation and atomic publication');
  console.log('- exact EVAVO Storage handoff with storageWrite=false');
  console.log('- duplicate, tampered, escaped and symbolic requests fail closed');
  console.log('- symbolic and multiply-linked request/plan inputs fail closed');
  console.log('- nested version symlinks cannot redirect append-only writes outside the workspace');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
