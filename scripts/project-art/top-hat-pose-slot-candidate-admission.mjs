import {
  assert,
  digest,
  isRecord,
  timestamp,
  verifySelfHash,
} from './avatar-final-pass-provider-runtime-common.mjs';
import {
  admitProjectArtTopHatPoseSlotCandidate,
} from './top-hat-pose-slot-candidate-admission-compile.mjs';
import {
  TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_PROTOCOL,
  TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_SCHEMA,
  TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_STATUS,
  TOP_HAT_POSE_SLOT_CHARACTER_ID,
  assertTopHatPoseSlotId,
  parseTopHatPoseSlotCandidateAdmissionAuthority,
  topHatPoseSlotCandidateAdmissionCapabilities,
} from './top-hat-pose-slot-candidate-admission-foundation.mjs';

export {
  admitProjectArtTopHatPoseSlotCandidate,
};

export {
  TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_CAPABILITIES_SCHEMA,
  TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_PROTOCOL,
  TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_RECEIPT_SCHEMA,
  TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_SCHEMA,
  TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_STATUS,
  TOP_HAT_POSE_SLOT_IDS,
  topHatPoseSlotCandidateAdmissionCapabilities,
} from './top-hat-pose-slot-candidate-admission-foundation.mjs';

export function parseProjectArtTopHatPoseSlotCandidateAdmission(input) {
  const admission = verifySelfHash(
    input,
    'candidateAdmissionSha256',
    'Top Hat pose-slot candidate admission',
  );
  assert(
    admission.schema === TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_SCHEMA &&
      admission.protocolVersion ===
        TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_PROTOCOL &&
      admission.status === TOP_HAT_POSE_SLOT_CANDIDATE_ADMISSION_STATUS &&
      admission.characterId === TOP_HAT_POSE_SLOT_CHARACTER_ID,
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_SCHEMA_INVALID',
  );
  assertTopHatPoseSlotId(admission.slotId);
  timestamp(admission.admittedAt, 'Top Hat pose-slot candidate admission.admittedAt');
  digest(admission.adapterSha256, 'Top Hat pose-slot candidate admission.adapterSha256');
  digest(
    admission.sourceProviderPackageSha256,
    'Top Hat pose-slot candidate admission.sourceProviderPackageSha256',
  );
  digest(
    admission.productionPlanSha256,
    'Top Hat pose-slot candidate admission.productionPlanSha256',
  );
  assert(
    isRecord(admission.finalFrame) &&
      admission.finalFrame.width === 1024 &&
      admission.finalFrame.height === 1536 &&
      admission.finalFrame.hiddenRgbTransparentPixels === 0 &&
      admission.finalFrame.edgeVisiblePixels === 0 &&
      admission.finalFrame.alphaAssociation === 'straight' &&
      admission.finalFrame.pixelFormat === 'rgba8-straight' &&
      admission.finalFrame.colourSpace === 'srgb' &&
      admission.releaseReview?.eligible === true &&
      admission.releaseReview?.poseSlotFilled === false &&
      admission.releaseReview?.poseBankReleased === false &&
      admission.releaseReview?.runtimeActivationAllowed === false,
    'TOP_HAT_POSE_CANDIDATE_ADMISSION_STATE_INVALID',
  );
  parseTopHatPoseSlotCandidateAdmissionAuthority(admission.authority);
  return admission;
}

export function projectArtTopHatPoseSlotCandidateAdmissionCapabilities() {
  return topHatPoseSlotCandidateAdmissionCapabilities();
}
