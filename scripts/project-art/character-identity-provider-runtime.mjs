import path from 'node:path';
import { lstat, mkdir } from 'node:fs/promises';

import { LocalArtifactStore } from '../../packages/artifacts/dist/index.js';
import {
  PROVIDER_PROTOCOL_VERSION,
  compileProviderCandidateRuntimeContract,
  compileProviderExecutionRoutingPlan,
  providerRequestSha256,
  validateProviderCandidateRequest,
} from '../../packages/providers/dist/index.js';
import {
  LocalRuntimeRepository,
  RuntimeWorker,
  normalizeRuntimeJobSubmission,
} from '../../packages/runtime/dist/index.js';
import {
  createProviderHandlers,
  createProviderRegistryFromEnvironment,
  providerWorkerCapabilities,
  providerWorkerCapabilityProfiles,
  restrictProviderRegistry,
} from '../../apps/worker/dist/provider-handlers.js';

import { compileIdentityMasterPlan } from '../character-identity-master-plan.mjs';
import { compileIdentityBootstrapAdmission } from '../character-identity-bootstrap-admission.mjs';
import {
  compileAvatarFinalPassProviderRuntimeOutcome,
  validateAvatarFinalPassCompiledProviderRuntimeContract,
} from './avatar-final-pass-provider-runtime-dispatch.mjs';
import {
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
  AVATAR_FINAL_PASS_PROVIDER_RUNTIME_PROTOCOL_VERSION,
  GENERIC_PROVIDER_PROTOCOL_VERSION,
  RUNTIME_DISPATCH_AUTHORITY_KEYS,
} from './avatar-final-pass-provider-runtime-constants.mjs';
import {
  artifactId,
  assert,
  boundedText,
  canonicalJson,
  canonicalPath,
  createAuthority,
  deepFreeze,
  digest,
  exactKeys,
  identifier,
  isRecord,
  sha256Document,
  sha256Text,
  snapshotJsonValue,
  timestamp,
  verifySelfHash,
} from './avatar-final-pass-provider-runtime-common.mjs';

export const CHARACTER_IDENTITY_PROVIDER_ADMISSION_SCHEMA =
  'evavo.character-identity-provider-admission.v1';
export const CHARACTER_IDENTITY_PROVIDER_AUTHORIZATION_SCHEMA =
  'evavo.character-identity-provider-authorization.v1';
export const CHARACTER_IDENTITY_PROVIDER_RUNTIME_ADAPTER_SCHEMA =
  'evavo.character-identity-provider-runtime-adapter.v1';
export const CHARACTER_IDENTITY_PROVIDER_EXECUTION_SCHEMA =
  'evavo.character-identity-provider-execution.v1';
export const CHARACTER_IDENTITY_PROVIDER_PROTOCOL_VERSION = '2026-08-19.1';
export const CHARACTER_IDENTITY_PROVIDER_EXECUTION_CAPABILITY =
  'character-identity.execution-authorized';

const MAXIMUM_AUTHORIZATION_MS = 24 * 60 * 60 * 1000;
const SET_ANCHOR_VIEW_ID = 'full-body-right';
const DEPENDENT_VIEW_IDS = Object.freeze(['full-body-left', 'neutral-bust']);
const COUNCIL_CHARACTER_IDS = Object.freeze([
  'council-critic',
  'council-open-reviewer',
]);

function falseAuthority() {
  return Object.freeze({
    providerExecution: false,
    candidateMaterialization: false,
    deterministicQa: false,
    creativeReview: false,
    candidateApproval: false,
    identityApproval: false,
    animationProduction: false,
    candidatePromotion: false,
    runtimeAsset: false,
    targetRepositoryMutation: false,
    gitMutation: false,
    publication: false,
    runtimeActivation: false,
    websiteActivation: false,
    deployment: false,
    forcePush: false,
  });
}

function normalizedAbsolutePath(value, label) {
  assert(
    typeof value === 'string' && value.length >= 1 && !value.includes('\0'),
    'CHARACTER_IDENTITY_PROVIDER_PATH_INVALID',
    `${label} is invalid.`,
  );
  const resolved = path.resolve(value);
  assert(
    resolved === value,
    'CHARACTER_IDENTITY_PROVIDER_PATH_INVALID',
    `${label} must be absolute and normalized.`,
  );
  return resolved;
}

async function realDirectory(value, label, create = false) {
  const root = normalizedAbsolutePath(value, label);
  if (create) await mkdir(root, { recursive: true, mode: 0o700 });
  const state = await lstat(root);
  assert(
    state.isDirectory() && !state.isSymbolicLink(),
    'CHARACTER_IDENTITY_PROVIDER_PATH_INVALID',
    `${label} must be a real directory.`,
  );
  return root;
}

function parseCouncilIdentityRequest(input) {
  const request = deepFreeze(snapshotJsonValue(input, 'character identity request'));
  const plan = compileIdentityMasterPlan(request);
  const bootstrap = compileIdentityBootstrapAdmission(plan);
  assert(
    COUNCIL_CHARACTER_IDS.includes(plan.character.id),
    'CHARACTER_IDENTITY_PROVIDER_CHARACTER_INVALID',
    'This runtime is currently admitted only for the two missing Council identity masters.',
  );
  assert(
    plan.candidateSetCount === 4 &&
      plan.viewCount === 3 &&
      plan.totalJobs === 12 &&
      plan.character.id === bootstrap.character.id &&
      bootstrap.requestCount === 12,
    'CHARACTER_IDENTITY_PROVIDER_BOOTSTRAP_DRIFT',
  );
  return Object.freeze({ request, plan, bootstrap });
}

