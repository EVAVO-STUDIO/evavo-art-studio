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
  validateHmfFrameBodyCompletedNamedHumanApprovalPlan,
} from "./frame-body-delivery-readiness-validation.mjs";
import {
  assertExactDeliveryReadinessKeys,
  snapshotDeliveryReadinessCompileRequest,
  snapshotDeliveryReadinessDocumentRequest,
} from "./frame-body-delivery-readiness-snapshot.mjs";
import { validatedHmfFrameBodyDeliveryReadinessWorkspace } from "./frame-body-delivery-readiness-workspace.mjs";

function validateMasterDescriptor(master, approval, order, policy) {
  assertExactDeliveryReadinessKeys(
    master,
    ["path", "sha256", "bytes"],
    "delivery-readiness master",
  );
  const masterPath = safeRelativePath(master.path, "delivery-readiness master path");
  assert(SHA256.test(String(master.sha256 ?? "")), "delivery-readiness master SHA-256 is invalid.");
  assert(
    Number.isInteger(master.bytes)
      && master.bytes >= 1
      && master.bytes <= policy.readinessRules.maximumMasterBytes,
    "delivery-readiness master byte count is outside the policy limit.",
  );
  assert(
    masterPath === order.assetContract.masterOutputPath
      && masterPath === approval.master.path
      && masterPath === approval.approvalRecord.master.path,
    "delivery-readiness master path drifted from the immutable work order and approval record.",
  );
  assert(
    master.sha256 === approval.master.sha256
      && master.sha256 === approval.approvalRecord.master.sha256
      && master.sha256 === approval.masteringPlan.candidate.sha256
      && master.bytes === approval.master.bytes
      && master.bytes === approval.approvalRecord.master.bytes
      && master.bytes === approval.masteringPlan.candidate.bytes,
    "delivery-readiness master identity drifted from the exact approved candidate.",
  );
  assert(
    !policy.readinessRules.masterPathMustLiveUnderMasters
      || masterPath.startsWith("masters/"),
    "delivery-readiness master path escaped masters/.",
  );
  return freeze({ path: masterPath, sha256: master.sha256, bytes: master.bytes });
}

function compileDeliveryDescriptor(order, approval, master) {
  return freeze({
    assetKind: order.assetContract.kind,
    masterPath: master.path,
    masterSha256: master.sha256,
    masterBytes: master.bytes,
    nativeDimensions: order.assetContract.nativeDimensions,
    authoringCanvas: order.assetContract.authoringCanvas,
    alpha: order.assetContract.alpha,
    pivot: order.assetContract.pivot,
    groundLineY: order.assetContract.groundLineY,
    continuityKey: order.assetContract.continuityKey,
    legacyTargetPath: order.assetContract.legacyTargetPath,
    runtimeDelivery: order.assetContract.runtimeDelivery,
    approvalRecordPath: approval.targets.approvalRecord,
    receiptChainPath: order.executionPaths.receiptPath,
    terminalWorkspaceState: "delivery-ready",
  });
}

