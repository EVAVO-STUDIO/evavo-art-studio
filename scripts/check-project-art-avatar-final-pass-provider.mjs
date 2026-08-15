#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = Object.freeze({
  constants: 'scripts/project-art/avatar-final-pass-provider-constants.mjs',
  common: 'scripts/project-art/avatar-final-pass-provider-common.mjs',
  plan: 'scripts/project-art/avatar-final-pass-provider-plan.mjs',
  requestParser: 'scripts/project-art/avatar-final-pass-provider-request.mjs',
  references: 'scripts/project-art/avatar-final-pass-provider-references.mjs',
  protocol: 'scripts/project-art/avatar-final-pass-provider-protocol.mjs',
  core: 'scripts/project-art/avatar-final-pass-provider.mjs',
  fixture: 'scripts/project-art/avatar-final-pass-provider-test-fixture.mjs',
  cli: 'scripts/compile-project-art-avatar-final-pass-provider.mjs',
  tests: 'scripts/test-project-art-avatar-final-pass-provider.mjs',
  mcpTests: 'scripts/test-project-art-avatar-final-pass-provider-mcp.mjs',
  suite: 'scripts/check-project-art-avatar-final-pass-provider-suite.mjs',
  mcp: 'tools/project_art_avatar_final_pass_provider_mcp.mjs',
  docs: 'docs/PROJECT_ART_AVATAR_FINAL_PASS_PROVIDER.md',
  request: 'config/avatar-final-pass-provider-request.example.json',
  mcpConfig:
    'config/mcp.project-art-avatar-final-pass-provider.windows.example.json',
});

