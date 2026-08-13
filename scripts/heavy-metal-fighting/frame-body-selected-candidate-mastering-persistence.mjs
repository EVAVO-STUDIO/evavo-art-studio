import path from "node:path";

import { heavyMetalFightingProductionBatchResumePlan } from "./work-orders.mjs";
import {
  HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PLAN_SCHEMA,
  HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PROTOCOL_VERSION,
  HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_RECORD_SCHEMA,
  HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_RESULT_SCHEMA,
  assert,
  assertForbiddenAuthorityFalse,
  canonical,
  freeze,
  hashBytes,
  hashValue,
  masteringRecordPath,
  pathWithin,
  safeRelativePath,
  safeWorkspacePath,
  selfHashed,
} from "./frame-body-selected-candidate-mastering-common.mjs";
import {
  ensureMasteringDirectory,
  removeOwnedMasteringOutput,
  writeMasteringExactOrReuse,
  writeMasteringReceiptChain,
} from "./frame-body-selected-candidate-mastering-io.mjs";
import { compileHmfFrameBodySelectedCandidateMasteringPlanDocument } from "./frame-body-selected-candidate-mastering-plan.mjs";
import { validatedHmfFrameBodySelectedCandidateMasteringWorkspace } from "./frame-body-selected-candidate-mastering-workspace.mjs";

