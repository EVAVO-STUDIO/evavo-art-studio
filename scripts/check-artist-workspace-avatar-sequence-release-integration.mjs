#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = Object.freeze({
  v5: 'config/artist-workspace-agent-suite.v5.json',
  v6: 'config/artist-workspace-agent-suite.v6.json',
  config: 'config/mcp.project-art-workspace.windows.example.json',
  standaloneConfig: 'config/mcp.project-art-avatar-sequence-release.windows.example.json',
  agentDocs: 'docs/ARTIST_WORKSPACE_AGENT_SUITE.md',
  releaseDocs: 'docs/PROJECT_ART_AVATAR_SEQUENCE_RELEASE.md',
  core: 'scripts/project-art/avatar-sequence-release.mjs',
  cli: 'scripts/avatar-sequence-release-cli.mjs',
  mcp: 'tools/project_art_avatar_sequence_release_mcp.mjs',
  suite: 'scripts/check-project-art-avatar-sequence-release-suite.mjs',
  workflow: '.github/workflows/artist-workspace-agent-suite.yml',
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
  'scripts/check-artist-workspace-avatar-sequence-release-integration.mjs',
  'scripts/check-project-art-avatar-sequence-release.mjs',
  'scripts/check-project-art-avatar-sequence-release-suite.mjs',
  'scripts/test-project-art-avatar-sequence-release.mjs',
  'scripts/test-project-art-avatar-sequence-release-mcp.mjs',
  'scripts/avatar-sequence-release-cli.mjs',
  'scripts/project-art/avatar-sequence-release.mjs',
  'scripts/project-art/avatar-sequence-release-fixture.mjs',
  'tools/project_art_avatar_sequence_release_mcp.mjs',
]) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

const v5 = JSON.parse(content.get('v5'));
const v6 = JSON.parse(content.get('v6'));
assert.equal(v5.schema, 'evavo.artist-workspace-agent-suite.v1');
assert.equal(v5.version, 5);
assert.equal(v6.schema, 'evavo.artist-workspace-agent-suite.v1');
assert.equal(v6.version, 6);
assert.deepEqual(v6.servers.slice(0, v5.servers.length), v5.servers);
assert.deepEqual(v6.servers.map((entry) => entry.id), [
  ...v5.servers.map((entry) => entry.id),
  'evavo-project-art-avatar-sequence-release',
]);
assert.equal(v6.servers.length, 9);
assert.equal(v6.servers.every((entry) => entry.defaultWriteEnabled === false), true);
for (const value of Object.values(v6.authority)) assert.equal(value, false);

const server = v6.servers.at(-1);
assert.equal(server.entrypoint, 'tools/project_art_avatar_sequence_release_mcp.mjs');
assert.equal(server.workspaceRootsEnvironment, 'EVAVO_ART_AVATAR_SEQUENCE_RELEASE_ROOTS');
assert.equal(server.writeGateEnvironment, 'EVAVO_ART_AVATAR_SEQUENCE_RELEASE_MCP_ALLOW_WRITE');
for (const group of [
  'exact-mastering-plan-and-final-frame-evidence',
  'passed-loop-plan-review-and-receipt-admission',
  'timing-and-release-basis-hashing',
  'named-human-art-animation-and-runtime-approvals',
  'atomic-create-only-sequence-release-sealing',
]) {
  assert.equal(server.toolGroups.includes(group), true, `release server is missing ${group}`);
}

const flow = v6.flows.find(
  (entry) => entry.id === 'avatar-final-pass-redraw-and-inbetween-submission',
);
assert.ok(flow, 'v6 avatar flow is required');
for (const step of [
  'evavo_art_review_avatar_final_pass_provider_frame',
  'rerun-avatar-sequence-timing-and-final-to-first-loop-closure',
  'evavo_art_avatar_sequence_release_capabilities',
  'bind-final-frame-review-outcomes-and-reviewed-target-bytes',
  'bind-passed-loop-plan-review-and-receipt-for-every-true-loop',
  'record-named-human-art-animation-and-runtime-release-approvals',
  'evavo_art_seal_avatar_sequence_release',
  'separate-runtime-pack-inspection-and-activation',
]) {
  assert.equal(flow.steps.includes(step), true, `v6 avatar flow is missing ${step}`);
}

