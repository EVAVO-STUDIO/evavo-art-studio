import {
  assert,
  artifactId,
  boundedText,
  canonicalJson,
  canonicalPath,
  deepFreeze,
  digest,
  exactKeys,
  isRecord,
  sha256Document,
  snapshotJsonValue,
  timestamp,
  verifySelfHash,
} from './avatar-final-pass-provider-runtime-common.mjs';
import {
  TOP_HAT_POSE_SLOT_ART_STUDIO_PIN,
  TOP_HAT_POSE_SLOT_RUNTIME_PIN,
} from './top-hat-pose-slot-production.mjs';
import {
  TOP_HAT_POSE_SLOT_CHARACTER_ID,
  TOP_HAT_POSE_SLOT_IDS,
} from './top-hat-pose-slot-candidate-admission-foundation.mjs';
import {
  parseProjectArtTopHatPoseSlotCandidateAdmission,
} from './top-hat-pose-slot-candidate-admission.mjs';
import {
  TOP_HAT_POSE_BANK_RELEASE_PLAN_CAPABILITIES_SCHEMA,
  TOP_HAT_POSE_BANK_RELEASE_PLAN_PROTOCOL,
  TOP_HAT_POSE_BANK_RELEASE_PLAN_SCHEMA,
  TOP_HAT_POSE_BANK_RELEASE_PLAN_STATUS,
  TOP_HAT_POSE_BANK_RELEASE_PLAN_REQUIRED_NEXT_STEPS,
  parseTopHatPoseBankReleasePlanAuthority,
  topHatPoseBankReleasePlanAuthority,
  topHatPoseBankReleasePlanCapabilities,
} from './top-hat-pose-bank-release-plan-foundation.mjs';

const PLAN_KEYS = Object.freeze([
  'schema',
  'protocolVersion',
  'status',
  'compiledAt',
  'characterId',
  'slotCount',
  'adapterSha256',
  'sourceProviderPackageSha256',
  'sourceProviderRequestSha256',
  'productionPlanSha256',
  'runtime',
  'artStudio',
  'slots',
  'releaseReview',
  'authority',
  'poseBankReleasePlanSha256',
]);
const SLOT_KEYS = Object.freeze([
  'slotId',
  'candidateAdmissionSha256',
  'admittedAt',
  'sourceChain',
  'finalFrame',
  'review',
]);
const SOURCE_CHAIN_KEYS = Object.freeze([
  'runtimeDispatchSha256',
  'runtimeBindingSha256',
  'runtimeOutcomeSha256',
  'materializationSha256',
  'finisherRequestSha256',
  'frameFinisherSha256',
  'reviewRequestSha256',
  'reviewDecisionSha256',
  'reviewOutcomeSha256',
  'candidateArtifactId',
  'evidenceArtifactId',
  'providerRequestId',
  'providerRequestSha256',
  'compiledPromptSha256',
]);
const FINAL_FRAME_KEYS = Object.freeze([
  'path',
  'reviewedTargetPath',
  'sha256',
  'bytes',
  'width',
  'height',
  'visibleBounds',
  'visiblePixelSha256',
  'alphaSha256',
  'alphaAssociation',
  'pixelFormat',
  'colourSpace',
]);
const REVIEW_KEYS = Object.freeze([
  'reviewId',
  'reviewer',
  'gates',
  'evidence',
  'notes',
]);
const REVIEWER_KEYS = Object.freeze([
  'actorClass',
  'actorId',
  'occurredAt',
  'evidenceSha256',
]);
const REVIEW_GATE_KEYS = Object.freeze([
  'technical',
  'handsAndAnatomy',
  'faceIdentity',
  'silhouetteRegistration',
  'adjacentFrameContinuity',
  'loopClosure',
]);
const REVIEW_EVIDENCE_KEYS = Object.freeze([
  'nativeScaleSha256',
  'contactSheetSha256',
  'identityReferenceSha256',
  'adjacentFramesSha256',
  'loopClosureSha256',
]);
const RELEASE_REVIEW_KEYS = Object.freeze([
  'eligible',
  'exactSlotCount',
  'exactSlotSetComplete',
  'allCandidatesTechnicallyAdmitted',
  'candidateApprovalInherited',
  'separateNamedHumanReleaseApprovalRequired',
  'releaseApproved',
  'poseSlotFillingPerformed',
  'poseBankReleased',
  'sequenceReleased',
  'runtimeActivationAllowed',
  'websiteInstallationAllowed',
  'requiredNextSteps',
]);

