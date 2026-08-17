#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  sha256Document,
} from './project-art/avatar-final-pass-provider-runtime-common.mjs';
import {
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_ADMISSION_SCHEMA,
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_CAPABILITIES_SCHEMA,
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_STATUS,
  admitProjectArtTopHatPoseBankReleaseApproval,
  parseProjectArtTopHatPoseBankReleaseApprovalAdmission,
  parseProjectArtTopHatPoseBankReleaseApprovalDecision,
  projectArtTopHatPoseBankReleaseApprovalCapabilities,
  verifyProjectArtTopHatPoseBankReleaseApprovalAdmission,
} from './project-art/top-hat-pose-bank-release-approval.mjs';
import {
  createTopHatPoseBankReleaseApprovalFixture,
} from './project-art/top-hat-pose-bank-release-approval-fixture.mjs';

function errorCode(code) {
  return (error) => error?.code === code;
}

function withSelfHash(value, field) {
  const body = { ...value };
  delete body[field];
  value[field] = sha256Document(body);
  return value;
}

function admit(fixture = createTopHatPoseBankReleaseApprovalFixture()) {
  return admitProjectArtTopHatPoseBankReleaseApproval({
    releasePlan: fixture.releasePlan,
    decision: fixture.decision,
    admittedAt: fixture.admittedAt,
  });
}

test('admits one exact named-human six-slot approval for publication eligibility only', () => {
  const fixture = createTopHatPoseBankReleaseApprovalFixture();
  const admission = admit(fixture);
  assert.equal(
    admission.schema,
    TOP_HAT_POSE_BANK_RELEASE_APPROVAL_ADMISSION_SCHEMA,
  );
  assert.equal(admission.status, TOP_HAT_POSE_BANK_RELEASE_APPROVAL_STATUS);
  assert.equal(admission.characterId, 'top-hat-man');
  assert.equal(admission.slotCount, 6);
  assert.equal(admission.reviewer.actorClass, 'human');
  assert.equal(admission.releaseState.humanReleaseApprovalAdmitted, true);
  assert.equal(admission.releaseState.releaseApproved, true);
  assert.equal(admission.releaseState.runtimePublicationEligible, true);
  assert.equal(admission.releaseState.poseSlotFillingPerformed, false);
  assert.equal(admission.releaseState.poseBankReleased, false);
  assert.equal(admission.releaseState.runtimePublicationPerformed, false);
  assert.equal(admission.releaseState.sequenceReleased, false);
  assert.equal(admission.releaseState.websiteInstallationAllowed, false);
  assert.equal(admission.releaseState.runtimeActivationAllowed, false);
  assert.equal(admission.authority.namedHumanReleaseApprovalAdmission, true);
  assert.equal(admission.authority.runtimePublicationEligibility, true);
  assert.equal(admission.authority.poseBankReleaseApproval, false);
  assert.equal(admission.authority.poseBankRelease, false);
  assert.equal(admission.authority.runtimePublication, false);
  assert.equal(admission.authority.repositoryMutation, false);
  assert.equal(
    parseProjectArtTopHatPoseBankReleaseApprovalAdmission(admission)
      .releaseApprovalAdmissionSha256,
    admission.releaseApprovalAdmissionSha256,
  );
  assert.equal(
    verifyProjectArtTopHatPoseBankReleaseApprovalAdmission(admission, {
      releasePlan: fixture.releasePlan,
      decision: fixture.decision,
    }).releaseApprovalAdmissionSha256,
    admission.releaseApprovalAdmissionSha256,
  );
});

test('rejects release-plan substitution and cross-plan replay', () => {
  const fixture = createTopHatPoseBankReleaseApprovalFixture();
  const wrongPlanHash = structuredClone(fixture.decision);
  wrongPlanHash.poseBankReleasePlanSha256 = 'f'.repeat(64);
  withSelfHash(wrongPlanHash, 'releaseApprovalDecisionSha256');
  assert.throws(
    () =>
      parseProjectArtTopHatPoseBankReleaseApprovalDecision(
        wrongPlanHash,
        fixture.releasePlan,
      ),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_APPROVAL_DECISION_INVALID'),
  );

  const changedPlan = structuredClone(fixture.releasePlan);
  changedPlan.compiledAt = '2026-08-16T12:41:00.000Z';
  withSelfHash(changedPlan, 'poseBankReleasePlanSha256');
  assert.throws(
    () =>
      parseProjectArtTopHatPoseBankReleaseApprovalDecision(
        fixture.decision,
        changedPlan,
      ),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_APPROVAL_DECISION_INVALID'),
  );
});