const config = JSON.parse(content.get('config'));
const configured = config.mcpServers?.['evavo-project-art-avatar-sequence-release'];
assert.ok(configured, 'canonical Windows config must register the sequence release server');
assert.equal(configured.command, 'node');
assert.deepEqual(configured.args, [
  'C:\\GitRepos\\evavo-art-studio\\tools\\project_art_avatar_sequence_release_mcp.mjs',
]);
assert.equal(configured.env.EVAVO_ART_AVATAR_SEQUENCE_RELEASE_MCP_ALLOW_WRITE, 'false');
assert.ok(configured.env.EVAVO_ART_AVATAR_SEQUENCE_RELEASE_ROOTS.includes('ArtWorkspaces'));
const standalone = JSON.parse(content.get('standaloneConfig'));
assert.deepEqual(standalone.mcpServers['evavo-project-art-avatar-sequence-release'], configured);

for (const token of [
  'evavo_art_avatar_sequence_release_capabilities',
  'evavo_art_seal_avatar_sequence_release',
  'EVAVO_ART_AVATAR_SEQUENCE_RELEASE_ROOTS',
  'EVAVO_ART_AVATAR_SEQUENCE_RELEASE_MCP_ALLOW_WRITE',
  'imageBytesThroughMcp: false',
  'runtimeActivation: false',
  'repositoryMutation: false',
  'gitPublication: false',
  'forcePush: false',
]) {
  assert.equal(content.get('mcp').includes(token), true, `sequence release MCP is missing ${token}`);
}

for (const token of [
  'nine deliberately separate path-only servers',
  'all nine write gates set to `false`',
  'evavo-project-art-avatar-sequence-release',
  'passed final-to-first loop evidence for every true loop',
  'named-human art, animation and runtime release approvals',
  'atomic reviewed sequence release seal',
  'runtime activation remains separate',
  'normal non-force',
]) {
  assert.equal(
    content.get('agentDocs').toLowerCase().includes(token.toLowerCase()),
    true,
    `agent-suite docs are missing ${token}`,
  );
}
for (const token of [
  'final-frame-admitted',
  'passed loop-closure receipt',
  'art, animation and runtime',
  'sequence-release-sealed-awaiting-runtime-activation',
  'sequence-release.json',
  'runtime-pack.json',
  'receipt.json',
  'runtime activation remains separate',
]) {
  assert.equal(
    content.get('releaseDocs').toLowerCase().includes(token.toLowerCase()),
    true,
    `sequence release docs are missing ${token}`,
  );
}
for (const token of [
  'config/artist-workspace-agent-suite.v6.json',
  'config/mcp.project-art-avatar-sequence-release.windows.example.json',
  'docs/PROJECT_ART_AVATAR_SEQUENCE_RELEASE.md',
  'scripts/avatar-sequence-release-cli.mjs',
  'scripts/check-artist-workspace-avatar-sequence-release-integration.mjs',
  'scripts/check-project-art-avatar-sequence-release-suite.mjs',
  'scripts/project-art/avatar-sequence-release*.mjs',
  'scripts/test-project-art-avatar-sequence-release*.mjs',
  'tools/project_art_avatar_sequence_release_mcp.mjs',
]) {
  assert.equal(content.get('workflow').includes(token), true, `workflow is missing ${token}`);
}

const suite = spawnSync(
  process.execPath,
  [path.join(root, 'scripts/check-project-art-avatar-sequence-release-suite.mjs')],
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

console.log('Artist Workspace avatar sequence release integration guard passed.');
console.log('- v1 through v5 remain immutable and supported');
console.log('- v6 adds exact reviewed-frame, loop-evidence and timing-bound release sealing');
console.log('- all nine local servers remain independently rooted and write-disabled by default');
console.log('- runtime activation, repository publication and force push remain separate');
