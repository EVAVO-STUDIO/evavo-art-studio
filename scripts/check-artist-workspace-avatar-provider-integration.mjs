#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = Object.freeze({
  legacyManifest: 'config/artist-workspace-agent-suite.v1.json',
  manifest: 'config/artist-workspace-agent-suite.v2.json',
  config: 'config/mcp.project-art-workspace.windows.example.json',
  docs: 'docs/ARTIST_WORKSPACE_AGENT_SUITE.md',
  providerDocs: 'docs/PROJECT_ART_AVATAR_FINAL_PASS_PROVIDER.md',
  providerMcp: 'tools/project_art_avatar_final_pass_provider_mcp.mjs',
  providerSuite: 'scripts/check-project-art-avatar-final-pass-provider-suite.mjs',
});

const content = new Map();
for (const [label, relative] of Object.entries(files)) {
  const absolute = path.join(root, relative);
  const metadata = lstatSync(absolute);
  assert.equal(metadata.isFile(), true, `${relative} must be a file`);
  assert.equal(metadata.isSymbolicLink(), false, `${relative} must not be symbolic`);
  assert.equal(metadata.nlink, 1, `${relative} must be single-link`);
  assert.ok(metadata.size > 0 && metadata.size < 4_000_000, `${relative} has invalid size`);
  const source = readFileSync(absolute, 'utf8');
  assert.equal(source.startsWith('\uFEFF'), false, `${relative} has a BOM`);
  assert.equal(source.includes('\r'), false, `${relative} must use LF line endings`);
  content.set(label, source);
}

for (const relative of [
  'scripts/check-artist-workspace-avatar-provider-integration.mjs',
  'scripts/check-project-art-avatar-final-pass-provider-suite.mjs',
  'tools/project_art_avatar_final_pass_provider_mcp.mjs',
]) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

const legacy = JSON.parse(content.get('legacyManifest'));
assert.equal(legacy.schema, 'evavo.artist-workspace-agent-suite.v1');
assert.equal(legacy.version, 1);
assert.deepEqual(
  legacy.servers.map((entry) => entry.id),
  [
    'evavo-project-art-workspace',
    'evavo-project-art-workspace-ingest',
    'evavo-project-art-workspace-catalog',
    'evavo-project-art-workspace-jobs',
  ],
);

const manifest = JSON.parse(content.get('manifest'));
assert.equal(manifest.schema, 'evavo.artist-workspace-agent-suite.v1');
assert.equal(manifest.version, 2);
assert.equal(manifest.configuration, 'config/mcp.project-art-workspace.windows.example.json');
assert.deepEqual(
  manifest.servers.map((entry) => entry.id),
  [
    'evavo-project-art-workspace',
    'evavo-project-art-workspace-ingest',
    'evavo-project-art-workspace-catalog',
    'evavo-project-art-workspace-jobs',
    'evavo-project-art-avatar-final-pass-provider',
  ],
);
assert.equal(manifest.servers.every((entry) => entry.defaultWriteEnabled === false), true);
for (const value of Object.values(manifest.authority)) assert.equal(value, false);

const providerServer = manifest.servers.find(
  (entry) => entry.id === 'evavo-project-art-avatar-final-pass-provider',
);
assert.ok(providerServer, 'v2 manifest must register the avatar provider server');
assert.equal(
  providerServer.entrypoint,
  'tools/project_art_avatar_final_pass_provider_mcp.mjs',
);
assert.equal(
  providerServer.workspaceRootsEnvironment,
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ROOTS',
);
assert.equal(
  providerServer.writeGateEnvironment,
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_MCP_ALLOW_WRITE',
);
for (const group of [
  'sealed-final-pass-provider-compilation',
  'one-candidate-redraw-envelopes',
  'anatomy-safe-inbetween-envelopes',
  'final-endpoint-hash-gating',
]) {
  assert.equal(providerServer.toolGroups.includes(group), true, `provider server is missing ${group}`);
}

