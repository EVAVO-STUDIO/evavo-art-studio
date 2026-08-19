#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { compileIdentityMasterPlan } from './character-identity-master-plan.mjs';
import {
  ADMISSION_SCHEMA,
  compileIdentityBootstrapAdmission,
  main,
} from './character-identity-bootstrap-admission.mjs';

function request() {
  return {
    schema: 'evavo.character-identity-master-request.v1',
    requestId: 'test-identity-bootstrap-v1',
    project: { id: 'test-game', title: 'Test Game' },
    character: {
      id: 'test-hero',
      label: 'Test Hero',
      role: 'playable-character',
      identityContract: 'game/art/hero/hero_identity_contract.json',
    },
    purpose: 'original identity candidate bootstrap',
    candidateSets: 2,
    canvas: { width: 512, height: 512, alpha: 'transparent' },
    views: [
      { id: 'full-body-right', label: 'Right', prompt: 'Neutral right-facing full body.' },
      { id: 'full-body-left', label: 'Left', prompt: 'Neutral independently authored left-facing full body.' },
      { id: 'neutral-bust', label: 'Bust', prompt: 'Neutral chest-up identity bust.' },
    ],
    style: {
      lock: 'Original restrained cinematic platformer character.',
      continuity: 'Preserve the same face, proportions, costume and handedness.',
      mustHave: ['clear silhouette', 'stable proportions'],
      mustAvoid: ['protected reconstruction', 'watermark'],
      originality: 'New project-owned identity; do not reconstruct a protected character.',
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
  };
}

test('compiles provider-free one-to-one bootstrap admission requests', () => {
  const master = compileIdentityMasterPlan(request());
  const first = compileIdentityBootstrapAdmission(master);
  const second = compileIdentityBootstrapAdmission(master);
  assert.equal(first.schema, ADMISSION_SCHEMA);
  assert.equal(first.admissionPlanSha256, second.admissionPlanSha256);
  assert.equal(first.sourceIdentityMasterPlanSha256, master.planSha256);
  assert.equal(first.scope, 'identity-master-candidates-only');
  assert.equal(first.requestCount, master.totalJobs);
  assert.equal(first.requests.length, master.totalJobs);
  assert.equal(first.authority.providerExecution, false);
  assert.equal(first.authority.providerAuthorizationRequired, true);
  assert.equal(first.authority.runtimeAsset, false);
  assert.equal(first.authority.animationFamily, false);
  assert.equal(first.authority.approval, false);
  assert.equal(first.authority.promotion, false);
  assert.equal(first.requests[0].providerSelectionDeferred, true);
  assert.equal(first.requests[0].providerRuntimeProfileRequired, true);
  assert.equal(first.requests[0].approvalByGeneration, false);
  assert.match(first.nextGate, /generation itself never approves identity/u);
});

test('rejects tampered identity-master plan self hash', () => {
  const master = compileIdentityMasterPlan(request());
  assert.throws(
    () => compileIdentityBootstrapAdmission({ ...master, totalJobs: master.totalJobs + 1 }),
    /self hash mismatch/u,
  );
});

test('CLI compile is create-only', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-identity-admission-'));
  try {
    const input = path.join(root, 'master.json');
    const output = path.join(root, 'admission.json');
    await writeFile(input, `${JSON.stringify(compileIdentityMasterPlan(request()), null, 2)}\n`);
    await main(['compile', '--input', input, '--output', output]);
    const compiled = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(compiled.schema, ADMISSION_SCHEMA);
    assert.equal(compiled.authority.providerExecution, false);
    await assert.rejects(() => main(['compile', '--input', input, '--output', output]), /EEXIST/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