function expectedReviewedTargetPath(slotId) {
  return `assets/top-hat-man/candidates/top-hat-man-${slotId}-v1.alpha.png`;
}

function expectedFinishedFramePath(slotId) {
  return `scratch/avatar-final-pass/top-hat-pose-slots-v1/${slotId}/candidate-01.finished.png`;
}

function parseVisibleBounds(value, label) {
  assert(
    isRecord(value) &&
      Object.keys(value).length >= 4 &&
      Object.values(value).every(
        (entry) => Number.isSafeInteger(entry) && entry >= 0,
      ),
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_VISIBLE_BOUNDS_INVALID',
    `${label} is invalid.`,
  );
  return deepFreeze(snapshotJsonValue(value, label));
}

function parseSourceChain(value, label) {
  exactKeys(
    value,
    SOURCE_CHAIN_KEYS,
    label,
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_SOURCE_CHAIN_INVALID',
  );
  for (const key of SOURCE_CHAIN_KEYS.filter((entry) =>
    entry.endsWith('Sha256'),
  )) {
    digest(value[key], `${label}.${key}`);
  }
  artifactId(value.candidateArtifactId, `${label}.candidateArtifactId`);
  artifactId(value.evidenceArtifactId, `${label}.evidenceArtifactId`);
  boundedText(value.providerRequestId, `${label}.providerRequestId`, 1, 256);
  return deepFreeze(snapshotJsonValue(value, label));
}

function parseReviewer(value, label) {
  exactKeys(
    value,
    REVIEWER_KEYS,
    label,
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_REVIEW_INVALID',
  );
  assert(
    value.actorClass === 'human' &&
      typeof value.actorId === 'string' &&
      value.actorId.length >= 1 &&
      value.actorId.length <= 256 &&
      !value.actorId.includes('\0'),
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_NAMED_HUMAN_REVIEW_REQUIRED',
  );
  timestamp(value.occurredAt, `${label}.occurredAt`);
  digest(value.evidenceSha256, `${label}.evidenceSha256`);
  return deepFreeze(snapshotJsonValue(value, label));
}

function parseReviewGates(value, label) {
  exactKeys(
    value,
    REVIEW_GATE_KEYS,
    label,
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_REVIEW_INVALID',
  );
  for (const key of REVIEW_GATE_KEYS.filter((entry) => entry !== 'loopClosure')) {
    assert(
      value[key] === 'pass',
      'TOP_HAT_POSE_BANK_RELEASE_PLAN_REVIEW_INVALID',
      `${label}.${key} must pass.`,
    );
  }
  assert(
    value.loopClosure === 'pass' || value.loopClosure === 'not-applicable',
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_REVIEW_INVALID',
  );
  return deepFreeze(snapshotJsonValue(value, label));
}

function parseReviewEvidence(value, gates, label) {
  exactKeys(
    value,
    REVIEW_EVIDENCE_KEYS,
    label,
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_REVIEW_INVALID',
  );
  for (const key of REVIEW_EVIDENCE_KEYS.filter(
    (entry) => entry !== 'loopClosureSha256',
  )) {
    digest(value[key], `${label}.${key}`);
  }
  if (gates.loopClosure === 'not-applicable') {
    assert(
      value.loopClosureSha256 === null,
      'TOP_HAT_POSE_BANK_RELEASE_PLAN_REVIEW_INVALID',
    );
  } else {
    digest(value.loopClosureSha256, `${label}.loopClosureSha256`);
  }
  return deepFreeze(snapshotJsonValue(value, label));
}

