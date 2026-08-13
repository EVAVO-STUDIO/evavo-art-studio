import { heavyMetalFightingFrameBodyRole } from "./frame-body-role-grammar.mjs";
import { heavyMetalFightingProductionWorkOrder } from "./work-orders.mjs";
import {
  HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION,
  freeze,
  loadPolicy,
} from "./frame-body-creative-review-common.mjs";

export async function verifyHmfFrameBodyCreativeReview() {
  const [policy, order, role] = await Promise.all([
    loadPolicy(),
    heavyMetalFightingProductionWorkOrder("hmf.frame-animation.bastion.slot-121"),
    heavyMetalFightingFrameBodyRole("bastion", 121),
  ]);
  const allowedFailureCodes = new Set([...(order.failureCodes?.technical ?? []), ...(order.failureCodes?.style ?? [])]);
  const policyFailureCodes = [...new Set(policy.criteria.flatMap((criterion) => criterion.failureCodes))];
  const requiredModeIds = new Set(["native-160x160", "nearest-neighbour-4x", "match-640x360", "thumbnail-320x180", "one-colour-silhouette", "grayscale"]);
  const checks = freeze([
    freeze({ id: "policy-bound-to-frame-body-cels", passed: policy.assetKind === order.assetContract.kind }),
    freeze({ id: "review-modes-complete", passed: [...requiredModeIds].every((id) => policy.reviewModes.some((mode) => mode.id === id)) }),
    freeze({ id: "failure-vocabulary-governed", passed: policyFailureCodes.every((code) => allowedFailureCodes.has(code)) }),
    freeze({ id: "hero-role-resolves", passed: role.semanticId === "standing-heavy:hero-impact" && role.hero === true && role.contactRole === true }),
    freeze({ id: "review-completion-not-selection", passed: policy.decisionRules.reviewCompletionReceiptState === "creative-review-passed" && policy.decisionRules.selectionRemainsSeparate === true }),
    freeze({ id: "named-human-reviewer-required", passed: policy.decisionRules.namedHumanReviewerRequired === true && policy.authority.namedHumanReviewerRequired === true }),
    freeze({ id: "substantive-observations-required", passed: policy.decisionRules.minimumObservationCharacters >= 20 && policy.decisionRules.maximumObservationCharacters <= 1200 }),
    freeze({ id: "defects-recommend-repair", passed: policy.decisionRules.recommendedOutcomeWhenAnyFail === "repair-requested" }),
    freeze({ id: "no-automatic-approval-or-promotion", passed: policy.authority.automaticCreativeApproval === false && policy.authority.selection === false && policy.authority.candidatePromotion === false }),
  ]);
  const failed = freeze(checks.filter((entry) => !entry.passed));
  return freeze({
    schema: "evavo.heavy-metal-fighting-frame-body-creative-review-verification.v1",
    protocolVersion: HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION,
    status: failed.length ? "failed" : "passed",
    sampleUnitId: order.unitId,
    sampleSemanticId: role.semanticId,
    policySha256: policy.policySha256,
    reviewModeCount: policy.reviewModes.length,
    criterionCount: policy.criteria.length,
    checks,
    failed,
    authority: freeze({
      providerExecution: false,
      candidateMutation: false,
      automaticCreativeApproval: false,
      selection: false,
      repairAuthorization: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      publication: false,
    }),
  });
}
