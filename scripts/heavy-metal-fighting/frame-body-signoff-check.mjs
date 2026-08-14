import {
  heavyMetalFightingProductionReceiptTemplate,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  assertForbiddenMasterSignoffAuthorityFalse,
  freeze,
  loadMasterSignoffPolicy,
} from "./frame-body-signoff-contract.mjs";

export async function verifyHmfFrameBodyMasterSignoff() {
  const [policy, order, receiptTemplate] = await Promise.all([
    loadMasterSignoffPolicy(),
    heavyMetalFightingProductionWorkOrder("hmf.frame-animation.bastion.slot-121"),
    heavyMetalFightingProductionReceiptTemplate("hmf.frame-animation.bastion.slot-121"),
  ]);
  const predecessor = receiptTemplate.states.find(
    (entry) => entry.id === policy.signoffRules.predecessorState,
  );
  const state = receiptTemplate.states.find(
    (entry) => entry.id === policy.signoffRules.receiptState,
  );
  const checks = freeze([
    freeze({
      id: "policy-bound-to-frame-body-cels",
      passed: policy.assetKind === order.assetContract.kind,
    }),
    freeze({
      id: "mastered-predecessor",
      passed: predecessor?.id === "mastered",
    }),
    freeze({
      id: "named-human-approved-state",
      passed: state?.requiresHuman === true && state?.id === "named-human-approved",
    }),
    freeze({
      id: "explicit-approved-decision",
      passed: policy.signoffRules.requiredDecision === "approved",
    }),
    freeze({
      id: "exact-master-lineage-required",
      passed: policy.signoffRules.masterPathMustMatchWorkOrder === true
        && policy.signoffRules.masterSha256MustMatchMasteringRecord === true
        && policy.signoffRules.masterBytesMustMatchMasteringRecord === true,
    }),
    freeze({
      id: "delivery-readiness-separated",
      passed: policy.signoffRules.nextLegalAction === "compile-delivery-readiness",
    }),
    freeze({
      id: "no-master-mutation-or-automatic-signoff",
      passed: policy.authority.masterMutation === false
        && policy.authority.automaticSignoff === false,
    }),
    freeze({
      id: "no-promotion-atlas-git-or-publication-authority",
      passed: policy.authority.gameRepositoryPromotion === false
        && policy.authority.finalAtlasCompilation === false
        && policy.authority.gitMutation === false
        && policy.authority.publication === false,
    }),
  ]);
  assertForbiddenMasterSignoffAuthorityFalse(
    policy.authority,
    "master signoff policy",
  );
  const failed = freeze(checks.filter((entry) => !entry.passed));
  return freeze({
    schema: "evavo.heavy-metal-fighting-frame-body-signoff-check.v1",
    status: failed.length ? "failed" : "passed",
    sampleUnitId: order.unitId,
    policySha256: policy.policySha256,
    checks,
    failed,
    authority: freeze({
      masterRead: false,
      masteringRecordRead: false,
      namedReviewerSignoffDecision: false,
      signoffRecordPersistence: false,
      receiptPersistence: false,
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      masterMutation: false,
      imageTransformation: false,
      automaticSignoff: false,
      gameRepositoryPromotion: false,
      targetRepositoryMutation: false,
      finalAtlasCompilation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  });
}
