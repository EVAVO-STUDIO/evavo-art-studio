#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = Object.freeze({
  constants:
    'scripts/project-art/avatar-final-pass-provider-runtime-constants.mjs',
  common: 'scripts/project-art/avatar-final-pass-provider-runtime-common.mjs',
  batch: 'scripts/project-art/avatar-final-pass-provider-runtime-batch.mjs',
  dispatchCore:
    'scripts/project-art/avatar-final-pass-provider-runtime-dispatch-core.mjs',
  binding:
    'scripts/project-art/avatar-final-pass-provider-runtime-binding.mjs',
  outcome:
    'scripts/project-art/avatar-final-pass-provider-runtime-outcome.mjs',
  dispatch:
    'scripts/project-art/avatar-final-pass-provider-runtime-dispatch.mjs',
  facade: 'scripts/project-art/avatar-final-pass-provider-runtime.mjs',
  fixture:
    'scripts/project-art/avatar-final-pass-provider-runtime-fixture.mjs',
  cli: 'scripts/avatar-final-pass-provider-runtime-cli.mjs',
  tests: 'scripts/test-project-art-avatar-final-pass-provider-runtime.mjs',
  mcpTests:
    'scripts/test-project-art-avatar-final-pass-provider-runtime-mcp.mjs',
  suite:
    'scripts/check-project-art-avatar-final-pass-provider-runtime-suite.mjs',
  mcp: 'tools/project_art_avatar_final_pass_provider_runtime_mcp.mjs',
  docs: 'docs/PROJECT_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME.md',
  mcpConfig:
    'config/mcp.project-art-avatar-final-pass-provider-runtime.windows.example.json',
  outcomeExample:
    'config/avatar-final-pass-provider-runtime-outcome.example.json',
});

const contents = new Map();
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
  contents.set(label, source);
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

requireTokens('constants', [
  'evavo.project-art-avatar-final-pass-provider-runtime-dispatch.v1',
  'evavo.project-art-avatar-final-pass-provider-runtime-binding.v1',
  'evavo.project-art-avatar-final-pass-provider-runtime-outcome.v1',
  "'2026-08-13.1'",
  "GENERIC_PROVIDER_PROTOCOL_VERSION = '2026-08-15.1'",
  'avatar-provider-submit:',
  'explicitWriteEnabledRuntimeRequired',
]);

requireTokens('common', [
  'snapshotJsonValue',
  'utilTypes.isProxy',
  'Object.getOwnPropertyDescriptors',
  'MAXIMUM_DOCUMENT_BYTES',
  "openSync(absolute, 'wx', 0o600)",
  'AVATAR_PROVIDER_RUNTIME_INPUT_CHANGED',
  'AVATAR_PROVIDER_RUNTIME_SELF_HASH_MISMATCH',
]);

requireTokens('batch', [
  'ready-for-explicit-provider-submission',
  'run-provider-once',
  "value.actorClass === 'human'",
  "(sourceSpaceRepair ? 'opaque-source' : 'native-alpha')",
  "roles.includes('mask')",
  'request.candidateCount === 1',
  'request.selection.allowFallback === false',
  "roles.includes('canonical-identity')",
  "roles.includes('previous-key-pose')",
  "roles.includes('next-key-pose')",
  'AVATAR_PROVIDER_RUNTIME_READY_SUBMISSION_MISMATCH',
]);

requireTokens('dispatchCore', [
  "package: '@evavo/art-providers'",
  "export: 'compileProviderCandidateRuntimeContract'",
  "queue: 'provider'",
  '`art.candidate.${job.operation}`',
  'maximumAttempts: 3',
  'leaseDurationMs: 300_000',
  'timeoutMs: 1_800_000',
  'candidateCount: 1',
  "request.operation, 'cancellation'",
  "values.add('native-alpha')",
  "values.add('custom-size')",
  "values.add('candidate-count')",
  'candidate-run-result',
  'provider-failure',
]);

requireTokens('binding', [
  'validateAvatarFinalPassCompiledProviderRuntimeContract',
  'normalizedRequestComparable',
  'requiredAdapterCapabilities',
  'runtimeBindingSha256',
  'candidateOutputPath',
  'createAuthority(RUNTIME_BINDING_AUTHORITY_KEYS)',
  'parseAllFalseAuthority',
]);

requireTokens('outcome', [
  'candidate-materialization-required',
  'rerun-avatar-frame-finisher',
  'bind-final-sha256-before-inbetween-or-sequence-use',
  'retryRequiresFreshHumanRunOnceAuthorization',
  'candidateMaterialization: false',
  'candidateApproval: false',
  'runtimeActivation: false',
]);

requireTokens('dispatch', [
  'compileAvatarFinalPassProviderRuntimeDispatch',
  'parseAvatarFinalPassProviderRuntimeDispatch',
  'validateAvatarFinalPassCompiledProviderRuntimeContract',
  'compileAvatarFinalPassProviderRuntimeOutcome',
  'verifyAvatarFinalPassProviderRuntimeContract',
]);

