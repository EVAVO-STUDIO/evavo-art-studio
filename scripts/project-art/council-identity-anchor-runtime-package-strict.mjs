import {
  lstatSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';

import {
  COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_SCHEMA,
  COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_PROTOCOL_VERSION,
  COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_VERSION,
  materializeCouncilIdentityAnchorRuntimePackage as materializeBasePackage,
  validateCouncilIdentityAnchorRuntimePackage as validateBasePackage,
} from './council-identity-anchor-runtime-package.mjs';

const EXPECTED_ADAPTER_COUNT = 8;
const SHA256 = /^[a-f0-9]{64}$/u;
const ROOT_KEYS = Object.freeze([
  'schema',
  'protocolVersion',
  'version',
  'status',
  'packagedAt',
  'sourceAdapterBundle',
  'sourceAdapterSummary',
  'packageLayout',
  'authorizationWindow',
  'counts',
  'adapters',
  'executionBoundary',
  'globalAnchorBarrier',
  'nextGate',
  'authority',
  'manifestSha256',
]);
const SOURCE_SUMMARY_KEYS = Object.freeze([
  'schema',
  'version',
  'bundleSha256',
  'authorizationBundleSha256',
  'admissionBundleSha256',
  'authorizationReviewSha256',
  'campaignSha256',
  'compiledAt',
]);
const LAYOUT_KEYS = Object.freeze([
  'manifestFile',
  'adapterDirectory',
  'adapterFileCount',
  'exactRootEntryCount',
]);
const WINDOW_KEYS = Object.freeze([
  'occurredAt',
  'expiresAt',
  'packagedAt',
  'activeAtPackageTime',
  'mustBeRevalidatedAtExecutionTime',
]);
const COUNT_KEYS = Object.freeze([
  'providerAdmissionsBound',
  'providerAuthorizationsBound',
  'runtimeAdaptersBound',
  'runtimeAdapterFilesPackaged',
  'manifestFilesPackaged',
  'durableRuntimeReservationsEstablished',
  'providerExecutionsPerformed',
  'dependentAdmissionsCompiled',
  'candidateArtifactsMaterialized',
  'identitiesApproved',
]);
const ENTRY_KEYS = Object.freeze([
  'ordinal',
  'campaignJobId',
  'jobSha256',
  'admissionEntrySha256',
  'authorizationEntrySha256',
  'adapterEntrySha256',
  'characterId',
  'setId',
  'continuityKey',
  'jobId',
  'admissionItemId',
  'viewId',
  'providerAdmissionSha256',
  'authorizationSha256',
  'adapterSha256',
  'relativePath',
  'fileSha256',
  'fileBytes',
  'status',
  'providerExecutionReceipt',
  'runtimeReservationReceipt',
  'authority',
  'packageEntrySha256',
]);
const EXECUTION_KEYS = Object.freeze([
  'packageMaterializationPerformsProviderExecution',
  'packageMaterializationConsumesAuthorization',
  'authorizationActiveAtPackageTime',
  'authorizationMustBeRevalidatedAtExecutionTime',
  'exactAdapterFileSha256RequiredBeforeExecution',
  'exactAdapterFileBytesRequiredBeforeExecution',
  'separateCreateOnlyAdapterFilesEstablished',
  'durableRuntimeReservationEstablished',
  'durableRuntimeReservationRequiredAtExecution',
  'implicitResumeAllowed',
  'providerFallbackAllowed',
  'automaticRetryAllowed',
  'candidateApprovalByExecutionAllowed',
  'identityApprovalByExecutionAllowed',
]);
const BARRIER_KEYS = Object.freeze([
  'allEightAnchorsMustExecuteSuccessfullyBeforeAnyDependentAdmission',
  'successfulAnchorExecutionReceiptCount',
  'dependentAdmissionCompilationAllowed',
  'crossCharacterAnchorReuseAllowed',
  'crossSetAnchorReuseAllowed',
]);
const AUTHORITY_KEYS = Object.freeze([
  'providerAdmission',
  'providerAuthorization',
  'runtimeAdapterCompilation',
  'runtimeAdapterPackaging',
  'durableAuthorizationConsumption',
  'durableRuntimeReservation',
  'providerExecution',
  'candidateMaterialization',
  'deterministicQa',
  'creativeReview',
  'candidateApproval',
  'identityApproval',
  'animationProduction',
  'candidatePromotion',
  'runtimeAsset',
  'sourceMutation',
  'repositoryMutation',
  'gitCommit',
  'gitPush',
  'publication',
  'runtimeActivation',
  'websiteActivation',
  'deployment',
  'forcePush',
]);
const NEXT_GATE =
  'run a separate execution preflight that verifies this exact package, each adapter-file SHA-256, current authorization activity, provider availability and safe Runtime/artifact roots without invoking the provider';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function assert(condition, code) {
  if (!condition) fail(code);
}

function exactKeys(value, keys, code) {
  assert(value && typeof value === 'object' && !Array.isArray(value), code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(
    actual.length === expected.length &&
      actual.every((key, index) => key === expected[index]),
    code,
  );
}

function falseAuthority(value, code) {
  exactKeys(value, AUTHORITY_KEYS, code);
  assert(AUTHORITY_KEYS.every((key) => value[key] === false), code);
}

function exactSha256(value, code) {
  assert(typeof value === 'string' && SHA256.test(value), code);
}

function exactIso(value, code) {
  assert(typeof value === 'string' && value.length >= 20 && value.length <= 40, code);
  const parsed = Date.parse(value);
  assert(Number.isFinite(parsed) && new Date(parsed).toISOString() === value, code);
  return parsed;
}

function parseManifest(packageRoot) {
  assert(
    typeof packageRoot === 'string' &&
      path.isAbsolute(packageRoot) &&
      path.normalize(packageRoot) === packageRoot &&
      path.resolve(packageRoot) === packageRoot,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_STRICT_ROOT_INVALID',
  );
  const rootState = lstatSync(packageRoot, { throwIfNoEntry: false });
  assert(
    rootState?.isDirectory() &&
      !rootState.isSymbolicLink() &&
      realpathSync(packageRoot) === packageRoot,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_STRICT_ROOT_UNSAFE',
  );
  const file = path.join(packageRoot, 'package-manifest.json');
  const before = lstatSync(file, { throwIfNoEntry: false });
  assert(
    before?.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      before.size >= 2 &&
      before.size <= 64 * 1024 * 1024 &&
      realpathSync(file) === file,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_STRICT_MANIFEST_FILE_INVALID',
  );
  const bytes = readFileSync(file);
  const after = lstatSync(file);
  assert(
    ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(
      (key) => before[key] === after[key],
    ),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_STRICT_MANIFEST_FILE_CHANGED',
  );
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true })
        .decode(bytes)
        .replace(/^\uFEFF/u, ''),
    );
  } catch {
    fail('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_STRICT_MANIFEST_JSON_INVALID');
  }
}