function selectedBootstrapJob(bootstrap, jobIdInput) {
  const jobId = identifier(jobIdInput, 'jobId');
  const job = bootstrap.requests.find((entry) => entry.jobId === jobId);
  assert(
    job,
    'CHARACTER_IDENTITY_PROVIDER_JOB_UNKNOWN',
    `${jobId} is not an admitted identity-bootstrap job.`,
  );
  assert(
    job.operation === 'generate' &&
      job.providerExecution === false &&
      job.providerAuthorizationRequired === true &&
      job.identityBootstrapOnly === true &&
      job.runtimeAsset === false &&
      job.animationFamily === false &&
      job.approvalByGeneration === false &&
      job.promotion === false &&
      job.publication === false,
    'CHARACTER_IDENTITY_PROVIDER_JOB_AUTHORITY_DRIFT',
  );
  assert(
    job.dimensions?.width === 1024 && job.dimensions?.height === 1536,
    'CHARACTER_IDENTITY_PROVIDER_CANVAS_DRIFT',
  );
  assert(
    [SET_ANCHOR_VIEW_ID, ...DEPENDENT_VIEW_IDS].includes(job.viewId),
    'CHARACTER_IDENTITY_PROVIDER_VIEW_INVALID',
  );
  return job;
}

function parseSelection(input) {
  const selection = snapshotJsonValue(input, 'provider selection');
  exactKeys(
    selection,
    [
      'preferredAdapterId',
      'preferredModel',
      'allowedAdapterIds',
      'allowFallback',
      'requireSeed',
      'seed',
    ],
    'provider selection',
    'CHARACTER_IDENTITY_PROVIDER_SELECTION_KEYS_INVALID',
  );
  const preferredAdapterId = identifier(
    selection.preferredAdapterId,
    'provider selection.preferredAdapterId',
  );
  const preferredModel = identifier(
    selection.preferredModel,
    'provider selection.preferredModel',
  );
  assert(
    Array.isArray(selection.allowedAdapterIds) &&
      selection.allowedAdapterIds.length === 1 &&
      selection.allowedAdapterIds[0] === preferredAdapterId &&
      selection.allowFallback === false &&
      typeof selection.requireSeed === 'boolean',
    'CHARACTER_IDENTITY_PROVIDER_SELECTION_INVALID',
    'Identity generation requires one exact adapter, one model and no provider fallback.',
  );
  if (selection.requireSeed) {
    assert(
      Number.isSafeInteger(selection.seed) &&
        selection.seed >= 0 &&
        selection.seed <= 0xffffffff,
      'CHARACTER_IDENTITY_PROVIDER_SEED_REQUIRED',
    );
  } else {
    assert(
      selection.seed === null,
      'CHARACTER_IDENTITY_PROVIDER_SEED_INVALID',
    );
  }
  return Object.freeze({
    preferredAdapterId,
    preferredModel,
    allowedAdapterIds: Object.freeze([preferredAdapterId]),
    allowFallback: false,
    requireSeed: selection.requireSeed,
    seed: selection.seed,
  });
}

function parseAnchorReceipt(input, expected) {
  if (expected.viewId === SET_ANCHOR_VIEW_ID) {
    assert(
      input === null,
      'CHARACTER_IDENTITY_PROVIDER_ANCHOR_UNEXPECTED',
      'The set anchor must be generated without an identity reference.',
    );
    return null;
  }
  assert(
    DEPENDENT_VIEW_IDS.includes(expected.viewId) && isRecord(input),
    'CHARACTER_IDENTITY_PROVIDER_ANCHOR_REQUIRED',
    'Dependent identity views require the exact same-set full-body-right execution receipt.',
  );
  const receipt = verifySelfHash(
    snapshotJsonValue(input, 'identity anchor execution receipt'),
    'executionSha256',
    'identity anchor execution receipt',
  );
  assert(
    receipt.schema === CHARACTER_IDENTITY_PROVIDER_EXECUTION_SCHEMA &&
      receipt.protocolVersion === CHARACTER_IDENTITY_PROVIDER_PROTOCOL_VERSION &&
      receipt.status === 'succeeded' &&
      receipt.characterId === expected.characterId &&
      receipt.setId === expected.setId &&
      receipt.continuityKey === expected.continuityKey &&
      receipt.viewId === SET_ANCHOR_VIEW_ID &&
      receipt.provider?.providerCallCount === 1 &&
      receipt.provider?.providerCallCountVerified === true &&
      receipt.effects?.candidateArtifactCreated === true &&
      receipt.effects?.candidateApprovalPerformed === false &&
      receipt.effects?.identityApprovalPerformed === false &&
      Object.values(receipt.authority ?? {}).every((value) => value === false),
    'CHARACTER_IDENTITY_PROVIDER_ANCHOR_RECEIPT_INVALID',
  );
  const candidate = receipt.artifacts?.candidate;
  assert(
    isRecord(candidate) &&
      typeof candidate.artifactId === 'string' &&
      /^artifact_[a-f0-9]{64}$/u.test(candidate.artifactId) &&
      candidate.storageClass === 'intermediate' &&
      candidate.artifactRole === 'provider-candidate' &&
      candidate.approvalState === 'unapproved',
    'CHARACTER_IDENTITY_PROVIDER_ANCHOR_ARTIFACT_INVALID',
  );
  return Object.freeze({
    sourceJobId: receipt.jobId,
    sourceViewId: receipt.viewId,
    executionSha256: receipt.executionSha256,
    candidateArtifactId: candidate.artifactId,
    candidateContentHash: digest(
      candidate.contentHash,
      'identity anchor candidate.contentHash',
    ),
    evidenceArtifactId: artifactId(
      receipt.artifacts.evidence.artifactId,
      'identity anchor evidence.artifactId',
    ),
  });
}

