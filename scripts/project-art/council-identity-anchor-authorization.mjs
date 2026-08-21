import { createHash } from 'node:crypto';

import * as admissionModule from './council-identity-anchor-admission.mjs';
import * as providerRuntimeModule from './character-identity-provider-runtime.mjs';

export const COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_PLAN_SCHEMA =
  'evavo.project-art-council-identity-anchor-authorization-plan.v1';
export const COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_TEMPLATE_SCHEMA =
  'evavo.project-art-council-identity-anchor-authorization-review-template.v1';
export const COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_SCHEMA =
  'evavo.project-art-council-identity-anchor-authorization-review.v1';
export const COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_BUNDLE_SCHEMA =
  'evavo.project-art-council-identity-anchor-authorization-bundle.v1';
export const COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_CAPABILITIES_SCHEMA =
  'evavo.project-art-council-identity-anchor-authorization-capabilities.v1';
export const COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_VERSION = '4.6.0';
export const COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_PROTOCOL_VERSION =
  '2026-08-21.2';

const COMPILER_PATH =
  'scripts/compile-project-art-council-identity-anchor-authorization.mjs';
const PROVIDER_COMPILER_PATH =
  'scripts/compile-project-art-character-identity-provider-runtime.mjs';
const PROVIDER_RUNNER_PATH =
  'scripts/run-project-art-character-identity-provider.mjs';
const SHA256 = /^[a-f0-9]{64}$/u;
const ACTOR_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const AUTHORIZATION_WINDOW_MS = 24 * 60 * 60 * 1000;
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
  providerExecution: false,
  runtimeAdapterCompilation: false,
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

function iso(value, label) {
  assert(typeof value === 'string' && value.length >= 20 && value.length <= 40, label);
  const parsed = Date.parse(value);
  assert(Number.isFinite(parsed) && new Date(parsed).toISOString() === value, label);
  return parsed;
}

function text(value, label, minimum, maximum) {
  assert(typeof value === 'string', label);
  const result = value.trim().replace(/\s+/gu, ' ');
  assert(result.length >= minimum && result.length <= maximum, label);
  return result;
}

function exactFalseAuthority(value, code) {
  exactKeys(value, Object.keys(FALSE_AUTHORITY), code);
  assert(
    Object.entries(FALSE_AUTHORITY).every(([key, expected]) => value[key] === expected),
    code,
  );
  return FALSE_AUTHORITY;
}

function expectedCampaignJobIds() {
  return Object.freeze(
    CHARACTER_ORDER.flatMap((characterId) =>
      SET_ORDER.map((setId) => `${characterId}-${setId}-full-body-right`),
    ),
  );
}

function compileAdmissionPlan() {
  const compile = admissionModule.compileCouncilIdentityAnchorAdmissionPlan;
  assert(
    typeof compile === 'function',
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_ADMISSION_PLAN_COMPILER_MISSING',
  );
  const plan = compile();
  assert(
    plan?.schema ===
      admissionModule.COUNCIL_IDENTITY_ANCHOR_ADMISSION_PLAN_SCHEMA &&
      typeof plan.planSha256 === 'string' &&
      SHA256.test(plan.planSha256) &&
      plan.counts?.anchorJobs === 8 &&
      Array.isArray(plan.anchors) &&
      plan.anchors.length === 8,
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_ADMISSION_PLAN_INVALID',
  );
  const expectedIds = expectedCampaignJobIds();
  assert(
    plan.anchors.every(
      (anchor, index) =>
        anchor.ordinal === index + 1 &&
        anchor.campaignJobId === expectedIds[index] &&
        anchor.viewId === 'full-body-right' &&
        anchor.providerAuthorizationRequiredAfterAdmission === true &&
        anchor.providerExecutionAllowed === false &&
        Object.values(anchor.authority ?? {}).every((value) => value === false),
    ),
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_ADMISSION_PLAN_MATRIX_INVALID',
  );
  return plan;
}