export async function materializeHmfFrameBodySelectedCandidateMaster(planInput) {
  const plan = selfHashed(
    planInput,
    "masteringPlanSha256",
    "selected-candidate mastering plan",
  );
  assert(
    plan.schema === HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PLAN_SCHEMA
      && plan.protocolVersion
        === HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PROTOCOL_VERSION,
    "selected-candidate mastering plan schema or protocol drifted.",
  );
  assert(
    plan.authority?.planCompilation === true
      && plan.authority?.selectedCandidateRead === true
      && plan.authority?.explicitWriteEnabledRuntimeRequired === true,
    "selected-candidate mastering plan lost its compilation, read or explicit-write boundary.",
  );
  assertForbiddenAuthorityFalse(plan.authority, "selected-candidate mastering plan");
  assert(
    plan.completedMasteringState === "mastered"
      && plan.nextLegalAction === "request-named-human-approval",
    "selected-candidate mastering lifecycle target drifted.",
  );

  const record = selfHashed(
    plan.masteringRecord,
    "masteringRecordSha256",
    "selected-candidate mastering record",
  );
  assert(
    record.schema === HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_RECORD_SCHEMA
      && record.protocolVersion
        === HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PROTOCOL_VERSION,
    "selected-candidate mastering record schema or protocol drifted.",
  );
  assertForbiddenAuthorityFalse(record.authority, "selected-candidate mastering record");
  assert(
    record.claims?.selectedCandidateReadRequired === true
      && record.claims?.workspaceMasterMustBeCreatedOrExactlyReused === true
      && record.claims?.exactCandidateBytesRequired === true
      && record.claims?.exactPostWriteReadbackRequired === true
      && record.claims?.namedHumanApprovalPerformed === false
      && record.claims?.gameRepositoryPromotionPerformed === false,
    "selected-candidate mastering record claims drifted.",
  );

  const receipt = selfHashed(plan.receipt, "receiptSha256", "mastered receipt");
  assert(
    receipt.state === "mastered"
      && receipt.outcome === null
      && receipt.actorClass === "system",
    "mastered receipt state, outcome or actor class drifted.",
  );
  assert(
    receipt.evidenceSha256 === record.masteringRecordSha256
      && receipt.candidateSha256 === plan.candidate.sha256
      && receipt.previousReceiptSha256
        === plan.selectionDecision.receipt.receiptSha256,
    "mastered receipt is not bound to its exact record, candidate and selected predecessor.",
  );
  assert(
    record.selectionDecisionSha256
      === plan.selectionDecision.selectionDecisionSha256
      && record.selectionReceiptSha256
        === plan.selectionDecision.receipt.receiptSha256
      && record.selectionEvidenceSha256
        === plan.selectionDecision.selectionEvidenceSha256,
    "mastering record selection lineage drifted.",
  );
  assert(
    record.candidate.sha256 === plan.candidate.sha256
      && record.candidate.bytes === plan.candidate.bytes
      && record.candidate.path === plan.candidate.path
      && record.master.sha256 === plan.candidate.sha256
      && record.master.bytes === plan.candidate.bytes
      && record.master.exactByteCopy === true,
    "mastering record candidate or master identity drifted.",
  );

  const reconstructed = await compileHmfFrameBodySelectedCandidateMasteringPlanDocument({
    selectionDecision: plan.selectionDecision,
    previousReceipts: plan.previousReceipts,
    workspaceRoot: plan.workspaceRoot,
    candidate: plan.candidate,
    masteringRequest: {
      actorId: record.executor.actorId,
      occurredAt: record.occurredAt,
      attestations: record.attestations,
    },
  });
  assert(
    reconstructed.masteringPlanSha256 === plan.masteringPlanSha256
      && canonical(reconstructed) === canonical(plan),
    "selected-candidate mastering plan does not recompile from its governed evidence.",
  );

  const inputs = await validatedHmfFrameBodySelectedCandidateMasteringWorkspace(
    plan.selectionDecision,
    receipt,
  );
  assert(
    inputs.policy.policySha256 === plan.policySha256
      && inputs.order.workOrderSha256 === plan.workOrderSha256,
    "selected-candidate mastering plan is stale against policy or work order.",
  );
  assert(
    inputs.candidate.sha256 === plan.candidate.sha256
      && inputs.candidate.size === plan.candidate.bytes,
    "selected candidate changed after mastering plan compilation.",
  );

  const masterTarget = safeRelativePath(
    plan.targets.masterFile,
    "selected-candidate master target",
  );
  const recordTarget = safeRelativePath(
    plan.targets.masteringRecord,
    "selected-candidate mastering-record target",
  );
  const receiptTarget = safeRelativePath(
    plan.targets.receiptChain,
    "selected-candidate mastering receipt-chain target",
  );
  assert(
    masterTarget === inputs.masterTarget
      && masterTarget === record.master.path
      && recordTarget === inputs.recordTarget
      && recordTarget === masteringRecordPath(inputs.order, plan.attempt)
      && receiptTarget === inputs.receiptTarget,
    "selected-candidate mastering targets drifted from the immutable work order.",
  );

  if (inputs.isCompleted) {
    assert(
      await safeWorkspacePath(inputs.root, masterTarget, "persisted selected-candidate master", { optional: true }),
      "mastered receipt exists without its exact workspace master.",
    );
    assert(
      await safeWorkspacePath(inputs.root, recordTarget, "persisted selected-candidate mastering record", { optional: true }),
      "mastered receipt exists without its exact mastering record.",
    );
  }

  const masterDirectory = await ensureMasteringDirectory(
    inputs.root,
    path.posix.dirname(masterTarget),
  );
  const recordDirectory = await ensureMasteringDirectory(
    inputs.root,
    path.posix.dirname(recordTarget),
  );
  const masterPath = path.resolve(inputs.root, ...masterTarget.split("/"));
  const recordPath = path.resolve(inputs.root, ...recordTarget.split("/"));
  assert(
    pathWithin(inputs.root, masterPath)
      && path.dirname(masterPath) === masterDirectory
      && pathWithin(inputs.root, recordPath)
      && path.dirname(recordPath) === recordDirectory,
    "selected-candidate mastering output escaped its governed workspace directories.",
  );
  const receiptPath = await safeWorkspacePath(
    inputs.root,
    receiptTarget,
    "selected-candidate mastering receipt chain",
  );

  const candidateBytes = inputs.candidate.bytes;
  assert(
    hashBytes(candidateBytes) === plan.candidate.sha256
      && candidateBytes.length === plan.candidate.bytes,
    "selected candidate bytes changed before exact-byte mastering.",
  );
  const recordBytes = Buffer.from(canonical(record), "utf8");
  const created = [];
  let receiptStatus = null;
  let masterStatus;
  let recordStatus;
  try {
    const masterWrite = await writeMasteringExactOrReuse(
      masterPath,
      candidateBytes,
      plan.candidate.sha256,
      "selected-candidate master",
    );
    masterStatus = masterWrite.status;
    if (masterWrite.status === "created") {
      created.push({ path: masterPath, identity: masterWrite.identity });
    }

    const recordWrite = await writeMasteringExactOrReuse(
      recordPath,
      recordBytes,
      hashBytes(recordBytes),
      "selected-candidate mastering record",
    );
    recordStatus = recordWrite.status;
    if (recordWrite.status === "created") {
      created.push({ path: recordPath, identity: recordWrite.identity });
    }

    const persisted = await writeMasteringReceiptChain(
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
      unitState?.currentState === "mastered"
        && unitState.currentOutcome === null
        && unitState.nextAction === plan.nextLegalAction,
      "selected-candidate mastering did not advance to the governed mastered state.",
    );
  } catch (error) {
    if (receiptStatus !== "advanced") {
      for (const output of [...created].reverse()) {
        await removeOwnedMasteringOutput(output.path, output.identity);
      }
    }
    throw error;
  }

  const alreadyMastered = masterStatus === "reused"
    && recordStatus === "reused"
    && receiptStatus === "reused";
  const body = {
    schema: HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_RESULT_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_SELECTED_CANDIDATE_MASTERING_PROTOCOL_VERSION,
    projectId: plan.projectId,
    unitId: plan.unitId,
    batchId: plan.batchId,
    frameId: plan.frameId,
    bodySlot: plan.bodySlot,
    attempt: plan.attempt,
    selectionDecisionSha256: plan.selectionDecision.selectionDecisionSha256,
    masteringPlanSha256: plan.masteringPlanSha256,
    masteringRecordSha256: record.masteringRecordSha256,
    masteredReceiptSha256: receipt.receiptSha256,
    candidateSha256: plan.candidate.sha256,
    masterSha256: plan.candidate.sha256,
    masterBytes: plan.candidate.bytes,
    status: alreadyMastered ? "already-mastered" : "mastered",
    materialization: freeze({
      masterFile: masterStatus,
      masteringRecord: recordStatus,
      receiptChain: receiptStatus,
    }),
    currentState: "mastered",
    nextLegalAction: plan.nextLegalAction,
    authority: freeze({
      selectedCandidateReadPerformed: true,
      workspaceMasterPresentAndVerified: true,
      workspaceMasterCreationPerformed: masterStatus === "created",
      masteringRecordPersistencePerformed: recordStatus === "created",
      receiptPersistencePerformed: receiptStatus === "advanced",
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
  };
  return freeze({ ...body, masteringResultSha256: hashValue(body) });
}
