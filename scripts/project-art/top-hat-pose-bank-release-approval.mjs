import {
  assert,
  boundedText,
  canonicalJson,
  canonicalPath,
  createAuthority,
  deepFreeze,
  digest,
  exactKeys,
  parseAllFalseAuthority,
  sameCanonical,
  sha256Document,
  snapshotJsonValue,
  timestamp,
  verifySelfHash,
} from './avatar-final-pass-provider-runtime-common.mjs';
import {
  TOP_HAT_POSE_SLOT_IDS,
} from './top-hat-pose-slot-candidate-admission.mjs';
import {
  parseProjectArtTopHatPoseBankReleasePlan,
} from './top-hat-pose-bank-release-plan.mjs';
import {
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_ADMISSION_SCHEMA,
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_CAPABILITIES_SCHEMA,
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_DECISION,
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_DECISION_SCHEMA,
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_PROTOCOL,
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_REQUIRED_NEXT_STEPS,
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_STATUS,
  parseTopHatPoseBankReleaseApprovalAuthority,
  topHatPoseBankReleaseApprovalAuthority,
  topHatPoseBankReleaseApprovalCapabilities,
} from './top-hat-pose-bank-release-approval-foundation.mjs';

const SLOT_IDENTITY_KEYS = Object.freeze([
  'slotId',
  'candidateAdmissionSha256',
  'finalFramePath',
  'reviewedTargetPath',
  'finalFrameSha256',
  'visiblePixelSha256',
  'alphaSha256',
  'reviewDecisionSha256',
  'reviewOutcomeSha256',
]);
const REVIEWER_KEYS = Object.freeze([
  'actorClass',
  'actorId',
  'occurredAt',
  'evidenceSha256',
]);
const EVIDENCE_KEYS = Object.freeze([
  'poseBankContactSheetSha256',
  'identityContinuityReviewSha256',
  'alphaIntegrityReviewSha256',
  'sourceLineageReviewSha256',
]);
const DECISION_AUTHORITY_KEYS = Object.freeze([
  'sourceMutation',
  'providerExecution',
  'runtimeEnqueue',
  'imageMutation',
  'candidatePromotion',
  'poseSlotFilling',
  'poseBankRelease',
  'runtimePublication',
  'sequenceRelease',
  'repositoryMutation',
  'gitCommit',
  'gitPush',
  'deployment',
  'publication',
  'runtimeActivation',
  'websiteInstallation',
  'forcePush',
]);
const DECISION_KEYS = Object.freeze([
  'schema',
  'protocolVersion',
  'decision',
  'decidedAt',
  'characterId',
  'poseBankReleasePlanSha256',
  'slotCount',
  'slots',
  'reviewer',
  'evidence',
  'notes',
  'authority',
  'releaseApprovalDecisionSha256',
]);
const RELEASE_STATE_KEYS = Object.freeze([
  'humanReleaseApprovalAdmitted',
  'releaseApproved',
  'poseSlotFillingPerformed',
  'poseBankReleased',
  'runtimePublicationEligible',
  'runtimePublicationPerformed',
  'sequenceReleased',
  'websiteInstallationAllowed',
  'websiteInstallationPerformed',
  'runtimeActivationAllowed',
  'runtimeActivationPerformed',
  'requiredNextSteps',
]);
const ADMISSION_KEYS = Object.freeze([
  'schema',
  'protocolVersion',
  'status',
  'admittedAt',
  'approvedAt',
  'characterId',
  'poseBankReleasePlanSha256',
  'releaseApprovalDecisionSha256',
  'slotCount',
  'slots',
  'reviewer',
  'evidence',
  'notes',
  'releaseState',
  'authority',
  'releaseApprovalAdmissionSha256',
]);

function allFalseDecisionAuthority() {
  return createAuthority(DECISION_AUTHORITY_KEYS);
}

function parseEvidence(value, label) {
  exactKeys(
    value,
    EVIDENCE_KEYS,
    label,
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_EVIDENCE_INVALID',
  );
  for (const key of EVIDENCE_KEYS) {
    digest(value[key], `${label}.${key}`);
  }
  return deepFreeze(snapshotJsonValue(value, label));
}

