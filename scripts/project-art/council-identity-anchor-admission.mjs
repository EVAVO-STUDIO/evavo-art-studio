import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as candidateCampaignModule from './council-identity-candidate-campaign.mjs';
import * as providerRuntimeModule from './character-identity-provider-runtime.mjs';

export const COUNCIL_IDENTITY_ANCHOR_ADMISSION_PLAN_SCHEMA =
  'evavo.project-art-council-identity-anchor-admission-plan.v1';
export const COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_TEMPLATE_SCHEMA =
  'evavo.project-art-council-identity-anchor-admission-review-template.v1';
export const COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_SCHEMA =
  'evavo.project-art-council-identity-anchor-admission-review.v1';
export const COUNCIL_IDENTITY_ANCHOR_ADMISSION_BUNDLE_SCHEMA =
  'evavo.project-art-council-identity-anchor-admission-bundle.v1';
export const COUNCIL_IDENTITY_ANCHOR_ADMISSION_CAPABILITIES_SCHEMA =
  'evavo.project-art-council-identity-anchor-admission-capabilities.v1';
export const COUNCIL_IDENTITY_ANCHOR_ADMISSION_VERSION = '4.5.0';
export const COUNCIL_IDENTITY_ANCHOR_ADMISSION_PROTOCOL_VERSION =
  '2026-08-21.1';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COMPILER_PATH =
  'scripts/compile-project-art-council-identity-anchor-admission.mjs';
const PROVIDER_COMPILER_PATH =
  'scripts/compile-project-art-character-identity-provider-runtime.mjs';
const PROVIDER_RUNNER_PATH =
  'scripts/run-project-art-character-identity-provider.mjs';
const SHA256 = /^[a-f0-9]{64}$/u;
const ACTOR_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const REVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;
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

function ordinarySource(relativePath, maximumBytes = 2 * 1024 * 1024) {
  const absolute = path.resolve(ROOT, relativePath);
  const relative = path.relative(ROOT, absolute);
  assert(
    relative && !relative.startsWith('..') && !path.isAbsolute(relative),
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_SOURCE_PATH_ESCAPE',
  );
  const before = lstatSync(absolute, { throwIfNoEntry: false });
  assert(
    before?.isFile() &&
      !before.isSymbolicLink() &&
      before.nlink === 1 &&
      before.size > 1 &&
      before.size <= maximumBytes &&
      realpathSync(absolute) === absolute,
    `COUNCIL_IDENTITY_ANCHOR_ADMISSION_SOURCE_UNSAFE:${relativePath}`,
  );
  const bytes = readFileSync(absolute);
  const after = lstatSync(absolute);
  assert(
    ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(
      (key) => before[key] === after[key],
    ),
    `COUNCIL_IDENTITY_ANCHOR_ADMISSION_SOURCE_CHANGED:${relativePath}`,
  );
  return Object.freeze({
    path: relativePath,
    absolute,
    bytes,
    byteLength: bytes.byteLength,
    sha256: sha256Bytes(bytes),
  });
}

