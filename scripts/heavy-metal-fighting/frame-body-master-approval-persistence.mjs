import path from "node:path";

import { heavyMetalFightingProductionBatchResumePlan } from "./work-orders.mjs";
import {
  HMF_FRAME_BODY_MASTER_APPROVAL_DECISION_SCHEMA,
  HMF_FRAME_BODY_MASTER_APPROVAL_PROTOCOL_VERSION,
  HMF_FRAME_BODY_MASTER_APPROVAL_RESULT_SCHEMA,
  approvalDecisionPath,
  assert,
  assertForbiddenAuthorityFalse,
  canonical,
  freeze,
  hashBytes,
  hashValue,
  pathWithin,
  safeRelativePath,
  safeWorkspacePath,
  selfHashed,
} from "./frame-body-master-approval-common.mjs";
import {
  ensureApprovalDirectory,
  removeOwnedApprovalOutput,
  writeApprovalExactOrReuse,
  writeApprovalReceiptChain,
} from "./frame-body-master-approval-io.mjs";
import { compileHmfFrameBodyMasterApprovalDecisionDocument } from "./frame-body-master-approval-plan.mjs";
import { validatedHmfFrameBodyMasterApprovalWorkspace } from "./frame-body-master-approval-workspace.mjs";

export async function materializeHmfFrameBodyMasterApprovalDecision(
  decisionInput,
) {
  const decision = selfHashed(
    decisionInput,
    "approvalDecisionSha256",
    "Frame body master approval decision",
  );
  assert(
    decision.schema === HMF_FRAME_BODY_MASTER_APPROVAL_DECISION_SCHEMA
      && decision.protocolVersion
        === HMF_FRAME_BODY_MASTER_APPROVAL_PROTOCOL_VERSION,
    "master approval decision schema or protocol drifted.",
  );
  assert(
    decision.authority?.decisionCompilation === true
      && decision.authority?.masterRead === true
      && decision.authority?.masteringRecordRead === true
      && decision.authority?.namedHumanDecisionRequired === true
      && decision.authority?.explicitWriteEnabledRuntimeRequired === true,
    "master approval decision lost its governed approval boundary.",
  );
  assertForbiddenAuthorityFalse(
    decision.authority,
    "master approval decision",
  );
  assert(
    decision.completedApprovalState === "named-human-approved"
      && decision.decision === "approved"
      && decision.nextLegalAction === "compile-delivery-readiness",
    "master approval lifecycle target drifted.",
  );
  assert(
    hashValue(decision.approvalEvidence)
      === decision.approvalEvidenceSha256,
    "master approval evidence hash drifted.",
  );
  const receipt = selfHashed(
    decision.receipt,
    "receiptSha256",
    "named-human-approved receipt",
  );
  assert(
    receipt.state === "named-human-approved"
      && receipt.outcome === null
      && receipt.actorClass === "human",
    "named-human-approved receipt state, outcome or actor class drifted.",
  );
  assert(
    receipt.evidenceSha256 === decision.approvalEvidenceSha256
      && receipt.candidateSha256
        === decision.masteringPlan.candidate.sha256
      && receipt.previousReceiptSha256
        === decision.masteringPlan.receipt.receiptSha256,
    "approval receipt is not bound to the exact evidence, candidate and mastered predecessor.",
  );
  assert(
    decision.approvalEvidence.masteringPlanSha256
      === decision.masteringPlan.masteringPlanSha256
      && decision.approvalEvidence.masteringRecordSha256
        === decision.masteringPlan.masteringRecord.masteringRecordSha256
      && decision.approvalEvidence.masteredReceiptSha256
        === decision.masteringPlan.receipt.receiptSha256
      && decision.approvalEvidence.master.sha256
        === decision.masteringPlan.masteringRecord.master.sha256,
    "master approval evidence lineage drifted.",
  );

  const reconstructed =
    await compileHmfFrameBodyMasterApprovalDecisionDocument({
      masteringPlan: decision.masteringPlan,
      previousReceipts: decision.previousReceipts,
      workspaceRoot: decision.workspaceRoot,
      humanApproval: {
        actorId: decision.approvalEvidence.decisionMaker.actorId,
        occurredAt: decision.approvalEvidence.occurredAt,
        decision: decision.approvalEvidence.decision,
        rationale: decision.approvalEvidence.rationale,
        attestations: decision.approvalEvidence.attestations,
      },
    });
  assert(
    reconstructed.approvalDecisionSha256
      === decision.approvalDecisionSha256
      && canonical(reconstructed) === canonical(decision),
    "master approval decision does not recompile from governed evidence.",
  );

  const inputs = await validatedHmfFrameBodyMasterApprovalWorkspace(
    decision.masteringPlan,
    receipt,
  );
  assert(
    inputs.policy.policySha256 === decision.policySha256
      && inputs.order.workOrderSha256 === decision.workOrderSha256,
    "master approval decision is stale against policy or work order.",
  );
  assert(
    inputs.master.sha256 === decision.approvalEvidence.master.sha256
      && inputs.master.size === decision.approvalEvidence.master.bytes,
    "master changed after approval decision compilation.",
  );

  const target = safeRelativePath(
    decision.target,
    "master approval decision target",
  );
  assert(
    target === inputs.decisionTarget
      && target === approvalDecisionPath(inputs.order, decision.attempt),
    "master approval decision target drifted from the immutable work order.",
  );
  if (inputs.isCompleted) {
    assert(
      await safeWorkspacePath(
        inputs.root,
        target,
        "persisted Frame body master approval decision",
        { optional: true },
      ),
      "named-human-approved receipt exists without its exact approval decision.",
    );
  }

  const targetDirectory = await ensureApprovalDirectory(
    inputs.root,
    path.posix.dirname(target),
  );
  const decisionPath = path.resolve(
    inputs.root,
    ...target.split("/"),
  );
  assert(
    pathWithin(inputs.root, decisionPath)
      && path.dirname(decisionPath) === targetDirectory,
    "master approval decision escaped its governed review directory.",
  );
  const receiptPath = await safeWorkspacePath(
    inputs.root,
    inputs.receiptTarget,
    "master approval receipt chain",
  );

  const decisionBytes = Buffer.from(canonical(decision), "utf8");
  let decisionStatus;
  let receiptStatus = null;
  let createdIdentity = null;
  try {
    const decisionWrite = await writeApprovalExactOrReuse(
      decisionPath,
      decisionBytes,
      hashBytes(decisionBytes),
      "Frame body master approval decision",
    );
    decisionStatus = decisionWrite.status;
    if (decisionWrite.status === "created") {
      createdIdentity = decisionWrite.identity;
    }

    const persisted = await writeApprovalReceiptChain(
      receiptPath,
      decision.previousReceipts,
      receipt,
    );
    receiptStatus = persisted.status;
    const resume = await heavyMetalFightingProductionBatchResumePlan(
      decision.batchId,
      persisted.chain,
    );
    const unitState = resume.unitStates.find(
      (entry) => entry.unitId === decision.unitId,
    );
    assert(
      unitState?.currentState === "named-human-approved"
        && unitState.currentOutcome === null
        && unitState.nextAction === decision.nextLegalAction,
      "master approval did not advance to the governed named-human-approved state.",
    );
  } catch (error) {
    if (receiptStatus !== "advanced" && createdIdentity) {
      await removeOwnedApprovalOutput(
        decisionPath,
        createdIdentity,
      );
    }
    throw error;
  }

  const alreadyApproved =
    decisionStatus === "reused" && receiptStatus === "reused";
  const body = {
    schema: HMF_FRAME_BODY_MASTER_APPROVAL_RESULT_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_MASTER_APPROVAL_PROTOCOL_VERSION,
    projectId: decision.projectId,
    unitId: decision.unitId,
    batchId: decision.batchId,
    frameId: decision.frameId,
    bodySlot: decision.bodySlot,
    attempt: decision.attempt,
    masteringPlanSha256:
      decision.masteringPlan.masteringPlanSha256,
    masteringRecordSha256:
      decision.masteringPlan.masteringRecord.masteringRecordSha256,
    masteredReceiptSha256:
      decision.masteringPlan.receipt.receiptSha256,
    approvalDecisionSha256: decision.approvalDecisionSha256,
    approvalEvidenceSha256: decision.approvalEvidenceSha256,
    approvalReceiptSha256: receipt.receiptSha256,
    candidateSha256:
      decision.masteringPlan.candidate.sha256,
    masterSha256:
      decision.masteringPlan.masteringRecord.master.sha256,
    status: alreadyApproved ? "already-approved" : "approved",
    materialization: freeze({
      approvalDecision: decisionStatus,
      receiptChain: receiptStatus,
    }),
    currentState: "named-human-approved",
    nextLegalAction: decision.nextLegalAction,
    authority: freeze({
      masterReadPerformed: true,
      masteringRecordReadPerformed: true,
      namedHumanApprovalRecorded: true,
      approvalDecisionPersistencePerformed:
        decisionStatus === "created",
      receiptPersistencePerformed: receiptStatus === "advanced",
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      imageTransformation: false,
      automaticSelection: false,
      automaticApproval: false,
      automaticDeliveryReadiness: false,
      candidatePromotion: false,
      gameRepositoryPromotion: false,
      targetRepositoryMutation: false,
      finalAtlasCompilation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  };
  return freeze({
    ...body,
    approvalResultSha256: hashValue(body),
  });
}
