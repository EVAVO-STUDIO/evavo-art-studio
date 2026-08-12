#!/usr/bin/env node

import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const MAXIMUM_SOURCE_BYTES = 3 * 1024 * 1024;
const CONFLICT_MARKER = /^(?:<{7}|={7}|>{7})(?: |$)/mu;
const files = Object.freeze({
  common: 'scripts/project-art/avatar-sequence-bundle-common.mjs',
  fixture: 'scripts/project-art/avatar-sequence-bundle-fixture.mjs',
  writer: 'scripts/write-project-art-avatar-sequence-bundle.mjs',
  guard: 'scripts/check-project-art-avatar-sequence-bundle.mjs',
  tests: 'scripts/test-project-art-avatar-sequence-bundle.mjs',
  mcpTests: 'scripts/test-project-art-avatar-sequence-bundle-mcp.mjs',
  mcp: 'tools/project_art_avatar_sequence_bundle_mcp.mjs',
  documentation: 'docs/PROJECT_ART_AVATAR_SEQUENCE_BUNDLES.md',
  config: 'config/mcp.project-art-avatar-sequence-bundle.windows.example.json',
  workflow: '.github/workflows/project-art-avatar-sequence-bundle.yml',
});

function snapshot(metadata) {
  return {
    mode: metadata.mode,
    device: metadata.dev,
    inode: metadata.ino,
    links: metadata.nlink,
    size: metadata.size,
    modifiedMs: metadata.mtimeMs,
    changedMs: metadata.ctimeMs,
  };
}

function sameSnapshot(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

function read(relative) {
  const absolute = path.join(root, relative);
  let before;
  try {
    before = lstatSync(absolute);
  } catch {
    errors.push(`Missing Project Art avatar-sequence bundle file: ${relative}`);
    return '';
  }
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.nlink !== 1 ||
    before.size < 1 ||
    before.size > MAXIMUM_SOURCE_BYTES
  ) {
    errors.push(`Unsafe Project Art avatar-sequence bundle file: ${relative}`);
    return '';
  }
  const beforeSnapshot = snapshot(before);
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  if (!sameSnapshot(beforeSnapshot, snapshot(after))) {
    errors.push(`Project Art avatar-sequence bundle file changed during read: ${relative}`);
    return '';
  }
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    errors.push(`Project Art avatar-sequence bundle file is not valid UTF-8: ${relative}`);
    return '';
  }
  if (source.startsWith('\uFEFF')) {
    errors.push(`Project Art avatar-sequence bundle file has a UTF-8 BOM: ${relative}`);
  }
  if (source.includes('\r')) {
    errors.push(`Project Art avatar-sequence bundle file must use LF endings: ${relative}`);
  }
  if (!source.endsWith('\n')) {
    errors.push(`Project Art avatar-sequence bundle file needs a final newline: ${relative}`);
  }
  if (/[ \t]+$/mu.test(source)) {
    errors.push(`Project Art avatar-sequence bundle file has trailing whitespace: ${relative}`);
  }
  if (CONFLICT_MARKER.test(source)) {
    errors.push(`Project Art avatar-sequence bundle file has a conflict marker: ${relative}`);
  }
  return source;
}

function requireTokens(label, source, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) errors.push(`${label} is missing: ${token}`);
  }
}

function forbidTokens(label, source, tokens) {
  for (const token of tokens) {
    if (source.includes(token)) errors.push(`${label} contains forbidden material: ${token}`);
  }
}

function count(source, token) {
  return source.split(token).length - 1;
}

const source = Object.fromEntries(
  Object.entries(files).map(([key, relative]) => [key, read(relative)]),
);

requireTokens('Bundle common contract', source.common, [
  'evavo.project-art-avatar-sequence-mastering-plan.v1',
  'evavo.project-art-avatar-sequence-bundle.v1',
  'evavo.project-art-avatar-sequence-bundle-receipt.v1',
  'evavo_avatar_sequence_pack_v2',
  'evavo_avatar_sequence_loop_closure_evidence_v1',
  'runtimeActivation',
  'verifyDocumentHash',
  'parseFalseAuthority',
]);

