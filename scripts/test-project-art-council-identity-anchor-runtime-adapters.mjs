import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
  compileCouncilIdentityAnchorAuthorizationBundle,
  createCouncilIdentityAnchorAuthorizationReview,
} from './project-art/council-identity-anchor-authorization.mjs';
import {
  COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_BUNDLE_SCHEMA,
  compileCouncilIdentityAnchorRuntimeAdapterBundle,
  compileCouncilIdentityAnchorRuntimeAdapterPlan,
  councilIdentityAnchorRuntimeAdapterCapabilities,
  validateCouncilIdentityAnchorRuntimeAdapterBundle,
} from './project-art/council-identity-anchor-runtime-adapters.mjs';
import { runCouncilIdentityAnchorRuntimeAdapterCli } from './compile-project-art-council-identity-anchor-runtime-adapters.mjs';

const ADMISSION_OCCURRED_AT = '2026-08-21T00:00:00.000Z';
const ADMISSION_EXPIRES_AT = '2026-08-21T12:00:00.000Z';
const ADMISSION_COMPILED_AT = '2026-08-21T01:00:00.000Z';
const AUTHORIZATION_OCCURRED_AT = '2026-08-21T02:00:00.000Z';
const AUTHORIZATION_EXPIRES_AT = '2026-08-22T02:00:00.000Z';
const AUTHORIZATION_COMPILED_AT = '2026-08-21T03:00:00.000Z';
const ADAPTER_COMPILED_AT = '2026-08-21T04:00:00.000Z';
const ACTOR_ID = 'greg.parker';
const ADMISSION_EVIDENCE = 'a'.repeat(64);
const AUTHORIZATION_EVIDENCE = 'b'.repeat(64);

function clone(value) {
  return structuredClone(value);
}

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
      'I reviewed all eight full-body-right anchor jobs and approve compilation of their provider admissions only.',
  });
  return compileCouncilIdentityAnchorAdmissionBundle({
    review,
    compiledAt: ADMISSION_COMPILED_AT,
  });
}

function authorizationBundle() {
  const source = admissionBundle();
  const review = createCouncilIdentityAnchorAuthorizationReview({
    admissionBundle: source,
    actorId: ACTOR_ID,
    occurredAt: AUTHORIZATION_OCCURRED_AT,
    expiresAt: AUTHORIZATION_EXPIRES_AT,
    evidenceSha256: AUTHORIZATION_EVIDENCE,
    statement:
      'I reviewed the exact eight provider admissions and authorize one provider call for each admission within the declared time window, with no fallback or automatic retry.',
  });
  return compileCouncilIdentityAnchorAuthorizationBundle({
    admissionBundle: source,
    review,
    compiledAt: AUTHORIZATION_COMPILED_AT,
  });
}

function adapterBundle() {
  return compileCouncilIdentityAnchorRuntimeAdapterBundle({
    authorizationBundle: authorizationBundle(),
    compiledAt: ADAPTER_COMPILED_AT,
  });
}

test('V4.7 plan preserves the ordered eight-anchor matrix and zero execution authority', () => {
  const plan = compileCouncilIdentityAnchorRuntimeAdapterPlan();
  assert.equal(plan.version, '4.7.0');
  assert.equal(plan.counts.providerAuthorizationsRequired, 8);
  assert.equal(plan.counts.runtimeAdaptersCompiled, 0);
  assert.equal(plan.counts.providerExecutionsPerformed, 0);
  assert.deepEqual(
    plan.targets.map((target) => [target.ordinal, target.characterId, target.setId]),
    [
      [1, 'council-critic', 'candidate-set-01'],
      [2, 'council-critic', 'candidate-set-02'],
      [3, 'council-critic', 'candidate-set-03'],
      [4, 'council-critic', 'candidate-set-04'],
      [5, 'council-open-reviewer', 'candidate-set-01'],
      [6, 'council-open-reviewer', 'candidate-set-02'],
      [7, 'council-open-reviewer', 'candidate-set-03'],
      [8, 'council-open-reviewer', 'candidate-set-04'],
    ],
  );
  assert.equal(plan.adapterPolicy.authorizationMustBeActiveAtCompileTime, true);
  assert.equal(plan.adapterPolicy.authorizationMustBeRevalidatedAtExecutionTime, true);
  assert.equal(plan.adapterPolicy.adapterCompilationPerformsProviderExecution, false);
  assert.equal(plan.adapterPolicy.adapterCompilationConsumesAuthorization, false);
  assert.ok(Object.values(plan.authority).every((value) => value === false));
});

