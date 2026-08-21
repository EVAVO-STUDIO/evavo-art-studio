import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileCouncilAvatarIdentityBootstrap } from './council-avatar-identity-bootstrap.mjs';

export const COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_SCHEMA =
  'evavo.project-art-council-identity-candidate-campaign.v1';
export const COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_CAPABILITIES_SCHEMA =
  'evavo.project-art-council-identity-candidate-campaign-capabilities.v1';
export const COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_VERSION = '4.4.0';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SELECTION_PATH =
  'config/council-avatar-identities/council-identity-provider-selection.v1.json';
const PROVIDER_COMPILER =
  'scripts/compile-project-art-character-identity-provider-runtime.mjs';
const PROVIDER_RUNNER =
  'scripts/run-project-art-character-identity-provider.mjs';
const CAMPAIGN_COMPILER =
  'scripts/compile-project-art-council-identity-candidate-campaign.mjs';
const SHA256 = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const CHARACTER_ORDER = Object.freeze([
  'council-critic',
  'council-open-reviewer',
]);
const VIEW_ORDER = Object.freeze([
  'full-body-right',
  'full-body-left',
  'neutral-bust',
]);
const DEPENDENT_VIEW_ORDER = Object.freeze([
  'full-body-left',
  'neutral-bust',
]);
const SET_ORDER = Object.freeze([
  'candidate-set-01',
  'candidate-set-02',
  'candidate-set-03',
  'candidate-set-04',
]);

