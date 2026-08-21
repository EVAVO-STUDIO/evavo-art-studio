import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  compileCouncilIdentityAnchorAdmissionBundle,
  compileCouncilIdentityAnchorAdmissionPlan,
  councilIdentityAnchorAdmissionCapabilities,
  createCouncilIdentityAnchorAdmissionReview,
  createCouncilIdentityAnchorAdmissionReviewTemplate,
  validateCouncilIdentityAnchorAdmissionBundle,
} from './project-art/council-identity-anchor-admission.mjs';

const OCCURRED_AT = '2026-08-21T03:30:00.000Z';
const EXPIRES_AT = '2026-08-21T05:30:00.000Z';
const COMPILED_AT = '2026-08-21T04:00:00.000Z';
const EVIDENCE = 'a'.repeat(64);
const STATEMENT =
  'I reviewed all eight Veyra and Moro Pell full-body-right anchor jobs and approve provider admission compilation only; provider authorization and execution remain separate.';

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
}

function sha256Json(value) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function review() {
  return createCouncilIdentityAnchorAdmissionReview({
    actorId: 'greg-parker-test',
    occurredAt: OCCURRED_AT,
    expiresAt: EXPIRES_AT,
    evidenceSha256: EVIDENCE,
    statement: STATEMENT,
  });
}

function resign(value, hashField) {
  const body = structuredClone(value);
  delete body[hashField];
  return { ...body, [hashField]: sha256Json(body) };
}

test('V4.5 plan binds exactly eight ordered full-body-right anchor jobs', () => {
  const plan = compileCouncilIdentityAnchorAdmissionPlan();
  assert.equal(plan.version, '4.5.0');
  assert.equal(plan.counts.anchorJobs, 8);
  assert.equal(plan.counts.dependentJobsExcluded, 16);
  assert.equal(plan.counts.providerAdmissionsCompiled, 0);
  assert.equal(plan.anchors.length, 8);
  assert.deepEqual(
    plan.anchors.map((entry) => [entry.characterId, entry.setId, entry.viewId]),
    [
      ['council-critic', 'candidate-set-01', 'full-body-right'],
      ['council-critic', 'candidate-set-02', 'full-body-right'],
      ['council-critic', 'candidate-set-03', 'full-body-right'],
      ['council-critic', 'candidate-set-04', 'full-body-right'],
      ['council-open-reviewer', 'candidate-set-01', 'full-body-right'],
      ['council-open-reviewer', 'candidate-set-02', 'full-body-right'],
      ['council-open-reviewer', 'candidate-set-03', 'full-body-right'],
      ['council-open-reviewer', 'candidate-set-04', 'full-body-right'],
    ],
  );
  assert.ok(plan.anchors.every((entry) => entry.providerExecutionAllowed === false));
  assert.ok(Object.values(plan.authority).every((value) => value === false));
  assert.match(plan.planSha256, /^[a-f0-9]{64}$/u);
});

test('review template is exact, pending and grants no downstream authority', () => {
  const template = createCouncilIdentityAnchorAdmissionReviewTemplate();
  assert.equal(template.anchorCampaignJobIds.length, 8);
  assert.equal(template.constraints.exactAnchorCount, 8);
  assert.equal(template.constraints.oneShot, true);
  assert.equal(template.constraints.providerAuthorizationGranted, false);
  assert.equal(template.constraints.providerExecutionGranted, false);
  assert.ok(Object.values(template.authority).every((value) => value === false));
  assert.match(template.templateSha256, /^[a-f0-9]{64}$/u);
});

test('named-human review self-hashes the exact campaign and all eight anchors', () => {
  const value = review();
  const plan = compileCouncilIdentityAnchorAdmissionPlan();
  assert.equal(value.actorClass, 'human');
  assert.equal(value.actorId, 'greg-parker-test');
  assert.equal(value.campaignSha256, plan.sourceCampaign.campaignSha256);
  assert.deepEqual(value.anchorCampaignJobIds, plan.anchorCampaignJobIds);
  assert.equal(value.maximumAdmissionRecords, 8);
  assert.equal(value.providerAuthorizationGranted, false);
  assert.equal(value.providerExecutionGranted, false);
  assert.match(value.reviewSha256, /^[a-f0-9]{64}$/u);
});

