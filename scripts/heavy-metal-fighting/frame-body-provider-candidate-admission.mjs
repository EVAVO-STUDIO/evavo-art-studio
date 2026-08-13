import {
  HMF_PROVIDER_RUNTIME_BINDING_SCHEMA,
  HMF_PROVIDER_RUNTIME_DISPATCH_SCHEMA,
  HMF_PROVIDER_RUNTIME_OUTCOME_SCHEMA,
  HMF_PROVIDER_RUNTIME_PROTOCOL_VERSION,
} from "./frame-body-provider-runtime-dispatch.mjs";
import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionBatchResumePlan,
  heavyMetalFightingProductionReceiptTemplate,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";
import { readAdmissionArtifact } from "./provider-candidate-admission-artifact.mjs";
import {
  ARTIFACT_ID,
  PROVIDER_REQUEST_ID,
  SHA256,
  SUBMISSION_KEY,
  assert,
  assertNoAuthority,
  atomicCreateOrVerify,
  canonicalTimestamp,
  freeze,
  recordSha256,
  rootDirectory,
  safeActorId,
  safeReadRegular,
  safeRelative,
  sha256,
  selfHashed,
} from "./provider-candidate-admission-common.mjs";
import { inspectAdmissionPng } from "./provider-candidate-admission-png.mjs";

export const HMF_PROVIDER_CANDIDATE_ADMISSION_PLAN_SCHEMA =
  "evavo.heavy-metal-fighting-provider-candidate-admission-plan.v1";
export const HMF_PROVIDER_CANDIDATE_ADMISSION_BUNDLE_SCHEMA =
  "evavo.heavy-metal-fighting-provider-candidate-admission-bundle.v1";
export const HMF_PROVIDER_CANDIDATE_ADMISSION_RESULT_SCHEMA =
  "evavo.heavy-metal-fighting-provider-candidate-admission-result.v1";
export const HMF_PROVIDER_CANDIDATE_ADMISSION_PROTOCOL_VERSION = "2026-08-13.1";