requireTokens('Bundle writer', source.writer, [
  'writeProjectArtAvatarSequenceBundle',
  'sourcePlanRevalidatedBeforePublication: true',
  'wholeRunAtomicPublication: true',
  'workspace-file-plan-request.json',
  'runtime-draft.json',
  "path.join(staging, 'loop-closure')",
  'manifest.json',
  'receipt.json',
  'fsConstants.O_EXCL',
  'fsConstants.O_NOFOLLOW',
  'renameSync(staging, output.absolutePath)',
  'rmSync(staging, { recursive: true, force: true })',
  'runtimeActivationAllowed: false',
  'bytesFlowThroughMcp: false',
  'sourceMutation: false',
  'targetImageWrite: false',
  'providerExecution: false',
  'repositoryMutation: false',
  'gitPush: false',
  'publication: false',
]);
forbidTokens('Bundle writer', source.writer, [
  'fetch(',
  'node:child_process',
  'shell: true',
  'providerExecution: true',
  'targetRepositoryMutation: true',
  'git push',
  'runtimeActivationAllowed: true',
  'forcePush: true',
]);

requireTokens('Bundle tests', source.tests, [
  'Project Art avatar-sequence bundle tests passed.',
  'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_OUTPUT_EXISTS',
  'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_DOCUMENT_HASH_MISMATCH',
  'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_EXPLICIT_ASSIGNMENT_REQUIRED',
  'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RUNTIME_DRAFT_INVALID',
  'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_PLAN_AUTHORITY_INVALID',
  'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_LOOP_REQUESTS_INVALID',
  'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_PATH_SYMLINK',
  'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_FILE_UNSAFE',
  'PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_PATH_ESCAPE',
  'wholeRunAtomicPublication',
]);

requireTokens('Bundle MCP', source.mcp, [
  'evavo.project-art-avatar-sequence-bundle-capabilities.v1',
  'evavo_art_avatar_sequence_bundle_capabilities',
  'evavo_art_write_avatar_sequence_bundle',
  'EVAVO_ART_AVATAR_SEQUENCE_BUNDLE_ROOTS',
  'EVAVO_ART_AVATAR_SEQUENCE_BUNDLE_MCP_ALLOW_WRITE',
  'EVAVO_ART_AVATAR_SEQUENCE_BUNDLE_MCP_TIMEOUT_MS',
  'sourcePlanRevalidatedBeforePublication: true',
  'wholeRunAtomicPublication: true',
  'bytesFlowThroughMcp: false',
  'credentialsForwardedToSubprocess: false',
  'rawCommandOutputReturned: false',
  'runtimeActivation: false',
  'shell: false',
  'contains a symbolic-link component',
]);
forbidTokens('Bundle MCP', source.mcp, [
  'shell: true',
  'providerExecution: true',
  'repositoryMutation: true',
  'gitPush: true',
  'publication: true',
  'runtimeActivation: true',
  'git push',
]);

requireTokens('Bundle MCP tests', source.mcpTests, [
  'Project Art avatar-sequence bundle MCP tests passed.',
  'bundle writes are disabled',
  'create-only and already exists',
  'outside EVAVO_ART_AVATAR_SEQUENCE_BUNDLE_ROOTS',
  'bytesFlowThroughMcp',
  'credentialsForwardedToSubprocess',
  'runtimeActivation',
]);

requireTokens('Bundle documentation', source.documentation, [
  '# Project Art avatar-sequence bundles',
  'does not generate or edit images',
  'owner-declared-only',
  'runtimeDraft.review: null',
  'runtimeDraft.loopClosures: []',
  'sourcePlanRevalidatedBeforePublication',
  'whole-run atomic',
  'workspace-file-plan-request.json',
  'runtime-draft.json',
  'evavo_art_write_avatar_sequence_bundle',
  'Image bytes and raw command output do not flow through MCP',
  'runtimeActivation: false',
]);

