import { createHash } from 'node:crypto';

export const TOP_HAT_POSE_SLOT_PRODUCTION_REQUEST_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-production-request.v1';
export const TOP_HAT_POSE_SLOT_PRODUCTION_PLAN_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-production-plan.v1';
export const TOP_HAT_POSE_SLOT_PRODUCTION_CAPABILITIES_SCHEMA =
  'evavo.project-art-top-hat-pose-slot-production-capabilities.v1';

const SHA256 = /^[a-f0-9]{64}$/u;
const GIT_OBJECT_ID = /^[a-f0-9]{40}$/u;
const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const RUNTIME_REPOSITORY = 'EVAVO-STUDIO/evavo-avatar-runtime';
const ART_STUDIO_REPOSITORY = 'EVAVO-STUDIO/evavo-art-studio';
const CHARACTER_ID = 'top-hat-man';
const AUTHORITY_KEYS = Object.freeze([
  'providerExecution',
  'imageMutation',
  'creativeDecision',
  'candidateApproval',
  'candidatePromotion',
  'poseSlotFilling',
  'sequenceRelease',
  'sourceMutation',
  'repositoryMutation',
  'gitCommit',
  'gitPush',
  'publication',
  'runtimeActivation',
  'deployment',
  'forcePush',
]);

export const TOP_HAT_POSE_SLOT_RUNTIME_PIN = Object.freeze({
  repository: RUNTIME_REPOSITORY,
  commit: '524066fc95fee329e1a20f7c9aa7d805d94c8cc8',
  tree: 'db8af48a71f1a2708c99f5cea220c7e7dd324e84',
  packageVersion: '0.34.0',
  poseBankSchema: 'evavo_top_hat_body_pose_bank_v1',
  poseBankVersion: '1.0.0',
  bodyDisplayCadenceSchema: 'evavo_top_hat_body_display_cadence_v1',
});

export const TOP_HAT_POSE_SLOT_ART_STUDIO_PIN = Object.freeze({
  repository: ART_STUDIO_REPOSITORY,
  commit: '5f2859286e7b9b2823b34019a7d383adeb86c923',
  tree: 'd60f85749c0c1eab7f09b2c273fca3a83c8195f7',
  animationSuitePlanSchema:
    'evavo.project-art-avatar-animation-suite-plan.v3',
  displayBridgePlanSchema:
    'evavo.project-art-avatar-display-bridge-plan.v1',
  atlasTransparentRgbSummarySchema:
    'evavo.project-art-atlas-transparent-rgb-summary.v1',
  transparentRgbBleedSchema:
    'evavo.project-art-transparent-rgb-bleed.v1',
  exactRgbaAtlasPaste: true,
});

export const TOP_HAT_ADMITTED_BODY_ANCHORS = Object.freeze([
  Object.freeze({
    id: 'neutral',
    role: 'canonical-full-body-identity-and-registration-anchor',
    repository: ART_STUDIO_REPOSITORY,
    path:
      'assets/top-hat-man/candidates/top-hat-man-full-body-master-v5.alpha.png',
    sha256:
      '92cb290246a7629024dcb7768f4119f6a139d9c9f59e3d0545563e1f5b35575a',
    bytes: 647297,
    width: 1024,
    height: 1536,
    pixelFormat: 'rgba8-straight',
    approvalStatus: 'approved-production-anchor',
  }),
  Object.freeze({
    id: 'inhale',
    role: 'approved-breath-inhale-anchor',
    repository: ART_STUDIO_REPOSITORY,
    path:
      'assets/top-hat-man/candidates/top-hat-man-idle-breathe-apex-v1.alpha.png',
    sha256:
      '476ff3c1ca56e1f4ec622b94abfebf35a94b593a388177b3d9b3bce9347ed9a5',
    bytes: 626064,
    width: 1024,
    height: 1536,
    pixelFormat: 'rgba8-straight',
    approvalStatus: 'approved-production-anchor',
  }),
  Object.freeze({
    id: 'exhale',
    role: 'approved-breath-exhale-anchor',
    repository: ART_STUDIO_REPOSITORY,
    path:
      'assets/top-hat-man/candidates/top-hat-man-idle-breathe-exhale-v1.alpha.png',
    sha256:
      'bd64eba4f22fd2d524ee7eb1826b2cc9cc9723cff5a764e36946d568b8cfd358',
    bytes: 627093,
    width: 1024,
    height: 1536,
    pixelFormat: 'rgba8-straight',
    approvalStatus: 'approved-production-anchor',
  }),
]);

