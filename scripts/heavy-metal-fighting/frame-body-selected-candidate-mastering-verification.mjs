import {
  heavyMetalFightingProductionReceiptTemplate,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  assertForbiddenAuthorityFalse,
  freeze,
  loadMasteringPolicy,
} from "./frame-body-selected-candidate-mastering-common.mjs";

export async function verifyHmfFrameBodySelectedCandidateMastering() {
  const [policy, order, receiptTemplate] = await Promise.all([
    loadMasteringPolicy(),
    heavyMetalFightingProductionWorkOrder("hmf.frame-animation.bastion.slot-121"),
    heavyMetalFightingProductionReceiptTemplate("hmf.frame-animation.bastion.slot-121"),
  ]);
  const selectedState = receiptTemplate.states.find(
    (entry) => entry.id === policy.masteringRules.predecessorState,
  );
  const masteredState = receiptTemplate.states.find(
    (entry) => entry.id === policy.masteringRules.receiptState,
  );
  const checks = freeze([
    freeze({ id: "policy-bound-to-frame-body-cels", passed: policy.assetKind === order.assetContract.kind }),
    freeze({ id: "selected-predecessor-required", passed: selectedState?.outcomes?.includes("selected") === true }),
    freeze({
      id: "mastered-state-is-next-non-human-step",
      passed: masteredState?.rank === selectedState?.rank + 1
        && masteredState?.requiresEvidence === true
        && masteredState?.requiresCandidate === true
        && masteredState?.requiresHuman === false,
    }),
    freeze({
      id: "work-order-master-path-governed",
      passed: order.assetContract.masterOutputPath.startsWith("masters/")
        && order.assetContract.masterOutputPath !== order.assetContract.workspaceOutputPath,
    }),
    freeze({
      id: "exact-byte-mastering-only",
      passed: policy.masteringRules.masterBytesMustEqualSelectedCandidate === true
        && policy.masteringRules.masterSha256MustEqualSelectedCandidate === true,
    }),
    freeze({
      id: "create-only-and-readback-required",
      passed: policy.masteringRules.createOnlyOrExactReuse === true
        && policy.masteringRules.exactPostWriteReadbackRequired === true,
    }),
    freeze({
      id: "mastering-record-and-next-gate-required",
      passed: policy.masteringRules.masteringRecordRequired === true
        && policy.masteringRules.nextLegalAction === "request-named-human-approval",
    }),
    freeze({
      id: "no-approval-promotion-or-publication-authority",
      passed: policy.authority.namedHumanApproval === false
        && policy.authority.gameRepositoryPromotion === false
        && policy.authority.targetRepositoryMutation === false
        && policy.authority.publication === false,
    }),
  ]);
  assertForbiddenAuthorityFalse(policy.authority, "selected-candidate mastering policy");
  const failed = freeze(checks.filter((entry) => !entry.passed));
  return freeze({
    schema: "evavo.heavy-metal-fighting-frame-body-selected-candidate-mastering-verification.v1",
    status: failed.length ? "failed" : "passed",
    sampleUnitId: order.unitId,
    policySha256: policy.policySha256,
    checks,
    failed,
    authority: freeze({
      selectedCandidateRead: true,
      workspaceMasterCreation: true,
      masteringRecordPersistence: true,
      receiptPersistence: true,
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      imageTransformation: false,
      automaticSelection: false,
      namedHumanApproval: false,
      gameRepositoryPromotion: false,
      targetRepositoryMutation: false,
      finalAtlasCompilation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  });
}