test('rejects reordered, substituted or colliding slot identities', () => {
  const fixture = createTopHatPoseBankReleaseApprovalFixture();
  const reordered = structuredClone(fixture.decision);
  [reordered.slots[0], reordered.slots[1]] = [
    reordered.slots[1],
    reordered.slots[0],
  ];
  withSelfHash(reordered, 'releaseApprovalDecisionSha256');
  assert.throws(
    () =>
      parseProjectArtTopHatPoseBankReleaseApprovalDecision(
        reordered,
        fixture.releasePlan,
      ),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_APPROVAL_SLOT_ORDER_INVALID'),
  );

  const substituted = structuredClone(fixture.decision);
  substituted.slots[2].finalFrameSha256 = 'e'.repeat(64);
  withSelfHash(substituted, 'releaseApprovalDecisionSha256');
  assert.throws(
    () =>
      parseProjectArtTopHatPoseBankReleaseApprovalDecision(
        substituted,
        fixture.releasePlan,
      ),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_APPROVAL_PLAN_BINDING_INVALID'),
  );

  const collision = structuredClone(fixture.decision);
  collision.slots[5].finalFramePath = collision.slots[4].finalFramePath;
  withSelfHash(collision, 'releaseApprovalDecisionSha256');
  assert.throws(
    () =>
      parseProjectArtTopHatPoseBankReleaseApprovalDecision(
        collision,
        fixture.releasePlan,
      ),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_APPROVAL_SLOT_COLLISION'),
  );
});

test('requires a separate named-human decision and exact evidence binding', () => {
  const fixture = createTopHatPoseBankReleaseApprovalFixture();
  const nonHuman = structuredClone(fixture.decision);
  nonHuman.reviewer.actorClass = 'agent';
  withSelfHash(nonHuman, 'releaseApprovalDecisionSha256');
  assert.throws(
    () =>
      parseProjectArtTopHatPoseBankReleaseApprovalDecision(
        nonHuman,
        fixture.releasePlan,
      ),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_APPROVAL_NAMED_HUMAN_REQUIRED'),
  );

  const changedEvidence = structuredClone(fixture.decision);
  changedEvidence.evidence.alphaIntegrityReviewSha256 = 'd'.repeat(64);
  withSelfHash(changedEvidence, 'releaseApprovalDecisionSha256');
  assert.throws(
    () =>
      parseProjectArtTopHatPoseBankReleaseApprovalDecision(
        changedEvidence,
        fixture.releasePlan,
      ),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_APPROVAL_EVIDENCE_BINDING_INVALID'),
  );

  const timestampDrift = structuredClone(fixture.decision);
  timestampDrift.reviewer.occurredAt = '2026-08-16T12:45:01.000Z';
  withSelfHash(timestampDrift, 'releaseApprovalDecisionSha256');
  assert.throws(
    () =>
      parseProjectArtTopHatPoseBankReleaseApprovalDecision(
        timestampDrift,
        fixture.releasePlan,
      ),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_APPROVAL_REVIEWER_INVALID'),
  );
});

test('enforces plan, decision and admission chronology', () => {
  const fixture = createTopHatPoseBankReleaseApprovalFixture();
  const earlyDecision = structuredClone(fixture.decision);
  earlyDecision.decidedAt = '2026-08-16T12:39:59.000Z';
  earlyDecision.reviewer.occurredAt = earlyDecision.decidedAt;
  withSelfHash(earlyDecision, 'releaseApprovalDecisionSha256');
  assert.throws(
    () =>
      parseProjectArtTopHatPoseBankReleaseApprovalDecision(
        earlyDecision,
        fixture.releasePlan,
      ),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_APPROVAL_TIME_INVALID'),
  );

  assert.throws(
    () =>
      admitProjectArtTopHatPoseBankReleaseApproval({
        releasePlan: fixture.releasePlan,
        decision: fixture.decision,
        admittedAt: '2026-08-16T12:44:59.000Z',
      }),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_APPROVAL_TIME_INVALID'),
  );
});

