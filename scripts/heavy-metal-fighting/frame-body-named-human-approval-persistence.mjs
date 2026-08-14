import path from "node:path";

import { heavyMetalFightingProductionBatchResumePlan } from "./work-orders.mjs";
import {
  HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_DECISION_SCHEMA,
  HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PROTOCOL_VERSION,
  HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_RESULT_SCHEMA,
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
} from "./frame-body-named-human-approval-common.mjs";
import {
  ensureApprovalDirectory,
  removeOwnedApprovalOutput,
  writeApprovalExactOrReuse,
  writeApprovalReceiptChain,
} from "./frame-body-named-human-approval-io.mjs";
import {
  compileHmfFrameBodyNamedHumanApprovalDecisionDocument,
} from "./frame-body-named-human-approval-plan.mjs";
import {
  validatedHmfFrameBodyNamedHumanApprovalWorkspace,
} from "./frame-body-named-human-approval-workspace.mjs";

export async function materializeHmfFrameBodyNamedHumanApproval(decisionInput) {
  const decision = selfHashed(
    decisionInput,
    "approvalDecisionSha256",
    "Frame body named-human approval decision",
  );
  assert(
    decision.schema === HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_DECISION_SCHEMA
      && decision.protocolVersion
        === HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PROTOCOL_VERSION,
    "named-human approval decision schema or protocol drifted.",
  );
  assert(
    decision.authority?.decisionCompilation === true
      && decision.authority?.masterRead === true
      && decision.authority?.masteringRecordRead === true
      && decision.authority?.namedHumanApproval === true
      && decision.authority?.explicitWriteEnabledRuntimeRequired === true,
    "named-human approval decision lost its governed authority boundary.",
  );
  assertForbiddenAuthorityFalse(decision.authority, "named-human approval decision");
  assert(
    decision.completedApprovalState === "named-human-approved"
      && decision.nextLegalAction === "compile-delivery-readiness",
    "named-human approval lifecycle target drifted.",
  );
  assert(
    hashValue(decision.approvalEvidence) === decision.approvalEvidenceSha256,
    "named-human approval evidence hash drifted.",
  );
  assert(
    decision.approvalEvidence?.approved === true
      && decision.approvalEvidence.approver?.actorClass === "human",
    "named-human approval evidence lost its explicit human approval.",
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
      && receipt.candidateSha256 === decision.master.sha256
      && receipt.previousReceiptSha256
        === decision.masteringPlan.receipt.receiptSha256,
    "named-human-approved receipt is not bound to approval evidence, master and mastered predecessor.",
  );

  const reconstructed = await compileHmfFrameBodyNamedHumanApprovalDecisionDocument({
    masteringPlan: decision.masteringPlan,
    previousReceipts: decision.previousReceipts,
    workspaceRoot: decision.workspaceRoot,
    master: decision.master,
    humanApproval: {
      actorId: decision.approvalEvidence.approver.actorId,
      occurredAt: decision.approvalEvidence.occurredAt,
      approved: decision.approvalEvidence.approved,
      rationale: decision.approvalEvidence.rationale,
      attestations: decision.approvalEvidence.attestations,
    },
  });
  assert(
    reconstructed.approvalDecisionSha256 === decision.approvalDecisionSha256
      && canonical(reconstructed) === canonical(decision),
    "named-human approval decision does not recompile from its governed evidence.",
  );

  const inputs = await validatedHmfFrameBodyNamedHumanApprovalWorkspace(
    decision.masteringPlan,
    receipt,
  );
  assert(
    inputs.policy.policySha256 === decision.policySha256
      && inputs.order.workOrderSha256 === decision.workOrderSha256,
    "named-human approval decision is stale against policy or work order.",
  );
  assert(
    inputs.master.sha256 === decision.master.sha256
      && inputs.master.size === decision.master.bytes,
    "master changed after named-human approval decision compilation.",
  );

  const target = safeRelativePath(
    decision.target,
    "named-human approval decision target",
  );
  assert(
    target === approvalDecisionPath(inputs.order, decision.attempt),
    "named-human approval decision target drifted from the immutable work order.",
  );
  const targetDirectory = await ensureApprovalDirectory(
    inputs.root,
    path.posix.dirname(target),
  );
  const decisionPath = path.resolve(inputs.root, ...target.split("/"));
  assert(
    pathWithin(inputs.root, decisionPath)
      && path.dirname(decisionPath) === targetDirectory,
    "named-human approval output escaped its governed review directory.",
  );
  const receiptPath = await safeWorkspacePath(
    inputs.root,
    inputs.receiptTarget,
    "named-human approval receipt chain",
  );

  const decisionBytes = Buffer.from(canonical(decision), "utf8");
  const created = [];
  let decisionStatus;
  let receiptStatus = null;
  try {
    const decisionWrite = await writeApprovalExactOrReuse(
      decisionPath,
      decisionBytes,
      hashBytes(decisionBytes),
      "named-human approval decision",
    );
    decisionStatus = decisionWrite.status;
    if (decisionWrite.status === "created") {
      created.push({ path: decisionPath, identity: decisionWrite.identity });
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
    const state = resume.unitStates.find((entry) => entry.unitId === decision.unitId);
    assert(
      state?.currentState === "named-human-approved"
        && state.currentOutcome === null
        && state.nextAction === decision.nextLegalAction,
      "named-human approval did not advance to the governed approved state.",
    );
  } catch (error) {
    if (receiptStatus !== "advanced") {
      for (const output of [...created].reverse()) {
        await removeOwnedApprovalOutput(output.path, output.identity);
      }
    }
    throw error;
  }

  const alreadyApproved = decisionStatus === "reused"
    && receiptStatus === "reused";
  const body = {
    schema: HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_RESULT_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_NAMED_HUMAN_APPROVAL_PROTOCOL_VERSION,
    projectId: decision.projectId,
    unitId: decision.unitId,
    batchId: decision.batchId,
    frameId: decision.frameId,
    bodySlot: decision.bodySlot,
    attempt: decision.attempt,
    masteringPlanSha256: decision.masteringPlan.masteringPlanSha256,
    masteringRecordSha256:
      decision.masteringPlan.masteringRecord.masteringRecordSha256,
    approvalDecisionSha256: decision.approvalDecisionSha256,
    approvalEvidenceSha256: decision.approvalEvidenceSha256,
    approvalReceiptSha256: receipt.receiptSha256,
    masterSha256: decision.master.sha256,
    masterBytes: decision.master.bytes,
    approverId: decision.approvalEvidence.approver.actorId,
    status: alreadyApproved ? "already-approved" : "approved",
    materialization: freeze({
      approvalDecision: decisionStatus,
      receiptChain: receiptStatus,
    }),
    currentState: "named-human-approved",
    nextLegalAction: decision.nextLegalAction,
    authority: freeze({
      masterReadPerformed: true,
      approvalDecisionPersistencePerformed: decisionStatus === "created",
      receiptPersistencePerformed: receiptStatus === "advanced",
      namedHumanApprovalPerformed: true,
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      imageTransformation: false,
      automaticApproval: false,
      gameRepositoryPromotion: false,
      targetRepositoryMutation: false,
      finalAtlasCompilation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  };
  return freeze({ ...body, approvalResultSha256: hashValue(body) });
}
