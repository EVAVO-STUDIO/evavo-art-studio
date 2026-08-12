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
  'docs/ARTIST_WORKSPACE_AGENT_SUITE.md',
  'tools/project_art_workspace_mcp.mjs',
  'tools/project_art_workspace_ingest_mcp.mjs',
  'scripts/persistent-artist-workspace.mjs',
  'scripts/persistent-artist-workspace-ingest.mjs',
  'scripts/check-persistent-artist-workspace-ingest.mjs',
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
  'tools/project_art_workspace_mcp.mjs',
  'tools/project_art_workspace_ingest_mcp.mjs',
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
  ['evavo-project-art-workspace', 'evavo-project-art-workspace-ingest'],
);
assert.equal(manifest.servers.every((entry) => entry.defaultWriteEnabled === false), true);
for (const value of Object.values(manifest.authority)) assert.equal(value, false);

const config = JSON.parse(content.get('config/mcp.project-art-workspace.windows.example.json'));
const workspaceServer = config.mcpServers?.['evavo-project-art-workspace'];
const ingestServer = config.mcpServers?.['evavo-project-art-workspace-ingest'];
assert.ok(workspaceServer, 'Canonical Windows MCP config must register the project-art workspace server.');
assert.ok(ingestServer, 'Canonical Windows MCP config must register the persistent ingest server.');
assert.deepEqual(workspaceServer.args, ['C:\\GitRepos\\evavo-art-studio\\tools\\project_art_workspace_mcp.mjs']);
assert.deepEqual(ingestServer.args, ['C:\\GitRepos\\evavo-art-studio\\tools\\project_art_workspace_ingest_mcp.mjs']);
assert.equal(workspaceServer.env.EVAVO_ART_WORKSPACE_MCP_ALLOW_WRITE, 'false');
assert.equal(ingestServer.env.EVAVO_ART_WORKSPACE_INGEST_MCP_ALLOW_WRITE, 'false');
assert.ok(workspaceServer.env.EVAVO_ART_WORKSPACE_ROOTS.includes('ArtWorkspaces'));
assert.ok(ingestServer.env.EVAVO_ART_WORKSPACE_INGEST_ROOTS.includes('ArtWorkspaces'));
assert.ok(ingestServer.env.EVAVO_ART_WORKSPACE_INGEST_SOURCE_ROOTS.includes('Incoming Art'));
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

const docs = content.get('docs/ARTIST_WORKSPACE_AGENT_SUITE.md');
for (const token of [
  'ChatGPT',
  'Claude',
  'immutable original',
  'editable working copy',
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
  'node scripts/check-artist-workspace-agent-suite.mjs',
]) {
  assert.equal(workflow.includes(token), true, `Agent-suite workflow is missing ${token}`);
}

const ingestCheck = spawnSync(process.execPath, [path.join(root, 'scripts/check-persistent-artist-workspace-ingest.mjs')], {
  cwd: root,
  encoding: 'utf8',
  shell: false,
  windowsHide: true,
  timeout: 180_000,
  maxBuffer: 16 * 1024 * 1024,
});
assert.equal(ingestCheck.status, 0, ingestCheck.stderr || ingestCheck.stdout);

console.log('Artist Workspace agent suite guard passed.');
console.log('- canonical MCP configuration exposes both persistent workspace and external-ingest servers');
console.log('- write authority remains disabled by default and independently gated per server');
console.log('- attached or generated files can become immutable originals plus editable working copies');
console.log('- snapshot, mastering, atlas and EVAVO Storage handoff remain discoverable in one deployment');
console.log('- image bytes, provider authority, Storage writes and Git publication remain outside MCP');
