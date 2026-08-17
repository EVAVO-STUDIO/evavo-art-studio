#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalJson,
  sha256Document,
} from './project-art/avatar-final-pass-provider-runtime-common.mjs';
import {
  TOP_HAT_POSE_SLOT_IDS,
} from './project-art/top-hat-pose-slot-candidate-admission.mjs';
import {
  TOP_HAT_POSE_BANK_RELEASE_PLAN_CAPABILITIES_SCHEMA,
  TOP_HAT_POSE_BANK_RELEASE_PLAN_SCHEMA,
  TOP_HAT_POSE_BANK_RELEASE_PLAN_STATUS,
  compileProjectArtTopHatPoseBankReleasePlan,
  parseProjectArtTopHatPoseBankReleasePlan,
  projectArtTopHatPoseBankReleasePlanCapabilities,
} from './project-art/top-hat-pose-bank-release-plan.mjs';
import {
  createTopHatPoseBankReleasePlanFixture,
} from './project-art/top-hat-pose-bank-release-plan-fixture.mjs';

const fixture = createTopHatPoseBankReleasePlanFixture();

function withSelfHash(value, field) {
  const body = { ...value };
  delete body[field];
  value[field] = sha256Document(body);
  return value;
}

function errorCode(code) {
  return (error) => error?.code === code;
}

function compile(admissions = fixture.admissions) {
  return compileProjectArtTopHatPoseBankReleasePlan({
    admissions,
    compiledAt: fixture.compiledAt,
  });
}

test('compiles all six exact admissions in canonical release-plan order', () => {
  const plan = compile([...fixture.admissions].reverse());
  assert.equal(plan.schema, TOP_HAT_POSE_BANK_RELEASE_PLAN_SCHEMA);
  assert.equal(plan.status, TOP_HAT_POSE_BANK_RELEASE_PLAN_STATUS);
  assert.equal(plan.characterId, 'top-hat-man');
  assert.equal(plan.slotCount, 6);
  assert.deepEqual(
    plan.slots.map((slot) => slot.slotId),
    TOP_HAT_POSE_SLOT_IDS,
  );
  assert.equal(plan.releaseReview.eligible, true);
  assert.equal(plan.releaseReview.exactSlotSetComplete, true);
  assert.equal(plan.releaseReview.allCandidatesTechnicallyAdmitted, true);
  assert.equal(
    plan.releaseReview.separateNamedHumanReleaseApprovalRequired,
    true,
  );
  assert.equal(plan.releaseReview.releaseApproved, false);
  assert.equal(plan.releaseReview.poseSlotFillingPerformed, false);
  assert.equal(plan.releaseReview.poseBankReleased, false);
  assert.equal(plan.releaseReview.sequenceReleased, false);
  assert.equal(plan.releaseReview.runtimeActivationAllowed, false);
  assert.equal(plan.releaseReview.websiteInstallationAllowed, false);
  assert.equal(plan.authority.technicalPlanCompilation, true);
  assert.equal(plan.authority.releaseApprovalEligibility, true);
  assert.equal(plan.authority.poseBankReleaseApproval, false);
  assert.equal(plan.authority.poseBankRelease, false);
  assert.equal(plan.authority.runtimeActivation, false);
  assert.equal(
    parseProjectArtTopHatPoseBankReleasePlan(plan)
      .poseBankReleasePlanSha256,
    plan.poseBankReleasePlanSha256,
  );
});

test('is deterministic for a fixed timestamp regardless of admission order', () => {
  const canonical = compile(fixture.admissions);
  const shuffled = compile([
    fixture.admissions[4],
    fixture.admissions[1],
    fixture.admissions[5],
    fixture.admissions[0],
    fixture.admissions[3],
    fixture.admissions[2],
  ]);
  assert.equal(canonicalJson(canonical), canonicalJson(shuffled));
  assert.equal(
    canonical.poseBankReleasePlanSha256,
    shuffled.poseBankReleasePlanSha256,
  );
});

test('rejects missing, duplicate and unknown pose slots', () => {
  assert.throws(
    () => compile(fixture.admissions.slice(0, 5)),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_PLAN_SLOT_SET_INVALID'),
  );

  const duplicate = structuredClone(fixture.admissions);
  duplicate[5] = structuredClone(duplicate[0]);
  assert.throws(
    () => compile(duplicate),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_PLAN_SLOT_SET_INVALID'),
  );

  const unknown = structuredClone(fixture.admissions);
  unknown[0].slotId = 'unplanned-pose';
  withSelfHash(unknown[0], 'candidateAdmissionSha256');
  assert.throws(
    () => compile(unknown),
    errorCode('TOP_HAT_POSE_CANDIDATE_ADMISSION_SLOT_UNKNOWN'),
  );
});

