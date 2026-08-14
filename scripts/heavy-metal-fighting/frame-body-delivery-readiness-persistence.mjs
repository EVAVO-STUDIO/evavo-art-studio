import path from "node:path";

import { heavyMetalFightingProductionBatchResumePlan } from "./work-orders.mjs";
import {
  HMF_FRAME_BODY_DELIVERY_READINESS_PLAN_SCHEMA,
  HMF_FRAME_BODY_DELIVERY_READINESS_PROTOCOL_VERSION,
  HMF_FRAME_BODY_DELIVERY_READINESS_RECORD_SCHEMA,
  HMF_FRAME_BODY_DELIVERY_READINESS_RESULT_SCHEMA,
  assert,
  assertForbiddenDeliveryReadinessAuthorityFalse,
  canonical,
  deliveryReadinessRecordPath,
  freeze,
  hashBytes,
  hashValue,
  pathWithin,
  safeRelativePath,
  safeWorkspacePath,
  selfHashed,
  stableWorkspaceJson,
} from "./frame-body-delivery-readiness-common.mjs";
import {
  ensureDeliveryReadinessDirectory,
  removeOwnedDeliveryReadinessOutput,
  writeDeliveryReadinessExactOrReuse,
  writeDeliveryReadinessReceiptChain,
} from "./frame-body-delivery-readiness-io.mjs";
import { compileHmfFrameBodyDeliveryReadinessPlanDocument } from "./frame-body-delivery-readiness-plan.mjs";
import { snapshotDeliveryReadinessPlan } from "./frame-body-delivery-readiness-snapshot.mjs";
import { validatedHmfFrameBodyDeliveryReadinessWorkspace } from "./frame-body-delivery-readiness-workspace.mjs";

