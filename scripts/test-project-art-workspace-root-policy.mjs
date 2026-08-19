import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const files = {
  generator: read('scripts/New-ProjectArtWorkspaceMcpConfig.ps1'),
  publisherInstaller: read('tools/creative-asset-publisher/Register-EvavoCreativeAssetMcp.ps1'),
  docs: read('docs/PERSISTENT_ARTIST_WORKSPACE.md'),
  example: read('config/mcp.project-art-workspace.windows.example.json'),
};
const example = JSON.parse(files.example);

const retired = [
  'C:\\EVAVO\\ArtWorkspaces',
  'C:\\EVAVO\\Incoming Art',
  'C:\\EVAVO\\Evidence',
  'C:\\EVAVO\\ArtArtifacts',
];

test('generated workspace config uses Local Storage managed active roots', () => {
  assert.match(files.generator, /EVAVO\\LocalStorage\\workspaces\\ArtStudio/u);
  assert.match(files.generator, /EVAVO\\LocalStorage\\staging\\ArtStudio/u);
  assert.match(files.generator, /EVAVO_BEESTATION_PATH/u);
  assert.match(files.generator, /Join-Path \$UserProfile 'Downloads'/u);
  assert.match(files.generator, /image-finishing/u);
});

test('Creative Asset Publisher workstation includes managed Local Storage roots', () => {
  assert.match(files.publisherInstaller, /EVAVO\\LocalStorage\\workspaces\\ArtStudio/u);
  assert.match(files.publisherInstaller, /EVAVO\\LocalStorage\\staging\\ArtStudio/u);
  assert.match(files.publisherInstaller, /C:\\Downloads is retired/u);
});

test('legacy C EVAVO roots remain documentation-only negative examples', () => {
  for (const token of retired) {
    assert.equal(files.generator.includes(token), false, `generator contains retired root ${token}`);
    assert.equal(files.publisherInstaller.includes(token), false, `publisher installer contains retired root ${token}`);
    assert.equal(files.example.includes(token), false, `example contains retired root ${token}`);
  }
  assert.match(files.docs, /Legacy `C:\\EVAVO\\ArtWorkspaces`/u);
  assert.match(files.docs, /`C:\\Downloads` are not canonical worker roots/u);
});

test('example is generic rather than account-specific', () => {
  assert.equal(/Greg|Parker/u.test(files.example), false);
  const workspace = example.mcpServers['evavo-project-art-workspace'];
  const ingest = example.mcpServers['evavo-project-art-workspace-ingest'];
  assert.equal(workspace.env.EVAVO_ART_WORKSPACE_ROOTS.split(';').includes('C:\\Users\\User\\Downloads'), true);
  assert.equal(ingest.env.EVAVO_ART_WORKSPACE_INGEST_SOURCE_ROOTS.split(';').includes('C:\\Users\\User\\Downloads'), true);
  assert.match(workspace.env.EVAVO_ART_WORKSPACE_PYTHON, /image-finishing/u);
});
