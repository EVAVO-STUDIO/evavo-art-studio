#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relativeFiles = [
  'scripts/project-art/common.mjs',
  'scripts/project-art/intelligence.mjs',
  'scripts/project-art/sandbox.mjs',
  'scripts/project-art/reference-derived.mjs',
  'scripts/compile-project-art-intelligence.mjs',
  'scripts/compile-project-art-sandbox.mjs',
  'scripts/compile-reference-derived-image-plan.mjs',
  'scripts/stage-reference-derived-artifacts.mjs',
  'scripts/check-project-art-workbench.mjs',
  'scripts/test-project-art-workbench.mjs',
  'tools/run_project_art_sandbox.py',
  'config/project-art-operations.v1.json',
  'docs/PROJECT_ART_WORKBENCH.md',
  '.github/workflows/project-art-workbench.yml',
  'package.json',
];
const contents = new Map();
for (const relative of relativeFiles) {
  contents.set(relative, await readFile(path.join(root, relative), 'utf8'));
}

const registry = JSON.parse(contents.get('config/project-art-operations.v1.json'));
assert.equal(registry.schema, 'evavo.project-art-operations.v1');
assert.equal(registry.rules.sourceOverwriteAllowed, false);
assert.equal(registry.rules.wholeRunAtomicPublication, true);
assert.equal(registry.rules.providerExecution, false);
assert.equal(registry.rules.candidateApproval, false);
assert.equal(registry.rules.candidatePromotion, false);
assert.equal(registry.rules.targetRepositoryMutation, false);
assert.equal(registry.rules.forcePush, false);
const expectedOperations = [
  'inspect',
  'trim-alpha',
  'crop',
  'pad-canvas',
  'resize',
  'pixel-resize',
  'flip-horizontal',
  'flip-vertical',
  'rotate-90',
  'rotate-180',
  'rotate-270',
  'alpha-threshold',
  'connected-matte-to-alpha',
  'edge-decontaminate',
  'hidden-rgb-rebuild',
  'palette-normalize',
  'quantize',
  'autocontrast',
  'levels',
  'outline',
  'convert',
  'optimize',
];
assert.deepEqual(registry.operations.map((operation) => operation.id), expectedOperations);
assert.deepEqual(registry.taskKinds, ['image', 'slice-sheet', 'assemble-sheet', 'sequence-review']);

const sourceAssertions = {
  'scripts/project-art/intelligence.mjs': [
    'evavo.project-art-intelligence.v1',
    'evavo.project-art-queue-seed.v1',
    'engine-index-required',
    'requiresFreshExecutionAuthorization: true',
    'providerExecution: false',
    'targetRepositoryMutation: false',
  ],
  'scripts/project-art/sandbox.mjs': [
    'evavo.project-art-sandbox-request.v1',
    'evavo.project-art-sandbox-plan.v1',
    'wholeRunAtomicPublication: true',
    'sourceHashesRevalidatedBeforeExecution: true',
    'sourceHashesRevalidatedAfterExecution: true',
    'providerExecution: false',
    'candidateApproval: false',
  ],
  'scripts/project-art/reference-derived.mjs': [
    'evavo.reference-derived-image-request.v1',
    'evavo.reference-derived-image-plan.v1',
    'in-between-frame',
    'previous-key-pose',
    'next-key-pose',
    'requiresFreshAdmission: true',
    'requiresFreshExecutionAuthorization: true',
    'independentApprovalPerformed: false',
    'providerExecution: false',
  ],
  'tools/run_project_art_sandbox.py': [
    'evavo.project-art-sandbox-receipt.v1',
    'wholeRunAtomicPublication',
    'sourceMutation": False',
    'providerExecution": False',
    'candidateApproval": False',
    'targetRepositoryMutation": False',
    'os.replace(staging, output_root)',
  ],
  'docs/PROJECT_ART_WORKBENCH.md': [
    'Project intelligence',
    'Atomic sandbox image work',
    'Sprite-sheet and animation work',
    'Similar images and matching animation frames',
    'Exact authority boundary',
  ],
  '.github/workflows/project-art-workbench.yml': [
    'PROJECT_ART_REQUIRE_PILLOW: "1"',
    'PROJECT_ART_REQUIRE_PROVIDER_VALIDATION: "1"',
    'pnpm run build:domain',
    'pnpm check',
    'git diff --exit-code',
  ],
};
for (const [relative, tokens] of Object.entries(sourceAssertions)) {
  const source = contents.get(relative);
  for (const token of tokens) {
    assert.ok(source.includes(token), `${relative} is missing permanent token: ${token}`);
  }
}

for (const relative of [
  'scripts/project-art/intelligence.mjs',
  'scripts/project-art/sandbox.mjs',
  'scripts/project-art/reference-derived.mjs',
]) {
  const source = contents.get(relative);
  for (const forbidden of [
    'candidateApproval: true',
    'candidatePromotion: true',
    'targetRepositoryMutation: true',
    'publication: true',
    'deployment: true',
    'forcePush: true',
  ]) {
    assert.ok(!source.includes(forbidden), `${relative} contains forbidden authority: ${forbidden}`);
  }
}
assert.ok(!contents.get('tools/run_project_art_sandbox.py').includes('git push'));
assert.ok(!contents.get('tools/run_project_art_sandbox.py').includes('subprocess'));

const packageJson = JSON.parse(contents.get('package.json'));
const expectedScripts = {
  'project-art:intelligence': 'node scripts/compile-project-art-intelligence.mjs',
  'project-art:sandbox:compile': 'node scripts/compile-project-art-sandbox.mjs',
  'project-art:sandbox:run': 'python tools/run_project_art_sandbox.py',
  'project-art:reference:compile': 'node scripts/compile-reference-derived-image-plan.mjs',
  'project-art:reference:stage': 'node scripts/stage-reference-derived-artifacts.mjs',
  'project-art:check': 'node scripts/check-project-art-workbench.mjs && node scripts/test-project-art-workbench.mjs',
};
for (const [name, command] of Object.entries(expectedScripts)) {
  assert.equal(packageJson.scripts[name], command, `package script ${name} changed`);
}
assert.ok(packageJson.scripts.check.includes('pnpm run project-art:check'));

for (const relative of relativeFiles.filter((value) => value.endsWith('.mjs'))) {
  const checked = spawnSync(process.execPath, ['--check', path.join(root, relative)], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  assert.equal(checked.status, 0, `${relative} failed node --check:\n${checked.stderr || checked.stdout}`);
}

const pythonCandidates = process.platform === 'win32'
  ? [['py', ['-3']], ['python', []], ['python3', []]]
  : [['python', []], ['python3', []], ['py', ['-3']]];
let python = null;
for (const [command, prefix] of pythonCandidates) {
  const result = spawnSync(command, [...prefix, '-c', 'import sys; print(sys.version_info[0])'], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  if (result.status === 0 && result.stdout.trim() === '3') {
    python = { command, prefix };
    break;
  }
}
assert.ok(python, 'Python 3 is required to syntax-check the project-art sandbox runtime.');
const pycache = await mkdtemp(path.join(os.tmpdir(), 'evavo-project-art-pycache-'));
try {
  const compiled = spawnSync(
    python.command,
    [...python.prefix, '-m', 'py_compile', path.join(root, 'tools', 'run_project_art_sandbox.py')],
    {
      cwd: root,
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      env: { ...process.env, PYTHONPYCACHEPREFIX: pycache },
    },
  );
  assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout);
} finally {
  await rm(pycache, { recursive: true, force: true });
}

console.log('EVAVO project-art workbench contract check passed');