export function compileCharacterIdentityProviderAdmission({
  identityRequest,
  jobId,
  selection,
  actorId,
  occurredAt,
  evidenceSha256,
  anchorExecutionReceipt = null,
}) {
  const source = parseCouncilIdentityRequest(identityRequest);
  const job = selectedBootstrapJob(source.bootstrap, jobId);
  const parsedSelection = parseSelection(selection);
  timestamp(occurredAt, 'provider admission.occurredAt');
  const actor = boundedText(actorId, 'provider admission.actorId', 1, 256);
  const evidence = digest(evidenceSha256, 'provider admission.evidenceSha256');
  const anchor = parseAnchorReceipt(anchorExecutionReceipt, {
    characterId: job.characterId,
    setId: job.setId,
    continuityKey: job.continuityKey,
    viewId: job.viewId,
  });
  const body = {
    schema: CHARACTER_IDENTITY_PROVIDER_ADMISSION_SCHEMA,
    protocolVersion: CHARACTER_IDENTITY_PROVIDER_PROTOCOL_VERSION,
    action: 'admit-character-identity-provider-job',
    actorClass: 'human',
    actorId: actor,
    occurredAt,
    evidenceSha256: evidence,
    sourceIdentityRequestSha256: source.plan.requestSha256,
    sourceIdentityMasterPlanSha256: source.plan.planSha256,
    sourceBootstrapAdmissionSha256: source.bootstrap.admissionPlanSha256,
    characterId: job.characterId,
    setId: job.setId,
    continuityKey: job.continuityKey,
    jobId: job.jobId,
    admissionItemId: job.admissionItemId,
    viewId: job.viewId,
    targetPath: job.targetPath,
    selection: parsedSelection,
    identityAnchor: anchor,
    limits: Object.freeze({
      candidates: 1,
      providerCalls: 1,
      providerFallback: false,
      runtimeAttempts: 1,
    }),
    authority: falseAuthority(),
  };
  return deepFreeze({
    ...body,
    providerAdmissionSha256: sha256Document(body),
  });
}

function parseProviderAdmission(input, source) {
  const admission = verifySelfHash(
    snapshotJsonValue(input, 'character identity provider admission'),
    'providerAdmissionSha256',
    'character identity provider admission',
  );
  assert(
    admission.schema === CHARACTER_IDENTITY_PROVIDER_ADMISSION_SCHEMA &&
      admission.protocolVersion === CHARACTER_IDENTITY_PROVIDER_PROTOCOL_VERSION &&
      admission.action === 'admit-character-identity-provider-job' &&
      admission.actorClass === 'human' &&
      admission.sourceIdentityRequestSha256 === source.plan.requestSha256 &&
      admission.sourceIdentityMasterPlanSha256 === source.plan.planSha256 &&
      admission.sourceBootstrapAdmissionSha256 === source.bootstrap.admissionPlanSha256 &&
      Object.values(admission.authority ?? {}).every((value) => value === false),
    'CHARACTER_IDENTITY_PROVIDER_ADMISSION_INVALID',
  );
  const expected = compileCharacterIdentityProviderAdmission({
    identityRequest: source.request,
    jobId: admission.jobId,
    selection: admission.selection,
    actorId: admission.actorId,
    occurredAt: admission.occurredAt,
    evidenceSha256: admission.evidenceSha256,
    anchorExecutionReceipt: admission.identityAnchor === null ? null : input.__anchorReceipt,
  });
  // Dependent admissions are normally parsed from persisted JSON and therefore do not
  // carry their source receipt inline. Validate their bound summary explicitly instead
  // of requiring the receipt to remain embedded in the durable admission document.
  if (admission.identityAnchor === null) {
    assert(
      canonicalJson(expected) === canonicalJson(admission),
      'CHARACTER_IDENTITY_PROVIDER_ADMISSION_MISMATCH',
    );
  } else {
    const job = selectedBootstrapJob(source.bootstrap, admission.jobId);
    assert(
      DEPENDENT_VIEW_IDS.includes(job.viewId) &&
        admission.characterId === job.characterId &&
        admission.setId === job.setId &&
        admission.continuityKey === job.continuityKey &&
        admission.admissionItemId === job.admissionItemId &&
        admission.viewId === job.viewId &&
        admission.targetPath === job.targetPath &&
        admission.identityAnchor.sourceViewId === SET_ANCHOR_VIEW_ID &&
        /^artifact_[a-f0-9]{64}$/u.test(admission.identityAnchor.candidateArtifactId) &&
        /^artifact_[a-f0-9]{64}$/u.test(admission.identityAnchor.evidenceArtifactId) &&
        /^[a-f0-9]{64}$/u.test(admission.identityAnchor.executionSha256) &&
        admission.limits?.candidates === 1 &&
        admission.limits?.providerCalls === 1 &&
        admission.limits?.providerFallback === false &&
        admission.limits?.runtimeAttempts === 1,
      'CHARACTER_IDENTITY_PROVIDER_ADMISSION_MISMATCH',
    );
  }
  return admission;
}

export function compileCharacterIdentityProviderAuthorization({
  providerAdmission,
  actorId,
  occurredAt,
  expiresAt,
  evidenceSha256,
}) {
  const admission = verifySelfHash(
    snapshotJsonValue(providerAdmission, 'provider admission'),
    'providerAdmissionSha256',
    'provider admission',
  );
  timestamp(occurredAt, 'provider authorization.occurredAt');
  timestamp(expiresAt, 'provider authorization.expiresAt');
  const occurred = Date.parse(occurredAt);
  const expires = Date.parse(expiresAt);
  assert(
    expires > occurred && expires - occurred <= MAXIMUM_AUTHORIZATION_MS,
    'CHARACTER_IDENTITY_PROVIDER_AUTHORIZATION_WINDOW_INVALID',
    'Provider authorization must expire within 24 hours.',
  );
  const body = {
    schema: CHARACTER_IDENTITY_PROVIDER_AUTHORIZATION_SCHEMA,
    protocolVersion: CHARACTER_IDENTITY_PROVIDER_PROTOCOL_VERSION,
    action: 'run-character-identity-provider-once',
    actorClass: 'human',
    actorId: boundedText(actorId, 'provider authorization.actorId', 1, 256),
    occurredAt,
    expiresAt,
    evidenceSha256: digest(
      evidenceSha256,
      'provider authorization.evidenceSha256',
    ),
    characterId: admission.characterId,
    setId: admission.setId,
    continuityKey: admission.continuityKey,
    jobId: admission.jobId,
    admissionItemId: admission.admissionItemId,
    providerAdmissionSha256: admission.providerAdmissionSha256,
    maximumProviderCalls: 1,
    oneShot: true,
    authority: falseAuthority(),
  };
  return deepFreeze({
    ...body,
    authorizationSha256: sha256Document(body),
  });
}