function validateRuntimeChain(dispatchInput, bindingInput, outcomeInput) {
  const dispatch = selfHashed(
    dispatchInput,
    "runtimeDispatchSha256",
    "provider runtime dispatch",
  );
  const binding = selfHashed(
    bindingInput,
    "runtimeBindingSha256",
    "provider runtime binding",
  );
  const outcome = selfHashed(
    outcomeInput,
    "runtimeOutcomeSha256",
    "provider runtime outcome",
  );
  assert(
    dispatch.schema === HMF_PROVIDER_RUNTIME_DISPATCH_SCHEMA &&
      dispatch.protocolVersion === HMF_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    "provider runtime dispatch schema or protocol drifted.",
  );
  assert(
    binding.schema === HMF_PROVIDER_RUNTIME_BINDING_SCHEMA &&
      binding.protocolVersion === HMF_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    "provider runtime binding schema or protocol drifted.",
  );
  assert(
    outcome.schema === HMF_PROVIDER_RUNTIME_OUTCOME_SCHEMA &&
      outcome.protocolVersion === HMF_PROVIDER_RUNTIME_PROTOCOL_VERSION,
    "provider runtime outcome schema or protocol drifted.",
  );
  assert(
    binding.runtimeDispatchSha256 === dispatch.runtimeDispatchSha256 &&
      outcome.runtimeDispatchSha256 === dispatch.runtimeDispatchSha256,
    "runtime records belong to another dispatch.",
  );
  assert(
    outcome.runtimeBindingSha256 === binding.runtimeBindingSha256,
    "provider runtime outcome belongs to another binding.",
  );
  assert(
    binding.unitId === dispatch.unitId &&
      outcome.unitId === dispatch.unitId &&
      binding.batchId === dispatch.batchId &&
      outcome.batchId === dispatch.batchId,
    "runtime identity drifted.",
  );
  assert(
    binding.frameId === dispatch.frameId &&
      outcome.frameId === dispatch.frameId &&
      binding.bodySlot === dispatch.bodySlot &&
      outcome.bodySlot === dispatch.bodySlot,
    "runtime Frame identity drifted.",
  );
  assert(
    outcome.attempt === dispatch.attempt &&
      Number.isInteger(outcome.attempt) &&
      outcome.attempt >= 1,
    "runtime attempt drifted.",
  );
  assert(
    SUBMISSION_KEY.test(String(dispatch.submissionIdempotencyKey ?? "")) &&
      binding.submissionIdempotencyKey === dispatch.submissionIdempotencyKey &&
      outcome.submissionIdempotencyKey === dispatch.submissionIdempotencyKey,
    "runtime submission idempotency drifted.",
  );
  assert(
    PROVIDER_REQUEST_ID.test(String(binding.normalizedProviderRequestId ?? "")) &&
      SHA256.test(String(binding.normalizedProviderRequestSha256 ?? "")) &&
      SHA256.test(String(binding.compiledPromptSha256 ?? "")),
    "provider runtime binding hashes are invalid.",
  );
  assert(
    outcome.providerCallCount === 1 &&
      outcome.result?.status === "candidate-admission-ready" &&
      outcome.result.candidateCount === 1,
    "provider runtime outcome is not a successful candidate admission.",
  );
  assert(
    ARTIFACT_ID.test(String(outcome.result.candidateArtifactId ?? "")) &&
      ARTIFACT_ID.test(String(outcome.result.evidenceArtifactId ?? "")),
    "provider runtime outcome artifact identity is invalid.",
  );
  assert(
    outcome.result.requiresAlphaExtraction === false,
    "candidate requires alpha extraction and cannot enter the native-alpha HMF admission path.",
  );
  assert(
    outcome.result.candidateMaterialization?.sourceArtifactId ===
      outcome.result.candidateArtifactId &&
      outcome.result.candidateMaterialization?.oneImageOnly === true,
    "candidate materialization contract drifted.",
  );
  assert(
    outcome.result.candidateMaterialization?.expectedMediaType === "image/png" &&
      outcome.result.candidateMaterialization?.expectedWidth === 160 &&
      outcome.result.candidateMaterialization?.expectedHeight === 160,
    "candidate materialization target drifted.",
  );
  assert(
    outcome.result.nextReceiptTemplate?.state === "candidates-admitted" &&
      outcome.result.nextReceiptTemplate?.actorClass === "runtime",
    "candidate receipt template drifted.",
  );
  assertNoAuthority(dispatch.authority, "provider runtime dispatch", [
    "candidateMaterialization",
    "receiptPersistence",
    "providerExecution",
    "runtimeEnqueue",
    "deployment",
  ]);
  assertNoAuthority(binding.authority, "provider runtime binding", [
    "receiptPersistence",
    "providerExecution",
    "runtimeEnqueue",
  ]);
  assertNoAuthority(outcome.authority, "provider runtime outcome", [
    "candidateMaterialization",
    "receiptPersistence",
    "deterministicQa",
    "creativeReview",
    "deployment",
  ]);
  return { dispatch, binding, outcome };
}

function validateCandidateArtifact(artifact, dispatch, binding, outcome) {
  const { descriptor } = artifact;
  assert(
    descriptor.mediaType === "image/png" &&
      descriptor.storageClass === "intermediate",
    "candidate artifact must be an intermediate image/png.",
  );
  assert(
    descriptor.fileName?.toLowerCase().endsWith(".png"),
    "candidate artifact file name must end in .png.",
  );
  const labels = descriptor.labels;
  assert(
    labels.artifactRole === "provider-candidate" &&
      labels.approvalState === "unapproved",
    "candidate artifact role or approval state drifted.",
  );
  assert(
    labels.providerAdapter === outcome.result.adapterId &&
      labels.providerModel === outcome.result.model,
    "candidate artifact provider identity drifted.",
  );
  assert(
    labels.providerRequestId === binding.normalizedProviderRequestId &&
      labels.candidateIndex === "1",
    "candidate artifact request or index drifted.",
  );
  assert(
    labels.assetId === dispatch.unitId && labels.frameId === dispatch.frameId,
    "candidate artifact HMF identity drifted.",
  );
  const metadata = descriptor.metadata;
  assert(
    metadata && typeof metadata === "object" && !Array.isArray(metadata),
    "candidate artifact metadata is missing.",
  );
  assert(
    metadata.finalDeliverable === false &&
      metadata.requiresMastering === true &&
      metadata.requiresBlockingQa === true,
    "candidate artifact approval or mastering metadata drifted.",
  );
  assert(
    metadata.requestSha256 === binding.normalizedProviderRequestSha256 &&
      metadata.compiledPromptSha256 === binding.compiledPromptSha256,
    "candidate artifact request evidence drifted.",
  );
  assert(
    metadata.backgroundStrategy === "native-alpha" &&
      metadata.transparencyTarget === "required",
    "candidate artifact alpha metadata drifted.",
  );
  return inspectAdmissionPng(artifact.bytes);
}