export async function materializeHmfFrameBodyDeliveryReadiness(planInput) {
  const captured = snapshotDeliveryReadinessPlan(planInput);
  const plan = selfHashed(
    captured,
    "readinessPlanSha256",
    "Frame body delivery-readiness plan",
  );
  assert(
    plan.schema === HMF_FRAME_BODY_DELIVERY_READINESS_PLAN_SCHEMA
      && plan.protocolVersion === HMF_FRAME_BODY_DELIVERY_READINESS_PROTOCOL_VERSION,
    "delivery-readiness plan schema or protocol drifted.",
  );
  assert(
    plan.authority?.planCompilation === true
      && plan.authority?.masterRead === true
      && plan.authority?.approvalRecordRead === true
      && plan.authority?.deliveryReadinessCompilation === true
      && plan.authority?.explicitWriteEnabledRuntimeRequired === true,
    "delivery-readiness plan lost its compilation, read or explicit-write boundary.",
  );
  assertForbiddenDeliveryReadinessAuthorityFalse(
    plan.authority,
    "delivery-readiness plan",
  );
  assert(
    plan.completedReadinessState === "delivery-ready"
      && plan.nextLegalAction === "complete",
    "delivery-readiness lifecycle target drifted.",
  );

  const record = selfHashed(
    plan.readinessRecord,
    "readinessRecordSha256",
    "Frame body delivery-readiness record",
  );
  assert(
    record.schema === HMF_FRAME_BODY_DELIVERY_READINESS_RECORD_SCHEMA
      && record.protocolVersion === HMF_FRAME_BODY_DELIVERY_READINESS_PROTOCOL_VERSION,
    "delivery-readiness record schema or protocol drifted.",
  );
  assert(
    record.authority?.deliveryReadinessCompilation === true,
    "delivery-readiness record lost its bounded compilation claim.",
  );
  assertForbiddenDeliveryReadinessAuthorityFalse(
    record.authority,
    "delivery-readiness record",
  );
  assert(
    record.claims?.exactApprovedMasterRevalidated === true
      && record.claims?.approvalLineageAccepted === true
      && record.claims?.terminalWorkspaceStateCompiled === true
      && record.claims?.finalAtlasCompiled === false
      && record.claims?.gameRepositoryPromotionPerformed === false
      && record.claims?.targetRepositoryMutationPerformed === false,
    "delivery-readiness record claims drifted.",
  );

  const receipt = selfHashed(
    plan.receipt,
    "receiptSha256",
    "delivery-ready production receipt",
  );
  assert(
    receipt.state === "delivery-ready"
      && receipt.outcome === null
      && receipt.actorClass === "system",
    "delivery-ready receipt state, outcome or actor class drifted.",
  );
  assert(
    receipt.actorId === record.compiler.actorId
      && receipt.evidenceSha256 === record.readinessRecordSha256
      && receipt.candidateSha256 === plan.master.sha256
      && receipt.previousReceiptSha256 === plan.approvalPlan.receipt.receiptSha256,
    "delivery-ready receipt is not bound to its compiler, evidence, master and approved predecessor.",
  );
  assert(
    record.approvalPlanSha256 === plan.approvalPlan.approvalPlanSha256
      && record.approvalRecordSha256
        === plan.approvalPlan.approvalRecord.approvalRecordSha256
      && record.approvedReceiptSha256 === plan.approvalPlan.receipt.receiptSha256
      && record.master.path === plan.master.path
      && record.master.sha256 === plan.master.sha256
      && record.master.bytes === plan.master.bytes,
    "delivery-readiness record approval lineage or master identity drifted.",
  );

  const reconstructed = await compileHmfFrameBodyDeliveryReadinessPlanDocument({
    approvalPlan: plan.approvalPlan,
    previousReceipts: plan.previousReceipts,
    workspaceRoot: plan.workspaceRoot,
    master: plan.master,
    readinessRequest: {
      actorId: record.compiler.actorId,
      occurredAt: record.occurredAt,
      attestations: record.attestations,
    },
  });
  assert(
    reconstructed.readinessPlanSha256 === plan.readinessPlanSha256
      && canonical(reconstructed) === canonical(plan),
    "delivery-readiness plan does not recompile from its governed evidence.",
  );

  const inputs = await validatedHmfFrameBodyDeliveryReadinessWorkspace(
    plan.approvalPlan,
    receipt,
  );
  assert(
    inputs.policy.policySha256 === plan.policySha256
      && inputs.order.workOrderSha256 === plan.workOrderSha256,
    "delivery-readiness plan is stale against policy or work order.",
  );
  assert(
    inputs.master.sha256 === plan.master.sha256
      && inputs.master.size === plan.master.bytes,
    "approved master changed after delivery-readiness plan compilation.",
  );

  const recordTarget = safeRelativePath(
    plan.targets.readinessRecord,
    "delivery-readiness record target",
  );
  const receiptTarget = safeRelativePath(
    plan.targets.receiptChain,
    "delivery-readiness receipt-chain target",
  );
  assert(
    recordTarget === inputs.readinessRecordTarget
      && recordTarget === deliveryReadinessRecordPath(inputs.order, plan.attempt)
      && receiptTarget === inputs.receiptTarget,
    "delivery-readiness targets drifted from the immutable work order.",
  );

  if (inputs.isCompleted) {
    const persistedRecord = await stableWorkspaceJson(
      inputs.root,
      recordTarget,
      "persisted delivery-readiness record",
    );
    assert(
      persistedRecord.value.readinessRecordSha256 === record.readinessRecordSha256
        && canonical(persistedRecord.value) === canonical(record),
      "delivery-ready receipt exists without its exact readiness record.",
    );
  }

  const recordDirectory = await ensureDeliveryReadinessDirectory(
    inputs.root,
    path.posix.dirname(recordTarget),
  );
  const recordPath = path.resolve(inputs.root, ...recordTarget.split("/"));
  assert(
    pathWithin(inputs.root, recordPath) && path.dirname(recordPath) === recordDirectory,
    "delivery-readiness record escaped its governed review directory.",
  );
  const receiptPath = await safeWorkspacePath(
    inputs.root,
    receiptTarget,
    "delivery-readiness receipt chain",
  );
  const recordBytes = Buffer.from(canonical(record), "utf8");
  let recordWrite;
  let receiptStatus = null;
  try {
    recordWrite = await writeDeliveryReadinessExactOrReuse(
      recordPath,
      recordBytes,
      hashBytes(recordBytes),
      "delivery-readiness record",
    );
    const persisted = await writeDeliveryReadinessReceiptChain(
      receiptPath,
      plan.previousReceipts,
      receipt,
    );
    receiptStatus = persisted.status;
    const resume = await heavyMetalFightingProductionBatchResumePlan(
      plan.batchId,
      persisted.chain,
    );
    const unitState = resume.unitStates.find((entry) => entry.unitId === plan.unitId);
    assert(
      unitState?.currentState === "delivery-ready"
        && unitState.currentOutcome === null
        && unitState.nextAction === "complete"
        && unitState.complete === true,
      "delivery readiness did not advance to the governed terminal state.",
    );
  } catch (error) {
    if (recordWrite?.status === "created" && receiptStatus !== "advanced") {
      await removeOwnedDeliveryReadinessOutput(recordPath, recordWrite.identity);
    }
    throw error;
  }

  const alreadyReady = recordWrite.status === "reused" && receiptStatus === "reused";
  const body = {
    schema: HMF_FRAME_BODY_DELIVERY_READINESS_RESULT_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_DELIVERY_READINESS_PROTOCOL_VERSION,
    projectId: plan.projectId,
    unitId: plan.unitId,
    batchId: plan.batchId,
    frameId: plan.frameId,
    bodySlot: plan.bodySlot,
    attempt: plan.attempt,
    approvalPlanSha256: plan.approvalPlan.approvalPlanSha256,
    approvalRecordSha256: plan.approvalPlan.approvalRecord.approvalRecordSha256,
    readinessPlanSha256: plan.readinessPlanSha256,
    readinessRecordSha256: record.readinessRecordSha256,
    deliveryReadyReceiptSha256: receipt.receiptSha256,
    candidateSha256: plan.approvalPlan.masteringPlan.candidate.sha256,
    masterSha256: plan.master.sha256,
    masterBytes: plan.master.bytes,
    compilerId: record.compiler.actorId,
    status: alreadyReady ? "already-delivery-ready" : "delivery-ready",
    materialization: freeze({
      readinessRecord: recordWrite.status,
      receiptChain: receiptStatus,
    }),
    currentState: "delivery-ready",
    nextLegalAction: "complete",
    complete: true,
    authority: freeze({
      masterReadPerformed: true,
      approvalRecordReadPerformed: true,
      deliveryReadinessRecordPersistencePerformed: recordWrite.status === "created",
      receiptPersistencePerformed: receiptStatus === "advanced",
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      masterMutation: false,
      imageTransformation: false,
      automaticApproval: false,
      deliveryReadinessCompilation: true,
      gameRepositoryPromotion: false,
      targetRepositoryMutation: false,
      finalAtlasCompilation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  };
  return freeze({ ...body, readinessResultSha256: hashValue(body) });
}
