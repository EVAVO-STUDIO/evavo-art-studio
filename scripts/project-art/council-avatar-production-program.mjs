import { createHash } from 'node:crypto';

import { projectArtAvatarAnimationSuiteCapabilities } from './avatar-animation-suite.mjs';
import { compileCouncilAvatarProceduralReview } from './council-avatar-procedural-review.mjs';

export const COUNCIL_AVATAR_PRODUCTION_PROGRAM_SCHEMA =
  'evavo.project-art-council-avatar-production-program.v1';
export const COUNCIL_AVATAR_IDENTITY_BRIEF_SCHEMA =
  'evavo.project-art-council-avatar-identity-brief.v1';

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
  deployment: false,
  forcePush: false,
});

const GLOBAL_VISUAL_LOCK = Object.freeze([
  'EVAVO-crafted editorial character design, never generic AI-assistant styling',
  'full-body silhouette readable in a compact Council card with complete head, hands or species-specific appendages and feet visible',
  'premium creative-studio art direction with restrained black, off-white and cherry-red accents',
  'anatomy must be internally coherent to the approved species design, stable across every view and suitable for articulated animation',
  'strange original alien Council members are allowed and encouraged where specified, but protected-character imitation is forbidden',
  'no holograms, floating UI, neon cyberpunk, glowing eyes, robot parts, headsets or generic AI iconography',
  'no text, logos, watermarks, checkerboards, scenery or contact-sheet layouts in provider output',
  'one complete character only on a 1024x1536 canvas with genuine transparent RGBA background',
  'stable face, eyes, cranial structures, costume, hands, proportions, baseline and pivot across every authored frame',
]);