test('rejects candidate self-hash drift and common-source substitution', () => {
  const hashDrift = structuredClone(fixture.admissions);
  hashDrift[0].candidateAdmissionSha256 = 'f'.repeat(64);
  assert.throws(
    () => compile(hashDrift),
    errorCode('AVATAR_PROVIDER_RUNTIME_SELF_HASH_MISMATCH'),
  );

  const adapterSubstitution = structuredClone(fixture.admissions);
  adapterSubstitution[1].adapterSha256 = 'f'.repeat(64);
  withSelfHash(adapterSubstitution[1], 'candidateAdmissionSha256');
  assert.throws(
    () => compile(adapterSubstitution),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_PLAN_SOURCE_MISMATCH'),
  );

  const runtimeSubstitution = structuredClone(fixture.admissions);
  runtimeSubstitution[2].runtime.packageVersion = '0.34.1';
  withSelfHash(runtimeSubstitution[2], 'candidateAdmissionSha256');
  assert.throws(
    () => compile(runtimeSubstitution),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_PLAN_SOURCE_MISMATCH'),
  );

  const artStudioSubstitution = structuredClone(fixture.admissions);
  artStudioSubstitution[3].artStudio.exactRgbaAtlasPaste = false;
  withSelfHash(artStudioSubstitution[3], 'candidateAdmissionSha256');
  assert.throws(
    () => compile(artStudioSubstitution),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_PLAN_SOURCE_MISMATCH'),
  );
});

test('rejects frame path substitution and release-state escalation', () => {
  const pathSubstitution = structuredClone(fixture.admissions);
  pathSubstitution[0].finalFrame.path =
    pathSubstitution[1].finalFrame.path;
  withSelfHash(pathSubstitution[0], 'candidateAdmissionSha256');
  assert.throws(
    () => compile(pathSubstitution),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_PLAN_FINAL_FRAME_INVALID'),
  );

  const targetSubstitution = structuredClone(fixture.admissions);
  targetSubstitution[4].finalFrame.reviewedTargetPath =
    targetSubstitution[5].finalFrame.reviewedTargetPath;
  withSelfHash(targetSubstitution[4], 'candidateAdmissionSha256');
  assert.throws(
    () => compile(targetSubstitution),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_PLAN_FINAL_FRAME_INVALID'),
  );

  const candidateEscalation = structuredClone(fixture.admissions);
  candidateEscalation[0].releaseReview.poseBankReleased = true;
  withSelfHash(candidateEscalation[0], 'candidateAdmissionSha256');
  assert.throws(
    () => compile(candidateEscalation),
    errorCode('TOP_HAT_POSE_CANDIDATE_ADMISSION_STATE_INVALID'),
  );
});

test('rejects accessor, cycle and rehashed plan authority escalation', () => {
  const accessor = structuredClone(fixture.admissions);
  Object.defineProperty(accessor[0], 'slotId', {
    enumerable: true,
    get() {
      throw new Error('must not execute');
    },
  });
  assert.throws(
    () => compile(accessor),
    errorCode('AVATAR_PROVIDER_RUNTIME_JSON_INVALID'),
  );

  const cycle = structuredClone(fixture.admissions);
  cycle[0].cycle = cycle[0];
  assert.throws(
    () => compile(cycle),
    errorCode('AVATAR_PROVIDER_RUNTIME_JSON_INVALID'),
  );

  const widenedAuthority = structuredClone(compile());
  widenedAuthority.authority.runtimeActivation = true;
  withSelfHash(widenedAuthority, 'poseBankReleasePlanSha256');
  assert.throws(
    () => parseProjectArtTopHatPoseBankReleasePlan(widenedAuthority),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_PLAN_AUTHORITY_INVALID'),
  );

  const widenedState = structuredClone(compile());
  widenedState.releaseReview.releaseApproved = true;
  withSelfHash(widenedState, 'poseBankReleasePlanSha256');
  assert.throws(
    () => parseProjectArtTopHatPoseBankReleasePlan(widenedState),
    errorCode('TOP_HAT_POSE_BANK_RELEASE_PLAN_STATE_INVALID'),
  );
});

test('capabilities disclose planning authority without release authority', () => {
  const capabilities = projectArtTopHatPoseBankReleasePlanCapabilities();
  assert.equal(
    capabilities.schema,
    TOP_HAT_POSE_BANK_RELEASE_PLAN_CAPABILITIES_SCHEMA,
  );
  assert.equal(capabilities.requiredPoseSlots, 6);
  assert.equal(capabilities.exactSlotSetRequired, true);
  assert.equal(capabilities.commonSourceIdentityRequired, true);
  assert.equal(
    capabilities.separateNamedHumanReleaseApprovalRequired,
    true,
  );
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

console.log('Project Art Top Hat pose-bank release-plan regressions passed.');