function parseReview(value, label) {
  exactKeys(
    value,
    REVIEW_KEYS,
    label,
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_REVIEW_INVALID',
  );
  boundedText(value.reviewId, `${label}.reviewId`, 1, 512);
  const reviewer = parseReviewer(value.reviewer, `${label}.reviewer`);
  const gates = parseReviewGates(value.gates, `${label}.gates`);
  const evidence = parseReviewEvidence(
    value.evidence,
    gates,
    `${label}.evidence`,
  );
  boundedText(value.notes, `${label}.notes`, 1, 32_000);
  return deepFreeze({
    reviewId: value.reviewId,
    reviewer,
    gates,
    evidence,
    notes: value.notes,
  });
}

function parseFinalFrame(value, slotId, label) {
  exactKeys(
    value,
    FINAL_FRAME_KEYS,
    label,
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_FINAL_FRAME_INVALID',
  );
  canonicalPath(value.path, `${label}.path`);
  canonicalPath(value.reviewedTargetPath, `${label}.reviewedTargetPath`);
  assert(
    value.path === expectedFinishedFramePath(slotId) &&
      value.reviewedTargetPath === expectedReviewedTargetPath(slotId) &&
      Number.isSafeInteger(value.bytes) &&
      value.bytes >= 57 &&
      value.width === 1024 &&
      value.height === 1536 &&
      value.alphaAssociation === 'straight' &&
      value.pixelFormat === 'rgba8-straight' &&
      value.colourSpace === 'srgb',
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_FINAL_FRAME_INVALID',
    `${label} does not match the exact ${slotId} release target.`,
  );
  digest(value.sha256, `${label}.sha256`);
  digest(value.visiblePixelSha256, `${label}.visiblePixelSha256`);
  digest(value.alphaSha256, `${label}.alphaSha256`);
  return deepFreeze({
    path: value.path,
    reviewedTargetPath: value.reviewedTargetPath,
    sha256: value.sha256,
    bytes: value.bytes,
    width: value.width,
    height: value.height,
    visibleBounds: parseVisibleBounds(value.visibleBounds, `${label}.visibleBounds`),
    visiblePixelSha256: value.visiblePixelSha256,
    alphaSha256: value.alphaSha256,
    alphaAssociation: value.alphaAssociation,
    pixelFormat: value.pixelFormat,
    colourSpace: value.colourSpace,
  });
}

function parsePlanSlot(value, expectedSlotId, index) {
  const label = `Top Hat pose-bank release plan.slots[${index}]`;
  exactKeys(
    value,
    SLOT_KEYS,
    label,
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_SLOT_INVALID',
  );
  assert(
    value.slotId === expectedSlotId,
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_SLOT_ORDER_INVALID',
    `${label}.slotId must be ${expectedSlotId}.`,
  );
  digest(value.candidateAdmissionSha256, `${label}.candidateAdmissionSha256`);
  timestamp(value.admittedAt, `${label}.admittedAt`);
  return deepFreeze({
    slotId: value.slotId,
    candidateAdmissionSha256: value.candidateAdmissionSha256,
    admittedAt: value.admittedAt,
    sourceChain: parseSourceChain(value.sourceChain, `${label}.sourceChain`),
    finalFrame: parseFinalFrame(value.finalFrame, value.slotId, `${label}.finalFrame`),
    review: parseReview(value.review, `${label}.review`),
  });
}

