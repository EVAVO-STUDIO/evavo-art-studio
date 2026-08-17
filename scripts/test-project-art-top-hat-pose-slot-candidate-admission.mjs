#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_CAPABILITIES_SCHEMA,
  TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_SCHEMA,
  TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_STATUS,
  TOP_HAT_POSE_SLOT_IDS,
  admitProjectArtTopHatPoseSlotCandidate,
  parseProjectArtTopHatPoseSlotCandidateAdmission,
  projectArtTopHatPoseSlotCandidateAdmissionCapabilities,
} from './project-art/top-hat-pose-slot-candidate-admission.mjs';
import {
  createTopHatPoseSlotCandidateAdmissionFixture,
} from './project-art/top-hat-pose-slot-candidate-admission-fixture.mjs';
import {
  sha256Document,
} from './project-art/avatar-final-pass-provider-runtime-common.mjs';
import {
  sha256FrameFinisherDocument,
} from './project-art/avatar-final-pass-provider-frame-finisher.mjs';

function rehashFrame(value, field) {
  const body = { ...value };
  delete body[field];
  value[field] = sha256FrameFinisherDocument(body);
  return value;
}

function admit(slotId = 'blink-closed') {
  return admitProjectArtTopHatPoseSlotCandidate(
    createTopHatPoseSlotCandidateAdmissionFixture(slotId),
  );
}

test('admits all six exact reviewed Top Hat candidates for release review only', () => {
  for (const slotId of TOP_HAT_POSE_SLOT_IDS) {
    const admission = admit(slotId);
    assert.equal(
      admission.schema,
      TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_SCHEMA,
    );
    assert.equal(
      admission.status,
      TOP_HAT_POSE_SLOT_CANDIDATE_ADMISION_STATUS,
    );
    assert.equal(admission.characterId, 'top-hat-man');
    assert.equal(admission.slotId, slotId);
    assert.equal(admission.finalFrame.width, 1024);
    assert.equal(admission.finalFrame.height, 1536);
    assert.ok(admission.finalFrame.visiblePixels > 0);
    assert.ok(admission.finalFrame.transparentPixels > 0);
    assert.equal(admission.finalFrame.hiddenRgbTransparentPixels, 0);
    assert.equal(admission.finalFrame.edgeVisiblePixels, 0);
    assert.equal(admission.finalFrame.alphaAssociation, 'straight');
    assert.equal(admission.finalFrame.pixelFormat, 'rgba8-straight');
    assert.equal(admission.releaseReview.eligible, true);
    assert.equal(admission.releaseReview.poseSlotFilled, false);
    assert.equal(admission.releaseReview.poseBankReleased, false);
    assert.equal(admission.releaseReview.runtimeActivationAllowed, false);
    assert.equal(admission.releaseReview.websiteInstallationAllowed, false);
    assert.equal(admission.authority.technicalAdmission, true);
    assert.equal(admission.authority.releaseReviewEligibility, true);
    assert.equal(admission.authority.providerExecution, false);
    assert.equal(admission.authority.candidatePromotion, false);
    assert.equal(admission.authority.poseSlotFilling, false);
    assert.equal(admission.authority.runtimeActivation, false);
    assert.equal(
      parseProjectArtTopHatPoseSlotCandidateAdmission(admission)
        .candidateAdmissionSha256,
      admission.candidateAdmissionSha256,
    );
  }
});

test('rejects slot, adapter, dispatch and source-chain substitution', () => {
  const fixture = createTopHatPoseSlotCandidateAdmissionFixture();

  assert.throws(
    () =>
      admitProjectArtTopHatPoseSlotCandidate({
        ...fixture,
        slotId: 'unplanned-pose',
      }),
    /TOP_HAT_POSE_CANDIDATE_ADMISSION_SLOT_UNKNOWN/u,
  );

  const adapterTamper = structuredClone(fixture.adapter);
  adapterTamper.slots[0].reviewedTargetPath =
    'assets/top-hat-man/candidates/substituted.png';
  const adapterBody = { ...adapterTamper };
  delete adapterBody.adapterSha256;
  adapterTamper.adapterSha256 = sha256Document(adapterBody);
  assert.throws(
    () =>
      admitProjectArtTopHatPoseSlotCandidate({
        ...fixture,
        adapter: adapterTamper,
      }),
    /TOP_HAT_PROVIDER_RUNTIME_ADAPTER_MISMATCH|TOP_HAT_POSE_CANDIDATE/u,
  );

  const dispatchTamper = structuredClone(fixture.dispatch);
  dispatchTamper.candidateAdmission.reviewedTargetPath =
    'assets/top-hat-man/candidates/substituted.png';
  const dispatchBody = { ...dispatchTamper };
  delete dispatchBody.runtimeDispatchSha256;
  dispatchTamper.runtimeDispatchSha256 = sha256Document(dispatchBody);
  assert.throws(
    () =>
      admitProjectArtTopHatPoseSlotCandidate({
        ...fixture,
        dispatch: dispatchTamper,
      }),
    /TOP_HAT_POSE_CANDIDATE_ADMISSION_DISPATCH_MISMATCH|AVATAR_PROVIDER/u,
   );

  const materializationTamper = structuredClone(
    fixture.materializationReceipt,
  );
  materializationTamper.source.runtimeOutcomeSha256 = 'f'.repeat(64);
  const materializationBody = { ...materializationTamper };
  delete materializationBody.materializationSha256;
  materializationTamper.materializationSha256 = sha256Document(
    materializationBody,
  );
  assert.throws(
    () =>
      admitProjectArtTopHatPoseSlotCandidate({
        ...fixture,
        materializationReceipt: materializationTamper,
      }),
    /TOP_HAT_POSE_CANDIDATE_ADMISSION_MATERIALIZATION_SOURCE_MISMATCH/u,
  );
});

