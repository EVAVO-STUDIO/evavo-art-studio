import {
  HMF_CANDIDATE_ADMISSION_PROTOCOL_VERSION,
  HMF_CANDIDATE_ADMISSION_RECORD_SCHEMA,
} from "./frame-body-candidate-admission.mjs";
import { heavyMetalFightingFrameBodyRole } from "./frame-body-role-grammar.mjs";
import {
  buildHmfProductionWorkOrderBatch,
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  SHA256,
  assert,
  canonical,
  freeze,
  safeRelativePath,
  safeWorkspacePath,
  selfHashed,
  sidecarPath,
  stableWorkspaceFile,
  stableWorkspaceJson,
  workspaceRoot,
} from "./frame-body-deterministic-qa-common.mjs";

function validateAdmissionRecord(input) {
  const record = selfHashed(input, "admissionRecordSha256", "candidate admission record");
  assert(record.schema === HMF_CANDIDATE_ADMISSION_RECORD_SCHEMA && record.protocolVersion === HMF_CANDIDATE_ADMISSION_PROTOCOL_VERSION, "candidate admission record schema or protocol drifted.");
  assert(record.nextLegalAction === "run-deterministic-qa", "candidate admission record is not awaiting deterministic QA.");
  assert(record.receipt?.state === "candidates-admitted" && record.receipt?.candidateSha256 === record.candidateSha256, "candidate admission record receipt drifted from the admitted candidate.");
  assert(SHA256.test(String(record.candidateSha256 ?? "")) && Number.isInteger(record.candidateBytes) && record.candidateBytes >= 1, "candidate admission record lacks valid candidate byte evidence.");
  assert(record.authority?.deterministicQa === false && record.authority?.candidateApproval === false && record.authority?.candidatePromotion === false, "candidate admission record gained QA, approval or promotion authority.");
  for (const target of Object.values(record.targets ?? {})) safeRelativePath(target, "candidate admission target");
  return record;
}
function validateComparisonAdmissionRecord(input, current) {
  const record = selfHashed(input, "admissionRecordSha256", "comparison candidate admission record");
  assert(record.schema === HMF_CANDIDATE_ADMISSION_RECORD_SCHEMA && record.protocolVersion === HMF_CANDIDATE_ADMISSION_PROTOCOL_VERSION, "comparison admission record schema or protocol drifted.");
  assert(record.unitId !== current.unitId, "comparison admission record may not repeat the current unit.");
  assert(SHA256.test(String(record.candidateSha256 ?? "")), "comparison admission record lacks candidateSha256.");
  return record;
}
async function discoveredPeerAdmissions(root, order, currentRecord) {
  const bundle = await buildHmfProductionWorkOrderBatch(order.batchId);
  const peers = [];
  for (const peer of bundle.workOrders) {
    if (peer.unitId === order.unitId) continue;
    const candidatePath = peer.executionPaths.candidatePathTemplate.replace("{candidate:02}", "01");
    const admissionPath = sidecarPath(candidatePath, ".candidate-admission.json");
    const absolute = await safeWorkspacePath(root, admissionPath, `peer admission record ${peer.unitId}`, { optional: true });
    if (!absolute) continue;
    const file = await stableWorkspaceJson(root, admissionPath, `peer admission record ${peer.unitId}`);
    const record = validateComparisonAdmissionRecord(file.value, currentRecord);
    assert(record.unitId === peer.unitId && record.batchId === order.batchId && record.workOrderSha256 === peer.workOrderSha256, `peer admission record ${peer.unitId} drifted from its immutable work order.`);
    peers.push(record);
  }
  return freeze(peers);
}
function duplicateUnitIds(current, comparisons) {
  return freeze([...new Set(comparisons.filter((record) => record.candidateSha256 === current.candidateSha256).map((record) => record.unitId))].sort());
}
async function validatedPersistedInputs(admissionRecordInput, workspaceRootInput, policy) {
  const admissionRecord = validateAdmissionRecord(admissionRecordInput);
  const [order, root] = await Promise.all([
    heavyMetalFightingProductionWorkOrder(admissionRecord.unitId),
    workspaceRoot(workspaceRootInput),
  ]);
  assert(order.assetContract.kind === "frame-body-cel", `${order.unitId} is not a Frame body-cel work order.`);
  assert(order.workOrderSha256 === admissionRecord.workOrderSha256, "candidate admission record is stale against the immutable work order.");
  assert(order.batchId === admissionRecord.batchId && order.subjectId === admissionRecord.frameId, "candidate admission record identity drifted from the immutable work order.");
  assert(order.assetContract.nativeDimensions?.width === policy.candidate.width && order.assetContract.nativeDimensions?.height === policy.candidate.height, "deterministic QA policy dimensions drifted from the work order.");
  assert(order.assetContract.pivot?.x === policy.geometry.pivot.x && order.assetContract.pivot?.y === policy.geometry.pivot.y && order.assetContract.groundLineY === policy.geometry.groundLineY, "deterministic QA geometry policy drifted from the work order.");
  const allowedFailureCodes = new Set([...(order.failureCodes?.technical ?? []), ...(order.failureCodes?.style ?? [])]);
  for (const failureCode of policy.automatedFailureCodes) assert(allowedFailureCodes.has(failureCode), `deterministic QA failure code ${failureCode} is not governed by the work order.`);
  for (const failureCode of policy.deferredFailureCodes) assert(allowedFailureCodes.has(failureCode), `deferred failure code ${failureCode} is not governed by the work order.`);

  const persistedAdmission = await stableWorkspaceJson(root, admissionRecord.targets.admissionRecord, "persisted candidate admission record");
  assert(canonical(persistedAdmission.value) === canonical(admissionRecord), "persisted candidate admission record differs from the supplied record.");
  const candidate = await stableWorkspaceFile(root, admissionRecord.targets.candidate, "admitted candidate", policy.candidate.maximumBytes);
  assert(candidate.sha256 === admissionRecord.candidateSha256 && candidate.size === admissionRecord.candidateBytes, "admitted candidate bytes drifted from the candidate admission record.");
  const receiptFile = await stableWorkspaceJson(root, admissionRecord.targets.receiptChain, "persisted production receipt chain");
  assert(Array.isArray(receiptFile.value) && receiptFile.value.length >= 3, "persisted production receipt chain must be an array containing candidate admission.");
  assert(receiptFile.value.every((receipt) => receipt.unitId === order.unitId), "persisted receipt file contains another work unit.");
  const resume = await heavyMetalFightingProductionBatchResumePlan(order.batchId, receiptFile.value);
  const unitState = resume.unitStates.find((state) => state.unitId === order.unitId);
  assert(unitState?.currentState === "candidates-admitted" && unitState.currentAttempt === admissionRecord.attempt, `${order.unitId} must remain at candidates-admitted for this QA plan.`);
  assert(unitState.headReceiptSha256 === admissionRecord.receipt.receiptSha256, `${order.unitId} candidate-admission receipt head drifted.`);
  const role = await heavyMetalFightingFrameBodyRole(admissionRecord.frameId, admissionRecord.bodySlot);
  assert(role.frameId === admissionRecord.frameId && role.slot === admissionRecord.bodySlot, "Frame body role drifted from the candidate admission record.");
  return freeze({ admissionRecord, order, root, candidate, receipts: freeze(receiptFile.value), role });
}

export {
  discoveredPeerAdmissions,
  duplicateUnitIds,
  validateComparisonAdmissionRecord,
  validatedPersistedInputs,
};