test('rejects decision and admission authority escalation after rehashing', () => {
  const fixture = createTopHatPoseBankReleaseApprovalFixture();
  const widenedDecision = structuredClone(fixture.decision);
  widenedDecision.authority.runtimePublication = true;
  withSelfHash(widenedDecision, 'releaseApprovalDecisionSha256');
  assert.throws(
    () =>
      parseProjectArtTopHatPoseBankReleaseApprovalDecision(
        widenedDecision,
        fixture.releasePlan,
      ),
    errorCode('AVATAR_PROVIDER_RUNTIME_FALSE_AUTHORITY_REQUIRED'),
  );

  const widenedAdmission = structuredClone(admit(fixture));
  widenedAdmission.authority.repositoryMutation = true;
  withSelfHash(widenedAdmission, 'releaseApprovalAdmissionSha256');
  assert.throws(
    () =>
      parseProjectArtTopHatPoseBankReleaseApprovalAdmission(
        widenedAdmission,
      ),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_APPROVAL_AUTHORITY_INVALID'),
  );

  const widenedState = structuredClone(admit(fixture));
  widenedState.releaseState.runtimePublicationPerformed = true;
  withSelfHash(widenedState, 'releaseApprovalAdmissionSha256');
  assert.throws(
    () =>
      parseProjectArtTopHatPoseBankReleaseApprovalAdmission(widenedState),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_APPROVAL_STATE_INVALID'),
  );
});

test('rejects accessors, cycles and admission replay against another decision', () => {
  const fixture = createTopHatPoseBankReleaseApprovalFixture();
  const accessor = structuredClone(fixture.decision);
  Object.defineProperty(accessor, 'notes', {
    enumerable: true,
    get() {
      throw new Error('must not execute');
    },
  });
  assert.throws(
    () =>
      parseProjectArtTopHatPoseBankReleaseApprovalDecision(
        accessor,
        fixture.releasePlan,
      ),
    errorCode('AVATAR_PROVIDER_RUNTIME_JSON_INVALID'),
  );

  const cycle = structuredClone(fixture.decision);
  cycle.cycle = cycle;
  assert.throws(
    () =>
      parseProjectArtTopHatPoseBankReleaseApprovalDecision(
        cycle,
        fixture.releasePlan,
      ),
    errorCode('AVATAR_PROVIDER_RUNTIME_JSON_INVALID'),
  );

  const admission = structuredClone(admit(fixture));
  admission.releaseApprovalDecisionSha256 = 'c'.repeat(64);
  withSelfHash(admission, 'releaseApprovalAdmissionSha256');
  assert.throws(
    () =>
      verifyProjectArtTopHatPoseBankReleaseApprovalAdmission(admission, {
        releasePlan: fixture.releasePlan,
        decision: fixture.decision,
      }),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_APPROVAL_ADMISSION_BINDING_INVALID'),
  );
});

test('capabilities disclose evidence admission without execution authority', () => {
  const capabilities = projectArtTopHatPoseBankReleaseApprovalCapabilities();
  assert.equal(
    capabilities.schema,
    TOP_HAT_POSE_BANK_RELEASE_APPROVAL_CAPABILITIES_SCHEMA,
  );
  assert.equal(capabilities.requiredPoseSlots, 6);
  assert.equal(capabilities.separateNamedHumanDecisionRequired, true);
  assert.equal(capabilities.externalHumanDecisionCannotBeFabricated, true);
  assert.equal(capabilities.runtimePublicationEligibleOutput, true);
  assert.equal(capabilities.runtimePublicationTransactionStillRequired, true);
  assert.equal(capabilities.websiteInstallationReviewStillRequired, true);
  for (const key of [
    'providerExecution',
    'runtimeEnqueue',
    'imageMutation',
    'creativeDecision',
    'candidateApproval',
    'candidatePromotion',
    'poseSlotFilling',
    'poseBankReleaseApproval',
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
  ]) {
    assert.equal(capabilities[key], false);
  }
});

console.log('Project Art Top Hat pose-bank release-approval regressions passed.');
