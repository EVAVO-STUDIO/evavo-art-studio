import { heavyMetalFightingFrameBodyRole } from "./frame-body-role-grammar.mjs";
import { heavyMetalFightingProductionWorkOrder } from "./work-orders.mjs";
import { freeze, loadPolicy } from "./frame-body-deterministic-qa-common.mjs";

export async function verifyHmfFrameBodyDeterministicQa() {
  const [policy, order, role] = await Promise.all([
    loadPolicy(),
    heavyMetalFightingProductionWorkOrder("hmf.frame-animation.bastion.slot-121"),
    heavyMetalFightingFrameBodyRole("bastion", 121),
  ]);
  const allowed = new Set([...(order.failureCodes?.technical ?? []), ...(order.failureCodes?.style ?? [])]);
  const checks = freeze([
    freeze({ id: "policy-bound-to-frame-body-cels", passed: policy.assetKind === order.assetContract.kind }),
    freeze({ id: "native-cell-bound", passed: policy.candidate.width === 160 && policy.candidate.height === 160 && order.assetContract.nativeDimensions?.width === 160 && order.assetContract.nativeDimensions?.height === 160 }),
    freeze({ id: "pivot-and-ground-bound", passed: policy.geometry.pivot.x === 80 && policy.geometry.pivot.y === 152 && policy.geometry.groundLineY === 152 }),
    freeze({ id: "hero-role-resolves", passed: role.semanticId === "standing-heavy:hero-impact" && role.hero === true && role.contactRole === true }),
    freeze({ id: "failure-vocabulary-governed", passed: [...policy.automatedFailureCodes, ...policy.deferredFailureCodes].every((code) => allowed.has(code)) }),
    freeze({ id: "failure-remains-fail-closed", passed: policy.authority.namedHumanRepairAuthorizationRequired === true && policy.authority.providerRetry === false }),
    freeze({ id: "no-creative-or-promotion-authority", passed: policy.authority.creativeReview === false && policy.authority.candidateApproval === false && policy.authority.candidatePromotion === false }),
  ]);
  const failed = freeze(checks.filter((entry) => !entry.passed));
  return freeze({
    schema: "evavo.heavy-metal-fighting-frame-body-deterministic-qa-verification.v1",
    status: failed.length ? "failed" : "passed",
    sampleUnitId: order.unitId,
    policySha256: policy.policySha256,
    checks,
    failed,
    authority: freeze({ providerExecution: false, providerRetry: false, receiptPersistence: false, creativeReview: false, candidateApproval: false, candidatePromotion: false, targetRepositoryMutation: false, gitMutation: false, publication: false }),
  });
}