test('bundle compiles exactly eight provider admissions and nothing executable', () => {
  const bundle = compileCouncilIdentityAnchorAdmissionBundle({
    review: review(),
    compiledAt: COMPILED_AT,
  });
  assert.equal(bundle.counts.providerAdmissionsCompiled, 8);
  assert.equal(bundle.counts.providerAuthorizationsCompiled, 0);
  assert.equal(bundle.counts.providerExecutionsPerformed, 0);
  assert.equal(bundle.counts.dependentAdmissionsCompiled, 0);
  assert.equal(bundle.admissions.length, 8);
  for (const [index, entry] of bundle.admissions.entries()) {
    assert.equal(entry.ordinal, index + 1);
    assert.equal(entry.viewId, 'full-body-right');
    assert.equal(entry.status, 'provider-admitted-not-authorized');
    assert.equal(entry.providerAuthorization, null);
    assert.equal(entry.providerExecutionReceipt, null);
    assert.equal(entry.providerAdmission.identityAnchor, null);
    assert.equal(entry.providerAdmission.limits.candidates, 1);
    assert.equal(entry.providerAdmission.limits.providerCalls, 1);
    assert.equal(entry.providerAdmission.limits.providerFallback, false);
    assert.equal(entry.providerAdmission.limits.runtimeAttempts, 1);
    assert.ok(
      Object.values(entry.providerAdmission.authority).every(
        (value) => value === false,
      ),
    );
    assert.ok(Object.values(entry.authority).every((value) => value === false));
  }
  assert.equal(bundle.globalAnchorBarrier.successfulAnchorExecutionReceiptCount, 0);
  assert.equal(bundle.globalAnchorBarrier.dependentAdmissionCompilationAllowed, false);
  assert.equal(bundle.replayBoundary.durableReviewConsumptionLedgerEstablished, false);
  assert.equal(validateCouncilIdentityAnchorAdmissionBundle(bundle).valid, true);
});

test('review campaign, order, authority and active-window tampering fail closed', () => {
  const original = review();
  const wrongCampaign = resign(
    { ...original, campaignSha256: 'b'.repeat(64) },
    'reviewSha256',
  );
  assert.throws(
    () =>
      compileCouncilIdentityAnchorAdmissionBundle({
        review: wrongCampaign,
        compiledAt: COMPILED_AT,
      }),
    /REVIEW_INVALID/u,
  );

  const reordered = structuredClone(original);
  [reordered.anchorCampaignJobIds[0], reordered.anchorCampaignJobIds[1]] = [
    reordered.anchorCampaignJobIds[1],
    reordered.anchorCampaignJobIds[0],
  ];
  assert.throws(
    () =>
      compileCouncilIdentityAnchorAdmissionBundle({
        review: resign(reordered, 'reviewSha256'),
        compiledAt: COMPILED_AT,
      }),
    /REVIEW_INVALID/u,
  );

  const escalated = resign(
    {
      ...original,
      authority: { ...original.authority, providerExecution: true },
    },
    'reviewSha256',
  );
  assert.throws(
    () =>
      compileCouncilIdentityAnchorAdmissionBundle({
        review: escalated,
        compiledAt: COMPILED_AT,
      }),
    /AUTHORITY_INVALID/u,
  );

  assert.throws(
    () =>
      compileCouncilIdentityAnchorAdmissionBundle({
        review: original,
        compiledAt: '2026-08-22T05:30:00.000Z',
      }),
    /REVIEW_NOT_ACTIVE/u,
  );
});

