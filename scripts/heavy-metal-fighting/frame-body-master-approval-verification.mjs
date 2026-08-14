import {
  heavyMetalFightingProductionReceiptTemplate,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  assertForbiddenAuthorityFalse,
  freeze,
  loadApprovalPolicy,
} from "./frame-body-master-approval-common.mjs";

export async function verifyHmfFrameBodyMasterApproval() {
  const [policy, order, receiptTemplate] = await Promise.all([
    loadApprovalPolicy(),
    heavyMetalFightingProductionWorkOrder(
      "hmf.frame-animation.bastion.slot-121",
    ),
    heavyMetalFightingProductionReceiptTemplate(
      "hmf.frame-animation.bastion.slot-121",
    ),
  ]);
  const masteredState = receiptTemplate.states.find(
    (entry) => entry.id === policy.approvalRules.predecessorState,
  );
  const approvedState = receiptTemplate.states.find(
    (entry) => entry.id === policy.approvalRules.receiptState,
  );
  const checks = freeze([
    freeze({
      id: "policy-bound-to-frame-body-cels",
      passed: policy.assetKind === order.assetContract.kind,
    }),
    freeze({
      id: "mastered-predecessor-required",
      passed: masteredState?.id === "mastered"
        && masteredState.requiresEvidence === true
        && masteredState.requiresCandidate === true
        && masteredState.requiresHuman === false,
    }),
    freeze({
      id: "named-human-approved-is-next-state",
      passed: approvedState?.rank === masteredState?.rank + 1
        && approvedState.requiresEvidence === true
        && approvedState.requiresCandidate === true
        && approvedState.requiresHuman === true,
    }),
    freeze({
      id: "work-order-master-path-governed",
      passed: order.assetContract.masterOutputPath.startsWith(
        "masters/",
      ),
    }),
    freeze({
      id: "exact-master-and-candidate-stability-required",
      passed:
        policy.approvalRules.masterPathMustMatchWorkOrder === true
        && policy.approvalRules.masterBytesMustMatchMasteringRecord === true
        && policy.approvalRules.candidateSha256MustRemainStable === true,
    }),
    freeze({
      id: "explicit-human-evidence-required",
      passed:
        policy.approvalRules.requiredActorClass === "human"
        && policy.approvalRules.requiredDecision === "approved"
        && policy.approvalRules.explicitApprovalAttestationsRequired === true,
    }),
    freeze({
      id: "delivery-readiness-remains-separate",
      passed:
        policy.approvalRules.nextLegalAction
          === "compile-delivery-readiness"
        && policy.authority.automaticDeliveryReadiness === false,
    }),
    freeze({
      id: "no-provider-promotion-git-or-publication-authority",
      passed:
        policy.authority.providerExecution === false
        && policy.authority.gameRepositoryPromotion === false
        && policy.authority.targetRepositoryMutation === false
        && policy.authority.gitMutation === false
        && policy.authority.publication === false,
    }),
  ]);
  assertForbiddenAuthorityFalse(
    policy.authority,
    "master approval policy",
  );
  const failed = freeze(checks.filter((entry) => !entry.passed));
  return freeze({
    schema:
      "evavo.heavy-metal-fighting-frame-body-master-approval-verification.v1",
    status: failed.length ? "failed" : "passed",
    sampleUnitId: order.unitId,
    policySha256: policy.policySha256,
    checks,
    failed,
    authority: freeze({
      masterRead: true,
      masteringRecordRead: true,
      namedHumanDecisionRequired: true,
      approvalDecisionPersistence: true,
      receiptPersistence: true,
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      imageTransformation: false,
      automaticSelection: false,
      automaticApproval: false,
      automaticDeliveryReadiness: false,
      candidatePromotion: false,
      gameRepositoryPromotion: false,
      targetRepositoryMutation: false,
      finalAtlasCompilation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  });
}