function parseAuthorization(input, admission) {
  const authorization = verifySelfHash(
    snapshotJsonValue(input, 'character identity provider authorization'),
    'authorizationSha256',
    'character identity provider authorization',
  );
  assert(
    authorization.schema === CHARACTER_IDENTITY_PROVIDER_AUTHORIZATION_SCHEMA &&
      authorization.protocolVersion === CHARACTER_IDENTITY_PROVIDER_PROTOCOL_VERSION &&
      authorization.action === 'run-character-identity-provider-once' &&
      authorization.actorClass === 'human' &&
      authorization.characterId === admission.characterId &&
      authorization.setId === admission.setId &&
      authorization.continuityKey === admission.continuityKey &&
      authorization.jobId === admission.jobId &&
      authorization.admissionItemId === admission.admissionItemId &&
      authorization.providerAdmissionSha256 === admission.providerAdmissionSha256 &&
      authorization.maximumProviderCalls === 1 &&
      authorization.oneShot === true &&
      Object.values(authorization.authority ?? {}).every((value) => value === false),
    'CHARACTER_IDENTITY_PROVIDER_AUTHORIZATION_INVALID',
  );
  const expected = compileCharacterIdentityProviderAuthorization({
    providerAdmission: admission,
    actorId: authorization.actorId,
    occurredAt: authorization.occurredAt,
    expiresAt: authorization.expiresAt,
    evidenceSha256: authorization.evidenceSha256,
  });
  assert(
    canonicalJson(expected) === canonicalJson(authorization),
    'CHARACTER_IDENTITY_PROVIDER_AUTHORIZATION_MISMATCH',
  );
  return authorization;
}

function requestView(source, viewId) {
  const view = source.request.views.find((entry) => entry.id === viewId);
  assert(view, 'CHARACTER_IDENTITY_PROVIDER_VIEW_INVALID');
  return view;
}

function providerRequestInput(source, admission, authorization) {
  const job = selectedBootstrapJob(source.bootstrap, admission.jobId);
  const view = requestView(source, job.viewId);
  const references = admission.identityAnchor === null
    ? []
    : [
        Object.freeze({
          artifactId: admission.identityAnchor.candidateArtifactId,
          role: 'canonical-identity',
          strength: 1,
          required: true,
          note: `Unapproved same-set identity anchor from ${admission.identityAnchor.sourceJobId}; continuity reference only, never identity approval.`,
        }),
      ];
  const selection = {
    preferredAdapterId: admission.selection.preferredAdapterId,
    preferredModel: admission.selection.preferredModel,
    allowedAdapterIds: [...admission.selection.allowedAdapterIds],
    allowFallback: false,
    requireSeed: admission.selection.requireSeed,
  };
  if (admission.selection.requireSeed) selection.seed = admission.selection.seed;
  const input = {
    schemaVersion: '1.0',
    operation: 'generate',
    assetKind: 'sprite-frame',
    continuityPhase: 'identity-master',
    assetId: job.characterId,
    candidateFamilyId: job.continuityKey,
    frameId: job.viewId,
    creativeIntent: job.prompt,
    negativeIntent: source.request.style.mustAvoid.join('; '),
    style: {
      styleName: `EVAVO Council ${source.request.character.label} identity master`,
      intent: source.request.style.lock,
      mustHave: [...source.request.style.mustHave],
      mustAvoid: [...source.request.style.mustAvoid],
      identityLocks: [source.request.style.continuity, source.request.style.originality],
      palette: ['#060608', '#F7F7F9', '#FF244E'],
      lineTreatment: [],
      materials: [],
      cameraRules: [view.prompt],
      compositionRules: [
        'one complete character or identity view only',
        'separate single-view image, never a contact sheet',
        'no labels, watermark, readable text, scenery or floor plate',
      ],
      eraRules: [],
    },
    shot: {
      subject: `${source.request.character.label} (${source.request.character.role})`,
      action: 'neutral identity-lock presentation',
      direction: view.label,
      include: [...source.request.style.mustHave],
      exclude: [...source.request.style.mustAvoid],
      separateAssets: [],
      framing: [view.prompt, 'complete intended crop with no accidental edge clipping'],
    },
    target: {
      width: job.dimensions.width,
      height: job.dimensions.height,
      transparency: 'required',
      outputFormat: 'png',
    },
    background: { strategy: 'native-alpha' },
    quality: 'high',
    candidateCount: 1,
    references,
    selection,
    metadata: {
      characterIdentity: {
        schema: 'evavo.character-identity-provider-metadata.v1',
        projectId: source.plan.project.id,
        characterId: job.characterId,
        setId: job.setId,
        continuityKey: job.continuityKey,
        jobId: job.jobId,
        admissionItemId: job.admissionItemId,
        viewId: job.viewId,
        setAnchorViewId: SET_ANCHOR_VIEW_ID,
        isSetAnchor: job.viewId === SET_ANCHOR_VIEW_ID,
        sourceIdentityMasterPlanSha256: source.plan.planSha256,
        sourceBootstrapAdmissionSha256: source.bootstrap.admissionPlanSha256,
        providerAdmissionSha256: admission.providerAdmissionSha256,
        authorizationSha256: authorization.authorizationSha256,
        generationEqualsApproval: false,
        runtimeAsset: false,
        promotion: false,
        publication: false,
      },
    },
  };
  if (admission.selection.requireSeed) input.seed = admission.selection.seed;
  return deepFreeze(input);
}