test('requires an approving named-human review with every gate passed', () => {
  const fixture = createTopHatPoseSlotCandidateAdmissionFixture();

  const nonHuman = structuredClone(fixture.frameReviewDecision);
  nonHuman.reviewer.actorClass = 'agent';
  rehashFrame(nonHuman, 'decisionSha256');
  assert.throws(
    () =>
      admitProjectArtTopHatPoseSlotCandidate({
        ...fixture,
        frameReviewDecision: nonHuman,
      }),
    /TOP_HAT_POSE_CANDIDATE_ADMISSION_HUMAN_REVIEW_REQUIRED/u,
   );

  const failedGate = structuredClone(fixture.frameReviewDecision);
  failedGate.gates.handsAndAnatomy = 'fail';
  rehashFrame(failedGate, 'decisionSha256');
  assert.throws(
    () =>
      admitProjectArtTopHatPoseSlotCandidate({
        ...fixture,
        frameReviewDecision: failedGate,
      }),
    /TOP_HAT_POSE_CANDIDATE_ADMISSION_REVIEW_GATES_INVALID/u,
  );

  const widened = structuredClone(fixture.frameReviewOutcome);
  widened.authority.sequenceRelease = true;
  rehashFrame(widened, 'reviewOutcomeSha256');
  assert.throws(
    () =>
      admitProjectArtTopHatPoseSlotCandidate({
        ...fixture,
        frameReviewOutcome: widened,
      }),
    /TOP_HAT_POSE_CANDIDATE_ADMISSION_REVIEW_AUTHORITY_INVALID/u,
   );
});

test('rejects changed, corrupt or mismatched final PNG bytes', () => {
  const fixture = createTopHatPoseSlotCandidateAdmissionFixture();
  const corrupt = Buffer.from(fixture.finishedFrameBytes);
  corrupt[corrupt.length - 5] ^= 0x01;
  assert.throws(
    () =>
      admitProjectArtTopHatPoseSlotCandidate({
        ...fixture,
        finishedFrameBytes: corrupt,
      }),
    /AVATAR_PROVIDER_CANDIDATE_PNG|TOP_HAT_POSE_CANDIDATE_ADMISSION_FINAL_PNG_INVALID/u,
  );

  const wrongHash = structuredClone(fixture.frameFinisherReport);
  wrongHash.output.sha256 = 'e'.repeat(64);
  rehashFrame(wrongHash, 'frameFinisherSha256');
  assert.throws(
    () =>
      admitProjectArtTopHatPoseSlotCandidate({
        ...fixture,
        frameFinisherReport: wrongHash,
      }),
    /TOP_HAT_POSE_CANDIDATE_ADMISSION/u,
  );
});

test('rejects accessors, cycles and rehashed admission authority escalation', () => {
  const fixture = createTopHatPoseSlotCandidateAdmissionFixture();
  const accessor = structuredClone(fixture.frameReviewOutcome);
  Object.defineProperty(accessor, 'notes', {
    enumerable: true,
    get() {
      throw new Error('ust not execute');
    },
  });
  assert.throws(
    () =>
      admitProjectArtTopHatPoseSlotCandidate({
        ...fixture,
        frameReviewOutcome: accessor,
      }),
    /AVATAR_PROVIDER_RUNTIME_JSON_INVALID/u,
  );

  const admission = structuredClone(admit());
  admission.authority.runtimeActivation = true;
  const body = { ...admission };
  delete body.candidateAdmissionSha256;
  admission.candidateAdmissionSha256 = sha256Document(body);
  assert.throws(
    () => parseProjectArtTopHatPoseSlotCandidateAdmission(admission),
    /TOP_HAT_POSE_CANDIDATE_ADMISSION_AUTHORITY_INVALID/u,
  );
});

test('capabilities disclose admission-only authority', () => {
  const capabilities =
    projectArtTopHatPoseSlotCandidateAdmissionCapabilities();
  assert.equal(
    capabilities.schema,
    TOP_HAT_POSE_SLOT_CANDIDATE_ADMISION_CAPABILITIES_SCHEMA,
   );
  assert.equal(capabilities.requiredPoseSlots, 6);
  assert.equal(capabilities.oneCandidatePerAdmission, true);
  assert.equal(capabilities.namedHumanReviewRequired, true);
  assert.equal(capabilities.finalPngBytesRequired, true);
  assert.equal(capabilities.nativeStraightAlphaRequired, true);
  assert.deepEqual(capabilities.exactCanvasRequired, {
    width: 1024,
    height: 1536,
  });
  for (const key of [
    'providerExecution',
    'runtimeEnqueue',
    'imageMutation',
    'creativeDecision',
    'candidateApproval',
   'candidatePromotion',
    'poseSlotFilling',
   'poseBankRelease',
    'sequenceRelease',
   'repositoryMutation',
    'gitCommit',
   'gitPush',
    'deployment',
    'publication',
   'runtimeActivation',
   'forcePush',
  ]) {
    assert.equal(capabilities[key], false);
  }
});

console.log(
  'Project Art Top Hat pose-slot candidate admission regressions passed.',
);