function parseReleaseReview(value) {
  exactKeys(
    value,
    RELEASE_REVIEW_KEYS,
    'Top Hat pose-bank release plan.releaseReview',
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_STATE_INVALID',
  );
  assert(
    value.eligible === true &&
      value.exactSlotCount === 6 &&
      value.exactSlotSetComplete === true &&
      value.allCandidatesTechnicallyAdmitted === true &&
      value.candidateApprovalInherited === false &&
      value.separateNamedHumanReleaseApprovalRequired === true &&
      value.releaseApproved === false &&
      value.poseSlotFillingPerformed === false &&
      value.poseBankReleased === false &&
      value.sequenceReleased === false &&
      value.runtimeActivationAllowed === false &&
      value.websiteInstallationAllowed === false &&
      Array.isArray(value.requiredNextSteps) &&
      value.requiredNextSteps.join('\0') ===
        TOP_HAT_POSE_BANK_RELEASE_PLAN_REQUIRED_NEXT_STEPS.join('\0'),
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_STATE_INVALID',
  );
  return deepFreeze(
    snapshotJsonValue(
      value,
      'Top Hat pose-bank release plan.releaseReview',
    ),
  );
}

function assertDistinctIdentities(slots) {
  const admissionHashes = slots.map(
    (slot) => slot.candidateAdmissionSha256,
  );
  assert(
    new Set(admissionHashes).size === admissionHashes.length,
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_ADMISSION_COLLISION',
    'Top Hat candidate-admission identities must be distinct.',
  );
  for (const field of ['path', 'reviewedTargetPath']) {
    const values = slots.map((slot) => slot.finalFrame[field]);
    assert(
      new Set(values).size === values.length,
      'TOP_HAT_POSE_BANK_RELEASE_PLAN_PATH_COLLISION',
      `Top Hat finalFrame.${field} values must be distinct.`,
    );
  }
}

function sourceIdentity(admission) {
  return {
    adapterSha256: admission.adapterSha256,
    sourceProviderPackageSha256: admission.sourceProviderPackageSha256,
    sourceProviderRequestSha256: admission.sourceProviderRequestSha256,
    productionPlanSha256: admission.productionPlanSha256,
    runtime: admission.runtime,
    artStudio: admission.artStudio,
  };
}

function assertCommonSourceIdentity(admissions) {
  const expected = sourceIdentity(admissions[0]);
  for (const admission of admissions.slice(1)) {
    assert(
      canonicalJson(sourceIdentity(admission)) === canonicalJson(expected),
      'TOP_HAT_POSE_BANK_RELEASE_PLAN_SOURCE_MISMATCH',
      `${admission.slotId} does not share the exact Top Hat production source identity.`,
    );
  }
  assert(
    canonicalJson(expected.runtime) === canonicalJson(TOP_HAT_POSE_SLOT_RUNTIME_PIN) &&
      canonicalJson(expected.artStudio) ===
        canonicalJson(TOP_HAT_POSE_SLOT_ART_STUDIO_PIN),
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_SOURCE_MISMATCH',
    'The admissions do not bind the exact Runtime 0.34 and Art Studio source pins.',
  );
  digest(expected.adapterSha256, 'Top Hat pose-bank release plan.adapterSha256');
  digest(
    expected.sourceProviderPackageSha256,
    'Top Hat pose-bank release plan.sourceProviderPackageSha256',
  );
  digest(
    expected.sourceProviderRequestSha256,
    'Top Hat pose-bank release plan.sourceProviderRequestSha256',
  );
  digest(
    expected.productionPlanSha256,
    'Top Hat pose-bank release plan.productionPlanSha256',
  );
  return deepFreeze(
    snapshotJsonValue(
      expected,
      'Top Hat pose-bank release plan source identity',
    ),
  );
}

function assertAdmissionState(admission) {
  assert(
    admission.characterId === TOP_HAT_POSE_SLOT_CHARACTER_ID &&
      admission.releaseReview?.eligible === true &&
      admission.releaseReview?.candidateApprovalInherited === false &&
      admission.releaseReview?.poseSlotFilled === false &&
      admission.releaseReview?.poseBankReleased === false &&
      admission.releaseReview?.runtimeActivationAllowed === false &&
      admission.releaseReview?.websiteInstallationAllowed === false,
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_ADMISSION_STATE_INVALID',
  );
}

