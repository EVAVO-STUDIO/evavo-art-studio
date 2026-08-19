#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  REVIEW_PLAN_SCHEMA,
  REQUIRED_CHECKS,
  compileIdentityCandidateReviewPlan,
  main,
} from './character-identity-candidate-review-plan.mjs';

const sha = (char) => char.repeat(64);
function evidence(origin = 'provider-generated') {
  const provider = origin === 'provider-generated';
  return {
    schemaVersion: '1.1',
    kind: 'evavo-character-identity-candidate-evidence',
    projectId: 'test-game',
    characterId: 'test-hero',
    identityContract: 'game/art/hero/hero_identity_contract.json',
    candidateOrigin: origin,
    identityMasterPlanSha256: provider ? sha('a') : null,
    bootstrapAdmissionPlanSha256: provider ? sha('b') : null,
    candidateSets: [1, 2].map((setIndex) => ({
      setId: `set-${setIndex}`,
      continuityKey: `test-hero-set-${setIndex}`,
      views: [
        ['full-body-right', '1'],
        ['full-body-left', '2'],
        ['neutral-bust', '3'],
      ].map(([viewId, digit]) => ({
        viewId,
        artifactRef: `storage://test/set-${setIndex}/${viewId}.png`,
        sha256: `${digit}${String(setIndex).repeat(63)}`.slice(0, 64),
        width: 512,
        height: 512,
        alpha: 'transparent',
        providerReceiptRef: provider ? `storage://receipts/set-${setIndex}/${viewId}.json` : null,
        providerReceiptSha256: provider ? sha(String(setIndex)) : null,
      })),
    })),
    authority: {
      candidateEvidenceOnly: true,
      runtimeAsset: false,
      animationFamily: false,
      identityApproved: false,
      promotion: false,
    },
  };
}

test('compiles deterministic review plan without selecting or approving', () => {
  const first = compileIdentityCandidateReviewPlan(evidence());
  const second = compileIdentityCandidateReviewPlan(evidence());
  assert.equal(first.schema, REVIEW_PLAN_SCHEMA);
  assert.equal(first.reviewPlanSha256, second.reviewPlanSha256);
  assert.equal(first.setCount, 2);
  assert.equal(first.reviewSets[0].checks.length, REQUIRED_CHECKS.length);
  assert.deepEqual(first.reviewSets[0].checks.map((item) => item.id), REQUIRED_CHECKS);
  assert.equal(first.reviewSets[0].decision, null);
  assert.equal(first.selectionPolicy.selectionGrantsIdentityApproval, false);
  assert.equal(first.selectionPolicy.separateIdentityApprovalReceiptRequired, true);
  assert.equal(first.authority.providerExecution, false);
  assert.equal(first.authority.selectionPerformed, false);
  assert.equal(first.authority.identityApproved, false);
  assert.match(first.nextGate, /review planning never approves identity/u);
});

test('accepts project-owned evidence without provider semantics', () => {
  const plan = compileIdentityCandidateReviewPlan(evidence('project-owned'));
  assert.equal(plan.candidateOrigin, 'project-owned');
  assert.equal(plan.authority.providerExecution, false);
  assert.equal(plan.authority.identityApproved, false);
});

test('rejects missing three-view continuity evidence', () => {
  const invalid = evidence();
  invalid.candidateSets[0].views.pop();
  assert.throws(() => compileIdentityCandidateReviewPlan(invalid), /exactly three views/u);
});

test('CLI compile is create-only', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evavo-identity-review-'));
  try {
    const input = path.join(root, 'evidence.json');
    const output = path.join(root, 'review-plan.json');
    await writeFile(input, `${JSON.stringify(evidence(), null, 2)}\n`);
    await main(['compile', '--input', input, '--output', output]);
    const compiled = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(compiled.schema, REVIEW_PLAN_SCHEMA);
    assert.equal(compiled.authority.identityApproved, false);
    await assert.rejects(() => main(['compile', '--input', input, '--output', output]), /EEXIST/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