function planTarget(anchor) {
  return Object.freeze({
    ordinal: anchor.ordinal,
    campaignJobId: anchor.campaignJobId,
    jobSha256: anchor.jobSha256,
    characterId: anchor.characterId,
    requestPath: anchor.requestPath,
    setId: anchor.setId,
    continuityKey: anchor.continuityKey,
    jobId: anchor.jobId,
    admissionItemId: anchor.admissionItemId,
    viewId: anchor.viewId,
    targetPath: anchor.targetPath,
    status: 'provider-admission-and-human-authorization-review-required',
    maximumProviderCalls: 1,
    oneShot: true,
    runtimeAdapterRequiredBeforeExecution: true,
    providerExecutionAllowedByPlan: false,
    authority: FALSE_AUTHORITY,
  });
}

export function compileCouncilIdentityAnchorAuthorizationPlan() {
  const admissionPlan = compileAdmissionPlan();
  const targets = Object.freeze(admissionPlan.anchors.map(planTarget));
  const body = Object.freeze({
    schema: COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_PLAN_SCHEMA,
    protocolVersion: COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_PROTOCOL_VERSION,
    version: COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_VERSION,
    status: 'admission-bundle-and-human-review-required-before-authorization-compilation',
    sourceAdmissionPlan: Object.freeze({
      schema: admissionPlan.schema,
      version: admissionPlan.version,
      planSha256: admissionPlan.planSha256,
      campaignSha256: admissionPlan.sourceCampaign.campaignSha256,
    }),
    counts: Object.freeze({
      characters: 2,
      candidateSets: 8,
      providerAdmissionsRequired: 8,
      providerAuthorizationsCompiled: 0,
      runtimeAdaptersCompiled: 0,
      providerExecutionsPerformed: 0,
      dependentJobsExcluded: 16,
    }),
    targetCampaignJobIds: expectedCampaignJobIds(),
    targets,
    authorizationPolicy: Object.freeze({
      exactValidatedAdmissionBundleRequired: true,
      namedHumanRequired: true,
      maximumAuthorizationWindowHours: 24,
      separateAuthorizationPerAdmission: true,
      oneShotPerAuthorization: true,
      maximumProviderCallsPerAuthorization: 1,
      maximumProviderCallsTotal: 8,
      providerFallbackAllowed: false,
      automaticRetryAllowed: false,
      runtimeAdapterRequiredBeforeExecution: true,
      durableConsumptionLedgerRequiredBeforeExecution: true,
      authorizationCompilationPerformsProviderExecution: false,
      authorizationCompilationApprovesCandidates: false,
      authorizationCompilationApprovesIdentities: false,
    }),
    compiler: Object.freeze({
      path: COMPILER_PATH,
      providerAuthorizationCompiler: PROVIDER_COMPILER_PATH,
      providerRunner: PROVIDER_RUNNER_PATH,
      outputPolicy: 'single-create-only-json-bundle',
    }),
    nextGate:
      'supply the exact validated V4.5 eight-admission bundle and a named-human review explicitly authorizing eight separate one-shot provider calls; this compiler then creates authorization documents only and performs no provider execution',
    authority: FALSE_AUTHORITY,
  });
  return Object.freeze({ ...body, planSha256: sha256Json(body) });
}

function validateAdmissionBundle(value) {
  const validate = admissionModule.validateCouncilIdentityAnchorAdmissionBundle;
  assert(
    typeof validate === 'function',
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_ADMISSION_VALIDATOR_MISSING',
  );
  validate(value);
  const plan = compileAdmissionPlan();
  const expectedIds = expectedCampaignJobIds();
  assert(
    value?.schema === admissionModule.COUNCIL_IDENTITY_ANCHOR_ADMISSION_BUNDLE_SCHEMA &&
      typeof value.bundleSha256 === 'string' &&
      SHA256.test(value.bundleSha256) &&
      value.sourceCampaign?.campaignSha256 ===
        plan.sourceCampaign.campaignSha256 &&
      value.counts?.providerAdmissionsCompiled === 8 &&
      value.counts?.providerAuthorizationsCompiled === 0 &&
      value.counts?.providerExecutionsPerformed === 0 &&
      Array.isArray(value.admissions) &&
      value.admissions.length === 8 &&
      value.admissions.every(
        (entry, index) =>
          entry.ordinal === index + 1 &&
          entry.campaignJobId === expectedIds[index] &&
          entry.status === 'provider-admitted-not-authorized' &&
          entry.viewId === 'full-body-right' &&
          entry.providerAuthorization === null &&
          entry.providerExecutionReceipt === null &&
          typeof entry.entrySha256 === 'string' &&
          SHA256.test(entry.entrySha256) &&
          typeof entry.providerAdmission?.providerAdmissionSha256 === 'string' &&
          SHA256.test(entry.providerAdmission.providerAdmissionSha256) &&
          entry.providerAdmission?.limits?.providerCalls === 1 &&
          entry.providerAdmission?.limits?.providerFallback === false &&
          entry.providerAdmission?.limits?.runtimeAttempts === 1 &&
          Object.values(entry.providerAdmission?.authority ?? {}).every(
            (authorityValue) => authorityValue === false,
          ) &&
          Object.values(entry.authority ?? {}).every(
            (authorityValue) => authorityValue === false,
          ),
      ),
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_ADMISSION_BUNDLE_INVALID',
  );
  return value;
}

