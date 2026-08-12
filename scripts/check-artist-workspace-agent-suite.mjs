#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = [
  'config/artist-workspace-agent-suite.v1.json',
  'config/mcp.project-art-workspace.windows.example.json',
  'config/mcp.persistent-artist-workspace-catalog.windows.example.json',
  'docs/ARTIST_WORKSPACE_AGENT_SUITE.md',
  'docs/PERSISTENT_ARTIST_WORKSPACE_CATALOG.md',
  'tools/project_art_workspace_mcp.mjs',
  'tools/project_art_workspace_ingest_mcp.mjs',
  'tools/project_art_workspace_catalog_mcp.mjs',
  'scripts/persistent-artist-workspace.mjs',
  'scripts/persistent-artist-workspace-ingest.mjs',
  'scripts/persistent-artist-workspace-catalog.mjs',
  'scripts/check-persistent-artist-workspace-ingest.mjs',
  'scripts/check-persistent-artist-workspace-catalog.mjs',
  '.github/workflows/artist-workspace-agent-suite.yml',
];

const content = new Map();
for (const relative of requiredFiles) {
  const absolute = path.join(root, relative);
  const metadata = lstatSync(absolute);
  assert.equal(metadata.isFile(), true, `${relative} must be a file`);
  assert.equal(metadata.isSymbolicLink(), false, `${relative} must not be symbolic`);
  assert.ok(metadata.size > 0 && metadata.size < 4_000_000, `${relative} has an invalid size`);
  const source = readFileSync(absolute, 'utf8');
  assert.equal(source.startsWith('\uFEFF'), false, `${relative} has a BOM`);
  assert.equal(source.includes('\r'), false, `${relative} must use LF line endings`);
  content.set(relative, source);
}

for (const relative of [
  'scripts/check-artist-workspace-agent-suite.mjs',
  'scripts/check-persistent-artist-workspace-catalog.mjs',
  'scripts/persistent-artist-workspace-catalog.mjs',
  'tools/project_art_workspace_mcp.mjs',
  'tools/project_art_workspace_ingest_mcp.mjs',
  'tools/project_art_workspace_catalog_mcp.mjs',
  'scripts/persistent-artist-workspace.mjs',
  'scripts/persistent-artist-workspace-ingest.mjs',
]) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

const manifest = JSON.parse(content.get('config/artist-workspace-agent-suite.v1.json'));
assert.equal(manifest.schema, 'evavo.artist-workspace-agent-suite.v1');
assert.equal(manifest.version, 1);
assert.equal(manifest.configuration, 'config/mcp.project-art-workspace.windows.example.json');
assert.deepEqual(
  manifest.servers.map((entry) => entry.id),
  [
    'evavo-project-art-workspace',
    'evavo-project-art-workspace-ingest',
    'evavo-project-art-workspace-catalog',
  ],
);
assert.equal(manifest.servers.every((entry) => entry.defaultWriteEnabled === false), true);
for (const value of Object.values(manifest.authority)) assert.equal(value, false);
const catalogFlow = manifest.flows.find((entry) => entry.id === 'persistent-workspace-discovery-and-drift');
assert.ok(catalogFlow, 'Agent-suite manifest must define workspace discovery and drift verification.');
for (const tool of [
  'evavo_art_workspace_catalog_capabilities',
  'evavo_art_compile_workspace_catalog',
  'evavo_art_run_workspace_catalog',
  'evavo_art_query_workspace_catalog',
  'evavo_art_verify_workspace_catalog',
]) {
  assert.equal(catalogFlow.steps.includes(tool), true, `Catalog flow is missing ${tool}`);
}

const config = JSON.parse(content.get('config/mcp.project-art-workspace.windows.example.json'));
const workspaceServer = config.mcpServers?.['evavo-project-art-workspace'];
const ingestServer = config.mcpServers?.['evavo-project-art-workspace-ingest'];
const catalogServer = config.mcpServers?.['evavo-project-art-workspace-catalog'];
assert.ok(workspaceServer, 'Canonical Windows MCP config must register the project-art workspace server.');
assert.ok(ingestServer, 'Canonical Windows MCP config must register the persistent ingest server.');
assert.ok(catalogServer, 'Canonical Windows MCP config must register the workspace catalog server.');
assert.deepEqual(workspaceServer.args, ['C:\\GitRepos\\evavo-art-studio\\tools\\project_art_workspace_mcp.mjs']);
assert.deepEqual(ingestServer.args, ['C:\\GitRepos\\evavo-art-studio\\tools\\project_art_workspace_ingest_mcp.mjs']);
assert.deepEqual(catalogServer.args, ['C:\\GitRepos\\evavo-art-studio\\tools\\project_art_workspace_catalog_mcp.mjs']);
assert.equal(workspaceServer.env.EVAVO_ART_WORKSPACE_MCP_ALLOW_WRITE, 'false');
assert.equal(ingestServer.env.EVAVO_ART_WORKSPACE_INGEST_MCP_ALLOW_WRITE, 'false');
assert.equal(catalogServer.env.EVAVO_PERSISTENT_CATALOG_MCP_ALLOW_WRITE, 'false');
assert.ok(workspaceServer.env.EVAVO_ART_WORKSPACE_ROOTS.includes('ArtWorkspaces'));
assert.ok(ingestServer.env.EVAVO_ART_WORKSPACE_INGEST_ROOTS.includes('ArtWorkspaces'));
assert.ok(ingestServer.env.EVAVO_ART_WORKSPACE_INGEST_SOURCE_ROOTS.includes('Incoming Art'));
assert.ok(catalogServer.env.EVAVO_PERSISTENT_CATALOG_ROOTS.includes('ArtWorkspaces'));
assert.notEqual(
  ingestServer.env.EVAVO_ART_WORKSPACE_INGEST_ROOTS,
  ingestServer.env.EVAVO_ART_WORKSPACE_INGEST_SOURCE_ROOTS,
  'Workspace and external source allowlists must remain independently configurable.',
);