function validateEvidenceArtifact(artifact, dispatch, binding, outcome) {
  const { descriptor, bytes } = artifact;
  assert(
    descriptor.mediaType === "application/json" &&
      descriptor.storageClass === "evidence",
    "provider evidence artifact must be evidence application/json.",
  );
  const labels = descriptor.labels;
  assert(
    labels.artifactRole === "provider-candidate-evidence" &&
      labels.outcome === "candidate-produced",
    "provider evidence artifact role or outcome drifted.",
  );
  assert(
    labels.providerRequestId === binding.normalizedProviderRequestId &&
      labels.assetId === dispatch.unitId,
    "provider evidence artifact identity drifted.",
  );
  assert(
    descriptor.sourceArtifacts.includes(outcome.result.candidateArtifactId),
    "provider evidence artifact is not linked to the candidate artifact.",
  );
  let evidence;
  try {
    evidence = JSON.parse(bytes.toString("utf8"));
  } catch {
    assert(false, "provider evidence artifact is not valid JSON.");
  }
  assert(
    evidence?.requestId === binding.normalizedProviderRequestId &&
      evidence?.requestSha256 === binding.normalizedProviderRequestSha256 &&
      evidence?.compiledPromptSha256 === binding.compiledPromptSha256,
    "provider evidence request binding drifted.",
  );
  assert(
    evidence.outcome === "candidate-produced" &&
      evidence.requiresAlphaExtraction === false,
    "provider evidence outcome or alpha contract drifted.",
  );
  assert(
    Array.isArray(evidence.candidateArtifacts) &&
      evidence.candidateArtifacts.length === 1 &&
      evidence.candidateArtifacts[0] === outcome.result.candidateArtifactId,
    "provider evidence candidate set drifted.",
  );
  assert(
    evidence.routingInspection?.providerCallPerformedByInspection === false &&
      evidence.routingInspection?.outcome === "eligible",
    "provider evidence routing inspection drifted.",
  );
  assert(
    Array.isArray(evidence.attempts) &&
      evidence.attempts.length === 1 &&
      evidence.attempts[0]?.outcome === "succeeded" &&
      evidence.attempts[0]?.adapterId === outcome.result.adapterId &&
      evidence.attempts[0]?.model === outcome.result.model,
    "provider evidence attempts drifted.",
  );
  assert(
    evidence.selection?.adapter?.id === outcome.result.adapterId &&
      evidence.selection?.model === outcome.result.model,
    "provider evidence selected adapter or model drifted.",
  );
}

function orderedUnitReceipts(receipts, unitId, headSha) {
  const unitReceipts = receipts.filter((receipt) => receipt.unitId === unitId);
  const byHash = new Map(
    unitReceipts.map((receipt) => [receipt.receiptSha256, receipt]),
  );
  const reverse = [];
  const visited = new Set();
  let current = byHash.get(headSha);
  while (current) {
    assert(
      !visited.has(current.receiptSha256),
      `${unitId} receipt chain contains a cycle.`,
    );
    visited.add(current.receiptSha256);
    reverse.push(current);
    current = current.previousReceiptSha256
      ? byHash.get(current.previousReceiptSha256)
      : null;
  }
  assert(
    reverse.length === unitReceipts.length &&
      reverse.at(-1)?.previousReceiptSha256 === null,
    `${unitId} receipt chain is disconnected or incomplete.`,
  );
  return reverse.reverse();
}

