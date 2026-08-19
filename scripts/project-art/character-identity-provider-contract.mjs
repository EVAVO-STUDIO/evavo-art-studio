import {
  compileProviderCandidateRuntimeContract,
} from '../../packages/providers/dist/index.js';

import { compileIdentityMasterPlan } from '../character-identity-master-plan.mjs';
import { compileIdentityBootstrapAdmission } from '../character-identity-bootstrap-admission.mjs';
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
export const CHARACTER_IDENTITY_SET_ANCHOR_VIEW_ID = 'full-body-right';
export const CHARACTER_IDENTITY_DEPENDENT_VIEW_IDS = Object.freeze([
  'full-body-left',
  'neutral-bust',
]);
export const CHARACTER_IDENTITY_COUNCIL_CHARACTER_IDS = Object.freeze([
  'council-critic',
  'council-open-reviewer',
]);

const MAXIMUM_AUTHORIZATION_MS = 24 * 60 * 60 * 1000;
const ADMISSION_KEYS = Object.freeze([
  'schema',
  'protocolVersion',
  'action',
  'actorClass',
  'actorId',
  'occurredAt',
  'evidenceSha256',
  'sourceIdentityRequestSha256',
  'sourceIdentityMasterPlanSha256',
  'sourceBootstrapAdmissionSha256',
  'characterId',
  'setId',
  'continuityKey',
  'jobId',
  'admissionItemId',
  'viewId',
  'targetPath',
  'selection',
  'identityAnchor',
  'limits',
  'authority',
  'providerAdmissionSha256',
]);
const ANCHOR_KEYS = Object.freeze([
  'sourceJobId',
  'sourceViewId',
  'executionSha256',
  'candidateArtifactId',
  'candidateContentHash',
  'evidenceArtifactId',
]);
const AUTHORIZATION_KEYS = Object.freeze([
  'schema',
  'protocolVersion',
  'action',
  'actorClass',
  'actorId',
  'occurredAt',
  'expiresAt',
  'evidenceSha256',
  'characterId',
  'setId',
  'continuityKey',
  'jobId',
  'admissionItemId',
  'providerAdmissionSha256',
  'maximumProviderCalls',
  'oneShot',
  'authority',
  'authorizationSha256',
]);