requireTokens('facade', [
  'avatarFinalPassProviderRuntimeCapabilities',
  'compileAvatarFinalPassProviderRuntimeDispatchFile',
  'bindAvatarFinalPassProviderRuntimeContractFile',
  'compileAvatarFinalPassProviderRuntimeOutcomeFile',
  'runtimeContractCompilation: false',
  'runtimeEnqueue: false',
  'providerExecution: false',
  'candidateMaterialization: false',
  'sourceImageBytesFlowThroughMcp: false',
]);

requireTokens('cli', [
  'dispatch --batch',
  'bind --dispatch',
  'outcome --dispatch',
  'compileAvatarFinalPassProviderRuntimeDispatchFile',
  'bindAvatarFinalPassProviderRuntimeContractFile',
  'compileAvatarFinalPassProviderRuntimeOutcomeFile',
  'providerExecution: false',
  'candidateApproval: false',
]);

requireTokens('tests', [
  'Project Art avatar final-pass provider runtime regressions passed.',
  'binds one ready redraw to the generic provider runtime contract',
  'generated in-between dispatch retains temporal reference capabilities',
  'successful runtime result becomes a create-only candidate materialization plan',
  'provider failure records zero candidates and requires fresh human authorization',
  'blocked jobs, tampered hashes and provider fallback fail closed',
  'multiple provider attempts and multiple candidates are rejected',
  'file operations are stable, private and create-only',
]);

requireTokens('mcpTests', [
  'Project Art avatar final-pass provider runtime MCP regressions passed.',
  'MCP exposes four bounded runtime tools with entirely separate authority',
  'MCP is write-gated and compiles dispatch, binding and outcome records create-only',
]);

requireTokens('mcp', [
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
]);

requireTokens('docs', [
  '# Project Art avatar final-pass provider runtime bridge',
  '@evavo/art-providers',
  'compileProviderCandidateRuntimeContract',
  'art.candidate.edit',
  'art.candidate.generate',
  'candidate-run-result',
  'provider-failure',
  'one provider call',
  'one candidate',
  'rerun the avatar frame finisher',
  'does not execute a provider',
  'does not approve or promote',
]);

const mcpConfig = JSON.parse(contents.get('mcpConfig'));
const configured =
  mcpConfig.mcpServers?.[
    'evavo-project-art-avatar-final-pass-provider-runtime'
  ];
assert.ok(configured, 'dedicated runtime MCP config must register the server');
assert.equal(configured.command, 'node');
assert.ok(
  configured.args[0].endsWith(
    'project_art_avatar_final_pass_provider_runtime_mcp.mjs',
  ),
);
assert.equal(
  configured.env
    .EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_RUNTIME_MCP_ALLOW_WRITE,
  'false',
);

const outcomeExample = JSON.parse(contents.get('outcomeExample'));
assert.equal(outcomeExample.kind, 'candidate-run-result');
assert.equal(outcomeExample.providerCallCount, 1);
assert.equal(outcomeExample.result.candidateArtifacts.length, 1);
assert.equal(
  outcomeExample.result.routingInspection.providerCallPerformedByInspection,
  false,
);
assert.equal(outcomeExample.result.routingInspection.fallbackAllowed, false);
assert.equal(outcomeExample.result.attempts.length, 1);
assert.equal(outcomeExample.result.attempts[0].outcome, 'succeeded');

forbidTokens('dispatchCore', [
  'candidateCount: 2',
  'allowFallback: true',
  'runtimeEnqueue: true',
  'providerExecution: true',
  'candidateMaterialization: true',
  'candidateApproval: true',
  'candidatePromotion: true',
  'runtimeActivation: true',
  'forcePush: true',
  'git push',
  'child_process',
]);
forbidTokens('binding', [
  'runtimeEnqueue: true',
  'providerExecution: true',
  'candidateMaterialization: true',
  'candidateApproval: true',
  'candidatePromotion: true',
  'runtimeActivation: true',
  'forcePush: true',
  'git push',
  'child_process',
]);
forbidTokens('outcome', [
  'runtimeEnqueue: true',
  'providerExecution: true',
  'candidateMaterialization: true',
  'candidateApproval: true',
  'candidatePromotion: true',
  'runtimeActivation: true',
  'forcePush: true',
  'git push',
  'child_process',
]);

forbidTokens('mcp', [
  'runtimeEnqueue: true',
  'providerExecution: true',
  'candidateMaterialization: true',
  'candidateApproval: true',
  'candidatePromotion: true',
  'repositoryMutation: true',
  'gitPush: true',
  'runtimeActivation: true',
  'forcePush: true',
  'child_process',
  'shell: true',
  'git push',
]);

console.log('Project Art avatar final-pass provider runtime guard passed.');
console.log('- sealed ready jobs bind to the canonical @evavo/art-providers runtime compiler');
console.log('- edit and generated in-between jobs retain exact one-call and one-candidate scope');
console.log('- generic runtime contracts, outcomes and candidate artifacts are independently revalidated');
console.log('- provider failures require fresh named-human authorization before any retry');
console.log('- execution, materialization, approval, Git, publication and runtime activation remain separate');