function parseReviewer(value, label) {
  exactKeys(
    value,
    REVIEWER_KEYS,
    label,
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_REVIEWER_INVALID',
  );
  assert(
    value.actorClass === 'human',
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_NAMED_HUMAN_REQUIRED',
    `${label}.actorClass must be human.`,
  );
  boundedText(value.actorId, `${label}.actorId`, 1, 256);
  timestamp(value.occurredAt, `${label}.occurredAt`);
  digest(value.evidenceSha256, `${label}.evidenceSha256`);
  return deepFreeze(snapshotJsonValue(value, label));
}

function slotIdentityFromPlan(slot) {
  return Object.freeze({
    slotId: slot.slotId,
    candidateAdmissionSha256: slot.candidateAdmissionSha256,
    finalFramePath: slot.finalFrame.path,
    reviewedTargetPath: slot.finalFrame.reviewedTargetPath,
    finalFrameSha256: slot.finalFrame.sha256,
    visiblePixelSha256: slot.finalFrame.visiblePixelSha256,
    alphaSha256: slot.finalFrame.alphaSha256,
    reviewDecisionSha256: slot.sourceChain.reviewDecisionSha256,
    reviewOutcomeSha256: slot.sourceChain.reviewOutcomeSha256,
  });
}

function parseSlotIdentity(value, expectedSlotId, index) {
  const label = `Top Hat pose-bank release approval.slots[${index}]`;
  exactKeys(
    value,
    SLOT_IDENTITY_KEYS,
    label,
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_SLOT_INVALID',
  );
  assert(
    value.slotId === expectedSlotId,
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_SLOT_ORDER_INVALID',
    `${label}.slotId must be ${expectedSlotId}.`,
  );
  digest(value.candidateAdmissionSha256, `${label}.candidateAdmissionSha256`);
  canonicalPath(value.finalFramePath, `${label}.finalFramePath`);
  canonicalPath(value.reviewedTargetPath, `${label}.reviewedTargetPath`);
  for (const key of [
    'finalFrameSha256',
    'visiblePixelSha256',
    'alphaSha256',
    'reviewDecisionSha256',
    'reviewOutcomeSha256',
  ]) {
    digest(value[key], `${label}.${key}`);
  }
  return deepFreeze(snapshotJsonValue(value, label));
}

function parseSlots(value) {
  assert(
    Array.isArray(value) && value.length === TOP_HAT_POSE_SLOT_IDS.length,
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_SLOT_SET_INVALID',
    'Exactly six Top Hat pose-slot identities are required.',
  );
  const slots = Object.freeze(
    value.map((entry, index) =>
      parseSlotIdentity(entry, TOP_HAT_POSE_SLOT_IDS[index], index),
    ),
  );
  for (const key of [
    'candidateAdmissionSha256',
    'finalFramePath',
    'reviewedTargetPath',
  ]) {
    const identities = slots.map((slot) => slot[key]);
    assert(
      new Set(identities).size === identities.length,
      'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_SLOT_COLLISION',
      `Top Hat release-approval slot ${key} identities must be distinct.`,
    );
  }
  return slots;
}

function expectedSlots(plan) {
  return Object.freeze(plan.slots.map(slotIdentityFromPlan));
}

function assertSlotsBindPlan(slots, plan) {
  assert(
    canonicalJson(slots) === canonicalJson(expectedSlots(plan)),
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_PLAN_BINDING_INVALID',
    'The human decision does not bind the exact six-slot release plan.',
  );
}

function parseReleaseState(value) {
  exactKeys(
    value,
    RELEASE_STATE_KEYS,
    'Top Hat pose-bank release approval.releaseState',
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_STATE_INVALID',
  );
  assert(
    value.humanReleaseApprovalAdmitted === true &&
      value.releaseApproved === true &&
      value.poseSlotFillingPerformed === false &&
      value.poseBankReleased === false &&
      value.runtimePublicationEligible === true &&
      value.runtimePublicationPerformed === false &&
      value.sequenceReleased === false &&
      value.websiteInstallationAllowed === false &&
      value.websiteInstallationPerformed === false &&
      value.runtimeActivationAllowed === false &&
      value.runtimeActivationPerformed === false &&
      Array.isArray(value.requiredNextSteps) &&
      value.requiredNextSteps.join('\0') ===
        TOP_HAT_POSE_BANK_RELEASE_APPROVAL_REQUIRED_NEXT_STEPS.join('\0'),
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_STATE_INVALID',
  );
  return deepFreeze(
    snapshotJsonValue(
      value,
      'Top Hat pose-bank release approval.releaseState',
    ),
  );
}

export function projectArtTopHatPoseBankReleaseApprovalDecisionAuthority() {
  return allFalseDecisionAuthority();
}