function genericDispatch({ source, admission, authorization, compiledAt }) {
  const input = providerRequestInput(source, admission, authorization);
  const compiled = compileProviderCandidateRuntimeContract(input);
  const job = selectedBootstrapJob(source.bootstrap, admission.jobId);
  const providerRequestInputSha256 = sha256Document(input);
  const candidateOutputPath = canonicalPath(
    `scratch/character-identity-provider/${job.characterId}/${job.setId}/${job.viewId}/candidate-01.png`,
    'candidate output path',
  );
  const jobEnvelopeSha256 = sha256Document({
    admissionItemId: job.admissionItemId,
    providerAdmissionSha256: admission.providerAdmissionSha256,
    authorizationSha256: authorization.authorizationSha256,
    providerRequestInputSha256,
  });
  const submissionIdempotencyKey =
    `avatar-provider-submit:${sha256Text(`${source.bootstrap.admissionPlanSha256}\0${jobEnvelopeSha256}\0${providerRequestInputSha256}`).slice(0, 40)}`;
  const requiredCapabilities = Object.freeze([...compiled.runtimeJob.requiredCapabilities]);
  const requiredCapabilityProfile = Object.freeze([...compiled.requiredAdapterCapabilities]);
  const body = {
    schema: AVATAR_FINAL_PASS_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
    protocolVersion: AVATAR_FINAL_PASS_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    compiledAt,
    requestId: `identity-${job.admissionItemId}`,
    jobId: job.jobId,
    frameId: job.viewId,
    kind: 'identity-master',
    operation: 'generate',
    continuityPhase: 'identity-master',
    batchSha256: source.bootstrap.admissionPlanSha256,
    planSha256: source.plan.planSha256,
    sourceCommit: source.plan.requestSha256,
    sessionId: job.setId,
    characterId: job.characterId,
    jobEnvelopeSha256,
    providerRequestInputSha256,
    submissionIdempotencyKey,
    providerCompiler: Object.freeze({
      package: '@evavo/art-providers',
      export: 'compileProviderCandidateRuntimeContract',
      input,
      inputSha256: providerRequestInputSha256,
      validationRequired: true,
    }),
    expectedRuntimeContract: Object.freeze({
      schemaVersion: '1.0',
      providerProtocolVersion: GENERIC_PROVIDER_PROTOCOL_VERSION,
      executionMode: 'submit-runtime-job',
      queue: 'provider',
      kind: 'art.candidate.generate',
      maximumAttempts: 3,
      leaseDurationMs: 300_000,
      timeoutMs: 1_800_000,
      candidateCount: 1,
      requiredCapabilities,
      requiredCapabilityProfile,
    }),
    candidateAdmission: Object.freeze({
      candidateOutputPath,
      reviewedTargetPath: canonicalPath(job.targetPath, 'identity job targetPath'),
      expectedMediaType: 'image/png',
      expectedWidth: 1024,
      expectedHeight: 1536,
      expectedCandidateArtifacts: 1,
      expectedEvidenceArtifacts: 1,
      createOnlyMaterializationRequired: true,
      frameFinisherRequired: true,
      independentReviewRequired: true,
      finalSha256RequiredBeforeSequenceUse: true,
    }),
    permittedRuntimeOutcomes: Object.freeze(['candidate-run-result', 'provider-failure']),
    authority: createAuthority(RUNTIME_DISPATCH_AUTHORITY_KEYS, [
      'explicitWriteEnabledRuntimeRequired',
    ]),
  };
  return deepFreeze({
    ...body,
    runtimeDispatchSha256: sha256Document(body),
  });
}

export function compileCharacterIdentityProviderRuntimeAdapter({
  identityRequest,
  providerAdmission,
  authorization,
  compiledAt = new Date().toISOString(),
}) {
  timestamp(compiledAt, 'compiledAt');
  const source = parseCouncilIdentityRequest(identityRequest);
  const admission = parseProviderAdmission(providerAdmission, source);
  const parsedAuthorization = parseAuthorization(authorization, admission);
  const dispatch = genericDispatch({
    source,
    admission,
    authorization: parsedAuthorization,
    compiledAt,
  });
  const body = {
    schema: CHARACTER_IDENTITY_PROVIDER_RUNTIME_ADAPTER_SCHEMA,
    protocolVersion: CHARACTER_IDENTITY_PROVIDER_PROTOCOL_VERSION,
    compiledAt,
    sourceIdentityRequest: source.request,
    sourceIdentityRequestSha256: source.plan.requestSha256,
    sourceIdentityMasterPlanSha256: source.plan.planSha256,
    sourceBootstrapAdmissionSha256: source.bootstrap.admissionPlanSha256,
    providerAdmission: admission,
    authorization: parsedAuthorization,
    characterId: admission.characterId,
    setId: admission.setId,
    continuityKey: admission.continuityKey,
    jobId: admission.jobId,
    viewId: admission.viewId,
    genericRuntimeDispatch: dispatch,
    executionPolicy: Object.freeze({
      oneCandidateOnly: true,
      maximumProviderCalls: 1,
      maximumRuntimeAttempts: 1,
      maximumAuthorizationHours: 24,
      providerFallbackAllowed: false,
      sameSetAnchorRequiredForDependentViews: true,
      generationEqualsApproval: false,
    }),
    authority: falseAuthority(),
  };
  return deepFreeze({ ...body, adapterSha256: sha256Document(body) });
}

export function parseCharacterIdentityProviderRuntimeAdapter(input) {
  const adapter = verifySelfHash(
    snapshotJsonValue(input, 'character identity provider runtime adapter'),
    'adapterSha256',
    'character identity provider runtime adapter',
  );
  assert(
    adapter.schema === CHARACTER_IDENTITY_PROVIDER_RUNTIME_ADAPTER_SCHEMA &&
      adapter.protocolVersion === CHARACTER_IDENTITY_PROVIDER_PROTOCOL_VERSION &&
      Object.values(adapter.authority ?? {}).every((value) => value === false),
    'CHARACTER_IDENTITY_PROVIDER_RUNTIME_ADAPTER_INVALID',
  );
  const expected = compileCharacterIdentityProviderRuntimeAdapter({
    identityRequest: adapter.sourceIdentityRequest,
    providerAdmission: adapter.providerAdmission,
    authorization: adapter.authorization,
    compiledAt: adapter.compiledAt,
  });
  assert(
    canonicalJson(expected) === canonicalJson(adapter),
    'CHARACTER_IDENTITY_PROVIDER_RUNTIME_ADAPTER_MISMATCH',
  );
  return adapter;
}