function assertStrictManifest(manifest) {
  exactKeys(
    manifest,
    ROOT_KEYS,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_KEYS_INVALID',
  );
  assert(
    manifest.schema === COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_SCHEMA &&
      manifest.protocolVersion ===
        COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_PROTOCOL_VERSION &&
      manifest.version === COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_VERSION &&
      manifest.status === 'eight-runtime-adapter-files-packaged-not-executed' &&
      manifest.nextGate === NEXT_GATE,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_BINDING_INVALID',
  );
  exactSha256(
    manifest.manifestSha256,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_HASH_INVALID',
  );
  falseAuthority(
    manifest.authority,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_AUTHORITY_INVALID',
  );

  exactKeys(
    manifest.sourceAdapterSummary,
    SOURCE_SUMMARY_KEYS,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_SOURCE_SUMMARY_INVALID',
  );
  for (const key of [
    'bundleSha256',
    'authorizationBundleSha256',
    'admissionBundleSha256',
    'authorizationReviewSha256',
    'campaignSha256',
  ]) {
    exactSha256(
      manifest.sourceAdapterSummary[key],
      'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_SOURCE_SUMMARY_INVALID',
    );
  }
  exactIso(
    manifest.sourceAdapterSummary.compiledAt,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_SOURCE_SUMMARY_INVALID',
  );

  exactKeys(
    manifest.packageLayout,
    LAYOUT_KEYS,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_LAYOUT_INVALID',
  );
  assert(
    manifest.packageLayout.manifestFile === 'package-manifest.json' &&
      manifest.packageLayout.adapterDirectory === 'adapters' &&
      manifest.packageLayout.adapterFileCount === EXPECTED_ADAPTER_COUNT &&
      manifest.packageLayout.exactRootEntryCount === 2,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_LAYOUT_INVALID',
  );

  exactKeys(
    manifest.authorizationWindow,
    WINDOW_KEYS,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_AUTHORIZATION_WINDOW_INVALID',
  );
  const occurred = exactIso(
    manifest.authorizationWindow.occurredAt,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_AUTHORIZATION_WINDOW_INVALID',
  );
  const expires = exactIso(
    manifest.authorizationWindow.expiresAt,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_AUTHORIZATION_WINDOW_INVALID',
  );
  const packaged = exactIso(
    manifest.authorizationWindow.packagedAt,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_AUTHORIZATION_WINDOW_INVALID',
  );
  assert(
    packaged >= occurred &&
      packaged < expires &&
      manifest.packagedAt === manifest.authorizationWindow.packagedAt &&
      manifest.authorizationWindow.activeAtPackageTime === true &&
      manifest.authorizationWindow.mustBeRevalidatedAtExecutionTime === true,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_AUTHORIZATION_WINDOW_INVALID',
  );

  exactKeys(
    manifest.counts,
    COUNT_KEYS,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_COUNTS_INVALID',
  );
  assert(
    manifest.counts.providerAdmissionsBound === 8 &&
      manifest.counts.providerAuthorizationsBound === 8 &&
      manifest.counts.runtimeAdaptersBound === 8 &&
      manifest.counts.runtimeAdapterFilesPackaged === 8 &&
      manifest.counts.manifestFilesPackaged === 1 &&
      manifest.counts.durableRuntimeReservationsEstablished === 0 &&
      manifest.counts.providerExecutionsPerformed === 0 &&
      manifest.counts.dependentAdmissionsCompiled === 0 &&
      manifest.counts.candidateArtifactsMaterialized === 0 &&
      manifest.counts.identitiesApproved === 0,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_COUNTS_INVALID',
  );

  assert(
    Array.isArray(manifest.adapters) &&
      manifest.adapters.length === EXPECTED_ADAPTER_COUNT,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ENTRY_COUNT_INVALID',
  );
  for (const [index, entry] of manifest.adapters.entries()) {
    exactKeys(
      entry,
      ENTRY_KEYS,
      'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ENTRY_KEYS_INVALID',
    );
    assert(
      entry.ordinal === index + 1 &&
        entry.viewId === 'full-body-right' &&
        entry.status === 'runtime-adapter-file-packaged-not-executed' &&
        Number.isSafeInteger(entry.fileBytes) &&
        entry.fileBytes >= 2 &&
        entry.fileBytes <= 8 * 1024 * 1024 &&
        entry.providerExecutionReceipt === null &&
        entry.runtimeReservationReceipt === null,
      'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ENTRY_BINDING_INVALID',
    );
    for (const key of [
      'jobSha256',
      'admissionEntrySha256',
      'authorizationEntrySha256',
      'adapterEntrySha256',
      'providerAdmissionSha256',
      'authorizationSha256',
      'adapterSha256',
      'fileSha256',
      'packageEntrySha256',
    ]) {
      exactSha256(
        entry[key],
        'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ENTRY_BINDING_INVALID',
      );
    }
    falseAuthority(
      entry.authority,
      'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ENTRY_AUTHORITY_INVALID',
    );
  }

  exactKeys(
    manifest.executionBoundary,
    EXECUTION_KEYS,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_EXECUTION_BOUNDARY_INVALID',
  );
  const execution = manifest.executionBoundary;
  assert(
    execution.packageMaterializationPerformsProviderExecution === false &&
      execution.packageMaterializationConsumesAuthorization === false &&
      execution.authorizationActiveAtPackageTime === true &&
      execution.authorizationMustBeRevalidatedAtExecutionTime === true &&
      execution.exactAdapterFileSha256RequiredBeforeExecution === true &&
      execution.exactAdapterFileBytesRequiredBeforeExecution === true &&
      execution.separateCreateOnlyAdapterFilesEstablished === true &&
      execution.durableRuntimeReservationEstablished === false &&
      execution.durableRuntimeReservationRequiredAtExecution === true &&
      execution.implicitResumeAllowed === false &&
      execution.providerFallbackAllowed === false &&
      execution.automaticRetryAllowed === false &&
      execution.candidateApprovalByExecutionAllowed === false &&
      execution.identityApprovalByExecutionAllowed === false,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_EXECUTION_BOUNDARY_INVALID',
  );

  exactKeys(
    manifest.globalAnchorBarrier,
    BARRIER_KEYS,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_GLOBAL_BARRIER_INVALID',
  );
  const barrier = manifest.globalAnchorBarrier;
  assert(
    barrier.allEightAnchorsMustExecuteSuccessfullyBeforeAnyDependentAdmission ===
      true &&
      barrier.successfulAnchorExecutionReceiptCount === 0 &&
      barrier.dependentAdmissionCompilationAllowed === false &&
      barrier.crossCharacterAnchorReuseAllowed === false &&
      barrier.crossSetAnchorReuseAllowed === false,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_GLOBAL_BARRIER_INVALID',
  );
}

export function validateCouncilIdentityAnchorRuntimePackageStrict({ packageRoot }) {
  const base = validateBasePackage({ packageRoot });
  const manifest = parseManifest(packageRoot);
  assertStrictManifest(manifest);
  return Object.freeze({ ...base, strictManifestValidation: true });
}

export function materializeCouncilIdentityAnchorRuntimePackageStrict(input) {
  const result = materializeBasePackage(input);
  try {
    const strict = validateCouncilIdentityAnchorRuntimePackageStrict({
      packageRoot: result.packageRoot,
    });
    return Object.freeze({ ...result, strictManifestValidation: strict.strictManifestValidation });
  } catch (error) {
    rmSync(result.packageRoot, { recursive: true, force: true });
    throw error;
  }
}