function planSlot(admission) {
  const value = {
    slotId: admission.slotId,
    candidateAdmissionSha256: admission.candidateAdmissionSha256,
    admittedAt: admission.admittedAt,
    sourceChain: admission.sourceChain,
    finalFrame: {
      path: admission.finalFrame.path,
      reviewedTargetPath: admission.finalFrame.reviewedTargetPath,
      sha256: admission.finalFrame.sha256,
      bytes: admission.finalFrame.bytes,
      width: admission.finalFrame.width,
      height: admission.finalFrame.height,
      visibleBounds: admission.finalFrame.visibleBounds,
      visiblePixelSha256: admission.finalFrame.visiblePixelSha256,
      alphaSha256: admission.finalFrame.alphaSha256,
      alphaAssociation: admission.finalFrame.alphaAssociation,
      pixelFormat: admission.finalFrame.pixelFormat,
      colourSpace: admission.finalFrame.colourSpace,
    },
    review: admission.review,
  };
  return parsePlanSlot(
    value,
    admission.slotId,
    TOP_HAT_POSE_SLOT_IDS.indexOf(admission.slotId),
  );
}

export function compileProjectArtTopHatPoseBankReleasePlan({
  admissions: admissionsInput,
  compiledAt = new Date().toISOString(),
}) {
  timestamp(compiledAt, 'compiledAt');
  const snapshot = snapshotJsonValue(
    admissionsInput,
    'Top Hat pose-bank release-plan admissions',
  );
  assert(
    Array.isArray(snapshot) && snapshot.length === TOP_HAT_POSE_SLOT_IDS.length,
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_SLOT_SET_INVALID',
    'Exactly six Top Hat candidate admissions are required.',
  );
  const parsed = snapshot.map((entry) =>
    parseProjectArtTopHatPoseSlotCandidateAdmission(entry),
  );
  for (const admission of parsed) assertAdmissionState(admission);

  const bySlot = new Map();
  for (const admission of parsed) {
    assert(
      !bySlot.has(admission.slotId),
      'TOP_HAT_POSE_BANK_RELEASE_PLAN_SLOT_SET_INVALID',
      `Duplicate Top Hat pose-slot admission: ${admission.slotId}.`,
    );
    bySlot.set(admission.slotId, admission);
  }
  assert(
    TOP_HAT_POSE_SLOT_IDS.every((slotId) => bySlot.has(slotId)),
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_SLOT_SET_INVALID',
    'The complete canonical Top Hat pose-slot set is required.',
  );

  const admissions = TOP_HAT_POSE_SLOT_IDS.map((slotId) => bySlot.get(slotId));
  const identity = assertCommonSourceIdentity(admissions);
  const slots = Object.freeze(admissions.map(planSlot));
  assertDistinctIdentities(slots);
  const latestAdmission = Math.max(
    ...admissions.map((admission) => Date.parse(admission.admittedAt)),
  );
  assert(
    Date.parse(compiledAt) >= latestAdmission,
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_TIME_INVALID',
    'The release plan cannot precede its latest candidate admission.',
  );

  const body = {
    schema: TOP_HAT_POSE_BANK_RELEASE_PLAN_SCHEMA,
    protocolVersion: TOP_HAT_POSE_BANK_RELEASE_PLAN_PROTOCOL,
    status: TOP_HAT_POSE_BANK_RELEASE_PLAN_STATUS,
    compiledAt,
    characterId: TOP_HAT_POSE_SLOT_CHARACTER_ID,
    slotCount: TOP_HAT_POSE_SLOT_IDS.length,
    adapterSha256: identity.adapterSha256,
    sourceProviderPackageSha256: identity.sourceProviderPackageSha256,
    sourceProviderRequestSha256: identity.sourceProviderRequestSha256,
    productionPlanSha256: identity.productionPlanSha256,
    runtime: identity.runtime,
    artStudio: identity.artStudio,
    slots,
    releaseReview: Object.freeze({
      eligible: true,
      exactSlotCount: TOP_HAT_POSE_SLOT_IDS.length,
      exactSlotSetComplete: true,
      allCandidatesTechnicallyAdmitted: true,
      candidateApprovalInherited: false,
      separateNamedHumanReleaseApprovalRequired: true,
      releaseApproved: false,
      poseSlotFillingPerformed: false,
      poseBankReleased: false,
      sequenceReleased: false,
      runtimeActivationAllowed: false,
      websiteInstallationAllowed: false,
      requiredNextSteps: TOP_HAT_POSE_BANK_RELEASE_PLAN_REQUIRED_NEXT_STEPS,
    }),
    authority: topHatPoseBankReleasePlanAuthority(),
  };
  return deepFreeze({
    ...body,
    poseBankReleasePlanSha256: sha256Document(body),
  });
}