function activeAuthorization(adapter, now) {
  const authorization = adapter.authorization;
  const current = now.getTime();
  const occurred = Date.parse(timestamp(authorization.occurredAt, 'authorization.occurredAt'));
  const expires = Date.parse(timestamp(authorization.expiresAt, 'authorization.expiresAt'));
  assert(
    Number.isFinite(current) &&
      current >= occurred &&
      current < expires &&
      expires - occurred <= MAXIMUM_AUTHORIZATION_MS,
    'CHARACTER_IDENTITY_PROVIDER_AUTHORIZATION_EXPIRED',
  );
  return authorization;
}

function oneShotRuntimeJob(compiled, adapter) {
  const source = compiled.runtimeJob;
  const authorization = adapter.authorization;
  const reservationSha256 = sha256Text(
    `${adapter.providerAdmission.providerAdmissionSha256}\0${authorization.authorizationSha256}\0${adapter.jobId}`,
  );
  const queue = `character-identity.provider.${reservationSha256.slice(0, 20)}`;
  return Object.freeze({
    ...source,
    queue,
    idempotencyKey: `character-identity-once:${reservationSha256}`,
    maximumAttempts: 1,
    requiredCapabilities: Object.freeze(
      [...new Set([
        ...source.requiredCapabilities,
        CHARACTER_IDENTITY_PROVIDER_EXECUTION_CAPABILITY,
      ])].sort(),
    ),
    labels: Object.freeze({
      ...source.labels,
      characterIdentityExecution: 'one-shot-v1',
      characterIdentityCharacterId: adapter.characterId,
      characterIdentitySetId: adapter.setId,
      characterIdentityViewId: adapter.viewId,
      characterIdentityAuthorizationSha256: authorization.authorizationSha256,
      characterIdentityReservationSha256: reservationSha256,
    }),
  });
}

async function verifiedArtifactSummary(artifacts, id, role) {
  const verification = await artifacts.verify(id);
  assert(
    verification.descriptorValid === true && verification.contentValid === true,
    'CHARACTER_IDENTITY_PROVIDER_ARTIFACT_INVALID',
    `${role} artifact failed immutable verification.`,
  );
  const descriptor = await artifacts.get(id);
  assert(descriptor, 'CHARACTER_IDENTITY_PROVIDER_ARTIFACT_INVALID');
  if (role === 'candidate') {
    assert(
      descriptor.storageClass === 'intermediate' &&
        descriptor.labels.artifactRole === 'provider-candidate' &&
        descriptor.labels.approvalState === 'unapproved' &&
        descriptor.metadata?.finalDeliverable === false,
      'CHARACTER_IDENTITY_PROVIDER_CANDIDATE_ESCALATED',
    );
  } else {
    assert(
      descriptor.storageClass === 'evidence',
      'CHARACTER_IDENTITY_PROVIDER_EVIDENCE_INVALID',
    );
  }
  return Object.freeze({
    artifactId: id,
    contentHash: descriptor.contentHash,
    mediaType: descriptor.mediaType,
    storageClass: descriptor.storageClass,
    artifactRole: descriptor.labels.artifactRole ?? null,
    approvalState: descriptor.labels.approvalState ?? null,
  });
}

async function verifyIdentityAnchorArtifact(artifacts, adapter) {
  const anchor = adapter.providerAdmission.identityAnchor;
  if (anchor === null) return null;
  const verification = await artifacts.verify(anchor.candidateArtifactId);
  const descriptor = await artifacts.get(anchor.candidateArtifactId);
  assert(
    verification.descriptorValid === true &&
      verification.contentValid === true &&
      descriptor?.contentHash === anchor.candidateContentHash &&
      descriptor?.storageClass === 'intermediate' &&
      descriptor?.labels.artifactRole === 'provider-candidate' &&
      descriptor?.labels.approvalState === 'unapproved' &&
      descriptor?.metadata?.finalDeliverable === false,
    'CHARACTER_IDENTITY_PROVIDER_ANCHOR_ARTIFACT_INVALID',
  );
  return anchor;
}

function providerFailureAttempt(completed) {
  const details = completed.failure?.details;
  if (!isRecord(details) || !Array.isArray(details.attempts) || details.attempts.length !== 1) {
    return null;
  }
  const attempt = details.attempts[0];
  if (!isRecord(attempt)) return null;
  const classification = ['transient', 'permanent', 'incompatible', 'cancelled'].includes(
    attempt.classification,
  )
    ? attempt.classification
    : 'permanent';
  return Object.freeze({
    adapterId:
      typeof attempt.adapterId === 'string'
        ? boundedText(attempt.adapterId, 'provider failure.adapterId', 1, 128)
        : null,
    model:
      typeof attempt.model === 'string'
        ? boundedText(attempt.model, 'provider failure.model', 1, 256)
        : null,
    classification,
    code: boundedText(
      String(attempt.code ?? completed.failure?.code ?? 'PROVIDER_EXECUTION_FAILED'),
      'provider failure.code',
      1,
      256,
    ),
    message: boundedText(
      String(attempt.message ?? completed.failure?.message ?? 'Provider execution failed.'),
      'provider failure.message',
      1,
      4096,
    ),
  });
}