function authorizationTargets(admissionBundle) {
  return Object.freeze(
    admissionBundle.admissions.map((entry) =>
      Object.freeze({
        ordinal: entry.ordinal,
        campaignJobId: entry.campaignJobId,
        jobSha256: entry.jobSha256,
        admissionEntrySha256: entry.entrySha256,
        providerAdmissionSha256:
          entry.providerAdmission.providerAdmissionSha256,
        characterId: entry.characterId,
        setId: entry.setId,
        continuityKey: entry.continuityKey,
        jobId: entry.jobId,
        admissionItemId: entry.providerAdmission.admissionItemId,
        viewId: entry.viewId,
      }),
    ),
  );
}

function sourceAdmissionSummary(admissionBundle) {
  return Object.freeze({
    schema: admissionBundle.schema,
    version: admissionBundle.version,
    bundleSha256: admissionBundle.bundleSha256,
    campaignSha256: admissionBundle.sourceCampaign.campaignSha256,
    admissionReviewSha256: admissionBundle.review.reviewSha256,
    compiledAt: admissionBundle.compiledAt,
  });
}

export function createCouncilIdentityAnchorAuthorizationReviewTemplate(
  admissionBundleInput,
) {
  const admissionBundle = validateAdmissionBundle(admissionBundleInput);
  const plan = compileCouncilIdentityAnchorAuthorizationPlan();
  const targets = authorizationTargets(admissionBundle);
  const body = Object.freeze({
    schema: COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_TEMPLATE_SCHEMA,
    protocolVersion: COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_PROTOCOL_VERSION,
    version: COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_VERSION,
    sourcePlanSha256: plan.planSha256,
    sourceAdmissionBundle: sourceAdmissionSummary(admissionBundle),
    action: 'authorize-eight-anchor-provider-calls-one-shot',
    requiredHumanFields: Object.freeze({
      actorId: '<named-human-actor-id>',
      occurredAt: '<iso-8601>',
      expiresAt: '<iso-8601-no-more-than-24-hours-after-occurred-at>',
      evidenceSha256: '<lowercase-sha256>',
      statement:
        '<human statement explicitly authorizing the exact eight provider admissions for one call each>',
    }),
    targetCampaignJobIds: Object.freeze(
      targets.map((target) => target.campaignJobId),
    ),
    targetAdmissionEntrySha256s: Object.freeze(
      targets.map((target) => target.admissionEntrySha256),
    ),
    targetProviderAdmissionSha256s: Object.freeze(
      targets.map((target) => target.providerAdmissionSha256),
    ),
    constraints: Object.freeze({
      exactAuthorizationCount: 8,
      maximumProviderCallsPerAuthorization: 1,
      maximumProviderCallsTotal: 8,
      oneShotEach: true,
      providerFallbackAllowed: false,
      automaticRetryAllowed: false,
      runtimeAdapterCompilationPerformed: false,
      providerExecutionPerformed: false,
      candidateApprovalGranted: false,
      identityApprovalGranted: false,
      publicationGranted: false,
      runtimeActivationGranted: false,
      websiteActivationGranted: false,
      durableConsumptionLedgerRequiredBeforeExecution: true,
    }),
    authority: FALSE_AUTHORITY,
  });
  return Object.freeze({ ...body, templateSha256: sha256Json(body) });
}

