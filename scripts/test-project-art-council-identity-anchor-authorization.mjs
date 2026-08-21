import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  compileCouncilIdentityAnchorAdmissionBundle,
  createCouncilIdentityAnchorAdmissionReview,
} from './project-art/council-identity-anchor-admission.mjs';
import {
  COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_BUNDLE_SCHEMA,
  compileCouncilIdentityAnchorAuthorizationBundle,
  compileCouncilIdentityAnchorAuthorizationPlan,
  councilIdentityAnchorAuthorizationCapabilities,
  createCouncilIdentityAnchorAuthorizationReview,
  createCouncilIdentityAnchorAuthorizationReviewTemplate,
  validateCouncilIdentityAnchorAuthorizationBundle,
} from './project-art/council-identity-anchor-authorization.mjs';
import { runCouncilIdentityAnchorAuthorizationCli } from './compile-project-art-council-identity-anchor-authorization.mjs';

const ADMISSION_OCCURRED_AT = '2026-08-21T00:00:00.000Z';
const ADMISSION_EXPIRES_AT = '2026-08-21T12:00:00.000Z';
const ADMISSION_COMPILED_AT = '2026-08-21T01:00:00.000Z';
const AUTHORIZATION_OCCURRED_AT = '2026-08-21T02:00:00.000Z';
const AUTHORIZATION_EXPIRES_AT = '2026-08-22T02:00:00.000Z';
const AUTHORIZATION_COMPILED_AT = '2026-08-21T03:00:00.000Z';
const ACTOR_ID = 'greg.parker';
const ADMISSION_EVIDENCE = 'a'.repeat(64);
const AUTHORIZATION_EVIDENCE = 'b'.repeat(64);

function clone(value) {
  return structuredClone(value);
}

function codeIs(...expected) {
  return (error) => {
    assert.ok(error instanceof Error);
    assert.ok(
      expected.includes(error.code),
      `expected one of ${expected.join(', ')}; received ${String(error.code)}`,
    );
    return true;
  };
}

function admissionBundle() {
  const review = createCouncilIdentityAnchorAdmissionReview({
    actorId: ACTOR_ID,
    occurredAt: ADMISSION_OCCURRED_AT,
    expiresAt: ADMISSION_EXPIRES_AT,
    evidenceSha256: ADMISSION_EVIDENCE,
    statement:
      'I reviewed all eight full-body-right anchor jobs and approve compilation of their V4.5 provider admissions only.',
  });
  return compileCouncilIdentityAnchorAdmissionBundle({
    review,
    compiledAt: ADMISSION_COMPILED_AT,
  });
}

function authorizationReview(bundle = admissionBundle()) {
  return createCouncilIdentityAnchorAuthorizationReview({
    admissionBundle: bundle,
    actorId: ACTOR_ID,
    occurredAt: AUTHORIZATION_OCCURRED_AT,
    expiresAt: AUTHORIZATION_EXPIRES_AT,
    evidenceSha256: AUTHORIZATION_EVIDENCE,
    statement:
      'I reviewed the exact eight V4.5 provider admissions and authorize one provider call for each admission within the declared time window, with no fallback or automatic retry.',
  });
}

function authorizationBundle() {
  const source = admissionBundle();
  return compileCouncilIdentityAnchorAuthorizationBundle({
    admissionBundle: source,
    review: authorizationReview(source),
    compiledAt: AUTHORIZATION_COMPILED_AT,
  });
}

