import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as authorizationModule from './council-identity-anchor-authorization.mjs';
import * as providerRuntimeModule from './character-identity-provider-runtime.mjs';

export const COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_PLAN_SCHEMA =
  'evavo.project-art-council-identity-anchor-runtime-adapter-plan.v1';
export const COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_BUNDLE_SCHEMA =
  'evavo.project-art-council-identity-anchor-runtime-adapter-bundle.v1';
export const COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_CAPABILITIES_SCHEMA =
  'evavo.project-art-council-identity-anchor-runtime-adapter-capabilities.v1';
export const COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_VERSION = '4.7.0';
export const COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_PROTOCOL_VERSION =
  '2026-08-21.3';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COMPILER_PATH =
  'scripts/compile-project-art-council-identity-anchor-runtime-adapters.mjs';
const PROVIDER_RUNNER_PATH =
  'scripts/run-project-art-character-identity-provider.mjs';
const SHA256 = /^[a-f0-9]{64}$/u;
const MAXIMUM_SOURCE_BYTES = 2 * 1024 * 1024;
const CHARACTER_ORDER = Object.freeze([
  'council-critic',
  'council-open-reviewer',
]);
const SET_ORDER = Object.freeze([
  'candidate-set-01',
  'candidate-set-02',
  'candidate-set-03',
  'candidate-set-04',
]);