export function createCouncilIdentityAnchorAuthorizationReview({
  admissionBundle: admissionBundleInput,
  actorId: actorIdInput,
  occurredAt,
  expiresAt,
  evidenceSha256,
  statement: statementInput,
}) {
  const admissionBundle = validateAdmissionBundle(admissionBundleInput);
  const plan = compileCouncilIdentityAnchorAuthorizationPlan();
  const targets = authorizationTargets(admissionBundle);
  const actorId = text(
    actorIdInput,
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_ACTOR_INVALID',
    1,
    128,
  );
  assert(
    ACTOR_ID.test(actorId),
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_ACTOR_INVALID',
  );
  const occurred = iso(
    occurredAt,
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_OCCURRED_AT_INVALID',
  );
  const expires = iso(
    expiresAt,
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_EXPIRES_AT_INVALID',
  );
  assert(
    expires > occurred && expires - occurred <= AUTHORIZATION_WINDOW_MS,
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_WINDOW_INVALID',
  );
  assert(
    typeof evidenceSha256 === 'string' && SHA256.test(evidenceSha256),
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_EVIDENCE_INVALID',
  );
  const statement = text(
    statementInput,
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_STATEMENT_INVALID',
    30,
    4000,
  );
  const body = Object.freeze({
    schema: COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_SCHEMA,
    protocolVersion: COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_PROTOCOL_VERSION,
    version: COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_VERSION,
    action: 'authorize-eight-anchor-provider-calls-one-shot',
    actorClass: 'human',
    actorId,
    occurredAt,
    expiresAt,
    evidenceSha256,
    statement,
    sourcePlanSha256: plan.planSha256,
    sourceAdmissionBundle: sourceAdmissionSummary(admissionBundle),
    targetCampaignJobIds: Object.freeze(
      targets.map((target) => target.campaignJobId),
    ),
    targetAdmissionEntrySha256s: Object.freeze(
      targets.map((target) => target.admissionEntrySha256),
    ),
    targetProviderAdmissionSha256s: Object.freeze(
      targets.map((target) => target.providerAdmissionSha256),
    ),
    maximumAuthorizationRecords: 8,
    maximumProviderCallsPerAuthorization: 1,
    maximumProviderCallsTotal: 8,
    oneShotEach: true,
    providerAuthorizationGrantedForTargets: true,
    runtimeAdapterCompilationPerformed: false,
    providerExecutionPerformed: false,
    automaticExecutionGranted: false,
    candidateApprovalGranted: false,
    identityApprovalGranted: false,
    publicationGranted: false,
    runtimeActivationGranted: false,
    websiteActivationGranted: false,
    durableConsumptionLedgerRequiredBeforeExecution: true,
    authority: FALSE_AUTHORITY,
  });
  return Object.freeze({ ...body, reviewSha256: sha256Json(body) });
}