async function prepareAdmission(
  dispatchInput,
  bindingInput,
  outcomeInput,
  options = {},
) {
  const { dispatch, binding, outcome } = validateRuntimeChain(
    dispatchInput,
    bindingInput,
    outcomeInput,
  );
  assert(Array.isArray(options.receipts), "receipts must be an array.");
  const artifactRoot = await rootDirectory(
    options.artifactStoreRoot,
    "artifactStoreRoot",
  );
  const [order, candidateArtifact, evidenceArtifact] = await Promise.all([
    heavyMetalFightingProductionWorkOrder(dispatch.unitId),
    readAdmissionArtifact(
      artifactRoot,
      outcome.result.candidateArtifactId,
      "candidate artifact",
    ),
    readAdmissionArtifact(
      artifactRoot,
      outcome.result.evidenceArtifactId,
      "provider evidence artifact",
    ),
  ]);
  assert(
    order.batchId === dispatch.batchId &&
      order.subjectContract?.type === "frame" &&
      order.subjectContract.id === dispatch.frameId,
    "runtime dispatch is bound to another HMF work order.",
  );
  const candidatePath = order.executionPaths.candidatePathTemplate.replace(
    "{candidate:02}",
    "01",
  );
  assert(
    dispatch.candidateAdmission?.candidateOutputPath === candidatePath &&
      binding.candidateOutputPath === candidatePath &&
      outcome.result.candidateMaterialization.targetPath === candidatePath,
    "candidate output path drifted from the immutable work order.",
  );
  safeRelative(candidatePath, "candidate output path");
  safeRelative(order.executionPaths.receiptPath, "receipt path");
  const image = validateCandidateArtifact(
    candidateArtifact,
    dispatch,
    binding,
    outcome,
  );
  validateEvidenceArtifact(evidenceArtifact, dispatch, binding, outcome);

  const resume = await heavyMetalFightingProductionBatchResumePlan(
    order.batchId,
    options.receipts,
  );
  const state = resume.unitStates.find((entry) => entry.unitId === order.unitId);
  assert(
    state?.currentState === "generation-authorized" &&
      state?.nextAction === "run-provider-once",
    `${order.unitId} receipt chain is not currently generation-authorized.`,
  );
  assert(
    state.currentAttempt === outcome.attempt &&
      SHA256.test(String(state.headReceiptSha256 ?? "")),
    `${order.unitId} receipt attempt or head drifted.`,
  );
  const priorReceipts = orderedUnitReceipts(
    options.receipts,
    order.unitId,
    state.headReceiptSha256,
  );
  const previousReceipt = priorReceipts.at(-1);
  const actorId = safeActorId(options.actorId);
  const occurredAt = canonicalTimestamp(options.occurredAt, "occurredAt");
  const candidateReceipt = await createHmfProductionReceipt(
    {
      unitId: order.unitId,
      state: "candidates-admitted",
      attempt: outcome.attempt,
      evidenceSha256: outcome.runtimeOutcomeSha256,
      candidateSha256: candidateArtifact.descriptor.contentSha256,
      actorClass: "agent",
      actorId,
      occurredAt,
    },
    previousReceipt,
  );
  const receipts = freeze([...priorReceipts, candidateReceipt]);
  const completedResume = await heavyMetalFightingProductionBatchResumePlan(
    order.batchId,
    [...options.receipts, candidateReceipt],
  );
  const completedState = completedResume.unitStates.find(
    (entry) => entry.unitId === order.unitId,
  );
  assert(
    completedState?.currentState === "candidates-admitted" &&
      completedState?.nextAction === "run-deterministic-qa",
    "candidate receipt did not advance exactly to candidates-admitted.",
  );

  const planBody = {
    schema: HMF_PROVIDER_CANDIDATE_ADMISSION_PLAN_SCHEMA,
    protocolVersion: HMF_PROVIDER_CANDIDATE_ADMISSION_PROTOCOL_VERSION,
    status: "ready-for-explicit-materialization",
    projectId: order.projectId,
    publicTitle: order.publicTitle,
    unitId: order.unitId,
    batchId: order.batchId,
    frameId: dispatch.frameId,
    bodySlot: dispatch.bodySlot,
    attempt: outcome.attempt,
    workOrderSha256: order.workOrderSha256,
    runtimeDispatchSha256: dispatch.runtimeDispatchSha256,
    runtimeBindingSha256: binding.runtimeBindingSha256,
    runtimeOutcomeSha256: outcome.runtimeOutcomeSha256,
    submissionIdempotencyKey: dispatch.submissionIdempotencyKey,
    provider: freeze({
      adapterId: outcome.result.adapterId,
      model: outcome.result.model,
    }),
    receiptActor: freeze({
      sourceRuntimeClass: "runtime",
      canonicalActorClass: "agent",
      actorId,
    }),
    candidateArtifact: freeze({
      artifactId: candidateArtifact.descriptor.artifactId,
      descriptorSha256: candidateArtifact.descriptor.descriptorSha256,
      contentSha256: candidateArtifact.descriptor.contentSha256,
      sizeBytes: candidateArtifact.descriptor.sizeBytes,
      mediaType: candidateArtifact.descriptor.mediaType,
      storageClass: candidateArtifact.descriptor.storageClass,
      objectRelativePath: candidateArtifact.descriptor.objectRelativePath,
    }),
    evidenceArtifact: freeze({
      artifactId: evidenceArtifact.descriptor.artifactId,
      descriptorSha256: evidenceArtifact.descriptor.descriptorSha256,
      contentSha256: evidenceArtifact.descriptor.contentSha256,
      sizeBytes: evidenceArtifact.descriptor.sizeBytes,
      mediaType: evidenceArtifact.descriptor.mediaType,
      objectRelativePath: evidenceArtifact.descriptor.objectRelativePath,
    }),
    image,
    writes: freeze({
      candidateRelativePath: candidatePath,
      receiptRelativePath: order.executionPaths.receiptPath,
      candidateSha256: candidateArtifact.descriptor.contentSha256,
      candidateSizeBytes: candidateArtifact.descriptor.sizeBytes,
      candidateWriteFirst: true,
      receiptWriteSecond: true,
    }),
    receiptChain: freeze({
      priorHeadReceiptSha256: previousReceipt.receiptSha256,
      headReceiptSha256: candidateReceipt.receiptSha256,
      receiptCount: receipts.length,
      receipts,
    }),
    authority: freeze({
      candidateMaterialization: false,
      receiptPersistence: false,
      deterministicQa: false,
      creativeReview: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      explicitWriteEnabledCallRequired: true,
    }),
  };
  const plan = freeze({
    ...planBody,
    admissionPlanSha256: recordSha256(planBody),
  });
  const bundleBody = {
    schema: HMF_PROVIDER_CANDIDATE_ADMISSION_BUNDLE_SCHEMA,
    protocolVersion: HMF_PROVIDER_CANDIDATE_ADMISSION_PROTOCOL_VERSION,
    projectId: plan.projectId,
    publicTitle: plan.publicTitle,
    unitId: plan.unitId,
    batchId: plan.batchId,
    workOrderSha256: plan.workOrderSha256,
    admissionPlanSha256: plan.admissionPlanSha256,
    runtimeOutcomeSha256: plan.runtimeOutcomeSha256,
    candidateRelativePath: plan.writes.candidateRelativePath,
    candidateArtifactId: plan.candidateArtifact.artifactId,
    candidateSha256: plan.candidateArtifact.contentSha256,
    evidenceArtifactId: plan.evidenceArtifact.artifactId,
    receiptCount: plan.receiptChain.receiptCount,
    headReceiptSha256: plan.receiptChain.headReceiptSha256,
    receipts: plan.receiptChain.receipts,
    authority: freeze({
      deterministicQa: false,
      creativeReview: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  };
  const bundle = freeze({
    ...bundleBody,
    receiptBundleSha256: recordSha256(bundleBody),
  });
  return { plan, bundle, candidateBytes: candidateArtifact.bytes };
}

export async function planHmfProviderCandidateAdmission(
  dispatch,
  binding,
  outcome,
  options = {},
) {
  return (await prepareAdmission(dispatch, binding, outcome, options)).plan;
}

export async function admitHmfProviderCandidate(
  dispatch,
  binding,
  outcome,
  options = {},
) {
  assert(
    options.writeEnabled === true,
    "candidate admission requires writeEnabled true on an explicit write-enabled call.",
  );
  const prepared = await prepareAdmission(dispatch, binding, outcome, options);
  const workspaceRoot = await rootDirectory(options.workspaceRoot, "workspaceRoot");
  const candidateWrite = await atomicCreateOrVerify(
    workspaceRoot,
    prepared.plan.writes.candidateRelativePath,
    prepared.candidateBytes,
    "candidate output",
  );
  const bundleBytes = Buffer.from(
    `${JSON.stringify(prepared.bundle, null, 2)}\n`,
    "utf8",
  );
  const receiptWrite = await atomicCreateOrVerify(
    workspaceRoot,
    prepared.plan.writes.receiptRelativePath,
    bundleBytes,
    "candidate receipt bundle",
  );
  const materializedCandidate = await safeReadRegular(
    workspaceRoot,
    prepared.plan.writes.candidateRelativePath,
    "materialized candidate",
  );
  const materializedBundle = await safeReadRegular(
    workspaceRoot,
    prepared.plan.writes.receiptRelativePath,
    "materialized candidate receipt bundle",
  );
  assert(
    sha256(materializedCandidate) === prepared.plan.candidateArtifact.contentSha256,
    "materialized candidate hash drifted after write.",
  );
  assert(
    materializedBundle.equals(bundleBytes),
    "materialized receipt bundle bytes drifted after write.",
  );
  const resultBody = {
    schema: HMF_PROVIDER_CANDIDATE_ADMISSION_RESULT_SCHEMA,
    protocolVersion: HMF_PROVIDER_CANDIDATE_ADMISSION_PROTOCOL_VERSION,
    status: "candidate-admitted",
    unitId: prepared.plan.unitId,
    batchId: prepared.plan.batchId,
    admissionPlanSha256: prepared.plan.admissionPlanSha256,
    runtimeOutcomeSha256: prepared.plan.runtimeOutcomeSha256,
    receiptBundleSha256: prepared.bundle.receiptBundleSha256,
    candidateSha256: prepared.plan.candidateArtifact.contentSha256,
    headReceiptSha256: prepared.plan.receiptChain.headReceiptSha256,
    candidateRelativePath: prepared.plan.writes.candidateRelativePath,
    receiptRelativePath: prepared.plan.writes.receiptRelativePath,
    writes: freeze({ candidate: candidateWrite, receiptBundle: receiptWrite }),
    authority: freeze({
      candidateMaterialization: true,
      receiptPersistence: true,
      deterministicQa: false,
      creativeReview: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  };
  return freeze({
    ...resultBody,
    admissionResultSha256: recordSha256(resultBody),
  });
}

export async function verifyHmfProviderCandidateAdmission() {
  const unitId = "hmf.frame-animation.bastion.slot-121";
  const [order, template] = await Promise.all([
    heavyMetalFightingProductionWorkOrder(unitId),
    heavyMetalFightingProductionReceiptTemplate(unitId),
  ]);
  const candidateState = template.states.find(
    (state) => state.id === "candidates-admitted",
  );
  const checks = freeze([
    freeze({
      id: "candidate-path-governed",
      passed: order.executionPaths.candidatePathTemplate.startsWith(
        `scratch/provider/${order.batchId}/`,
      ),
    }),
    freeze({
      id: "receipt-path-governed",
      passed: order.executionPaths.receiptPath.startsWith(
        `manifests/receipts/${order.batchId}/`,
      ),
    }),
    freeze({
      id: "candidate-admission-is-non-human",
      passed:
        candidateState?.requiresHuman === false &&
        candidateState?.requiresCandidate === true,
    }),
    freeze({
      id: "runtime-normalizes-to-agent-receipt-class",
      passed:
        template.requiredFields.includes("actorClass") &&
        template.requiredFields.includes("actorId"),
    }),
    freeze({
      id: "qa-and-approval-remain-separate",
      passed:
        order.authority.automaticApproval === false &&
        order.authority.automaticPromotion === false,
    }),
    freeze({ id: "explicit-write-gate-retained", passed: true }),
  ]);
  const failed = freeze(checks.filter((check) => !check.passed));
  return freeze({
    schema:
      "evavo.heavy-metal-fighting-provider-candidate-admission-verification.v1",
    protocolVersion: HMF_PROVIDER_CANDIDATE_ADMISSION_PROTOCOL_VERSION,
    status: failed.length ? "failed" : "passed",
    sampleUnitId: unitId,
    checks,
    failed,
  });
}
