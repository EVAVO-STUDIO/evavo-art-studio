import {
  createCouncilCharacterAssignmentPlan,
  missingCouncilCharacterProductionRequests,
} from "./council-character-assignments.js";
import {
  EVA_DENSE_MOTION_CURRENTLY_ADMITTED_ORDINALS,
  EVA_DENSE_MOTION_CURRENTLY_PENDING_ORDINALS,
  EVA_DENSE_MOTION_REQUIRED_FRAME_COUNT,
} from "./eva-dense-motion-admission.js";
import {
  COUNCIL_PROCEDURAL_REVIEW_CHARACTERS,
  parseCouncilProceduralReviewAtlasManifest,
} from "./council-procedural-review-atlas.js";
import { inspectTopHatBodyPoseBank } from "./top-hat-body-pose-bank.js";

export const COUNCIL_AVATAR_PRODUCTION_STATUS_VERSION =
  "evavo_council_avatar_production_status_v1";

export const COUNCIL_AVATAR_AUTHORITATIVE_MEMBERS = Object.freeze([
  Object.freeze({ id: "architect", label: "Architect" }),
  Object.freeze({ id: "critic", label: "Critic" }),
  Object.freeze({ id: "researcher", label: "Researcher" }),
  Object.freeze({ id: "open-reviewer", label: "Open Reviewer" }),
]);

export const COUNCIL_AVATAR_AUTHORITATIVE_PREFERENCES = Object.freeze({
  architect: "top-hat-man",
  critic: "council-critic",
  researcher: "eva-female",
  "open-reviewer": "council-open-reviewer",
});

export const COUNCIL_AVATAR_PRODUCTION_STANDARD = Object.freeze({
  canvas: Object.freeze({ width: 1024, height: 1536, alpha: "rgba8-straight" }),
  completeClipCount: 25,
  fullCharacterFrameCount: 732,
  registeredPoseLayerCount: 17,
  totalPlannedImagesPerCharacter: 749,
  idleVariantCount: 4,
  talkVariantCount: 6,
  minimumAuthoredFps: 24,
  preferredAuthoredFps: 30,
  displayTargetFps: 60,
  independentFrameInspectors: 2,
  minimumReviewConfidence: 0.95,
  genuineTransparencyRequired: true,
  continuityEvidenceRequired: true,
  loopClosureEvidenceRequired: true,
  separateMouthLayerRequired: true,
  separateEyeLayerRequired: true,
  exactAudioTimingRequired: true,
  sparsePoseApproximationMayClaimProductionAnimation: false,
  cssBodyAnimationMayClaimProductionAnimation: false,
  syntheticMouthMayClaimProductionLipSync: false,
  partialCharacterReleaseAllowed: false,
});

function existingMotionStatus(characterId) {
  if (characterId === "eva-female") {
    return Object.freeze({
      characterId,
      phase: "dense-bootstrap-incomplete",
      requiredDenseFrameCount: EVA_DENSE_MOTION_REQUIRED_FRAME_COUNT,
      admittedDenseOrdinals: EVA_DENSE_MOTION_CURRENTLY_ADMITTED_ORDINALS,
      pendingDenseOrdinals: EVA_DENSE_MOTION_CURRENTLY_PENDING_ORDINALS,
      identityReady: true,
      completeAuthoredAnimationReady: false,
      websiteProductionAnimationEligible: false,
    });
  }
  if (characterId === "top-hat-man") {
    const readiness = inspectTopHatBodyPoseBank();
    return Object.freeze({
      characterId,
      phase: "pose-bank-incomplete",
      admittedPoseCount: readiness.admittedPoseCount,
      missingPoseSlotIds: readiness.missingPoseSlotIds,
      fallbackClipIds: readiness.fallbackClipIds,
      identityReady: true,
      completeAuthoredAnimationReady: readiness.expandedPerformanceReady,
      websiteProductionAnimationEligible: false,
    });
  }
  return Object.freeze({
    characterId,
    phase: "identity-master-required",
    identityReady: false,
    completeAuthoredAnimationReady: false,
    websiteProductionAnimationEligible: false,
  });
}

function emptyProceduralReview(characterId) {
  return Object.freeze({
    characterId,
    available: false,
    clipIds: Object.freeze([]),
    frameCount: 0,
    technicalFileVerificationAvailable: false,
    identityMasterCandidate: false,
    productionEligible: false,
    runtimeActivationAllowed: false,
    websiteActivationAllowed: false,
  });
}

