#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'scripts/project-art/persistent-workspace-ingest.mjs',
  'scripts/persistent-artist-workspace-ingest.mjs',
  'scripts/check-persistent-artist-workspace-ingest.mjs',
  'scripts/test-persistent-artist-workspace-ingest.mjs',
  'scripts/test-project-art-workspace-ingest-mcp.mjs',
  'tools/project_art_workspace_ingest_mcp.mjs',
  'docs/PERSISTENT_ARTIST_WORKSPACE_INGEST.md',
  'config/mcp.persistent-artist-workspace-ingest.windows.example.json',
  '.github/workflows/persistent-artist-workspace-ingest.yml',
];
const content = new Map();
for (const relative of files) {
  const absolute = path.join(root, relative);
  const metadata = lstatSync(absolute);
  assert.equal(metadata.isFile(), true, `${relative} must be a file`);
  assert.equal(metadata.isSymbolicLink(), false, `${relative} must not be symbolic`);
  assert.ok(metadata.size > 0 && metadata.size < 2_000_000, `${relative} has invalid size`);
  const source = readFileSync(absolute, 'utf8');
  assert.equal(source.startsWith('\uFEFF'), false, `${relative} has a BOM`);
  assert.equal(source.includes('\r'), false, `${relative} must use LF line endings`);
  content.set(relative, source);
}
for (const relative of files.filter((entry) => entry.endsWith('.mjs'))) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
const combined = [...content.values()].join('\n');
for (const token of [
  'evavo.persistent-artist-workspace-ingest-request.v1',
  'evavo.persistent-artist-workspace-ingest-plan.v1',
  'evavo.persistent-artist-workspace-ingest-provenance.v1',
  'evavo.persistent-artist-workspace-ingest-receipt.v1',
  'evavo.persistent-artist-workspace-ingest-commit.v1',
  'immutableSourceCopies: true',
  'editableWorkingCopies: true',
  'rollbackOnFailure: true',
  'commitMarkerWrittenLast: true',
  'sourceHashesRevalidated: true',
  'bytesFlowThroughMcp: false',
  'PERSISTENT_ARTIST_WORKSPACE_INGEST_SOURCE_CHANGED',
  'PERSISTENT_ARTIST_WORKSPACE_INGEST_TARGET_EXISTS',
  'COPYFILE_EXCL',
  'O_NOFOLLOW',
  'video/quicktime',
  'video-frame-extract',
]) {
  assert.equal(combined.includes(token), true, `Missing permanent ingest contract token: ${token}`);
}
for (const token of [
  'evavo_art_workspace_ingest_capabilities',
  'evavo_art_compile_workspace_ingest',
  'evavo_art_run_workspace_ingest',
  'EVAVO_ART_WORKSPACE_INGEST_MCP_ALLOW_WRITE',
  'EVAVO_ART_WORKSPACE_INGEST_ROOTS',
  'EVAVO_ART_WORKSPACE_INGEST_SOURCE_ROOTS',
  'confirmWrite=true',
]) {
  assert.equal(content.get('tools/project_art_workspace_ingest_mcp.mjs').includes(token), true, `MCP is missing ${token}`);
}
for (const forbidden of [
  'child_process',
  'exec(',
  'spawn(',
  'git push',
  'storageWrite: true',
  'sourceMutation: true',
  'sourceDeletion: true',
  'repositoryMutation: true',
  'candidateApproval: true',
  'candidatePromotion: true',
  'publication: true',
  'deployment: true',
  'forcePush: true',
]) {
  assert.equal(content.get('scripts/project-art/persistent-workspace-ingest.mjs').includes(forbidden), false, `Ingest module must not contain ${forbidden}`);
}
const config = JSON.parse(content.get('config/mcp.persistent-artist-workspace-ingest.windows.example.json'));
const server = config.mcpServers?.['evavo-project-art-workspace-ingest'];
assert.ok(server, 'Windows MCP example must register evavo-project-art-workspace-ingest');
assert.equal(server.env.EVAVO_ART_WORKSPACE_INGEST_MCP_ALLOW_WRITE, 'true');
for (const token of [
  'pull_request:',
  'push:',
  'branches:',
  '- main',
  'contents: read',
  'persist-credentials: false',
  'node scripts/check-persistent-artist-workspace-ingest.mjs',
]) {
  assert.equal(content.get('.github/workflows/persistent-artist-workspace-ingest.yml').includes(token), true, `Workflow is missing ${token}`);
}
for (const script of [
  'scripts/test-persistent-artist-workspace-ingest.mjs',
  'scripts/test-project-art-workspace-ingest-mcp.mjs',
]) {
  const result = spawnSync(process.execPath, [path.join(root, script)], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${script} failed\n${result.stderr || result.stdout}`);
}
console.log('Persistent Artist Workspace external ingest guard passed.');
console.log('- external files are restricted to explicit approved roots');
console.log('- immutable source and editable working copies are byte exact');
console.log('- publication is create-only with complete rollback on failure');
console.log('- ChatGPT and Claude use fixed path-only tools without image bytes in MCP');
console.log('- Storage, repository, approval, deployment and publication authority remain false');