let config;
try {
  config = JSON.parse(source.config);
} catch {
  errors.push('Avatar-sequence bundle MCP example is not valid JSON');
}
if (
  config?.mcpServers?.['evavo-project-art-avatar-sequence-bundle']?.command !== 'node' ||
  !config?.mcpServers?.['evavo-project-art-avatar-sequence-bundle']?.args?.[0]?.endsWith(
    'tools\\project_art_avatar_sequence_bundle_mcp.mjs',
  ) ||
  config?.mcpServers?.['evavo-project-art-avatar-sequence-bundle']?.env
    ?.EVAVO_ART_AVATAR_SEQUENCE_BUNDLE_MCP_ALLOW_WRITE !== 'false'
) {
  errors.push('Avatar-sequence bundle MCP example drifted');
}

const workflowPaths = [
  'scripts/project-art/avatar-sequence-bundle-common.mjs',
  'scripts/project-art/avatar-sequence-bundle-fixture.mjs',
  'scripts/write-project-art-avatar-sequence-bundle.mjs',
  'scripts/check-project-art-avatar-sequence-bundle.mjs',
  'scripts/test-project-art-avatar-sequence-bundle.mjs',
  'scripts/test-project-art-avatar-sequence-bundle-mcp.mjs',
  'tools/project_art_avatar_sequence_bundle_mcp.mjs',
  'docs/PROJECT_ART_AVATAR_SEQUENCE_BUNDLES.md',
  'config/mcp.project-art-avatar-sequence-bundle.windows.example.json',
  '.github/workflows/project-art-avatar-sequence-bundle.yml',
  'scripts/compile-project-art-avatar-sequence.mjs',
  'scripts/check-project-art-avatar-sequence.mjs',
];
for (const workflowPath of workflowPaths) {
  if (count(source.workflow, `- "${workflowPath}"`) !== 2) {
    errors.push(
      `Avatar-sequence bundle workflow must trigger on pull_request and main push for ${workflowPath}`,
    );
  }
}
requireTokens('Bundle workflow', source.workflow, [
  'permissions:\n  contents: read',
  'persist-credentials: false',
  'node-version: "22.14.0"',
  'Run atomic bundle writer adversaries',
  'Run callable bundle MCP adversaries',
  'Recheck upstream avatar-sequence compiler boundary',
  'node scripts/check-project-art-avatar-sequence-bundle.mjs',
  'node --test scripts/test-project-art-avatar-sequence-bundle.mjs',
  'node scripts/test-project-art-avatar-sequence-bundle-mcp.mjs',
  'node scripts/check-project-art-avatar-sequence.mjs',
  'git diff --exit-code',
]);



const writer = await import('./write-project-art-avatar-sequence-bundle.mjs');
if (
  writer.PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_SCHEMA !==
    'evavo.project-art-avatar-sequence-bundle.v1' ||
  writer.PROJECT_ART_AVATAR_SEQUENCE_BUNDLE_RECEIPT_SCHEMA !==
    'evavo.project-art-avatar-sequence-bundle-receipt.v1' ||
  typeof writer.writeProjectArtAvatarSequenceBundle !== 'function'
) {
  errors.push('Avatar-sequence bundle writer public exports are incomplete');
}

if (errors.length) {
  console.error('Project Art avatar-sequence bundle guard failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Project Art avatar-sequence bundle guard passed.');
console.log('- exact mastering plans materialize into content-addressed path-and-hash handoffs');
console.log('- stable single-link plan input is revalidated before atomic publication');
console.log('- workspace requests, inactive runtime drafts and loop requests publish together or not at all');
console.log('- the MCP surface is bounded, credential-redacted, write-gated and create-only');
console.log('- no image, source, provider, repository, Git, deployment, publication or runtime-activation authority was introduced');