const SLOT_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'blink-closed',
    purpose: 'authored closed-eye blink body',
    requiredFor: Object.freeze(['idle-blink']),
    primaryClipId: 'blink-single',
    sourceClipIds: Object.freeze(['blink-single', 'blink-double']),
    keyPoseSelector: 'maximum-natural-eyelid-closure',
    continuityContext: 'neutral-close-contact-open-neutral',
    performanceBrief:
      'Close both eyelids naturally while preserving the exact face, hat, silhouette, baseline and body registration. Do not introduce head, hand or torso motion into the key pose.',
    mouthLayerState: 'excluded-from-body-master',
    eyeLayerState: 'closed',
    handAndFingerReviewRequired: false,
  }),
  Object.freeze({
    id: 'listening-attentive',
    purpose: 'authored attentive listening posture',
    requiredFor: Object.freeze(['listening']),
    primaryClipId: 'listening',
    sourceClipIds: Object.freeze(['attention', 'listening']),
    keyPoseSelector: 'stable-attentive-key-pose',
    continuityContext: 'idle-attention-listening-idle',
    performanceBrief:
      'Create restrained attentive presence with a small readable forward engagement. Preserve identity, proportions, hands, hat geometry and full-canvas registration; avoid a generic nod or exaggerated lean.',
    mouthLayerState: 'excluded-from-body-master',
    eyeLayerState: 'open-attentive',
    handAndFingerReviewRequired: true,
  }),
  Object.freeze({
    id: 'thinking-reflective',
    purpose: 'authored reflective thinking posture',
    requiredFor: Object.freeze(['thinking']),
    primaryClipId: 'thinking',
    sourceClipIds: Object.freeze(['thinking']),
    keyPoseSelector: 'stable-reflective-key-pose',
    continuityContext: 'neutral-reflective-neutral-ping-pong',
    performanceBrief:
      'Create a subtle reflective head and eye-led pose without cartoon exaggeration. Keep the face, top hat, coat, hands, feet, silhouette and pivot locked to the approved anchors.',
    mouthLayerState: 'excluded-from-body-master',
    eyeLayerState: 'reflective',
    handAndFingerReviewRequired: true,
  }),
  Object.freeze({
    id: 'speech-neutral',
    purpose: 'authored speech body motion independent from mouth visemes',
    requiredFor: Object.freeze(['talk-main']),
    primaryClipId: 'talk-neutral',
    sourceClipIds: Object.freeze(['talk-in', 'talk-neutral', 'talk-out']),
    keyPoseSelector: 'neutral-conversational-body-anchor',
    continuityContext: 'idle-talk-in-talk-loop-talk-out-idle',
    performanceBrief:
      'Create a conversational body anchor with restrained torso and shoulder life. The body master must contain no baked viseme decision; registered mouth layers own all speech shapes and exact audio timing.',
    mouthLayerState: 'registered-layer-owns-all-visemes',
    eyeLayerState: 'open-natural',
    handAndFingerReviewRequired: true,
  }),
  Object.freeze({
    id: 'presentation-open',
    purpose: 'authored open-hand presentation posture',
    requiredFor: Object.freeze(['talk-present']),
    primaryClipId: 'talk-engaged',
    sourceClipIds: Object.freeze(['talk-engaged', 'wave']),
    keyPoseSelector: 'stable-open-hand-presentation-anchor',
    continuityContext: 'speech-neutral-open-hand-speech-neutral',
    performanceBrief:
      'Create one readable open-hand presentation pose, not a greeting wave. Preserve all fingers, wrist anatomy, coat construction, face, hat, feet, pivot and silhouette; keep the gesture restrained enough for conversational use.',
    mouthLayerState: 'registered-layer-owns-all-visemes',
    eyeLayerState: 'open-engaged',
    handAndFingerReviewRequired: true,
  }),
  Object.freeze({
    id: 'presentation-emphasis',
    purpose: 'authored presentation emphasis posture',
    requiredFor: Object.freeze(['talk-present']),
    primaryClipId: 'talk-emphasis',
    sourceClipIds: Object.freeze(['talk-emphasis', 'nod']),
    keyPoseSelector: 'restrained-single-emphasis-anchor',
    continuityContext: 'presentation-open-emphasis-presentation-open',
    performanceBrief:
      'Create a single restrained emphasis beat with a stable readable hand and no identity drift. Preserve finger count and anatomy, hat geometry, clothing, body proportions, pivot and registered mouth ownership.',
    mouthLayerState: 'registered-layer-owns-all-visemes',
    eyeLayerState: 'open-confident',
    handAndFingerReviewRequired: true,
  }),
]);

