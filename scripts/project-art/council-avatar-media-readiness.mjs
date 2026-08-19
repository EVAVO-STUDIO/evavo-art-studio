import { createHash } from 'node:crypto';

import { compileCouncilAvatarProductionProgram } from './council-avatar-production-program.mjs';
import { compileCouncilAvatarIdentityBootstrap } from './council-avatar-identity-bootstrap.mjs';
import { evaDenseMotionTenMasterCapabilities } from './eva-dense-motion-ten-master-program.mjs';
import { TOP_HAT_RUNTIME_EXPECTED_SLOTS } from './top-hat-pose-slot-provider-runtime-foundation.mjs';

export const COUNCIL_AVATAR_MEDIA_READINESS_SCHEMA =
  'evavo.project-art-council-avatar-media-readiness.v1';

const TOP_HAT_PROVIDER_CAMPAIGN =
  'scripts/run-project-art-top-hat-pose-bank-provider-campaign.mjs';
const EVA_DENSE_WORK_ORDER_CHECKER =
  'scripts/check-project-art-eva-dense-motion-work-order.mjs';
const EVA_TEN_MASTER_PROGRAM =
  'scripts/project-art/eva-dense-motion-ten-master-program.mjs';
const EVA_TEN_MASTER_COMPILER =
  'scripts/compile-project-art-eva-dense-motion-ten-master.mjs';
const EVA_WORKSTATION_TASK = 'config/eva-dense-motion-workstation-task-v1.json';
const IDENTITY_MASTER_PLANNER = 'scripts/character-identity-master-plan.mjs';
const IDENTITY_BOOTSTRAP_ADMISSION =
  'scripts/character-identity-bootstrap-admission.mjs';
const IDENTITY_CANDIDATE_REVIEW =
  'scripts/character-identity-candidate-review-plan.mjs';
const CHARACTER_IDENTITY_PROVIDER_COMPILER =
  'scripts/compile-project-art-character-identity-provider-runtime.mjs';
