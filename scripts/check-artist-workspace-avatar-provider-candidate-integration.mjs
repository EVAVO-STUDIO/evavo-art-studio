#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  lstatSync,
  readFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = Object.freeze({
  v1: 'config/artist-workspace-agent-suite.v1.json',
  v2: 'config/artist-workspace-agent-suite.v2.json',
  v3: 'config/artist-workspace-agent-suite.v3.json',
  v4: 'config/artist-workspace-agent-suite.v4.json',
  config: 'config/mcp.project-art-workspace.windows.example.json',
  standaloneConfig:
    'config/mcp.project-art-avatar-final-pass-provider-candidate.windows.example.json',
  docs: 'docs/ARTIST_WORKSPACE_AGENT_SUITE.md',
  candidateDocs:
    'docs/PROJECT_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE.md',
  candidateMcp:
    'tools/project_art_avatar_final_pass_provider_candidate_mcp.mjs',
  candidateSuite:
    'scripts/check-project-art-avatar-final-pass-provider-candidate-suite.mjs',
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
  assert.equal(source.includes('\r'), false, `${relative} must use LF`);
  content.set(label, source);
}

for (const relative of [
  'scripts/check-artist-workspace-avatar-provider-candidate-integration.mjs',
  'scripts/check-project-art-avatar-final-pass-provider-candidate.mjs',
  'scripts/check-project-art-avatar-final-pass-provider-candidate-suite.mjs',
  'scripts/test-project-art-avatar-final-pass-provider-candidate.mjs',
  'scripts/test-project-art-avatar-final-pass-provider-candidate-mcp.mjs',
  'scripts/avatar-final-pass-provider-candidate-cli.mjs',
  'tools/project_art_avatar_final_pass_provider_candidate_mcp.mjs',
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
const v4 = JSON.parse(content.get('v4'));
for (const [version, manifest] of [
  [1, v1],
  [2, v2],
  [3, v3],
  [4, v4],
]) {
  assert.equal(manifest.schema, 'evavo.artist-workspace-agent-suite.v1');
  assert.equal(manifest.version, version);
}
assert.deepEqual(v4.servers.slice(0, v3.servers.length), v3.servers);
assert.deepEqual(v4.servers.map((entry) => entry.id), [
  ...v3.servers.map((entry) => entry.id),
  'evavo-project-art-avatar-final-pass-provider-candidate',
]);
assert.equal(v4.servers.every((entry) => entry.defaultWriteEnabled === false), true);
for (const value of Object.values(v4.authority)) assert.equal(value, false);

const server = v4.servers.at(-1);
assert.equal(
  server.entrypoint,
  'tools/project_art_avatar_final_pass_provider_candidate_mcp.mjs',
);
assert.equal(
  server.workspaceRootsEnvironment,
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_ROOTS',
);
assert.equal(
  server.artifactRootsEnvironment,
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ARTIFACT_ROOTS',
);
assert.equal(
  server.writeGateEnvironment,
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_MCP_ALLOW_WRITE',
);
for (const group of [
  'immutable-provider-artifact-verification',
  'strict-rgba-png-admission',
  'create-only-workspace-candidate-materialization',
  'hash-bound-frame-finisher-handoff',
  'restart-safe-materialization-readback',
]) {
  assert.equal(server.toolGroups.includes(group), true, `candidate server is missing ${group}`);
}

const flow = v4.flows.find(
  (entry) => entry.id ===
    'avatar-final-pass-redraw-and-inbetween-submission',
);
assert.ok(flow, 'v4 must retain the complete avatar provider flow');
for (const step of [
  'evavo_art_compile_avatar_final_pass_provider_batch',
  'evavo_art_compile_avatar_final_pass_provider_runtime_dispatch',
  'evavo_art_bind_avatar_final_pass_provider_runtime_contract',
  'separately-authorized-runtime-enqueue-and-provider-execution',
  'evavo_art_compile_avatar_final_pass_provider_runtime_outcome',
  'evavo_art_avatar_final_pass_provider_candidate_capabilities',
  'evavo_art_materialize_avatar_final_pass_provider_candidate',
  'rerun-avatar-frame-finisher-and-loop-closure',
  'independent-candidate-visual-review',
  'seal-final-frame-sha-before-dependent-inbetween-or-sequence',
]) {
  assert.equal(flow.steps.includes(step), true, `v4 avatar flow is missing ${step}`);
}

const config = JSON.parse(content.get('config'));
const configured =
  config.mcpServers?.[
    'evavo-project-art-avatar-final-pass-provider-candidate'
  ];
assert.ok(configured, 'canonical Windows config must register candidate materialization');
assert.equal(configured.command, 'node');
assert.deepEqual(configured.args, [
  'C:\\GitRepos\\evavo-art-studio\\tools\\project_art_avatar_final_pass_provider_candidate_mcp.mjs',
]);
assert.equal(
  configured.env
    .EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_MCP_ALLOW_WRITE,
  'false',
);
assert.ok(
  configured.env
    .EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_ROOTS
    .includes('ArtWorkspaces'),
);
assert.ok(
  configured.env
    .EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ARTIFACT_ROOTS
    .includes('ArtArtifacts'),
);
const standalone = JSON.parse(content.get('standaloneConfig'));
assert.deepEqual(
  standalone.mcpServers[
    'evavo-project-art-avatar-final-pass-provider-candidate'
  ],
  configured,
);

const mcp = content.get('candidateMcp');
for (const token of [
  'evavo_art_avatar_final_pass_provider_candidate_capabilities',
  'evavo_art_materialize_avatar_final_pass_provider_candidate',
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_ROOTS',
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ARTIFACT_ROOTS',
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_MCP_ALLOW_WRITE',
  'imageBytesFlowThroughMcp: false',
  'candidateApproval: false',
  'candidatePromotion: false',
  'runtimeActivation: false',
]) {
  assert.equal(mcp.includes(token), true, `candidate MCP is missing ${token}`);
}

for (const token of [
  'five deliberately separate path-only servers',
  'six deliberately separate path-only servers',
  'seven deliberately separate path-only servers',
  'all five write gates set to `false`',
  'all six write gates set to `false`',
  'all seven write gates set to `false`',
  'evavo-project-art-avatar-final-pass-provider-candidate',
  'strict non-animated rgba png',
  'hash-bound frame-finisher request',
  'final reviewed sha-256 before dependent in-betweens or sequences',
]) {
  assert.equal(
    content.get('docs').toLowerCase().includes(token.toLowerCase()),
    true,
    `agent-suite docs are missing ${token}`,
  );
}

for (const token of [
  'candidate-materialization-required',
  'localartifactstore.verify()',
  'valid crc for every chunk',
  'no apng',
  'eight-bit rgba',
  'candidate-01.materialization.json',
  'candidate-01.finisher-request.json',
  'final reviewed sha-256',
  'does not approve, promote, publish, deploy or activate the candidate',
]) {
  assert.equal(
    content.get('candidateDocs').toLowerCase().includes(token.toLowerCase()),
    true,
    `candidate docs are missing ${token}`,
  );
}

const suite = spawnSync(
  process.execPath,
  [path.join(root, 'scripts/check-project-art-avatar-final-pass-provider-candidate-suite.mjs')],
  {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 32 * 1024 * 1024,
  },
);
if (suite.stdout) process.stdout.write(suite.stdout);
if (suite.stderr) process.stderr.write(suite.stderr);
assert.equal(suite.status, 0, suite.stderr || suite.stdout);

console.log('Artist Workspace avatar provider candidate integration guard passed.');
console.log('- v1, v2 and v3 remain immutable and supported');
console.log('- v4 adds strict immutable-artifact and RGBA candidate admission');
console.log('- all seven local servers remain independently rooted and write-disabled by default');
console.log('- materialized candidates remain unapproved and require the frame finisher plus independent review');
