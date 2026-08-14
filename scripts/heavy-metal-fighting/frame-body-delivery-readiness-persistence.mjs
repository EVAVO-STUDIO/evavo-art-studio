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
  freeze,
  hashBytes,
  hashValue,
  pathWithin,
  safeRelativePath,
  safeWorkspacePath,
  selfHashed,
} from "./frame-body-delivery-readiness-common.mjs";
import {
  ensureApprovalDirectory,
  removeOwnedApprovalOutput,
  writeApprovalExactOrReuse,
  writeApprovalReceiptChain,
} from "./frame-body-named-human-approval-io.mjs";
import { compileHmfFrameBodyDeliveryReadinessPlanDocument } from "./frame-body-delivery-readiness-plan.mjs";
import { snapshotReadinessPlan } from "./frame-body-delivery-readiness-snapshot.mjs";
import { validatedHmfFrameBodyDeliveryReadinessWorkspace } from "./frame-body-delivery-readiness-workspace.mjs";

export async function materializeHmfFrameBodyDeliveryReadiness(planInput) {
  const plan = selfHashed(
    snapshotReadinessPlan(planInput),
    "readinessPlanSha256",
    "Frame body delivery-readiness plan",
  );
  assert(
    plan.schema === HMF_FRAME_BODY_DELIVERY_READINESS_PLAN_SCHEMA
      && plan.protocolVersion === HMF_FRAME_BODY_DELIVERY_READINESS_PROTOCOL_VERSION,
    "delivery-readiness plan schema or protocol drifted.",
  );
  assert(
    plan.completedReadinessState === "delivery-ready"
      && plan.nextLegalAction === "complete",
    "delivery-readiness lifecycle target drifted.",
  );
  assert(
    plan.authority?.planCompilation === true
      && plan.authority?.masterRead === true
      && plan.authority?.approvalRecordRead === true
      && plan.authority?.masteringRecordRead === true
      && plan.authority?.explicitWriteEnabledRuntimeRequired === true,
    "delivery-readiness plan lost its governed compilation/read boundary.",
  );
  assertForbiddenDeliveryReadinessAuthorityFalse(plan.authority, "delivery-readiness plan");

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
  assertForbiddenDeliveryReadinessAuthorityFalse(record.authority, "delivery-readiness record");
  assert(
    record.claims?.exactApprovedMasterRevalidated === true
      && record.claims?.exactMasterMatchesSelectedCandidate === true
      && record.claims?.namedHumanApprovalRevalidated === true
      && record.claims?.deliveryMetadataCompiled === true
      && record.claims?.deliveryPerformed === false
      && record.claims?.promotionPerformed === false
      && record.claims?.atlasCompilationPerformed === false,
    "delivery-readiness record claims drifted.",
  );

  const receipt = selfHashed(plan.receipt, "receiptSha256", "delivery-ready receipt");
  assert(
    receipt.state === "delivery-ready"
      && receipt.outcome === null
      && receipt.actorClass === "system",
    "delivery-ready receipt state, outcome or actor class drifted.",
  );
  assert(
    receipt.actorId === record.executor.actorId
      && receipt.evidenceSha256 === record.readinessRecordSha256
      && receipt.candidateSha256 === plan.master.sha256
      && receipt.previousReceiptSha256 === plan.approvalPlan.receipt.receiptSha256,
    "delivery-ready receipt is not bound to executor, record, master and approval predecessor.",
  );
  assert(
    record.approvalPlanSha256 === plan.approvalPlan.approvalPlanSha256
      && record.approvalRecordSha256 === plan.approvalPlan.approvalRecord.approvalRecordSha256
      && record.namedHumanApprovedReceiptSha256 === plan.approvalPlan.receipt.receiptSha256
      && record.master.sha256 === plan.master.sha256
      && record.master.bytes === plan.master.bytes
      && record.master.path === plan.master.path,
    "delivery-readiness record approval or master lineage drifted.",
  );

  const reconstructed = await compileHmfFrameBodyDeliveryReadinessPlanDocument({
    approvalPlan: plan.approvalPlan,
    previousReceipts: plan.previousReceipts,
    workspaceRoot: plan.workspaceRoot,
    master: plan.master,
    readinessRequest: {
      actorId: record.executor.actorId,
      occurredAt: record.occurredAt,
      attestations: record.attestations,
    },
  });
  assert(
    reconstructed.readinessPlanSha256 === plan.readinessPlanSha256
      && canonical(reconstructed) === canonical(plan),
    "delivery-readiness plan does not recompile from governed evidence.",
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
      && receiptTarget === inputs.receiptTarget,
    "delivery-readiness targets drifted from the immutable work order.",
  );

  if (inputs.isCompleted) {
    assert(
      await safeWorkspacePath(
        inputs.root,
        recordTarget,
        "persisted delivery-readiness record",
        { optional: true },
      ),
      "delivery-ready receipt exists without its readiness record.",
    );
  }

  const recordDirectory = await ensureApprovalDirectory(
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
    recordWrite = await writeApprovalExactOrReuse(
      recordPath,
      recordBytes,
      hashBytes(recordBytes),
      "delivery-readiness record",
    );
    const persisted = await writeApprovalReceiptChain(
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
      "delivery-readiness materialization did not advance to the terminal governed state.",
    );
  } catch (error) {
    if (recordWrite?.status === "created" && receiptStatus !== "advanced") {
      await removeOwnedApprovalOutput(recordPath, recordWrite.identity);
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
    masterSha256: plan.master.sha256,
    masterBytes: plan.master.bytes,
    status: alreadyReady ? "already-delivery-ready" : "delivery-ready",
    materialization: freeze({
      readinessRecord: recordWrite.status,
      receiptChain: receiptStatus,
    }),
    currentState: "delivery-ready",
    nextLegalAction: "complete",
    authority: freeze({
      masterReadPerformed: true,
      approvalRecordReadPerformed: true,
      masteringRecordReadPerformed: true,
      readinessRecordPersistencePerformed: recordWrite.status === "created",
      receiptPersistencePerformed: receiptStatus === "advanced",
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
  };
  return freeze({ ...body, readinessResultSha256: hashValue(body) });
}
