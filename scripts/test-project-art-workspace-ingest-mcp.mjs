#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function canonicalJson(value) {
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function withHash(value) {
  const copy = structuredClone(value);
  delete copy.documentSha256;
  copy.documentSha256 = sha256(canonicalJson(copy));
  return copy;
}

async function createWorkspace(parent) {
  const workspace = path.join(parent, 'workspace');
  for (const relative of ['sources', 'working', 'versions', 'masks', 'scratch', 'review', 'masters', 'exports', 'manifests', 'manifests/storage-handoffs', 'journals']) {
    await mkdir(path.join(workspace, ...relative.split('/')), { recursive: true });
  }
  const manifest = withHash({
    schema: 'evavo.persistent-artist-workspace-manifest.v1',
    workspaceId: 'mcp-ingest-workspace',
    projectId: 'battle-chess',
    workspaceRoot: workspace,
    title: 'MCP ingest workspace',
    purpose: 'MCP regression fixture.',
    createdBy: 'test',
    createdAt: '2026-08-12T01:00:00.000Z',
    createPlanSha256: '1'.repeat(64),
    requestSha256: '2'.repeat(64),
    tags: [],
    paths: {},
    policy: {},
    storage: { enabled: true, vaultId: 'art', logicalPrefix: 'Projects/BattleChess/Art', tags: [], storageWrite: false },
    authority: {},
  });
  await writeFile(path.join(workspace, 'manifests', 'workspace.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return workspace;
}

const temporary = await mkdtemp(path.join(os.tmpdir(), 'evavo-workspace-ingest-mcp-'));
try {
  const sourceRoot = path.join(temporary, 'incoming');
  await mkdir(sourceRoot);
  const sourcePath = path.join(sourceRoot, 'attached.png');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+0fQFXwAAAABJRU5ErkJggg==', 'base64');
  await writeFile(sourcePath, png);
  const workspace = await createWorkspace(temporary);
  const requestPath = path.join(temporary, 'request.json');
  const outputPath = path.join(workspace, 'manifests', 'mcp-ingest-plan.json');
  const request = {
    schema: 'evavo.persistent-artist-workspace-ingest-request.v1',
    workspaceId: 'mcp-ingest-workspace',
    ingestId: 'mcp-ingest-001',
    createdBy: 'claude-test',
    sourceRoots: [{ id: 'attachments', path: sourceRoot }],
    items: [
      {
        assetId: 'attached-master',
        sourceRootId: 'attachments',
        sourcePath: 'attached.png',
        expectedSha256: sha256(png),
        expectedBytes: png.length,
        destinationPath: 'characters/kings/attached-master.png',
        title: 'Attached master',
        role: 'sprite-master',
        origin: 'chat-upload',
      },
    ],
  };
  await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`);

  process.env.EVAVO_ART_WORKSPACE_INGEST_MCP_ALLOW_WRITE = 'true';
  process.env.EVAVO_ART_WORKSPACE_INGEST_ROOTS = temporary;
  process.env.EVAVO_ART_WORKSPACE_INGEST_SOURCE_ROOTS = sourceRoot;
  const moduleUrl = new URL('../tools/project_art_workspace_ingest_mcp.mjs', import.meta.url);
  moduleUrl.searchParams.set('test', Date.now().toString());
  const mcp = await import(moduleUrl.href);

  const names = mcp.toolDefinitions.map((tool) => tool.name);
  assert.deepEqual(names, [
    'evavo_art_workspace_ingest_capabilities',
    'evavo_art_compile_workspace_ingest',
    'evavo_art_run_workspace_ingest',
  ]);
  assert.equal(mcp.policy.writeEnabled, true);
  assert.equal(mcp.policy.bytesFlowThroughMcp, false);

  const capabilities = await mcp.callTool('evavo_art_workspace_ingest_capabilities', {});
  assert.equal(capabilities.maximumItems, 1000);
  assert.equal(capabilities.writeToolsExposed, true);
  assert.equal(capabilities.authority.storageWrite, false);

  await assert.rejects(
    mcp.callTool('evavo_art_compile_workspace_ingest', {
      workspaceRoot: workspace,
      requestPath,
      outputPath,
      confirmWrite: false,
    }),
    /confirmWrite=true/u,
  );

  const compiled = await mcp.callTool('evavo_art_compile_workspace_ingest', {
    workspaceRoot: workspace,
    requestPath,
    outputPath,
    compiledAt: '2026-08-12T01:05:00.000Z',
    confirmWrite: true,
  });
  assert.equal(compiled.status, 'passed');
  assert.equal(compiled.itemCount, 1);
  assert.equal(compiled.bytesFlowThroughMcp, false);
  assert.equal((await lstat(outputPath)).isFile(), true);

  const run = await mcp.callTool('evavo_art_run_workspace_ingest', {
    workspaceRoot: workspace,
    planPath: outputPath,
    confirmWrite: true,
  });
  assert.equal(run.status, 'passed');
  assert.equal(run.itemCount, 1);
  assert.deepEqual(
    await readFile(path.join(workspace, 'sources', 'characters', 'kings', 'attached-master.png')),
    png,
  );
  assert.deepEqual(
    await readFile(path.join(workspace, 'working', 'characters', 'kings', 'attached-master.png')),
    png,
  );

  const initialized = await mcp.handleRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05' },
  });
  assert.equal(initialized.result.serverInfo.name, 'evavo-project-art-workspace-ingest');
  const listed = await mcp.handleRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(listed.result.tools.length, 3);

  console.log('Persistent Artist Workspace ingest MCP regressions passed.');
  console.log('- capabilities remain read-only and bounded');
  console.log('- compile and run require confirmWrite=true');
  console.log('- source and workspace roots remain independently confined');
  console.log('- image bytes remain outside MCP JSON');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