function ordinaryJson(relativePath, label) {
  const source = ordinarySource(relativePath);
  let value;
  try {
    value = JSON.parse(
      new TextDecoder('utf-8', { fatal: true })
        .decode(source.bytes)
        .replace(/^\uFEFF/u, ''),
    );
  } catch {
    throw new Error(`COUNCIL_IDENTITY_ANCHOR_ADMISSION_${label}_JSON_INVALID`);
  }
  return Object.freeze({ ...source, value });
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

function compileCandidateCampaign() {
  const compile = candidateCampaignModule.compileCouncilIdentityCandidateCampaign;
  assert(
    typeof compile === 'function',
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_CAMPAIGN_COMPILER_MISSING',
  );
  const campaign = compile();
  const validate = candidateCampaignModule.validateCouncilIdentityCandidateCampaign;
  if (typeof validate === 'function') validate(campaign);
  assert(
    campaign?.schema ===
      'evavo.project-art-council-identity-candidate-campaign.v1' &&
      typeof campaign.campaignSha256 === 'string' &&
      SHA256.test(campaign.campaignSha256) &&
      Array.isArray(campaign.jobs) &&
      campaign.jobs.length === 24,
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_CAMPAIGN_INVALID',
  );
  return campaign;
}

function expectedAnchorIds() {
  return Object.freeze(
    CHARACTER_ORDER.flatMap((characterId) =>
      SET_ORDER.map(
        (setId) => `${characterId}-${setId}-full-body-right`,
      ),
    ),
  );
}

function anchorJobs(campaign) {
  const anchors = campaign.jobs.filter(
    (job) => job.phaseId === 'anchor-generation',
  );
  const expected = expectedAnchorIds();
  assert(
    anchors.length === 8 &&
      anchors.every(
        (job, index) =>
          job.ordinal === index + 1 &&
          job.campaignJobId === expected[index] &&
          job.viewId === 'full-body-right' &&
          job.status === 'planned-not-admitted' &&
          job.dependency === null &&
          job.limits?.candidates === 1 &&
          job.limits?.providerCalls === 1 &&
          job.limits?.runtimeAttempts === 1 &&
          job.limits?.providerFallback === false &&
          job.limits?.automaticRetry === false &&
          job.selection?.allowFallback === false &&
          job.selection?.requireSeed === false &&
          job.selection?.seed === null &&
          Object.values(job.authority ?? {}).every((value) => value === false),
      ),
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_ANCHOR_MATRIX_INVALID',
  );
  return Object.freeze(anchors);
}

function sourceCampaignSummary(campaign) {
  return Object.freeze({
    schema: campaign.schema,
    version: campaign.version,
    campaignSha256: campaign.campaignSha256,
  });
}

function planAnchor(job) {
  return Object.freeze({
    ordinal: job.ordinal,
    campaignJobId: job.campaignJobId,
    jobSha256: job.jobSha256,
    characterId: job.characterId,
    requestPath: job.requestPath,
    setId: job.setId,
    continuityKey: job.continuityKey,
    jobId: job.jobId,
    admissionItemId: job.admissionItemId,
    viewId: job.viewId,
    targetPath: job.targetPath,
    promptSha256: job.promptSha256,
    selection: job.selection,
    status: 'review-required-before-admission-compilation',
    providerAuthorizationRequiredAfterAdmission: true,
    providerExecutionAllowed: false,
    authority: FALSE_AUTHORITY,
  });
}

export function compileCouncilIdentityAnchorAdmissionPlan() {
  const campaign = compileCandidateCampaign();
  const anchors = anchorJobs(campaign).map(planAnchor);
  const body = Object.freeze({
    schema: COUNCIL_IDENTITY_ANCHOR_ADMISSION_PLAN_SCHEMA,
    protocolVersion: COUNCIL_IDENTITY_ANCHOR_ADMISSION_PROTOCOL_VERSION,
    version: COUNCIL_IDENTITY_ANCHOR_ADMISSION_VERSION,
    status: 'human-review-required-before-anchor-admission-compilation',
    sourceCampaign: sourceCampaignSummary(campaign),
    counts: Object.freeze({
      characters: 2,
      candidateSets: 8,
      anchorJobs: 8,
      dependentJobsExcluded: 16,
      providerAdmissionsCompiled: 0,
      providerAuthorizationsCompiled: 0,
      providerExecutionsPerformed: 0,
    }),
    anchorCampaignJobIds: expectedAnchorIds(),
    anchors: Object.freeze(anchors),
    globalAnchorBarrier: Object.freeze({
      allEightAnchorsMustExecuteSuccessfullyBeforeAnyDependentAdmission: true,
      dependentAdmissionCompilationAllowedByThisPlan: false,
      crossCharacterAnchorReuseAllowed: false,
      crossSetAnchorReuseAllowed: false,
    }),
    reviewPolicy: Object.freeze({
      namedHumanRequired: true,
      maximumReviewWindowHours: 24,
      exactEightAnchorDecisionRequired: true,
      oneShotReviewDeclared: true,
      durableReplayLedgerRequiredForExecution: true,
      providerAuthorizationGrantedByReview: false,
      providerExecutionGrantedByReview: false,
      identityApprovalGrantedByReview: false,
    }),
    compiler: Object.freeze({
      path: COMPILER_PATH,
      providerAdmissionCompiler: PROVIDER_COMPILER_PATH,
      providerRunner: PROVIDER_RUNNER_PATH,
      outputPolicy: 'single-create-only-json-bundle',
    }),
    nextGate:
      'obtain a named-human, time-bounded review decision for all eight full-body-right jobs, then compile exactly eight provider admissions; provider authorization and execution remain separate later gates',
    authority: FALSE_AUTHORITY,
  });
  return Object.freeze({ ...body, planSha256: sha256Json(body) });
}

export function createCouncilIdentityAnchorAdmissionReviewTemplate() {
  const plan = compileCouncilIdentityAnchorAdmissionPlan();
  const body = Object.freeze({
    schema: COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_TEMPLATE_SCHEMA,
    protocolVersion: COUNCIL_IDENTITY_ANCHOR_ADMISSION_PROTOCOL_VERSION,
    version: COUNCIL_IDENTITY_ANCHOR_ADMISSION_VERSION,
    sourcePlanSha256: plan.planSha256,
    campaignSha256: plan.sourceCampaign.campaignSha256,
    action: 'approve-eight-anchor-admission-compilations-only',
    requiredHumanFields: Object.freeze({
      actorId: '<named-human-actor-id>',
      occurredAt: '<iso-8601>',
      expiresAt: '<iso-8601-no-more-than-24-hours-after-occurred-at>',
      evidenceSha256: '<lowercase-sha256>',
      statement:
        '<human statement confirming review of all eight anchor jobs and admission compilation only>',
    }),
    anchorCampaignJobIds: plan.anchorCampaignJobIds,
    constraints: Object.freeze({
      exactAnchorCount: 8,
      oneShot: true,
      providerAuthorizationGranted: false,
      providerExecutionGranted: false,
      candidateApprovalGranted: false,
      identityApprovalGranted: false,
      publicationGranted: false,
      runtimeActivationGranted: false,
      websiteActivationGranted: false,
    }),
    authority: FALSE_AUTHORITY,
  });
  return Object.freeze({ ...body, templateSha256: sha256Json(body) });
}

export function createCouncilIdentityAnchorAdmissionReview(input) {
  exactKeys(
    input,
    ['actorId', 'occurredAt', 'expiresAt', 'evidenceSha256', 'statement'],
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_INPUT_KEYS_INVALID',
  );
  const plan = compileCouncilIdentityAnchorAdmissionPlan();
  const actorId = text(
    input.actorId,
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_ACTOR_INVALID',
    1,
    128,
  );
  assert(
    ACTOR_ID.test(actorId),
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_ACTOR_INVALID',
  );
  const occurred = iso(
    input.occurredAt,
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_OCCURRED_AT_INVALID',
  );
  const expires = iso(
    input.expiresAt,
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_EXPIRES_AT_INVALID',
  );
  assert(
    expires > occurred && expires - occurred <= REVIEW_WINDOW_MS,
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_WINDOW_INVALID',
  );
  assert(
    typeof input.evidenceSha256 === 'string' && SHA256.test(input.evidenceSha256),
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_EVIDENCE_INVALID',
  );
  const statement = text(
    input.statement,
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_STATEMENT_INVALID',
    20,
    4000,
  );
  const body = Object.freeze({
    schema: COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_SCHEMA,
    protocolVersion: COUNCIL_IDENTITY_ANCHOR_ADMISSION_PROTOCOL_VERSION,
    version: COUNCIL_IDENTITY_ANCHOR_ADMISSION_VERSION,
    action: 'approve-eight-anchor-admission-compilations-only',
    actorClass: 'human',
    actorId,
    occurredAt: input.occurredAt,
    expiresAt: input.expiresAt,
    evidenceSha256: input.evidenceSha256,
    statement,
    sourcePlanSha256: plan.planSha256,
    campaignSha256: plan.sourceCampaign.campaignSha256,
    anchorCampaignJobIds: plan.anchorCampaignJobIds,
    maximumAdmissionRecords: 8,
    oneShot: true,
    providerAuthorizationGranted: false,
    providerExecutionGranted: false,
    candidateApprovalGranted: false,
    identityApprovalGranted: false,
    publicationGranted: false,
    runtimeActivationGranted: false,
    websiteActivationGranted: false,
    authority: FALSE_AUTHORITY,
  });
  return Object.freeze({ ...body, reviewSha256: sha256Json(body) });
}

function parseReview(value, compiledAt) {
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
      'campaignSha256',
      'anchorCampaignJobIds',
      'maximumAdmissionRecords',
      'oneShot',
      'providerAuthorizationGranted',
      'providerExecutionGranted',
      'candidateApprovalGranted',
      'identityApprovalGranted',
      'publicationGranted',
      'runtimeActivationGranted',
      'websiteActivationGranted',
      'authority',
      'reviewSha256',
    ],
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_KEYS_INVALID',
  );
  const declared = value.reviewSha256;
  assert(
    typeof declared === 'string' && SHA256.test(declared),
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_HASH_INVALID',
  );
  const body = { ...value };
  delete body.reviewSha256;
  assert(
    sha256Json(body) === declared,
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_HASH_MISMATCH',
  );
  const plan = compileCouncilIdentityAnchorAdmissionPlan();
  const occurred = iso(
    value.occurredAt,
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_OCCURRED_AT_INVALID',
  );
  const expires = iso(
    value.expiresAt,
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_EXPIRES_AT_INVALID',
  );
  const compiled = iso(
    compiledAt,
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_COMPILED_AT_INVALID',
  );
  assert(
    expires > occurred &&
      expires - occurred <= REVIEW_WINDOW_MS &&
      compiled >= occurred &&
      compiled <= expires,
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_NOT_ACTIVE',
  );
  assert(
    value.schema === COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_SCHEMA &&
      value.protocolVersion ===
        COUNCIL_IDENTITY_ANCHOR_ADMISSION_PROTOCOL_VERSION &&
      value.version === COUNCIL_IDENTITY_ANCHOR_ADMISSION_VERSION &&
      value.action === 'approve-eight-anchor-admission-compilations-only' &&
      value.actorClass === 'human' &&
      typeof value.actorId === 'string' &&
      ACTOR_ID.test(value.actorId) &&
      typeof value.evidenceSha256 === 'string' &&
      SHA256.test(value.evidenceSha256) &&
      typeof value.statement === 'string' &&
      value.statement.length >= 20 &&
      value.statement.length <= 4000 &&
      value.sourcePlanSha256 === plan.planSha256 &&
      value.campaignSha256 === plan.sourceCampaign.campaignSha256 &&
      Array.isArray(value.anchorCampaignJobIds) &&
      value.anchorCampaignJobIds.length === 8 &&
      value.anchorCampaignJobIds.every(
        (jobId, index) => jobId === plan.anchorCampaignJobIds[index],
      ) &&
      value.maximumAdmissionRecords === 8 &&
      value.oneShot === true &&
      value.providerAuthorizationGranted === false &&
      value.providerExecutionGranted === false &&
      value.candidateApprovalGranted === false &&
      value.identityApprovalGranted === false &&
      value.publicationGranted === false &&
      value.runtimeActivationGranted === false &&
      value.websiteActivationGranted === false,
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_INVALID',
  );
  exactFalseAuthority(
    value.authority,
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_REVIEW_AUTHORITY_INVALID',
  );
  return value;
}