export async function compileHmfFrameBodyDeliveryReadinessPlanDocument(input = {}) {
  const captured = snapshotDeliveryReadinessDocumentRequest(input);
  const {
    approvalPlan: approvalInput,
    previousReceipts,
    workspaceRoot,
    master: masterInput,
    readinessRequest,
  } = captured;
  const approval = await validateHmfFrameBodyCompletedNamedHumanApprovalPlan(
    approvalInput,
  );
  const [policy, order] = await Promise.all([
    loadDeliveryReadinessPolicy(),
    heavyMetalFightingProductionWorkOrder(approval.unitId),
  ]);
  assert(
    order.assetContract.kind === policy.assetKind
      && order.workOrderSha256 === approval.workOrderSha256,
    "delivery-readiness authority drifted from the approved work order.",
  );
  assert(Array.isArray(previousReceipts), "previousReceipts must be an array.");
  const completedApprovalReceipts = freeze([...approval.previousReceipts, approval.receipt]);
  assert(
    canonical(previousReceipts) === canonical(completedApprovalReceipts),
    "previousReceipts do not exactly represent the completed named-human approval.",
  );
  const resume = await heavyMetalFightingProductionBatchResumePlan(
    approval.batchId,
    previousReceipts,
  );
  const state = resume.unitStates.find((entry) => entry.unitId === approval.unitId);
  assert(
    state?.currentState === policy.readinessRules.predecessorState
      && state.currentOutcome === null
      && state.nextAction === "compile-delivery-readiness",
    "previousReceipts are not ready for delivery-readiness compilation.",
  );

  const master = validateMasterDescriptor(masterInput, approval, order, policy);
  const normalized = normalizeHmfFrameBodyDeliveryReadinessRequest(
    approval,
    readinessRequest,
    policy,
  );
  const deliveryDescriptor = compileDeliveryDescriptor(order, approval, master);
  const readinessRecordBody = {
    schema: HMF_FRAME_BODY_DELIVERY_READINESS_RECORD_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_DELIVERY_READINESS_PROTOCOL_VERSION,
    projectId: approval.projectId,
    unitId: approval.unitId,
    batchId: approval.batchId,
    frameId: approval.frameId,
    bodySlot: approval.bodySlot,
    attempt: approval.attempt,
    workspaceRoot,
    workOrderSha256: approval.workOrderSha256,
    policySha256: policy.policySha256,
    approvalPlanSha256: approval.approvalPlanSha256,
    approvalRecordSha256: approval.approvalRecord.approvalRecordSha256,
    approvedReceiptSha256: approval.receipt.receiptSha256,
    masteringPlanSha256: approval.masteringPlan.masteringPlanSha256,
    masteringRecordSha256: approval.masteringPlan.masteringRecord.masteringRecordSha256,
    selectionDecisionSha256:
      approval.masteringPlan.selectionDecision.selectionDecisionSha256,
    candidate: freeze({ ...approval.masteringPlan.candidate }),
    master,
    deliveryDescriptor,
    compiler: freeze({ actorClass: normalized.actorClass, actorId: normalized.actorId }),
    attestations: normalized.attestations,
    occurredAt: normalized.occurredAt,
    claims: freeze({
      exactApprovedMasterRevalidated: true,
      approvalLineageAccepted: true,
      terminalWorkspaceStateCompiled: true,
      finalAtlasCompiled: false,
      gameRepositoryPromotionPerformed: false,
      targetRepositoryMutationPerformed: false,
    }),
    authority: freeze({
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
  const readinessRecord = freeze({
    ...readinessRecordBody,
    readinessRecordSha256: hashValue(readinessRecordBody),
  });
  const receipt = await createHmfProductionReceipt({
    unitId: approval.unitId,
    state: policy.readinessRules.receiptState,
    attempt: approval.attempt,
    evidenceSha256: readinessRecord.readinessRecordSha256,
    candidateSha256: master.sha256,
    actorClass: normalized.actorClass,
    actorId: normalized.actorId,
    occurredAt: normalized.occurredAt,
  }, approval.receipt);
  const body = {
    schema: HMF_FRAME_BODY_DELIVERY_READINESS_PLAN_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_DELIVERY_READINESS_PROTOCOL_VERSION,
    projectId: approval.projectId,
    unitId: approval.unitId,
    batchId: approval.batchId,
    frameId: approval.frameId,
    bodySlot: approval.bodySlot,
    attempt: approval.attempt,
    workspaceRoot,
    workOrderSha256: approval.workOrderSha256,
    policySha256: policy.policySha256,
    approvalPlan: approval,
    previousReceipts: freeze(previousReceipts),
    master,
    readinessRecord,
    receipt,
    targets: freeze({
      readinessRecord: deliveryReadinessRecordPath(order, approval.attempt),
      receiptChain: order.executionPaths.receiptPath,
    }),
    completedReadinessState: "delivery-ready",
    nextLegalAction: policy.readinessRules.nextLegalAction,
    authority: freeze({
      planCompilation: true,
      masterRead: true,
      approvalRecordRead: true,
      deliveryReadinessRecordPersistence: false,
      receiptPersistence: false,
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
      explicitWriteEnabledRuntimeRequired: true,
    }),
  };
  return freeze({ ...body, readinessPlanSha256: hashValue(body) });
}

export async function compileHmfFrameBodyDeliveryReadinessPlan(input = {}) {
  const captured = snapshotDeliveryReadinessCompileRequest(input);
  const inputs = await validatedHmfFrameBodyDeliveryReadinessWorkspace(
    captured.approvalPlan,
  );
  const requestedRoot = captured.workspaceRoot ?? inputs.root;
  assert(
    requestedRoot === inputs.root,
    "delivery-readiness workspace root drifted from named-human approval.",
  );
  assert(
    inputs.master.sha256 === inputs.approval.master.sha256
      && inputs.master.size === inputs.approval.master.bytes,
    "persisted approved master changed before delivery-readiness plan compilation.",
  );
  return compileHmfFrameBodyDeliveryReadinessPlanDocument({
    approvalPlan: inputs.approval,
    previousReceipts: inputs.currentReceipts,
    workspaceRoot: inputs.root,
    master: {
      path: inputs.approval.master.path,
      sha256: inputs.master.sha256,
      bytes: inputs.master.size,
    },
    readinessRequest: captured.readinessRequest,
  });
}
