import {
  heavyMetalFightingProductionReceiptTemplate,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import { verifyHmfFrameBodyNamedHumanApproval } from "./frame-body-named-human-approval-verification.mjs";
import {
  assertForbiddenDeliveryReadinessAuthorityFalse,
  freeze,
  loadDeliveryReadinessPolicy,
} from "./frame-body-delivery-readiness-common.mjs";

export async function verifyHmfFrameBodyDeliveryReadiness() {
  const [policy, order, receiptTemplate, approvalVerification] = await Promise.all([
    loadDeliveryReadinessPolicy(),
    heavyMetalFightingProductionWorkOrder("hmf.frame-animation.bastion.slot-121"),
    heavyMetalFightingProductionReceiptTemplate("hmf.frame-animation.bastion.slot-121"),
    verifyHmfFrameBodyNamedHumanApproval(),
  ]);
  const predecessor = receiptTemplate.states.find(
    (entry) => entry.id === policy.readinessRules.predecessorState,
  );
  const ready = receiptTemplate.states.find(
    (entry) => entry.id === policy.readinessRules.receiptState,
  );
  const checks = freeze([
    freeze({
      id: "policy-bound-to-frame-body-cels",
      passed: policy.assetKind === order.assetContract.kind,
    }),
    freeze({
      id: "named-human-approval-boundary-present",
      passed: approvalVerification.status === "passed"
        && approvalVerification.authority.deliveryReadinessCompilation === false,
    }),
    freeze({
      id: "approved-predecessor-required",
      passed: predecessor?.requiresEvidence === true
        && predecessor?.requiresCandidate === true
        && predecessor?.requiresHuman === true,
    }),
    freeze({
      id: "delivery-ready-is-next-system-step",
      passed: ready?.rank === predecessor?.rank + 1
        && ready?.requiresEvidence === true
        && ready?.requiresCandidate === true
        && ready?.requiresHuman === false,
    }),
    freeze({
      id: "delivery-ready-is-terminal",
      passed: ready?.nextAction === "complete" || policy.readinessRules.nextLegalAction === "complete",
    }),
    freeze({
      id: "master-and-runtime-contract-bound",
      passed: policy.readinessRules.masterPathMustMatchWorkOrder === true
        && policy.readinessRules.masterSha256MustMatchApproval === true
        && policy.readinessRules.masterBytesMustMatchApproval === true
        && policy.readinessRules.runtimeDeliveryContractRequired === true
        && order.assetContract.runtimeDelivery !== null,
    }),
    freeze({
      id: "no-delivery-promotion-atlas-or-publication-authority",
      passed: policy.authority.automaticDelivery === false
        && policy.authority.gameRepositoryPromotion === false
        && policy.authority.targetRepositoryMutation === false
        && policy.authority.finalAtlasCompilation === false
        && policy.authority.gitMutation === false
        && policy.authority.publication === false,
    }),
  ]);
  assertForbiddenDeliveryReadinessAuthorityFalse(policy.authority, "delivery-readiness policy");
  const failed = freeze(checks.filter((entry) => !entry.passed));
  return freeze({
    schema: "evavo.heavy-metal-fighting-frame-body-delivery-readiness-verification.v1",
    status: failed.length ? "failed" : "passed",
    sampleUnitId: order.unitId,
    policySha256: policy.policySha256,
    approvalVerification,
    checks,
    failed,
    authority: freeze({
      masterRead: true,
      approvalRecordRead: true,
      masteringRecordRead: true,
      readinessRecordPersistence: true,
      receiptPersistence: true,
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      masterMutation: false,
      imageTransformation: false,
      automaticApproval: false,
      automaticDelivery: false,
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