export function parseProjectArtTopHatPoseBankReleaseApprovalDecision(
  input,
  releasePlanInput,
) {
  const plan = parseProjectArtTopHatPoseBankReleasePlan(releasePlanInput);
  const decision = verifySelfHash(
    input,
    'releaseApprovalDecisionSha256',
    'Top Hat pose-bank release-approval decision',
  );
  exactKeys(
    decision,
    DECISION_KEYS,
    'Top Hat pose-bank release-approval decision',
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_DECISION_KEYS_INVALID',
  );
  assert(
    decision.schema === TOP_HAT_POSE_BANK_RELEASE_APPROVAL_DECISION_SCHEMA &&
      decision.protocolVersion === TOP_HAT_POSE_BANK_RELEASE_APPROVAL_PROTOCOL &&
      decision.decision === TOP_HAT_POSE_BANK_RELEASE_APPROVAL_DECISION &&
      decision.characterId === plan.characterId &&
      decision.characterId === 'top-hat-man' &&
      decision.poseBankReleasePlanSha256 ===
        plan.poseBankReleasePlanSha256 &&
      decision.slotCount === TOP_HAT_POSE_SLOT_IDS.length,
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_DECISION_INVALID',
  );
  timestamp(decision.decidedAt, 'Top Hat pose-bank release-approval decision.decidedAt');
  assert(
    Date.parse(decision.decidedAt) >= Date.parse(plan.compiledAt),
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_TIME_INVALID',
    'The release-approval decision cannot precede the release plan.',
  );
  const slots = parseSlots(decision.slots);
  assertSlotsBindPlan(slots, plan);
  const reviewer = parseReviewer(
    decision.reviewer,
    'Top Hat pose-bank release-approval decision.reviewer',
  );
  assert(
    reviewer.occurredAt === decision.decidedAt,
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_REVIEWER_INVALID',
    'The named-human reviewer timestamp must equal decidedAt.',
  );
  const evidence = parseEvidence(
    decision.evidence,
    'Top Hat pose-bank release-approval decision.evidence',
  );
  assert(
    reviewer.evidenceSha256 === sha256Document(evidence),
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_EVIDENCE_BINDING_INVALID',
    'The reviewer evidence digest does not bind the exact evidence record.',
  );
  boundedText(
    decision.notes,
    'Top Hat pose-bank release-approval decision.notes',
    1,
    32_000,
  );
  parseAllFalseAuthority(
    decision.authority,
    DECISION_AUTHORITY_KEYS,
    'Top Hat pose-bank release-approval decision.authority',
  );
  return decision;
}

export function admitProjectArtTopHatPoseBankReleaseApproval({
  releasePlan: releasePlanInput,
  decision: decisionInput,
  admittedAt = new Date().toISOString(),
}) {
  const plan = parseProjectArtTopHatPoseBankReleasePlan(releasePlanInput);
  const decision = parseProjectArtTopHatPoseBankReleaseApprovalDecision(
    decisionInput,
    plan,
  );
  timestamp(admittedAt, 'admittedAt');
  assert(
    Date.parse(admittedAt) >= Date.parse(decision.decidedAt),
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_TIME_INVALID',
    'The approval admission cannot precede the named-human decision.',
  );

  const body = {
    schema: TOP_HAT_POSE_BANK_RELEASE_APPROVAL_ADMISSION_SCHEMA,
    protocolVersion: TOP_HAT_POSE_BANK_RELEASE_APPROVAL_PROTOCOL,
    status: TOP_HAT_POSE_BANK_RELEASE_APPROVAL_STATUS,
    admittedAt,
    approvedAt: decision.decidedAt,
    characterId: plan.characterId,
    poseBankReleasePlanSha256: plan.poseBankReleasePlanSha256,
    releaseApprovalDecisionSha256: decision.releaseApprovalDecisionSha256,
    slotCount: TOP_HAT_POSE_SLOT_IDS.length,
    slots: decision.slots,
    reviewer: decision.reviewer,
    evidence: decision.evidence,
    notes: decision.notes,
    releaseState: Object.freeze({
      humanReleaseApprovalAdmitted: true,
      releaseApproved: true,
      poseSlotFillingPerformed: false,
      poseBankReleased: false,
      runtimePublicationEligible: true,
      runtimePublicationPerformed: false,
      sequenceReleased: false,
      websiteInstallationAllowed: false,
      websiteInstallationPerformed: false,
      runtimeActivationAllowed: false,
      runtimeActivationPerformed: false,
      requiredNextSteps:
        TOP_HAT_POSE_BANK_RELEASE_APPROVAL_REQUIRED_NEXT_STEPS,
    }),
    authority: topHatPoseBankReleaseApprovalAuthority(),
  };
  return deepFreeze({
    ...body,
    releaseApprovalAdmissionSha256: sha256Document(body),
  });
}