const providerFlow = manifest.flows.find(
  (entry) => entry.id === 'avatar-final-pass-redraw-and-inbetween-submission',
);
assert.ok(providerFlow, 'v2 manifest must define the avatar final-pass provider flow');
for (const step of [
  'admit-canonical-identity-and-endpoint-artifacts',
  'record-named-human-run-once-authorization',
  'evavo_art_avatar_final_pass_provider_capabilities',
  'evavo_art_compile_avatar_final_pass_provider_batch',
  'separate-write-enabled-provider-runtime-submission',
  'independent-candidate-visual-review',
  'rerun-avatar-frame-finisher-and-loop-closure',
]) {
  assert.equal(providerFlow.steps.includes(step), true, `provider flow is missing ${step}`);
}

const config = JSON.parse(content.get('config'));
const configured = config.mcpServers?.['evavo-project-art-avatar-final-pass-provider'];
assert.ok(configured, 'canonical Windows config must register the avatar provider server');
assert.equal(configured.command, 'node');
assert.deepEqual(configured.args, [
  'C:\\GitRepos\\evavo-art-studio\\tools\\project_art_avatar_final_pass_provider_mcp.mjs',
]);
assert.equal(
  configured.env.EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_MCP_ALLOW_WRITE,
  'false',
);
assert.ok(
  configured.env.EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ROOTS.includes('ArtWorkspaces'),
);
assert.ok(
  configured.env.EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ROOTS.includes('Evidence'),
);

const providerMcp = content.get('providerMcp');
for (const token of [
  'evavo_art_avatar_final_pass_provider_capabilities',
  'evavo_art_compile_avatar_final_pass_provider_batch',
  'humanRunOnceAuthorization: true',
  'humanAdmittedReferenceArtifacts: true',
  'finalEndpointHashesForInbetweens: true',
  'oneCandidateProviderRequests: true',
  'sourceImageBytesFlowThroughMcp: false',
  'shellExecution: false',
  'providerExecution: false',
  'candidateApproval: false',
  'candidatePromotion: false',
  'repositoryMutation: false',
  'gitPush: false',
  'runtimeActivation: false',
  'forcePush: false',
]) {
  assert.equal(providerMcp.includes(token), true, `avatar provider MCP is missing ${token}`);
}

const docs = content.get('docs');
for (const token of [
  'five deliberately separate path-only servers',
  'evavo-project-art-avatar-final-pass-provider',
  'named-human',
  'one-candidate',
  'final reviewed SHA-256',
  'rerun frame finishing, registration and loop closure',
  'all five write gates set to `false`',
  'provider execution',
  'runtime activation',
]) {
  assert.equal(docs.toLowerCase().includes(token.toLowerCase()), true, `agent-suite docs are missing ${token}`);
}

const providerDocs = content.get('providerDocs');
for (const token of [
  'one-candidate provider submissions',
  'before-frame-final-output-required',
  'after-frame-final-output-required',
  'run-provider-once',
  'fallback = false',
  'candidate. It must be visually reviewed',
]) {
  assert.equal(providerDocs.includes(token), true, `provider docs are missing ${token}`);
}

const suite = spawnSync(
  process.execPath,
  [path.join(root, 'scripts/check-project-art-avatar-final-pass-provider-suite.mjs')],
  {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
  },
);
if (suite.stdout) process.stdout.write(suite.stdout);
if (suite.stderr) process.stderr.write(suite.stderr);
assert.equal(suite.status, 0, suite.stderr || suite.stdout);

console.log('Artist Workspace avatar provider integration guard passed.');
console.log('- v1 remains immutable and supported');
console.log('- v2 registers the one-candidate avatar redraw and in-between compiler');
console.log('- canonical Windows deployment keeps provider-batch writes disabled by default');
console.log('- provider execution, approval, repository mutation and runtime activation remain separate');