function parseReview(value, admissionBundle, compiledAt) {
  exactKeys(
    value,
    [
      'schema',
      'protocolVersion',
      'version',
      'action',
      'actorClass',
      'actorId',
      'occurredAt',
      'expiresAt',
      'evidenceSha256',
      'statement',
      'sourcePlanSha256',
      'sourceAdmissionBundle',
      'targetCampaignJobIds',
      'targetAdmissionEntrySha256s',
      'targetProviderAdmissionSha256s',
      'maximumAuthorizationRecords',
      'maximumProviderCallsPerAuthorization',
      'maximumProviderCallsTotal',
      'oneShotEach',
      'providerAuthorizationGrantedForTargets',
      'runtimeAdapterCompilationPerformed',
      'providerExecutionPerformed',
      'automaticExecutionGranted',
      'candidateApprovalGranted',
      'identityApprovalGranted',
      'publicationGranted',
      'runtimeActivationGranted',
      'websiteActivationGranted',
      'durableConsumptionLedgerRequiredBeforeExecution',
      'authority',
      'reviewSha256',
    ],
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_KEYS_INVALID',
  );
  assert(
    typeof value.reviewSha256 === 'string' && SHA256.test(value.reviewSha256),
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_HASH_INVALID',
  );
  const reviewBody = { ...value };
  delete reviewBody.reviewSha256;
  assert(
    sha256Json(reviewBody) === value.reviewSha256,
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_HASH_MISMATCH',
  );
  const plan = compileCouncilIdentityAnchorAuthorizationPlan();
  const targets = authorizationTargets(admissionBundle);
  const occurred = iso(
    value.occurredAt,
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_OCCURRED_AT_INVALID',
  );
  const expires = iso(
    value.expiresAt,
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_EXPIRES_AT_INVALID',
  );
  const compiled = iso(
    compiledAt,
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_COMPILED_AT_INVALID',
  );
  assert(
    expires > occurred &&
      expires - occurred <= AUTHORIZATION_WINDOW_MS &&
      compiled >= occurred &&
      compiled <= expires,
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_NOT_ACTIVE',
  );
  const sourceSummary = sourceAdmissionSummary(admissionBundle);
  exactKeys(
    value.sourceAdmissionBundle,
    Object.keys(sourceSummary),
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_SOURCE_KEYS_INVALID',
  );
  assert(
    value.schema === COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_SCHEMA &&
      value.protocolVersion ===
        COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_PROTOCOL_VERSION &&
      value.version === COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_VERSION &&
      value.action === 'authorize-eight-anchor-provider-calls-one-shot' &&
      value.actorClass === 'human' &&
      typeof value.actorId === 'string' &&
      ACTOR_ID.test(value.actorId) &&
      typeof value.evidenceSha256 === 'string' &&
      SHA256.test(value.evidenceSha256) &&
      typeof value.statement === 'string' &&
      value.statement.length >= 30 &&
      value.statement.length <= 4000 &&
      value.sourcePlanSha256 === plan.planSha256 &&
      canonical(value.sourceAdmissionBundle) === canonical(sourceSummary) &&
      Array.isArray(value.targetCampaignJobIds) &&
      value.targetCampaignJobIds.length === 8 &&
      value.targetCampaignJobIds.every(
        (jobId, index) => jobId === targets[index].campaignJobId,
      ) &&
      Array.isArray(value.targetAdmissionEntrySha256s) &&
      value.targetAdmissionEntrySha256s.length === 8 &&
      value.targetAdmissionEntrySha256s.every(
        (digestValue, index) =>
          digestValue === targets[index].admissionEntrySha256,
      ) &&
      Array.isArray(value.targetProviderAdmissionSha256s) &&
      value.targetProviderAdmissionSha256s.length === 8 &&
      value.targetProviderAdmissionSha256s.every(
        (digestValue, index) =>
          digestValue === targets[index].providerAdmissionSha256,
      ) &&
      value.maximumAuthorizationRecords === 8 &&
      value.maximumProviderCallsPerAuthorization === 1 &&
      value.maximumProviderCallsTotal === 8 &&
      value.oneShotEach === true &&
      value.providerAuthorizationGrantedForTargets === true &&
      value.runtimeAdapterCompilationPerformed === false &&
      value.providerExecutionPerformed === false &&
      value.automaticExecutionGranted === false &&
      value.candidateApprovalGranted === false &&
      value.identityApprovalGranted === false &&
      value.publicationGranted === false &&
      value.runtimeActivationGranted === false &&
      value.websiteActivationGranted === false &&
      value.durableConsumptionLedgerRequiredBeforeExecution === true,
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_INVALID',
  );
  exactFalseAuthority(
    value.authority,
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_REVIEW_AUTHORITY_INVALID',
  );
  return value;
}

function authorizationEvidenceSha256(admissionBundle, review, entry) {
  return sha256Bytes(
    [
      'evavo:council-anchor-authorization',
      admissionBundle.bundleSha256,
      review.reviewSha256,
      entry.entrySha256,
      entry.providerAdmission.providerAdmissionSha256,
      entry.campaignJobId,
    ].join(':'),
  );
}