export function parseProjectArtTopHatPoseBankReleaseApprovalAdmission(input) {
  const admission = verifySelfHash(
    input,
    'releaseApprovalAdmissionSha256',
    'Top Hat pose-bank release-approval admission',
  );
  exactKeys(
    admission,
    ADMISSION_KEYS,
    'Top Hat pose-bank release-approval admission',
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_ADMISSION_KEYS_INVALID',
  );
  assert(
    admission.schema === TOP_HAT_POSE_BANK_RELEASE_APPROVAL_ADMISSION_SCHEMA &&
      admission.protocolVersion === TOP_HAT_POSE_BANK_RELEASE_APPROVAL_PROTOCOL &&
      admission.status === TOP_HAT_POSE_BANK_RELEASE_APPROVAL_STATUS &&
      admission.characterId === 'top-hat-man' &&
      admission.slotCount === TOP_HAT_POSE_SLOT_IDS.length,
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_ADMISSION_INVALID',
  );
  timestamp(admission.admittedAt, 'Top Hat pose-bank release-approval admission.admittedAt');
  timestamp(admission.approvedAt, 'Top Hat pose-bank release-approval admission.approvedAt');
  assert(
    Date.parse(admission.admittedAt) >= Date.parse(admission.approvedAt),
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_TIME_INVALID',
  );
  digest(
    admission.poseBankReleasePlanSha256,
    'Top Hat pose-bank release-approval admission.poseBankReleasePlanSha256',
  );
  digest(
    admission.releaseApprovalDecisionSha256,
    'Top Hat pose-bank release-approval admission.releaseApprovalDecisionSha256',
  );
  parseSlots(admission.slots);
  const reviewer = parseReviewer(
    admission.reviewer,
    'Top Hat pose-bank release-approval admission.reviewer',
  );
  assert(
    reviewer.occurredAt === admission.approvedAt,
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_REVIEWER_INVALID',
  );
  const evidence = parseEvidence(
    admission.evidence,
    'Top Hat pose-bank release-approval admission.evidence',
  );
  assert(
    reviewer.evidenceSha256 === sha256Document(evidence),
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_EVIDENCE_BINDING_INVALID',
  );
  boundedText(
    admission.notes,
    'Top Hat pose-bank release-approval admission.notes',
    1,
    32_000,
  );
  parseReleaseState(admission.releaseState);
  parseTopHatPoseBankReleaseApprovalAuthority(admission.authority);
  return admission;
}

export function verifyProjectArtTopHatPoseBankReleaseApprovalAdmission(
  input,
  { releasePlan: releasePlanInput, decision: decisionInput },
) {
  const admission =
    parseProjectArtTopHatPoseBankReleaseApprovalAdmission(input);
  const plan = parseProjectArtTopHatPoseBankReleasePlan(releasePlanInput);
  const decision = parseProjectArtTopHatPoseBankReleaseApprovalDecision(
    decisionInput,
    plan,
  );
  assert(
    admission.poseBankReleasePlanSha256 ===
      plan.poseBankReleasePlanSha256 &&
      admission.releaseApprovalDecisionSha256 ===
        decision.releaseApprovalDecisionSha256 &&
      admission.approvedAt === decision.decidedAt &&
      admission.characterId === plan.characterId &&
      sameCanonical(admission.slots, decision.slots) &&
      sameCanonical(admission.reviewer, decision.reviewer) &&
      sameCanonical(admission.evidence, decision.evidence) &&
      admission.notes === decision.notes,
    'TOP_HAT_POSE_BANK_RELEASE_APPROVAL_ADMISSION_BINDING_INVALID',
    'The approval admission does not bind the exact plan and decision.',
  );
  return admission;
}

export function projectArtTopHatPoseBankReleaseApprovalCapabilities() {
  return topHatPoseBankReleaseApprovalCapabilities();
}

export {
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_ADMISSION_SCHEMA,
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_CAPABILITIES_SCHEMA,
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_DECISION,
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_DECISION_SCHEMA,
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_PROTOCOL,
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_STATUS,
};