function requestForJob(job) {
  const source = ordinaryJson(job.requestPath, 'IDENTITY_REQUEST');
  assert(
    source.value?.character?.id === job.characterId &&
      source.value?.schema === 'evavo.character-identity-master-request.v1',
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_IDENTITY_REQUEST_MISMATCH',
  );
  return source;
}

function admissionEvidenceSha256(review, job) {
  return sha256Bytes(
    `evavo:council-anchor-admission:${review.reviewSha256}:${job.campaignJobId}:${job.jobSha256}`,
  );
}

function compileProviderAdmission(job, review) {
  const compile = providerRuntimeModule.compileCharacterIdentityProviderAdmission;
  assert(
    typeof compile === 'function',
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_PROVIDER_COMPILER_MISSING',
  );
  const request = requestForJob(job);
  const evidenceSha256 = admissionEvidenceSha256(review, job);
  const admission = compile({
    identityRequest: request.value,
    jobId: job.jobId,
    selection: job.selection,
    actorId: review.actorId,
    occurredAt: review.occurredAt,
    evidenceSha256,
    anchorExecutionReceipt: null,
  });
  assert(
    admission?.characterId === job.characterId &&
      admission.setId === job.setId &&
      admission.jobId === job.jobId &&
      admission.viewId === 'full-body-right' &&
      admission.identityAnchor === null &&
      admission.limits?.candidates === 1 &&
      admission.limits?.providerCalls === 1 &&
      admission.limits?.providerFallback === false &&
      admission.limits?.runtimeAttempts === 1 &&
      admission.evidenceSha256 === evidenceSha256 &&
      Object.values(admission.authority ?? {}).every((value) => value === false),
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_PROVIDER_ADMISSION_INVALID',
  );
  return Object.freeze({ request, admission, evidenceSha256 });
}