function compileProviderAuthorization(admissionBundle, review, entry) {
  const compile = providerRuntimeModule.compileCharacterIdentityProviderAuthorization;
  const parse = providerRuntimeModule.parseCharacterIdentityProviderAuthorization;
  assert(
    typeof compile === 'function' && typeof parse === 'function',
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_PROVIDER_COMPILER_MISSING',
  );
  const evidenceSha256 = authorizationEvidenceSha256(
    admissionBundle,
    review,
    entry,
  );
  const authorization = compile({
    providerAdmission: entry.providerAdmission,
    actorId: review.actorId,
    occurredAt: review.occurredAt,
    expiresAt: review.expiresAt,
    evidenceSha256,
  });
  parse(authorization, entry.providerAdmission);
  assert(
    authorization?.characterId === entry.characterId &&
      authorization.setId === entry.setId &&
      authorization.continuityKey === entry.continuityKey &&
      authorization.jobId === entry.jobId &&
      authorization.admissionItemId ===
        entry.providerAdmission.admissionItemId &&
      authorization.providerAdmissionSha256 ===
        entry.providerAdmission.providerAdmissionSha256 &&
      authorization.maximumProviderCalls === 1 &&
      authorization.oneShot === true &&
      authorization.evidenceSha256 === evidenceSha256 &&
      Object.values(authorization.authority ?? {}).every(
        (authorityValue) => authorityValue === false,
      ),
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_PROVIDER_AUTHORIZATION_INVALID',
  );
  return Object.freeze({ authorization, evidenceSha256 });
}

function authorizationEntry(admissionBundle, review, admissionEntry) {
  const compiled = compileProviderAuthorization(
    admissionBundle,
    review,
    admissionEntry,
  );
  const body = Object.freeze({
    ordinal: admissionEntry.ordinal,
    campaignJobId: admissionEntry.campaignJobId,
    jobSha256: admissionEntry.jobSha256,
    admissionEntrySha256: admissionEntry.entrySha256,
    providerAdmissionSha256:
      admissionEntry.providerAdmission.providerAdmissionSha256,
    characterId: admissionEntry.characterId,
    setId: admissionEntry.setId,
    continuityKey: admissionEntry.continuityKey,
    jobId: admissionEntry.jobId,
    admissionItemId: admissionEntry.providerAdmission.admissionItemId,
    viewId: admissionEntry.viewId,
    status: 'provider-authorized-one-shot-not-adapted-not-executed',
    authorizationEvidenceSha256: compiled.evidenceSha256,
    providerAuthorization: compiled.authorization,
    runtimeAdapter: null,
    providerExecutionReceipt: null,
    consumption: Object.freeze({
      durableConsumptionLedgerEstablished: false,
      consumed: false,
      consumptionReceipt: null,
    }),
    authority: FALSE_AUTHORITY,
  });
  return Object.freeze({
    ...body,
    authorizationEntrySha256: sha256Json(body),
  });
}

export function compileCouncilIdentityAnchorAuthorizationBundle({
  admissionBundle: admissionBundleInput,
  review: reviewInput,
  compiledAt,
}) {
  const admissionBundle = validateAdmissionBundle(admissionBundleInput);
  const review = parseReview(reviewInput, admissionBundle, compiledAt);
  const authorizations = Object.freeze(
    admissionBundle.admissions.map((entry) =>
      authorizationEntry(admissionBundle, review, entry),
    ),
  );
  const body = Object.freeze({
    schema: COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_BUNDLE_SCHEMA,
    protocolVersion: COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_PROTOCOL_VERSION,
    version: COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_VERSION,
    status:
      'eight-anchor-provider-authorizations-compiled-not-adapted-not-executed',
    compiledAt,
    sourceAdmissionBundle: admissionBundle,
    review,
    counts: Object.freeze({
      providerAdmissionsBound: 8,
      providerAuthorizationsCompiled: authorizations.length,
      runtimeAdaptersCompiled: 0,
      providerExecutionsPerformed: 0,
      dependentAdmissionsCompiled: 0,
      candidateArtifactsMaterialized: 0,
      identitiesApproved: 0,
    }),
    authorizations,
    authorizationWindow: Object.freeze({
      occurredAt: review.occurredAt,
      expiresAt: review.expiresAt,
      maximumWindowHours: 24,
      sameWindowForAllEightAuthorizations: true,
    }),
    globalAnchorBarrier: Object.freeze({
      allEightAnchorsMustExecuteSuccessfullyBeforeAnyDependentAdmission: true,
      successfulAnchorExecutionReceiptCount: 0,
      dependentAdmissionCompilationAllowed: false,
      crossCharacterAnchorReuseAllowed: false,
      crossSetAnchorReuseAllowed: false,
    }),
    executionBoundary: Object.freeze({
      authorizationCompilationPerformsProviderExecution: false,
      totalMaximumProviderCalls: 8,
      maximumProviderCallsPerAuthorization: 1,
      oneShotEach: true,
      providerFallbackAllowed: false,
      automaticRetryAllowed: false,
      runtimeAdapterRequiredBeforeExecution: true,
      durableConsumptionLedgerEstablished: false,
      durableConsumptionLedgerRequiredBeforeExecution: true,
      implicitResumeAllowed: false,
      candidateApprovalByExecutionAllowed: false,
      identityApprovalByExecutionAllowed: false,
    }),
    nextGate:
      'compile one exact provider Runtime adapter for each still-active authorization and establish a durable one-shot consumption ledger before any provider call; this bundle itself performs no execution',
    authority: FALSE_AUTHORITY,
  });
  return Object.freeze({ ...body, bundleSha256: sha256Json(body) });
}