const FALSE_AUTHORITY = Object.freeze({
  providerAdmission: false,
  providerAuthorization: false,
  runtimeAdapterCompilation: false,
  durableAuthorizationConsumption: false,
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

function ordinaryJson(relativePath, expectedSha256) {
  assert(
    typeof relativePath === 'string' &&
      relativePath.length >= 1 &&
      relativePath.length <= 2048 &&
      !relativePath.includes('\\') &&
      !relativePath.includes('\0') &&
      !relativePath.startsWith('/') &&
      !relativePath.startsWith('../') &&
      !relativePath.includes('/../') &&
      path.posix.normalize(relativePath) === relativePath,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_REQUEST_PATH_INVALID',
  );
  const absolute = path.resolve(ROOT, ...relativePath.split('/'));
  const relative = path.relative(ROOT, absolute);
  assert(
    relative && !relative.startsWith('..') && !path.isAbsolute(relative),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_REQUEST_PATH_ESCAPE',
  );
  const before = lstatSync(absolute, { throwIfNoEntry: false });
  assert(
    before?.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      before.size > 1 &&
      before.size <= MAXIMUM_SOURCE_BYTES &&
      realpathSync(absolute) === absolute,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_REQUEST_FILE_UNSAFE',
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  assert(
    ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(
      (key) => before[key] === after[key],
    ),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_REQUEST_FILE_CHANGED',
  );
  const actualSha256 = sha256Bytes(bytes);
  assert(
    typeof expectedSha256 === 'string' &&
      SHA256.test(expectedSha256) &&
      actualSha256 === expectedSha256,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_REQUEST_SHA256_MISMATCH',
  );
  let value;
  try {
    value = JSON.parse(
      new TextDecoder('utf-8', { fatal: true })
        .decode(bytes)
        .replace(/^\uFEFF/u, ''),
    );
  } catch {
    throw new Error(
      'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_REQUEST_JSON_INVALID',
    );
  }
  return Object.freeze({
    path: relativePath,
    bytes: bytes.byteLength,
    sha256: actualSha256,
    value,
  });
}

function expectedCampaignJobIds() {
  return Object.freeze(
    CHARACTER_ORDER.flatMap((characterId) =>
      SET_ORDER.map((setId) => `${characterId}-${setId}-full-body-right`),
    ),
  );
}

function compileAuthorizationPlan() {
  const compile =
    authorizationModule.compileCouncilIdentityAnchorAuthorizationPlan;
  assert(
    typeof compile === 'function',
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_AUTHORIZATION_PLAN_COMPILER_MISSING',
  );
  const plan = compile();
  assert(
    plan?.schema ===
      authorizationModule.COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_PLAN_SCHEMA &&
      typeof plan.planSha256 === 'string' &&
      SHA256.test(plan.planSha256) &&
      plan.counts?.providerAdmissionsRequired === 8 &&
      Array.isArray(plan.targets) &&
      plan.targets.length === 8,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_AUTHORIZATION_PLAN_INVALID',
  );
  const expectedIds = expectedCampaignJobIds();
  assert(
    plan.targets.every(
      (target, index) =>
        target.ordinal === index + 1 &&
        target.campaignJobId === expectedIds[index] &&
        target.viewId === 'full-body-right' &&
        target.maximumProviderCalls === 1 &&
        target.oneShot === true &&
        target.runtimeAdapterRequiredBeforeExecution === true &&
        target.providerExecutionAllowedByPlan === false &&
        Object.values(target.authority ?? {}).every((value) => value === false),
    ),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_AUTHORIZATION_PLAN_MATRIX_INVALID',
  );
  return plan;
}

function planTarget(target) {
  return Object.freeze({
    ordinal: target.ordinal,
    campaignJobId: target.campaignJobId,
    jobSha256: target.jobSha256,
    characterId: target.characterId,
    requestPath: target.requestPath,
    setId: target.setId,
    continuityKey: target.continuityKey,
    jobId: target.jobId,
    admissionItemId: target.admissionItemId,
    viewId: target.viewId,
    status: 'authorization-bundle-required-before-runtime-adapter-compilation',
    runtimeAdapterCompilationDeterministic: true,
    authorizationMustBeActiveAtCompileTime: true,
    authorizationMustBeRevalidatedAtExecutionTime: true,
    providerExecutionAllowedByPlan: false,
    authority: FALSE_AUTHORITY,
  });
}

export function compileCouncilIdentityAnchorRuntimeAdapterPlan() {
  const authorizationPlan = compileAuthorizationPlan();
  const targets = Object.freeze(authorizationPlan.targets.map(planTarget));
  const body = Object.freeze({
    schema: COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_PLAN_SCHEMA,
    protocolVersion: COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_PROTOCOL_VERSION,
    version: COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_VERSION,
    status: 'exact-active-authorization-bundle-required-before-adapter-compilation',
    sourceAuthorizationPlan: Object.freeze({
      schema: authorizationPlan.schema,
      version: authorizationPlan.version,
      planSha256: authorizationPlan.planSha256,
      admissionPlanSha256:
        authorizationPlan.sourceAdmissionPlan.planSha256,
      campaignSha256: authorizationPlan.sourceAdmissionPlan.campaignSha256,
    }),
    counts: Object.freeze({
      characters: 2,
      candidateSets: 8,
      providerAuthorizationsRequired: 8,
      runtimeAdaptersCompiled: 0,
      providerExecutionsPerformed: 0,
      dependentJobsExcluded: 16,
    }),
    targetCampaignJobIds: expectedCampaignJobIds(),
    targets,
    adapterPolicy: Object.freeze({
      exactValidatedAuthorizationBundleRequired: true,
      exactIdentityRequestFileSha256Required: true,
      authorizationMustBeActiveAtCompileTime: true,
      authorizationMustBeRevalidatedAtExecutionTime: true,
      separateAdapterPerAuthorization: true,
      oneCandidateOnly: true,
      maximumProviderCallsPerAdapter: 1,
      maximumRuntimeAttemptsPerAdapter: 1,
      providerFallbackAllowed: false,
      automaticRetryAllowed: false,
      adapterCompilationPerformsProviderExecution: false,
      adapterCompilationConsumesAuthorization: false,
      durableRuntimeReservationRequiredAtExecution: true,
    }),
    compiler: Object.freeze({
      path: COMPILER_PATH,
      providerRunner: PROVIDER_RUNNER_PATH,
      outputPolicy: 'single-create-only-json-bundle',
    }),
    nextGate:
      'supply the exact validated V4.6 authorization bundle while its authorization window is active; this compiler creates eight exact Runtime adapters only and performs no provider call or authorization consumption',
    authority: FALSE_AUTHORITY,
  });
  return Object.freeze({ ...body, planSha256: sha256Json(body) });
}

function validateAuthorizationBundle(value) {
  const validate =
    authorizationModule.validateCouncilIdentityAnchorAuthorizationBundle;
  assert(
    typeof validate === 'function',
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_AUTHORIZATION_VALIDATOR_MISSING',
  );
  validate(value);
  const plan = compileAuthorizationPlan();
  const expectedIds = expectedCampaignJobIds();
  assert(
    value?.schema ===
      authorizationModule.COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_BUNDLE_SCHEMA &&
      typeof value.bundleSha256 === 'string' &&
      SHA256.test(value.bundleSha256) &&
      value.counts?.providerAdmissionsBound === 8 &&
      value.counts?.providerAuthorizationsCompiled === 8 &&
      value.counts?.runtimeAdaptersCompiled === 0 &&
      value.counts?.providerExecutionsPerformed === 0 &&
      Array.isArray(value.authorizations) &&
      value.authorizations.length === 8 &&
      value.authorizations.every(
        (entry, index) =>
          entry.ordinal === index + 1 &&
          entry.campaignJobId === expectedIds[index] &&
          entry.status ===
            'provider-authorized-one-shot-not-adapted-not-executed' &&
          entry.viewId === 'full-body-right' &&
          typeof entry.authorizationEntrySha256 === 'string' &&
          SHA256.test(entry.authorizationEntrySha256) &&
          entry.providerAuthorization?.maximumProviderCalls === 1 &&
          entry.providerAuthorization?.oneShot === true &&
          entry.runtimeAdapter === null &&
          entry.providerExecutionReceipt === null &&
          entry.consumption?.durableConsumptionLedgerEstablished === false &&
          entry.consumption?.consumed === false &&
          entry.consumption?.consumptionReceipt === null &&
          Object.values(entry.providerAuthorization?.authority ?? {}).every(
            (authorityValue) => authorityValue === false,
          ) &&
          Object.values(entry.authority ?? {}).every(
            (authorityValue) => authorityValue === false,
          ),
      ) &&
      value.sourceAdmissionBundle?.sourceCampaign?.campaignSha256 ===
        plan.sourceAdmissionPlan.campaignSha256 &&
      Object.values(value.authority ?? {}).every(
        (authorityValue) => authorityValue === false,
      ),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_AUTHORIZATION_BUNDLE_INVALID',
  );
  return value;
}

function activeWindow(authorizationBundle, compiledAt) {
  const compiled = iso(
    compiledAt,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_COMPILED_AT_INVALID',
  );
  const occurred = iso(
    authorizationBundle.authorizationWindow?.occurredAt,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_AUTHORIZATION_OCCURRED_AT_INVALID',
  );
  const expires = iso(
    authorizationBundle.authorizationWindow?.expiresAt,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_AUTHORIZATION_EXPIRES_AT_INVALID',
  );
  assert(
    compiled >= occurred && compiled < expires,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_AUTHORIZATION_NOT_ACTIVE',
  );
  assert(
    authorizationBundle.authorizations.every(
      (entry) =>
        entry.providerAuthorization.occurredAt ===
          authorizationBundle.authorizationWindow.occurredAt &&
        entry.providerAuthorization.expiresAt ===
          authorizationBundle.authorizationWindow.expiresAt,
    ),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_AUTHORIZATION_WINDOW_DRIFT',
  );
  return Object.freeze({
    occurredAt: authorizationBundle.authorizationWindow.occurredAt,
    expiresAt: authorizationBundle.authorizationWindow.expiresAt,
    compiledAt,
    activeAtCompileTime: true,
  });
}

function sourceAuthorizationSummary(authorizationBundle) {
  return Object.freeze({
    schema: authorizationBundle.schema,
    version: authorizationBundle.version,
    bundleSha256: authorizationBundle.bundleSha256,
    admissionBundleSha256:
      authorizationBundle.sourceAdmissionBundle.bundleSha256,
    authorizationReviewSha256: authorizationBundle.review.reviewSha256,
    campaignSha256:
      authorizationBundle.sourceAdmissionBundle.sourceCampaign.campaignSha256,
    compiledAt: authorizationBundle.compiledAt,
  });
}

function compileAdapterEntry(
  authorizationBundle,
  authorizationEntry,
  admissionEntry,
  compiledAt,
) {
  assert(
    authorizationEntry.ordinal === admissionEntry.ordinal &&
      authorizationEntry.campaignJobId === admissionEntry.campaignJobId &&
      authorizationEntry.characterId === admissionEntry.characterId &&
      authorizationEntry.setId === admissionEntry.setId &&
      authorizationEntry.continuityKey === admissionEntry.continuityKey &&
      authorizationEntry.jobId === admissionEntry.jobId &&
      authorizationEntry.viewId === admissionEntry.viewId &&
      authorizationEntry.providerAdmissionSha256 ===
        admissionEntry.providerAdmission.providerAdmissionSha256 &&
      authorizationEntry.providerAuthorization.providerAdmissionSha256 ===
        admissionEntry.providerAdmission.providerAdmissionSha256,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_ENTRY_BINDING_INVALID',
  );
  const source = ordinaryJson(
    admissionEntry.requestPath,
    admissionEntry.requestFileSha256,
  );
  assert(
    source.value?.schema === 'evavo.character-identity-master-request.v1' &&
      source.value?.character?.id === admissionEntry.characterId,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_IDENTITY_REQUEST_INVALID',
  );
  const compile =
    providerRuntimeModule.compileCharacterIdentityProviderRuntimeAdapter;
  const parse = providerRuntimeModule.parseCharacterIdentityProviderRuntimeAdapter;
  assert(
    typeof compile === 'function' && typeof parse === 'function',
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_PROVIDER_COMPILER_MISSING',
  );
  const adapter = compile({
    identityRequest: source.value,
    providerAdmission: admissionEntry.providerAdmission,
    authorization: authorizationEntry.providerAuthorization,
    compiledAt,
  });
  parse(adapter);
  assert(
    adapter.characterId === admissionEntry.characterId &&
      adapter.setId === admissionEntry.setId &&
      adapter.continuityKey === admissionEntry.continuityKey &&
      adapter.jobId === admissionEntry.jobId &&
      adapter.viewId === 'full-body-right' &&
      adapter.providerAdmission.providerAdmissionSha256 ===
        admissionEntry.providerAdmission.providerAdmissionSha256 &&
      adapter.authorization.authorizationSha256 ===
        authorizationEntry.providerAuthorization.authorizationSha256 &&
      adapter.executionPolicy?.oneCandidateOnly === true &&
      adapter.executionPolicy?.maximumProviderCalls === 1 &&
      adapter.executionPolicy?.maximumRuntimeAttempts === 1 &&
      adapter.executionPolicy?.providerFallbackAllowed === false &&
      adapter.executionPolicy?.generationEqualsApproval === false &&
      Object.values(adapter.authority ?? {}).every((value) => value === false),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_COMPILED_ADAPTER_INVALID',
  );
  const body = Object.freeze({
    ordinal: authorizationEntry.ordinal,
    campaignJobId: authorizationEntry.campaignJobId,
    jobSha256: authorizationEntry.jobSha256,
    admissionEntrySha256: authorizationEntry.admissionEntrySha256,
    authorizationEntrySha256:
      authorizationEntry.authorizationEntrySha256,
    characterId: authorizationEntry.characterId,
    setId: authorizationEntry.setId,
    continuityKey: authorizationEntry.continuityKey,
    jobId: authorizationEntry.jobId,
    admissionItemId: authorizationEntry.admissionItemId,
    viewId: authorizationEntry.viewId,
    requestPath: source.path,
    requestFileSha256: source.sha256,
    requestFileBytes: source.bytes,
    providerAdmissionSha256:
      admissionEntry.providerAdmission.providerAdmissionSha256,
    authorizationSha256:
      authorizationEntry.providerAuthorization.authorizationSha256,
    adapterSha256: adapter.adapterSha256,
    status: 'runtime-adapter-compiled-not-executed',
    runtimeAdapter: adapter,
    providerExecutionReceipt: null,
    runtimeReservation: Object.freeze({
      established: false,
      runtimeJobId: null,
      reservationReceipt: null,
    }),
    authority: FALSE_AUTHORITY,
  });
  return Object.freeze({ ...body, adapterEntrySha256: sha256Json(body) });
}

export function compileCouncilIdentityAnchorRuntimeAdapterBundle({
  authorizationBundle: authorizationBundleInput,
  compiledAt,
}) {
  const authorizationBundle = validateAuthorizationBundle(
    authorizationBundleInput,
  );
  const window = activeWindow(authorizationBundle, compiledAt);
  const admissionEntries =
    authorizationBundle.sourceAdmissionBundle.admissions;
  assert(
    Array.isArray(admissionEntries) && admissionEntries.length === 8,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_ADMISSION_MATRIX_INVALID',
  );
  const adapters = Object.freeze(
    authorizationBundle.authorizations.map((authorizationEntry, index) =>
      compileAdapterEntry(
        authorizationBundle,
        authorizationEntry,
        admissionEntries[index],
        compiledAt,
      ),
    ),
  );
  assert(
    new Set(adapters.map((entry) => entry.adapterSha256)).size === 8,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_DUPLICATE_ADAPTER',
  );
  const body = Object.freeze({
    schema: COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_BUNDLE_SCHEMA,
    protocolVersion: COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_PROTOCOL_VERSION,
    version: COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_VERSION,
    status: 'eight-anchor-runtime-adapters-compiled-not-executed',
    compiledAt,
    sourceAuthorizationBundle: authorizationBundle,
    sourceAuthorizationSummary: sourceAuthorizationSummary(
      authorizationBundle,
    ),
    counts: Object.freeze({
      providerAdmissionsBound: 8,
      providerAuthorizationsBound: 8,
      runtimeAdaptersCompiled: adapters.length,
      durableRuntimeReservationsEstablished: 0,
      providerExecutionsPerformed: 0,
      dependentAdmissionsCompiled: 0,
      candidateArtifactsMaterialized: 0,
      identitiesApproved: 0,
    }),
    adapters,
    authorizationWindow: window,
    executionBoundary: Object.freeze({
      adapterCompilationPerformsProviderExecution: false,
      adapterCompilationConsumesAuthorization: false,
      authorizationActiveAtCompileTime: true,
      authorizationMustBeRevalidatedAtExecutionTime: true,
      exactAdapterFileSha256RequiredBeforeExecution: true,
      separateCreateOnlyAdapterFilesRequiredBeforeExecution: true,
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
      'materialize the eight embedded Runtime adapters into separate create-only files, verify each exact adapter-file SHA-256, and execute only through the existing one-shot Runtime reservation path while every authorization remains active',
    authority: FALSE_AUTHORITY,
  });
  return Object.freeze({ ...body, bundleSha256: sha256Json(body) });
}

export function validateCouncilIdentityAnchorRuntimeAdapterBundle(value) {
  exactKeys(
    value,
    [
      'schema',
      'protocolVersion',
      'version',
      'status',
      'compiledAt',
      'sourceAuthorizationBundle',
      'sourceAuthorizationSummary',
      'counts',
      'adapters',
      'authorizationWindow',
      'executionBoundary',
      'globalAnchorBarrier',
      'nextGate',
      'authority',
      'bundleSha256',
    ],
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_BUNDLE_KEYS_INVALID',
  );
  assert(
    value.schema === COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_BUNDLE_SCHEMA &&
      value.protocolVersion ===
        COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_PROTOCOL_VERSION &&
      value.version === COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_VERSION &&
      value.status === 'eight-anchor-runtime-adapters-compiled-not-executed' &&
      typeof value.bundleSha256 === 'string' &&
      SHA256.test(value.bundleSha256),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_BUNDLE_INVALID',
  );
  const body = { ...value };
  delete body.bundleSha256;
  assert(
    sha256Json(body) === value.bundleSha256,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_BUNDLE_HASH_MISMATCH',
  );
  exactFalseAuthority(
    value.authority,
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_BUNDLE_AUTHORITY_INVALID',
  );
  const expected = compileCouncilIdentityAnchorRuntimeAdapterBundle({
    authorizationBundle: value.sourceAuthorizationBundle,
    compiledAt: value.compiledAt,
  });
  assert(
    canonical(expected) === canonical(value),
    'COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_BUNDLE_RECOMPILE_MISMATCH',
  );
  return Object.freeze({
    valid: true,
    schema: value.schema,
    bundleSha256: value.bundleSha256,
    providerAdmissionCount: 8,
    providerAuthorizationCount: 8,
    runtimeAdapterCount: value.adapters.length,
    durableRuntimeReservationCount: 0,
    providerExecutionCount: 0,
    identityApprovalCount: 0,
    runtimeActivation: false,
    websiteActivation: false,
  });
}

export function councilIdentityAnchorRuntimeAdapterCapabilities() {
  const plan = compileCouncilIdentityAnchorRuntimeAdapterPlan();
  return Object.freeze({
    schema: COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_CAPABILITIES_SCHEMA,
    protocolVersion: COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_PROTOCOL_VERSION,
    version: COUNCIL_IDENTITY_ANCHOR_RUNTIME_ADAPTER_VERSION,
    sourceAuthorizationPlanSha256:
      plan.sourceAuthorizationPlan.planSha256,
    campaignSha256: plan.sourceAuthorizationPlan.campaignSha256,
    providerAuthorizationCountRequired: 8,
    runtimeAdapterCount: 8,
    authorizationMustBeActiveAtCompileTime: true,
    authorizationMustBeRevalidatedAtExecutionTime: true,
    exactIdentityRequestFileSha256Required: true,
    separateAdapterPerAuthorization: true,
    createOnlyBundleOutput: true,
    runtimeAdapterCompilationAvailable: true,
    separateAdapterFilePackagingAvailable: false,
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