const CHARACTERS = Object.freeze([
  Object.freeze({
    seatId: 'architect',
    seatLabel: 'Architect',
    characterId: 'top-hat-man',
    characterLabel: 'Top Hat Man',
    role:
      'architecture, implementation, integration and systems reasoning',
    identityStatus: 'existing-reviewed-identity',
    motionStatus: 'incomplete-authored-pose-bank',
    identityDirection: Object.freeze([
      'preserve the established Top Hat Man identity exactly rather than redesigning him',
      'Victorian-modern editorial tailoring, black top hat and recognisable moustache remain canonical',
      'hat crown, brim ellipse, band, face, moustache, tailoring and cane geometry must not drift',
      'retain elegant eccentricity without turning him into steampunk cosplay or a cartoon mascot',
    ]),
    immediateWork: Object.freeze([
      'author blink-closed body pose',
      'author attentive listening posture',
      'author reflective thinking posture',
      'author speech-neutral body motion independent of mouth visemes',
      'author open-hand presentation posture',
      'author presentation-emphasis posture',
      'expand from pose bootstrap into the complete 24-30 fps animation suite',
    ]),
  }),
  Object.freeze({
    seatId: 'researcher',
    seatLabel: 'Researcher',
    characterId: 'eva-female',
    characterLabel: 'EVA',
    role: 'evidence, alternatives, current research, uncertainty and verification',
    identityStatus: 'existing-reviewed-identity',
    motionStatus: 'dense-bootstrap-incomplete',
    identityDirection: Object.freeze([
      'preserve EVA’s established face, sculptural black geometric dress and restrained cherry-red EVAVO character language',
      'do not redesign the face or switch to a generic photoreal assistant, robot or influencer aesthetic',
      'keep expression intelligent, observant and warm rather than permanently smiling',
      'use the exact identity master and source-family provenance already admitted by Avatar Runtime',
    ]),
    immediateWork: Object.freeze([
      'finish the exact ten-frame dense-motion bootstrap with new deterministic dense identities for all ten ordinals',
      'review all ten continuity edges including frame 10 to frame 1 loop closure',
      'author four non-repeating idle loops and the complete listening/thinking/talk performance set',
      'replace the temporary website high-resolution preview only after the complete authored release passes',
    ]),
  }),
  Object.freeze({
    seatId: 'critic',
    seatLabel: 'Critic',
    characterId: 'council-critic',
    characterLabel: 'Veyra',
    role: 'adversarial review, safety, risk, hidden assumptions and dissent',
    identityStatus: 'identity-master-required',
    motionStatus: 'not-started',
    identityDirection: Object.freeze([
      'original adult alien tribunal elder called Veyra with a precise formidable editorial presence; never villain-coded or hostile',
      'extremely tall narrow silhouette, four independently readable eyes and one sculptural cranial sail with stable registration',
      'bone-white skin, black mineral-textured ceremonial work garments and one faded Council-red construction seam',
      'long controlled hands with a consistent species-specific digit count and no unstable anatomy between views',
      'calm direct gaze and restrained practical-creature-film material language rather than glossy game-character rendering',
      'silhouette must remain clearly distinct from EVA’s geometric dress, Top Hat Man’s tailoring and Moro Pell’s broad amphibious body',
    ]),
    immediateWork: Object.freeze([
      'review the procedural Veyra motion and silhouette proof without treating it as an identity master',
      'generate identity candidates from the canonical role brief',
      'select one identity-lock master after independent visual review',
      'master exact 1024x1536 RGBA transparency with clean hidden RGB and canvas clearance',
      'author the complete Council animation suite from the approved master',
    ]),
  }),
  Object.freeze({
    seatId: 'open-reviewer',
    seatLabel: 'Open Reviewer',
    characterId: 'council-open-reviewer',
    characterLabel: 'Moro Pell',
    role:
      'independent open-model review, practical alternatives and low-cost challenge',
    identityStatus: 'identity-master-required',
    motionStatus: 'not-started',
    identityDirection: Object.freeze([
      'original adult amphibious scholar elder called Moro Pell with an open practical and independent presence',
      'low broad grounded silhouette, three clearly registered eyes and an articulated throat membrane that remains restrained in neutral views',
      'moss-grey skin, worn ivory studio-work layers, dark underlayers and one visibly repaired cherry-red seam',
      'oversized stable hands with a consistent species-specific digit count and heavy believable centre of mass',
      'alert relaxed expression with practical creature-design materiality rather than cute mascot, startup-founder or generic AI-assistant styling',
      'silhouette and value pattern must be clearly distinct from EVA, Top Hat Man and Veyra',
    ]),
    immediateWork: Object.freeze([
      'review the procedural Moro Pell motion and silhouette proof without treating it as an identity master',
      'generate identity candidates from the canonical role brief',
      'select one identity-lock master after independent visual review',
      'master exact 1024x1536 RGBA transparency with clean hidden RGB and canvas clearance',
      'author the complete Council animation suite from the approved master',
    ]),
  }),
]);

const COUNCIL_STATE_MAPPING = Object.freeze({
  idle: Object.freeze(['idle-primary', 'idle-breathe', 'idle-weight-shift', 'idle-glance']),
  listening: Object.freeze(['listening']),
  thinking: Object.freeze(['thinking']),
  speaking: Object.freeze([
    'talk-in',
    'talk-neutral',
    'talk-soft',
    'talk-engaged',
    'talk-emphasis',
    'talk-happy',
    'talk-concerned',
    'talk-out',
  ]),
  dissent: Object.freeze(['talk-concerned', 'talk-emphasis']),
  synthesising: Object.freeze(['thinking', 'attention', 'talk-engaged']),
  complete: Object.freeze(['pleased', 'nod']),
  error: Object.freeze(['error']),
});

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
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function identityBrief(character) {
  const brief = Object.freeze({
    schema: COUNCIL_AVATAR_IDENTITY_BRIEF_SCHEMA,
    seatId: character.seatId,
    seatLabel: character.seatLabel,
    characterId: character.characterId,
    characterLabel: character.characterLabel,
    role: character.role,
    targetCanvas: Object.freeze({ width: 1024, height: 1536 }),
    output: Object.freeze({
      mediaType: 'image/png',
      format: 'png',
      alpha: 'rgba8-straight',
      oneCharacterOnly: true,
      fullBodyRequired: true,
      transparentBackgroundRequired: true,
      safeCanvasClearanceRequired: true,
    }),
    globalVisualLock: GLOBAL_VISUAL_LOCK,
    identityDirection: character.identityDirection,
    providerPrompt: Object.freeze([
      ...GLOBAL_VISUAL_LOCK,
      ...character.identityDirection,
      'camera is straight-on to very slight three-quarter, eye level, no dramatic perspective',
      'character occupies approximately 82 percent of canvas height with complete head, hands or appendages and feet visible',
      'neutral studio presentation pose suitable as the immutable identity reference for animation production',
    ]).join('. '),
    authority: AUTHORITY,
  });
  return Object.freeze({ ...brief, briefSha256: sha256(brief) });
}

