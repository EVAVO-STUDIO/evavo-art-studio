#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

import {
  WORKSPACE_INGEST_COMMIT_SCHEMA,
  WORKSPACE_INGEST_PLAN_SCHEMA,
  WORKSPACE_INGEST_PROVENANCE_SCHEMA,
  WORKSPACE_INGEST_RECEIPT_SCHEMA,
  compileWorkspaceIngest,
  loadIngestPlan,
  runWorkspaceIngest,
} from './project-art/persistent-workspace-ingest.mjs';

function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function withHash(value, field = 'documentSha256') {
  const copy = structuredClone(value);
  delete copy[field];
  copy[field] = sha256(canonicalJson(copy));
  return copy;
}

function verifyHash(value, field = 'documentSha256') {
  const expected = value[field];
  const copy = structuredClone(value);
  delete copy[field];
  assert.equal(expected, sha256(canonicalJson(copy)));
}

function onePixelPng(red, green, blue, alpha = 255) {
  // Deterministic 1x1 RGBA PNG assembled from fixed chunks.
  const zlib = Buffer.from([0x78, 0x9c, 0x63, red, green, blue, alpha, 0x00, 0x00, 0x06, 0x00, 0x02]);
  function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const output = Buffer.alloc(12 + data.length);
    output.writeUInt32BE(data.length, 0);
    typeBytes.copy(output, 4);
    data.copy(output, 8);
    output.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
    return output;
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', zlib), chunk('IEND', Buffer.alloc(0))]);
}