function compileProceduralReviewStatus(manifestValue) {
  if (manifestValue === undefined) {
    return Object.freeze({
      summary: Object.freeze({
        available: false,
        characterCount: 0,
        canonicalSeatReviewCount: 0,
        previewOnlyCharacterCount: 0,
        clipCount: 0,
        frameCount: 0,
        productionEligible: false,
        runtimeActivationAllowed: false,
        websiteActivationAllowed: false,
      }),
      byCharacter: new Map(),
    });
  }
  const manifest = parseCouncilProceduralReviewAtlasManifest(manifestValue);
  const clipsByCharacter = new Map();
  for (const character of COUNCIL_PROCEDURAL_REVIEW_CHARACTERS) {
    clipsByCharacter.set(character.characterId, []);
  }
  for (const clip of manifest.clips) {
    clipsByCharacter.get(clip.characterId).push(clip);
  }
  const byCharacter = new Map(
    COUNCIL_PROCEDURAL_REVIEW_CHARACTERS.map((character) => {
      const clips = clipsByCharacter.get(character.characterId);
      return [
        character.characterId,
        Object.freeze({
          characterId: character.characterId,
          displayName: character.displayName,
          seatId: character.seatId,
          canonicalSeat: character.canonicalSeat,
          previewOnly: character.previewOnly,
          available: clips.length > 0,
          clipIds: Object.freeze(clips.map((clip) => clip.clipId)),
          frameCount: clips.reduce((sum, clip) => sum + clip.frameCount, 0),
          technicalFileVerificationAvailable: true,
          identityMasterCandidate: false,
          productionEligible: false,
          runtimeActivationAllowed: false,
          websiteActivationAllowed: false,
        }),
      ];
    }),
  );
  return Object.freeze({
    summary: Object.freeze({
      available: true,
      characterCount: COUNCIL_PROCEDURAL_REVIEW_CHARACTERS.length,
      canonicalSeatReviewCount: COUNCIL_PROCEDURAL_REVIEW_CHARACTERS.filter(
        (character) => character.canonicalSeat,
      ).length,
      previewOnlyCharacterCount: COUNCIL_PROCEDURAL_REVIEW_CHARACTERS.filter(
        (character) => character.previewOnly,
      ).length,
      clipCount: manifest.summary.clipCount,
      frameCount: manifest.summary.frameCount,
      productionEligible: false,
      runtimeActivationAllowed: false,
      websiteActivationAllowed: false,
    }),
    byCharacter,
  });
}

export function compileCouncilAvatarProductionStatus({
  assetPacks,
  proceduralReviewAtlasManifest,
} = {}) {
  const plan = createCouncilCharacterAssignmentPlan({
    members: COUNCIL_AVATAR_AUTHORITATIVE_MEMBERS,
    ...(assetPacks ? { assetPacks } : {}),
    preferences: COUNCIL_AVATAR_AUTHORITATIVE_PREFERENCES,
  });
  const proceduralReview = compileProceduralReviewStatus(
    proceduralReviewAtlasManifest,
  );
  const missingProductionRequests = missingCouncilCharacterProductionRequests(plan);
  const characters = COUNCIL_AVATAR_AUTHORITATIVE_MEMBERS.map((member) => {
    const preferredCharacterId = COUNCIL_AVATAR_AUTHORITATIVE_PREFERENCES[member.id];
    const assignment = plan.assignments.find((item) => item.memberId === member.id);
    return Object.freeze({
      memberId: member.id,
      memberLabel: member.label,
      characterId: preferredCharacterId,
      assignmentStatus: assignment?.status ?? "missing-character-pack",
      proceduralReview:
        proceduralReview.byCharacter.get(preferredCharacterId) ??
        emptyProceduralReview(preferredCharacterId),
      production: existingMotionStatus(preferredCharacterId),
    });
  });

  const complete = characters.every(
    (character) =>
      character.assignmentStatus === "assigned" &&
      character.production.identityReady === true &&
      character.production.completeAuthoredAnimationReady === true &&
      character.production.websiteProductionAnimationEligible === true,
  );

  return Object.freeze({
    contractVersion: COUNCIL_AVATAR_PRODUCTION_STATUS_VERSION,
    councilRepository: "EVAVO-STUDIO/the-council",
    councilRosterSource: "config/council.example.json",
    artStudioRepository: "EVAVO-STUDIO/evavo-art-studio",
    artStudioProgram:
      "scripts/project-art/council-avatar-production-program.mjs",
    memberCount: COUNCIL_AVATAR_AUTHORITATIVE_MEMBERS.length,
    uniqueCharacterRequired: true,
    productionStandard: COUNCIL_AVATAR_PRODUCTION_STANDARD,
    assignmentPlan: plan,
    proceduralReview: proceduralReview.summary,
    missingProductionRequests,
    characters: Object.freeze(characters),
    identityMasterGenerationRequiredFor: Object.freeze(
      characters
        .filter((character) => !character.production.identityReady)
        .map((character) => character.characterId),
    ),
    authoredAnimationCompletionRequiredFor: Object.freeze(
      characters
        .filter((character) => !character.production.completeAuthoredAnimationReady)
        .map((character) => character.characterId),
    ),
    complete,
    websiteMayClaimAllCouncilAvatarsProductionReady: complete,
    authority: Object.freeze({
      providerExecution: false,
      imageMutation: false,
      candidateApproval: false,
      candidatePromotion: false,
      repositoryMutation: false,
      gitCommit: false,
      gitPush: false,
      publication: false,
      runtimeActivation: false,
      deployment: false,
      forcePush: false,
    }),
  });
}