const AUTHORITY = Object.freeze({
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
  if (!condition) throw new Error(code);
}

function safeSource(relativePath) {
  const absolute = path.resolve(ROOT, relativePath);
  const relative = path.relative(ROOT, absolute);
  assert(
    relative && !relative.startsWith('..') && !path.isAbsolute(relative),
    'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_SOURCE_PATH_ESCAPE',
  );
  const state = lstatSync(absolute, { throwIfNoEntry: false });
  assert(
    state?.isFile() &&
      !state.isSymbolicLink() &&
      state.nlink === 1 &&
      realpathSync(absolute) === absolute,
    `COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_SOURCE_UNSAFE:${relativePath}`,
  );
  const bytes = readFileSync(absolute);
  return Object.freeze({
    path: relativePath,
    bytes,
    byteLength: bytes.byteLength,
    sha256: sha256Bytes(bytes),
  });
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

function parseSelection() {
  const source = safeSource(SELECTION_PATH);
  let selection;
  try {
    selection = JSON.parse(source.bytes.toString('utf8').replace(/^\uFEFF/u, ''));
  } catch {
    throw new Error('COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_SELECTION_JSON_INVALID');
  }
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
    'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_SELECTION_KEYS_INVALID',
  );
  assert(
    typeof selection.preferredAdapterId === 'string' &&
      IDENTIFIER.test(selection.preferredAdapterId) &&
      typeof selection.preferredModel === 'string' &&
      IDENTIFIER.test(selection.preferredModel) &&
      Array.isArray(selection.allowedAdapterIds) &&
      selection.allowedAdapterIds.length === 1 &&
      selection.allowedAdapterIds[0] === selection.preferredAdapterId &&
      selection.allowFallback === false &&
      selection.requireSeed === false &&
      selection.seed === null,
    'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_SELECTION_INVALID',
  );
  return Object.freeze({
    source: Object.freeze({
      path: source.path,
      bytes: source.byteLength,
      sha256: source.sha256,
    }),
    selection: Object.freeze({
      preferredAdapterId: selection.preferredAdapterId,
      preferredModel: selection.preferredModel,
      allowedAdapterIds: Object.freeze([...selection.allowedAdapterIds]),
      allowFallback: false,
      requireSeed: false,
      seed: null,
    }),
  });
}

function orderedBootstrapCharacters(bootstrap) {
  assert(
    bootstrap.characterCount === 2 &&
      bootstrap.totalProviderGenerationJobs === 24 &&
      bootstrap.candidateSetsPerCharacter === 4 &&
      bootstrap.viewsPerCandidateSet === 3 &&
      bootstrap.providerGenerationJobsPerCharacter === 12,
    'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_BOOTSTRAP_COVERAGE_DRIFT',
  );
  const byId = new Map(
    bootstrap.characters.map((character) => [character.characterId, character]),
  );
  assert(
    byId.size === CHARACTER_ORDER.length &&
      CHARACTER_ORDER.every((characterId) => byId.has(characterId)),
    'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_CHARACTER_ROSTER_DRIFT',
  );
  return CHARACTER_ORDER.map((characterId) => byId.get(characterId));
}

function assertBootstrapJob(job, characterId, requestPath) {
  assert(
    job &&
      typeof job === 'object' &&
      job.characterId === characterId &&
      SET_ORDER.includes(job.setId) &&
      VIEW_ORDER.includes(job.viewId) &&
      job.jobId === `${job.setId}-${job.viewId}` &&
      job.continuityKey === `council-avatars:${characterId}:${job.setId}` &&
      job.operation === 'generate' &&
      job.dimensions?.width === 1024 &&
      job.dimensions?.height === 1536 &&
      job.dimensions?.alpha === 'transparent' &&
      typeof job.targetPath === 'string' &&
      typeof job.prompt === 'string' &&
      job.prompt.length > 100 &&
      job.identityBootstrapOnly === true &&
      job.providerSelectionDeferred === true &&
      job.providerRuntimeProfileRequired === true &&
      job.providerExecution === false &&
      job.providerAuthorizationRequired === true &&
      job.runtimeAsset === false &&
      job.animationFamily === false &&
      job.approvalByGeneration === false &&
      job.promotion === false &&
      job.publication === false &&
      job.gitMutation === false &&
      typeof requestPath === 'string',
    'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_BOOTSTRAP_JOB_DRIFT',
  );
}

function futureAdmissionCommand(job, requestPath, dependent) {
  const command = [
    'node',
    PROVIDER_COMPILER,
    'admit',
    '--identity-request',
    requestPath,
    '--job-id',
    job.jobId,
    '--selection',
    SELECTION_PATH,
    '--actor-id',
    '<named-human-actor-id>',
    '--occurred-at',
    '<iso-8601>',
    '--evidence-sha256',
    '<sha256>',
    '--output',
    `<create-only-provider-admission-${job.characterId}-${job.jobId}.json>`,
  ];
  if (dependent) {
    command.push(
      '--anchor-execution-receipt',
      `<successful-${job.characterId}-${job.setId}-full-body-right-execution-receipt.json>`,
    );
  }
  return Object.freeze(command);
}

function campaignJob({
  ordinal,
  phaseId,
  sourceCharacter,
  bootstrapJob,
  selection,
  anchorJob,
}) {
  const dependent = phaseId === 'dependent-continuity-views';
  assertBootstrapJob(
    bootstrapJob,
    sourceCharacter.characterId,
    sourceCharacter.requestPath,
  );
  if (dependent) {
    assert(
      anchorJob &&
        anchorJob.characterId === bootstrapJob.characterId &&
        anchorJob.setId === bootstrapJob.setId &&
        anchorJob.viewId === 'full-body-right' &&
        anchorJob.continuityKey === bootstrapJob.continuityKey,
      'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_ANCHOR_BINDING_INVALID',
    );
  } else {
    assert(
      bootstrapJob.viewId === 'full-body-right' && anchorJob === null,
      'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_ANCHOR_PHASE_INVALID',
    );
  }
  const body = Object.freeze({
    ordinal,
    phaseId,
    status: 'planned-not-admitted',
    characterId: bootstrapJob.characterId,
    requestPath: sourceCharacter.requestPath,
    setId: bootstrapJob.setId,
    continuityKey: bootstrapJob.continuityKey,
    campaignJobId: `${bootstrapJob.characterId}-${bootstrapJob.jobId}`,
    jobId: bootstrapJob.jobId,
    admissionItemId: bootstrapJob.admissionItemId,
    viewId: bootstrapJob.viewId,
    targetPath: bootstrapJob.targetPath,
    dimensions: Object.freeze({ ...bootstrapJob.dimensions }),
    prompt: bootstrapJob.prompt,
    promptSha256: sha256Bytes(bootstrapJob.prompt),
    selection,
    dependency: dependent
      ? Object.freeze({
          kind: 'same-character-same-set-anchor-execution',
          anchorCampaignJobId: anchorJob.campaignJobId,
          anchorJobId: anchorJob.jobId,
          anchorAdmissionItemId: anchorJob.admissionItemId,
          anchorViewId: 'full-body-right',
          anchorCampaignOrdinal: anchorJob.ordinal,
          requiresSuccessfulExecutionReceipt: true,
          crossSetReuseAllowed: false,
          crossCharacterReuseAllowed: false,
        })
      : null,
    futureAdmissionCommand: futureAdmissionCommand(
      bootstrapJob,
      sourceCharacter.requestPath,
      dependent,
    ),
    limits: Object.freeze({
      candidates: 1,
      providerCalls: 1,
      runtimeAttempts: 1,
      providerFallback: false,
      automaticRetry: false,
    }),
    authority: AUTHORITY,
  });
  return Object.freeze({ ...body, jobSha256: sha256Json(body) });
}

function compileJobs(characters, selection) {
  const sourceById = new Map();
  for (const character of characters) {
    const requests = character.bootstrapAdmission.requests;
    assert(
      requests.length === 12 &&
        character.identityMasterPlan.candidateSetCount === 4 &&
        character.identityMasterPlan.viewCount === 3 &&
        character.identityMasterPlan.totalJobs === 12,
      'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_CHARACTER_COVERAGE_DRIFT',
    );
    const bySetAndView = new Map();
    for (const job of requests) {
      assertBootstrapJob(job, character.characterId, character.requestPath);
      const key = `${job.setId}:${job.viewId}`;
      assert(
        !bySetAndView.has(key),
        'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_DUPLICATE_BOOTSTRAP_JOB',
      );
      bySetAndView.set(key, job);
    }
    assert(
      SET_ORDER.every((setId) =>
        VIEW_ORDER.every((viewId) => bySetAndView.has(`${setId}:${viewId}`)),
      ),
      'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_BOOTSTRAP_MATRIX_INCOMPLETE',
    );
    sourceById.set(
      character.characterId,
      Object.freeze({ character, bySetAndView }),
    );
  }

  const jobs = [];
  const anchors = new Map();
  let ordinal = 1;
  for (const characterId of CHARACTER_ORDER) {
    const source = sourceById.get(characterId);
    for (const setId of SET_ORDER) {
      const bootstrapJob = source.bySetAndView.get(`${setId}:full-body-right`);
      const job = campaignJob({
        ordinal,
        phaseId: 'anchor-generation',
        sourceCharacter: source.character,
        bootstrapJob,
        selection,
        anchorJob: null,
      });
      jobs.push(job);
      anchors.set(`${characterId}:${setId}`, job);
      ordinal += 1;
    }
  }
  for (const characterId of CHARACTER_ORDER) {
    const source = sourceById.get(characterId);
    for (const setId of SET_ORDER) {
      const anchorJob = anchors.get(`${characterId}:${setId}`);
      for (const viewId of DEPENDENT_VIEW_ORDER) {
        const bootstrapJob = source.bySetAndView.get(`${setId}:${viewId}`);
        jobs.push(
          campaignJob({
            ordinal,
            phaseId: 'dependent-continuity-views',
            sourceCharacter: source.character,
            bootstrapJob,
            selection,
            anchorJob,
          }),
        );
        ordinal += 1;
      }
    }
  }
  return Object.freeze(jobs);
}

function validateCompiledJobs(jobs) {
  assert(
    jobs.length === 24 &&
      jobs.slice(0, 8).every((job) => job.phaseId === 'anchor-generation') &&
      jobs
        .slice(8)
        .every((job) => job.phaseId === 'dependent-continuity-views'),
    'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_PHASE_ORDER_DRIFT',
  );
  assert(
    jobs.every((job, index) => job.ordinal === index + 1),
    'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_ORDINAL_DRIFT',
  );
  for (const field of ['campaignJobId', 'admissionItemId', 'targetPath', 'jobSha256']) {
    assert(
      new Set(jobs.map((job) => job[field])).size === jobs.length,
      `COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_DUPLICATE_${field.toUpperCase()}`,
    );
  }
  const anchors = new Map(
    jobs
      .filter((job) => job.phaseId === 'anchor-generation')
      .map((job) => [`${job.characterId}:${job.setId}`, job]),
  );
  assert(
    anchors.size === 8,
    'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_ANCHOR_COUNT_DRIFT',
  );
  for (const job of jobs.slice(8)) {
    const anchor = anchors.get(`${job.characterId}:${job.setId}`);
    assert(
      anchor &&
        job.dependency?.anchorCampaignJobId === anchor.campaignJobId &&
        job.dependency?.anchorJobId === anchor.jobId &&
        job.dependency?.anchorAdmissionItemId === anchor.admissionItemId &&
        job.dependency?.anchorCampaignOrdinal === anchor.ordinal &&
        job.dependency?.crossSetReuseAllowed === false &&
        job.dependency?.crossCharacterReuseAllowed === false,
      'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_DEPENDENCY_DRIFT',
    );
  }
}

export function compileCouncilIdentityCandidateCampaign() {
  const bootstrap = compileCouncilAvatarIdentityBootstrap();
  const characters = orderedBootstrapCharacters(bootstrap);
  const provider = parseSelection();
  const jobs = compileJobs(characters, provider.selection);
  validateCompiledJobs(jobs);

  const sourceCharacters = Object.freeze(
    characters.map((character) =>
      Object.freeze({
        characterId: character.characterId,
        requestPath: character.requestPath,
        requestSha256: character.identityMasterPlan.requestSha256,
        identityMasterPlanSha256: character.identityMasterPlan.planSha256,
        bootstrapAdmissionSha256:
          character.bootstrapAdmission.admissionPlanSha256,
        candidateSetCount: character.candidateSetCount,
        viewCount: character.viewCount,
        providerGenerationJobCount: character.providerGenerationJobCount,
      }),
    ),
  );

  const body = Object.freeze({
    schema: COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_SCHEMA,
    version: COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_VERSION,
    status: 'compile-only-provider-admission-not-established',
    projectId: 'council-avatars',
    source: Object.freeze({
      councilIdentityBootstrapSchema: bootstrap.schema,
      councilIdentityBootstrapSha256: bootstrap.bootstrapSha256,
      characters: sourceCharacters,
      providerSelection: provider.source,
    }),
    providerSelection: provider.selection,
    counts: Object.freeze({
      characters: 2,
      candidateSetsPerCharacter: 4,
      viewsPerCandidateSet: 3,
      jobsPerCharacter: 12,
      anchorJobs: 8,
      dependentJobs: 16,
      totalJobs: 24,
      maximumProviderCallsAfterSeparateAuthorization: 24,
      maximumRuntimeAttemptsAfterSeparateAuthorization: 24,
    }),
    phases: Object.freeze([
      Object.freeze({
        id: 'anchor-generation',
        order: 1,
        jobOrdinals: Object.freeze(jobs.slice(0, 8).map((job) => job.ordinal)),
        viewId: 'full-body-right',
        globalCompletionRequiredBeforeNextPhase: true,
        providerAdmissionEstablished: false,
        providerAuthorizationEstablished: false,
        providerExecutionPerformed: false,
      }),
      Object.freeze({
        id: 'dependent-continuity-views',
        order: 2,
        jobOrdinals: Object.freeze(jobs.slice(8).map((job) => job.ordinal)),
        viewIds: DEPENDENT_VIEW_ORDER,
        requiresAllAnchorExecutionReceipts: true,
        sameSetAnchorReceiptRequired: true,
        providerAdmissionEstablished: false,
        providerAuthorizationEstablished: false,
        providerExecutionPerformed: false,
      }),
    ]),
    jobs,
    executionPolicy: Object.freeze({
      globalAnchorBarrierRequired: true,
      sameCharacterSameSetAnchorRequired: true,
      crossSetAnchorReuseAllowed: false,
      crossCharacterAnchorReuseAllowed: false,
      oneProviderCallPerAuthorizedJob: true,
      oneRuntimeAttemptPerAuthorizedJob: true,
      providerFallbackAllowed: false,
      automaticRetryAllowed: false,
      automaticAuthorizationAllowed: false,
      generationEqualsApproval: false,
      dependentViewsMayExecuteBeforeAnchorBarrier: false,
    }),
    reviewPolicy: Object.freeze({
      exactlyThreeViewsPerCandidateSet: true,
      candidateSetViewOrder: VIEW_ORDER,
      independentContinuityReviewRequired: true,
      exactlyOneSelectedSetRequiredForIdentityCompletion: true,
      selectionGrantsIdentityApproval: false,
      separateIdentityApprovalReceiptRequired: true,
      animationMayBeginBeforeIdentityApproval: false,
    }),
    commandSurfaces: Object.freeze({
      campaignCompiler: CAMPAIGN_COMPILER,
      providerCompiler: PROVIDER_COMPILER,
      providerRunner: PROVIDER_RUNNER,
      compile: Object.freeze([
        'node',
        CAMPAIGN_COMPILER,
        'compile',
        '--output',
        '<create-only-campaign.json>',
      ]),
      validate: Object.freeze([
        'node',
        CAMPAIGN_COMPILER,
        'validate',
        '--input',
        '<campaign.json>',
      ]),
    }),
    nextGate:
      'review this exact 24-job campaign, then separately compile named-human provider admissions and time-bounded one-shot authorizations for the eight anchor jobs; dependent admissions remain blocked until all eight successful same-set anchor execution receipts exist',
    authority: AUTHORITY,
  });
  return Object.freeze({ ...body, campaignSha256: sha256Json(body) });
}

export function validateCouncilIdentityCandidateCampaign(value) {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_INVALID',
  );
  assert(
    value.schema === COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_SCHEMA &&
      value.version === COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_VERSION &&
      typeof value.campaignSha256 === 'string' &&
      SHA256.test(value.campaignSha256),
    'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_SCHEMA_INVALID',
  );
  const body = { ...value };
  delete body.campaignSha256;
  assert(
    sha256Json(body) === value.campaignSha256,
    'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_SELF_HASH_INVALID',
  );
  const expected = compileCouncilIdentityCandidateCampaign();
  assert(
    canonical(value) === canonical(expected),
    'COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_REPOSITORY_BINDING_INVALID',
  );
  return Object.freeze({
    valid: true,
    schema: value.schema,
    version: value.version,
    campaignSha256: value.campaignSha256,
    totalJobs: value.counts.totalJobs,
    anchorJobs: value.counts.anchorJobs,
    dependentJobs: value.counts.dependentJobs,
    providerAdmission: false,
    providerAuthorization: false,
    providerExecution: false,
    identityApproval: false,
    runtimeActivation: false,
    websiteActivation: false,
  });
}