function bundleEntry(job, review) {
  const compiled = compileProviderAdmission(job, review);
  const body = Object.freeze({
    ordinal: job.ordinal,
    campaignJobId: job.campaignJobId,
    jobSha256: job.jobSha256,
    characterId: job.characterId,
    requestPath: job.requestPath,
    requestFileSha256: compiled.request.sha256,
    setId: job.setId,
    continuityKey: job.continuityKey,
    jobId: job.jobId,
    viewId: job.viewId,
    status: 'provider-admitted-not-authorized',
    admissionEvidenceSha256: compiled.evidenceSha256,
    providerAdmission: compiled.admission,
    providerAuthorization: null,
    providerExecutionReceipt: null,
    authority: FALSE_AUTHORITY,
  });
  return Object.freeze({ ...body, entrySha256: sha256Json(body) });
}

export function compileCouncilIdentityAnchorAdmissionBundle({ review, compiledAt }) {
  const parsedReview = parseReview(review, compiledAt);
  const campaign = compileCandidateCampaign();
  const anchors = anchorJobs(campaign);
  const admissions = Object.freeze(
    anchors.map((job) => bundleEntry(job, parsedReview)),
  );
  const body = Object.freeze({
    schema: COUNCIL_IDENTITY_ANCHOR_ADMISSION_BUNDLE_SCHEMA,
    protocolVersion: COUNCIL_IDENTITY_ANCHOR_ADMISSION_PROTOCOL_VERSION,
    version: COUNCIL_IDENTITY_ANCHOR_ADMISSION_VERSION,
    status: 'eight-anchor-provider-admissions-compiled-not-authorized',
    compiledAt,
    sourceCampaign: sourceCampaignSummary(campaign),
    review: parsedReview,
    counts: Object.freeze({
      anchorJobs: 8,
      providerAdmissionsCompiled: admissions.length,
      providerAuthorizationsCompiled: 0,
      providerExecutionsPerformed: 0,
      dependentAdmissionsCompiled: 0,
      candidateArtifactsMaterialized: 0,
      identitiesApproved: 0,
    }),
    admissions,
    globalAnchorBarrier: Object.freeze({
      allEightAnchorsMustExecuteSuccessfullyBeforeAnyDependentAdmission: true,
      successfulAnchorExecutionReceiptCount: 0,
      dependentAdmissionCompilationAllowed: false,
      crossCharacterAnchorReuseAllowed: false,
      crossSetAnchorReuseAllowed: false,
    }),
    replayBoundary: Object.freeze({
      humanReviewDeclaresOneShotUse: true,
      outputIsCreateOnly: true,
      durableReviewConsumptionLedgerEstablished: false,
      providerAuthorizationRequiresSeparateDurableOneShotControl: true,
    }),
    nextGate:
      'review the exact eight provider admissions, then compile separate time-bounded one-shot provider authorizations; no provider execution may begin through this bundle',
    authority: FALSE_AUTHORITY,
  });
  return Object.freeze({ ...body, bundleSha256: sha256Json(body) });
}