test('bundle compiles eight distinct exact Runtime adapters without execution', () => {
  const bundle = adapterBundle();
  assert.equal(bundle.schema, COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_BUNDLE_SCHEMA);
  assert.equal(bundle.status, 'eight-anchor-runtime-adapters-compiled-not-executed');
  assert.equal(bundle.counts.providerAdmissionsBound, 8);
  assert.equal(bundle.counts.providerAuthorizationsBound, 8);
  assert.equal(bundle.counts.runtimeAdaptersCompiled, 8);
  assert.equal(bundle.counts.durableRuntimeReservationsEstablished, 0);
  assert.equal(bundle.counts.providerExecutionsPerformed, 0);
  assert.equal(bundle.adapters.length, 8);
  assert.equal(new Set(bundle.adapters.map((entry) => entry.adapterSha256)).size, 8);
  assert.equal(new Set(bundle.adapters.map((entry) => entry.adapterEntrySha256)).size, 8);
  for (const [index, entry] of bundle.adapters.entries()) {
    const authorization = bundle.sourceAuthorizationBundle.authorizations[index];
    assert.equal(entry.ordinal, index + 1);
    assert.equal(entry.campaignJobId, authorization.campaignJobId);
    assert.equal(entry.authorizationEntrySha256, authorization.authorizationEntrySha256);
    assert.equal(
      entry.authorizationSha256,
      authorization.providerAuthorization.authorizationSha256,
    );
    assert.equal(entry.status, 'runtime-adapter-compiled-not-executed');
    assert.equal(entry.runtimeAdapter.adapterSha256, entry.adapterSha256);
    assert.equal(entry.runtimeAdapter.executionPolicy.maximumProviderCalls, 1);
    assert.equal(entry.runtimeAdapter.executionPolicy.maximumRuntimeAttempts, 1);
    assert.equal(entry.runtimeAdapter.executionPolicy.providerFallbackAllowed, false);
    assert.equal(entry.runtimeAdapter.executionPolicy.generationEqualsApproval, false);
    assert.equal(entry.providerExecutionReceipt, null);
    assert.deepEqual(entry.runtimeReservation, {
      established: false,
      runtimeJobId: null,
      reservationReceipt: null,
    });
    assert.ok(Object.values(entry.runtimeAdapter.authority).every((value) => value === false));
    assert.ok(Object.values(entry.authority).every((value) => value === false));
  }
  assert.equal(bundle.authorizationWindow.activeAtCompileTime, true);
  assert.equal(bundle.executionBoundary.adapterCompilationPerformsProviderExecution, false);
  assert.equal(bundle.executionBoundary.adapterCompilationConsumesAuthorization, false);
  assert.equal(bundle.executionBoundary.authorizationMustBeRevalidatedAtExecutionTime, true);
  assert.equal(bundle.executionBoundary.exactAdapterFileSha256RequiredBeforeExecution, true);
  assert.equal(bundle.executionBoundary.durableRuntimeReservationEstablished, false);
  assert.equal(bundle.globalAnchorBarrier.dependentAdmissionCompilationAllowed, false);
  assert.ok(Object.values(bundle.authority).every((value) => value === false));
});

test('validator deterministically recompiles the complete adapter graph', () => {
  const bundle = adapterBundle();
  assert.deepEqual(validateCouncilIdentityAnchorRuntimeAdapterBundle(bundle), {
    valid: true,
    schema: COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_BUNDLE_SCHEMA,
    bundleSha256: bundle.bundleSha256,
    providerAdmissionCount: 8,
    providerAuthorizationCount: 8,
    runtimeAdapterCount: 8,
    durableRuntimeReservationCount: 0,
    providerExecutionCount: 0,
    identityApprovalCount: 0,
    runtimeActivation: false,
    websiteActivation: false,
  });
});

test('adapter compilation rejects authorization windows that are not active', () => {
  const source = authorizationBundle();
  assert.throws(
    () =>
      compileCouncilIdentityAnchorRuntimeAdapterBundle({
        authorizationBundle: source,
        compiledAt: AUTHORIZATION_EXPIRES_AT,
      }),
    codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_AUTHORIZATION_NOT_ACTIVE'),
  );
  assert.throws(
    () =>
      compileCouncilIdentityAnchorRuntimeAdapterBundle({
        authorizationBundle: source,
        compiledAt: '2026-08-21T01:59:59.999Z',
      }),
    codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_AUTHORIZATION_NOT_ACTIVE'),
  );
});

test('authorization, adapter and execution mutations fail closed', () => {
  const authorization = clone(authorizationBundle());
  authorization.authorizations[0].providerAuthorization.maximumProviderCalls = 2;
  assert.throws(
    () =>
      compileCouncilIdentityAnchorRuntimeAdapterBundle({
        authorizationBundle: authorization,
        compiledAt: ADAPTER_COMPILED_AT,
      }),
    /AUTHORIZATION_BUNDLE_HASH_MISMATCH|AUTHORIZATION/u,
  );

  const changed = clone(adapterBundle());
  changed.adapters[0].runtimeAdapter.executionPolicy.maximumProviderCalls = 2;
  assert.throws(
    () => validateCouncilIdentityAnchorRuntimeAdapterBundle(changed),
    codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_BUNDLE_HASH_MISMATCH'),
  );

  const execution = clone(adapterBundle());
  execution.adapters[0].providerExecutionReceipt = { status: 'succeeded' };
  assert.throws(
    () => validateCouncilIdentityAnchorRuntimeAdapterBundle(execution),
    codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_BUNDLE_HASH_MISMATCH'),
  );
});

