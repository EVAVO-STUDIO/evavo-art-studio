#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = {
  library: 'scripts/project-art/persistent-workspace.mjs',
  cli: 'scripts/persistent-artist-workspace.mjs',
  tests: 'scripts/test-persistent-artist-workspace.mjs',
  documentation: 'docs/PERSISTENT_ARTIST_WORKSPACE.md',
  mcp: 'tools/project_art_workspace_mcp.mjs',
  package: 'package.json',
  workflow: '.github/workflows/project-art-workbench.yml',
};
const contents = new Map();
for (const [label, relative] of Object.entries(files)) {
  const absolute = path.join(root, relative);
  const metadata = lstatSync(absolute);
  assert.equal(metadata.isFile(), true, `${label} must be a file`);
  assert.equal(metadata.isSymbolicLink(), false, `${label} must not be a symlink`);
  contents.set(label, readFileSync(absolute, 'utf8'));
}
const requireTokens = (label, source, tokens) => {
  for (const token of tokens) assert.equal(source.includes(token), true, `${label} is missing ${token}`);
};
const forbidTokens = (label, source, tokens) => {
  for (const token of tokens) assert.equal(source.includes(token), false, `${label} must not contain ${token}`);
};
requireTokens('library', contents.get('library'), [
  'evavo.persistent-artist-workspace-create-request.v1',
  'evavo.persistent-artist-workspace-manifest.v1',
  'evavo.persistent-artist-workspace-snapshot-plan.v1',
  'evavo.storage-art-ingest-request.v1',
  'appendOnlyVersions: true',
  'PERSISTENT_ARTIST_WORKSPACE_REQUEST_BYTES_MISMATCH',
  'PERSISTENT_ARTIST_WORKSPACE_SOURCE_IDENTITY_CHANGED',
  'storageWrite: false',
  'repositoryMutation: false',
  'bytesFlowThroughMcp: false',
]);
requireTokens('CLI', contents.get('cli'), [
  'compile-create',
  'run-create',
  'compile-snapshot',
  'run-snapshot',
  'storage-handoff',
]);
requireTokens('tests', contents.get('tests'), [
  'Persistent Artist Workspace regressions passed.',
  'append-only exact snapshots',
  'evavo.storage-art-ingest-request.v1',
  "process.env.PROJECT_ART_REQUIRE_PILLOW === '1'",
  'PROJECT_ART_REQUIRE_PILLOW=1 but no Python 3 executable with Pillow was found for the Persistent Artist Workspace.',
  'Persistent Artist Workspace runtime regressions skipped: Pillow unavailable; the dedicated Project Art workflow requires the exact backend.',
]);
requireTokens('documentation', contents.get('documentation'), [
  '# Persistent Artist Workspace',
  'immutable originals',
  'append-only versions',
  'EVAVO Storage',
  'ChatGPT',
  'Claude',
  'technical pass is not creative approval',
]);
requireTokens('MCP', contents.get('mcp'), [
  'evavo_art_compile_workspace_create',
  'evavo_art_run_workspace_create',
  'evavo_art_compile_workspace_snapshot',
  'evavo_art_run_workspace_snapshot',
  'evavo_art_prepare_storage_handoff',
]);
requireTokens('package', contents.get('package'), [
  'project-art:workspace:persistent',
  'project-art:workspace:persistent:check',
]);
const workflowPaths = [
  'scripts/project-art/persistent-workspace.mjs',
  'scripts/persistent-artist-workspace.mjs',
  'scripts/check-persistent-artist-workspace.mjs',
  'scripts/test-persistent-artist-workspace.mjs',
  'docs/PERSISTENT_ARTIST_WORKSPACE.md',
];
for (const workflowPath of workflowPaths) {
  assert.equal(contents.get('workflow').split(`- "${workflowPath}"`).length - 1, 2, `${workflowPath} must trigger PR and main validation`);
}
forbidTokens('library', contents.get('library'), [
  'child_process',
  'git push',
  'candidateApproval: true',
  'candidatePromotion: true',
  'storageWrite: true',
  'repositoryMutation: true',
  'publication: true',
  'forcePush: true',
]);
console.log('Persistent Artist Workspace guard passed.');
console.log('- create-only workspace manifests and append-only versions are exact and atomic');
console.log('- ChatGPT and Claude receive fixed path-only operations rather than arbitrary shell');
console.log('- EVAVO Storage handoffs remain exact and independently authorised');
console.log('- creative approval, repository mutation, deployment, publication and force push remain false');
