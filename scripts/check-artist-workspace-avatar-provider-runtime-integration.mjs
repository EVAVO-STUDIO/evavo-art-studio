#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = Object.freeze({
  v1: 'config/artist-workspace-agent-suite.v1.json',
  v2: 'config/artist-workspace-agent-suite.v2.json',
  v3: 'config/artist-workspace-agent-suite.v3.json',
  config: 'config/mcp.project-art-workspace.windows.example.json',
  docs: 'docs/ARTIST_WORKSPACE_AGENT_SUITE.md',
  runtimeDocs: 'docs/PROJECT_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME.md',
  runtimeMcp: 'tools/project_art_avatar_final_pass_provider_runtime_mcp.mjs',
  runtimeSuite: 'scripts/check-project-art-avatar-final-pass-provider-runtime-suite.mjs',
});

const content = new Map();
for (const [label, relative] of Object.entries(files)) {
  const absolute = path.join(root, relative);
  const metadata = lstatSync(absolute);
  assert.equal(metadata.isFile(), true, `${relative} must be a file`);
  assert.equal(metadata.isSymbolicLink(), false, `${relative} must not be symbolic`);
  assert.equal(metadata.nlink, 1, `${relative} must be single-link`);
  assert.ok(metadata.size > 0 && metadata.size < 8_000_000, `${relative} has invalid size`);
  const source = readFileSync(absolute, 'utf8');
  assert.equal(source.startsWith('\uFEFF'), false, `${relative} has a BOM`);
  assert.equal(source.includes('\r'), false, `${relative} must use LF line endings`);
  content.set(label, source);
}

for (const relative of [
  'scripts/check-artist-workspace-avatar-provider-runtime-integration.mjs',
  'scripts/check-project-art-avatar-final-pass-provider-runtime-suite.mjs',
  'tools/project_art_avatar_final_pass_provider_runtime_mcp.mjs',
]) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

const v1 = JSON.parse(content.get('v1'));
const v2 = JSON.parse(content.get('v2'));
const v3 = JSON.parse(content.get('v3'));
assert.equal(v1.schema, 'evavo.artist-workspace-agent-suite.v1');
assert.equal(v1.version, 1);
assert.equal(v2.schema, 'evavo.artist-workspace-agent-suite.v1');
assert.equal(v2.version, 2);
assert.equal(v3.schema, 'evavo.artist-workspace-agent-suite.v1');
assert.equal(v3.version, 3);
assert.deepEqual(v1.servers.map((entry) => entry.id), [
  'evavo-project-art-workspace',
  'evavo-project-art-workspace-ingest',
  'evavo-project-art-workspace-catalog',
  'evavo-project-art-workspace-jobs',
]);
assert.deepEqual(v2.servers.map((entry) => entry.id), [
  ...v1.servers.map((entry) => entry.id),
  'evavo-project-art-avatar-final-pass-provider',
]);
assert.deepEqual(v3.servers.map((entry) => entry.id), [
  ...v2.servers.map((entry) => entry.id),
  'evavo-project-art-avatar-final-pass-provider-runtime',
]);
assert.equal(v3.servers.every((entry) => entry.defaultWriteEnabled === false), true);
for (const value of Object.values(v3.authority)) assert.equal(value, false);

const server = v3.servers.at(-1);
assert.equal(server.entrypoint, 'tools/project_art_avatar_final_pass_provider_runtime_mcp.mjs');
assert.equal(server.workspaceRootsEnvironment, 'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_ROOTS');
assert.equal(server.writeGateEnvironment, 'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_MCP_ALLOW_WRITE');
for (const group of [
  'exact-ready-job-dispatch',
  'generic-runtime-contract-binding',
  'candidate-or-failure-outcome-normalization',
  'create-only-candidate-materialization-planning',
]) {
  assert.equal(server.toolGroups.includes(group), true, `runtime server is missing ${group}`);
}

