import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as adapterModule from './council-identity-anchor-runtime-adapters.mjs';
import * as providerRuntimeModule from './character-identity-provider-runtime.mjs';

export const COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_PLAN_SCHEMA =
  'evavo.project-art-council-identity-anchor-runtime-package-plan.v1';
export const COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_SCHEMA =
  'evavo.project-art-council-identity-anchor-runtime-package-manifest.v1';
export const COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_CAPABILITIES_SCHEMA =
  'evavo.project-art-council-identity-anchor-runtime-package-capabilities.v1';
export const COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_VERSION = '4.8.0';
export const COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_PROTOCOL_VERSION =
  '2026-08-21.4';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COMPILER_PATH =
  'scripts/compile-project-art-council-identity-anchor-runtime-package.mjs';
const PROVIDER_RUNNER_PATH =
  'scripts/run-project-art-character-identity-provider.mjs';
const MANIFEST_FILE = 'package-manifest.json';
const ADAPTER_DIRECTORY = 'adapters';
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_SEGMENT = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const MAXIMUM_MANIFEST_BYTES = 64 * 1024 * 1024;
const MAXIMUM_ADAPTER_BYTES = 8 * 1024 * 1024;
const EXPECTED_ADAPTER_COUNT = 8;

const FALSE_AUTHORITY = Object.freeze({
  providerAdmission: false,
  providerAuthorization: false,
  runtimeAdapterCompilation: false,
  runtimeAdapterPackaging: false,
  durableAuthorizationConsumption: false,
  durableRuntimeReservation: false,
  providerExecution: false,
  candidateMaterialization: false,
  deterministicQa: false,
  creativeReview: false,
  candidateApproval: false,
  identityApproval: false,
  animationProduction: false,
  candidatePromotion: false,
  runtimeAsset: false,
  sourceMutation: false,
  repositoryMutation: false,
  gitCommit: false,
  gitPush: false,
  publication: false,
  runtimeActivation: false,
  websiteActivation: false,
  deployment: false,
  forcePush: false,
});

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Json(value) {
  return sha256Bytes(canonical(value));
}

function assert(condition, code) {
  if (!condition) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
}

