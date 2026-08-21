import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
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
import { compileCouncilIdentityAnchorRuntimeAdapterBundle } from './project-art/council-identity-anchor-runtime-adapters.mjs';
import {
  COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_SCHEMA,
  compileCouncilIdentityAnchorRuntimePackagePlan,
  councilIdentityAnchorRuntimePackageCapabilities,
  materializeCouncilIdentityAnchorRuntimePackage,
  validateCouncilIdentityAnchorRuntimePackage,
} from './project-art/council-identity-anchor-runtime-package.mjs';
import { runCouncilIdentityAnchorRuntimePackageCli } from './compile-project-art-council-identity-anchor-runtime-package.mjs';

const ADMISSION_OCCURRED_AT = '2026-08-21T00:00:00.000Z';
const ADMISSION_EXPIRES_AT = '2026-08-21T12:00:00.000Z';
const ADMISSION_COMPILED_AT = '2026-08-21T01:00:00.000Z';
const AUTHORIZATION_OCCURRED_AT = '2026-08-21T02:00:00.000Z';
const AUTHORIZATION_EXPIRES_AT = '2026-08-22T02:00:00.000Z';
const AUTHORIZATION_COMPILED_AT = '2026-08-21T03:00:00.000Z';
const ADAPTER_COMPILED_AT = '2026-08-21T04:00:00.000Z';
const PACKAGED_AT = '2026-08-21T05:00:00.000Z';
const ACTOR_ID = 'greg.parker';

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
    evidenceSha256: 'a'.repeat(64),
    statement:
      'I reviewed all eight full-body-right anchor jobs and approve compilation of their provider admissions only.',
  });
  return compileCouncilIdentityAnchorAdmissionBundle({
    review,
    compiledAt: ADMISSION_COMPILED_AT,
  });
}