export function validateCouncilIdentityAnchorAdmissionBundle(value) {
  exactKeys(
    value,
    [
      'schema',
      'protocolVersion',
      'version',
      'status',
      'compiledAt',
      'sourceCampaign',
      'review',
      'counts',
      'admissions',
      'globalAnchorBarrier',
      'replayBoundary',
      'nextGate',
      'authority',
      'bundleSha256',
    ],
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_BUNDLE_KEYS_INVALID',
  );
  assert(
    value.schema === COUNCIL_IDENTITY_ANCHOR_ADMISSION_BUNDLE_SCHEMA &&
      value.protocolVersion ===
        COUNCIL_IDENTITY_ANCHOR_ADMISSION_PROTOCOL_VERSION &&
      value.version === COUNCIL_IDENTITY_ANCHOR_ADMISSION_VERSION &&
      value.status ===
        'eight-anchor-provider-admissions-compiled-not-authorized' &&
      typeof value.bundleSha256 === 'string' &&
      SHA256.test(value.bundleSha256),
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_BUNDLE_INVALID',
  );
  const body = { ...value };
  delete body.bundleSha256;
  assert(
    sha256Json(body) === value.bundleSha256,
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_BUNDLE_HASH_MISMATCH',
  );
  exactFalseAuthority(
    value.authority,
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_BUNDLE_AUTHORITY_INVALID',
  );
  const expected = compileCouncilIdentityAnchorAdmissionBundle({
    review: value.review,
    compiledAt: value.compiledAt,
  });
  assert(
    canonical(expected) === canonical(value),
    'COUNCIL_IDENTITY_ANCHOR_ADMISSION_BUNDLE_RECOMPILE_MISMATCH',
  );
  return Object.freeze({
    valid: true,
    schema: value.schema,
    bundleSha256: value.bundleSha256,
    anchorAdmissionCount: value.admissions.length,
    providerAuthorizationCount: 0,
    providerExecutionCount: 0,
    identityApprovalCount: 0,
    runtimeActivation: false,
    websiteActivation: false,
  });
}

export function councilIdentityAnchorAdmissionCapabilities() {
  const plan = compileCouncilIdentityAnchorAdmissionPlan();
  return Object.freeze({
    schema: COUNCIL_IDENTITY_ANCHOR_ADMISSION_CAPABILITIES_SCHEMA,
    protocolVersion: COUNCIL_IDENTITY_ANCHOR_ADMISSION_PROTOCOL_VERSION,
    version: COUNCIL_IDENTITY_ANCHOR_ADMISSION_VERSION,
    campaignSha256: plan.sourceCampaign.campaignSha256,
    anchorAdmissionCount: 8,
    dependentAdmissionCount: 0,
    namedHumanReviewRequired: true,
    maximumReviewWindowHours: 24,
    createOnlyBundleOutput: true,
    sameCharacterSameSetAnchorBarrierRequired: true,
    providerAdmissionCompilationAvailable: true,
    providerAuthorizationCompilationAvailable: false,
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