test('V4.6 plan preserves the exact ordered eight-anchor matrix', () => {
  const plan = compileCouncilIdentityAnchorAuthorizationPlan();
  assert.equal(plan.version, '4.6.0');
  assert.equal(plan.counts.providerAdmissionsRequired, 8);
  assert.equal(plan.counts.providerAuthorizationsCompiled, 0);
  assert.equal(plan.counts.runtimeAdaptersCompiled, 0);
  assert.equal(plan.counts.providerExecutionsPerformed, 0);
  assert.deepEqual(
    plan.targets.map((target) => [
      target.ordinal,
      target.characterId,
      target.setId,
      target.viewId,
    ]),
    [
      [1, 'council-critic', 'candidate-set-01', 'full-body-right'],
      [2, 'council-critic', 'candidate-set-02', 'full-body-right'],
      [3, 'council-critic', 'candidate-set-03', 'full-body-right'],
      [4, 'council-critic', 'candidate-set-04', 'full-body-right'],
      [5, 'council-open-reviewer', 'candidate-set-01', 'full-body-right'],
      [6, 'council-open-reviewer', 'candidate-set-02', 'full-body-right'],
      [7, 'council-open-reviewer', 'candidate-set-03', 'full-body-right'],
      [8, 'council-open-reviewer', 'candidate-set-04', 'full-body-right'],
    ],
  );
  assert.equal(plan.authorizationPolicy.separateAuthorizationPerAdmission, true);
  assert.equal(plan.authorizationPolicy.oneShotPerAuthorization, true);
  assert.equal(plan.authorizationPolicy.maximumProviderCallsTotal, 8);
  assert.equal(
    plan.authorizationPolicy.durableConsumptionLedgerRequiredBeforeExecution,
    true,
  );
  assert.equal(
    plan.authorizationPolicy.authorizationCompilationPerformsProviderExecution,
    false,
  );
  assert.ok(Object.values(plan.authority).every((value) => value === false));
});

test('review template binds one exact V4.5 bundle and all eight admission hashes', () => {
  const source = admissionBundle();
  const template = createCouncilIdentityAnchorAuthorizationReviewTemplate(source);
  assert.equal(template.sourceAdmissionBundle.bundleSha256, source.bundleSha256);
  assert.equal(template.targetCampaignJobIds.length, 8);
  assert.deepEqual(
    template.targetProviderAdmissionSha256s,
    source.admissions.map(
      (entry) => entry.providerAdmission.providerAdmissionSha256,
    ),
  );
  assert.deepEqual(
    template.targetAdmissionEntrySha256s,
    source.admissions.map((entry) => entry.entrySha256),
  );
  assert.equal(template.constraints.maximumProviderCallsTotal, 8);
  assert.equal(template.constraints.providerExecutionPerformed, false);
  assert.equal(
    template.constraints.durableConsumptionLedgerRequiredBeforeExecution,
    true,
  );
  assert.match(template.templateSha256, /^[a-f0-9]{64}$/u);
});

test('named-human review grants only the exact eight one-shot authorizations', () => {
  const source = admissionBundle();
  const review = authorizationReview(source);
  assert.equal(review.actorClass, 'human');
  assert.equal(review.actorId, ACTOR_ID);
  assert.equal(review.sourceAdmissionBundle.bundleSha256, source.bundleSha256);
  assert.equal(review.maximumAuthorizationRecords, 8);
  assert.equal(review.maximumProviderCallsPerAuthorization, 1);
  assert.equal(review.maximumProviderCallsTotal, 8);
  assert.equal(review.oneShotEach, true);
  assert.equal(review.providerAuthorizationGrantedForTargets, true);
  assert.equal(review.runtimeAdapterCompilationPerformed, false);
  assert.equal(review.providerExecutionPerformed, false);
  assert.equal(review.automaticExecutionGranted, false);
  assert.equal(review.candidateApprovalGranted, false);
  assert.equal(review.identityApprovalGranted, false);
  assert.equal(review.runtimeActivationGranted, false);
  assert.equal(review.websiteActivationGranted, false);
  assert.equal(
    review.durableConsumptionLedgerRequiredBeforeExecution,
    true,
  );
  assert.ok(Object.values(review.authority).every((value) => value === false));
  assert.match(review.reviewSha256, /^[a-f0-9]{64}$/u);
});