const workspaceMcp = content.get('tools/project_art_workspace_mcp.mjs');
for (const token of [
  'evavo_art_workspace_capabilities',
  'evavo_art_compile_sandbox',
  'evavo_art_run_sandbox',
  'evavo_art_compile_workspace_create',
  'evavo_art_run_workspace_create',
  'evavo_art_compile_workspace_snapshot',
  'evavo_art_run_workspace_snapshot',
  'evavo_art_prepare_storage_handoff',
  'bytesFlowThroughMcp: false',
  'storageWrite: false',
  'repositoryMutation: false',
  'forcePush: false',
]) {
  assert.equal(workspaceMcp.includes(token), true, `Primary workspace MCP is missing ${token}`);
}

const ingestMcp = content.get('tools/project_art_workspace_ingest_mcp.mjs');
for (const token of [
  'evavo_art_workspace_ingest_capabilities',
  'evavo_art_compile_workspace_ingest',
  'evavo_art_run_workspace_ingest',
  'EVAVO_ART_WORKSPACE_INGEST_ROOTS',
  'EVAVO_ART_WORKSPACE_INGEST_SOURCE_ROOTS',
  'EVAVO_ART_WORKSPACE_INGEST_MCP_ALLOW_WRITE',
  'bytesFlowThroughMcp: false',
  'storageWrite: false',
  'repositoryMutation: false',
  'forcePush: false',
]) {
  assert.equal(ingestMcp.includes(token), true, `Persistent ingest MCP is missing ${token}`);
}

const catalogMcp = content.get('tools/project_art_workspace_catalog_mcp.mjs');
for (const token of [
  'evavo_art_workspace_catalog_capabilities',
  'evavo_art_compile_workspace_catalog',
  'evavo_art_run_workspace_catalog',
  'evavo_art_query_workspace_catalog',
  'evavo_art_verify_workspace_catalog',
  'EVAVO_PERSISTENT_CATALOG_ROOTS',
  'EVAVO_PERSISTENT_CATALOG_MCP_ALLOW_WRITE',
  'imageBytesThroughMcp: false',
  'storageWrite: false',
  'targetRepositoryMutation: false',
  'forcePush: false',
]) {
  assert.equal(catalogMcp.includes(token), true, `Workspace catalog MCP is missing ${token}`);
}

const docs = content.get('docs/ARTIST_WORKSPACE_AGENT_SUITE.md');
for (const token of [
  'ChatGPT',
  'Claude',
  'immutable original',
  'editable working copy',
  'content-addressed workspace catalog',
  'duplicate',
  'drift',
  'EVAVO Storage',
  'separate authority',
  'config/mcp.project-art-workspace.windows.example.json',
]) {
  assert.equal(docs.includes(token), true, `Agent-suite documentation is missing ${token}`);
}

const workflow = content.get('.github/workflows/artist-workspace-agent-suite.yml');
for (const token of [
  'pull_request:',
  'push:',
  '- main',
  'contents: read',
  'persist-credentials: false',
  'tools/project_art_workspace_catalog_mcp.mjs',
  'scripts/check-persistent-artist-workspace-catalog.mjs',
  'node scripts/check-artist-workspace-agent-suite.mjs',
]) {
  assert.equal(workflow.includes(token), true, `Agent-suite workflow is missing ${token}`);
}

for (const [label, script] of [
  ['persistent ingest', 'scripts/check-persistent-artist-workspace-ingest.mjs'],
  ['persistent catalog', 'scripts/check-persistent-artist-workspace-catalog.mjs'],
]) {
  const result = spawnSync(process.execPath, [path.join(root, script)], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${label} check failed\n${result.stderr || result.stdout}`);
}

console.log('Artist Workspace agent suite guard passed.');
console.log('- canonical MCP configuration exposes workspace, external-ingest and catalog servers');
console.log('- write authority remains disabled by default and independently gated per server');
console.log('- agents can discover exact files, dimensions, alpha, animation and duplicates without guessing');
console.log('- catalog drift verification detects missing, changed and unexpected workspace files');
console.log('- snapshot, mastering, atlas and EVAVO Storage handoff remain discoverable in one deployment');
console.log('- image bytes, provider authority, Storage writes and Git publication remain outside MCP');