export function characterIdentityFalseAuthority() {
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

export function compileCharacterIdentitySource(identityRequest) {
  const request = deepFreeze(snapshotJsonValue(identityRequest, 'character identity request'));
  const plan = compileIdentityMasterPlan(request);
  const bootstrap = compileIdentityBootstrapAdmission(plan);
  assert(
    CHARACTER_IDENTITY_COUNCIL_CHARACTER_IDS.includes(plan.character.id),
    'CHARACTER_IDENTITY_PROVIDER_CHARACTER_INVALID',
  );
  assert(
    plan.candidateSetCount === 4 &&
      plan.viewCount === 3 &&
      plan.totalJobs === 12 &&
      bootstrap.requestCount === 12 &&
      plan.character.id === bootstrap.character.id,
    'CHARACTER_IDENTITY_PROVIDER_BOOTSTRAP_DRIFT',
  );
  return Object.freeze({ request, plan, bootstrap });
}

export function selectCharacterIdentityBootstrapJob(bootstrap, jobIdInput) {
  const jobId = identifier(jobIdInput, 'jobId');
  const job = bootstrap.requests.find((entry) => entry.jobId === jobId);
  assert(job, 'CHARACTER_IDENTITY_PROVIDER_JOB_UNKNOWN');
  assert(
    job.operation === 'generate' &&
      job.providerExecution === false &&
      job.providerAuthorizationRequired === true &&
      job.identityBootstrapOnly === true &&
      job.runtimeAsset === false &&
      job.animationFamily === false &&
      job.approvalByGeneration === false &&
      job.promotion === false &&
      job.publication === false &&
      job.dimensions?.width === 1024 &&
      job.dimensions?.height === 1536 &&
      [
        CHARACTER_IDENTITY_SET_ANCHOR_VIEW_ID,
        ...CHARACTER_IDENTITY_DEPENDENT_VIEW_IDS,
      ].includes(job.viewId),
    'CHARACTER_IDENTITY_PROVIDER_JOB_AUTHORITY_DRIFT',
  );
  return job;
}

export function parseCharacterIdentityProviderSelection(input) {
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
  );
  if (selection.requireSeed) {
    assert(
      Number.isSafeInteger(selection.seed) &&
        selection.seed >= 0 &&
        selection.seed <= 0xffffffff,
      'CHARACTER_IDENTITY_PROVIDER_SEED_REQUIRED',
    );
  } else {
    assert(selection.seed === null, 'CHARACTER_IDENTITY_PROVIDER_SEED_INVALID');
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
  if (expected.viewId === CHARACTER_IDENTITY_SET_ANCHOR_VIEW_ID) {
    assert(input === null, 'CHARACTER_IDENTITY_PROVIDER_ANCHOR_UNEXPECTED');
    return null;
  }
  assert(
    CHARACTER_IDENTITY_DEPENDENT_VIEW_IDS.includes(expected.viewId) && isRecord(input),
    'CHARACTER_IDENTITY_PROVIDER_ANCHOR_REQUIRED',
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
      receipt.viewId === CHARACTER_IDENTITY_SET_ANCHOR_VIEW_ID &&
      receipt.provider?.providerCallCount === 1 &&
      receipt.provider?.providerCallCountVerified === true &&
      receipt.effects?.candidateArtifactCreated === true &&
      receipt.effects?.candidateApprovalPerformed === false &&
      receipt.effects?.identityApprovalPerformed === false &&
      Object.values(receipt.authority ?? {}).every((value) => value === false),
    'CHARACTER_IDENTITY_PROVIDER_ANCHOR_RECEIPT_INVALID',
  );
  const candidate = receipt.artifacts?.candidate;
  const evidence = receipt.artifacts?.evidence;
  assert(
    isRecord(candidate) &&
      isRecord(evidence) &&
      candidate.storageClass === 'intermediate' &&
      candidate.artifactRole === 'provider-candidate' &&
      candidate.approvalState === 'unapproved',
    'CHARACTER_IDENTITY_PROVIDER_ANCHOR_ARTIFACT_INVALID',
  );
  return Object.freeze({
    sourceJobId: receipt.jobId,
    sourceViewId: receipt.viewId,
    executionSha256: receipt.executionSha256,
    candidateArtifactId: artifactId(
      candidate.artifactId,
      'identity anchor candidate.artifactId',
    ),
    candidateContentHash: digest(
      candidate.contentHash,
      'identity anchor candidate.contentHash',
    ),
    evidenceArtifactId: artifactId(
      evidence.artifactId,
      'identity anchor evidence.artifactId',
    ),
  });
}

function parsePersistedAnchorSummary(input, expected) {
  assert(isRecord(input), 'CHARACTER_IDENTITY_PROVIDER_ANCHOR_REQUIRED');
  exactKeys(
    input,
    ANCHOR_KEYS,
    'provider admission.identityAnchor',
    'CHARACTER_IDENTITY_PROVIDER_ANCHOR_KEYS_INVALID',
  );
  assert(
    CHARACTER_IDENTITY_DEPENDENT_VIEW_IDS.includes(expected.viewId) &&
      input.sourceJobId === `${expected.setId}-${CHARACTER_IDENTITY_SET_ANCHOR_VIEW_ID}` &&
      input.sourceViewId === CHARACTER_IDENTITY_SET_ANCHOR_VIEW_ID,
    'CHARACTER_IDENTITY_PROVIDER_ANCHOR_MISMATCH',
  );
  digest(input.executionSha256, 'provider admission.identityAnchor.executionSha256');
  artifactId(
    input.candidateArtifactId,
    'provider admission.identityAnchor.candidateArtifactId',
  );
  digest(
    input.candidateContentHash,
    'provider admission.identityAnchor.candidateContentHash',
  );
  artifactId(
    input.evidenceArtifactId,
    'provider admission.identityAnchor.evidenceArtifactId',
  );
  return input;
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
  const source = compileCharacterIdentitySource(identityRequest);
  const job = selectCharacterIdentityBootstrapJob(source.bootstrap, jobId);
  const parsedSelection = parseCharacterIdentityProviderSelection(selection);
  timestamp(occurredAt, 'provider admission.occurredAt');
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
    actorId: boundedText(actorId, 'provider admission.actorId', 1, 256),
    occurredAt,
    evidenceSha256: digest(evidenceSha256, 'provider admission.evidenceSha256'),
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
    authority: characterIdentityFalseAuthority(),
  };
  return deepFreeze({ ...body, providerAdmissionSha256: sha256Document(body) });
}