test('bundle mutation, nested authority escalation and dependent injection fail', () => {
  const bundle = compileCouncilIdentityAnchorAdmissionBundle({
    review: review(),
    compiledAt: COMPILED_AT,
  });
  const mutated = structuredClone(bundle);
  mutated.admissions[0].providerAdmission.selection.preferredModel = 'other-model';
  assert.throws(
    () => validateCouncilIdentityAnchorAdmissionBundle(mutated),
    /HASH_MISMATCH/u,
  );

  const escalated = structuredClone(bundle);
  escalated.admissions[0].providerAdmission.authority.providerExecution = true;
  assert.throws(
    () => validateCouncilIdentityAnchorAdmissionBundle(escalated),
    /HASH_MISMATCH/u,
  );

  const injected = structuredClone(bundle);
  injected.admissions.push({
    ...injected.admissions[0],
    viewId: 'full-body-left',
  });
  const resignedBundle = resign(injected, 'bundleSha256');
  assert.throws(
    () => validateCouncilIdentityAnchorAdmissionBundle(resignedBundle),
    /RECOMPILE_MISMATCH/u,
  );
});

test('capabilities disclose compile-only admission boundary', () => {
  const capabilities = councilIdentityAnchorAdmissionCapabilities();
  assert.equal(capabilities.anchorAdmissionCount, 8);
  assert.equal(capabilities.dependentAdmissionCount, 0);
  assert.equal(capabilities.namedHumanReviewRequired, true);
  assert.equal(capabilities.maximumReviewWindowHours, 24);
  assert.equal(capabilities.providerAdmissionCompilationAvailable, true);
  assert.equal(capabilities.providerAuthorizationCompilationAvailable, false);
  assert.equal(capabilities.providerExecutionAvailable, false);
  assert.equal(capabilities.identityApprovalAvailable, false);
  assert.equal(capabilities.runtimeActivationAvailable, false);
});

test('CLI creates review and bundle once, validates them and rejects overwrite', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'evavo-anchor-admission-'));
  try {
    const statement = path.join(root, 'statement.txt');
    const reviewFile = path.join(root, 'review.json');
    const bundleFile = path.join(root, 'bundle.json');
    writeFileSync(statement, `${STATEMENT}\n`);
    const reviewResult = spawnSync(
      process.execPath,
      [
        'scripts/compile-project-art-council-identity-anchor-admission.mjs',
        'review',
        '--actor-id',
        'greg-parker-test',
        '--occurred-at',
        OCCURRED_AT,
        '--expires-at',
        EXPIRES_AT,
        '--evidence-sha256',
        EVIDENCE,
        '--statement-file',
        statement,
        '--output',
        reviewFile,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(reviewResult.status, 0, reviewResult.stderr);
    assert.equal(JSON.parse(reviewResult.stdout).anchorJobsReviewed, 8);

    const compileResult = spawnSync(
      process.execPath,
      [
        'scripts/compile-project-art-council-identity-anchor-admission.mjs',
        'compile',
        '--review',
        reviewFile,
        '--compiled-at',
        COMPILED_AT,
        '--output',
        bundleFile,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(compileResult.status, 0, compileResult.stderr);
    assert.equal(JSON.parse(compileResult.stdout).providerAdmissionsCompiled, 8);

    const validateResult = spawnSync(
      process.execPath,
      [
        'scripts/compile-project-art-council-identity-anchor-admission.mjs',
        'validate',
        '--input',
        bundleFile,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(validateResult.status, 0, validateResult.stderr);
    assert.equal(JSON.parse(validateResult.stdout).anchorAdmissionCount, 8);

    const overwrite = spawnSync(
      process.execPath,
      [
        'scripts/compile-project-art-council-identity-anchor-admission.mjs',
        'compile',
        '--review',
        reviewFile,
        '--compiled-at',
        COMPILED_AT,
        '--output',
        bundleFile,
      ],
      { encoding: 'utf8' },
    );
    assert.notEqual(overwrite.status, 0);
    assert.match(overwrite.stderr, /OUTPUT_EXISTS/u);

    const bundle = JSON.parse(readFileSync(bundleFile, 'utf8'));
    assert.equal(bundle.admissions.length, 8);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI rejects unknown flags', () => {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/compile-project-art-council-identity-anchor-admission.mjs',
      'summary',
      '--provider-execution',
      'true',
    ],
    { encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CLI_INVALID/u);
});