function authorizationBundle() {
  const admission = admissionBundle();
  const review = createCouncilIdentityAnchorAuthorizationReview({
    admissionBundle: admission,
    actorId: ACTOR_ID,
    occurredAt: AUTHORIZATION_OCCURRED_AT,
    expiresAt: AUTHORIZATION_EXPIRES_AT,
    evidenceSha256: 'b'.repeat(64),
    statement:
      'I reviewed the exact eight provider admissions and authorize one provider call for each admission within the declared time window, with no fallback or automatic retry.',
  });
  return compileCouncilIdentityAnchorAuthorizationBundle({
    admissionBundle: admission,
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

function withPackage(callback) {
  const root = mkdtempSync(path.join(tmpdir(), 'evavo-council-runtime-package-'));
  const packageRoot = path.join(root, 'package');
  try {
    const result = materializeCouncilIdentityAnchorRuntimePackage({
      adapterBundle: adapterBundle(),
      packageRoot,
      packagedAt: PACKAGED_AT,
    });
    return callback({ root, packageRoot, result });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function readManifest(packageRoot) {
  return JSON.parse(readFileSync(path.join(packageRoot, 'package-manifest.json'), 'utf8'));
}

function writeManifest(packageRoot, manifest) {
  writeFileSync(
    path.join(packageRoot, 'package-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

function resignManifest(manifest) {
  const body = structuredClone(manifest);
  delete body.manifestSha256;
  return { ...body, manifestSha256: sha256Json(body) };
}

test('V4.8 plan requires one exact active V4.7 bundle and no provider execution', () => {
  const plan = compileCouncilIdentityAnchorRuntimePackagePlan();
  assert.equal(plan.version, '4.8.0');
  assert.equal(plan.counts.runtimeAdaptersRequired, 8);
  assert.equal(plan.counts.runtimeAdapterFilesPackaged, 0);
  assert.equal(plan.counts.providerExecutionsPerformed, 0);
  assert.equal(plan.packagingPolicy.packageRootMustNotExist, true);
  assert.equal(plan.packagingPolicy.packageRootInsideRepositoryAllowed, false);
  assert.equal(plan.packagingPolicy.atomicSameFilesystemRenameRequired, true);
  assert.equal(plan.packagingPolicy.separateAdapterFilePerAuthorization, true);
  assert.equal(plan.packagingPolicy.exactAdapterFileSha256Required, true);
  assert.equal(plan.packagingPolicy.adapterParserRoundTripRequired, true);
  assert.equal(plan.packagingPolicy.authorizationMustBeActiveAtPackageTime, true);
  assert.equal(plan.packagingPolicy.providerExecutionPerformedByPackaging, false);
  assert.equal(plan.packagingPolicy.authorizationConsumedByPackaging, false);
  assert.ok(Object.values(plan.authority).every((value) => value === false));
  assert.match(plan.planSha256, /^[a-f0-9]{64}$/u);
});

test('materialization atomically creates one manifest and eight exact adapter files', () => {
  withPackage(({ packageRoot, result }) => {
    assert.equal(result.status, 'passed');
    assert.equal(result.adapterFileCount, 8);
    assert.equal(result.providerExecutionsPerformed, 0);
    assert.equal(result.identityApprovalsEstablished, 0);
    assert.equal(result.runtimeActivation, false);
    assert.equal(result.websiteActivation, false);

    const rootNames = readdirSync(packageRoot).sort();
    assert.deepEqual(rootNames, ['adapters', 'package-manifest.json']);
    const adapterRoot = path.join(packageRoot, 'adapters');
    const adapterNames = readdirSync(adapterRoot).sort();
    assert.deepEqual(adapterNames, [
      '01-council-critic-candidate-set-01-full-body-right.runtime-adapter.json',
      '02-council-critic-candidate-set-02-full-body-right.runtime-adapter.json',
      '03-council-critic-candidate-set-03-full-body-right.runtime-adapter.json',
      '04-council-critic-candidate-set-04-full-body-right.runtime-adapter.json',
      '05-council-open-reviewer-candidate-set-01-full-body-right.runtime-adapter.json',
      '06-council-open-reviewer-candidate-set-02-full-body-right.runtime-adapter.json',
      '07-council-open-reviewer-candidate-set-03-full-body-right.runtime-adapter.json',
      '08-council-open-reviewer-candidate-set-04-full-body-right.runtime-adapter.json',
    ]);

    const validation = validateCouncilIdentityAnchorRuntimePackage({ packageRoot });
    assert.equal(validation.valid, true);
    assert.equal(validation.schema, COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_SCHEMA);
    assert.equal(validation.adapterFileCount, 8);
    assert.equal(validation.providerExecutionCount, 0);
    assert.equal(validation.identityApprovalCount, 0);
    assert.equal(validation.runtimeActivation, false);
    assert.equal(validation.websiteActivation, false);

    const manifest = readManifest(packageRoot);
    assert.equal(manifest.status, 'eight-runtime-adapter-files-packaged-not-executed');
    assert.equal(manifest.counts.runtimeAdapterFilesPackaged, 8);
    assert.equal(manifest.counts.manifestFilesPackaged, 1);
    assert.equal(manifest.counts.durableRuntimeReservationsEstablished, 0);
    assert.equal(manifest.counts.providerExecutionsPerformed, 0);
    assert.equal(manifest.adapters.length, 8);
    assert.equal(new Set(manifest.adapters.map((entry) => entry.fileSha256)).size, 8);
    assert.equal(new Set(manifest.adapters.map((entry) => entry.packageEntrySha256)).size, 8);
    assert.equal(manifest.executionBoundary.packageMaterializationPerformsProviderExecution, false);
    assert.equal(manifest.executionBoundary.packageMaterializationConsumesAuthorization, false);
    assert.equal(manifest.executionBoundary.separateCreateOnlyAdapterFilesEstablished, true);
    assert.equal(manifest.executionBoundary.durableRuntimeReservationEstablished, false);
    assert.equal(manifest.globalAnchorBarrier.dependentAdmissionCompilationAllowed, false);
    assert.ok(Object.values(manifest.authority).every((value) => value === false));
  });
});

test('packaging rejects times outside the authorization window before creating output', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'evavo-council-runtime-window-'));
  try {
    for (const packagedAt of [
      '2026-08-21T01:59:59.999Z',
      AUTHORIZATION_EXPIRES_AT,
    ]) {
      const packageRoot = path.join(
        root,
        `package-${packagedAt.replaceAll(':', '_').replaceAll('.', '_')}`,
      );
      assert.throws(
        () =>
          materializeCouncilIdentityAnchorRuntimePackage({
            adapterBundle: adapterBundle(),
            packageRoot,
            packagedAt,
          }),
        codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_AUTHORIZATION_NOT_ACTIVE'),
      );
      assert.equal(lstatSync(packageRoot, { throwIfNoEntry: false }), undefined);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('existing output root is rejected without mutation', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'evavo-council-runtime-existing-'));
  const packageRoot = path.join(root, 'package');
  try {
    writeFileSync(packageRoot, 'occupied');
    assert.throws(
      () =>
        materializeCouncilIdentityAnchorRuntimePackage({
          adapterBundle: adapterBundle(),
          packageRoot,
          packagedAt: PACKAGED_AT,
        }),
      codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ROOT_EXISTS'),
    );
    assert.equal(readFileSync(packageRoot, 'utf8'), 'occupied');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('adapter-byte tampering, missing files and unexpected files fail closed', () => {
  withPackage(({ packageRoot }) => {
    const manifest = readManifest(packageRoot);
    const first = path.join(packageRoot, ...manifest.adapters[0].relativePath.split('/'));
    writeFileSync(first, `${readFileSync(first, 'utf8')} `);
    assert.throws(
      () => validateCouncilIdentityAnchorRuntimePackage({ packageRoot }),
      codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ADAPTER_FILE_HASH_MISMATCH'),
    );
  });

  withPackage(({ packageRoot }) => {
    const manifest = readManifest(packageRoot);
    unlinkSync(path.join(packageRoot, ...manifest.adapters[0].relativePath.split('/')));
    assert.throws(
      () => validateCouncilIdentityAnchorRuntimePackage({ packageRoot }),
      codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ADAPTER_DIRECTORY_SHAPE_INVALID'),
    );
  });

  withPackage(({ packageRoot }) => {
    writeFileSync(path.join(packageRoot, 'adapters', 'unexpected.json'), '{}\n');
    assert.throws(
      () => validateCouncilIdentityAnchorRuntimePackage({ packageRoot }),
      codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ADAPTER_DIRECTORY_SHAPE_INVALID'),
    );
  });
});

test('resigned nested authority, count and layout claims are rejected', () => {
  withPackage(({ packageRoot }) => {
    const manifest = readManifest(packageRoot);
    manifest.executionBoundary.providerFallbackAllowed = true;
    writeManifest(packageRoot, resignManifest(manifest));
    assert.throws(
      () => validateCouncilIdentityAnchorRuntimePackage({ packageRoot }),
      /MANIFEST_BINDING_INVALID|EXECUTION_BOUNDARY_INVALID/u,
    );
  });

  withPackage(({ packageRoot }) => {
    const manifest = readManifest(packageRoot);
    manifest.counts.providerExecutionsPerformed = 1;
    writeManifest(packageRoot, resignManifest(manifest));
    assert.throws(
      () => validateCouncilIdentityAnchorRuntimePackage({ packageRoot }),
      /MANIFEST_BINDING_INVALID|COUNTS_INVALID/u,
    );
  });

  withPackage(({ packageRoot }) => {
    const manifest = readManifest(packageRoot);
    manifest.packageLayout.exactRootEntryCount = 99;
    writeManifest(packageRoot, resignManifest(manifest));
    assert.throws(
      () => validateCouncilIdentityAnchorRuntimePackage({ packageRoot }),
      /MANIFEST_BINDING_INVALID|LAYOUT_INVALID/u,
    );
  });
});

test('manifest and package-entry schema injection is rejected even when re-signed', () => {
  withPackage(({ packageRoot }) => {
    const manifest = readManifest(packageRoot);
    manifest.executionBoundary.hiddenExecutionApproval = true;
    writeManifest(packageRoot, resignManifest(manifest));
    assert.throws(
      () => validateCouncilIdentityAnchorRuntimePackage({ packageRoot }),
      /EXECUTION_BOUNDARY_INVALID|MANIFEST_BINDING_INVALID/u,
    );
  });

  withPackage(({ packageRoot }) => {
    const manifest = readManifest(packageRoot);
    manifest.adapters[0].automaticExecutionApproved = true;
    const entryBody = structuredClone(manifest.adapters[0]);
    delete entryBody.packageEntrySha256;
    manifest.adapters[0].packageEntrySha256 = sha256Json(entryBody);
    writeManifest(packageRoot, resignManifest(manifest));
    assert.throws(
      () => validateCouncilIdentityAnchorRuntimePackage({ packageRoot }),
      /ENTRY_KEYS_INVALID|ENTRY_BINDING_INVALID/u,
    );
  });
});

test('capabilities disclose package-only V4.8 truth', () => {
  const capabilities = councilIdentityAnchorRuntimePackageCapabilities();
  assert.equal(capabilities.version, '4.8.0');
  assert.equal(capabilities.runtimeAdapterCountRequired, 8);
  assert.equal(capabilities.createOnlyPackageRootRequired, true);
  assert.equal(capabilities.packageRootInsideRepositoryAllowed, false);
  assert.equal(capabilities.atomicPackagePublicationRequired, true);
  assert.equal(capabilities.exactAdapterFileSha256Required, true);
  assert.equal(capabilities.adapterParserRoundTripRequired, true);
  assert.equal(capabilities.authorizationMustBeActiveAtPackageTime, true);
  assert.equal(capabilities.runtimeAdapterPackagingAvailable, true);
  assert.equal(capabilities.executionPreflightAvailable, false);
  assert.equal(capabilities.providerExecutionAvailable, false);
  assert.equal(capabilities.identityApprovalAvailable, false);
  assert.equal(capabilities.runtimeActivationAvailable, false);
  assert.equal(capabilities.websiteActivationAvailable, false);
  assert.ok(Object.values(capabilities.authority).every((value) => value === false));
});

test('CLI materializes, validates and rejects overwrite or execution flags', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'evavo-council-runtime-package-cli-'));
  try {
    const bundlePath = path.join(root, 'v4.7.json');
    const packageRoot = path.join(root, 'package');
    writeFileSync(bundlePath, `${JSON.stringify(adapterBundle(), null, 2)}\n`);

    const summary = runCouncilIdentityAnchorRuntimePackageCli(['summary']);
    assert.equal(summary.runtimeAdaptersRequired, 8);
    assert.equal(summary.runtimeAdapterFilesPackaged, 0);

    const result = runCouncilIdentityAnchorRuntimePackageCli([
      'materialize',
      '--adapter-bundle',
      bundlePath,
      '--packaged-at',
      PACKAGED_AT,
      '--package-root',
      packageRoot,
    ]);
    assert.equal(result.runtimeAdapterFilesPackaged, 8);
    assert.equal(result.providerExecutionsPerformed, 0);

    const validation = runCouncilIdentityAnchorRuntimePackageCli([
      'validate',
      '--package-root',
      packageRoot,
    ]);
    assert.equal(validation.valid, true);
    assert.equal(validation.adapterFileCount, 8);
    assert.equal(validation.providerExecutionCount, 0);

    assert.throws(
      () =>
        runCouncilIdentityAnchorRuntimePackageCli([
          'materialize',
          '--adapter-bundle',
          bundlePath,
          '--packaged-at',
          PACKAGED_AT,
          '--package-root',
          packageRoot,
        ]),
      codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ROOT_EXISTS'),
    );
    assert.throws(
      () => runCouncilIdentityAnchorRuntimePackageCli(['summary', '--execute', 'true']),
      codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_CLI_INVALID'),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