test('resigned reordering and ninth-adapter injection fail deterministic recompilation', () => {
  const reordered = clone(adapterBundle());
  [reordered.adapters[0], reordered.adapters[1]] = [
    reordered.adapters[1],
    reordered.adapters[0],
  ];
  const reorderedBody = clone(reordered);
  delete reorderedBody.bundleSha256;
  reordered.bundleSha256 = sha256Json(reorderedBody);
  assert.throws(
    () => validateCouncilIdentityAnchorRuntimeAdapterBundle(reordered),
    codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_BUNDLE_RECOMPILE_MISMATCH'),
  );

  const ninth = clone(adapterBundle());
  ninth.adapters.push(clone(ninth.adapters[0]));
  ninth.counts.runtimeAdaptersCompiled = 9;
  const ninthBody = clone(ninth);
  delete ninthBody.bundleSha256;
  ninth.bundleSha256 = sha256Json(ninthBody);
  assert.throws(
    () => validateCouncilIdentityAnchorRuntimeAdapterBundle(ninth),
    codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_BUNDLE_RECOMPILE_MISMATCH'),
  );
});

test('capabilities expose compile-only V4.7 truth', () => {
  const capabilities = councilIdentityAnchorRuntimeAdapterCapabilities();
  assert.equal(capabilities.version, '4.7.0');
  assert.equal(capabilities.providerAuthorizationCountRequired, 8);
  assert.equal(capabilities.runtimeAdapterCount, 8);
  assert.equal(capabilities.authorizationMustBeActiveAtCompileTime, true);
  assert.equal(capabilities.authorizationMustBeRevalidatedAtExecutionTime, true);
  assert.equal(capabilities.exactIdentityRequestFileSha256Required, true);
  assert.equal(capabilities.runtimeAdapterCompilationAvailable, true);
  assert.equal(capabilities.separateAdapterFilePackagingAvailable, false);
  assert.equal(capabilities.durableRuntimeReservationEstablished, false);
  assert.equal(capabilities.providerExecutionAvailable, false);
  assert.equal(capabilities.identityApprovalAvailable, false);
  assert.equal(capabilities.runtimeActivationAvailable, false);
  assert.equal(capabilities.websiteActivationAvailable, false);
  assert.ok(Object.values(capabilities.authority).every((value) => value === false));
});

test('CLI performs create-only compile and validate round trips', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'evavo-council-anchor-adapters-'));
  try {
    const authorizationPath = path.join(root, 'authorization-bundle.json');
    const adapterPath = path.join(root, 'adapter-bundle.json');
    writeFileSync(
      authorizationPath,
      `${JSON.stringify(authorizationBundle(), null, 2)}\n`,
    );

    const summary = runCouncilIdentityAnchorRuntimeAdapterCli(['summary']);
    assert.equal(summary.providerAuthorizationsRequired, 8);
    assert.equal(summary.runtimeAdaptersCompiled, 0);

    const compileResult = runCouncilIdentityAnchorRuntimeAdapterCli([
      'compile',
      '--authorization-bundle',
      authorizationPath,
      '--compiled-at',
      ADAPTER_COMPILED_AT,
      '--output',
      adapterPath,
    ]);
    assert.equal(compileResult.providerAuthorizationsBound, 8);
    assert.equal(compileResult.runtimeAdaptersCompiled, 8);
    assert.equal(compileResult.durableRuntimeReservationsEstablished, 0);
    assert.equal(compileResult.providerExecutionsPerformed, 0);

    const validation = runCouncilIdentityAnchorRuntimeAdapterCli([
      'validate',
      '--input',
      adapterPath,
    ]);
    assert.equal(validation.valid, true);
    assert.equal(validation.runtimeAdapterCount, 8);
    assert.equal(validation.providerExecutionCount, 0);

    const persisted = JSON.parse(readFileSync(adapterPath, 'utf8'));
    assert.equal(persisted.bundleSha256, compileResult.bundleSha256);

    assert.throws(
      () =>
        runCouncilIdentityAnchorRuntimeAdapterCli([
          'compile',
          '--authorization-bundle',
          authorizationPath,
          '--compiled-at',
          ADAPTER_COMPILED_AT,
          '--output',
          adapterPath,
        ]),
      codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_CLI_OUTPUT_EXISTS'),
    );
    assert.throws(
      () => runCouncilIdentityAnchorRuntimeAdapterCli(['summary', '--execute', 'true']),
      codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_CLI_INVALID'),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
