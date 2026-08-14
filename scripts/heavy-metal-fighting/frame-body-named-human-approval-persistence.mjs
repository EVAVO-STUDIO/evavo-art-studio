import path from "node:path";

import { heavyMetalFightingProductionBatchResumePlan } from "./work-orders.mjs";
import {
  HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PLAN_SCHEMA,
  HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PROTOCOL_VERSION,
  HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_RECORD_SCHEMA,
  HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_RESULT_SCHEMA,
  assert,
  assertForbiddenAuthorityFalse,
  canonical,
  freeze,
  hashBytes,
  hashValue,
  namedHumanApprovalRecordPath,
  pathWithin,
  safeRelativePath,
  safeWorkspacePath,
  selfHashed,
} from "./frame-body-named-human-approval-common.mjs";
import {
  ensureApprovalDirectory,
  removeOwnedApprovalOutput,
  writeApprovalExactOrReuse,
  writeApprovalReceiptChain,
} from "./frame-body-named-human-approval-io.mjs";
import { compileHmfFrameBodyNamedHumanApprovalPlanDocument } from "./frame-body-named-human-approval-plan.mjs";
import { validatedHmfFrameBodyNamedHumanApprovalWorkspace } from "./frame-body-named-human-approval-workspace.mjs";

export async function materializeHmfFrameBodyNamedHumanApproval(planInput) {
  const plan = selfHashed(
    planInput,
    "approvalPlanSha256",
    "Frame body named-human approval plan",
  );
  assert(
    plan.schema === HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PLAN_SCHEMA
      && plan.protocolVersion === HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PROTOCOL_VERSION,
    "named-human approval plan schema or protocol drifted.",
  );
  assert(
    plan.authority?.planCompilation === true
      && plan.authority?.masterRead === true
      && plan.authority?.masteringRecordRead === true
      && plan.authority?.namedHumanApproverRequired === true
      && plan.authority?.explicitWriteEnabledRuntimeRequired === true,
    "named-human approval plan lost its compilation, read, human or explicit-write boundary.",
  );
  assertForbiddenAuthorityFalse(plan.authority, "named-human approval plan");
  assert(
    plan.completedApprovalState === "named-human-approved"
      && plan.nextLegalAction === "compile-delivery-readiness",
    "named-human approval lifecycle target drifted.",
  );

  const record = selfHashed(
    plan.approvalRecord,
    "approvalRecordSha256",
    "Frame body named-human approval record",
  );
  assert(
    record.schema === HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_RECORD_SCHEMA
      && record.protocolVersion === HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PROTOCOL_VERSION,
    "named-human approval record schema or protocol drifted.",
  );
  assertForbiddenAuthorityFalse(record.authority, "named-human approval record");
  assert(
    record.claims?.exactMasterInspected === true
      && record.claims?.exactMasterMatchesSelectedCandidate === true
      && record.claims?.masteringLineageAccepted === true
      && record.claims?.independentNamedHumanApproval === true
      && record.claims?.masterMutationPerformed === false
      && record.claims?.gameRepositoryPromotionPerformed === false
      && record.claims?.deliveryReadinessCompiled === false,
    "named-human approval record claims drifted.",
  );

  const receipt = selfHashed(plan.receipt, "receiptSha256", "named-human-approved receipt");
  assert(
    receipt.state === "named-human-approved"
      && receipt.outcome === null
      && receipt.actorClass === "human",
    "named-human-approved receipt state, outcome or actor class drifted.",
  );
  assert(
    receipt.actorId === record.approver.actorId
      && receipt.evidenceSha256 === record.approvalRecordSha256
      && receipt.candidateSha256 === plan.master.sha256
      && receipt.previousReceiptSha256 === plan.masteringPlan.receipt.receiptSha256,
    "named-human-approved receipt is not bound to its approver, evidence, master and mastered predecessor.",
  );
  assert(
    record.masteringPlanSha256 === plan.masteringPlan.masteringPlanSha256
      && record.masteringRecordSha256
        === plan.masteringPlan.masteringRecord.masteringRecordSha256
      && record.masteredReceiptSha256 === plan.masteringPlan.receipt.receiptSha256
      && record.master.sha256 === plan.master.sha256
      && record.master.bytes === plan.master.bytes
      && record.master.path === plan.master.path,
    "named-human approval record mastering lineage or master identity drifted.",
  );

  const reconstructed = await compileHmfFrameBodyNamedHumanApprovalPlanDocument({
    masteringPlan: plan.masteringPlan,
    previousReceipts: plan.previousReceipts,
    workspaceRoot: plan.workspaceRoot,
    master: plan.master,
    humanApproval: {
      actorId: record.approver.actorId,
      occurredAt: record.occurredAt,
      decision: record.decision,
      rationale: record.rationale,
      attestations: record.attestations,
    },
  });
  assert(
    reconstructed.approvalPlanSha256 === plan.approvalPlanSha256
      && canonical(reconstructed) === canonical(plan),
    "named-human approval plan does not recompile from its governed evidence.",
  );

  const inputs = await validatedHmfFrameBodyNamedHumanApprovalWorkspace(
    plan.masteringPlan,
    receipt,
  );
  assert(
    inputs.policy.policySha256 === plan.policySha256
      && inputs.order.workOrderSha256 === plan.workOrderSha256,
    "named-human approval plan is stale against policy or work order.",
  );
  assert(
    inputs.master.sha256 === plan.master.sha256
      && inputs.master.size === plan.master.bytes,
    "master changed after named-human approval plan compilation.",
  );

  const recordTarget = safeRelativePath(
    plan.targets.approvalRecord,
    "named-human approval-record target",
  );
  const receiptTarget = safeRelativePath(
    plan.targets.receiptChain,
    "named-human approval receipt-chain target",
  );
  assert(
    recordTarget === inputs.approvalRecordTarget
      && recordTarget === namedHumanApprovalRecordPath(inputs.order, plan.attempt)
      && receiptTarget === inputs.receiptTarget,
    "named-human approval targets drifted from the immutable work order.",
  );

  if (inputs.isCompleted) {
    assert(
      await safeWorkspacePath(
        inputs.root,
        recordTarget,
        "persisted named-human approval record",
        { optional: true },
      ),
      "named-human-approved receipt exists without its exact approval record.",
    );
  }

  const recordDirectory = await ensureApprovalDirectory(
    inputs.root,
    path.posix.dirname(recordTarget),
  );
  const recordPath = path.resolve(inputs.root, ...recordTarget.split("/"));
  assert(
    pathWithin(inputs.root, recordPath) && path.dirname(recordPath) === recordDirectory,
    "named-human approval record escaped its governed review directory.",
  );
  const receiptPath = await safeWorkspacePath(
    inputs.root,
    receiptTarget,
    "named-human approval receipt chain",
  );
  const recordBytes = Buffer.from(canonical(record), "utf8");
  let recordWrite;
  let receiptStatus = null;
  try {
    recordWrite = await writeApprovalExactOrReuse(
      recordPath,
      recordBytes,
      hashBytes(recordBytes),
      "named-human approval record",
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
      unitState?.currentState === "named-human-approved"
        && unitState.currentOutcome === null
        && unitState.nextAction === plan.nextLegalAction,
      "named-human approval did not advance to the governed approved state.",
    );
  } catch (error) {
    if (recordWrite?.status === "created" && receiptStatus !== "advanced") {
      await removeOwnedApprovalOutput(recordPath, recordWrite.identity);
    }
    throw error;
  }

  const alreadyApproved = recordWrite.status === "reused" && receiptStatus === "reused";
  const body = {
    schema: HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_RESULT_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PROTOCOL_VERSION,
    projectId: plan.projectId,
    unitId: plan.unitId,
    batchId: plan.batchId,
    frameId: plan.frameId,
    bodySlot: plan.bodySlot,
    attempt: plan.attempt,
    masteringPlanSha256: plan.masteringPlan.masteringPlanSha256,
    masteringRecordSha256: plan.masteringPlan.masteringRecord.masteringRecordSha256,
    approvalPlanSha256: plan.approvalPlanSha256,
    approvalRecordSha256: record.approvalRecordSha256,
    namedHumanApprovedReceiptSha256: receipt.receiptSha256,
    candidateSha256: plan.masteringPlan.candidate.sha256,
    masterSha256: plan.master.sha256,
    masterBytes: plan.master.bytes,
    approverId: record.approver.actorId,
    decision: record.decision,
    status: alreadyApproved ? "already-approved" : "approved",
    materialization: freeze({
      approvalRecord: recordWrite.status,
      receiptChain: receiptStatus,
    }),
    currentState: "named-human-approved",
    nextLegalAction: plan.nextLegalAction,
    authority: freeze({
      masterReadPerformed: true,
      masteringRecordReadPerformed: true,
      approvalRecordPersistencePerformed: recordWrite.status === "created",
      receiptPersistencePerformed: receiptStatus === "advanced",
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
  };
  return freeze({ ...body, approvalResultSha256: hashValue(body) });
}