async function makeWorkspace(parent, id = 'artist-workspace') {
  const workspace = path.join(parent, id);
  for (const relative of ['sources', 'working', 'versions', 'masks', 'scratch', 'review', 'masters', 'exports', 'manifests', 'manifests/storage-handoffs', 'journals']) {
    await mkdir(path.join(workspace, ...relative.split('/')), { recursive: true });
  }
  const manifest = withHash({
    schema: 'evavo.persistent-artist-workspace-manifest.v1',
    workspaceId: id,
    projectId: 'battle-chess',
    title: 'Battle Chess Artist Workspace',
    purpose: 'Test persistent ingest.',
    createdBy: 'test',
    createdAt: '2026-08-12T00:00:00.000Z',
    workspaceRoot: workspace,
    createPlanSha256: '1'.repeat(64),
    requestSha256: '2'.repeat(64),
    tags: ['battle-chess'],
    paths: {
      immutableSources: 'sources',
      workingCopies: 'working',
      appendOnlyVersions: 'versions',
      masks: 'masks',
      scratch: 'scratch',
      reviewEvidence: 'review',
      masteredAssets: 'masters',
      publishingExports: 'exports',
      manifests: 'manifests',
      storageHandoffs: 'manifests/storage-handoffs',
      journals: 'journals',
    },
    policy: {
      immutableSources: true,
      appendOnlyVersions: true,
      reversibleWorkspaceMutations: true,
      exactSourceHashRequired: true,
      sourceOverwriteAllowed: false,
      sourceDeletionAllowed: false,
      wholeOperationAtomicPublication: true,
      providerOutputIsNeverFinalByDefault: true,
      technicalPassIsNotCreativeApproval: true,
    },
    storage: {
      enabled: true,
      vaultId: 'art',
      logicalPrefix: 'Projects/BattleChess/Art',
      tags: ['game-art'],
      storageWrite: false,
    },
    authority: {
      workspaceCreation: false,
      workspaceSnapshot: false,
      sourceRead: false,
      workspaceWrite: false,
      storageWrite: false,
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
  });
  await writeFile(path.join(workspace, 'manifests', 'workspace.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return workspace;
}

async function expectReject(promise, pattern) {
  await assert.rejects(promise, (error) => {
    assert.match(`${error?.code ?? ''}: ${error?.message ?? error}`, pattern);
    return true;
  });
}

const temporary = await mkdtemp(path.join(os.tmpdir(), 'evavo-persistent-ingest-'));
try {
  const workspace = await makeWorkspace(temporary);
  const sourceRoot = path.join(temporary, 'incoming');
  await mkdir(path.join(sourceRoot, 'chat'), { recursive: true });
  const first = path.join(sourceRoot, 'chat', 'white-king.png');
  const second = path.join(sourceRoot, 'chat', 'black-king.png');
  const clip = path.join(sourceRoot, 'chat', 'turnaround.mov');
  await writeFile(first, onePixelPng(255, 244, 220));
  await writeFile(second, onePixelPng(24, 24, 28));
  await writeFile(clip, Buffer.from('exact-reference-clip-fixture'));
  const firstBytes = await readFile(first);
  const secondBytes = await readFile(second);
  const clipBytes = await readFile(clip);

  const request = {
    schema: 'evavo.persistent-artist-workspace-ingest-request.v1',
    workspaceId: 'artist-workspace',
    ingestId: 'chat-kings-001',
    createdBy: 'chatgpt-test',
    note: 'Import two generated king sprite masters and one exact reference clip.',
    tags: ['battle-chess', 'chat-generated'],
    sourceRoots: [{ id: 'chat-attachments', path: sourceRoot }],
    items: [
      {
        assetId: 'white-king-master',
        sourceRootId: 'chat-attachments',
        sourcePath: 'chat/white-king.png',
        expectedSha256: sha256(firstBytes),
        expectedBytes: firstBytes.length,
        destinationPath: 'characters/kings/white/white-king-master.png',
        title: 'White King master',
        role: 'sprite-master',
        origin: 'chat-generated',
        tags: ['white-king'],
      },
      {
        assetId: 'black-king-master',
        sourceRootId: 'chat-attachments',
        sourcePath: 'chat/black-king.png',
        expectedSha256: sha256(secondBytes),
        expectedBytes: secondBytes.length,
        destinationPath: 'characters/kings/black/black-king-master.png',
        title: 'Black King master',
        role: 'sprite-master',
        origin: 'claude-generated',
        tags: ['black-king'],
      },
      {
        assetId: 'king-turnaround-reference',
        sourceRootId: 'chat-attachments',
        sourcePath: 'chat/turnaround.mov',
        expectedSha256: sha256(clipBytes),
        expectedBytes: clipBytes.length,
        destinationPath: 'characters/kings/reference/turnaround.mov',
        title: 'King turnaround reference clip',
        role: 'video-reference',
        origin: 'owner-supplied',
        tags: ['turnaround', 'video-reference'],
      },
    ],
  };
  const requestBytes = Buffer.from(`${JSON.stringify(request, null, 2)}\n`);
  const planPath = path.join(workspace, 'manifests', 'ingest-plan-chat-kings-001.json');
  const plan = await compileWorkspaceIngest({
    workspaceRoot: workspace,
    request,
    requestBytes,
    outputPath: planPath,
    compiledAt: '2026-08-12T00:05:00.000Z',
  });
  assert.equal(plan.schema, WORKSPACE_INGEST_PLAN_SCHEMA);
  assert.equal(plan.itemCount, 3);
  assert.equal(plan.items.find((item) => item.assetId === 'king-turnaround-reference').mediaType, 'video/quicktime');
  assert.equal(plan.authority.externalSourceRead, true);
  assert.equal(plan.authority.workspaceWrite, true);
  assert.equal(plan.authority.storageWrite, false);
  verifyHash(plan);
  const loadedPlan = await loadIngestPlan(planPath);
  assert.equal(loadedPlan.documentSha256, plan.documentSha256);

  const summary = await runWorkspaceIngest(workspace, plan);
  assert.equal(summary.status, 'passed');
  assert.equal(summary.itemCount, 3);
  assert.equal(summary.sourceMutation, false);
  assert.equal(summary.storageWrite, false);
  assert.deepEqual(await readFile(first), firstBytes);
  assert.deepEqual(await readFile(second), secondBytes);
  assert.deepEqual(await readFile(clip), clipBytes);
  assert.deepEqual(
    await readFile(path.join(workspace, 'sources', 'characters', 'kings', 'white', 'white-king-master.png')),
    firstBytes,
  );
  assert.deepEqual(
    await readFile(path.join(workspace, 'working', 'characters', 'kings', 'white', 'white-king-master.png')),
    firstBytes,
  );
  assert.deepEqual(
    await readFile(path.join(workspace, 'sources', 'characters', 'kings', 'reference', 'turnaround.mov')),
    clipBytes,
  );
  assert.deepEqual(
    await readFile(path.join(workspace, 'working', 'characters', 'kings', 'reference', 'turnaround.mov')),
    clipBytes,
  );
  const provenance = JSON.parse(await readFile(path.join(workspace, 'manifests', 'ingests', 'chat-kings-001', 'items', 'white-king-master.json'), 'utf8'));
  const receipt = JSON.parse(await readFile(path.join(workspace, 'manifests', 'ingests', 'chat-kings-001', 'receipt.json'), 'utf8'));
  const commit = JSON.parse(await readFile(path.join(workspace, 'manifests', 'ingests', 'chat-kings-001', 'commit.json'), 'utf8'));
  assert.equal(provenance.schema, WORKSPACE_INGEST_PROVENANCE_SCHEMA);
  assert.equal(receipt.schema, WORKSPACE_INGEST_RECEIPT_SCHEMA);
  assert.equal(commit.schema, WORKSPACE_INGEST_COMMIT_SCHEMA);
  verifyHash(provenance);
  verifyHash(receipt);
  verifyHash(commit);
  assert.equal(commit.receiptSha256, receipt.documentSha256);
  assert.equal(commit.committedPaths.at(-1), plan.receiptPath);
  await expectReject(runWorkspaceIngest(workspace, plan), /TARGET_EXISTS/u);

  const mismatchRequest = structuredClone(request);
  mismatchRequest.ingestId = 'mismatch-001';
  mismatchRequest.items = [
    {
      ...mismatchRequest.items[0],
      assetId: 'mismatch',
      destinationPath: 'mismatch.png',
      expectedSha256: '0'.repeat(64),
    },
  ];
  const mismatchBytes = Buffer.from(`${JSON.stringify(mismatchRequest, null, 2)}\n`);
  await expectReject(
    compileWorkspaceIngest({ workspaceRoot: workspace, request: mismatchRequest, requestBytes: mismatchBytes }),
    /SOURCE_HASH_MISMATCH/u,
  );

  if (process.platform !== 'win32') {
    const symbolic = path.join(sourceRoot, 'chat', 'linked.png');
    await symlink(first, symbolic);
    const symbolicRequest = structuredClone(request);
    symbolicRequest.ingestId = 'symbolic-001';
    symbolicRequest.items = [
      {
        ...symbolicRequest.items[0],
        assetId: 'symbolic',
        sourcePath: 'chat/linked.png',
        destinationPath: 'symbolic.png',
      },
    ];
    const symbolicBytes = Buffer.from(`${JSON.stringify(symbolicRequest, null, 2)}\n`);
    await expectReject(
      compileWorkspaceIngest({ workspaceRoot: workspace, request: symbolicRequest, requestBytes: symbolicBytes }),
      /SOURCE_INVALID/u,
    );

    const hardLink = path.join(sourceRoot, 'chat', 'hard-linked.png');
    await link(first, hardLink);
    const hardRequest = structuredClone(request);
    hardRequest.ingestId = 'hard-link-001';
    hardRequest.items = [
      {
        ...hardRequest.items[0],
        assetId: 'hard-link',
        sourcePath: 'chat/hard-linked.png',
        destinationPath: 'hard-link.png',
      },
    ];
    const hardBytes = Buffer.from(`${JSON.stringify(hardRequest, null, 2)}\n`);
    await expectReject(
      compileWorkspaceIngest({ workspaceRoot: workspace, request: hardRequest, requestBytes: hardBytes }),
      /SOURCE_INVALID/u,
    );
    await rm(hardLink);
  }

  const rollbackWorkspace = await makeWorkspace(temporary, 'rollback-workspace');
  const rollbackRequest = {
    ...request,
    workspaceId: 'rollback-workspace',
    ingestId: 'rollback-001',
    items: [
      {
        ...request.items[0],
        assetId: 'rollback-asset',
        destinationPath: 'rollback/asset.png',
      },
    ],
  };
  const rollbackBytes = Buffer.from(`${JSON.stringify(rollbackRequest, null, 2)}\n`);
  const rollbackPlan = await compileWorkspaceIngest({
    workspaceRoot: rollbackWorkspace,
    request: rollbackRequest,
    requestBytes: rollbackBytes,
    compiledAt: '2026-08-12T00:10:00.000Z',
  });
  const collidingWorking = path.join(rollbackWorkspace, 'working', 'rollback', 'asset.png');
  await mkdir(path.dirname(collidingWorking), { recursive: true });
  const collisionBytes = Buffer.from('pre-existing working file');
  await writeFile(collidingWorking, collisionBytes);
  await expectReject(runWorkspaceIngest(rollbackWorkspace, rollbackPlan), /TARGET_EXISTS/u);
  await assert.rejects(
    lstat(path.join(rollbackWorkspace, 'sources', 'rollback', 'asset.png')),
    (error) => error?.code === 'ENOENT',
  );
  assert.deepEqual(await readFile(collidingWorking), collisionBytes);
  await assert.rejects(
    lstat(path.join(rollbackWorkspace, 'manifests', 'ingests', 'rollback-001', 'commit.json')),
    (error) => error?.code === 'ENOENT',
  );

  const nestedWorkspaceRootRequest = {
    ...request,
    workspaceId: 'artist-workspace',
    ingestId: 'nested-root-001',
    sourceRoots: [{ id: 'bad', path: workspace }],
    items: [
      {
        ...request.items[0],
        assetId: 'nested-root',
        sourceRootId: 'bad',
        sourcePath: 'working/characters/kings/white/white-king-master.png',
        destinationPath: 'nested-root.png',
      },
    ],
  };
  const nestedBytes = Buffer.from(`${JSON.stringify(nestedWorkspaceRootRequest, null, 2)}\n`);
  await expectReject(
    compileWorkspaceIngest({ workspaceRoot: workspace, request: nestedWorkspaceRootRequest, requestBytes: nestedBytes }),
    /ROOT_INVALID/u,
  );

  console.log('Persistent Artist Workspace external ingest regressions passed.');
  console.log('- approved external roots and exact source identities');
  console.log('- immutable source and editable working copies');
  console.log('- self-hashed provenance, receipt and commit marker');
  console.log('- symbolic, hard-linked, mismatched and nested roots fail closed');
  console.log('- mid-publication collision rolls back every created file');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