export function parseCharacterIdentityProviderAdmission(input, sourceInput) {
  const source = sourceInput ?? compileCharacterIdentitySource(input.sourceIdentityRequest);
  const admission = verifySelfHash(
    snapshotJsonValue(input, 'character identity provider admission'),
    'providerAdmissionSha256',
    'character identity provider admission',
  );
  exactKeys(
    admission,
    ADMISSION_KEYS,
    'character identity provider admission',
    'CHARACTER_IDENTITY_PROVIDER_ADMISSION_KEYS_INVALID',
  );
  const job = selectCharacterIdentityBootstrapJob(source.bootstrap, admission.jobId);
  const selection = parseCharacterIdentityProviderSelection(admission.selection);
  timestamp(admission.occurredAt, 'provider admission.occurredAt');
  digest(admission.evidenceSha256, 'provider admission.evidenceSha256');
  assert(
    admission.schema === CHARACTER_IDENTITY_PROVIDER_ADMISSION_SCHEMA &&
      admission.protocolVersion === CHARACTER_IDENTITY_PROVIDER_PROTOCOL_VERSION &&
      admission.action === 'admit-character-identity-provider-job' &&
      admission.actorClass === 'human' &&
      admission.sourceIdentityRequestSha256 === source.plan.requestSha256 &&
      admission.sourceIdentityMasterPlanSha256 === source.plan.planSha256 &&
      admission.sourceBootstrapAdmissionSha256 === source.bootstrap.admissionPlanSha256 &&
      admission.characterId === job.characterId &&
      admission.setId === job.setId &&
      admission.continuityKey === job.continuityKey &&
      admission.admissionItemId === job.admissionItemId &&
      admission.viewId === job.viewId &&
      admission.targetPath === job.targetPath &&
      admission.limits?.candidates === 1 &&
      admission.limits?.providerCalls === 1 &&
      admission.limits?.providerFallback === false &&
      admission.limits?.runtimeAttempts === 1 &&
      Object.values(admission.authority).every((value) => value === false),
    'CHARACTER_IDENTITY_PROVIDER_ADMISSION_INVALID',
  );
  if (job.viewId === CHARACTER_IDENTITY_SET_ANCHOR_VIEW_ID) {
    assert(admission.identityAnchor === null, 'CHARACTER_IDENTITY_PROVIDER_ANCHOR_UNEXPECTED');
    const expected = compileCharacterIdentityProviderAdmission({
      identityRequest: source.request,
      jobId: job.jobId,
      selection,
      actorId: admission.actorId,
      occurredAt: admission.occurredAt,
      evidenceSha256: admission.evidenceSha256,
      anchorExecutionReceipt: null,
    });
    assert(
      canonicalJson(expected) === canonicalJson(admission),
      'CHARACTER_IDENTITY_PROVIDER_ADMISSION_MISMATCH',
    );
  } else {
    parsePersistedAnchorSummary(admission.identityAnchor, job);
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
  );
  const body = {
    schema: CHARACTER_IDENTITY_PROVIDER_AUTHORIZATION_SCHEMA,
    protocolVersion: CHARACTER_IDENTITY_PROVIDER_PROTOCOL_VERSION,
    action: 'run-character-identity-provider-once',
    actorClass: 'human',
    actorId: boundedText(actorId, 'provider authorization.actorId', 1, 256),
    occurredAt,
    expiresAt,
    evidenceSha256: digest(evidenceSha256, 'provider authorization.evidenceSha256'),
    characterId: admission.characterId,
    setId: admission.setId,
    continuityKey: admission.continuityKey,
    jobId: admission.jobId,
    admissionItemId: admission.admissionItemId,
    providerAdmissionSha256: admission.providerAdmissionSha256,
    maximumProviderCalls: 1,
    oneShot: true,
    authority: characterIdentityFalseAuthority(),
  };
  return deepFreeze({ ...body, authorizationSha256: sha256Document(body) });
}

export function parseCharacterIdentityProviderAuthorization(input, admission) {
  const authorization = verifySelfHash(
    snapshotJsonValue(input, 'character identity provider authorization'),
    'authorizationSha256',
    'character identity provider authorization',
  );
  exactKeys(
    authorization,
    AUTHORIZATION_KEYS,
    'character identity provider authorization',
    'CHARACTER_IDENTITY_PROVIDER_AUTHORIZATION_KEYS_INVALID',
  );
  const expected = compileCharacterIdentityProviderAuthorization({
    providerAdmission: admission,
    actorId: authorization.actorId,
    occurredAt: authorization.occurredAt,
    expiresAt: authorization.expiresAt,
    evidenceSha256: authorization.evidenceSha256,
  });
  assert(
    authorization.characterId === admission.characterId &&
      authorization.setId === admission.setId &&
      authorization.continuityKey === admission.continuityKey &&
      authorization.jobId === admission.jobId &&
      authorization.admissionItemId === admission.admissionItemId &&
      authorization.providerAdmissionSha256 === admission.providerAdmissionSha256 &&
      authorization.maximumProviderCalls === 1 &&
      authorization.oneShot === true &&
      Object.values(authorization.authority).every((value) => value === false) &&
      canonicalJson(expected) === canonicalJson(authorization),
    'CHARACTER_IDENTITY_PROVIDER_AUTHORIZATION_INVALID',
  );
  return authorization;
}

function sourceView(source, viewId) {
  const view = source.request.views.find((entry) => entry.id === viewId);
  assert(view, 'CHARACTER_IDENTITY_PROVIDER_VIEW_INVALID');
  return view;
}

