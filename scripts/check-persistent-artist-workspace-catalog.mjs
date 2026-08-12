#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const paths = {
  core: path.join(root, 'scripts', 'project-art', 'persistent-workspace-catalog.mjs'),
  cli: path.join(root, 'scripts', 'persistent-artist-workspace-catalog.mjs'),
  test: path.join(root, 'scripts', 'test-persistent-artist-workspace-catalog.mjs'),
  mcpTest: path.join(root, 'scripts', 'test-project-art-workspace-catalog-mcp.mjs'),
  mcp: path.join(root, 'tools', 'project_art_workspace_catalog_mcp.mjs'),
  docs: path.join(root, 'docs', 'PERSISTENT_ARTIST_WORKSPACE_CATALOG.md'),
  config: path.join(root, 'config', 'mcp.persistent-artist-workspace-catalog.windows.example.json'),
  workflow: path.join(root, '.github', 'workflows', 'persistent-artist-workspace-catalog.yml'),
};

const content = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, file]) =>
  [key, await readFile(file, 'utf8')])));

JSON.parse(content.config);
for (const schema of [
  'evavo.persistent-artist-workspace-catalog-request.v1',
  'evavo.persistent-artist-workspace-catalog-plan.v1',
  'evavo.persistent-artist-workspace-catalog.v1',
  'evavo.persistent-artist-workspace-catalog-receipt.v1',
  'evavo.persistent-artist-workspace-catalog-query-result.v1',
  'evavo.persistent-artist-workspace-catalog-verification.v1',
]) {
  assert.match(content.core, new RegExp(schema.replaceAll('.', '\\.')));
}
for (const tool of [
  'evavo_art_workspace_catalog_capabilities',
  'evavo_art_compile_workspace_catalog',
  'evavo_art_run_workspace_catalog',
  'evavo_art_query_workspace_catalog',
  'evavo_art_verify_workspace_catalog',
]) {
  assert.match(content.mcp, new RegExp(tool));
  assert.match(content.docs, new RegExp(tool));
}
for (const token of [
  'createOnlyPublication',
  'atomicDirectoryRename',
  'duplicateGroups',
  'maximumAggregateBytes',
  'PERSISTENT_WORKSPACE_CATALOG_SYMBOLIC_ENTRY',
  'PERSISTENT_WORKSPACE_CATALOG_ENTRY_MULTIPLY_LINKED',
  'PERSISTENT_WORKSPACE_CATALOG_DRIFT',
]) {
  assert.match(content.core, new RegExp(token));
}
assert.doesNotMatch(content.mcp, /shell\s*:\s*true/u);
assert.doesNotMatch(content.mcp, /\bexec(?:File)?Sync\s*\(/u);
assert.doesNotMatch(content.core, /providerExecution\s*:\s*true/u);
assert.doesNotMatch(content.core, /storageWrite\s*:\s*true/u);
assert.doesNotMatch(content.core, /targetRepositoryMutation\s*:\s*true/u);
assert.doesNotMatch(content.core, /forcePush\s*:\s*true/u);
assert.match(content.workflow, /node scripts\/check-persistent-artist-workspace-catalog\.mjs/u);
assert.match(content.config, /EVAVO_PERSISTENT_CATALOG_MCP_ALLOW_WRITE/u);
assert.match(content.config, /EVAVO_PERSISTENT_CATALOG_ROOTS/u);

for (const script of [paths.test, paths.mcpTest]) {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env },
    timeout: 60_000,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`${path.basename(script)} failed with status ${result.status}.`);
  }
  process.stdout.write(result.stdout);
}

process.stdout.write('Persistent Artist Workspace catalog guard passed.\n');
