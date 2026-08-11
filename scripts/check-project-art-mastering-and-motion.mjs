#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = {
  registry: 'config/project-art-operations.v1.json',
  compiler: 'scripts/project-art/sandbox.mjs',
  runtime: 'tools/run_project_art_sandbox.py',
  tests: 'scripts/test-project-art-mastering-and-motion.mjs',
  documentation: 'docs/PROJECT_ART_MASTERING_AND_MOTION.md',
  persistentDocumentation: 'docs/PERSISTENT_ARTIST_WORKSPACE.md',
  mcp: 'tools/project_art_workspace_mcp.mjs',
  package: 'package.json',
  workflow: '.github/workflows/project-art-workbench.yml',
};
const contents = new Map();
for (const [label, relative] of Object.entries(files)) {
  const absolute = path.join(root, relative);
  const metadata = lstatSync(absolute);
  assert.equal(metadata.isFile(), true, `${label} must be a file`);
  assert.equal(metadata.isSymbolicLink(), false, `${label} must not be a symbolic link`);
  contents.set(label, readFileSync(absolute, 'utf8'));
}

const requireTokens = (label, source, tokens) => {
  for (const token of tokens) assert.equal(source.includes(token), true, `${label} is missing ${token}`);
};
const forbidTokens = (label, source, tokens) => {
  for (const token of tokens) assert.equal(source.includes(token), false, `${label} must not contain ${token}`);
};
const count = (source, token) => source.split(token).length - 1;

const registry = JSON.parse(contents.get('registry'));
const operations = new Set(registry.operations.map((operation) => operation.id));
for (const operation of [
  'rotate',
  'affine-transform',
  'perspective-transform',
  'grayscale',
  'invert',
  'posterize',
  'threshold',
  'gamma',
  'hue-shift',
  'curves',
  'channel-mixer',
  'box-blur',
  'median-filter',
  'motion-blur',
  'emboss',
  'find-edges',
  'edge-enhance',
  'alpha-feather',
  'defringe',
  'drop-shadow',
  'outer-glow',
]) {
  assert.equal(operations.has(operation), true, `operation registry is missing ${operation}`);
}
assert.equal(registry.taskKinds.includes('image-master'), true);
assert.equal(registry.taskKinds.includes('motion-sequence'), true);
assert.equal(registry.rules.wholeRunAtomicPublication, true);
assert.equal(registry.rules.providerExecution, false);
assert.equal(registry.rules.candidateApproval, false);
assert.equal(registry.rules.candidatePromotion, false);
assert.equal(registry.rules.targetRepositoryMutation, false);
assert.equal(registry.rules.publication, false);
assert.equal(registry.rules.forcePush, false);

