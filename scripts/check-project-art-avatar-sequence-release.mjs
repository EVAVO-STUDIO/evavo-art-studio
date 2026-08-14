#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = Object.freeze({
  core: 'scripts/project-art/avatar-sequence-release.mjs',
  fixture: 'scripts/project-art/avatar-sequence-release-fixture.mjs',
  cli: 'scripts/avatar-sequence-release-cli.mjs',
  tests: 'scripts/test-project-art-avatar-sequence-release.mjs',
  mcpTests: 'scripts/test-project-art-avatar-sequence-release-mcp.mjs',
  mcp: 'tools/project_art_avatar_sequence_release_mcp.mjs',
  docs: 'docs/PROJECT_ART_AVATAR_SEQUENCE_RELEASE.md',
  config: 'config/mcp.project-art-avatar-sequence-release.windows.example.json',
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

function requireTokens(label, tokens) {
  const source = content.get(label);
  for (const token of tokens) {
    assert.equal(source.includes(token), true, `${label} is missing ${token}`);
  }
}

function forbidTokens(label, tokens) {
  const source = content.get(label);
  for (const token of tokens) {
    assert.equal(source.includes(token), false, `${label} must not contain ${token}`);
  }
}

requireTokens('core', [
  'evavo.project-art-avatar-sequence-release-request.v1',
  'evavo.project-art-avatar-sequence-release.v1',
  'evavo.project-art-avatar-sequence-release-receipt.v1',
  'evavo_avatar_sequence_pack_v2',
  'final-frame-admitted',
  'evavo.project-art-loop-closure-receipt.v1',
  'sourceHashesRevalidatedBeforeExecution',
  'sourceHashesRevalidatedAfterExecution',
  'wholeRunAtomicPublication',
  'approve-sequence-release',
  "'art', 'animation', 'runtime'",
  'sequence-release-sealed-awaiting-runtime-activation',
  'runtimeActivationAllowed: false',
  'renameSync(staging, output.absolute)',
  'imageBytesThroughMcp: false',
  'sequenceReleaseSealing: false',
  'forcePush: false',
]);
requireTokens('cli', [
  "command must be capabilities or seal",
  'sealAvatarSequenceReleaseFiles',
  'sequenceReleaseSealed: true',
  'runtimeActivationAllowed: false',
]);
requireTokens('mcp', [
  'evavo_art_avatar_sequence_release_capabilities',
  'evavo_art_seal_avatar_sequence_release',
  'EVAVO_ART_AVATAR_SEQUENCE_RELEASE_ROOTS',
  'EVAVO_ART_AVATAR_SEQUENCE_RELEASE_MCP_ALLOW_WRITE',
  'imageBytesThroughMcp: false',
  'runtimeActivation: false',
  'gitPublication: false',
  'forcePush: false',
]);
requireTokens('tests', [
  'final-frame-admitted',
  'AVATAR_SEQUENCE_RELEASE_FRAME_NOT_ADMITTED',
  'AVATAR_SEQUENCE_RELEASE_LOOP_REVIEW_FAILED',
  'AVATAR_SEQUENCE_RELEASE_TIMING_HASH_MISMATCH',
  'AVATAR_SEQUENCE_RELEASE_APPROVAL_TIME_INVALID',
  'AVATAR_SEQUENCE_RELEASE_EXISTING_BUNDLE_INVALID',
]);
requireTokens('mcpTests', [
  'MCP seal remains disabled',
  'without transporting image bytes',
  'workspace and request path escapes',
]);
requireTokens('docs', [
  'final-frame-admitted',
  'passed loop-closure receipt',
  'art, animation and runtime',
  'runtime activation remains separate',
  'sequence-release.json',
  'runtime-pack.json',
  'receipt.json',
  'normal non-force',
]);
requireTokens('config', [
  'evavo-project-art-avatar-sequence-release',
  'project_art_avatar_sequence_release_mcp.mjs',
  'EVAVO_ART_AVATAR_SEQUENCE_RELEASE_ROOTS',
  'EVAVO_ART_AVATAR_SEQUENCE_RELEASE_MCP_ALLOW_WRITE',
  'false',
]);
forbidTokens('core', [
  'child_process',
  'execSync(',
  'spawnSync(',
  'shell: true',
  'runtimeActivationAllowed: true',
  'forcePush: true',
]);
forbidTokens('mcp', [
  'imageBase64',
  'Buffer.from(args.image',
  'runtimeActivation: true',
  'forcePush: true',
]);

console.log('Project Art avatar sequence release static guard passed.');
console.log('- exact final-frame admissions and target PNG bytes are revalidated');
console.log('- every true loop requires a passed atomic loop-closure receipt');
console.log('- art, animation and runtime approvals bind one timing and release basis hash');
console.log('- the release, runtime pack and receipt publish atomically and create-only');
console.log('- runtime activation, repository publication and force push remain unavailable');
