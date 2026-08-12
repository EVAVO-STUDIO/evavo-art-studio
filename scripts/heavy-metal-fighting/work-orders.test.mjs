import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHmfProductionWorkOrderBatch,
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionReceiptTemplate,
  heavyMetalFightingProductionRepairTemplate,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import { verifyHmfProductionWorkOrders } from "./work-order-verification.mjs";

const EVIDENCE = (digit) => String(digit).repeat(64);
const CANDIDATE = "a".repeat(64);

test("numbered production batches compile into immutable one-image work orders", async () => {
  const bundle = await buildHmfProductionWorkOrderBatch("hmf-b0001");
  assert.equal(bundle.schema, "evavo.heavy-metal-fighting-work-order-batch.v1");
  assert.equal(bundle.batchId, "hmf-b0001");
  assert.equal(bundle.requiredImages, bundle.workOrders.length);
  assert.ok(bundle.workOrders.length >= 1 && bundle.workOrders.length <= 10);
  assert.match(bundle.workOrderBatchSha256, /^[0-9a-f]{64}$/);
  assert.equal(new Set(bundle.workOrders.map((order) => order.workOrderSha256)).size, bundle.workOrders.length);
  assert.ok(bundle.workOrders.every((order) => order.providerPrompt.includes("OUTPUT EXACTLY ONE SEPARATE IMAGE")));
  assert.ok(bundle.workOrders.every((order) => order.executionPaths.candidatePathTemplate.startsWith("scratch/provider/hmf-b0001/")));
  assert.ok(bundle.workOrders.every((order) => order.authority.providerExecution === false));
});

test("production-v3 body work orders bind native dimensions, Frame identity, within-bank continuity and anti-generic gates", async () => {
  const order = await heavyMetalFightingProductionWorkOrder("hmf.frame-animation.bastion.slot-002");
  assert.equal(order.assetContract.nativeDimensions.width, 160);
  assert.equal(order.assetContract.nativeDimensions.height, 160);
  assert.deepEqual(order.assetContract.pivot, {x:80,y:152});
  assert.equal(order.subjectContract.type, "frame");
  assert.equal(order.subjectContract.id, "bastion");
  assert.equal(order.subjectContract.motionIdentity, "hydraulic-weight");
  assert.ok(order.referenceBindings.previousCel.startsWith("working/frames/bastion/sprites/"));
  assert.ok(order.referenceBindings.nextCel.startsWith("working/frames/bastion/sprites/"));
  assert.ok(order.providerPrompt.includes("effects remain separate") || order.providerPrompt.includes("Effects remain separate"));
  assert.ok(order.failureCodes.style.includes("random-greebles"));
  assert.ok(order.failureCodes.style.includes("provider-packed-final-atlas"));
  assert.equal(order.assetContract.runtimeDelivery.finalPromotionBlockedUntilGameAtlasV3Migration, true);
});

test("receipt templates and hash-linked state receipts enforce human gates and candidate continuity", async () => {
  const unitId = "hmf.frame-animation.bastion.slot-000";
  const template = await heavyMetalFightingProductionReceiptTemplate(unitId);
  assert.equal(template.states[2].id, "generation-authorized");
  assert.equal(template.states[2].requiresHuman, true);
  let previous = await createHmfProductionReceipt({unitId,state:"references-locked",attempt:1,evidenceSha256:EVIDENCE(1),actorClass:"agent",actorId:"art-studio",occurredAt:"2026-08-12T07:00:00Z"});
  previous = await createHmfProductionReceipt({unitId,state:"generation-authorized",attempt:1,evidenceSha256:EVIDENCE(2),actorClass:"human",actorId:"Greg",occurredAt:"2026-08-12T07:01:00Z"}, previous);
  previous = await createHmfProductionReceipt({unitId,state:"candidates-admitted",attempt:1,evidenceSha256:EVIDENCE(3),candidateSha256:CANDIDATE,actorClass:"agent",actorId:"art-studio",occurredAt:"2026-08-12T07:02:00Z"}, previous);
  previous = await createHmfProductionReceipt({unitId,state:"deterministic-qa-passed",attempt:1,evidenceSha256:EVIDENCE(4),candidateSha256:CANDIDATE,actorClass:"system",actorId:"pixel-qa",occurredAt:"2026-08-12T07:03:00Z"}, previous);
  previous = await createHmfProductionReceipt({unitId,state:"creative-review-passed",attempt:1,evidenceSha256:EVIDENCE(5),candidateSha256:CANDIDATE,actorClass:"agent",actorId:"review-agent",occurredAt:"2026-08-12T07:04:00Z"}, previous);
  previous = await createHmfProductionReceipt({unitId,state:"selected-or-repair-requested",attempt:1,evidenceSha256:EVIDENCE(6),candidateSha256:CANDIDATE,outcome:"selected",actorClass:"human",actorId:"Greg",occurredAt:"2026-08-12T07:05:00Z"}, previous);
  previous = await createHmfProductionReceipt({unitId,state:"mastered",attempt:1,evidenceSha256:EVIDENCE(7),candidateSha256:CANDIDATE,actorClass:"system",actorId:"pixel-master",occurredAt:"2026-08-12T07:06:00Z"}, previous);
  await assert.rejects(
    createHmfProductionReceipt({unitId,state:"named-human-approved",attempt:1,evidenceSha256:EVIDENCE(8),candidateSha256:CANDIDATE,actorClass:"agent",actorId:"review-agent",occurredAt:"2026-08-12T07:07:00Z"}, previous),
    /requires actorClass human/,
  );
  previous = await createHmfProductionReceipt({unitId,state:"named-human-approved",attempt:1,evidenceSha256:EVIDENCE(8),candidateSha256:CANDIDATE,actorClass:"human",actorId:"Greg",occurredAt:"2026-08-12T07:07:00Z"}, previous);
  previous = await createHmfProductionReceipt({unitId,state:"delivery-ready",attempt:1,evidenceSha256:EVIDENCE(9),candidateSha256:CANDIDATE,actorClass:"system",actorId:"delivery-compiler",occurredAt:"2026-08-12T07:08:00Z"}, previous);
  assert.equal(previous.state, "delivery-ready");
  assert.match(previous.receiptSha256, /^[0-9a-f]{64}$/);
});

test("bounded repairs target one failed unit and forbid sibling regeneration", async () => {
  const repair = await heavyMetalFightingProductionRepairTemplate("hmf.frame-animation.bastion.slot-000", {
    candidateSha256: CANDIDATE,
    failureCodes: ["random-greebles", "pivot-drift"],
    attempt: 1,
  });
  assert.equal(repair.preservePassingSiblings, true);
  assert.equal(repair.authority.siblingRegeneration, false);
  assert.ok(repair.siblingUnitIdsForbiddenFromRegeneration.length > 0);
  assert.ok(!repair.siblingUnitIdsForbiddenFromRegeneration.includes(repair.unitId));
  assert.ok(repair.repairPrompt.includes("Do not regenerate or alter sibling units"));
  assert.match(repair.repairTemplateSha256, /^[0-9a-f]{64}$/);
});

test("batch resume plans are deterministic and remain non-executing", async () => {
  const empty = await heavyMetalFightingProductionBatchResumePlan("hmf-b0001", []);
  assert.equal(empty.status, "not-started");
  assert.ok(empty.unitStates.every((state) => state.nextAction === "lock-references"));
  assert.equal(empty.authority.providerExecution, false);
  const verification = await verifyHmfProductionWorkOrders();
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.every((check) => check.passed));
});