requireTokens('compiler', contents.get('compiler'), [
  "kind: 'image-master'",
  "kind: 'motion-sequence'",
  'normalizeMasterTask',
  'normalizeMotionTask',
  'operationWorkingSetMultiplier',
  'imageOperationDimensions',
  'maximumUniqueColours',
  'edgeMatteColour',
  'motionBlurSamples',
  'PROJECT_ART_SANDBOX_OUTPUT_COUNT_LIMIT',
  'wholeRunAtomicPublication: true',
  'providerExecution: false',
  'candidateApproval: false',
]);
requireTokens('runtime', contents.get('runtime'), [
  'MASTERING_REPORT_SCHEMA = "evavo.project-art-mastering-report.v1"',
  'MOTION_MANIFEST_SCHEMA = "evavo.project-art-motion-sequence.v1"',
  'PROJECT_ART_MASTERING_PROFILE_FAILED',
  'execute_master_task',
  'execute_motion_task',
  'drop-shadow target',
  'outer-glow target',
  'context.verify_sources()',
  'wholeRunAtomicPublication',
  'providerExecution": False',
  'candidateApproval": False',
  'targetRepositoryMutation": False',
  'os.replace(staging, output_root)',
]);
assert.ok(count(contents.get('runtime'), 'context.verify_sources()') >= 2, 'runtime must revalidate sources before and after execution');
requireTokens('tests', contents.get('tests'), [
  'Project Art mastering and motion regressions passed.',
  'professional geometry, colour, filter, alpha and layer-effect operations execute deterministically',
  'evavo.project-art-mastering-report.v1',
  'evavo.project-art-motion-sequence.v1',
  'PROJECT_ART_MASTERING_PROFILE_FAILED',
  'correctly rehashed output-count attacks fail closed',
]);
requireTokens('documentation', contents.get('documentation'), [
  '# Project Art mastering and motion',
  'image-master',
  'motion-sequence',
  'edge-decontaminate',
  'defringe',
  'drop-shadow',
  'outer-glow',
  'technical pass is not creative approval',
  'EVAVO Storage',
  'No arbitrary shell',
]);
requireTokens('persistent documentation', contents.get('persistentDocumentation'), [
  '# Persistent Artist Workspace',
  'masters/',
  'exports/',
  'append-only',
  'EVAVO Storage',
  'ChatGPT',
  'Claude',
]);
requireTokens('MCP', contents.get('mcp'), [
  'persistent-artist-workspace',
  'professional-mastering',
  'keyframed-motion-sequence',
  'evavo-storage-handoff',
  'evavo_art_compile_workspace_create',
  'evavo_art_run_workspace_snapshot',
  'evavo_art_prepare_storage_handoff',
  'bytesFlowThroughMcp: false',
  'repositoryMutation: false',
  'providerExecution: false',
  'shell: false',
]);
requireTokens('package', contents.get('package'), [
  'project-art:mastering:check',
  'project-art:workspace:persistent:check',
  'scripts/check-project-art-mastering-and-motion.mjs',
  'scripts/test-project-art-mastering-and-motion.mjs',
]);

const workflowPaths = [
  'scripts/check-project-art-mastering-and-motion.mjs',
  'scripts/test-project-art-mastering-and-motion.mjs',
  'docs/PROJECT_ART_MASTERING_AND_MOTION.md',
];
for (const workflowPath of workflowPaths) {
  assert.equal(count(contents.get('workflow'), `- "${workflowPath}"`), 2, `${workflowPath} must trigger PR and main validation`);
}
requireTokens('workflow', contents.get('workflow'), [
  'Verify persistent Artist Workspace contracts and regressions',
  'Run professional mastering and keyframed motion adversary',
  'pnpm run project-art:workspace:persistent:check',
  'pnpm run project-art:mastering:check',
  "grep -F 'evavo.project-art-mastering-report.v1' tools/run_project_art_sandbox.py",
  "grep -F 'evavo.project-art-motion-sequence.v1' tools/run_project_art_sandbox.py",
]);

forbidTokens('compiler', contents.get('compiler'), [
  'candidateApproval: true',
  'candidatePromotion: true',
  'targetRepositoryMutation: true',
  'publication: true',
  'forcePush: true',
]);
forbidTokens('runtime', contents.get('runtime'), [
  'git push',
  'subprocess',
  '"providerExecution": True',
  '"candidateApproval": True',
  '"candidatePromotion": True',
  '"targetRepositoryMutation": True',
  '"publication": True',
  '"forcePush": True',
]);
forbidTokens('MCP', contents.get('mcp'), [
  'git push',
  'candidateApproval: true',
  'candidatePromotion: true',
  'repositoryMutation: true',
  'providerExecution: true',
  'forcePush: true',
]);

console.log('Project Art mastering and motion guard passed.');
console.log('- professional geometry, tonal, filter, alpha, layer-effect and mastering operations are registered');
console.log('- image-master and motion-sequence remain exact, bounded and whole-run atomic');
console.log('- persistent workspaces expose masters and exports while retaining immutable originals and append-only versions');
console.log('- ChatGPT and Claude receive fixed path-only tools, and EVAVO Storage admission remains independent');
console.log('- provider execution, creative approval, repository mutation, deployment, publication and force push remain false');
