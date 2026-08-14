import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import {
  HMF_FRAME_BODY_DELIVERY_READINESS_PLAN_SCHEMA,
  HMF_FRAME_BODY_DELIVERY_READINESS_PROTOCOL_VERSION,
  HMF_FRAME_BODY_DELIVERY_READINESS_RECORD_SCHEMA,
  SHA256,
  assert,
  canonical,
  deliveryReadinessRecordPath,
  freeze,
  hashValue,
  loadDeliveryReadinessPolicy,
  safeRelativePath,
} from "./frame-body-delivery-readiness-common.mjs";
import {
  normalizeHmfFrameBodyDeliveryReadinessRequest,
  validateHmfFrameBodyNamedHumanApprovalPlanForReadiness,
} from "./frame-body-delivery-readiness-validation.mjs";
import {
  snapshotReadinessCompileRequest,
  snapshotReadinessDocumentRequest,
} from "./frame-body-delivery-readiness-snapshot.mjs";
import { validatedHmfFrameBodyDeliveryReadinessWorkspace } from "./frame-body-delivery-readiness-workspace.mjs";

function validateMasterDescriptor(master, approvalPlan, order, policy) {
  const masterPath = safeRelativePath(master.path, "delivery-readiness master path");
  assert(SHA256.test(String(master.sha256 ?? "")), "delivery-readiness master SHA-256 is invalid.");
  assert(
    Number.isInteger(master.bytes)
      && master.bytes >= 1
      && master.bytes <= policy.readinessRules.maximumMasterBytes,
    "delivery-readiness master byte count is invalid.",
  );
  assert(
    masterPath === order.assetContract.masterOutputPath
      && masterPath === approvalPlan.master.path,
    "delivery-readiness master path drifted from the immutable work order or approval.",
  );
  assert(
    master.sha256 === approvalPlan.master.sha256
      && master.sha256 === approvalPlan.approvalRecord.master.sha256
      && master.bytes === approvalPlan.master.bytes
      && master.bytes === approvalPlan.approvalRecord.master.bytes,
    "delivery-readiness master identity drifted from named-human approval.",
  );
  assert(
    !policy.readinessRules.masterPathMustLiveUnderMasters || masterPath.startsWith("masters/"),
    "delivery-readiness master path escaped masters/.",
  );
  return freeze({ path: masterPath, sha256: master.sha256, bytes: master.bytes });
}

function deliveryContract(order, master) {
  const contract = structuredClone(order.assetContract);
  assert(contract.kind === "frame-body-cel", "delivery-readiness asset kind drifted.");
  assert(contract.masterOutputPath === master.path, "delivery-readiness master output path drifted.");
  assert(
    contract.runtimeDelivery && typeof contract.runtimeDelivery === "object",
    "delivery-readiness requires the immutable runtime-delivery contract.",
  );
  return freeze(contract);
}

