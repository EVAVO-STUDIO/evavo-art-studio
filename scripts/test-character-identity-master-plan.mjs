#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  PLAN_SCHEMA,
  REQUEST_SCHEMA,
  compileIdentityMasterPlan,
  main,
} from './character-identity-master-plan.mjs';

function request(overrides = {}) {
  return {
    schema: REQUEST_SCHEMA,
    requestId: 'test-character-identity-v1',
    project: { id: 'test-game', title: 'Test Game' },
    character: {
      id: 'test-hero',
      label: 'Test Hero',
      role: 'playable-character',
      identityContract: 'game/art/hero/hero_identity_contract.json',
    },
    purpose: 'original character identity bootstrap candidates',
    candidateSets: 2,
    canvas: { width: 512, height: 512, alpha: 'transparent' },
    views: [
      { id: 'full-body-right', label: 'Full body right', prompt: 'Neutral grounded right-facing full-body pose.' },
      { id: 'full-body-left', label: 'Full body left', prompt: 'Neutral grounded left-facing full-body pose.' },
      { id: 'neutral-bust', label: 'Neutral bust', prompt: 'Neutral bust preserving face and hair identity.' },
    ],
    style: {
      lock: 'Original restrained early-1990s cinematic platformer character identity.',
      continuity: 'Preserve face, proportions, hair, costume shapes and weapon placement across views.',
      mustHave: ['clear silhouette', 'stable proportions', 'consistent costume'],
      mustAvoid: ['protected character reconstruction', 'identity drift', 'readable text'],
      originality: 'Create a new project-owned identity and do not reconstruct a protected commercial character.',
    },
    outputRoot: 'reports/local/identity-master/test-hero',
    policy: {
      protectedReconstructionAllowed: false,
      runtimeAsset: false,
      animationFamily: false,
      providerExecution: false,
      providerAuthorizationRequired: true,
      promotion: false,
      separateFiles: true,
      reviewRequired: true,
    },
    ...overrides,
  };
}

test('compiles deterministic provider-free candidate sets', () => {
  const first = compileIdentityMasterPlan(request());
  const second = compileIdentityMasterPlan(request());
  assert.equal(first.schema, PLAN_SCHEMA);
  assert.equal(first.planSha256, second.planSha256);
  assert.equal(first.requestSha256, second.requestSha256);
  assert.equal(first.candidateSetCount, 2);
  assert.equal(first.viewCount, 3);
  assert.equal(first.totalJobs, 6);
  assert.equal(first.authority.providerExecution, false);
  assert.equal(first.authority.providerAuthorizationRequired, true);
  assert.equal(first.authority.runtimeAsset, false);
  assert.equal(first.authority.promotion, false);
  assert.equal(first.candidateSets[0].continuityKey, 'test-game:test-hero:candidate-set-01');
  assert.equal(first.candidateSets[0].jobs[0].targetPath, 'reports/local/identity-master/test-hero/candidate-set-01/full-body-right.png');
  assert.match(first.candidateSets[0].jobs[0].prompt, /Preserve the same identity across every view/u);
  assert.match(first.candidateSets[0].jobs[0].prompt, /No contact sheet/u);
});

test('rejects protected reconstruction and live provider authority', () => {
  assert.throws(() => compileIdentityMasterPlan(request({
    policy: { ...request().policy, protectedReconstructionAllowed: true },
  })), /protected-character reconstruction is forbidden/u);
  assert.throws(() => compileIdentityMasterPlan(request({
    policy: { ...request().policy, providerExecution: true },
  })), /may not claim runtime, animation-family, provider-execution or promotion authority/u);
});

test('requires separate files, review and later authorization', () => {
  assert.throws(() => compileIdentityMasterPlan(request({
    policy: { ...request().policy, reviewRequired: false },
  })), /requires separate files, review and a later provider authorization/u);
});

test('CLI compile is create-only', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-identity-master-'));
  try {
    const input = path.join(root, 'request.json');
    const output = path.join(root, 'plan.json');
    await writeFile(input, `${JSON.stringify(request(), null, 2)}\n`);
    await main(['compile', '--input', input, '--output', output]);
    const compiled = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(compiled.schema, PLAN_SCHEMA);
    assert.equal(compiled.authority.providerExecution, false);
    await assert.rejects(() => main(['compile', '--input', input, '--output', output]), /EEXIST/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
