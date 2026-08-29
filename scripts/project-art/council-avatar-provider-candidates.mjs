import { createHash } from 'node:crypto';

import { compileCouncilAvatarProductionProgram } from './council-avatar-production-program.mjs';

export const COUNCIL_AVATAR_PROVIDER_CANDIDATE_PLAN_SCHEMA =
  'evavo.project-art-council-avatar-provider-candidate-plan.v1';
export const COUNCIL_AVATAR_PROVIDER_REQUEST_SCHEMA =
  'evavo.project-art-council-avatar-provider-request.v1';

const DEFAULT_ADAPTER_ID = 'openai-gpt-image';
const DEFAULT_MODEL = 'gpt-image-2';
const DEFAULT_CANDIDATE_COUNT = 4;
const MAXIMUM_CANDIDATE_COUNT = 8;

const AUTHORITY = Object.freeze({
  providerExecution: false,
  candidateApproval: false,
  candidatePromotion: false,
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

const MUST_AVOID = Object.freeze([
  'generic AI-assistant character styling',
  'startup mascot styling',
  'cute mascot proportions',
  'glossy game-character rendering',
  'cyberpunk neon',
  'robot parts',
  'headsets',
  'glowing eyes',
  'floating interface graphics',
  'holograms',
  'text',
  'logos',
  'watermarks',
  'checkerboard backgrounds',
  'scenery',
  'multiple characters',
  'cropped head',
  'cropped hands or appendages',
  'cropped feet',
  'unstable eye count',
  'unstable digit count',
  'asymmetric anatomy drift not specified by the identity brief',
  'protected-character imitation',
]);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

function boundedCandidateCount(value) {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAXIMUM_CANDIDATE_COUNT
  ) {
    throw new Error(
      `candidateCount must be an integer between 1 and ${MAXIMUM_CANDIDATE_COUNT}`,
    );
  }
  return value;
}

function providerIdentifier(value, label) {
  if (
    typeof value !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function providerRequest(character, program, options) {
  const brief = character.identityBrief;
  if (!brief || character.identityStatus !== 'identity-master-required') {
    throw new Error(
      `Council character ${character.characterId} is not eligible for identity-master generation`,
    );
  }

  const request = Object.freeze({
    schemaVersion: '1.0',
    operation: 'generate',
    assetKind: 'illustration',
    continuityPhase: 'identity-master',
    assetId: `council-avatar:${character.characterId}:identity-master`,
    candidateFamilyId: `council-avatar:${character.characterId}:identity`,
    creativeIntent: brief.providerPrompt,
    negativeIntent: MUST_AVOID.join('. '),
    style: Object.freeze({
      styleName: 'EVAVO Council editorial character identity',
      intent:
        'Create one immutable identity-lock master for production avatar animation. Preserve deliberate creature anatomy and premium editorial art direction across later views and frames.',
      mustHave: Object.freeze([
        ...brief.globalVisualLock,
        ...brief.identityDirection,
      ]),
      mustAvoid: MUST_AVOID,
      identityLocks: Object.freeze([...brief.identityDirection]),
      palette: Object.freeze([
        'restrained black',
        'off-white',
        'character-specific natural material tones',
        'one restrained cherry-red EVAVO construction accent where specified',
      ]),
      lineTreatment: Object.freeze([
        'clean authored silhouette',
        'controlled editorial material detail',
        'no noisy diffusion texture or synthetic over-detailing',
      ]),
      materials: Object.freeze([
        'practical creature-design material logic',
        'credible textile and surface response',
        'no plastic toy finish',
      ]),
      cameraRules: Object.freeze([
        'eye level',
        'straight-on to very slight three-quarter view',
        'no dramatic perspective',
        'no fisheye or wide-angle distortion',
      ]),
      compositionRules: Object.freeze([
        'one complete full-body character only',
        'character occupies approximately 82 percent of canvas height',
        'complete head, appendages or hands and feet remain visible',
        'safe transparent clearance around the full silhouette',
        'neutral presentation pose suitable as an animation identity master',
      ]),
      eraRules: Object.freeze([]),
    }),
    shot: Object.freeze({
      subject: `${character.characterLabel}, ${character.role}`,
      action: 'neutral identity-lock presentation pose',
      direction: 'straight-on to slight three-quarter at eye level',
      include: Object.freeze([
        ...brief.identityDirection,
        'stable readable silhouette',
        'complete anatomy',
        'animation-friendly neutral posture',
      ]),
      exclude: MUST_AVOID,
      separateAssets: Object.freeze([]),
      framing: Object.freeze([
        'full body',
        '1024x1536 portrait canvas',
        'approximately 82 percent character height',
        'safe clearance on every edge',
      ]),
    }),
    target: Object.freeze({
      width: brief.targetCanvas.width,
      height: brief.targetCanvas.height,
      transparency: 'required',
      outputFormat: 'png',
    }),
    background: Object.freeze({ strategy: 'provider-auto' }),
    quality: 'high',
    candidateCount: options.candidateCount,
    selection: Object.freeze({
      preferredAdapterId: options.preferredAdapterId,
      preferredModel: options.preferredModel,
      allowedAdapterIds: Object.freeze([options.preferredAdapterId]),
      allowFallback: false,
      requireSeed: false,
    }),
    metadata: Object.freeze({
      schema: COUNCIL_AVATAR_PROVIDER_REQUEST_SCHEMA,
      councilSeatId: character.seatId,
      characterId: character.characterId,
      characterLabel: character.characterLabel,
      role: character.role,
      productionProgramSha256: program.programSha256,
      identityBriefSha256: brief.briefSha256,
      identityStatusAtCompilation: character.identityStatus,
      providerExecutionAuthorized: false,
      candidateApprovalEstablished: false,
      candidatePromotionEstablished: false,
      runtimeActivationEstablished: false,
      websiteActivationEstablished: false,
    }),
  });

  return Object.freeze({
    seatId: character.seatId,
    seatLabel: character.seatLabel,
    characterId: character.characterId,
    characterLabel: character.characterLabel,
    identityBriefSha256: brief.briefSha256,
    request,
    requestSha256: sha256(request),
    candidateOutputDirectory: `artifacts/council-avatar-candidates/${character.characterId}/identity-master`,
    expectedCandidateCount: options.candidateCount,
    candidateApprovalEstablished: false,
    candidatePromotionEstablished: false,
    runtimeActivationEstablished: false,
    authority: AUTHORITY,
  });
}

export function compileCouncilAvatarProviderCandidatePlan({
  candidateCount = DEFAULT_CANDIDATE_COUNT,
  preferredAdapterId = DEFAULT_ADAPTER_ID,
  preferredModel = DEFAULT_MODEL,
} = {}) {
  const options = Object.freeze({
    candidateCount: boundedCandidateCount(candidateCount),
    preferredAdapterId: providerIdentifier(
      preferredAdapterId,
      'preferredAdapterId',
    ),
    preferredModel: providerIdentifier(preferredModel, 'preferredModel'),
  });
  const program = compileCouncilAvatarProductionProgram();
  const eligible = program.characters.filter(
    (character) => character.identityStatus === 'identity-master-required',
  );
  if (eligible.length !== program.identityMasterGenerationCount) {
    throw new Error('COUNCIL_AVATAR_IDENTITY_GENERATION_COUNT_DRIFT');
  }
  if (
    eligible.some(
      (character) => !character.identityBrief || character.productionReady !== false,
    )
  ) {
    throw new Error('COUNCIL_AVATAR_IDENTITY_GENERATION_ELIGIBILITY_DRIFT');
  }

  const jobs = Object.freeze(
    eligible.map((character) => providerRequest(character, program, options)),
  );
  const generatedIds = new Set(jobs.map((job) => job.characterId));
  for (const character of program.characters) {
    if (
      character.identityStatus !== 'identity-master-required' &&
      generatedIds.has(character.characterId)
    ) {
      throw new Error(
        `COUNCIL_AVATAR_EXISTING_IDENTITY_REGENERATION_FORBIDDEN:${character.characterId}`,
      );
    }
  }

  const body = Object.freeze({
    schema: COUNCIL_AVATAR_PROVIDER_CANDIDATE_PLAN_SCHEMA,
    productionProgramSha256: program.programSha256,
    providerProtocolTarget: 'packages/providers',
    preferredAdapterId: options.preferredAdapterId,
    preferredModel: options.preferredModel,
    candidateCountPerCharacter: options.candidateCount,
    eligibleCharacterCount: jobs.length,
    eligibleCharacterIds: Object.freeze(jobs.map((job) => job.characterId)),
    jobs,
    reviewPolicy: Object.freeze({
      independentVisualReviewRequired: true,
      minimumIndependentReviewers: 2,
      exactCanvasInspectionRequired: true,
      transparencyInspectionRequired: true,
      silhouetteInspectionRequired: true,
      anatomyRegistrationInspectionRequired: true,
      eyeCountRegistrationInspectionRequired: true,
      digitCountRegistrationInspectionRequired: true,
      crossCandidateIdentityConsistencyInspectionRequired: true,
      genericAiAestheticRejectionRequired: true,
      candidateGenerationMayApproveIdentity: false,
      providerSuccessMayApproveIdentity: false,
      candidateGenerationMayPromoteRuntime: false,
    }),
    nextActions: Object.freeze([
      'Compile each jobs[].request through the canonical @evavo/art-providers contract before any remote call.',
      'Require separate explicit provider execution authorization; this plan grants none.',
      'Write generated candidates only to the isolated candidate output directory.',
      'Run exact-canvas, alpha, silhouette, anatomy and independent visual review before selecting an identity master.',
      'Record the selected candidate identity hash as a separate approval artifact.',
      'Do not author production animation until the identity-lock approval artifact exists.',
      'Do not promote media into Avatar Runtime or next-website until the animation release gate passes.',
    ]),
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    runtimeActivationAllowed: false,
    websiteActivationAllowed: false,
    authority: AUTHORITY,
  });

  return Object.freeze({
    ...body,
    planSha256: sha256(body),
  });
}

export function councilAvatarProviderCandidateCapabilities() {
  const plan = compileCouncilAvatarProviderCandidatePlan();
  return Object.freeze({
    schema: 'evavo.project-art-council-avatar-provider-candidate-capabilities.v1',
    eligibleCharacterCount: plan.eligibleCharacterCount,
    eligibleCharacterIds: plan.eligibleCharacterIds,
    defaultCandidateCountPerCharacter: DEFAULT_CANDIDATE_COUNT,
    maximumCandidateCountPerCharacter: MAXIMUM_CANDIDATE_COUNT,
    preferredAdapterId: plan.preferredAdapterId,
    preferredModel: plan.preferredModel,
    providerRequestCompilationAvailable: true,
    providerExecutionAuthorized: false,
    candidateApprovalEstablished: false,
    candidatePromotionEstablished: false,
    runtimeActivationAllowed: false,
    websiteActivationAllowed: false,
  });
}