test('bundle compiles exactly eight separate generic provider authorizations', () => {
  const bundle = authorizationBundle();
  assert.equal(bundle.schema, COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_BUNDLE_SCHEMA);
  assert.equal(
    bundle.status,
    'eight-anchor-provider-authorizations-compiled-not-adapted-not-executed',
  );
  assert.equal(bundle.counts.providerAdmissionsBound, 8);
  assert.equal(bundle.counts.providerAuthorizationsCompiled, 8);
  assert.equal(bundle.counts.runtimeAdaptersCompiled, 0);
  assert.equal(bundle.counts.providerExecutionsPerformed, 0);
  assert.equal(bundle.authorizations.length, 8);
  assert.equal(
    new Set(
      bundle.authorizations.map(
        (entry) => entry.providerAuthorization.authorizationSha256,
      ),
    ).size,
    8,
  );
  assert.equal(
    new Set(
      bundle.authorizations.map(
        (entry) => entry.authorizationEvidenceSha256,
      ),
    ).size,
    8,
  );
  for (const [index, entry] of bundle.authorizations.entries()) {
    const source = bundle.sourceAdmissionBundle.admissions[index];
    assert.equal(entry.ordinal, index + 1);
    assert.equal(entry.campaignJobId, source.campaignJobId);
    assert.equal(entry.admissionEntrySha256, source.entrySha256);
    assert.equal(
      entry.providerAdmissionSha256,
      source.providerAdmission.providerAdmissionSha256,
    );
    assert.equal(
      entry.status,
      'provider-authorized-one-shot-not-adapted-not-executed',
    );
    assert.equal(entry.providerAuthorization.action, 'run-character-identity-provider-once');
    assert.equal(entry.providerAuthorization.actorClass, 'human');
    assert.equal(entry.providerAuthorization.actorId, ACTOR_ID);
    assert.equal(
      entry.providerAuthorization.occurredAt,
      AUTHORIZATION_OCCURRED_AT,
    );
    assert.equal(
      entry.providerAuthorization.expiresAt,
      AUTHORIZATION_EXPIRES_AT,
    );
    assert.equal(entry.providerAuthorization.maximumProviderCalls, 1);
    assert.equal(entry.providerAuthorization.oneShot, true);
    assert.equal(entry.runtimeAdapter, null);
    assert.equal(entry.providerExecutionReceipt, null);
    assert.equal(entry.consumption.durableConsumptionLedgerEstablished, false);
    assert.equal(entry.consumption.consumed, false);
    assert.equal(entry.consumption.consumptionReceipt, null);
    assert.ok(
      Object.values(entry.providerAuthorization.authority).every(
        (value) => value === false,
      ),
    );
    assert.ok(Object.values(entry.authority).every((value) => value === false));
  }
  assert.equal(bundle.executionBoundary.totalMaximumProviderCalls, 8);
  assert.equal(bundle.executionBoundary.providerFallbackAllowed, false);
  assert.equal(bundle.executionBoundary.automaticRetryAllowed, false);
  assert.equal(bundle.executionBoundary.runtimeAdapterRequiredBeforeExecution, true);
  assert.equal(bundle.executionBoundary.durableConsumptionLedgerEstablished, false);
  assert.equal(
    bundle.executionBoundary.durableConsumptionLedgerRequiredBeforeExecution,
    true,
  );
  assert.equal(
    bundle.executionBoundary.authorizationCompilationPerformsProviderExecution,
    false,
  );
  assert.equal(bundle.globalAnchorBarrier.successfulAnchorExecutionReceiptCount, 0);
  assert.equal(bundle.globalAnchorBarrier.dependentAdmissionCompilationAllowed, false);
  assert.ok(Object.values(bundle.authority).every((value) => value === false));
  assert.match(bundle.bundleSha256, /^[a-f0-9]{64}$/u);
});

test('bundle validator deterministically recompiles the complete authorization graph', () => {
  const bundle = authorizationBundle();
  const result = validateCouncilIdentityAnchorAuthorizationBundle(bundle);
  assert.deepEqual(result, {
    valid: true,
    schema: COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_BUNDLE_SCHEMA,
    bundleSha256: bundle.bundleSha256,
    providerAdmissionCount: 8,
    providerAuthorizationCount: 8,
    maximumProviderCallsTotal: 8,
    runtimeAdapterCount: 0,
    providerExecutionCount: 0,
    identityApprovalCount: 0,
    durableConsumptionLedgerEstablished: false,
    runtimeActivation: false,
    websiteActivation: false,
  });
});

