import {
  heavyMetalFightingProductionReceiptTemplate,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import { verifyHmfFrameBodySelectedCandidateMastering } from "./frame-body-selected-candidate-mastering-verification.mjs";
import {
  assertForbiddenAuthorityFalse,
  freeze,
  loadApprovalPolicy,
} from "./frame-body-named-human-approval-common.mjs";

export async function verifyHmfFrameBodyNamedHumanApproval() {
  const [policy, order, receiptTemplate, masteringVerification] = await Promise.all([
    loadApprovalPolicy(),
    heavyMetalFightingProductionWorkOrder("hmf.frame-animation.bastion.slot-121"),
    heavyMetalFightingProductionReceiptTemplate("hmf.frame-animation.bastion.slot-121"),
    verifyHmfFrameBodySelectedCandidateMastering(),
  ]);
  const masteredState = receiptTemplate.states.find(
    (entry) => entry.id === policy.approvalRules.predecessorState,
  );
  const approvedState = receiptTemplate.states.find(
    (entry) => entry.id === policy.approvalRules.receiptState,
  );
  const checks = freeze([
    freeze({ id: "policy-bound-to-frame-body-cels", passed: policy.assetKind === order.assetContract.kind }),
    freeze({ id: "mastering-boundary-present", passed: masteringVerification.status === "passed" && masteringVerification.authority.namedHumanApproval === false }),
    freeze({ id: "mastered-predecessor-required", passed: masteredState?.requiresEvidence === true && masteredState?.requiresCandidate === true && masteredState?.requiresHuman === false }),
    freeze({ id: "approval-is-next-human-step", passed: approvedState?.rank === masteredState?.rank + 1 && approvedState?.requiresEvidence === true && approvedState?.requiresCandidate === true && approvedState?.requiresHuman === true }),
    freeze({ id: "master-path-and-identity-bound", passed: policy.approvalRules.masterPathMustMatchWorkOrder === true && policy.approvalRules.masterPathMustLiveUnderMasters === true && policy.approvalRules.masterSha256MustMatchCandidate === true && policy.approvalRules.masterBytesMustMatchMasteringRecord === true }),
    freeze({ id: "independent-exact-master-inspection-required", passed: policy.approvalRules.persistedMasteringRecordRequired === true && policy.approvalRules.exactMasterInspectionAttestationRequired === true && policy.authority.namedHumanApproverRequired === true }),
    freeze({ id: "next-boundary-is-delivery-readiness", passed: policy.approvalRules.nextLegalAction === "compile-delivery-readiness" }),
    freeze({ id: "no-promotion-delivery-or-publication-authority", passed: policy.authority.automaticApproval === false && policy.authority.gameRepositoryPromotion === false && policy.authority.targetRepositoryMutation === false && policy.authority.finalAtlasCompilation === false && policy.authority.deliveryReadinessCompilation === false && policy.authority.gitMutation === false && policy.authority.publication === false }),
  ]);
  assertForbiddenAuthorityFalse(policy.authority, "named-human approval policy");
  const failed = freeze(checks.filter((entry) => !entry.passed));
  return freeze({
    schema: "evavo.heavy-metal-fighting-frame-body-named-human-approval-verification.v1",
    status: failed.length ? "failed" : "passed",
    sampleUnitId: order.unitId,
    policySha256: policy.policySha256,
    masteringVerification,
    checks,
    failed,
    authority: freeze({
      masterRead: true,
      masteringRecordRead: true,
      approvalRecordPersistence: true,
      receiptPersistence: true,
      namedHumanApproverRequired: true,
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      masterMutation: false,
      imageTransformation: false,
      automaticApproval: false,
      gameRepositoryPromotion: false,
      targetRepositoryMutation: false,
      finalAtlasCompilation: false,
      deliveryReadinessCompilation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  });
}
