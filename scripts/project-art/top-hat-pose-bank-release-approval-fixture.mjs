import {
  sha256Document,
} from './avatar-final-pass-provider-runtime-common.mjs';
import {
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_DECISION,
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_DECISION_SCHEMA,
  TOP_HAT_POSE_BANK_RELEASE_APPROVAL_PROTOCOL,
  projectArtTopHatPoseBankReleaseApprovalDecisionAuthority,
} from './top-hat-pose-bank-release-approval.mjs';
import {
  compileProjectArtTopHatPoseBankReleasePlan,
} from './top-hat-pose-bank-release-plan.mjs';
import {
  createTopHatPoseBankReleasePlanFixture,
} from './top-hat-pose-bank-release-plan-fixture.mjs';

export const topHatPoseBankReleaseApprovalFixtureApprovedAt =
  '2026-08-16T12:45:00.000Z';
export const topHatPoseBankReleaseApprovalFixtureAdmittedAt =
  '2026-08-16T12:46:00.000Z';

let cachedFixture;

function slotIdentity(slot) {
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

function compileFixture() {
  const releasePlanFixture = createTopHatPoseBankReleasePlanFixture();
  const releasePlan = compileProjectArtTopHatPoseBankReleasePlan({
    admissions: releasePlanFixture.admissions,
    compiledAt: releasePlanFixture.compiledAt,
  });
  const evidence = Object.freeze({
    poseBankContactSheetSha256: sha256Document({
      kind: 'test-only-top-hat-pose-bank-contact-sheet',
      poseBankReleasePlanSha256: releasePlan.poseBankReleasePlanSha256,
    }),
    identityContinuityReviewSha256: sha256Document({
      kind: 'test-only-top-hat-identity-continuity-review',
      poseBankReleasePlanSha256: releasePlan.poseBankReleasePlanSha256,
    }),
    alphaIntegrityReviewSha256: sha256Document({
      kind: 'test-only-top-hat-alpha-integrity-review',
      poseBankReleasePlanSha256: releasePlan.poseBankReleasePlanSha256,
    }),
    sourceLineageReviewSha256: sha256Document({
      kind: 'test-only-top-hat-source-lineage-review',
      poseBankReleasePlanSha256: releasePlan.poseBankReleasePlanSha256,
    }),
  });
  const body = {
    schema: TOP_HAT_POSE_BANK_RELEASE_APPROVAL_DECISION_SCHEMA,
    protocolVersion: TOP_HAT_POSE_BANK_RELEASE_APPROVAL_PROTOCOL,
    decision: TOP_HAT_POSE_BANK_RELEASE_APPROVAL_DECISION,
    decidedAt: topHatPoseBankReleaseApprovalFixtureApprovedAt,
    characterId: releasePlan.characterId,
    poseBankReleasePlanSha256: releasePlan.poseBankReleasePlanSha256,
    slotCount: releasePlan.slotCount,
    slots: Object.freeze(releasePlan.slots.map(slotIdentity)),
    reviewer: Object.freeze({
      actorClass: 'human',
      actorId: 'test-only-top-hat-release-reviewer',
      occurredAt: topHatPoseBankReleaseApprovalFixtureApprovedAt,
      evidenceSha256: sha256Document(evidence),
    }),
    evidence,
    notes:
      'Synthetic test fixture only. This is not a production release approval.',
    authority: projectArtTopHatPoseBankReleaseApprovalDecisionAuthority(),
  };
  const decision = Object.freeze({
    ...body,
    releaseApprovalDecisionSha256: sha256Document(body),
  });
  return Object.freeze({
    releasePlan,
    decision,
    admittedAt: topHatPoseBankReleaseApprovalFixtureAdmittedAt,
  });
}

export function createTopHatPoseBankReleaseApprovalFixture() {
  cachedFixture ??= compileFixture();
  return structuredClone(cachedFixture);
}