function exactKeys(value, expected, code) {
  assert(value && typeof value === 'object' && !Array.isArray(value), code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(
    actual.length === wanted.length &&
      actual.every((key, index) => key === wanted[index]),
    code,
  );
}

function exactFalseAuthority(value, code) {
  exactKeys(value, Object.keys(FALSE_AUTHORITY), code);
  assert(
    Object.entries(FALSE_AUTHORITY).every(([key, expected]) => value[key] === expected),
    code,
  );
  return FALSE_AUTHORITY;
}

function iso(value, code) {
  assert(typeof value === 'string' && value.length >= 20 && value.length <= 40, code);
  const parsed = Date.parse(value);
  assert(Number.isFinite(parsed) && new Date(parsed).toISOString() === value, code);
  return parsed;
}

function compileAdapterPlan() {
  const compile = adapterModule.compileCouncilIdentityAnchorRuntimeAdapterPlan;
  assert(
    typeof compile === 'function',
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ADAPTER_PLAN_COMPILER_MISSING',
  );
  const plan = compile();
  assert(
    plan?.schema ===
      adapterModule.COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_PLAN_SCHEMA &&
      typeof plan.planSha256 === 'string' &&
      SHA256.test(plan.planSha256) &&
      plan.counts?.providerAuthorizationsRequired === EXPECTED_ADAPTER_COUNT &&
      plan.counts?.runtimeAdaptersCompiled === 0 &&
      plan.counts?.providerExecutionsPerformed === 0 &&
      Array.isArray(plan.targets) &&
      plan.targets.length === EXPECTED_ADAPTER_COUNT &&
      Object.values(plan.authority ?? {}).every((value) => value === false),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ADAPTER_PLAN_INVALID',
  );
  return plan;
}

function validateAdapterBundle(value) {
  const validate =
    adapterModule.validateCouncilIdentityAnchorRuntimeAdapterBundle;
  assert(
    typeof validate === 'function',
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ADAPTER_VALIDATOR_MISSING',
  );
  validate(value);
  assert(
    value?.schema ===
      adapterModule.COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_BUNDLE_SCHEMA &&
      typeof value.bundleSha256 === 'string' &&
      SHA256.test(value.bundleSha256) &&
      value.status === 'eight-anchor-runtime-adapters-compiled-not-executed' &&
      value.counts?.runtimeAdaptersCompiled === EXPECTED_ADAPTER_COUNT &&
      value.counts?.providerExecutionsPerformed === 0 &&
      Array.isArray(value.adapters) &&
      value.adapters.length === EXPECTED_ADAPTER_COUNT &&
      new Set(value.adapters.map((entry) => entry.adapterSha256)).size ===
        EXPECTED_ADAPTER_COUNT &&
      value.adapters.every(
        (entry, index) =>
          entry.ordinal === index + 1 &&
          entry.status === 'runtime-adapter-compiled-not-executed' &&
          entry.viewId === 'full-body-right' &&
          typeof entry.adapterEntrySha256 === 'string' &&
          SHA256.test(entry.adapterEntrySha256) &&
          typeof entry.adapterSha256 === 'string' &&
          SHA256.test(entry.adapterSha256) &&
          entry.runtimeAdapter?.adapterSha256 === entry.adapterSha256 &&
          entry.providerExecutionReceipt === null &&
          entry.runtimeReservation?.established === false &&
          Object.values(entry.runtimeAdapter?.authority ?? {}).every(
            (authorityValue) => authorityValue === false,
          ) &&
          Object.values(entry.authority ?? {}).every(
            (authorityValue) => authorityValue === false,
          ),
      ) &&
      Object.values(value.authority ?? {}).every(
        (authorityValue) => authorityValue === false,
      ),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ADAPTER_BUNDLE_INVALID',
  );
  return value;
}

function activePackageWindow(adapterBundle, packagedAt) {
  const packaged = iso(
    packagedAt,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_PACKAGED_AT_INVALID',
  );
  const occurred = iso(
    adapterBundle.authorizationWindow?.occurredAt,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_AUTHORIZATION_OCCURRED_AT_INVALID',
  );
  const expires = iso(
    adapterBundle.authorizationWindow?.expiresAt,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_AUTHORIZATION_EXPIRES_AT_INVALID',
  );
  assert(
    packaged >= occurred && packaged < expires,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_AUTHORIZATION_NOT_ACTIVE',
  );
  return Object.freeze({
    occurredAt: adapterBundle.authorizationWindow.occurredAt,
    expiresAt: adapterBundle.authorizationWindow.expiresAt,
    packagedAt,
    activeAtPackageTime: true,
    mustBeRevalidatedAtExecutionTime: true,
  });
}

function canonicalAbsoluteDirectoryTarget(value) {
  assert(
    typeof value === 'string' &&
      value.length >= 2 &&
      value.length <= 4096 &&
      !value.includes('\0') &&
      path.isAbsolute(value) &&
      path.normalize(value) === value &&
      path.resolve(value) === value,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ROOT_INVALID',
  );
  const absolute = value;
  const parent = path.dirname(absolute);
  const parentState = lstatSync(parent, { throwIfNoEntry: false });
  assert(
    parentState?.isDirectory() &&
      !parentState.isSymbolicLink() &&
      realpathSync(parent) === path.resolve(parent),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_PARENT_UNSAFE',
  );
  const relativeToRepository = path.relative(ROOT, absolute);
  assert(
    relativeToRepository !== '' &&
      (relativeToRepository.startsWith('..') ||
        path.isAbsolute(relativeToRepository)),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_INSIDE_REPOSITORY_FORBIDDEN',
  );
  assert(
    !lstatSync(absolute, { throwIfNoEntry: false }),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ROOT_EXISTS',
  );
  return Object.freeze({ absolute, parent });
}

function canonicalRelativePath(value, code) {
  assert(
    typeof value === 'string' &&
      value.length >= 1 &&
      value.length <= 2048 &&
      !value.includes('\\') &&
      !value.includes('\0') &&
      !value.startsWith('/') &&
      !value.startsWith('../') &&
      !value.includes('/../') &&
      !value.includes('//') &&
      !/^[A-Za-z]:/u.test(value) &&
      path.posix.normalize(value) === value,
    code,
  );
  return value;
}

function realDirectory(value, code) {
  assert(
    typeof value === 'string' &&
      path.isAbsolute(value) &&
      path.normalize(value) === value &&
      path.resolve(value) === value,
    code,
  );
  const state = lstatSync(value, { throwIfNoEntry: false });
  assert(
    state?.isDirectory() &&
      !state.isSymbolicLink() &&
      realpathSync(value) === value,
    code,
  );
  return value;
}

function contained(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function stableOrdinaryFile(root, relativePath, maximumBytes, code) {
  const canonicalPath = canonicalRelativePath(relativePath, code);
  const absolute = path.join(root, ...canonicalPath.split('/'));
  assert(contained(root, absolute), code);
  const before = lstatSync(absolute, { throwIfNoEntry: false });
  assert(
    before?.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      before.size >= 2 &&
      before.size <= maximumBytes,
    code,
  );
  const real = realpathSync(absolute);
  assert(real === absolute && contained(root, real), code);
  const bytes = readFileSync(real);
  const after = lstatSync(real);
  assert(
    ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(
      (key) => before[key] === after[key],
    ),
    `${code}_CHANGED`,
  );
  return Object.freeze({
    relativePath: canonicalPath,
    absolutePath: real,
    bytes,
    byteLength: bytes.byteLength,
    sha256: sha256Bytes(bytes),
  });
}

function adapterFileName(entry) {
  for (const value of [entry.characterId, entry.setId, entry.viewId]) {
    assert(
      typeof value === 'string' && SAFE_SEGMENT.test(value),
      'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_FILE_SEGMENT_INVALID',
    );
  }
  return [
    String(entry.ordinal).padStart(2, '0'),
    entry.characterId,
    entry.setId,
    entry.viewId,
  ].join('-') + '.runtime-adapter.json';
}

function adapterRelativePath(entry) {
  return `${ADAPTER_DIRECTORY}/${adapterFileName(entry)}`;
}

function writeCreateOnlyJson(file, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  writeFileSync(file, bytes, {
    encoding: null,
    mode: 0o600,
    flag: 'wx',
  });
  return bytes;
}

function sourceAdapterSummary(adapterBundle) {
  return Object.freeze({
    schema: adapterBundle.schema,
    version: adapterBundle.version,
    bundleSha256: adapterBundle.bundleSha256,
    authorizationBundleSha256:
      adapterBundle.sourceAuthorizationSummary.bundleSha256,
    admissionBundleSha256:
      adapterBundle.sourceAuthorizationSummary.admissionBundleSha256,
    authorizationReviewSha256:
      adapterBundle.sourceAuthorizationSummary.authorizationReviewSha256,
    campaignSha256: adapterBundle.sourceAuthorizationSummary.campaignSha256,
    compiledAt: adapterBundle.compiledAt,
  });
}

function packageEntry(sourceEntry, fileRecord) {
  const body = Object.freeze({
    ordinal: sourceEntry.ordinal,
    campaignJobId: sourceEntry.campaignJobId,
    jobSha256: sourceEntry.jobSha256,
    admissionEntrySha256: sourceEntry.admissionEntrySha256,
    authorizationEntrySha256: sourceEntry.authorizationEntrySha256,
    adapterEntrySha256: sourceEntry.adapterEntrySha256,
    characterId: sourceEntry.characterId,
    setId: sourceEntry.setId,
    continuityKey: sourceEntry.continuityKey,
    jobId: sourceEntry.jobId,
    admissionItemId: sourceEntry.admissionItemId,
    viewId: sourceEntry.viewId,
    providerAdmissionSha256: sourceEntry.providerAdmissionSha256,
    authorizationSha256: sourceEntry.authorizationSha256,
    adapterSha256: sourceEntry.adapterSha256,
    relativePath: fileRecord.relativePath,
    fileSha256: fileRecord.sha256,
    fileBytes: fileRecord.byteLength,
    status: 'runtime-adapter-file-packaged-not-executed',
    providerExecutionReceipt: null,
    runtimeReservationReceipt: null,
    authority: FALSE_AUTHORITY,
  });
  return Object.freeze({ ...body, packageEntrySha256: sha256Json(body) });
}

function exactPackageDirectoryShape(packageRoot, manifest) {
  const rootEntries = readdirSync(packageRoot, { withFileTypes: true });
  assert(
    rootEntries.length === 2 &&
      rootEntries.some(
        (entry) =>
          entry.name === MANIFEST_FILE &&
          entry.isFile() &&
          !entry.isSymbolicLink(),
      ) &&
      rootEntries.some(
        (entry) =>
          entry.name === ADAPTER_DIRECTORY &&
          entry.isDirectory() &&
          !entry.isSymbolicLink(),
      ),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ROOT_SHAPE_INVALID',
  );
  const adapterRoot = realDirectory(
    path.join(packageRoot, ADAPTER_DIRECTORY),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ADAPTER_DIRECTORY_UNSAFE',
  );
  const adapterEntries = readdirSync(adapterRoot, { withFileTypes: true });
  const expectedNames = manifest.adapters
    .map((entry) => path.posix.basename(entry.relativePath))
    .sort();
  const actualNames = adapterEntries.map((entry) => entry.name).sort();
  assert(
    adapterEntries.length === EXPECTED_ADAPTER_COUNT &&
      adapterEntries.every(
        (entry) => entry.isFile() && !entry.isSymbolicLink(),
      ) &&
      actualNames.every((name, index) => name === expectedNames[index]),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ADAPTER_DIRECTORY_SHAPE_INVALID',
  );
}

function parseManifest(packageRoot) {
  const source = stableOrdinaryFile(
    packageRoot,
    MANIFEST_FILE,
    MAXIMUM_MANIFEST_BYTES,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_FILE_INVALID',
  );
  let value;
  try {
    value = JSON.parse(
      new TextDecoder('utf-8', { fatal: true })
        .decode(source.bytes)
        .replace(/^\uFEFF/u, ''),
    );
  } catch {
    throw new Error('COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_JSON_INVALID');
  }
  return Object.freeze({ source, value });
}

function validateManifestShape(value) {
  exactKeys(
    value,
    [
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
    ],
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_KEYS_INVALID',
  );
  assert(
    value.schema === COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_SCHEMA &&
      value.protocolVersion ===
        COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_PROTOCOL_VERSION &&
      value.version === COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_VERSION &&
      value.status === 'eight-runtime-adapter-files-packaged-not-executed' &&
      typeof value.manifestSha256 === 'string' &&
      SHA256.test(value.manifestSha256),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_INVALID',
  );
  const body = { ...value };
  delete body.manifestSha256;
  assert(
    sha256Json(body) === value.manifestSha256,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_HASH_MISMATCH',
  );
  exactFalseAuthority(
    value.authority,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_AUTHORITY_INVALID',
  );
  return value;
}

export function compileCouncilIdentityAnchorRuntimePackagePlan() {
  const adapterPlan = compileAdapterPlan();
  const body = Object.freeze({
    schema: COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_PLAN_SCHEMA,
    protocolVersion: COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_PROTOCOL_VERSION,
    version: COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_VERSION,
    status: 'exact-active-v4.7-bundle-required-before-package-materialization',
    sourceAdapterPlan: Object.freeze({
      schema: adapterPlan.schema,
      version: adapterPlan.version,
      planSha256: adapterPlan.planSha256,
      authorizationPlanSha256:
        adapterPlan.sourceAuthorizationPlan.planSha256,
      admissionPlanSha256:
        adapterPlan.sourceAuthorizationPlan.admissionPlanSha256,
      campaignSha256: adapterPlan.sourceAuthorizationPlan.campaignSha256,
    }),
    counts: Object.freeze({
      runtimeAdaptersRequired: EXPECTED_ADAPTER_COUNT,
      runtimeAdapterFilesPackaged: 0,
      manifestFilesPackaged: 0,
      providerExecutionsPerformed: 0,
      dependentJobsExcluded: 16,
    }),
    packagingPolicy: Object.freeze({
      packageRootMustNotExist: true,
      packageRootInsideRepositoryAllowed: false,
      stagingDirectoryRequired: true,
      atomicSameFilesystemRenameRequired: true,
      separateAdapterFilePerAuthorization: true,
      exactAdapterFileSha256Required: true,
      exactAdapterByteLengthRequired: true,
      adapterParserRoundTripRequired: true,
      packageDirectoryAllowlistRequired: true,
      authorizationMustBeActiveAtPackageTime: true,
      authorizationMustBeRevalidatedAtExecutionTime: true,
      providerExecutionPerformedByPackaging: false,
      authorizationConsumedByPackaging: false,
    }),
    layout: Object.freeze({
      manifestFile: MANIFEST_FILE,
      adapterDirectory: ADAPTER_DIRECTORY,
      adapterFileCount: EXPECTED_ADAPTER_COUNT,
      fileModeIntent: 'owner-read-write-only',
    }),
    compiler: Object.freeze({
      path: COMPILER_PATH,
      providerRunner: PROVIDER_RUNNER_PATH,
    }),
    nextGate:
      'supply one exact validated V4.7 bundle while its authorizations are active and materialize an atomic create-only package containing eight independently hash-bound Runtime adapter files; no provider call is made',
    authority: FALSE_AUTHORITY,
  });
  return Object.freeze({ ...body, planSha256: sha256Json(body) });
}

export function validateCouncilIdentityAnchorRuntimePackage({ packageRoot }) {
  const root = realDirectory(
    packageRoot,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ROOT_UNSAFE',
  );
  const relativeToRepository = path.relative(ROOT, root);
  assert(
    relativeToRepository !== '' &&
      (relativeToRepository.startsWith('..') || path.isAbsolute(relativeToRepository)),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_INSIDE_REPOSITORY_FORBIDDEN',
  );
  const parsed = parseManifest(root);
  const manifest = validateManifestShape(parsed.value);
  const adapterBundle = validateAdapterBundle(manifest.sourceAdapterBundle);
  const expectedSummary = sourceAdapterSummary(adapterBundle);
  assert(
    canonical(manifest.sourceAdapterSummary) === canonical(expectedSummary) &&
      manifest.packageLayout?.manifestFile === MANIFEST_FILE &&
      manifest.packageLayout?.adapterDirectory === ADAPTER_DIRECTORY &&
      manifest.packageLayout?.adapterFileCount === EXPECTED_ADAPTER_COUNT &&
      manifest.counts?.runtimeAdapterFilesPackaged === EXPECTED_ADAPTER_COUNT &&
      manifest.counts?.manifestFilesPackaged === 1 &&
      manifest.counts?.providerExecutionsPerformed === 0 &&
      Array.isArray(manifest.adapters) &&
      manifest.adapters.length === EXPECTED_ADAPTER_COUNT &&
      manifest.authorizationWindow?.occurredAt ===
        adapterBundle.authorizationWindow.occurredAt &&
      manifest.authorizationWindow?.expiresAt ===
        adapterBundle.authorizationWindow.expiresAt &&
      manifest.authorizationWindow?.activeAtPackageTime === true &&
      manifest.authorizationWindow?.mustBeRevalidatedAtExecutionTime === true,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_BINDING_INVALID',
  );
  exactPackageDirectoryShape(root, manifest);

  const parseAdapter =
    providerRuntimeModule.parseCharacterIdentityProviderRuntimeAdapter;
  assert(
    typeof parseAdapter === 'function',
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_PROVIDER_PARSER_MISSING',
  );
  for (const [index, entry] of manifest.adapters.entries()) {
    const sourceEntry = adapterBundle.adapters[index];
    assert(
      entry.ordinal === index + 1 &&
        entry.campaignJobId === sourceEntry.campaignJobId &&
        entry.adapterEntrySha256 === sourceEntry.adapterEntrySha256 &&
        entry.adapterSha256 === sourceEntry.adapterSha256 &&
        entry.authorizationSha256 === sourceEntry.authorizationSha256 &&
        entry.relativePath === adapterRelativePath(sourceEntry) &&
        entry.status === 'runtime-adapter-file-packaged-not-executed' &&
        entry.providerExecutionReceipt === null &&
        entry.runtimeReservationReceipt === null &&
        Object.values(entry.authority ?? {}).every((value) => value === false),
      'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ENTRY_BINDING_INVALID',
    );
    const file = stableOrdinaryFile(
      root,
      entry.relativePath,
      MAXIMUM_ADAPTER_BYTES,
      'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ADAPTER_FILE_INVALID',
    );
    assert(
      file.sha256 === entry.fileSha256 &&
        file.byteLength === entry.fileBytes,
      'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ADAPTER_FILE_HASH_MISMATCH',
    );
    let adapter;
    try {
      adapter = JSON.parse(
        new TextDecoder('utf-8', { fatal: true })
          .decode(file.bytes)
          .replace(/^\uFEFF/u, ''),
      );
    } catch {
      throw new Error(
        'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ADAPTER_FILE_JSON_INVALID',
      );
    }
    parseAdapter(adapter);
    assert(
      canonical(adapter) === canonical(sourceEntry.runtimeAdapter),
      'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ADAPTER_CONTENT_MISMATCH',
    );
    const packageEntryBody = { ...entry };
    delete packageEntryBody.packageEntrySha256;
    assert(
      typeof entry.packageEntrySha256 === 'string' &&
        SHA256.test(entry.packageEntrySha256) &&
        sha256Json(packageEntryBody) === entry.packageEntrySha256,
      'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ENTRY_HASH_MISMATCH',
    );
  }
  return Object.freeze({
    valid: true,
    schema: manifest.schema,
    version: manifest.version,
    packageRoot: root,
    manifestSha256: manifest.manifestSha256,
    manifestFileSha256: parsed.source.sha256,
    sourceAdapterBundleSha256: adapterBundle.bundleSha256,
    adapterFileCount: manifest.adapters.length,
    providerExecutionCount: 0,
    identityApprovalCount: 0,
    runtimeActivation: false,
    websiteActivation: false,
  });
}

export function materializeCouncilIdentityAnchorRuntimePackage({
  adapterBundle: adapterBundleInput,
  packageRoot,
  packagedAt,
}) {
  const adapterBundle = validateAdapterBundle(adapterBundleInput);
  const authorizationWindow = activePackageWindow(adapterBundle, packagedAt);
  const target = canonicalAbsoluteDirectoryTarget(packageRoot);
  const stageRoot = `${target.absolute}.stage-${adapterBundle.bundleSha256.slice(0, 16)}`;
  assert(
    path.dirname(stageRoot) === target.parent &&
      !lstatSync(stageRoot, { throwIfNoEntry: false }),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_STAGE_EXISTS',
  );
  let stageCreated = false;
  try {
    mkdirSync(stageRoot, { mode: 0o700, recursive: false });
    stageCreated = true;
    const adapterRoot = path.join(stageRoot, ADAPTER_DIRECTORY);
    mkdirSync(adapterRoot, { mode: 0o700, recursive: false });

    const entries = [];
    for (const sourceEntry of adapterBundle.adapters) {
      const relativePath = adapterRelativePath(sourceEntry);
      const absolutePath = path.join(stageRoot, ...relativePath.split('/'));
      const bytes = writeCreateOnlyJson(
        absolutePath,
        sourceEntry.runtimeAdapter,
      );
      const fileRecord = Object.freeze({
        relativePath,
        byteLength: bytes.byteLength,
        sha256: sha256Bytes(bytes),
      });
      entries.push(packageEntry(sourceEntry, fileRecord));
    }

    const body = Object.freeze({
      schema: COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_MANIFEST_SCHEMA,
      protocolVersion: COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_PROTOCOL_VERSION,
      version: COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_VERSION,
      status: 'eight-runtime-adapter-files-packaged-not-executed',
      packagedAt,
      sourceAdapterBundle: adapterBundle,
      sourceAdapterSummary: sourceAdapterSummary(adapterBundle),
      packageLayout: Object.freeze({
        manifestFile: MANIFEST_FILE,
        adapterDirectory: ADAPTER_DIRECTORY,
        adapterFileCount: EXPECTED_ADAPTER_COUNT,
        exactRootEntryCount: 2,
      }),
      authorizationWindow,
      counts: Object.freeze({
        providerAdmissionsBound: 8,
        providerAuthorizationsBound: 8,
        runtimeAdaptersBound: 8,
        runtimeAdapterFilesPackaged: entries.length,
        manifestFilesPackaged: 1,
        durableRuntimeReservationsEstablished: 0,
        providerExecutionsPerformed: 0,
        dependentAdmissionsCompiled: 0,
        candidateArtifactsMaterialized: 0,
        identitiesApproved: 0,
      }),
      adapters: Object.freeze(entries),
      executionBoundary: Object.freeze({
        packageMaterializationPerformsProviderExecution: false,
        packageMaterializationConsumesAuthorization: false,
        authorizationActiveAtPackageTime: true,
        authorizationMustBeRevalidatedAtExecutionTime: true,
        exactAdapterFileSha256RequiredBeforeExecution: true,
        exactAdapterFileBytesRequiredBeforeExecution: true,
        separateCreateOnlyAdapterFilesEstablished: true,
        durableRuntimeReservationEstablished: false,
        durableRuntimeReservationRequiredAtExecution: true,
        implicitResumeAllowed: false,
        providerFallbackAllowed: false,
        automaticRetryAllowed: false,
        candidateApprovalByExecutionAllowed: false,
        identityApprovalByExecutionAllowed: false,
      }),
      globalAnchorBarrier: Object.freeze({
        allEightAnchorsMustExecuteSuccessfullyBeforeAnyDependentAdmission: true,
        successfulAnchorExecutionReceiptCount: 0,
        dependentAdmissionCompilationAllowed: false,
        crossCharacterAnchorReuseAllowed: false,
        crossSetAnchorReuseAllowed: false,
      }),
      nextGate:
        'run a separate execution preflight that verifies this exact package, each adapter-file SHA-256, current authorization activity, provider availability and safe Runtime/artifact roots without invoking the provider',
      authority: FALSE_AUTHORITY,
    });
    const manifest = Object.freeze({
      ...body,
      manifestSha256: sha256Json(body),
    });
    const manifestBytes = writeCreateOnlyJson(
      path.join(stageRoot, MANIFEST_FILE),
      manifest,
    );

    const stageValidation = validateCouncilIdentityAnchorRuntimePackage({
      packageRoot: stageRoot,
    });
    assert(
      stageValidation.manifestSha256 === manifest.manifestSha256 &&
        stageValidation.adapterFileCount === EXPECTED_ADAPTER_COUNT,
      'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_STAGE_VALIDATION_FAILED',
    );
    assert(
      !lstatSync(target.absolute, { throwIfNoEntry: false }),
      'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_ROOT_EXISTS',
    );
    renameSync(stageRoot, target.absolute);
    stageCreated = false;

    const finalValidation = validateCouncilIdentityAnchorRuntimePackage({
      packageRoot: target.absolute,
    });
    assert(
      finalValidation.manifestSha256 === manifest.manifestSha256 &&
        finalValidation.manifestFileSha256 === sha256Bytes(manifestBytes),
      'COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_FINAL_VALIDATION_FAILED',
    );
    return Object.freeze({
      status: 'passed',
      packageRoot: target.absolute,
      manifest,
      manifestSha256: manifest.manifestSha256,
      manifestFileSha256: finalValidation.manifestFileSha256,
      adapterFileCount: EXPECTED_ADAPTER_COUNT,
      providerExecutionsPerformed: 0,
      identityApprovalsEstablished: 0,
      runtimeActivation: false,
      websiteActivation: false,
    });
  } catch (error) {
    if (stageCreated) {
      rmSync(stageRoot, { recursive: true, force: true });
    }
    throw error;
  }
}

export function councilIdentityAnchorRuntimePackageCapabilities() {
  const plan = compileCouncilIdentityAnchorRuntimePackagePlan();
  return Object.freeze({
    schema: COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_CAPABILITIES_SCHEMA,
    protocolVersion: COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_PROTOCOL_VERSION,
    version: COUNCIL_IDENTITY_ANCHOR_RUNTIME_PACKAGE_VERSION,
    sourceAdapterPlanSha256: plan.sourceAdapterPlan.planSha256,
    campaignSha256: plan.sourceAdapterPlan.campaignSha256,
    runtimeAdapterCountRequired: EXPECTED_ADAPTER_COUNT,
    createOnlyPackageRootRequired: true,
    packageRootInsideRepositoryAllowed: false,
    atomicPackagePublicationRequired: true,
    exactAdapterFileSha256Required: true,
    adapterParserRoundTripRequired: true,
    packageDirectoryAllowlistRequired: true,
    authorizationMustBeActiveAtPackageTime: true,
    authorizationMustBeRevalidatedAtExecutionTime: true,
    runtimeAdapterPackagingAvailable: true,
    executionPreflightAvailable: false,
    durableRuntimeReservationEstablished: false,
    providerExecutionAvailable: false,
    candidateApprovalAvailable: false,
    identityApprovalAvailable: false,
    animationProductionAvailable: false,
    publicationAvailable: false,
    runtimeActivationAvailable: false,
    websiteActivationAvailable: false,
    authority: FALSE_AUTHORITY,
  });
}
