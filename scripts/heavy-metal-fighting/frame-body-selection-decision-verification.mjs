import {
  heavyMetalFightingProductionReceiptTemplate,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  assertForbiddenAuthorityFalse,
  freeze,
  loadPolicy,
} from "./frame-body-selection-decision-common.mjs";

export async function verifyHmfFrameBodySelectionDecision() {
  const [policy, order, receiptTemplate] = await Promise.all([
    loadPolicy(),
    heavyMetalFightingProductionWorkOrder("hmf.frame-animation.bastion.slot-121"),
    heavyMetalFightingProductionReceiptTemplate("hmf.frame-animation.bastion.slot-121"),
  ]);
  const state = receiptTemplate.states.find((entry) => entry.id === policy.decisionRules.receiptState);
  const checks = freeze([
    freeze({ id: "policy-bound-to-frame-body-cels", passed: policy.assetKind === order.assetContract.kind }),
    freeze({ id: "receipt-state-human-gated", passed: state?.requiresHuman === true && state?.outcomes?.join("|") === "selected|repair-requested" }),
    freeze({ id: "recommendation-binding-required", passed: policy.decisionRules.outcomeMustMatchCreativeRecommendation === true }),
    freeze({ id: "selected-failure-free", passed: policy.decisionRules.selectedRequiresZeroFailureCodes === true }),
    freeze({ id: "repair-failure-bound", passed: policy.decisionRules.repairRequiresAtLeastOneFailureCode === true }),
    freeze({ id: "next-actions-separated", passed: policy.decisionRules.selectedNextAction === "master-selected-candidate" && policy.decisionRules.repairRequestedNextAction === "authorize-bounded-repair" }),
    freeze({ id: "no-mastering-or-repair-authorization", passed: policy.authority.mastering === false && policy.authority.automaticRepairAuthorization === false }),
    freeze({ id: "no-provider-or-promotion-authority", passed: policy.authority.providerExecution === false && policy.authority.providerRetry === false && policy.authority.candidatePromotion === false }),
  ]);
  assertForbiddenAuthorityFalse(policy.authority, "selection policy");
  const failed = freeze(checks.filter((entry) => !entry.passed));
  return freeze({
    schema: "evavo.heavy-metal-fighting-frame-body-selection-verification.v1",
    status: failed.length ? "failed" : "passed",
    sampleUnitId: order.unitId,
    policySha256: policy.policySha256,
    checks,
    failed,
    authority: freeze({
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      automaticSelection: false,
      automaticRepairAuthorization: false,
      mastering: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  });
}
