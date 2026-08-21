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
} from './project-art/council-identity-anchor-runtime-package.mjs';
import {
  materializeCouncilIdentityAnchorRuntimePackageStrict,
  validateCouncilIdentityAnchorRuntimePackageStrict,
} from './project-art/council-identity-anchor-runtime-package-strict.mjs';
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
  const accepted = new Set(expected);
  if (
    accepted.has('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_COUNTS_INVALID')
  ) {
    accepted.add(
      'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_BINDING_INVALID',
    );
  }
  return (error) => {
    assert.ok(error instanceof Error);
    assert.ok(
      accepted.has(error.code),
      `expected one of ${[...accepted].join(', ')}; received ${String(error.code)}`,
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
    const result = materializeCouncilIdentityAnchorRuntimePackageStrict({
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

function resignManifest(manifest) {
  const body = structuredClone(manifest);
  delete body.manifestSha256;
  return { ...body, manifestSha256: sha256Json(body) };
}

function writeManifest(packageRoot, manifest) {
  writeFileSync(
    path.join(packageRoot, 'package-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

test('V4.8 plan requires atomic external packaging and grants no execution authority', () => {
  const plan = compileCouncilIdentityAnchorRuntimePackagePlan();
  assert.equal(plan.version, '4.8.0');
  assert.deepEqual(plan.counts, {
    runtimeAdaptersRequired: 8,
    runtimeAdapterFilesPackaged: 0,
    manifestFilesPackaged: 0,
    providerExecutionsPerformed: 0,
    dependentJobsExcluded: 16,
  });
  assert.equal(plan.packagingPolicy.packageRootMustNotExist, true);
  assert.equal(plan.packagingPolicy.packageRootInsideRepositoryAllowed, false);
  assert.equal(plan.packagingPolicy.stagingDirectoryRequired, true);
  assert.equal(plan.packagingPolicy.atomicSameFilesystemRenameRequired, true);
  assert.equal(plan.packagingPolicy.separateAdapterFilePerAuthorization, true);
  assert.equal(plan.packagingPolicy.exactAdapterFileSha256Required, true);
  assert.equal(plan.packagingPolicy.adapterParserRoundTripRequired, true);
  assert.equal(plan.packagingPolicy.packageDirectoryAllowlistRequired, true);
  assert.equal(plan.packagingPolicy.authorizationMustBeActiveAtPackageTime, true);
  assert.equal(plan.packagingPolicy.providerExecutionPerformedByPackaging, false);
  assert.equal(plan.packagingPolicy.authorizationConsumedByPackaging, false);
  assert.ok(Object.values(plan.authority).every((value) => value === false));
});

test('strict materialization creates one manifest and eight exact adapter files', () => {
  withPackage(({ packageRoot, result }) => {
    assert.equal(result.strictManifestValidation, true);
    assert.equal(result.adapterFileCount, 8);
    assert.equal(result.providerExecutionsPerformed, 0);
    assert.deepEqual(readdirSync(packageRoot).sort(), [
      'adapters',
      'package-manifest.json',
    ]);
    assert.deepEqual(readdirSync(path.join(packageRoot, 'adapters')).sort(), [
      '01-council-critic-candidate-set-01-full-body-right.runtime-adapter.json',
      '02-council-critic-candidate-set-02-full-body-right.runtime-adapter.json',
      '03-council-critic-candidate-set-03-full-body-right.runtime-adapter.json',
      '04-council-critic-candidate-set-04-full-body-right.runtime-adapter.json',
      '05-council-open-reviewer-candidate-set-01-full-body-right.runtime-adapter.json',
      '06-council-open-reviewer-candidate-set-02-full-body-right.runtime-adapter.json',
      '07-council-open-reviewer-candidate-set-03-full-body-right.runtime-adapter.json',
      '08-council-open-reviewer-candidate-set-04-full-body-right.runtime-adapter.json',
    ]);

    const validation = validateCouncilIdentityAnchorRuntimePackageStrict({
      packageRoot,
    });
    assert.equal(validation.valid, true);
    assert.equal(validation.strictManifestValidation, true);
    assert.equal(
      validation.schema,
      COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_SCHEMA,
    );
    assert.equal(validation.adapterFileCount, 8);
    assert.equal(validation.providerExecutionCount, 0);
    assert.equal(validation.identityApprovalCount, 0);

    const manifest = readManifest(packageRoot);
    assert.equal(manifest.counts.runtimeAdapterFilesPackaged, 8);
    assert.equal(manifest.counts.providerExecutionsPerformed, 0);
    assert.equal(manifest.adapters.length, 8);
    assert.equal(new Set(manifest.adapters.map((entry) => entry.fileSha256)).size, 8);
    assert.equal(
      new Set(manifest.adapters.map((entry) => entry.packageEntrySha256)).size,
      8,
    );
    assert.equal(
      manifest.executionBoundary.packageMaterializationPerformsProviderExecution,
      false,
    );
    assert.equal(
      manifest.executionBoundary.separateCreateOnlyAdapterFilesEstablished,
      true,
    );
    assert.ok(Object.values(manifest.authority).every((value) => value === false));
  });
});

test('packaging rejects inactive authorizations before creating output', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'evavo-council-runtime-window-'));
  try {
    for (const packagedAt of [
      '2026-08-21T01:59:59.999Z',
      AUTHORIZATION_EXPIRES_AT,
    ]) {
      const packageRoot = path.join(root, packagedAt.replaceAll(':', '_'));
      assert.throws(
        () =>
          materializeCouncilIdentityAnchorRuntimePackageStrict({
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

test('existing package roots are rejected without mutation', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'evavo-council-runtime-existing-'));
  const packageRoot = path.join(root, 'package');
  try {
    writeFileSync(packageRoot, 'occupied');
    assert.throws(
      () =>
        materializeCouncilIdentityAnchorRuntimePackageStrict({
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

test('adapter tampering, missing files and extra files fail closed', () => {
  withPackage(({ packageRoot }) => {
    const first = readManifest(packageRoot).adapters[0];
    const file = path.join(packageRoot, ...first.relativePath.split('/'));
    writeFileSync(file, `${readFileSync(file, 'utf8')} `);
    assert.throws(
      () => validateCouncilIdentityAnchorRuntimePackageStrict({ packageRoot }),
      codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ADAPTER_FILE_HASH_MISMATCH'),
    );
  });
  withPackage(({ packageRoot }) => {
    const first = readManifest(packageRoot).adapters[0];
    unlinkSync(path.join(packageRoot, ...first.relativePath.split('/')));
    assert.throws(
      () => validateCouncilIdentityAnchorRuntimePackageStrict({ packageRoot }),
      codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ADAPTER_DIRECTORY_SHAPE_INVALID'),
    );
  });
  withPackage(({ packageRoot }) => {
    writeFileSync(path.join(packageRoot, 'adapters', 'unexpected.json'), '{}\n');
    assert.throws(
      () => validateCouncilIdentityAnchorRuntimePackageStrict({ packageRoot }),
      codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ADAPTER_DIRECTORY_SHAPE_INVALID'),
    );
  });
});

test('re-signed nested execution, count and layout drift is rejected', () => {
  const cases = [
    [
      (manifest) => {
        manifest.executionBoundary.providerFallbackAllowed = true;
      },
      'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_EXECUTION_BOUNDARY_INVALID',
    ],
    [
      (manifest) => {
        manifest.counts.providerExecutionsPerformed = 1;
      },
      'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_COUNTS_INVALID',
    ],
    [
      (manifest) => {
        manifest.packageLayout.exactRootEntryCount = 99;
      },
      'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_LAYOUT_INVALID',
    ],
  ];
  for (const [mutate, expectedCode] of cases) {
    withPackage(({ packageRoot }) => {
      const manifest = readManifest(packageRoot);
      mutate(manifest);
      writeManifest(packageRoot, resignManifest(manifest));
      assert.throws(
        () => validateCouncilIdentityAnchorRuntimePackageStrict({ packageRoot }),
        codeIs(expectedCode),
      );
    });
  }
});

test('re-signed nested schema injection is rejected', () => {
  withPackage(({ packageRoot }) => {
    const manifest = readManifest(packageRoot);
    manifest.executionBoundary.hiddenExecutionApproval = true;
    writeManifest(packageRoot, resignManifest(manifest));
    assert.throws(
      () => validateCouncilIdentityAnchorRuntimePackageStrict({ packageRoot }),
      codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_EXECUTION_BOUNDARY_INVALID'),
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
      () => validateCouncilIdentityAnchorRuntimePackageStrict({ packageRoot }),
      codeIs('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ENTRY_KEYS_INVALID'),
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
});

test('CLI materializes, strictly validates and rejects overwrite or execution flags', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'evavo-council-runtime-package-cli-'));
  try {
    const bundlePath = path.join(root, 'v4.7.json');
    const packageRoot = path.join(root, 'package');
    writeFileSync(bundlePath, `${JSON.stringify(adapterBundle(), null, 2)}\n`);

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
    assert.equal(result.strictManifestValidation, true);
    assert.equal(result.providerExecutionsPerformed, 0);

    const validation = runCouncilIdentityAnchorRuntimePackageCli([
      'validate',
      '--package-root',
      packageRoot,
    ]);
    assert.equal(validation.valid, true);
    assert.equal(validation.strictManifestValidation, true);
    assert.equal(validation.adapterFileCount, 8);

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
