import {
  heavyMetalFightingProductionReceiptTemplate,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  assertForbiddenAuthorityFalse,
  freeze,
  loadApprovalPolicy,
} from "./frame-body-named-human-approval-common.mjs";

export async function verifyHmfFrameBodyNamedHumanApproval() {
  const [policy, order, receiptTemplate] = await Promise.all([
    loadApprovalPolicy(),
    heavyMetalFightingProductionWorkOrder("hmf.frame-animation.bastion.slot-121"),
    heavyMetalFightingProductionReceiptTemplate("hmf.frame-animation.bastion.slot-121"),
  ]);
  const mastered = receiptTemplate.states.find(
    (entry) => entry.id === policy.approvalRules.predecessorState,
  );
  const approved = receiptTemplate.states.find(
    (entry) => entry.id === policy.approvalRules.receiptState,
  );
  const checks = freeze([
    freeze({ id: "policy-bound-to-frame-body-cels", passed: policy.assetKind === order.assetContract.kind }),
    freeze({ id: "approval-is-next-human-state", passed: approved?.rank === mastered?.rank + 1 && approved?.requiresEvidence === true && approved?.requiresCandidate === true && approved?.requiresHuman === true }),
    freeze({ id: "explicit-approval-required", passed: policy.approvalRules.explicitApprovalRequired === true && policy.approvalRules.requiredActorClass === "human" }),
    freeze({ id: "exact-master-evidence-required", passed: policy.approvalRules.masterPathMustMatchMasteringRecord === true && policy.approvalRules.masterSha256MustMatchMasteringRecord === true && policy.approvalRules.masterBytesMustMatchMasteringRecord === true && policy.approvalRules.persistedMasterReadbackRequired === true }),
    freeze({ id: "approval-decision-and-receipt-required", passed: policy.approvalRules.approvalDecisionPersistenceRequired === true && policy.authority.approvalDecisionPersistence === true && policy.authority.receiptPersistence === true }),
    freeze({ id: "delivery-readiness-is-separate", passed: policy.approvalRules.nextLegalAction === "compile-delivery-readiness" && policy.authority.gameRepositoryPromotion === false && policy.authority.finalAtlasCompilation === false && policy.authority.publication === false }),
    freeze({ id: "automatic-approval-forbidden", passed: policy.authority.namedHumanApproval === true && policy.authority.automaticApproval === false }),
  ]);
  assertForbiddenAuthorityFalse(policy.authority, "named-human approval policy");
  const failed = freeze(checks.filter((entry) => !entry.passed));
  return freeze({
    schema: "evavo.heavy-metal-fighting-frame-body-named-human-approval-verification.v1",
    status: failed.length ? "failed" : "passed",
    sampleUnitId: order.unitId,
    policySha256: policy.policySha256,
    checks,
    failed,
    authority: freeze({
      masterRead: true,
      masteringRecordRead: true,
      approvalDecisionCompilation: true,
      approvalDecisionPersistence: true,
      receiptPersistence: true,
      namedHumanApproval: true,
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      imageTransformation: false,
      automaticApproval: false,
      gameRepositoryPromotion: false,
      targetRepositoryMutation: false,
      finalAtlasCompilation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  });
}