export function compileCharacterIdentityProviderRequestInput(source, admission, authorization) {
  const job = selectCharacterIdentityBootstrapJob(source.bootstrap, admission.jobId);
  const view = sourceView(source, job.viewId);
  const selection = {
    preferredAdapterId: admission.selection.preferredAdapterId,
    preferredModel: admission.selection.preferredModel,
    allowedAdapterIds: [...admission.selection.allowedAdapterIds],
    allowFallback: false,
    requireSeed: admission.selection.requireSeed,
  };
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
      width: 1024,
      height: 1536,
      transparency: 'required',
      outputFormat: 'png',
    },
    background: { strategy: 'native-alpha' },
    quality: 'high',
    candidateCount: 1,
    references:
      admission.identityAnchor === null
        ? []
        : [
            {
              artifactId: admission.identityAnchor.candidateArtifactId,
              role: 'canonical-identity',
              strength: 1,
              required: true,
              note: `Unapproved same-set anchor from ${admission.identityAnchor.sourceJobId}; continuity reference only, never identity approval.`,
            },
          ],
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
        setAnchorViewId: CHARACTER_IDENTITY_SET_ANCHOR_VIEW_ID,
        isSetAnchor: job.viewId === CHARACTER_IDENTITY_SET_ANCHOR_VIEW_ID,
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

function compileGenericDispatch({ source, admission, authorization, compiledAt }) {
  const input = compileCharacterIdentityProviderRequestInput(
    source,
    admission,
    authorization,
  );
  const compiled = compileProviderCandidateRuntimeContract(input);
  const job = selectCharacterIdentityBootstrapJob(source.bootstrap, admission.jobId);
  const inputSha256 = sha256Document(input);
  const envelopeSha256 = sha256Document({
    admissionItemId: job.admissionItemId,
    providerAdmissionSha256: admission.providerAdmissionSha256,
    authorizationSha256: authorization.authorizationSha256,
    providerRequestInputSha256: inputSha256,
  });
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
    jobEnvelopeSha256: envelopeSha256,
    providerRequestInputSha256: inputSha256,
    submissionIdempotencyKey:
      `avatar-provider-submit:${sha256Text(`${source.bootstrap.admissionPlanSha256}\0${envelopeSha256}\0${inputSha256}`).slice(0, 40)}`,
    providerCompiler: Object.freeze({
      package: '@evavo/art-providers',
      export: 'compileProviderCandidateRuntimeContract',
      input,
      inputSha256,
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
      requiredCapabilities: Object.freeze([...compiled.runtimeJob.requiredCapabilities]),
      requiredCapabilityProfile: Object.freeze([...compiled.requiredAdapterCapabilities]),
    }),
    candidateAdmission: Object.freeze({
      candidateOutputPath: canonicalPath(
        `scratch/character-identity-provider/${job.characterId}/${job.setId}/${job.viewId}/candidate-01.png`,
        'candidate output path',
      ),
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
  return deepFreeze({ ...body, runtimeDispatchSha256: sha256Document(body) });
}

export function compileCharacterIdentityProviderRuntimeAdapter({
  identityRequest,
  providerAdmission,
  authorization,
  compiledAt = new Date().toISOString(),
}) {
  timestamp(compiledAt, 'compiledAt');
  const source = compileCharacterIdentitySource(identityRequest);
  const admission = parseCharacterIdentityProviderAdmission(providerAdmission, source);
  const parsedAuthorization = parseCharacterIdentityProviderAuthorization(
    authorization,
    admission,
  );
  const dispatch = compileGenericDispatch({
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
    authority: characterIdentityFalseAuthority(),
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

export function characterIdentityProviderContractCapabilities() {
  return Object.freeze({
    schema: 'evavo.character-identity-provider-contract-capabilities.v1',
    protocolVersion: CHARACTER_IDENTITY_PROVIDER_PROTOCOL_VERSION,
    admittedCharacterIds: CHARACTER_IDENTITY_COUNCIL_CHARACTER_IDS,
    candidateSetsPerCharacter: 4,
    viewsPerCandidateSet: 3,
    setAnchorViewId: CHARACTER_IDENTITY_SET_ANCHOR_VIEW_ID,
    dependentViewIds: CHARACTER_IDENTITY_DEPENDENT_VIEW_IDS,
    sameSetAnchorReceiptRequiredForDependentViews: true,
    maximumProviderCallsPerJob: 1,
    maximumRuntimeAttempts: 1,
    maximumAuthorizationHours: 24,
    providerFallbackAllowed: false,
    nativeStraightAlphaRequired: true,
    targetWidth: 1024,
    targetHeight: 1536,
    providerExecution: false,
    candidateApproval: false,
    identityApproval: false,
    animationProduction: false,
    publication: false,
    runtimeActivation: false,
    websiteActivation: false,
    forcePush: false,
  });
}
