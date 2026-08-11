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
  compiler: 'scripts/compile-project-art-avatar-sequence.mjs',
  common: 'scripts/project-art/avatar-sequence-common.mjs',
  filesystem: 'scripts/project-art/avatar-sequence-filesystem.mjs',
  contract: 'scripts/project-art/avatar-sequence-contract.mjs',
  guard: 'scripts/check-project-art-avatar-sequence.mjs',
  tests: 'scripts/test-project-art-avatar-sequence.mjs',
  mcpTests: 'scripts/test-project-art-avatar-sequence-mcp.mjs',
  mcp: 'tools/project_art_avatar_sequence_mcp.mjs',
  documentation: 'docs/PROJECT_ART_AVATAR_SEQUENCE_MASTERING.md',
  config: 'config/mcp.project-art-avatar-sequence.windows.example.json',
  workflow: '.github/workflows/project-art-avatar-sequence.yml',
  loopCompiler: 'scripts/compile-project-art-loop-closure.mjs',
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
    errors.push(`Missing Project Art avatar-sequence file: ${relative}`);
    return '';
  }
  if (
    before.isSymbolicLink() ||
    !before.isFile() ||
    before.nlink !== 1 ||
    before.size < 1 ||
    before.size > MAXIMUM_SOURCE_BYTES
  ) {
    errors.push(`Unsafe Project Art avatar-sequence file: ${relative}`);
    return '';
  }
  const beforeSnapshot = snapshot(before);
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  if (!sameSnapshot(beforeSnapshot, snapshot(after))) {
    errors.push(`Project Art avatar-sequence file changed during read: ${relative}`);
    return '';
  }
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    errors.push(`Project Art avatar-sequence file is not valid UTF-8: ${relative}`);
    return '';
  }
  if (source.startsWith('\uFEFF')) {
    errors.push(`Project Art avatar-sequence file has a UTF-8 BOM: ${relative}`);
  }
  if (source.includes('\r')) {
    errors.push(`Project Art avatar-sequence file must use LF endings: ${relative}`);
  }
  if (/[ \t]+$/mu.test(source)) {
    errors.push(`Project Art avatar-sequence file has trailing whitespace: ${relative}`);
  }
  if (CONFLICT_MARKER.test(source)) {
    errors.push(`Project Art avatar-sequence file has a conflict marker: ${relative}`);
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

requireTokens('Avatar-sequence compiler', source.compiler, [
  'compileProjectArtAvatarSequence',
  'compileProjectArtAvatarSequenceFile',
  "request.assignmentMode !== 'owner-declared-only'",
  'request.semanticInferencePerformed !== false',
  'request.timestampOrderingUsedAsSemantics !== false',
  'PROJECT_ART_AVATAR_SEQUENCE_REQUEST_BYTES_MISMATCH',
  'PROJECT_ART_AVATAR_SEQUENCE_SOURCE_HASH_MISMATCH',
  'PROJECT_ART_AVATAR_SEQUENCE_FRAME_BYTES_DUPLICATE',
  'PROJECT_ART_AVATAR_SEQUENCE_TARGET_EXISTS',
  'workspaceFilePlanRequest',
  "type: 'copy'",
  'expectedSourceSha256',
  'runtimeDraft',
  'review: null',
  'loopClosures: Object.freeze([])',
  'runtimeActivationAllowed: false',
  'semanticInferencePerformed: false',
  'timestampOrderingUsedAsSemantics: false',
  'sourceIdentitiesReadStably: true',
  'allFramesHaveAlpha: true',
  'allRuntimePathsReviewed: true',
  'targetImageWrite: false',
  'providerExecution: false',
  'targetRepositoryMutation: false',
  'gitPush: false',
  'publication: false',
]);
forbidTokens('Avatar-sequence compiler', source.compiler, [
  'fetch(',
  'process.env',
  'node:child_process',
  'shell: true',
  'providerExecution: true',
  'candidateApproval: true',
  'candidatePromotion: true',
  'targetRepositoryMutation: true',
  'git push',
  'forcePush: true',
]);

requireTokens('Avatar-sequence common contract', source.common, [
  'evavo.project-art-avatar-sequence-request.v1',
  'evavo.project-art-avatar-sequence-mastering-plan.v1',
  'evavo_avatar_sequence_pack_v2',
  'evavo_avatar_sequence_loop_closure_evidence_v1',
  'evavo.project-art-loop-closure-request.v1',
  'maximumTotalSourceBytes',
  "'talk-loop'",
  "'ping-pong'",
]);

requireTokens('Avatar-sequence filesystem boundary', source.filesystem, [
  'O_NOFOLLOW',
  'metadata.nlink !== 1',
  'source byte boundary exceeded',
  'a non-animated PNG master',
  'a non-interlaced 8-bit alpha PNG master',
  'mastering copies are create-only',
]);
forbidTokens('Avatar-sequence filesystem boundary', source.filesystem, [
  'writeFileSync(',
  'renameSync(',
  'unlinkSync(',
  'rmSync(',
]);

requireTokens('Avatar-sequence semantic contract', source.contract, [
  'PROJECT_ART_AVATAR_SEQUENCE_FALSE_WRAP_REQUIREMENT',
  'True loop clips must use one path per ordered seam input',
  'once and ping-pong clips must not carry final-to-first thresholds',
  'PROJECT_ART_AVATAR_SEQUENCE_DEFAULT_CLIP_KIND_INVALID',
  'maximumChangedFraction',
  'requestCanonicalSha256',
]);

requireTokens('Avatar-sequence tests', source.tests, [
  'Project Art avatar-sequence mastering tests passed.',
  'PROJECT_ART_AVATAR_SEQUENCE_REQUEST_BYTES_MISMATCH',
  'PROJECT_ART_AVATAR_SEQUENCE_EXPLICIT_ASSIGNMENT_REQUIRED',
  'PROJECT_ART_AVATAR_SEQUENCE_SOURCE_HASH_MISMATCH',
  'PROJECT_ART_AVATAR_SEQUENCE_FRAME_BYTES_DUPLICATE',
  'PROJECT_ART_AVATAR_SEQUENCE_TARGET_PATH_INVALID',
  'PROJECT_ART_AVATAR_SEQUENCE_LOOP_FRAME_DUPLICATE',
  'PROJECT_ART_AVATAR_SEQUENCE_FALSE_WRAP_REQUIREMENT',
  'PROJECT_ART_AVATAR_SEQUENCE_AUTHORITY_INVALID',
  'PROJECT_ART_AVATAR_SEQUENCE_PNG_INVALID',
  'PROJECT_ART_AVATAR_SEQUENCE_DIMENSION_MISMATCH',
  'PROJECT_ART_AVATAR_SEQUENCE_PATH_SYMLINK',
  'PROJECT_ART_AVATAR_SEQUENCE_FILE_UNSAFE',
  'PROJECT_ART_AVATAR_SEQUENCE_TARGET_EXISTS',
  "['idle-main', 'talk-main', 'listen-main']",
  'workspaceFilePlanRequest.operations.length',
]);

requireTokens('Avatar-sequence MCP', source.mcp, [
  'evavo.project-art-avatar-sequence-capabilities.v1',
  'evavo_art_avatar_sequence_capabilities',
  'evavo_art_compile_avatar_sequence',
  'EVAVO_ART_AVATAR_SEQUENCE_ROOTS',
  'EVAVO_ART_AVATAR_SEQUENCE_MCP_ALLOW_WRITE',
  'EVAVO_ART_AVATAR_SEQUENCE_MCP_TIMEOUT_MS',
  'owner-declared-only',
  'semanticInferencePerformed: false',
  'timestampOrderingUsedAsSemantics: false',
  'workspaceFileOperationsArePathOnly: true',
  'runtimeActivationAllowed: false',
  'bytesFlowThroughMcp: false',
  'credentialsForwardedToSubprocess: false',
  'rawCommandOutputReturned: false',
  'sourceMutation: false',
  'targetImageWrite: false',
  'repositoryMutation: false',
  'gitPush: false',
  'publication: false',
  'shell: false',
  'contains a symbolic-link component',
]);
forbidTokens('Avatar-sequence MCP', source.mcp, [
  'shell: true',
  'providerExecution: true',
  'repositoryMutation: true',
  'gitPush: true',
  'publication: true',
  'git push',
]);

requireTokens('Avatar-sequence MCP tests', source.mcpTests, [
  'Project Art avatar-sequence MCP tests passed.',
  'evavo_art_avatar_sequence_capabilities',
  'evavo_art_compile_avatar_sequence',
  'plan writes are disabled',
  'create-only and already exists',
  'outside EVAVO_ART_AVATAR_SEQUENCE_ROOTS',
  'bytesFlowThroughMcp',
  'credentialsForwardedToSubprocess',
  'runtimeActivationAllowed',
]);

requireTokens('Avatar-sequence documentation', source.documentation, [
  '# Project Art avatar-sequence mastering',
  'explicit owner assignments over existing PNG frames',
  'semanticInferencePerformed: false',
  'timestampOrderingUsedAsSemantics: false',
  'evavo.project-art-avatar-sequence-request.v1',
  'evavo.project-art-avatar-sequence-mastering-plan.v1',
  'evavo_avatar_sequence_pack_v2',
  'evavo.project-art-loop-closure-request.v1',
  'review: null',
  'loopClosures: []',
  'runtimeActivationAllowed: false',
  'workspaceFilePlanRequest',
  'evavo_art_compile_avatar_sequence',
  'Source image bytes do not flow through MCP',
  'No source, provider, repository, Git, deployment or publication authority',
]);

let config;
try {
  config = JSON.parse(source.config);
} catch {
  errors.push('Avatar-sequence MCP example is not valid JSON');
}
if (
  config?.mcpServers?.['evavo-project-art-avatar-sequence']?.command !== 'node' ||
  !config?.mcpServers?.['evavo-project-art-avatar-sequence']?.args?.[0]?.endsWith(
    'tools\\project_art_avatar_sequence_mcp.mjs',
  ) ||
  config?.mcpServers?.['evavo-project-art-avatar-sequence']?.env
    ?.EVAVO_ART_AVATAR_SEQUENCE_MCP_ALLOW_WRITE !== 'false'
) {
  errors.push('Avatar-sequence MCP example drifted');
}

const workflowPaths = [
  'scripts/compile-project-art-avatar-sequence.mjs',
  'scripts/project-art/avatar-sequence-common.mjs',
  'scripts/project-art/avatar-sequence-filesystem.mjs',
  'scripts/project-art/avatar-sequence-contract.mjs',
  'scripts/check-project-art-avatar-sequence.mjs',
  'scripts/test-project-art-avatar-sequence.mjs',
  'scripts/test-project-art-avatar-sequence-mcp.mjs',
  'scripts/compile-project-art-loop-closure.mjs',
  'tools/project_art_avatar_sequence_mcp.mjs',
  'docs/PROJECT_ART_AVATAR_SEQUENCE_MASTERING.md',
  'config/mcp.project-art-avatar-sequence.windows.example.json',
  '.github/workflows/project-art-avatar-sequence.yml',
];
for (const workflowPath of workflowPaths) {
  if (count(source.workflow, `- "${workflowPath}"`) !== 2) {
    errors.push(
      `Avatar-sequence workflow must trigger on pull_request and main push for ${workflowPath}`,
    );
  }
}
requireTokens('Avatar-sequence workflow', source.workflow, [
  'permissions:\n  contents: read',
  'persist-credentials: false',
  'node-version: "22.14.0"',
  'Run explicit-assignment and source-identity adversaries',
  'Run callable MCP boundary adversaries',
  'Recheck downstream final-to-first compiler contract',
  'node scripts/check-project-art-avatar-sequence.mjs',
  'node scripts/test-project-art-avatar-sequence.mjs',
  'node scripts/test-project-art-avatar-sequence-mcp.mjs',
  'node scripts/check-project-art-loop-closure.mjs',
  "! grep -F 'git push' tools/project_art_avatar_sequence_mcp.mjs",
  'git diff --exit-code',
]);

requireTokens('Downstream loop compiler', source.loopCompiler, [
  'evavo.project-art-loop-closure-request.v1',
  'PROJECT_ART_LOOP_CLOSURE_REQUEST_BYTES_MISMATCH',
  'sourceHashesRevalidatedAfterExecution: true',
  'wholeRunAtomicPublication: true',
]);

const compiler = await import('./compile-project-art-avatar-sequence.mjs');
if (
  compiler.PROJECT_ART_AVATAR_SEQUENCE_REQUEST_SCHEMA !==
    'evavo.project-art-avatar-sequence-request.v1' ||
  compiler.PROJECT_ART_AVATAR_SEQUENCE_PLAN_SCHEMA !==
    'evavo.project-art-avatar-sequence-mastering-plan.v1' ||
  compiler.AVATAR_SEQUENCE_PACK_TARGET_SCHEMA !==
    'evavo_avatar_sequence_pack_v2' ||
  compiler.PROJECT_ART_LOOP_CLOSURE_REQUEST_SCHEMA !==
    'evavo.project-art-loop-closure-request.v1' ||
  typeof compiler.compileProjectArtAvatarSequence !== 'function' ||
  typeof compiler.compileProjectArtAvatarSequenceFile !== 'function'
) {
  errors.push('Avatar-sequence compiler public exports are incomplete');
}

if (errors.length) {
  console.error('Project Art avatar-sequence guard failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Project Art avatar-sequence guard passed.');
console.log('- exact existing PNG identities compile only from explicit owner assignments');
console.log('- timestamp order and filenames never receive semantic authority');
console.log('- reviewed runtime targets, path-only copy requests and clip timing remain content-addressed');
console.log('- every true loop emits one downstream final-to-first request while once and ping-pong remain excluded');
console.log('- the dedicated MCP server is bounded, credential-redacted, write-gated and create-only');
console.log('- runtime review, loop evidence, release sealing and activation remain separate mandatory steps');
console.log('- no image generation, source mutation, provider, repository, Git, deployment or publication authority was introduced');