function executionReceiptBody({
  adapter,
  completed,
  completedAt,
  outcome,
  candidate,
  evidence,
  providerCallCountVerified,
}) {
  const success = completed.state === 'succeeded';
  return {
    schema: CHARACTER_IDENTITY_PROVIDER_EXECUTION_SCHEMA,
    protocolVersion: CHARACTER_IDENTITY_PROVIDER_PROTOCOL_VERSION,
    status: success ? 'succeeded' : 'failed',
    completedAt,
    characterId: adapter.characterId,
    setId: adapter.setId,
    continuityKey: adapter.continuityKey,
    jobId: adapter.jobId,
    admissionItemId: adapter.providerAdmission.admissionItemId,
    viewId: adapter.viewId,
    sourceIdentityRequestSha256: adapter.sourceIdentityRequestSha256,
    sourceIdentityMasterPlanSha256: adapter.sourceIdentityMasterPlanSha256,
    sourceBootstrapAdmissionSha256: adapter.sourceBootstrapAdmissionSha256,
    providerAdmissionSha256: adapter.providerAdmission.providerAdmissionSha256,
    authorizationSha256: adapter.authorization.authorizationSha256,
    sourceAdapterSha256: adapter.adapterSha256,
    runtimeDispatchSha256: adapter.genericRuntimeDispatch.runtimeDispatchSha256,
    runtimeOutcomeSha256: outcome?.runtimeOutcomeSha256 ?? null,
    provider: Object.freeze({
      preferredAdapterId: adapter.providerAdmission.selection.preferredAdapterId,
      preferredModel: adapter.providerAdmission.selection.preferredModel,
      fallbackAllowed: false,
      providerCallCount: 1,
      providerCallCountVerified,
    }),
    artifacts: Object.freeze({ candidate, evidence }),
    effects: Object.freeze({
      providerExecutionPerformed: true,
      candidateArtifactCreated: candidate !== null,
      evidenceArtifactCreated: evidence !== null,
      candidateBytesMaterialized: false,
      deterministicQaPerformed: false,
      creativeReviewPerformed: false,
      candidateApprovalPerformed: false,
      identityApprovalPerformed: false,
      animationProductionPerformed: false,
      candidatePromotionPerformed: false,
      runtimeAssetCreated: false,
      publicationPerformed: false,
      runtimeActivationPerformed: false,
      websiteActivationPerformed: false,
    }),
    requiredNextSteps: success
      ? Object.freeze([
          'materialize-candidate-create-only',
          'run-alpha-and-canvas-finishing',
          ...(adapter.viewId === SET_ANCHOR_VIEW_ID
            ? ['use-this-unapproved-candidate-only-as-same-set-continuity-reference-for-dependent-views']
            : []),
          'complete-three-view-candidate-set',
          'run-independent-identity-continuity-review',
          'approve-exactly-one-identity-set-under-separate-identity-approval-receipt',
        ])
      : Object.freeze([
          'record-provider-failure',
          'issue-fresh-one-shot-human-authorization-before-any-retry',
        ]),
    authority: falseAuthority(),
  };
}