export function councilIdentityCandidateCampaignCapabilities() {
  const campaign = compileCouncilIdentityCandidateCampaign();
  return Object.freeze({
    schema: COUNCIL_IDENTITY_CANDIDATE_CAMPAIGN_CAPABILITIES_SCHEMA,
    version: campaign.version,
    characterIds: CHARACTER_ORDER,
    characterCount: campaign.counts.characters,
    candidateSetsPerCharacter: campaign.counts.candidateSetsPerCharacter,
    viewsPerCandidateSet: campaign.counts.viewsPerCandidateSet,
    anchorJobCount: campaign.counts.anchorJobs,
    dependentJobCount: campaign.counts.dependentJobs,
    totalJobCount: campaign.counts.totalJobs,
    exactAdapterId: campaign.providerSelection.preferredAdapterId,
    exactModel: campaign.providerSelection.preferredModel,
    providerFallbackAllowed: false,
    seedRequired: campaign.providerSelection.requireSeed,
    globalAnchorBarrierRequired: true,
    sameSetAnchorReceiptRequired: true,
    createOnlyCompilation: true,
    providerAdmission: false,
    providerAuthorization: false,
    providerExecution: false,
    candidateApproval: false,
    identityApproval: false,
    animationProduction: false,
    publication: false,
    runtimeActivation: false,
    websiteActivation: false,
  });
}