export function compileCouncilAvatarProductionProgram() {
  const animation = projectArtAvatarAnimationSuiteCapabilities();
  const proceduralReview = compileCouncilAvatarProceduralReview();
  const animationStandard = Object.freeze({
    canonicalCompiler: 'scripts/project-art/avatar-animation-suite.mjs',
    completeClipMatrix: animation.completeClipMatrix,
    clipCount: 25,
    fullCharacterFrameCount: 732,
    registeredPoseLayerCount: 17,
    totalPlannedImagesPerCharacter: 749,
    idleVariants: animation.multipleIdleVariants,
    talkVariants: animation.multipleTalkVariants,
    minimumAuthoredFps: animation.minimumAuthoredFps,
    preferredAuthoredFps: animation.preferredAuthoredFps,
    displayTargetFps: animation.displayTargetFps,
    boundedAlphaCrossfade: animation.boundedAlphaCrossfade,
    separatedMouthLayerRequired: true,
    separatedEyeLayerRequired: true,
    exactAudioTimingRequired: true,
    genuineTransparencyRequired: true,
    independentFrameInspectors: 2,
    minimumFrameReviewConfidence: 0.95,
    continuityEvidenceRequired: true,
    loopClosureEvidenceRequired: true,
    runtimeActivationIsSeparateGate: true,
  });

  if (
    animationStandard.idleVariants !== 4 ||
    animationStandard.talkVariants !== 6 ||
    animationStandard.minimumAuthoredFps !== 24 ||
    animationStandard.preferredAuthoredFps !== 30 ||
    animationStandard.displayTargetFps !== 60
  ) {
    throw new Error('COUNCIL_AVATAR_CANONICAL_ANIMATION_STANDARD_DRIFT');
  }
  if (
    proceduralReview.canonicalSeatCount !== 4 ||
    proceduralReview.characterCount !== 5 ||
    proceduralReview.previewOnlyCharacterCount !== 1 ||
    proceduralReview.totalReviewClipCount !== 25 ||
    proceduralReview.authority.identityApproval !== false ||
    proceduralReview.authority.runtimeActivation !== false ||
    proceduralReview.authority.websiteActivation !== false
  ) {
    throw new Error('COUNCIL_AVATAR_PROCEDURAL_REVIEW_BOUNDARY_DRIFT');
  }

  const reviewByCharacter = new Map(
    proceduralReview.characters.map((character) => [character.characterId, character]),
  );
  const characters = CHARACTERS.map((character) => {
    const reviewCharacter = reviewByCharacter.get(character.characterId);
    if (!reviewCharacter || reviewCharacter.canonicalSeat !== true) {
      throw new Error(
        `COUNCIL_AVATAR_PROCEDURAL_REVIEW_CHARACTER_MISSING:${character.characterId}`,
      );
    }
    return Object.freeze({
      ...character,
      visualLock: GLOBAL_VISUAL_LOCK,
      identityBrief:
        character.identityStatus === 'identity-master-required'
          ? identityBrief(character)
          : null,
      proceduralReview: Object.freeze({
        available: true,
        displayName: reviewCharacter.displayName,
        proceduralCodename: reviewCharacter.proceduralCodename,
        clipIds: Object.freeze(proceduralReview.clips.map((clip) => clip.clipId)),
        identityMasterCandidate: false,
        identityApprovalEstablished: false,
        animationApprovalEstablished: false,
        productionAdmissionEstablished: false,
        runtimeActivationEstablished: false,
        websiteActivationEstablished: false,
      }),
      animationStandard,
      councilStateMapping: COUNCIL_STATE_MAPPING,
      productionReady: false,
      authority: AUTHORITY,
    });
  });

  const program = Object.freeze({
    schema: COUNCIL_AVATAR_PRODUCTION_PROGRAM_SCHEMA,
    councilRepository: 'EVAVO-STUDIO/the-council',
    councilRosterSource: 'config/council.example.json',
    avatarRuntimeRepository: 'EVAVO-STUDIO/evavo-avatar-runtime',
    artStudioRepository: 'EVAVO-STUDIO/evavo-art-studio',
    websiteRepository: 'EVAVO-STUDIO/next-website',
    seatCount: 4,
    characterCount: characters.length,
    identityMasterGenerationCount: characters.filter(
      (character) => character.identityStatus === 'identity-master-required',
    ).length,
    characters: Object.freeze(characters),
    globalVisualLock: GLOBAL_VISUAL_LOCK,
    animationStandard,
    proceduralReview,
    councilStateMapping: COUNCIL_STATE_MAPPING,
    releasePolicy: Object.freeze({
      partialCharacterReleaseAllowed: false,
      sparsePoseApproximationMayClaimProductionAnimation: false,
      proceduralReviewMayApproveIdentity: false,
      proceduralReviewMayApproveAnimation: false,
      proceduralReviewMaySatisfyProductionMediaReadiness: false,
      websiteMayActivateBeforeReviewedMediaComplete: false,
      everyCouncilSeatRequiresUniqueCharacter: true,
      everyCharacterRequiresIdentityLockBeforeAnimation: true,
      everyAnimationReleaseRequiresExactImmutableMediaIdentities: true,
      reducedMotionUsesReviewedStaticIdentity: true,
      previewOnlyGuestMayOccupyCouncilSeat: false,
    }),
    authority: AUTHORITY,
  });

  return Object.freeze({ ...program, programSha256: sha256(program) });
}

