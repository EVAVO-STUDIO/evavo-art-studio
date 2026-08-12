#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';

import {
  WORKSPACE_CATALOG_REQUEST_SCHEMA,
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

async function createWorkspace(parent) {
  const root = path.join(parent, 'workspace');
  await mkdir(root, { recursive: false });
  for (const area of AREAS) await mkdir(path.join(root, ...area.split('/')), { recursive: true });
  const resolved = await realpath(root);
  const manifest = withDocumentHash({
    schema: 'evavo.persistent-artist-workspace-manifest.v1',
    workspaceId: 'mcp-workspace',
    projectId: 'mcp-project',
    workspaceRoot: resolved,
  });
  await writeFile(path.join(root, 'manifests', 'workspace.json'),
    `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(root, 'working', 'frame.png'), PNG);
  return resolved;
}

function startServer(root, allowWrite) {
  const child = spawn(process.execPath,
    [new URL('../tools/project_art_workspace_catalog_mcp.mjs', import.meta.url).pathname], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        EVAVO_PERSISTENT_CATALOG_ROOTS: root,
        EVAVO_PERSISTENT_CATALOG_MCP_ALLOW_WRITE: allowWrite ? 'true' : 'false',
      },
    });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const queue = [];
  const waiters = [];
  lines.on('line', (line) => {
    const message = JSON.parse(line);
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(message);
    else queue.push(message);
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    if (text.trim()) process.stderr.write(text);
  });
  let nextId = 1;
  async function call(method, params = {}) {
    const id = nextId++;
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    if (queue.length > 0) return queue.shift();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}.`)), 10_000);
      waiters.push({
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
        reject,
      });
    });
  }
  async function close() {
    child.stdin.end();
    await new Promise((resolve) => child.once('exit', resolve));
  }
  return { call, close };
}

const temp = await mkdtemp(path.join(os.tmpdir(), 'evavo-catalog-mcp-'));
try {
  const workspace = await createWorkspace(temp);
  const request = {
    schema: WORKSPACE_CATALOG_REQUEST_SCHEMA,
    catalogId: 'mcp-catalog',
    limits: {
      maximumFiles: 100,
      maximumFileBytes: 1024 * 1024,
      maximumAggregateBytes: 8 * 1024 * 1024,
    },
  };
  const requestPath = path.join(temp, 'catalog-request.json');
  const planPath = path.join(temp, 'catalog-plan.json');
  await writeFile(requestPath, `${JSON.stringify(request)}\n`);

  const readOnly = startServer(temp, false);
  let response = await readOnly.call('initialize', { protocolVersion: '2025-03-26' });
  assert.equal(response.result.serverInfo.name, 'evavo-project-art-workspace-catalog');
  response = await readOnly.call('tools/list');
  const names = response.result.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    'evavo_art_compile_workspace_catalog',
    'evavo_art_query_workspace_catalog',
    'evavo_art_run_workspace_catalog',
    'evavo_art_verify_workspace_catalog',
    'evavo_art_workspace_catalog_capabilities',
  ]);
  response = await readOnly.call('tools/call', {
    name: 'evavo_art_workspace_catalog_capabilities', arguments: {},
  });
  assert.equal(response.result.structuredContent.mcp.writeEnabled, false);
  response = await readOnly.call('tools/call', {
    name: 'evavo_art_compile_workspace_catalog',
    arguments: { workspaceRoot: workspace, requestPath, outputPath: planPath },
  });
  assert.equal(response.error.code, -32012);
  await readOnly.close();

  const writable = startServer(temp, true);
  response = await writable.call('tools/call', {
    name: 'evavo_art_compile_workspace_catalog',
    arguments: {
      workspaceRoot: workspace,
      requestPath,
      outputPath: planPath,
      compiledAt: '2026-08-12T02:00:00.000Z',
    },
  });
  assert.equal(response.result.structuredContent.catalogId, 'mcp-catalog');
  assert.equal(response.result.structuredContent.fileCount, 2);

  response = await writable.call('tools/call', {
    name: 'evavo_art_run_workspace_catalog', arguments: { planPath },
  });
  assert.equal(response.result.structuredContent.catalogId, 'mcp-catalog');

  response = await writable.call('tools/call', {
    name: 'evavo_art_query_workspace_catalog',
    arguments: {
      workspaceRoot: workspace,
      catalogId: 'mcp-catalog',
      query: { kind: 'image', limit: 10 },
    },
  });
  assert.equal(response.result.structuredContent.totalMatches, 1);
  assert.equal(response.result.structuredContent.entries[0].path, 'working/frame.png');

  response = await writable.call('tools/call', {
    name: 'evavo_art_verify_workspace_catalog',
    arguments: { workspaceRoot: workspace, catalogId: 'mcp-catalog' },
  });
  assert.equal(response.result.structuredContent.current, true);

  response = await writable.call('tools/call', {
    name: 'evavo_art_query_workspace_catalog',
    arguments: { workspaceRoot: path.join(temp, '..'), catalogId: 'mcp-catalog' },
  });
  assert.equal(response.error.code, -32011);
  await writable.close();

  process.stdout.write('Project Art Workspace catalog MCP regressions passed.\n');
} finally {
  await rm(temp, { recursive: true, force: true });
}
