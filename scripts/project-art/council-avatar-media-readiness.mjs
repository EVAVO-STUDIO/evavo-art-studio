import { createHash } from 'node:crypto';

import { compileCouncilAvatarProductionProgram } from './council-avatar-production-program.mjs';
import { compileCouncilAvatarIdentityBootstrap } from './council-avatar-identity-bootstrap.mjs';
import { TOP_HAT_RUNTIME_EXPECTED_SLOTS } from './top-hat-pose-slot-provider-runtime-foundation.mjs';

export const COUNCIL_AVATAR_MEDIA_READINESS_SCHEMA =
  'evavo.project-art-council-avatar-media-readiness.v1';

const TOP_HAT_PROVIDER_CAMPAIGN =
  'scripts/run-project-art-top-hat-pose-bank-provider-campaign.mjs';
const EVA_DENSE_WORK_ORDER_CHECKER =
  'scripts/check-project-art-eva-dense-motion-work-order.mjs';
const IDENTITY_MASTER_PLANNER = 'scripts/character-identity-master-plan.mjs';
const IDENTITY_BOOTSTRAP_ADMISSION =
  'scripts/character-identity-bootstrap-admission.mjs';
const IDENTITY_CANDIDATE_REVIEW =
  'scripts/character-identity-candidate-review-plan.mjs';

const EVA_TEMPORARY_FALLBACK_ORDINALS = Object.freeze([4, 5, 6]);
const EVA_PENDING_MASTERING_ORDINALS = Object.freeze([1, 2, 3, 7, 8, 9, 10]);
const EVA_FINAL_REQUIRED_DENSE_MASTER_ORDINALS = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
]);