export async function compileHmfFrameBodyDeliveryReadinessPlanDocument(input = {}) {
  const captured = snapshotReadinessDocumentRequest(input);
  const { plan: approvalPlan } =
    await validateHmfFrameBodyNamedHumanApprovalPlanForReadiness(captured.approvalPlan);
  const [policy, order] = await Promise.all([
    loadDeliveryReadinessPolicy(),
    heavyMetalFightingProductionWorkOrder(approvalPlan.unitId),
  ]);
  assert(
    order.assetContract.kind === policy.assetKind
      && order.workOrderSha256 === approvalPlan.workOrderSha256,
    "delivery-readiness authority drifted from the approved work order.",
  );
  assert(Array.isArray(captured.previousReceipts), "previousReceipts must be an array.");
  const expectedReceipts = freeze([...approvalPlan.previousReceipts, approvalPlan.receipt]);
  assert(
    canonical(captured.previousReceipts) === canonical(expectedReceipts),
    "previousReceipts do not exactly represent the named-human-approved outcome.",
  );
  const resume = await heavyMetalFightingProductionBatchResumePlan(
    approvalPlan.batchId,
    captured.previousReceipts,
  );
  const state = resume.unitStates.find((entry) => entry.unitId === approvalPlan.unitId);
  assert(
    state?.currentState === policy.readinessRules.predecessorState
      && state.currentOutcome === null
      && state.nextAction === "compile-delivery-readiness",
    "previousReceipts are not ready for delivery-readiness compilation.",
  );
  assert(captured.workspaceRoot === approvalPlan.workspaceRoot, "delivery-readiness workspace root drifted from approval.");
  const master = validateMasterDescriptor(captured.master, approvalPlan, order, policy);
  const normalized = normalizeHmfFrameBodyDeliveryReadinessRequest(
    approvalPlan,
    captured.readinessRequest,
    policy,
  );
  const immutableDeliveryContract = deliveryContract(order, master);
  const recordBody = {
    schema: HMF_FRAME_BODY_DELIVERY_READINESS_RECORD_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_DELIVERY_READINESS_PROTOCOL_VERSION,
    projectId: approvalPlan.projectId,
    unitId: approvalPlan.unitId,
    batchId: approvalPlan.batchId,
    frameId: approvalPlan.frameId,
    bodySlot: approvalPlan.bodySlot,
    attempt: approvalPlan.attempt,
    workspaceRoot: captured.workspaceRoot,
    workOrderSha256: approvalPlan.workOrderSha256,
    policySha256: policy.policySha256,
    approvalPlanSha256: approvalPlan.approvalPlanSha256,
    approvalRecordSha256: approvalPlan.approvalRecord.approvalRecordSha256,
    namedHumanApprovedReceiptSha256: approvalPlan.receipt.receiptSha256,
    masteringPlanSha256: approvalPlan.masteringPlan.masteringPlanSha256,
    masteringRecordSha256: approvalPlan.masteringPlan.masteringRecord.masteringRecordSha256,
    masteredReceiptSha256: approvalPlan.masteringPlan.receipt.receiptSha256,
    selectionDecisionSha256: approvalPlan.masteringPlan.selectionDecision.selectionDecisionSha256,
    selectionReceiptSha256: approvalPlan.masteringPlan.selectionDecision.receipt.receiptSha256,
    candidateSha256: approvalPlan.masteringPlan.candidate.sha256,
    master,
    deliveryContract: immutableDeliveryContract,
    executor: freeze({ actorClass: normalized.actorClass, actorId: normalized.actorId }),
    attestations: normalized.attestations,
    occurredAt: normalized.occurredAt,
    claims: freeze({
      exactApprovedMasterRevalidated: true,
      exactMasterMatchesSelectedCandidate: true,
      namedHumanApprovalRevalidated: true,
      deliveryMetadataCompiled: true,
      deliveryPerformed: false,
      promotionPerformed: false,
      atlasCompilationPerformed: false,
    }),
    authority: freeze({
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
  const readinessRecord = freeze({
    ...recordBody,
    readinessRecordSha256: hashValue(recordBody),
  });
  const receipt = await createHmfProductionReceipt({
    unitId: approvalPlan.unitId,
    state: policy.readinessRules.receiptState,
    attempt: approvalPlan.attempt,
    evidenceSha256: readinessRecord.readinessRecordSha256,
    candidateSha256: master.sha256,
    actorClass: normalized.actorClass,
    actorId: normalized.actorId,
    occurredAt: normalized.occurredAt,
  }, approvalPlan.receipt);
  const body = {
    schema: HMF_FRAME_BODY_DELIVERY_READINESS_PLAN_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_DELIVERY_READINESS_PROTOCOL_VERSION,
    projectId: approvalPlan.projectId,
    unitId: approvalPlan.unitId,
    batchId: approvalPlan.batchId,
    frameId: approvalPlan.frameId,
    bodySlot: approvalPlan.bodySlot,
    attempt: approvalPlan.attempt,
    workspaceRoot: captured.workspaceRoot,
    workOrderSha256: approvalPlan.workOrderSha256,
    policySha256: policy.policySha256,
    approvalPlan,
    previousReceipts: freeze(captured.previousReceipts),
    master,
    readinessRecord,
    receipt,
    targets: freeze({
      readinessRecord: deliveryReadinessRecordPath(order, approvalPlan.attempt),
      receiptChain: order.executionPaths.receiptPath,
    }),
    completedReadinessState: "delivery-ready",
    nextLegalAction: policy.readinessRules.nextLegalAction,
    authority: freeze({
      planCompilation: true,
      masterRead: true,
      approvalRecordRead: true,
      masteringRecordRead: true,
      readinessRecordPersistence: false,
      receiptPersistence: false,
      explicitWriteEnabledRuntimeRequired: true,
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
  return freeze({ ...body, readinessPlanSha256: hashValue(body) });
}

export async function compileHmfFrameBodyDeliveryReadinessPlan(input = {}) {
  const captured = snapshotReadinessCompileRequest(input);
  const inputs = await validatedHmfFrameBodyDeliveryReadinessWorkspace(captured.approvalPlan);
  assert(captured.workspaceRoot === inputs.root, "delivery-readiness workspace root drifted from approval.");
  return compileHmfFrameBodyDeliveryReadinessPlanDocument({
    approvalPlan: inputs.approvalPlan,
    previousReceipts: inputs.predecessorReceipts,
    workspaceRoot: inputs.root,
    master: {
      path: inputs.approvalPlan.master.path,
      sha256: inputs.master.sha256,
      bytes: inputs.master.size,
    },
    readinessRequest: captured.readinessRequest,
  });
}