const flow = v3.flows.find((entry) => entry.id === 'avatar-final-pass-redraw-and-inbetween-submission');
assert.ok(flow, 'v3 must retain the complete avatar provider flow');
for (const step of [
  'evavo_art_compile_avatar_final_pass_provider_batch',
  'evavo_art_avatar_final_pass_provider_runtime_capabilities',
  'evavo_art_compile_avatar_final_pass_provider_runtime_dispatch',
  'separate-generic-provider-runtime-contract-compilation',
  'evavo_art_bind_avatar_final_pass_provider_runtime_contract',
  'separately-authorized-runtime-enqueue-and-provider-execution',
  'evavo_art_compile_avatar_final_pass_provider_runtime_outcome',
  'create-only-candidate-materialization',
  'rerun-avatar-frame-finisher-and-loop-closure',
  'seal-final-frame-sha-before-dependent-inbetween-or-sequence',
]) {
  assert.equal(flow.steps.includes(step), true, `runtime flow is missing ${step}`);
}

const config = JSON.parse(content.get('config'));
const configured = config.mcpServers?.['evavo-project-art-avatar-final-pass-provider-runtime'];
assert.ok(configured, 'canonical Windows config must register the avatar provider runtime server');
assert.equal(configured.command, 'node');
assert.deepEqual(configured.args, [
  'C:\\GitRepos\\evavo-art-studio\\tools\\project_art_avatar_final_pass_provider_runtime_mcp.mjs',
]);
assert.equal(configured.env.EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_MCP_ALLOW_WRITE, 'false');
assert.ok(configured.env.EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_ROOTS.includes('ArtWorkspaces'));
assert.ok(configured.env.EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_ROOTS.includes('Evidence'));

const mcp = content.get('runtimeMcp');
for (const token of [
  'evavo_art_avatar_final_pass_provider_runtime_capabilities',
  'evavo_art_compile_avatar_final_pass_provider_runtime_dispatch',
  'evavo_art_bind_avatar_final_pass_provider_runtime_contract',
  'evavo_art_compile_avatar_final_pass_provider_runtime_outcome',
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_ROOTS',
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_MCP_ALLOW_WRITE',
  'runtimeEnqueue: false',
  'providerExecution: false',
  'candidateMaterialization: false',
  'candidateApproval: false',
  'runtimeActivation: false',
]) {
  assert.equal(mcp.includes(token), true, `runtime MCP is missing ${token}`);
}

for (const token of [
  'six deliberately separate path-only servers',
  'evavo-project-art-avatar-final-pass-provider-runtime',
  'compileProviderCandidateRuntimeContract',
  'one successful candidate result or one explicit provider failure',
  'all six write gates set to `false`',
  'final reviewed SHA-256 before dependent in-betweens or sequences',
]) {
  assert.equal(content.get('docs').toLowerCase().includes(token.toLowerCase()), true, `agent-suite docs are missing ${token}`);
}
for (const token of [
  '@evavo/art-providers',
  'candidate-materialization-required',
  'provider-failure-record-required',
  'fresh named-human authorization',
  'does not approve or promote a candidate',
]) {
  assert.equal(content.get('runtimeDocs').toLowerCase().includes(token.toLowerCase()), true, `runtime docs are missing ${token}`);
}

const suite = spawnSync(
  process.execPath,
  [path.join(root, 'scripts/check-project-art-avatar-final-pass-provider-runtime-suite.mjs')],
  {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 24 * 1024 * 1024,
  },
);
if (suite.stdout) process.stdout.write(suite.stdout);
if (suite.stderr) process.stderr.write(suite.stderr);
assert.equal(suite.status, 0, suite.stderr || suite.stdout);

console.log('Artist Workspace avatar provider runtime integration guard passed.');
console.log('- v1 and v2 remain immutable and supported');
console.log('- v3 registers exact dispatch, runtime-contract binding and outcome normalization');
console.log('- all six local servers remain independently rooted and write-disabled by default');
console.log('- provider execution, materialization, approval, repository mutation and activation remain separate');
