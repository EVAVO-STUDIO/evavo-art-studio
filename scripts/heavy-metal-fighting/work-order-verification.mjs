import {
  buildHmfProductionWorkOrderBatch,
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionReceiptTemplate,
  heavyMetalFightingProductionRepairTemplate,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";

const freeze = (value) => {
  if (Array.isArray(value)) value.forEach(freeze);
  else if (value && typeof value === "object") Object.values(value).forEach(freeze);
  return Object.freeze(value);
};

export async function verifyHmfProductionWorkOrders() {
  const [first, body, receiptTemplate, repair, resume] = await Promise.all([
    buildHmfProductionWorkOrderBatch("hmf-b0001"),
    heavyMetalFightingProductionWorkOrder("hmf.frame-animation.bastion.slot-001"),
    heavyMetalFightingProductionReceiptTemplate("hmf.frame-animation.bastion.slot-001"),
    heavyMetalFightingProductionRepairTemplate("hmf.frame-animation.bastion.slot-001", {
      candidateSha256: "a".repeat(64),
      failureCodes: ["random-greebles", "pivot-drift"],
      attempt: 1,
    }),
    heavyMetalFightingProductionBatchResumePlan("hmf-b0001", []),
  ]);
  const checks = [
    ["batch-cardinality", first.requiredImages === first.workOrders.length && first.workOrders.length >= 1 && first.workOrders.length <= 10],
    ["unique-work-order-hashes", new Set(first.workOrders.map((order) => order.workOrderSha256)).size === first.workOrders.length],
    ["single-candidate", first.workOrders.every((order) => order.candidatePolicy.candidateFanout === 1)],
    ["candidate-scratch-root", first.workOrders.every((order) => order.executionPaths.candidatePathTemplate.startsWith("scratch/provider/"))],
    ["no-provider-authority", first.workOrders.every((order) => order.authority.providerExecution === false && order.authority.targetRepositoryMutation === false)],
    ["body-native-v3", body.assetContract.nativeDimensions?.width === 160 && body.assetContract.nativeDimensions?.height === 160],
    ["body-pivot-v3", body.assetContract.pivot?.x === 80 && body.assetContract.pivot?.y === 152],
    ["body-bank-continuity", typeof body.referenceBindings.previousCel === "string" && typeof body.referenceBindings.nextCel === "string"],
    ["anti-generic-bound", body.failureCodes.style.includes("random-greebles") && body.failureCodes.style.includes("provider-packed-final-atlas")],
    ["human-generation-gate", receiptTemplate.states.find((state) => state.id === "generation-authorized")?.requiresHuman === true],
    ["human-approval-gate", receiptTemplate.states.find((state) => state.id === "named-human-approved")?.requiresHuman === true],
    ["bounded-repair", repair.preservePassingSiblings === true && repair.authority.siblingRegeneration === false],
    ["resume-nonexecuting", resume.status === "not-started" && resume.authority.providerExecution === false],
  ].map(([id, passed]) => freeze({ id, passed }));
  return freeze({
    schema: "evavo.heavy-metal-fighting-work-order-verification.v2",
    status: checks.every((check) => check.passed) ? "passed" : "failed",
    registrySha256: first.registrySha256,
    checks,
    failed: checks.filter((check) => !check.passed),
  });
}
