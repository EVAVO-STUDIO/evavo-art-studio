#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = [
  'scripts/project-art/persistent-workspace-jobs.mjs',
  'scripts/persistent-artist-workspace-jobs.mjs',
  'scripts/test-persistent-artist-workspace-jobs.mjs',
  'scripts/test-project-art-workspace-jobs-mcp.mjs',
  'tools/project_art_workspace_jobs_mcp.mjs',
  'docs/PERSISTENT_ARTIST_WORKSPACE_JOBS.md',
  'config/mcp.persistent-artist-workspace-jobs.windows.example.json',
  '.github/workflows/persistent-artist-workspace-jobs.yml',
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
  'scripts/check-persistent-artist-workspace-jobs.mjs',
  'scripts/project-art/persistent-workspace-jobs.mjs',
  'scripts/persistent-artist-workspace-jobs.mjs',
  'scripts/test-persistent-artist-workspace-jobs.mjs',
  'scripts/test-project-art-workspace-jobs-mcp.mjs',
  'tools/project_art_workspace_jobs_mcp.mjs',
]) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], { cwd: root, encoding: 'utf8', shell: false, windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

const core = content.get('scripts/project-art/persistent-workspace-jobs.mjs');
for (const token of [
  'evavo.persistent-artist-workspace-job-request.v1',
  'evavo.persistent-artist-workspace-job-plan.v1',
  'evavo.persistent-artist-workspace-job-event.v1',
  'evavo.persistent-artist-workspace-job-commit.v1',
  'previousEventSha256',
  "commitFile: 'job-commit.json'",
  'appendOnlyEvents: true',
  'staleLeaseRecovery: true',
  'optimisticConcurrency: true',
  'compareAndAppendEvents: true',
  'exactInputRevalidationBeforeStart: true',
  'exactOutputEvidenceOnSuccess: true',
  'ARTIST_WORKSPACE_JOB_CONCURRENCY',
  'ARTIST_WORKSPACE_JOB_INPUT_DRIFT',
  'ARTIST_WORKSPACE_JOB_EVIDENCE_DRIFT',
  "path.join(root, 'journals', 'jobs'",
]) {
  assert.equal(core.includes(token), true, `Job core is missing ${token}`);
}
for (const forbidden of ['node:child_process', 'execSync(', 'spawnSync(', 'git push', '--force', 'providerExecution: true', 'storageWrite: true', 'targetRepositoryMutation: true']) {
  assert.equal(core.includes(forbidden), false, `Job core contains forbidden authority: ${forbidden}`);
}

const mcp = content.get('tools/project_art_workspace_jobs_mcp.mjs');
for (const token of [
  'evavo_art_workspace_job_capabilities',
  'evavo_art_compile_workspace_job',
  'evavo_art_create_workspace_job',
  'evavo_art_inspect_workspace_job',
  'evavo_art_checkpoint_workspace_job',
  'EVAVO_ART_WORKSPACE_JOB_ROOTS',
  'EVAVO_ART_WORKSPACE_JOBS_MCP_ALLOW_WRITE',
  'imageBytesThroughMcp: false',
  'providerExecution: false',
  'storageWrite: false',
  'targetRepositoryMutation: false',
  'gitPublication: false',
  'forcePush: false',
]) {
  assert.equal(mcp.includes(token), true, `Job MCP is missing ${token}`);
}
for (const forbidden of ['node:child_process', 'execSync(', 'spawnSync(', 'git push', '--force-with-lease']) {
  assert.equal(mcp.includes(forbidden), false, `Job MCP contains forbidden shell/publication surface: ${forbidden}`);
}

const config = JSON.parse(content.get('config/mcp.persistent-artist-workspace-jobs.windows.example.json'));
const server = config.mcpServers?.['evavo-project-art-workspace-jobs'];
assert.ok(server, 'Windows example must register the resumable workspace job server.');
assert.deepEqual(server.args, ['C:\\GitRepos\\evavo-art-studio\\tools\\project_art_workspace_jobs_mcp.mjs']);
assert.equal(server.env.EVAVO_ART_WORKSPACE_JOBS_MCP_ALLOW_WRITE, 'false');
assert.ok(server.env.EVAVO_ART_WORKSPACE_JOB_ROOTS.includes('ArtWorkspaces'));

const docs = content.get('docs/PERSISTENT_ARTIST_WORKSPACE_JOBS.md');
for (const token of ['ChatGPT', 'Claude', 'crash-resumable', 'stale-lease recovery', 'exact input', 'output evidence', 'append-only', 'force push']) {
  assert.equal(docs.toLowerCase().includes(token.toLowerCase()), true, `Job documentation is missing ${token}`);
}

const workflow = content.get('.github/workflows/persistent-artist-workspace-jobs.yml');
for (const token of ['pull_request:', 'push:', '- main', 'contents: read', 'persist-credentials: false', 'node scripts/check-persistent-artist-workspace-jobs.mjs']) {
  assert.equal(workflow.includes(token), true, `Job workflow is missing ${token}`);
}

for (const script of ['scripts/test-persistent-artist-workspace-jobs.mjs', 'scripts/test-project-art-workspace-jobs-mcp.mjs']) {
  const result = spawnSync(process.execPath, [path.join(root, script)], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `${script} failed\n${result.stderr || result.stdout}`);
}

console.log('Persistent Artist Workspace job guard passed.');
console.log('- job plans are create-only and exact-input bound');
console.log('- checkpoints are append-only, self-hashed, hash-chained and compare-and-append serialized');
console.log('- stale claims recover without mutable lock state');
console.log('- competing stale checkpoint intents fail closed instead of becoming later authoritative events');
console.log('- failed steps remain resumable while dependency cycles are rejected');
console.log('- succeeded output evidence is drift-verified before later work continues');
console.log('- MCP remains path-only and grants no provider, Storage, repository or Git authority');