const CHARACTER_IDENTITY_PROVIDER_RUNNER =
  'scripts/run-project-art-character-identity-provider.mjs';

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
  const tenMaster = evaDenseMotionTenMasterCapabilities();
  assert(
    tenMaster.exactTenNewMasterJobs === true &&
      tenMaster.fallbackRemasterJobCount === 3 &&
      tenMaster.legacyFallbackMaySatisfyFinalMasterGate === false &&
      tenMaster.atomicTenMasterActivationRequired === true &&
      tenMaster.providerExecution === false &&
      tenMaster.cloudinaryUpload === false &&
      tenMaster.runtimeActivation === false,
    'COUNCIL_AVATAR_EVA_TEN_MASTER_CAPABILITY_DRIFT',
  );

  return Object.freeze({
    seatId: character.seatId,
    seatLabel: character.seatLabel,
    characterId: character.characterId,
    characterLabel: character.characterLabel,
    stage: 'identity-ready-ten-master-program-blocked',
    identityReady: true,
    authoredAnimationReady: false,
    productionReady: false,
    planningReady: true,
    currentMedia: Object.freeze({
      denseBootstrapTargetCount: 10,
      temporaryFallbackOrdinals: EVA_TEMPORARY_FALLBACK_ORDINALS,
      pendingMasteringOrdinals: EVA_PENDING_MASTERING_ORDINALS,
      finalRequiredNewDenseMasterOrdinals: EVA_FINAL_REQUIRED_DENSE_MASTER_ORDINALS,
      tenMasterProductionProgramAvailable: true,
      tenMasterRequiredNewMasterCount: 10,
      fallbackRemasterOrdinals: EVA_TEMPORARY_FALLBACK_ORDINALS,
      masteredDenseMasterCount: 0,
      legacyPoseReuseAllowedForFinalRelease: false,
      syntheticBodyTransformsAllowed: false,
    }),
    execution: Object.freeze({
      providerExecutionSurfaceAvailable: false,
      providerExecutionEstablished: false,
      providerSelectionEstablished: false,
      providerAuthorizationEstablished: false,
      masteringPlanningSurfaceAvailable: true,
      masteringExecutionSurfaceAvailable: false,
      masteringExecutionEstablished: false,
      localValidationEntry: EVA_DENSE_WORK_ORDER_CHECKER,
      tenMasterProgram: EVA_TEN_MASTER_PROGRAM,
      tenMasterCompiler: EVA_TEN_MASTER_COMPILER,
      tenMasterPlanningCommand: Object.freeze([
        'node',
        EVA_TEN_MASTER_COMPILER,
        '--program-id',
        '<program-id>',
        '--actor-id',
        '<actor-id>',
        '--created-at',
        '<iso-8601>',
        '--output',
        '<create-only-ten-master-program.json>',
      ]),
      workstationTask: EVA_WORKSTATION_TASK,
      namedWorkerTask: 'eva-avatar-worker-stack',
      providerRunner: null,
      atomicTenMasterActivationRequired: true,
      legacyFallbackMaySatisfyFinalMasterGate: false,
    }),
    blockers: Object.freeze([
      'all ten immutable new dense-motion masters are not complete',
      'the current fallback masters at ordinals 4, 5 and 6 may not satisfy the final ten-master release gate and require new dense-motion remasters',
      'the ten-master planning surface is available, but no governed bulk mastering/upload execution evidence is established by repository state',
      'ten-edge continuity evidence including frame 10 to frame 1 loop closure is incomplete',
      'the complete 749-image authored animation family has not been approved and released',
    ]),
    requiredNextEvidence: Object.freeze([
      'self-hashed v2 ten-master production program bound to the exact ten source frames',
      'new immutable asset IDs and master SHA-256 values for ordinals 1 through 10',
      'candidate assurance, alpha mastering, frame-finisher, technical inspection and creative approval evidence for all ten masters',
      'proof that legacy fallback assets at ordinals 4, 5 and 6 were not reused as final dense masters',
      'independent continuity review for all ten edges including 10 to 1',
      'complete authored animation-suite QA and approval evidence before Runtime publication',
    ]),
    downstreamGates: Object.freeze([
      'compile the v2 ten-master production program',
      'master and approve all ten new dense identities through the governed per-frame pipeline',
      'prove ten unique immutable final master identities and exclude the legacy 4/5/6 fallback from the final set',
      'prove ten-edge continuity and loop closure',
      'compile the canonical 749-image animation suite',
      'independent QA and creative approval',
      'Avatar Runtime publication',
      'website installation and activation',
    ]),
    nextGate:
      'compile the governed v2 ten-master program, then collect per-frame mastering and approval evidence for all ten ordinals while retaining the live 4/5/6 fallback until atomic ten-master activation; planning does not grant mastering, upload or Runtime activation authority',
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
    stage: 'identity-master-provider-execution-ready-for-evidence',
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
      providerExecutionSurfaceAvailable: true,
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
      providerCompiler: CHARACTER_IDENTITY_PROVIDER_COMPILER,
      providerRunner: CHARACTER_IDENTITY_PROVIDER_RUNNER,
      setAnchorViewId: 'full-body-right',
      dependentViewIds: Object.freeze(['full-body-left', 'neutral-bust']),
      sameSetAnchorArtifactRequiredForDependentViews: true,
      maximumProviderCallsPerJob: 1,
      maximumRuntimeAttempts: 1,
      authorizationMaximumHours: 24,
      providerFallbackAllowed: false,
    }),
    blockers: Object.freeze([
      'no approved continuity-locked identity master exists',
      'provider selection and runtime profile are deferred',
      'no real provider admission, time-bounded authorization or execution receipts are established by repository state',
      'candidate generation receipts, exact artifact hashes and separate identity approval are absent',
    ]),
    requiredNextEvidence: Object.freeze([...admission.requiredNextEvidence]),
    downstreamGates: Object.freeze([
      'compile exact provider admission, bounded authorization and runtime adapter for each admitted identity candidate job',
      'execute each candidate set anchor first, then execute its dependent views from the exact same-set unapproved anchor artifact',
      'materialize exact candidate artifact hashes and generation receipts',
      'review all three continuity views for each candidate set',
      'approve exactly one identity set under a separate identity approval receipt',
      'master the approved identity at exact 1024x1536 straight-alpha RGBA',
      'compile and review the canonical 749-image animation suite',
      'Avatar Runtime publication',
      'website installation and activation',
    ]),
    nextEngineeringGate:
      'bind an exact provider/model selection and a named-human authorization expiring within 24 hours to each admitted job; generate full-body-right first for each set, then generate left and bust views only from that exact unapproved same-set anchor candidate',
    nextGate:
      'execute candidate-only identity generation through the governed character-identity provider runtime; generation remains separate from identity approval, animation, publication and activation',
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
  const providerExecutionSurfaceAvailableCount = characters.filter(
    (character) => character.execution.providerExecutionSurfaceAvailable,
  ).length;
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
      evaDenseMotionTenMasterProgram: EVA_TEN_MASTER_PROGRAM,
      evaDenseMotionTenMasterCompiler: EVA_TEN_MASTER_COMPILER,
      evaDenseMotionWorkstationTask: EVA_WORKSTATION_TASK,
      councilWorkerTaskName: 'council-avatar-worker-stack',
      evaWorkerTaskName: 'eva-avatar-worker-stack',
      characterIdentityProviderCompiler: CHARACTER_IDENTITY_PROVIDER_COMPILER,
      characterIdentityProviderExecutionSurface: CHARACTER_IDENTITY_PROVIDER_RUNNER,
      unrelatedMobileIdentityProviderRuntimeMayBeReused: false,
    }),
    seatCount: program.seatCount,
    characterCount: characters.length,
    identityReadyCount,
    identityMasterGenerationCount: characters.length - identityReadyCount,
    productionReadyCount,
    providerExecutionSurfaceAvailableCount,
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
      providerExecutionSurfaceAvailableCount === 3 &&
      providerExecutionEstablishedCount === 0,
    'COUNCIL_AVATAR_MEDIA_READINESS_EXPECTED_BLOCKER_DRIFT',
  );

  return Object.freeze({ ...base, readinessSha256: sha256(base) });
}