export function validateCouncilIdentityAnchorAuthorizationBundle(value) {
  exactKeys(
    value,
    [
      'schema',
      'protocolVersion',
      'version',
      'status',
      'compiledAt',
      'sourceAdmissionBundle',
      'review',
      'counts',
      'authorizations',
      'authorizationWindow',
      'globalAnchorBarrier',
      'executionBoundary',
      'nextGate',
      'authority',
      'bundleSha256',
    ],
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_BUNDLE_KEYS_INVALID',
  );
  assert(
    value.schema === COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_BUNDLE_SCHEMA &&
      value.protocolVersion ===
        COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_PROTOCOL_VERSION &&
      value.version === COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_VERSION &&
      value.status ===
        'eight-anchor-provider-authorizations-compiled-not-adapted-not-executed' &&
      typeof value.bundleSha256 === 'string' &&
      SHA256.test(value.bundleSha256),
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_BUNDLE_INVALID',
  );
  const body = { ...value };
  delete body.bundleSha256;
  assert(
    sha256Json(body) === value.bundleSha256,
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_BUNDLE_HASH_MISMATCH',
  );
  exactFalseAuthority(
    value.authority,
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_BUNDLE_AUTHORITY_INVALID',
  );
  const expected = compileCouncilIdentityAnchorAuthorizationBundle({
    admissionBundle: value.sourceAdmissionBundle,
    review: value.review,
    compiledAt: value.compiledAt,
  });
  assert(
    canonical(expected) === canonical(value),
    'COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_BUNDLE_RECOMPILE_MISMATCH',
  );
  return Object.freeze({
    valid: true,
    schema: value.schema,
    bundleSha256: value.bundleSha256,
    providerAdmissionCount: 8,
    providerAuthorizationCount: value.authorizations.length,
    maximumProviderCallsTotal: 8,
    runtimeAdapterCount: 0,
    providerExecutionCount: 0,
    identityApprovalCount: 0,
    durableConsumptionLedgerEstablished: false,
    runtimeActivation: false,
    websiteActivation: false,
  });
}

export function councilIdentityAnchorAuthorizationCapabilities() {
  const plan = compileCouncilIdentityAnchorAuthorizationPlan();
  return Object.freeze({
    schema: COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_CAPABILITIES_SCHEMA,
    protocolVersion: COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_PROTOCOL_VERSION,
    version: COUNCIL_IDENTITY_ANCHOR_AUTHORIZATION_VERSION,
    sourceAdmissionPlanSha256: plan.sourceAdmissionPlan.planSha256,
    campaignSha256: plan.sourceAdmissionPlan.campaignSha256,
    providerAdmissionCountRequired: 8,
    providerAuthorizationCount: 8,
    maximumProviderCallsPerAuthorization: 1,
    maximumProviderCallsTotal: 8,
    maximumAuthorizationWindowHours: 24,
    namedHumanReviewRequired: true,
    exactAdmissionBundleRequired: true,
    reviewTemplateRequiresAdmissionBundle: true,
    createOnlyBundleOutput: true,
    providerAuthorizationCompilationAvailable: true,
    runtimeAdapterCompilationAvailable: false,
    durableConsumptionLedgerEstablished: false,
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