export class ProjectArtTopHatPoseSlotProductionError extends Error {
  constructor(code, message = code) {
    super(message === code ? code : `${code}: ${message}`);
    this.name = 'ProjectArtTopHatPoseSlotProductionError';
    this.code = code;
  }
}

function fail(code, message = code) {
  throw new ProjectArtTopHatPoseSlotProductionError(code, message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exact(value, keys, label) {
  if (!isRecord(value)) {
    fail('PROJECT_ART_TOP_HAT_POSE_SLOT_OBJECT_INVALID', `${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail('PROJECT_ART_TOP_HAT_POSE_SLOT_KEYS_INVALID', `${label} keys are invalid.`);
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

export function canonicalTopHatPoseSlotProductionJson(value) {
  return JSON.stringify(canonical(value));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function freezeClone(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeClone));
  if (isRecord(value)) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, freezeClone(entry)]),
      ),
    );
  }
  return value;
}

function equalCanonical(left, right) {
  return canonicalTopHatPoseSlotProductionJson(left) ===
    canonicalTopHatPoseSlotProductionJson(right);
}

function parseRuntime(value) {
  exact(value, Object.keys(TOP_HAT_POSE_SLOT_RUNTIME_PIN), 'runtime');
  if (
    value.repository !== RUNTIME_REPOSITORY ||
    typeof value.commit !== 'string' ||
    !GIT_OBJECT_ID.test(value.commit) ||
    typeof value.tree !== 'string' ||
    !GIT_OBJECT_ID.test(value.tree) ||
    !equalCanonical(value, TOP_HAT_POSE_SLOT_RUNTIME_PIN)
  ) {
    fail(
      'PROJECT_ART_TOP_HAT_POSE_SLOT_RUNTIME_PIN_INVALID',
      'The request must bind the exact Runtime 0.34.0 pose-bank source.',
    );
  }
  return freezeClone(value);
}

function parseArtStudio(value) {
  exact(value, Object.keys(TOP_HAT_POSE_SLOT_ART_STUDIO_PIN), 'artStudio');
  if (
    value.repository !== ART_STUDIO_REPOSITORY ||
    typeof value.commit !== 'string' ||
    !GIT_OBJECT_ID.test(value.commit) ||
    typeof value.tree !== 'string' ||
    !GIT_OBJECT_ID.test(value.tree) ||
    value.exactRgbaAtlasPaste !== true ||
    !equalCanonical(value, TOP_HAT_POSE_SLOT_ART_STUDIO_PIN)
  ) {
    fail(
      'PROJECT_ART_TOP_HAT_POSE_SLOT_ART_STUDIO_PIN_INVALID',
      'The request must bind the exact animation, display and alpha-safety source.',
    );
  }
  return freezeClone(value);
}

function parseAnchor(value, expected, index) {
  exact(value, Object.keys(expected), `identityAnchors[${index}]`);
  if (
    typeof value.id !== 'string' ||
    !IDENTIFIER.test(value.id) ||
    typeof value.sha256 !== 'string' ||
    !SHA256.test(value.sha256) ||
    value.repository !== ART_STUDIO_REPOSITORY ||
    value.width !== 1024 ||
    value.height !== 1536 ||
    value.pixelFormat !== 'rgba8-straight' ||
    value.approvalStatus !== 'approved-production-anchor' ||
    !equalCanonical(value, expected)
  ) {
    fail(
      'PROJECT_ART_TOP_HAT_POSE_SLOT_ANCHOR_INVALID',
      `identityAnchors[${index}] does not match the approved body anchor.`,
    );
  }
  return freezeClone(value);
}

function parseAnchors(value) {
  if (!Array.isArray(value) || value.length !== TOP_HAT_ADMITTED_BODY_ANCHORS.length) {
    fail('PROJECT_ART_TOP_HAT_POSE_SLOT_ANCHORS_INVALID');
  }
  const byId = new Map();
  for (const [index, anchor] of value.entries()) {
    if (!isRecord(anchor) || typeof anchor.id !== 'string' || byId.has(anchor.id)) {
      fail('PROJECT_ART_TOP_HAT_POSE_SLOT_ANCHORS_INVALID');
    }
    byId.set(anchor.id, anchor);
  }
  return Object.freeze(
    TOP_HAT_ADMITTED_BODY_ANCHORS.map((expected, index) => {
      const candidate = byId.get(expected.id);
      if (!candidate) fail('PROJECT_ART_TOP_HAT_POSE_SLOT_ANCHORS_INVALID');
      return parseAnchor(candidate, expected, index);
    }),
  );
}

function parseAuthority(value) {
  exact(value, AUTHORITY_KEYS, 'authority');
  if (AUTHORITY_KEYS.some((key) => value[key] !== false)) {
    fail(
      'PROJECT_ART_TOP_HAT_POSE_SLOT_AUTHORITY_INVALID',
      'A pose-slot production map cannot execute providers, approve art, mutate repositories, activate runtimes or publish.',
    );
  }
  return Object.freeze(Object.fromEntries(AUTHORITY_KEYS.map((key) => [key, false])));
}

function parseRequest(value) {
  exact(
    value,
    ['schema', 'characterId', 'runtime', 'artStudio', 'identityAnchors', 'authority'],
    'request',
  );
  if (value.schema !== TOP_HAT_POSE_SLOT_PRODUCTION_REQUEST_SCHEMA) {
    fail('PROJECT_ART_TOP_HAT_POSE_SLOT_SCHEMA_INVALID');
  }
  if (value.characterId !== CHARACTER_ID) {
    fail('PROJECT_ART_TOP_HAT_POSE_SLOT_CHARACTER_INVALID');
  }
  return Object.freeze({
    schema: value.schema,
    characterId: CHARACTER_ID,
    runtime: parseRuntime(value.runtime),
    artStudio: parseArtStudio(value.artStudio),
    identityAnchors: parseAnchors(value.identityAnchors),
    authority: parseAuthority(value.authority),
  });
}

function candidatePath(slotId, suffix) {
  return `assets/top-hat-man/candidates/top-hat-man-${slotId}-v1.${suffix}`;
}

function compileSlot(definition, identityReferenceSetSha256) {
  const handReview = definition.handAndFingerReviewRequired;
  return Object.freeze({
    slotId: definition.id,
    purpose: definition.purpose,
    requiredFor: definition.requiredFor,
    status: 'planned-unfilled',
    activationEligible: false,
    sourceMapping: Object.freeze({
      animationSuitePlanSchema:
        TOP_HAT_POSE_SLOT_ART_STUDIO_PIN.animationSuitePlanSchema,
      primaryClipId: definition.primaryClipId,
      sourceClipIds: definition.sourceClipIds,
      keyPoseSelector: definition.keyPoseSelector,
      continuityContext: definition.continuityContext,
    }),
    productionBrief: Object.freeze({
      performance: definition.performanceBrief,
      targetKind: 'full-body-registered-key-pose',
      targetCanvas: Object.freeze({
        width: 1024,
        height: 1536,
        pixelFormat: 'rgba8-straight',
        trimTransparentBorders: false,
      }),
      identityReferenceSetSha256,
      exactIdentityAndRigLock: true,
      sharedPivotAndBaselineRequired: true,
      topHatGeometryLockRequired: true,
      mouthLayerState: definition.mouthLayerState,
      eyeLayerState: definition.eyeLayerState,
      bodyCadenceIndependentOfVisemes: true,
      bakedVisemeAllowed: false,
      syntheticBodyInbetweeningAllowed: false,
    }),
    candidateOutputs: Object.freeze({
      rgbaMasterPath: candidatePath(definition.id, 'alpha.png'),
      evidencePath: candidatePath(definition.id, 'evidence.json'),
      reviewContactSheetPath: candidatePath(definition.id, 'review.png'),
      candidateManifestPath: candidatePath(definition.id, 'candidate.json'),
      createOnly: true,
      overwriteExistingCandidate: false,
    }),
    continuityEvidence: Object.freeze({
      adjacentContextFramesBefore: 4,
      adjacentContextFramesAfter: 4,
      approvedAnchorComparisonRequired: true,
      primaryClipContinuityRequired: true,
      transitionIntoNeutralRequired: true,
      transitionOutToNeutralRequired: true,
      finalToFirstLoopEvidenceRequired:
        definition.requiredFor.includes('listening') ||
        definition.requiredFor.includes('thinking') ||
        definition.requiredFor.includes('talk-main'),
    }),
    mastering: Object.freeze({
      nativeAlphaRequiredAtAdmission: true,
      providerTransparencyTrusted: false,
      paintedCheckerboardBlocking: true,
      opaqueMatteBlocking: true,
      chromaSpillBlocking: true,
      hiddenRgbCleanupRequired: true,
      transparentRgbBleedRequired: true,
      transparentRgbBleedRadius: 8,
      transparentRgbAlphaThreshold: 0,
      alphaBytesPreserved: true,
      strongerAlphaRgbPreserved: true,
      exactRgbaAtlasPasteRequired: true,
      atlasTransparentRgbSummarySchema:
        TOP_HAT_POSE_SLOT_ART_STUDIO_PIN.atlasTransparentRgbSummarySchema,
      transparentRgbBleedSchema:
        TOP_HAT_POSE_SLOT_ART_STUDIO_PIN.transparentRgbBleedSchema,
    }),
    review: Object.freeze({
      namedHumanApprovalRequired: true,
      approverIdentityRequired: true,
      approvalTimestampRequired: true,
      approvedArtifactSha256Required: true,
      blackPlateRequired: true,
      whitePlateRequired: true,
      midGreyPlateRequired: true,
      greenPlateRequired: true,
      magentaPlateRequired: true,
      nearestFilteringRequired: true,
      linearFilteringRequired: true,
      zoomedOutProofRequired: true,
      visibleCanvasEdgePixelsBlocking: true,
      croppedSilhouetteBlocking: true,
      faceIdentityDriftBlocking: true,
      bodyProportionDriftBlocking: true,
      handAndFingerReviewRequired: handReview,
      handOrFingerDefectsBlocking: handReview,
      topHatGeometryDriftBlocking: true,
      runtimePreviewRequired: true,
    }),
    promotion: Object.freeze({
      candidateOnly: true,
      automaticApprovalAllowed: false,
      automaticPoseSlotFillingAllowed: false,
      automaticRuntimeActivationAllowed: false,
      automaticWebsitePublicationAllowed: false,
      runtimeManifestMutationAllowed: false,
      websiteAssetMutationAllowed: false,
      requiresSeparateSignedApprovalReceipt: true,
      requiresSeparateHashBoundReleasePlan: true,
    }),
  });
}

export function createProjectArtTopHatPoseSlotProductionRequest() {
  return freezeClone({
    schema: TOP_HAT_POSE_SLOT_PRODUCTION_REQUEST_SCHEMA,
    characterId: CHARACTER_ID,
    runtime: TOP_HAT_POSE_SLOT_RUNTIME_PIN,
    artStudio: TOP_HAT_POSE_SLOT_ART_STUDIO_PIN,
    identityAnchors: TOP_HAT_ADMITTED_BODY_ANCHORS,
    authority: Object.fromEntries(AUTHORITY_KEYS.map((key) => [key, false])),
  });
}

export function compileProjectArtTopHatPoseSlotProduction(value) {
  const request = parseRequest(value);
  const requestSha256 = sha256(
    Buffer.from(`${canonicalTopHatPoseSlotProductionJson(request)}\n`, 'utf8'),
  );
  const identityReferenceSetSha256 = sha256(
    Buffer.from(
      `${canonicalTopHatPoseSlotProductionJson(request.identityAnchors)}\n`,
      'utf8',
    ),
  );
  const productionSlots = Object.freeze(
    SLOT_DEFINITIONS.map((definition) =>
      compileSlot(definition, identityReferenceSetSha256),
    ),
  );
  const body = Object.freeze({
    schema: TOP_HAT_POSE_SLOT_PRODUCTION_PLAN_SCHEMA,
    requestSchema: request.schema,
    requestSha256,
    characterId: CHARACTER_ID,
    runtime: request.runtime,
    artStudio: request.artStudio,
    identityAnchors: request.identityAnchors,
    identityReferenceSetSha256,
    runtimePoseBank: Object.freeze({
      schema: request.runtime.poseBankSchema,
      version: request.runtime.poseBankVersion,
      bodyDisplayCadenceSchema: request.runtime.bodyDisplayCadenceSchema,
      admittedPoseIds: Object.freeze(['neutral', 'inhale', 'exhale']),
      requiredPoseSlotIds: Object.freeze(
        SLOT_DEFINITIONS.map((definition) => definition.id),
      ),
    }),
    productionSlots,
    executionOrder: Object.freeze([
      'identity-and-registration-key-pose',
      'continuity-context-generation',
      'native-alpha-mastering',
      'hidden-rgb-and-atlas-edge-assurance',
      'multi-background-and-runtime-review',
      'named-human-approval',
      'separate-hash-bound-release-plan',
    ]),
    qualityGates: Object.freeze({
      exactRuntimePoseBankPinRequired: true,
      exactArtStudioSourcePinRequired: true,
      exactApprovedAnchorHashesRequired: true,
      allSourceClipsMustExistInAnimationSuite: true,
      fullCanvasPixelExactRegistrationRequired: true,
      realNativeAlphaRequired: true,
      paintedCheckerboardBlocking: true,
      opaqueMatteBlocking: true,
      chromaSpillBlocking: true,
      hiddenRgbCleanupRequired: true,
      boundedTransparentRgbBleedRequired: true,
      exactRgbaAtlasPasteRequired: true,
      identityDriftBlocking: true,
      bodyProportionDriftBlocking: true,
      handAndFingerDefectsBlocking: true,
      topHatGeometryDriftBlocking: true,
      adjacentFrameContinuityRequired: true,
      runtimePreviewRequired: true,
      namedHumanApprovalRequired: true,
    }),
    counts: Object.freeze({
      admittedBodyAnchors: request.identityAnchors.length,
      requiredPoseSlots: productionSlots.length,
      plannedUnfilledPoseSlots: productionSlots.filter(
        (slot) => slot.status === 'planned-unfilled',
      ).length,
      activationEligiblePoseSlots: productionSlots.filter(
        (slot) => slot.activationEligible,
      ).length,
      authoredAnimationSourceClips: new Set(
        productionSlots.flatMap((slot) => slot.sourceMapping.sourceClipIds),
      ).size,
    }),
    status: 'pose-slot-production-map-ready',
    currentRuntimeSafe: true,
    expandedPerformanceReady: false,
    artGenerationRequired: true,
    providerExecutionAllowed: false,
    productionReady: false,
    runtimeActivationAllowed: false,
    authority: request.authority,
  });
  return Object.freeze({
    ...body,
    planSha256: sha256(
      Buffer.from(`${canonicalTopHatPoseSlotProductionJson(body)}\n`, 'utf8'),
    ),
  });
}

export function projectArtTopHatPoseSlotProductionCapabilities() {
  return Object.freeze({
    schema: TOP_HAT_POSE_SLOT_PRODUCTION_CAPABILITIES_SCHEMA,
    requestSchema: TOP_HAT_POSE_SLOT_PRODUCTION_REQUEST_SCHEMA,
    planSchema: TOP_HAT_POSE_SLOT_PRODUCTION_PLAN_SCHEMA,
    characterId: CHARACTER_ID,
    runtimePoseBankSchema: TOP_HAT_POSE_SLOT_RUNTIME_PIN.poseBankSchema,
    runtimePoseBankVersion: TOP_HAT_POSE_SLOT_RUNTIME_PIN.poseBankVersion,
    runtimePackageVersion: TOP_HAT_POSE_SLOT_RUNTIME_PIN.packageVersion,
    artStudioAnimationSuitePlanSchema:
      TOP_HAT_POSE_SLOT_ART_STUDIO_PIN.animationSuitePlanSchema,
    artStudioDisplayBridgePlanSchema:
      TOP_HAT_POSE_SLOT_ART_STUDIO_PIN.displayBridgePlanSchema,
    requiredPoseSlots: SLOT_DEFINITIONS.length,
    admittedBodyAnchors: TOP_HAT_ADMITTED_BODY_ANCHORS.length,
    explicitAnimationSuiteClipMapping: true,
    semanticFallbackDisclosureRequired: true,
    realNativeAlphaRequired: true,
    fakeTransparencyGridAllowed: false,
    hiddenRgbCleanupRequired: true,
    transparentRgbBleedRadius: 8,
    exactRgbaAtlasPasteRequired: true,
    registeredMouthLayerOwnsVisemes: true,
    bodyCadenceIndependentOfVisemes: true,
    syntheticBodyInbetweeningAllowed: false,
    namedHumanApprovalRequired: true,
    automaticPoseSlotFillingAllowed: false,
    providerExecution: false,
    candidateApproval: false,
    candidatePromotion: false,
    repositoryMutation: false,
    runtimeActivation: false,
    deployment: false,
    publication: false,
    forcePush: false,
  });
}