test('review and compilation fail closed on drift, reordering, expiry and escalation', () => {
  const source = admissionBundle();

  const alteredAdmission = clone(source);
  alteredAdmission.admissions[0].providerAdmission.jobId = 'candidate-set-99-full-body-right';
  assert.throws(
    () => createCouncilIdentityAnchorAuthorizationReviewTemplate(alteredAdmission),
    /COUNCIL_IDENTITY_ANCHOR_ADMISSION_BUNDLE_HASH_MISMATCH|CHARACTER_IDENTITY/u,
  );

  assert.throws(
    () =>
      createCouncilIdentityAnchorAuthorizationReview({
        admissionBundle: source,
        actorId: ACTOR_ID,
        occurredAt: AUTHORIZATION_OCCURRED_AT,
        expiresAt: '2026-08-22T02:00:00.001Z',
        evidenceSha256: AUTHORIZATION_EVIDENCE,
        statement:
          'I authorize the exact eight provider admissions for one provider call each and no fallback.',
      }),
    codeIs('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_WINDOW_INVALID'),
  );

  const review = authorizationReview(source);
  const reordered = clone(review);
  [reordered.targetCampaignJobIds[0], reordered.targetCampaignJobIds[1]] = [
    reordered.targetCampaignJobIds[1],
    reordered.targetCampaignJobIds[0],
  ];
  assert.throws(
    () =>
      compileCouncilIdentityAnchorAuthorizationBundle({
        admissionBundle: source,
        review: reordered,
        compiledAt: AUTHORIZATION_COMPILED_AT,
      }),
    codeIs('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_HASH_MISMATCH'),
  );

  const escalated = clone(review);
  escalated.authority.providerExecution = true;
  assert.throws(
    () =>
      compileCouncilIdentityAnchorAuthorizationBundle({
        admissionBundle: source,
        review: escalated,
        compiledAt: AUTHORIZATION_COMPILED_AT,
      }),
    codeIs('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_HASH_MISMATCH'),
  );

  assert.throws(
    () =>
      compileCouncilIdentityAnchorAuthorizationBundle({
        admissionBundle: source,
        review,
        compiledAt: '2026-08-22T02:00:00.001Z',
      }),
    codeIs('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_NOT_ACTIVE'),
  );
});

test('bundle mutation, ninth authorization and execution injection are rejected', () => {
  const original = authorizationBundle();

  const changedAuthorization = clone(original);
  changedAuthorization.authorizations[0].providerAuthorization.maximumProviderCalls = 2;
  assert.throws(
    () => validateCouncilIdentityAnchorAuthorizationBundle(changedAuthorization),
    codeIs('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_BUNDLE_HASH_MISMATCH'),
  );

  const ninth = clone(original);
  ninth.authorizations.push(clone(ninth.authorizations[0]));
  assert.throws(
    () => validateCouncilIdentityAnchorAuthorizationBundle(ninth),
    codeIs('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_BUNDLE_HASH_MISMATCH'),
  );

  const execution = clone(original);
  execution.authorizations[0].providerExecutionReceipt = { status: 'succeeded' };
  assert.throws(
    () => validateCouncilIdentityAnchorAuthorizationBundle(execution),
    codeIs('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_BUNDLE_HASH_MISMATCH'),
  );
});

test('capabilities expose compile-only V4.6 truth', () => {
  const capabilities = councilIdentityAnchorAuthorizationCapabilities();
  assert.equal(capabilities.version, '4.6.0');
  assert.equal(capabilities.providerAdmissionCountRequired, 8);
  assert.equal(capabilities.providerAuthorizationCount, 8);
  assert.equal(capabilities.maximumProviderCallsPerAuthorization, 1);
  assert.equal(capabilities.maximumProviderCallsTotal, 8);
  assert.equal(capabilities.namedHumanReviewRequired, true);
  assert.equal(capabilities.exactAdmissionBundleRequired, true);
  assert.equal(capabilities.providerAuthorizationCompilationAvailable, true);
  assert.equal(capabilities.runtimeAdapterCompilationAvailable, false);
  assert.equal(capabilities.durableConsumptionLedgerEstablished, false);
  assert.equal(capabilities.providerExecutionAvailable, false);
  assert.equal(capabilities.candidateApprovalAvailable, false);
  assert.equal(capabilities.identityApprovalAvailable, false);
  assert.equal(capabilities.runtimeActivationAvailable, false);
  assert.equal(capabilities.websiteActivationAvailable, false);
  assert.ok(Object.values(capabilities.authority).every((value) => value === false));
});