const contents = new Map();
for (const [label, relative] of Object.entries(files)) {
  const absolute = path.join(root, relative);
  const metadata = lstatSync(absolute);
  assert.equal(metadata.isFile(), true, `${label} must be a file`);
  assert.equal(metadata.isSymbolicLink(), false, `${label} must not be a symlink`);
  assert.equal(metadata.nlink, 1, `${label} must be single-link`);
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

requireTokens('constants', [
  'evavo.project-art-avatar-final-pass-provider-request.v1',
  'evavo.project-art-avatar-final-pass-provider-batch.v1',
  'evavo.project-art-avatar-final-pass-provider-metadata.v1',
  "'automaticGenerationAuthorization'",
  "'providerExecution'",
  "'candidateApproval'",
  "'candidatePromotion'",
  "'gitPush'",
  "'runtimeActivation'",
  "'forcePush'",
]);

requireTokens('common', [
  'canonicalAvatarFinalPassProviderJson',
  'sha256AvatarFinalPassProviderDocument',
  'parseFalseAuthority',
  'createAvatarFinalPassProviderAuthority',
  'verifyAllFalseAuthority',
  'AVATAR_FINAL_PASS_PROVIDER_FALSE_AUTHORITY_REQUIRED',
]);

requireTokens('plan', [
  "const jobId = `redraw:${frameId}`",
  "const jobId = `inbetween:${frameId}`",
  "job.mode !== 'provider-redraw'",
  "job.method !== 'provider-generated'",
  "kind: 'provider-redraw'",
  "kind: 'provider-generated-inbetween'",
  "operation: 'edit'",
  "operation: 'generate'",
]);

requireTokens('requestParser', [
  "value.action !== 'run-provider-once'",
  "value.actorClass !== 'human'",
  "value.allowFallback !== false",
  'AVATAR_FINAL_PASS_PROVIDER_HUMAN_AUTHORIZATION_REQUIRED',
  'AVATAR_FINAL_PASS_PROVIDER_HUMAN_ARTIFACT_ADMISSION_REQUIRED',
  'AVATAR_FINAL_PASS_PROVIDER_CANDIDATE_PATH_INVALID',
]);

requireTokens('references', [
  "'identity-frame-final-output-required'",
  "'before-frame-final-output-required'",
  "'after-frame-final-output-required'",
  "'canonical-identity'",
  "'base-image'",
  "'previous-key-pose'",
  "'next-key-pose'",
  'AVATAR_FINAL_PASS_PROVIDER_BINDING_SOURCE_MISMATCH',
  'not a cross-fade or double exposure',
]);

requireTokens('protocol', [
  "blockers.push('human-provider-authorization-required')",
  'reference-artifact-required:',
  'candidateCount: 1',
  "transparency: sourceSpaceRepair ? 'opaque' : 'required'",
  "strategy: sourceSpaceRepair ? 'opaque-source' : 'native-alpha'",
  "admitted.role === 'edit-mask' ? 'mask'",
  'allowFallback: false',
  'providerRequestInput: requestInput',
  'providerExecution: false',
  'candidateApproval: false',
  'candidatePromotion: false',
]);

requireTokens('core', [
  'compileProjectArtAvatarFinalPassProviderBatch',
  'compileProjectArtAvatarFinalPassProviderBatchFile',
  'ready-for-explicit-provider-submission',
  'candidateCountPerJob: 1',
  'explicitProviderSubmissionRequired: true',
  'providerExecution: false',
  'candidateApproval: false',
  'candidatePromotion: false',
  'productionReady: false',
  'runtimeActivationAllowed: false',
  "openSync(absolute, 'wx', 0o600)",
]);

requireTokens('fixture', [
  'sealPlan',
  'admission',
  'authorization',
  'run-provider-once',
  'compileProjectArtAvatarFinalPassProviderBatch',
]);

requireTokens('cli', [
  '--plan',
  '--request',
  '--output',
  '--compiled-at',
  'compileProjectArtAvatarFinalPassProviderBatchFile',
  'providerExecution: false',
  'candidateApproval: false',
  'runtimeActivationAllowed: false',
]);

requireTokens('tests', [
  'Project Art avatar final-pass provider regressions passed.',
  'compiles one-candidate redraw and anatomy-safe in-between provider submissions',
  'missing authorization and artifact admission remain blocked',
  'in-betweens wait for final endpoint hashes',
  'plan tampering, false authority and non-human authorization fail closed',
  'artifact substitution, fallback and output-target collisions fail closed',
  'deterministic repairs and morph previews never become provider jobs',
  'file compilation is stable, private and create-only',
]);

requireTokens('mcpTests', [
  'Project Art avatar final-pass provider MCP regressions passed.',
  'MCP exposes provider tools and entirely false execution authority',
  'MCP compile is write-gated and creates one exact provider batch when enabled',
]);

requireTokens('suite', [
  'Project Art avatar final-pass provider suite passed.',
  'shell: false',
  '--test',
  'scripts/check-project-art-avatar-final-pass-provider.mjs',
  'scripts/test-project-art-avatar-final-pass-provider.mjs',
  'scripts/test-project-art-avatar-final-pass-provider-mcp.mjs',
]);

requireTokens('mcp', [
  'evavo_art_avatar_final_pass_provider_capabilities',
  'evavo_art_compile_avatar_final_pass_provider_batch',
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_ROOTS',
  'EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_MCP_ALLOW_WRITE',
  'sourceImageBytesFlowThroughMcp: false',
  'shellExecution: false',
  'providerExecution: false',
  'referenceArtifactAdmission: false',
  'authorizationPersistence: false',
  'candidateApproval: false',
  'candidatePromotion: false',
  'repositoryMutation: false',
  'gitPush: false',
  'runtimeActivation: false',
  'forcePush: false',
]);

requireTokens('docs', [
  '# Project Art avatar final-pass provider submissions',
  'one-candidate provider submissions',
  'Correct production order',
  'before-frame-final-output-required',
  'after-frame-final-output-required',
  'run-provider-once',
  'canonical-identity',
  'previous-key-pose',
  'next-key-pose',
  'candidateCount = 1',
  'fallback = false',
  'cross-fades',
  'candidate. It must be visually reviewed',
  'provider execution',
  'runtime activation',
  'force push',
  'check-project-art-avatar-final-pass-provider-suite.mjs',
  'no hosted runner',
]);

const request = JSON.parse(contents.get('request'));
assert.equal(
  request.schema,
  'evavo.project-art-avatar-final-pass-provider-request.v1',
);
assert.equal(request.jobs.length, 1);
assert.equal(request.jobs[0].jobId, 'redraw:talk-a');
assert.equal(request.jobs[0].selection.allowFallback, false);
assert.equal(request.jobs[0].authorization, null);
assert.deepEqual(request.jobs[0].artifactBindings, []);
assert.ok(Object.values(request.authority).every((value) => value === false));

const mcpConfig = JSON.parse(contents.get('mcpConfig'));
const server =
  mcpConfig.mcpServers['evavo-project-art-avatar-final-pass-provider'];
assert.equal(server.command, 'node');
assert.ok(
  server.args[0].endsWith('project_art_avatar_final_pass_provider_mcp.mjs'),
);
assert.equal(
  server.env.EVAVO_ART_AVATAR_FINAL_PASS_PROVIDER_MCP_ALLOW_WRITE,
  'true',
);

for (const label of [
  'constants',
  'common',
  'plan',
  'requestParser',
  'references',
  'protocol',
  'core',
]) {
  forbidTokens(label, [
    'candidateCount: 2',
    'allowFallback: true',
    'providerExecution: true',
    'candidateApproval: true',
    'candidatePromotion: true',
    'productionReady: true',
    'runtimeActivationAllowed: true',
    'forcePush: true',
    'git push',
    'child_process',
    'shell: true',
  ]);
}
forbidTokens('mcp', [
  'providerExecution: true',
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

console.log('Project Art avatar final-pass provider guard passed.');
console.log('- redraw and in-between jobs are selected explicitly from the sealed final-pass plan');
console.log('- unfinished endpoint frames cannot feed provider-generated in-betweens');
console.log('- named-human run-once authorization and exact admitted reference artifacts are required');
console.log('- every ready request produces one policy-matched RGBA PNG candidate with provider fallback disabled');
console.log('- provider execution, approval, promotion, Git, publication and runtime authority remain false');