export function parseProjectArtTopHatPoseBankReleasePlan(input) {
  const plan = verifySelfHash(
    input,
    'poseBankReleasePlanSha256',
    'Top Hat pose-bank release plan',
  );
  exactKeys(
    plan,
    PLAN_KEYS,
    'Top Hat pose-bank release plan',
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_KEYS_INVALID',
  );
  assert(
    plan.schema === TOP_HAT_POSE_BANK_RELEASE_PLAN_SCHEMA &&
      plan.protocolVersion === TOP_HAT_POSE_BANK_RELEASE_PLAN_PROTOCOL &&
      plan.status === TOP_HAT_POSE_BANK_RELEASE_PLAN_STATUS &&
      plan.characterId === TOP_HAT_POSE_SLOT_CHARACTER_ID &&
      plan.slotCount === TOP_HAT_POSE_SLOT_IDS.length,
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_SCHEMA_INVALID',
  );
  timestamp(plan.compiledAt, 'Top Hat pose-bank release plan.compiledAt');
  digest(plan.adapterSha256, 'Top Hat pose-bank release plan.adapterSha256');
  digest(
    plan.sourceProviderPackageSha256,
    'Top Hat pose-bank release plan.sourceProviderPackageSha256',
  );
  digest(
    plan.sourceProviderRequestSha256,
    'Top Hat pose-bank release plan.sourceProviderRequestSha256',
  );
  digest(
    plan.productionPlanSha256,
    'Top Hat pose-bank release plan.productionPlanSha256',
  );
  assert(
    canonicalJson(plan.runtime) === canonicalJson(TOP_HAT_POSE_SLOT_RUNTIME_PIN) &&
      canonicalJson(plan.artStudio) ===
        canonicalJson(TOP_HAT_POSE_SLOT_ART_STUDIO_PIN),
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_SOURCE_MISMATCH',
  );
  assert(
    Array.isArray(plan.slots) &&
      plan.slots.length === TOP_HAT_POSE_SLOT_IDS.length,
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_SLOT_SET_INVALID',
  );
  const slots = Object.freeze(
    plan.slots.map((entry, index) =>
      parsePlanSlot(entry, TOP_HAT_POSE_SLOT_IDS[index], index),
    ),
  );
  assertDistinctIdentities(slots);
  const latestAdmission = Math.max(
    ...slots.map((slot) => Date.parse(slot.admittedAt)),
  );
  assert(
    Date.parse(plan.compiledAt) >= latestAdmission,
    'TOP_HAT_POSE_BANK_RELEASE_PLAN_TIME_INVALID',
  );
  parseReleaseReview(plan.releaseReview);
  parseTopHatPoseBankReleasePlanAuthority(plan.authority);
  return plan;
}

export function projectArtTopHatPoseBankReleasePlanCapabilities() {
  return topHatPoseBankReleasePlanCapabilities();
}

export {
  TOP_HAT_POSE_BANK_RELEASE_PLAN_CAPABILITIES_SCHEMA,
  TOP_HAT_POSE_BANK_RELEASE_PLAN_PROTOCOL,
  TOP_HAT_POSE_BANK_RELEASE_PLAN_SCHEMA,
  TOP_HAT_POSE_BANK_RELEASE_PLAN_STATUS,
};