const AUTHORITY = Object.freeze({
  providerSelection: false,
  providerAdmission: false,
  providerAuthorization: false,
  providerExecution: false,
  candidateMaterialization: false,
  creativeReview: false,
  candidateApproval: false,
  identityApproval: false,
  animationApproval: false,
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

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
};

const sha256 = (value) =>
  createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

function topHatReadiness(character) {
  assert(
    TOP_HAT_RUNTIME_EXPECTED_SLOTS.length === 6,
    'COUNCIL_AVATAR_TOP_HAT_SLOT_COVERAGE_DRIFT',
  );
  return Object.freeze({
    seatId: character.seatId,
    seatLabel: character.seatLabel,
    characterId: character.characterId,
    characterLabel: character.characterLabel,
    stage: 'identity-ready-pose-bank-blocked',
    identityReady: true,
    authoredAnimationReady: false,
    productionReady: false,
    planningReady: true,
    currentMedia: Object.freeze({
      admittedBodyPoseCount: 3,
      admittedBodyPoses: Object.freeze(['neutral', 'inhale', 'exhale']),
      missingBodyPoseCount: TOP_HAT_RUNTIME_EXPECTED_SLOTS.length,
      missingBodyPoses: Object.freeze([...TOP_HAT_RUNTIME_EXPECTED_SLOTS]),
      expandedPerformanceReady: false,
    }),
    execution: Object.freeze({
      providerExecutionSurfaceAvailable: true,
      providerExecutionEstablished: false,
      providerSelectionEstablished: false,
      providerAuthorizationEstablished: false,
      runner: TOP_HAT_PROVIDER_CAMPAIGN,
      argvTemplate: Object.freeze([
        'node',
        TOP_HAT_PROVIDER_CAMPAIGN,
        '--adapter',
        '<absolute-adapter-json>',
        '--expected-adapter-file-sha256',
        '<sha256>',
        '--runtime-root',
        '<absolute-runtime-root>',
        '--artifact-root',
        '<absolute-artifact-root>',
        '--output-root',
        '<absolute-create-only-output-root>',
        '--worker-prefix',
        'top-hat-pose-bank-provider',
      ]),
      maximumProviderCallsPerSlot: 1,
      authorizationMaximumHours: 24,
    }),
    blockers: Object.freeze([
      'six required authored performance body poses are not admitted to Avatar Runtime',
      'an exact provider runtime adapter and its SHA-256 are not established by repository state',
      'slot-specific named-human one-shot provider authorizations are not established by repository state',
      'candidate image bytes have not been materialized, reviewed and approved for the six missing slots',
    ]),
    requiredNextEvidence: Object.freeze([
      'exact reference artifacts for every missing pose slot',
      'explicit allowed adapter and provider/model selection bound to the provider package',
      'expected adapter-file SHA-256',
      'deterministic seed where the selected provider path requires one',
      'slot-specific named-human authorization expiring no later than 24 hours after authorization',
      'provider execution receipts and exact candidate/evidence artifact identities',
    ]),
    downstreamGates: Object.freeze([
      'candidate materialization',
      'frame finishing and transparency mastering',
      'independent deterministic QA and visual review',
      'named-human pose-slot decisions',
      'pose-bank release',
      'Avatar Runtime publication',
      'website installation and activation',
    ]),
    nextGate:
      'supply exact adapter/reference evidence and six bounded slot authorizations, then run the existing Top Hat provider campaign; generation remains candidate-only',
    authority: AUTHORITY,
  });
}

function evaReadiness(character) {
  return Object.freeze({
    seatId: character.seatId,
    seatLabel: character.seatLabel,
    characterId: character.characterId,
    characterLabel: character.characterLabel,
    stage: 'identity-ready-dense-bootstrap-incomplete',
    identityReady: true,
    authoredAnimationReady: false,
    productionReady: false,
    planningReady: true,
    currentMedia: Object.freeze({
      denseBootstrapTargetCount: 10,
      temporaryFallbackOrdinals: EVA_TEMPORARY_FALLBACK_ORDINALS,
      pendingMasteringOrdinals: EVA_PENDING_MASTERING_ORDINALS,
      finalRequiredNewDenseMasterOrdinals: EVA_FINAL_REQUIRED_DENSE_MASTER_ORDINALS,
      legacyPoseReuseAllowedForFinalRelease: false,
      syntheticBodyTransformsAllowed: false,
    }),
    execution: Object.freeze({
      providerExecutionSurfaceAvailable: false,
      providerExecutionEstablished: false,
      providerSelectionEstablished: false,
      providerAuthorizationEstablished: false,
      localValidationEntry: EVA_DENSE_WORK_ORDER_CHECKER,
      namedWorkerTask: 'eva-avatar-worker-stack',
      providerRunner: null,
    }),
    blockers: Object.freeze([
      'all ten immutable new dense-motion master identities are not complete',
      'the temporary legacy/provenance fallback at ordinals 4, 5 and 6 may not become final release media',
      'a governed EVA dense-motion provider execution transaction is not established by repository state',
      'ten-edge continuity evidence including frame 10 to frame 1 loop closure is incomplete',
      'the complete 749-image authored animation family has not been approved and released',
    ]),
    requiredNextEvidence: Object.freeze([
      'new deterministic dense identities for ordinals 1 through 10',
      'immutable artifact hashes for all ten dense masters',
      'independent continuity review for all ten edges including 10 to 1',
      'provider/admission/authorization evidence for any provider generation transaction',
      'complete authored animation-suite QA and approval evidence before Runtime publication',
    ]),
    downstreamGates: Object.freeze([
      'complete and master all ten dense identities',
      'prove ten-edge continuity and loop closure',
      'compile the canonical 749-image animation suite',
      'independent QA and creative approval',
      'Avatar Runtime publication',
      'website installation and activation',
    ]),
    nextGate:
      'complete the governed ten-master dense bootstrap without synthetic transforms or legacy-pose final release, then advance through the canonical animation suite',
    authority: AUTHORITY,
  });
}

function newIdentityReadiness(character, bootstrapCharacter) {
  const admission = bootstrapCharacter.bootstrapAdmission;
  assert(
    bootstrapCharacter.providerGenerationJobCount === 12 &&
      bootstrapCharacter.candidateSetCount === 4 &&
      bootstrapCharacter.viewCount === 3,
    'COUNCIL_AVATAR_IDENTITY_BOOTSTRAP_COVERAGE_DRIFT',
  );
  assert(
    admission.authority.providerExecution === false &&
      admission.authority.providerAuthorizationRequired === true,
    'COUNCIL_AVATAR_IDENTITY_BOOTSTRAP_AUTHORITY_DRIFT',
  );

  return Object.freeze({
    seatId: character.seatId,
    seatLabel: character.seatLabel,
    characterId: character.characterId,
    characterLabel: character.characterLabel,
    stage: 'identity-master-provider-gate-required',
    identityReady: false,
    authoredAnimationReady: false,
    productionReady: false,
    planningReady: true,
    currentMedia: Object.freeze({
      requestPath: bootstrapCharacter.requestPath,
      candidateSetCount: bootstrapCharacter.candidateSetCount,
      viewsPerCandidateSet: bootstrapCharacter.viewCount,
      providerGenerationJobCount: bootstrapCharacter.providerGenerationJobCount,
      candidateArtifactCountAdmittedToRuntime: 0,
      approvedIdentityMasterCount: 0,
    }),
    execution: Object.freeze({
      providerExecutionSurfaceAvailable: false,
      providerExecutionEstablished: false,
      providerSelectionEstablished: false,
      providerAuthorizationEstablished: false,
      planningCommands: Object.freeze([
        Object.freeze([
          'node',
          IDENTITY_MASTER_PLANNER,
          'compile',
          '--input',
          bootstrapCharacter.requestPath,
          '--output',
          '<create-only-identity-master-plan.json>',
        ]),
        Object.freeze([
          'node',
          IDENTITY_BOOTSTRAP_ADMISSION,
          'compile',
          '--input',
          '<identity-master-plan.json>',
          '--output',
          '<create-only-bootstrap-admission.json>',
        ]),
      ]),
      candidateReviewPlanner: IDENTITY_CANDIDATE_REVIEW,
      providerRunner: null,
    }),
    blockers: Object.freeze([
      'no approved continuity-locked identity master exists',
      'provider selection and runtime profile are deferred',
      'no character-identity provider execution runtime is established by repository state',
      'time-bounded provider execution authorization is not established by repository state',
      'candidate generation receipts, exact artifact hashes and separate identity approval are absent',
    ]),
    requiredNextEvidence: Object.freeze([...admission.requiredNextEvidence]),
    downstreamGates: Object.freeze([
      'establish a governed character-identity provider execution surface',
      'execute the 12 admitted identity candidate jobs under bounded authorization',
      'materialize exact candidate artifact hashes and generation receipts',
      'review all three continuity views for each candidate set',
      'approve exactly one identity set under a separate identity approval receipt',
      'master the approved identity at exact 1024x1536 straight-alpha RGBA',
      'compile and review the canonical 749-image animation suite',
      'Avatar Runtime publication',
      'website installation and activation',
    ]),
    nextEngineeringGate:
      'add a governed character-identity provider execution transaction that consumes the exact bootstrap admission plus provider profile/admission/authorization evidence; do not reuse the mobile-identity provider runtime',
    nextGate: admission.nextGate,
    authority: AUTHORITY,
  });
}

export function compileCouncilAvatarMediaReadiness() {
  const program = compileCouncilAvatarProductionProgram();
  const identityBootstrap = compileCouncilAvatarIdentityBootstrap();

  assert(
    program.seatCount === 4 && program.characterCount === 4,
    'COUNCIL_AVATAR_MEDIA_READINESS_ROSTER_DRIFT',
  );
  assert(
    new Set(program.characters.map((character) => character.characterId)).size === 4,
    'COUNCIL_AVATAR_MEDIA_READINESS_IDENTITY_REUSE',
  );
  assert(
    program.animationStandard.totalPlannedImagesPerCharacter === 749,
    'COUNCIL_AVATAR_MEDIA_READINESS_ANIMATION_STANDARD_DRIFT',
  );

  const bootstrapByCharacter = new Map(
    identityBootstrap.characters.map((character) => [character.characterId, character]),
  );

  const characters = Object.freeze(
    program.characters.map((character) => {
      if (character.characterId === 'top-hat-man') return topHatReadiness(character);
      if (character.characterId === 'eva-female') return evaReadiness(character);
      const bootstrapCharacter = bootstrapByCharacter.get(character.characterId);
      assert(
        bootstrapCharacter,
        'COUNCIL_AVATAR_MEDIA_READINESS_NEW_IDENTITY_BOOTSTRAP_MISSING',
      );
      return newIdentityReadiness(character, bootstrapCharacter);
    }),
  );

  assert(
    bootstrapByCharacter.size === 2 &&
      [...bootstrapByCharacter.keys()].every((id) =>
        ['council-critic', 'council-open-reviewer'].includes(id),
      ),
    'COUNCIL_AVATAR_MEDIA_READINESS_BOOTSTRAP_ROSTER_DRIFT',
  );

  const identityReadyCount = characters.filter((character) => character.identityReady).length;
  const productionReadyCount = characters.filter((character) => character.productionReady).length;
  const providerExecutionEstablishedCount = characters.filter(
    (character) => character.execution.providerExecutionEstablished,
  ).length;

  const base = Object.freeze({
    schema: COUNCIL_AVATAR_MEDIA_READINESS_SCHEMA,
    status: 'blocked-by-governed-media-evidence',
    sourceContract: Object.freeze({
      councilProductionProgram: 'scripts/project-art/council-avatar-production-program.mjs',
      councilIdentityBootstrap: 'scripts/project-art/council-avatar-identity-bootstrap.mjs',
      topHatProviderCampaign: TOP_HAT_PROVIDER_CAMPAIGN,
      evaDenseMotionWorkOrderChecker: EVA_DENSE_WORK_ORDER_CHECKER,
      councilWorkerTaskName: 'council-avatar-worker-stack',
      evaWorkerTaskName: 'eva-avatar-worker-stack',
      characterIdentityProviderExecutionSurface: null,
      unrelatedMobileIdentityProviderRuntimeMayBeReused: false,
    }),
    seatCount: program.seatCount,
    characterCount: characters.length,
    identityReadyCount,
    identityMasterGenerationCount: characters.length - identityReadyCount,
    productionReadyCount,
    providerExecutionEstablishedCount,
    totalPlannedImagesPerCharacter: program.animationStandard.totalPlannedImagesPerCharacter,
    characters,
    release: Object.freeze({
      allCouncilMediaProductionReady: productionReadyCount === characters.length,
      websiteActivationAllowed: false,
      runtimeActivationAllowed: false,
      partialCharacterReleaseAllowed: false,
      sparsePoseApproximationMayClaimProductionAnimation: false,
      generationEqualsApproval: false,
    }),
    authority: AUTHORITY,
  });

  assert(
    identityReadyCount === 2 &&
      productionReadyCount === 0 &&
      providerExecutionEstablishedCount === 0,
    'COUNCIL_AVATAR_MEDIA_READINESS_EXPECTED_BLOCKER_DRIFT',
  );

  return Object.freeze({ ...base, readinessSha256: sha256(base) });
}