export async function executeCharacterIdentityProvider({
  adapter: adapterInput,
  runtimeRoot: runtimeRootInput,
  artifactRoot: artifactRootInput,
  workerId = 'character-identity-provider-worker',
  environment = process.env,
}) {
  const adapter = parseCharacterIdentityProviderRuntimeAdapter(adapterInput);
  const authorization = activeAuthorization(adapter, new Date());
  const runtimeRoot = await realDirectory(runtimeRootInput, 'runtimeRoot', true);
  const artifactRoot = await realDirectory(artifactRootInput, 'artifactRoot', true);
  assert(
    runtimeRoot !== artifactRoot,
    'CHARACTER_IDENTITY_PROVIDER_PATH_INVALID',
    'runtimeRoot and artifactRoot must be separate directories.',
  );
  assert(
    PROVIDER_PROTOCOL_VERSION === GENERIC_PROVIDER_PROTOCOL_VERSION,
    'CHARACTER_IDENTITY_PROVIDER_PROTOCOL_DRIFT',
  );
  const dispatch = adapter.genericRuntimeDispatch;
  const compiled = compileProviderCandidateRuntimeContract(dispatch.providerCompiler.input);
  const binding = validateAvatarFinalPassCompiledProviderRuntimeContract(dispatch, compiled);
  const request = validateProviderCandidateRequest(compiled.request);
  assert(
    providerRequestSha256(request) === binding.normalizedProviderRequestSha256 &&
      request.selection.allowFallback === false &&
      request.candidateCount === 1 &&
      request.continuityPhase === 'identity-master',
    'CHARACTER_IDENTITY_PROVIDER_REQUEST_MISMATCH',
  );
  const allowedAdapterIds = Object.freeze([...request.selection.allowedAdapterIds]);
  assert(
    allowedAdapterIds.length === 1 &&
      allowedAdapterIds[0] === adapter.providerAdmission.selection.preferredAdapterId,
    'CHARACTER_IDENTITY_PROVIDER_ADAPTERS_INVALID',
  );
  const baseRegistry = createProviderRegistryFromEnvironment(environment);
  const providerRegistry = restrictProviderRegistry(baseRegistry, allowedAdapterIds);
  const routing = compileProviderExecutionRoutingPlan(request, providerRegistry.rank(request));
  assert(
    routing.eligibleAdapters.length >= 1 &&
      routing.inspection.fallbackAllowed === false &&
      routing.inspection.providerCallPerformedByInspection === false,
    'CHARACTER_IDENTITY_PROVIDER_ROUTING_INVALID',
  );
  const runtime = new LocalRuntimeRepository({ root: runtimeRoot });
  const artifacts = new LocalArtifactStore({ root: artifactRoot });
  await verifyIdentityAnchorArtifact(artifacts, adapter);

  const runtimeJob = oneShotRuntimeJob(compiled, adapter);
  const normalized = normalizeRuntimeJobSubmission(runtimeJob);
  assert(
    normalized.spec.maximumAttempts === 1 &&
      normalized.spec.requiredCapabilities.includes(
        CHARACTER_IDENTITY_PROVIDER_EXECUTION_CAPABILITY,
      ),
    'CHARACTER_IDENTITY_PROVIDER_RUNTIME_JOB_INVALID',
  );
  const existing = await runtime.get(normalized.spec.id);
  assert(
    existing === null,
    'CHARACTER_IDENTITY_PROVIDER_AUTHORIZATION_ALREADY_RESERVED',
    `${adapter.jobId} run-once authorization is already reserved in this runtime root.`,
  );
  const submitted = await runtime.submitBatch(
    [runtimeJob],
    `character-identity:${authorization.actorId}`,
    new Date(),
  );
  assert(
    submitted.length === 1 &&
      submitted[0].id === normalized.spec.id &&
      submitted[0].specHash === normalized.specHash &&
      submitted[0].state === 'queued',
    'CHARACTER_IDENTITY_PROVIDER_SUBMISSION_INVALID',
  );

  let providerRunResult = null;
  const providerHandlers = createProviderHandlers(providerRegistry);
  const providerHandler = providerHandlers[normalized.spec.kind];
  assert(
    typeof providerHandler === 'function',
    'CHARACTER_IDENTITY_PROVIDER_HANDLER_MISSING',
  );
  const handlers = Object.freeze({
    [normalized.spec.kind]: async (context) => {
      activeAuthorization(adapter, new Date());
      assert(
        context.job.id === normalized.spec.id &&
          context.job.specHash === normalized.specHash &&
          providerRequestSha256(
            validateProviderCandidateRequest(context.job.spec.payload),
          ) === binding.normalizedProviderRequestSha256,
        'CHARACTER_IDENTITY_PROVIDER_CLAIM_INVALID',
      );
      const result = await providerHandler(context);
      providerRunResult = result?.result ?? null;
      return result;
    },
  });
  const resolvedWorkerId = identifier(workerId, 'workerId');
  const worker = new RuntimeWorker({
    runtime,
    artifacts,
    worker: {
      id: resolvedWorkerId,
      capabilities: Object.freeze(
        [...new Set([
          ...providerWorkerCapabilities(providerRegistry),
          CHARACTER_IDENTITY_PROVIDER_EXECUTION_CAPABILITY,
        ])].sort(),
      ),
      capabilityProfiles: providerWorkerCapabilityProfiles(providerRegistry),
      queues: Object.freeze([normalized.spec.queue]),
    },
    handlers,
    concurrency: 1,
  });
  await worker.runUntilIdle();
  const completed = await runtime.get(normalized.spec.id);
  assert(
    completed &&
      completed.specHash === normalized.specHash &&
      ['succeeded', 'failed', 'dead-letter', 'cancelled'].includes(completed.state),
    'CHARACTER_IDENTITY_PROVIDER_WORKER_INVALID',
  );

  const completedAt = new Date().toISOString();
  let outcome = null;
  let candidate = null;
  let evidence = null;
  let providerCallCountVerified = false;
  if (completed.state === 'succeeded') {
    assert(
      providerRunResult &&
        Array.isArray(providerRunResult.candidateArtifacts) &&
        providerRunResult.candidateArtifacts.length === 1,
      'CHARACTER_IDENTITY_PROVIDER_RESULT_INVALID',
    );
    outcome = compileAvatarFinalPassProviderRuntimeOutcome(dispatch, binding, {
      kind: 'candidate-run-result',
      submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
      providerCallCount: 1,
      completedAt,
      result: providerRunResult,
    });
    candidate = await verifiedArtifactSummary(
      artifacts,
      providerRunResult.candidateArtifacts[0],
      'candidate',
    );
    evidence = await verifiedArtifactSummary(
      artifacts,
      providerRunResult.evidenceArtifact,
      'evidence',
    );
    providerCallCountVerified = true;
  } else {
    const attempt = providerFailureAttempt(completed);
    assert(
      attempt,
      'CHARACTER_IDENTITY_PROVIDER_FAILURE_ATTEMPT_UNVERIFIED',
    );
    outcome = compileAvatarFinalPassProviderRuntimeOutcome(dispatch, binding, {
      kind: 'provider-failure',
      submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
      providerCallCount: 1,
      completedAt,
      failure: {
        code: attempt.code,
        classification: attempt.classification,
        message: attempt.message,
        adapterId: attempt.adapterId,
        model: attempt.model,
        attemptCount: 1,
        candidateCount: 0,
      },
    });
    providerCallCountVerified = true;
  }
  const body = executionReceiptBody({
    adapter,
    completed,
    completedAt,
    outcome,
    candidate,
    evidence,
    providerCallCountVerified,
  });
  const receipt = deepFreeze({ ...body, executionSha256: sha256Document(body) });
  return Object.freeze({ dispatch, binding, outcome, receipt });
}

export function characterIdentityProviderRuntimeCapabilities() {
  return Object.freeze({
    schema: 'evavo.character-identity-provider-runtime-capabilities.v1',
    protocolVersion: CHARACTER_IDENTITY_PROVIDER_PROTOCOL_VERSION,
    admittedCharacterIds: COUNCIL_CHARACTER_IDS,
    candidateSetsPerCharacter: 4,
    viewsPerCandidateSet: 3,
    setAnchorViewId: SET_ANCHOR_VIEW_ID,
    dependentViewIds: DEPENDENT_VIEW_IDS,
    sameSetAnchorRequiredForDependentViews: true,
    maximumProviderCallsPerJob: 1,
    maximumRuntimeAttempts: 1,
    maximumAuthorizationHours: 24,
    providerFallbackAllowed: false,
    nativeStraightAlphaRequired: true,
    targetWidth: 1024,
    targetHeight: 1536,
    genericProviderWorkerReused: true,
    genericCandidateMaterializerCompatible: true,
    providerExecution: false,
    candidateMaterialization: false,
    creativeReview: false,
    candidateApproval: false,
    identityApproval: false,
    animationProduction: false,
    promotion: false,
    publication: false,
    runtimeActivation: false,
    websiteActivation: false,
    forcePush: false,
  });
}
