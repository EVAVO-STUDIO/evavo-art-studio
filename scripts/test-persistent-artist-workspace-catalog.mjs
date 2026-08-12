#!/usr/bin/env node
import assert from 'node:assert/strict';
import { link, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  WORKSPACE_CATALOG_REQUEST_SCHEMA,
  compileWorkspaceCatalog,
  queryWorkspaceCatalog,
  runWorkspaceCatalog,
  verifyDocumentHash,
  verifyWorkspaceCatalog,
  withDocumentHash,
} from './project-art/persistent-workspace-catalog.mjs';

const AREAS = [
  'sources', 'working', 'versions', 'masks', 'scratch', 'review', 'masters',
  'exports', 'manifests', 'manifests/storage-handoffs', 'journals',
];
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l0b6WQAAAABJRU5ErkJggg==',
  'base64',
);

async function createWorkspace(parent, name) {
  const root = path.join(parent, name);
  await mkdir(root, { recursive: false, mode: 0o700 });
  for (const area of AREAS) await mkdir(path.join(root, ...area.split('/')), { recursive: true });
  const resolved = await realpath(root);
  const manifest = withDocumentHash({
    schema: 'evavo.persistent-artist-workspace-manifest.v1',
    workspaceId: name,
    projectId: 'catalog-fixture-project',
    workspaceRoot: resolved,
    title: 'Catalog fixture',
  });
  await writeFile(path.join(root, 'manifests', 'workspace.json'),
    `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return resolved;
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error?.code === code,
    `Expected failure code ${code}.`);
}

const temp = await mkdtemp(path.join(os.tmpdir(), 'evavo-workspace-catalog-'));
try {
  const workspace = await createWorkspace(temp, 'workspace-main');
  await mkdir(path.join(workspace, 'sources', 'characters'), { recursive: true });
  await mkdir(path.join(workspace, 'working', 'characters'), { recursive: true });
  await mkdir(path.join(workspace, 'masters', 'characters'), { recursive: true });
  await writeFile(path.join(workspace, 'sources', 'characters', 'king.png'), PNG);
  await writeFile(path.join(workspace, 'working', 'characters', 'king-copy.png'), PNG);
  await writeFile(path.join(workspace, 'masters', 'characters', 'king-final.png'), PNG);
  await writeFile(path.join(workspace, 'working', 'notes.json'),
    `${JSON.stringify({ note: 'identity locked' })}\n`);
  await writeFile(path.join(workspace, 'sources', 'character-source.psd'), Buffer.from('psd-fixture'));

  const request = {
    schema: WORKSPACE_CATALOG_REQUEST_SCHEMA,
    catalogId: 'catalog-v1',
    title: 'Fixture catalog',
    note: 'Exact workspace inventory fixture.',
    tags: ['fixture', 'catalog'],
    includeAreas: ['sources', 'working', 'versions', 'masks', 'scratch', 'review',
      'masters', 'exports', 'manifests', 'journals'],
    limits: {
      maximumFiles: 100,
      maximumFileBytes: 1024 * 1024,
      maximumAggregateBytes: 16 * 1024 * 1024,
    },
  };
  const requestBytes = Buffer.from(`${JSON.stringify(request)}\n`);
  const planPath = path.join(temp, 'catalog-v1.plan.json');
  const plan = await compileWorkspaceCatalog({
    workspaceRoot: workspace,
    request,
    requestBytes,
    outputPath: planPath,
    compiledAt: '2026-08-12T01:30:00.000Z',
  });
  verifyDocumentHash(plan);
  assert.equal(plan.statistics.fileCount, 6);
  assert.equal(plan.statistics.imageCount, 3);
  assert.equal(plan.statistics.duplicateGroupCount, 1);
  assert.equal(plan.duplicateGroups[0].paths.length, 3);

  const result = await runWorkspaceCatalog(plan);
  verifyDocumentHash(result.catalog);
  verifyDocumentHash(result.receipt);
  assert.equal(result.receipt.complete, true);
  assert.equal(result.receipt.catalogSha256, result.catalog.documentSha256);
  assert.deepEqual(
    JSON.parse(await readFile(result.catalogPath, 'utf8')),
    result.catalog,
  );

  const duplicateQuery = await queryWorkspaceCatalog({
    workspaceRoot: workspace,
    catalogId: 'catalog-v1',
    query: { duplicateOnly: true, kind: 'image', limit: 10 },
  });
  verifyDocumentHash(duplicateQuery);
  assert.equal(duplicateQuery.totalMatches, 3);
  assert.equal(duplicateQuery.entries.every((entry) => entry.sha256 === plan.duplicateGroups[0].sha256), true);

  const masterQuery = await queryWorkspaceCatalog({
    workspaceRoot: workspace,
    catalogId: 'catalog-v1',
    query: { area: 'masters', hasAlpha: true, minWidth: 1, maxWidth: 1 },
  });
  assert.equal(masterQuery.totalMatches, 1);
  assert.equal(masterQuery.entries[0].path, 'masters/characters/king-final.png');

  const current = await verifyWorkspaceCatalog({ workspaceRoot: workspace, catalogId: 'catalog-v1' });
  verifyDocumentHash(current);
  assert.equal(current.current, true);

  await writeFile(path.join(workspace, 'working', 'notes.json'),
    `${JSON.stringify({ note: 'changed after catalog' })}\n`);
  const drifted = await verifyWorkspaceCatalog({ workspaceRoot: workspace, catalogId: 'catalog-v1' });
  assert.equal(drifted.current, false);
  assert.equal(drifted.changed.count, 1);
  assert.equal(drifted.changed.items[0].path, 'working/notes.json');

  await expectCode(runWorkspaceCatalog(plan), 'PERSISTENT_WORKSPACE_CATALOG_DRIFT');

  const raisedPlan = withDocumentHash({
    ...plan,
    limits: { ...plan.limits, maximumFiles: 50_001 },
    documentSha256: undefined,
  });
  await expectCode(runWorkspaceCatalog(raisedPlan), 'PERSISTENT_WORKSPACE_CATALOG_INTEGER_INVALID');

  const malformedPlan = withDocumentHash({
    ...plan,
    entries: plan.entries.map((entry, index) => index === 0 ? { ...entry, bytes: entry.bytes + 1 } : entry),
    documentSha256: undefined,
  });
  await expectCode(runWorkspaceCatalog(malformedPlan), 'PERSISTENT_WORKSPACE_CATALOG_INVENTORY_INVALID');

  const unsafeIdPlan = withDocumentHash({
    ...plan,
    catalogId: 'catalog:alternate-stream',
    output: {
      directory: 'manifests/catalogs/catalog:alternate-stream',
      catalogPath: 'manifests/catalogs/catalog:alternate-stream/catalog.json',
      receiptPath: 'manifests/catalogs/catalog:alternate-stream/receipt.json',
    },
    documentSha256: undefined,
  });
  await expectCode(runWorkspaceCatalog(unsafeIdPlan), 'PERSISTENT_WORKSPACE_CATALOG_ID_INVALID');

  const workspaceSymlink = await createWorkspace(temp, 'workspace-symlink');
  await writeFile(path.join(temp, 'outside.png'), PNG);
  await symlink(path.join(temp, 'outside.png'), path.join(workspaceSymlink, 'working', 'linked.png'));
  const symlinkRequest = { ...request, catalogId: 'catalog-symlink' };
  await expectCode(compileWorkspaceCatalog({
    workspaceRoot: workspaceSymlink,
    request: symlinkRequest,
    requestBytes: Buffer.from(`${JSON.stringify(symlinkRequest)}\n`),
    compiledAt: '2026-08-12T01:31:00.000Z',
  }), 'PERSISTENT_WORKSPACE_CATALOG_SYMBOLIC_ENTRY');

  const workspaceHardlink = await createWorkspace(temp, 'workspace-hardlink');
  await writeFile(path.join(workspaceHardlink, 'sources', 'original.png'), PNG);
  await link(path.join(workspaceHardlink, 'sources', 'original.png'),
    path.join(workspaceHardlink, 'working', 'hardlink.png'));
  const hardlinkRequest = { ...request, catalogId: 'catalog-hardlink' };
  await expectCode(compileWorkspaceCatalog({
    workspaceRoot: workspaceHardlink,
    request: hardlinkRequest,
    requestBytes: Buffer.from(`${JSON.stringify(hardlinkRequest)}\n`),
    compiledAt: '2026-08-12T01:32:00.000Z',
  }), 'PERSISTENT_WORKSPACE_CATALOG_ENTRY_MULTIPLY_LINKED');

  const workspaceDrift = await createWorkspace(temp, 'workspace-drift');
  await writeFile(path.join(workspaceDrift, 'working', 'frame.png'), PNG);
  const driftRequest = { ...request, catalogId: 'catalog-drift' };
  const driftPlan = await compileWorkspaceCatalog({
    workspaceRoot: workspaceDrift,
    request: driftRequest,
    requestBytes: Buffer.from(`${JSON.stringify(driftRequest)}\n`),
    compiledAt: '2026-08-12T01:33:00.000Z',
  });
  await writeFile(path.join(workspaceDrift, 'working', 'late.png'), PNG);
  await expectCode(runWorkspaceCatalog(driftPlan), 'PERSISTENT_WORKSPACE_CATALOG_DRIFT');
  await assert.rejects(readFile(path.join(workspaceDrift, 'manifests', 'catalogs',
    'catalog-drift', 'catalog.json')));

  process.stdout.write('Persistent Artist Workspace catalog regressions passed.\n');
} finally {
  await rm(temp, { recursive: true, force: true });
}
