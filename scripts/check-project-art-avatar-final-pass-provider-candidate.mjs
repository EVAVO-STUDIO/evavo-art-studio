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
const sources = Object.freeze([
  'scripts/project-art/avatar-final-pass-provider-candidate-constants.mjs',
  'scripts/project-art/avatar-final-pass-provider-candidate-common.mjs',
  'scripts/project-art/avatar-final-pass-provider-candidate-png.mjs',
  'scripts/project-art/avatar-final-pass-provider-candidate-source.mjs',
  'scripts/project-art/avatar-final-pass-provider-candidate-materialize.mjs',
  'scripts/project-art/avatar-final-pass-provider-candidate-fixture.mjs',
  'scripts/project-art/avatar-final-pass-provider-candidate.mjs',
  'scripts/avatar-final-pass-provider-candidate-cli.mjs',
  'tools/project_art_avatar_final_pass_provider_candidate_mcp.mjs',
  'scripts/test-project-art-avatar-final-pass-provider-candidate.mjs',
  'scripts/test-project-art-avatar-final-pass-provider-candidate-mcp.mjs',
]);

const content = new Map();
for (const relative of sources) {
  const absolute = path.join(root, relative);
  const metadata = lstatSync(absolute);
  assert.equal(metadata.isFile(), true, `${relative} must be a file`);
  assert.equal(metadata.isSymbolicLink(), false, `${relative} must not be symbolic`);
  assert.equal(metadata.nlink, 1, `${relative} must be single-link`);
  assert.ok(metadata.size > 0 && metadata.size < 8_000_000, `${relative} has invalid size`);
  const source = readFileSync(absolute, 'utf8');
  assert.equal(source.startsWith('\uFEFF'), false, `${relative} has a BOM`);
  assert.equal(source.includes('\r'), false, `${relative} must use LF`);
  assert.equal(source.endsWith('\n'), true, `${relative} needs final newline`);
  for (const line of source.split('\n')) {
    assert.equal(/[ \t]+$/u.test(line), false, `${relative} has trailing whitespace`);
  }
  const syntax = spawnSync(process.execPath, ['--check', absolute], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
  content.set(relative, source);
}

const combined = [...content.values()].join('\n');
for (const forbidden of [
  'shell: true',
  'child_process.exec',
  'child_process.spawn',
  'eval(',
  'new Function(',
  'forcePush: true',
  'candidateApproval: true',
  'candidatePromotion: true',
  'runtimeActivation: true',
]) {
  assert.equal(combined.includes(forbidden), false, `forbidden token ${forbidden}`);
}

const png = content.get(
  'scripts/project-art/avatar-final-pass-provider-candidate-png.mjs',
);
for (const token of [
  'pngCrc32',
  'inflateSync',
  'AVATAR_PROVIDER_CANDIDATE_APNG_FORBIDDEN',
  'AVATAR_PROVIDER_CANDIDATE_PNG_OPAQUE_BACKGROUND',
  'AVATAR_PROVIDER_CANDIDATE_PNG_EMPTY_ALPHA',
  'bitDepth === 8',
  'colorType === 6',
  'interlace === 0',
]) {
  assert.equal(png.includes(token), true, `PNG guard is missing ${token}`);
}

const materializer = content.get(
  'scripts/project-art/avatar-final-pass-provider-candidate-materialize.mjs',
);
for (const token of [
  'store.verify',
  'store.get',
  'store.read',
  'provider-candidate',
  'provider-candidate-evidence',
  'approvalState === \'unapproved\'',
  'linkSync',
  'fsyncSync',
  'AVATAR_PROVIDER_CANDIDATE_PARTIAL_PUBLICATION',
  'candidate-materialized-awaiting-frame-finisher',
  'finalSha256RequiredBeforeInbetweenOrSequenceUse',
  'rerun-avatar-frame-finisher',
  'review-hands-anatomy-face-identity-and-continuity',
]) {
  assert.equal(
    materializer.includes(token),
    true,
    `candidate materializer is missing ${token}`,
  );
}

const facade = content.get(
  'scripts/project-art/avatar-final-pass-provider-candidate.mjs',
);
for (const token of [
  '../../packages/artifacts/dist/index.js',
  'LocalArtifactStore',
  'imageBytesFlowThroughMcp: false',
  'candidateMaterialization: false',
  'candidateApproval: false',
  'runtimeActivation: false',
]) {
  assert.equal(facade.includes(token), true, `candidate facade is missing ${token}`);
}

const mcp = content.get(
  'tools/project_art_avatar_final_pass_provider_candidate_mcp.mjs',
);
for (const token of [
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_ROOTS',
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ARTIFACT_ROOTS',
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_MCP_ALLOW_WRITE',
  'evavo_art_materialize_avatar_final_pass_provider_candidate',
  'imageBytesFlowThroughMcp: false',
  'candidateApproval: false',
  'candidatePromotion: false',
  'runtimeActivation: false',
]) {
  assert.equal(mcp.includes(token), true, `candidate MCP is missing ${token}`);
}

console.log('Project Art avatar provider candidate static guard passed.');
console.log('- exact runtime dispatch, binding and outcome identities are revalidated');
console.log('- immutable candidate and provider evidence artifacts are verified twice');
console.log('- only one non-animated, 8-bit RGBA PNG on the exact canvas is admitted');
console.log('- candidate, receipt and finisher handoff publish create-only as one rollback-safe bundle');
console.log('- candidate approval, promotion, repository mutation and runtime activation remain unavailable');
