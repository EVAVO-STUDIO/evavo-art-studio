import path from "node:path";
import { heavyMetalFightingProductionBatchResumePlan } from "./work-orders.mjs";
import {
  HMF_FRAME_BODY_SELECTION_DECISION_SCHEMA,
  HMF_FRAME_BODY_SELECTION_PROTOCOL_VERSION,
  HMF_FRAME_BODY_SELECTION_RESULT_SCHEMA,
  assert,
  assertForbiddenAuthorityFalse,
  canonical,
  freeze,
  hashBytes,
  hashValue,
  pathWithin,
  safeRelativePath,
  safeWorkspacePath,
  selectionDecisionPath,
  selfHashed,
} from "./frame-body-selection-decision-common.mjs";
import {
  ensureSelectionDirectory,
  writeSelectionExactOrReuse,
  writeSelectionReceiptChain,
} from "./frame-body-selection-decision-io.mjs";
import { compileHmfFrameBodySelectionDecisionDocument } from "./frame-body-selection-decision-plan.mjs";
import { validatedHmfFrameBodySelectionWorkspace } from "./frame-body-selection-decision-workspace.mjs";

export async function materializeHmfFrameBodySelectionDecision(decisionInput) {
  const decision = selfHashed(decisionInput, "selectionDecisionSha256", "selection decision");
  assert(
    decision.schema === HMF_FRAME_BODY_SELECTION_DECISION_SCHEMA
      && decision.protocolVersion === HMF_FRAME_BODY_SELECTION_PROTOCOL_VERSION,
    "selection decision schema or protocol drifted.",
  );
  assert(
    decision.authority?.decisionCompilation === true
      && decision.authority?.explicitWriteEnabledRuntimeRequired === true
      && decision.authority?.namedHumanDecisionRequired === true,
    "selection decision lost the compilation, explicit-write or named-human boundary.",
  );
  assertForbiddenAuthorityFalse(decision.authority, "selection decision");
  assert(decision.completedSelectionState === "selected-or-repair-requested", "selection decision lifecycle state drifted.");
  assert(hashValue(decision.selectionEvidence) === decision.selectionEvidenceSha256, "selection evidence hash drifted.");
  assert(
    decision.receipt?.state === "selected-or-repair-requested" && decision.receipt.outcome === decision.outcome,
    "selection receipt state or outcome drifted.",
  );
  assert(
    decision.receipt.actorClass === "human"
      && decision.receipt.actorId === decision.selectionEvidence.decisionMaker.actorId,
    "selection receipt lost its named-human decision maker.",
  );
  assert(
    decision.receipt.evidenceSha256 === decision.selectionEvidenceSha256
      && decision.receipt.candidateSha256 === decision.selectionEvidence.candidateSha256,
    "selection receipt is not bound to its evidence and candidate.",
  );
  const creative = decision.creativeReviewDecision;
  assert(decision.receipt.previousReceiptSha256 === creative.receipt.receiptSha256, "selection receipt is not linked to the creative-review receipt.");
  assert(
    decision.selectionEvidence.creativeReviewDecisionSha256 === creative.creativeReviewDecisionSha256
      && decision.selectionEvidence.creativeReviewReceiptSha256 === creative.receipt.receiptSha256
      && decision.selectionEvidence.reviewEvidenceSha256 === creative.reviewEvidenceSha256,
    "selection evidence creative-review lineage drifted.",
  );
  const reconstructed = await compileHmfFrameBodySelectionDecisionDocument({
    creativeReviewDecision: creative,
    previousReceipts: decision.previousReceipts,
    workspaceRoot: decision.workspaceRoot,
    humanDecision: {
      actorId: decision.selectionEvidence.decisionMaker.actorId,
      occurredAt: decision.selectionEvidence.occurredAt,
      outcome: decision.selectionEvidence.outcome,
      rationale: decision.selectionEvidence.rationale,
      attestations: decision.selectionEvidence.attestations,
    },
  });
  assert(
    reconstructed.selectionDecisionSha256 === decision.selectionDecisionSha256
      && canonical(reconstructed) === canonical(decision),
    "selection decision does not recompile from its governed evidence.",
  );
  const inputs = await validatedHmfFrameBodySelectionWorkspace(decision);
  const target = safeRelativePath(decision.target, "selection decision target");
  assert(
    target === selectionDecisionPath(inputs.order, decision.attempt),
    "selection decision target drifted from the immutable work order.",
  );
  const targetDirectory = await ensureSelectionDirectory(inputs.root, path.posix.dirname(target));
  const decisionPath = path.resolve(inputs.root, ...target.split("/"));
  assert(
    pathWithin(inputs.root, decisionPath) && path.dirname(decisionPath) === targetDirectory,
    "selection decision escaped its governed review directory.",
  );
  const receiptPath = await safeWorkspacePath(inputs.root, inputs.receiptTarget, "selection receipt chain");
  const decisionBytes = Buffer.from(canonical(decision), "utf8");
  const decisionStatus = await writeSelectionExactOrReuse(decisionPath, decisionBytes, hashBytes(decisionBytes));
  const persisted = await writeSelectionReceiptChain(receiptPath, decision.previousReceipts, decision.receipt);
  const resume = await heavyMetalFightingProductionBatchResumePlan(decision.batchId, persisted.chain);
  const unitState = resume.unitStates.find((entry) => entry.unitId === decision.unitId);
  assert(
    unitState?.currentState === "selected-or-repair-requested" && unitState.currentOutcome === decision.outcome,
    "selection materialization did not advance to the governed outcome.",
  );
  assert(unitState.nextAction === decision.nextLegalAction, "selection materialization produced the wrong next legal action.");
  const newStatus = decision.outcome === "selected" ? "selected-recorded" : "repair-request-recorded";
  const reusedStatus = decision.outcome === "selected" ? "already-selected-recorded" : "already-repair-request-recorded";
  const body = {
    schema: HMF_FRAME_BODY_SELECTION_RESULT_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_SELECTION_PROTOCOL_VERSION,
    projectId: decision.projectId,
    unitId: decision.unitId,
    batchId: decision.batchId,
    frameId: decision.frameId,
    bodySlot: decision.bodySlot,
    attempt: decision.attempt,
    creativeReviewDecisionSha256: inputs.creative.creativeReviewDecisionSha256,
    selectionDecisionSha256: decision.selectionDecisionSha256,
    selectionEvidenceSha256: decision.selectionEvidenceSha256,
    selectionReceiptSha256: decision.receipt.receiptSha256,
    candidateSha256: inputs.candidate.sha256,
    outcome: decision.outcome,
    status: decisionStatus === "reused" && persisted.status === "reused" ? reusedStatus : newStatus,
    materialization: freeze({ selectionDecision: decisionStatus, receiptChain: persisted.status }),
    currentState: unitState.currentState,
    nextLegalAction: unitState.nextAction,
    boundedRepairTemplateSha256: decision.boundedRepairTemplate?.repairTemplateSha256 ?? null,
    authority: freeze({
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      automaticSelection: false,
      automaticRepairAuthorization: false,
      mastering: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  };
  return freeze({ ...body, selectionResultSha256: hashValue(body) });
}
