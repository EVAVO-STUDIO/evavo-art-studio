#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflowPath = path.join(
  root,
  '.github',
  'workflows',
  'asset-fabricator-reference-handoff.yml',
);
const workflow = readFileSync(workflowPath, 'utf8');

const CHECKOUT_SHA = 'de0fac2e4500dabe0009e67214ff5f5447ce83dd';
const SETUP_NODE_SHA = '6044e13b5dc448c55e2357c09f80417699197238';
const EXPECTED_USES = Object.freeze([
  `actions/checkout@${CHECKOUT_SHA}`,
  `actions/setup-node@${SETUP_NODE_SHA}`,
]);

function workflowUses() {
  return [...workflow.matchAll(/^\s*uses:\s*([^\s#]+).*$/gmu)].map(
    (match) => match[1],
  );
}

test('workflow uses only immutable action SHAs and an exact runner toolchain', () => {
  assert.deepEqual(workflowUses(), EXPECTED_USES);
  for (const action of EXPECTED_USES) {
    assert.match(action, /^[a-z0-9_.-]+\/[a-z0-9_.-]+@[a-f0-9]{40}$/u);
  }
  assert.doesNotMatch(workflow, /^\s*uses:\s*[^\n]+@v\d+/gmu);
  assert.match(workflow, /^\s*runs-on:\s*ubuntu-24\.04\s*$/mu);
  assert.match(workflow, /^\s*node-version:\s*"22\.14\.0"\s*$/mu);
  assert.match(workflow, /^\s*package-manager-cache:\s*false\s*$/mu);
});

test('checkout is bound to the triggered revision and cannot persist credentials', () => {
  assert.match(workflow, /^\s*ref:\s*\$\{\{ github\.sha \}\}\s*$/mu);
  assert.match(workflow, /^\s*fetch-depth:\s*1\s*$/mu);
  assert.match(workflow, /^\s*persist-credentials:\s*false\s*$/mu);
});

test('workflow remains read-only, bounded and self-verifying', () => {
  assert.match(workflow, /^permissions:\s*\n\s*contents:\s*read\s*$/mu);
  assert.doesNotMatch(workflow, /^\s*(contents|actions|checks|deployments|packages|pull-requests):\s*write\s*$/gmu);
  assert.match(workflow, /^\s*timeout-minutes:\s*10\s*$/mu);
  assert.match(workflow, /^\s*cancel-in-progress:\s*true\s*$/mu);
  assert.match(
    workflow,
    /node --test scripts\/game-art-production\/asset-fabricator-reference-workflow\.test\.mjs/u,
  );
  assert.match(workflow, /git diff --exit-code/u);
  assert.match(workflow, /git status --porcelain=v1 --untracked-files=all/u);
});
