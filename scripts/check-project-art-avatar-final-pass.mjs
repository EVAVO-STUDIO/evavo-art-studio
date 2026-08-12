#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = {
  compiler: 'scripts/project-art/avatar-final-pass.mjs',
  cli: 'scripts/compile-project-art-avatar-final-pass.mjs',
  tests: 'scripts/test-project-art-avatar-final-pass.mjs',
  mcpTests: 'scripts/test-project-art-avatar-final-pass-mcp.mjs',
  mcp: 'tools/project_art_avatar_final_pass_mcp.mjs',
  docs: 'docs/PROJECT_ART_AVATAR_FINAL_PASS.md',
  request: 'config/avatar-final-pass-request.example.json',
  mcpConfig: 'config/mcp.project-art-avatar-final-pass.windows.example.json',
};

const contents = new Map();
for (const [label, relative] of Object.entries(files)) {
  const absolute = path.join(root, relative);
  const metadata = lstatSync(absolute);
  assert.equal(metadata.isFile(), true, `${label} must be a file`);
  assert.equal(metadata.isSymbolicLink(), false, `${label} must not be a symlink`);
  contents.set(label, readFileSync(absolute, 'utf8'));
}

function requireTokens(label, tokens) {
  const source = contents.get(label);
  for (const token of tokens) {
    assert.equal(source.includes(token), true, `${label} is missing ${token}`);
  }
}

function forbidTokens(label, tokens) {
  const source = contents.get(label);
  for (const token of tokens) {
    assert.equal(source.includes(token), false, `${label} must not contain ${token}`);
  }
}

requireTokens('compiler', [
  'evavo.project-art-avatar-final-pass-request.v1',
  'evavo.project-art-avatar-final-pass-plan.v1',
  'evavo.project-art-avatar-frame-quality-report.v1',
  'evavo.project-art-avatar-frame-repair-request.v1',
  'evavo.project-art-avatar-inbetween-request.v1',
  "'hands'",
  "'fingers'",
  "'anatomy'",
  "'face-identity'",
  "'edge-decontaminate'",
  "'defringe'",
  "'alpha-feather'",
  "'provider-redraw'",
  "'provider-generated'",
  "'deterministic-morph-preview'",
  "request.assignmentMode !== 'owner-declared-only'",
  'request.semanticInferencePerformed !== false',
  'request.timestampOrderingUsedAsSemantics !== false',
  'request.generationOrderingUsedAsSemantics !== false',
  'sourceBytesEmbeddedInPlan: false',
  'manualReviewRequired: true',
  'candidateApproval: false',
  'providerExecutionAllowed: false',
  'productionReady: false',
  'runtimeActivationAllowed: false',
  "'independent-art-review-required'",
  "'independent-animation-review-required'",
  "'independent-runtime-review-required'",
  "'sequence-release-seal-required'",
  "openSync(outputAbsolute, 'wx', 0o600)",
]);

requireTokens('cli', [
  '--workspace-root',
  '--request',
  '--output',
  '--compiled-at',
  'compileProjectArtAvatarFinalPassFile',
  'productionReady: plan.productionReady',
  'runtimeActivationAllowed: plan.runtimeActivationAllowed',
]);

requireTokens('tests', [
  'Project Art avatar final-pass regressions passed.',
  'compiles explicit final-art, repair, in-between, timing and release handoffs',
  'accept disposition cannot hide unresolved hands or anatomy defects',
  'rejects changed source bytes and manifest substitutions',
  'once and ping-pong clips cannot receive false loop thresholds',
  'excluded frames cannot remain in a sequence timeline',
  'request bytes are exact and output publication is create-only',
]);

requireTokens('mcpTests', [
  'Project Art avatar final-pass MCP regressions passed.',
  'MCP exposes bounded final-pass tools and false authority',
  'MCP compile operation is disabled without the explicit write gate',
]);

requireTokens('mcp', [
  'evavo_art_avatar_final_pass_capabilities',
  'evavo_art_compile_avatar_final_pass',
  'EVAVO_ART_AVATAR_FINAL_PASS_ROOTS',
  'EVAVO_ART_AVATAR_FINAL_PASS_MCP_ALLOW_WRITE',
  'sourceImageBytesFlowThroughMcp: false',
  'shellExecution: false',
  'providerExecution: false',
  'repositoryMutation: false',
  'runtimeActivation: false',
  'forcePush: false',
]);

requireTokens('docs', [
  '# Project Art avatar final pass',
  'hands and fingers',
  'deterministic-repair',
  'provider-redraw',
  'provider-generated',
  'deterministic-morph-preview',
  'final-to-first loop review',
  'productionReady: false',
  'runtimeActivationAllowed: false',
  'EVAVO Storage managed paths',
  'non-force Git data update',
]);

const request = JSON.parse(contents.get('request'));
assert.equal(request.schema, 'evavo.project-art-avatar-final-pass-request.v1');
assert.equal(request.assignmentMode, 'owner-declared-only');
assert.equal(request.semanticInferencePerformed, false);
assert.equal(request.timestampOrderingUsedAsSemantics, false);
assert.equal(request.generationOrderingUsedAsSemantics, false);
assert.equal(request.qualityGates.requireHandsReview, true);
assert.equal(request.qualityGates.requireFaceIdentityReview, true);
assert.equal(request.qualityGates.requireLoopClosureForLoops, true);
assert.ok(Object.values(request.authority).every((value) => value === false));

const mcpConfig = JSON.parse(contents.get('mcpConfig'));
const server = mcpConfig.mcpServers['evavo-project-art-avatar-final-pass'];
assert.equal(server.command, 'node');
assert.ok(server.args[0].endsWith('project_art_avatar_final_pass_mcp.mjs'));
assert.equal(server.env.EVAVO_ART_AVATAR_FINAL_PASS_MCP_ALLOW_WRITE, 'true');

forbidTokens('compiler', [
  'candidateApproval: true',
  'providerExecutionAllowed: true',
  'runtimeActivationAllowed: true',
  'productionReady: true',
  'git push',
  'force: true',
]);
forbidTokens('mcp', [
  'candidateApproval: true',
  'providerExecution: true',
  'repositoryMutation: true',
  'runtimeActivation: true',
  'forcePush: true',
  'child_process',
  'shell: true',
  'git push',
]);

console.log('Project Art avatar final-pass guard passed.');
console.log('- repository materialization is bound to exact SHA-256 identities and stable PNG files');
console.log('- hands, anatomy, identity, edge, jitter and timing decisions remain explicit and reviewable');
console.log('- deterministic repairs, redraws and in-betweens compile into separate non-authoritative jobs');
console.log('- sequence, atlas, loop, review, release and managed publication remain separate boundaries');
console.log('- no new workflow is required and all provider, approval, Git and runtime authority remains false');
