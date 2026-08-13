#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = Object.freeze({
  v4: 'config/artist-workspace-agent-suite.v4.json',
  v5: 'config/artist-workspace-agent-suite.v5.json',
  config: 'config/mcp.project-art-workspace.windows.example.json',
  standaloneConfig: 'config/mcp.project-art-avatar-final-pass-provider-frame-finisher.windows.example.json',
  docs: 'docs/PROJECT_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER.md',
  core: 'scripts/project-art/avatar-final-pass-provider-frame-finisher.mjs',
  cli: 'scripts/avatar-final-pass-provider-frame-finisher-cli.mjs',
  mcp: 'tools/project_art_avatar_final_pass_provider_frame_finisher_mcp.mjs',
  suite: 'scripts/check-project-art-avatar-final-pass-provider-frame-finisher-suite.mjs',
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
  'scripts/check-artist-workspace-avatar-provider-frame-finisher-integration.mjs',
  'scripts/check-project-art-avatar-final-pass-provider-frame-finisher.mjs',
  'scripts/check-project-art-avatar-final-pass-provider-frame-finisher-suite.mjs',
  'scripts/test-project-art-avatar-final-pass-provider-frame-finisher.mjs',
  'scripts/test-project-art-avatar-final-pass-provider-frame-finisher-mcp.mjs',
  'scripts/avatar-final-pass-provider-frame-finisher-cli.mjs',
  'scripts/project-art/avatar-final-pass-provider-frame-finisher.mjs',
  'tools/project_art_avatar_final_pass_provider_frame_finisher_mcp.mjs',
]) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], {
    cwd: root, encoding: 'utf8', shell: false, windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
const v4 = JSON.parse(content.get('v4'));
const v5 = JSON.parse(content.get('v5'));
assert.equal(v4.schema, 'evavo.artist-workspace-agent-suite.v1');
assert.equal(v4.version, 4);
assert.equal(v5.schema, 'evavo.artist-workspace-agent-suite.v1');
assert.equal(v5.version, 5);
assert.deepEqual(v5.servers.slice(0, v4.servers.length), v4.servers);
assert.deepEqual(v5.servers.map((entry) => entry.id), [
  ...v4.servers.map((entry) => entry.id),
  'evavo-project-art-avatar-final-pass-provider-frame-finisher',
]);
assert.equal(v5.servers.every((entry) => entry.defaultWriteEnabled === false), true);
for (const value of Object.values(v5.authority)) assert.equal(value, false);
const server = v5.servers.at(-1);
assert.equal(server.entrypoint, 'tools/project_art_avatar_final_pass_provider_frame_finisher_mcp.mjs');
assert.equal(server.workspaceRootsEnvironment, 'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_ROOTS');
assert.equal(server.writeGateEnvironment, 'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_MCP_ALLOW_WRITE');
for (const group of [
  'exact-candidate-finisher-chain-validation',
  'strict-rgba-png-decoding-and-canonical-reencoding',
  'hidden-transparent-rgb-cleanup',
  'named-human-frame-review',
  'final-frame-hash-admission',
]) assert.equal(server.toolGroups.includes(group), true, `finisher server is missing ${group}`);
const flow = v5.flows.find((entry) => entry.id === 'avatar-final-pass-redraw-and-inbetween-submission');
assert.ok(flow, 'v5 avatar flow is required');
for (const step of [
  'evavo_art_materialize_avatar_final_pass_provider_candidate',
  'evavo_art_avatar_final_pass_provider_frame_finisher_capabilities',
  'evavo_art_finish_avatar_final_pass_provider_candidate',
  'record-named-human-art-anatomy-identity-continuity-decision',
  'evavo_art_review_avatar_final_pass_provider_frame',
  'rerun-avatar-sequence-timing-and-final-to-first-loop-closure',
  'seal-final-frame-sha-before-dependent-inbetween-or-sequence',
]) assert.equal(flow.steps.includes(step), true, `v5 avatar flow is missing ${step}`);
const config = JSON.parse(content.get('config'));
const configured = config.mcpServers?.['evavo-project-art-avatar-final-pass-provider-frame-finisher'];
assert.ok(configured, 'canonical Windows config must register the frame finisher');
assert.equal(configured.command, 'node');
assert.deepEqual(configured.args, [
  'C:\\GitRepos\\evavo-art-studio\\tools\\project_art_avatar_final_pass_provider_frame_finisher_mcp.mjs',
]);
assert.equal(configured.env.EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_MCP_ALLOW_WRITE, 'false');
assert.ok(configured.env.EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_ROOTS.includes('ArtWorkspaces'));
const standalone = JSON.parse(content.get('standaloneConfig'));
assert.deepEqual(standalone.mcpServers['evavo-project-art-avatar-final-pass-provider-frame-finisher'], configured);
for (const token of [
  'evavo_art_avatar_final_pass_provider_frame_finisher_capabilities',
  'evavo_art_finish_avatar_final_pass_provider_candidate',
  'evavo_art_review_avatar_final_pass_provider_frame',
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_ROOTS',
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_FRAME_FINISHER_MCP_ALLOW_WRITE',
  'visiblePixelMutation: false',
  'alphaMutation: false',
  'sequenceRelease: false',
  'runtimeActivation: false',
]) assert.equal(content.get('mcp').includes(token), true, `frame-finisher MCP is missing ${token}`);
for (const token of [
  'hidden rgb', 'visible pixels', 'alpha', 'named-human',
  'hands and anatomy', 'face identity', 'final-frame-admitted',
  'frame-repair-required', 'sequence release', 'runtime activation',
]) assert.equal(content.get('docs').toLowerCase().includes(token.toLowerCase()), true, `frame-finisher docs are missing ${token}`);
const suite = spawnSync(process.execPath, [path.join(root, 'scripts/check-project-art-avatar-final-pass-provider-frame-finisher-suite.mjs')], {
  cwd: root, encoding: 'utf8', shell: false, windowsHide: true,
  timeout: 180_000, maxBuffer: 32 * 1024 * 1024,
});
if (suite.stdout) process.stdout.write(suite.stdout);
if (suite.stderr) process.stderr.write(suite.stderr);
assert.equal(suite.status, 0, suite.stderr || suite.stdout);
console.log('Artist Workspace avatar provider frame-finisher integration guard passed.');
console.log('- v1 through v4 remain immutable and supported');
console.log('- v5 adds exact deterministic finishing and named-human final-frame admission');
console.log('- all eight local servers remain independently rooted and write-disabled by default');
console.log('- sequence release, repository publication and runtime activation remain separate');