test('CLI performs create-only template, review, compile and validate round trips', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'evavo-council-anchor-auth-'));
  try {
    const source = admissionBundle();
    const admissionPath = path.join(root, 'admission-bundle.json');
    const statementPath = path.join(root, 'statement.txt');
    const templatePath = path.join(root, 'template.json');
    const reviewPath = path.join(root, 'review.json');
    const bundlePath = path.join(root, 'authorization-bundle.json');
    writeFileSync(admissionPath, `${JSON.stringify(source, null, 2)}\n`);
    writeFileSync(
      statementPath,
      'I authorize the exact eight provider admissions for one provider call each during this window, with no fallback or retry.\n',
    );

    const summary = runCouncilIdentityAnchorAuthorizationCli(['summary']);
    assert.equal(summary.providerAdmissionsRequired, 8);
    assert.equal(summary.providerAuthorizationsCompiled, 0);

    const templateResult = runCouncilIdentityAnchorAuthorizationCli([
      'template',
      '--admission-bundle',
      admissionPath,
      '--output',
      templatePath,
    ]);
    assert.equal(templateResult.providerAuthorization, false);
    assert.equal(templateResult.providerExecution, false);

    const reviewResult = runCouncilIdentityAnchorAuthorizationCli([
      'review',
      '--admission-bundle',
      admissionPath,
      '--actor-id',
      ACTOR_ID,
      '--occurred-at',
      AUTHORIZATION_OCCURRED_AT,
      '--expires-at',
      AUTHORIZATION_EXPIRES_AT,
      '--evidence-sha256',
      AUTHORIZATION_EVIDENCE,
      '--statement-file',
      statementPath,
      '--output',
      reviewPath,
    ]);
    assert.equal(reviewResult.providerAuthorizationsApprovedForCompilation, 8);
    assert.equal(reviewResult.providerExecutionPerformed, false);

    const compileResult = runCouncilIdentityAnchorAuthorizationCli([
      'compile',
      '--admission-bundle',
      admissionPath,
      '--review',
      reviewPath,
      '--compiled-at',
      AUTHORIZATION_COMPILED_AT,
      '--output',
      bundlePath,
    ]);
    assert.equal(compileResult.providerAdmissionsBound, 8);
    assert.equal(compileResult.providerAuthorizationsCompiled, 8);
    assert.equal(compileResult.runtimeAdaptersCompiled, 0);
    assert.equal(compileResult.providerExecutionsPerformed, 0);
    assert.equal(compileResult.durableConsumptionLedgerEstablished, false);

    const validation = runCouncilIdentityAnchorAuthorizationCli([
      'validate',
      '--input',
      bundlePath,
    ]);
    assert.equal(validation.valid, true);
    assert.equal(validation.providerAuthorizationCount, 8);
    assert.equal(validation.providerExecutionCount, 0);

    const persisted = JSON.parse(readFileSync(bundlePath, 'utf8'));
    assert.equal(persisted.bundleSha256, compileResult.bundleSha256);

    assert.throws(
      () =>
        runCouncilIdentityAnchorAuthorizationCli([
          'template',
          '--admission-bundle',
          admissionPath,
          '--output',
          templatePath,
        ]),
      codeIs('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_CLI_OUTPUT_EXISTS'),
    );
    assert.throws(
      () => runCouncilIdentityAnchorAuthorizationCli(['summary', '--execute', 'true']),
      codeIs('COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_CLI_INVALID'),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
