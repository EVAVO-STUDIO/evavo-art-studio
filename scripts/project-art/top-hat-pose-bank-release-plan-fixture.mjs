import {
  TOP_HAT_POSE_SLOT_IDS,
  admitProjectArtTopHatPoseSlotCandidate,
} from './top-hat-pose-slot-candidate-admission.mjs';
import {
  createTopHatPoseSlotCandidateAdmissionFixture,
} from './top-hat-pose-slot-candidate-admission-fixture.mjs';

export const topHatPoseBankReleasePlanFixtureCompiledAt =
  '2026-08-16T12:40:00.000Z';

let cachedAdmissions;

function compileAdmissions() {
  return Object.freeze(
    TOP_HAT_POSE_SLOT_IDS.map((slotId) =>
      admitProjectArtTopHatPoseSlotCandidate(
        createTopHatPoseSlotCandidateAdmissionFixture(slotId),
      ),
    ),
  );
}

export function createTopHatPoseBankReleasePlanAdmissions() {
  cachedAdmissions ??= compileAdmissions();
  return structuredClone(cachedAdmissions);
}

export function createTopHatPoseBankReleasePlanFixture() {
  return Object.freeze({
    admissions: createTopHatPoseBankReleasePlanAdmissions(),
    compiledAt: topHatPoseBankReleasePlanFixtureCompiledAt,
  });
}