export function councilAvatarProductionCapabilities() {
  const program = compileCouncilAvatarProductionProgram();
  return Object.freeze({
    schema: 'evavo.project-art-council-avatar-production-capabilities.v1',
    seatCount: program.seatCount,
    characterCount: program.characterCount,
    identityMasterGenerationCount: program.identityMasterGenerationCount,
    supportedCharacterIds: Object.freeze(
      program.characters.map((character) => character.characterId),
    ),
    totalPlannedImagesPerCharacter:
      program.animationStandard.totalPlannedImagesPerCharacter,
    minimumAuthoredFps: program.animationStandard.minimumAuthoredFps,
    preferredAuthoredFps: program.animationStandard.preferredAuthoredFps,
    displayTargetFps: program.animationStandard.displayTargetFps,
    proceduralReviewAvailable: true,
    proceduralReviewCharacterCount: program.proceduralReview.characterCount,
    proceduralReviewCanonicalSeatCount:
      program.proceduralReview.canonicalSeatCount,
    proceduralReviewPreviewOnlyCharacterCount:
      program.proceduralReview.previewOnlyCharacterCount,
    proceduralReviewIdentityApproval: false,
    proceduralReviewProductionAdmission: false,
    providerExecution: false,
    runtimeActivation: false,
    websiteActivation: false,
  });
}
