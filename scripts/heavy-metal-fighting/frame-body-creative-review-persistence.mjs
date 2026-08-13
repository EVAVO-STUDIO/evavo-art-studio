import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { heavyMetalFightingProductionBatchResumePlan } from "./work-orders.mjs";
import {
  HMF_FRAME_BODY_CREATIVE_REVIEW_DECISION_SCHEMA,
  HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION,
  HMF_FRAME_BODY_CREATIVE_REVIEW_RESULT_SCHEMA,
  HMF_FRAME_BODY_CREATIVE_REVIEW_SELECTION_TEMPLATE_SCHEMA,
  assert,
  assertForbiddenAuthorityFalse,
  canonical,
  creativeReviewPath,
  freeze,
  hashBytes,
  hashValue,
  loadPolicy,
  pathWithin,
  safeRelativePath,
  safeWorkspacePath,
  selfHashed,
} from "./frame-body-creative-review-common.mjs";
import { compileHmfFrameBodyCreativeReviewDecision } from "./frame-body-creative-review-decision.mjs";
import { validatedCreativeInputs } from "./frame-body-creative-review-packet.mjs";

async function ensureDirectory(root, relativeDirectory) {
  const safe = safeRelativePath(relativeDirectory, "workspace directory path");
  let current = root;
  for (const segment of safe.split("/")) {
    current = path.join(current, segment);
    const info = await lstat(current).catch(() => null);
    if (!info) {
      await mkdir(current, { mode: 0o700 });
      continue;
    }
    assert(info.isDirectory() && !info.isSymbolicLink(), `workspace directory component is not a real directory: ${current}`);
  }
  const resolved = await realpath(current);
  assert(pathWithin(root, resolved), `workspace directory escaped the persistent workspace: ${resolved}`);
  return resolved;
}
async function inspectExisting(filePath) {
  const info = await lstat(filePath).catch(() => null);
  if (!info) return null;
  assert(info.isFile() && !info.isSymbolicLink(), `existing output is not a regular non-symlink file: ${filePath}`);
  const bytes = await readFile(filePath);
  return freeze({ bytes, sha256: hashBytes(bytes), size: bytes.length });
}
async function writeExactOrReuse(filePath, bytes, expectedSha256) {
  const existing = await inspectExisting(filePath);
  if (existing) {
    assert(existing.sha256 === expectedSha256 && existing.size === bytes.length, `existing output conflicts with the governed creative review decision: ${filePath}`);
    return "reused";
  }
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
  try {
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return "created";
}
async function writeReceiptChain(filePath, previousReceipts, receipt) {
  const expectedPrevious = canonical(previousReceipts);
  const nextChain = freeze([...previousReceipts, receipt]);
  const expectedNext = canonical(nextChain);
  const existing = await inspectExisting(filePath);
  assert(existing, "persisted receipt chain disappeared before creative review materialization.");
  const text = existing.bytes.toString("utf8");
  if (text === expectedNext) return freeze({ status: "reused", chain: nextChain });
  assert(text === expectedPrevious, "persisted receipt chain differs from the validated deterministic-qa-passed predecessor chain.");
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await writeFile(temporary, expectedNext, { flag: "wx", mode: 0o600 });
  try {
    await rename(temporary, filePath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return freeze({ status: "advanced", chain: nextChain });
}

export async function materializeHmfFrameBodyCreativeReview(decisionInput) {
  const decision = selfHashed(decisionInput, "creativeReviewDecisionSha256", "creative review decision");
  assert(decision.schema === HMF_FRAME_BODY_CREATIVE_REVIEW_DECISION_SCHEMA && decision.protocolVersion === HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION, "creative review decision schema or protocol drifted.");
  assert(decision.authority?.decisionCompilation === true && decision.authority?.explicitWriteEnabledRuntimeRequired === true && decision.authority?.namedHumanReviewerRequired === true, "creative review decision lost the compilation, explicit-write or named-human boundary.");
  assertForbiddenAuthorityFalse(decision.authority, "creative review decision");
  assert(decision.completedReviewState === "creative-review-passed" && decision.nextLegalAction === "select-or-request-repair", "creative review decision lifecycle boundary drifted.");
  const packet = selfHashed(decision.reviewPacket, "reviewPacketSha256", "creative review packet");
  assert(packet.authority?.packetCompilation === true && packet.authority?.namedHumanReviewerRequired === true, "creative review packet lost its compilation or named-human boundary.");
  assertForbiddenAuthorityFalse(packet.authority, "creative review packet");
  assert(hashValue(decision.reviewEvidence) === decision.reviewEvidenceSha256, "creative review evidence hash drifted.");
  assert(decision.reviewEvidence.candidateAdmissionReceiptSha256 === packet.candidateAdmissionReceiptSha256, "creative review evidence candidate-admission receipt binding drifted.");
  assert(decision.receipt?.state === "creative-review-passed" && decision.receipt.evidenceSha256 === decision.reviewEvidenceSha256, "creative review receipt is not bound to its evidence.");
  assert(decision.receipt.actorClass === "human" && decision.receipt.actorId === decision.reviewEvidence.reviewer.actorId, "creative review receipt lost its named-human reviewer binding.");
  const selectionTemplate = selfHashed(decision.selectionDecisionTemplate, "selectionDecisionTemplateSha256", "selection decision template");
  assert(selectionTemplate.schema === HMF_FRAME_BODY_CREATIVE_REVIEW_SELECTION_TEMPLATE_SCHEMA && selectionTemplate.protocolVersion === HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION, "selection decision template schema or protocol drifted.");
  assert(selectionTemplate.authority?.recommendationOnly === true, "selection decision template must remain recommendation-only.");
  assertForbiddenAuthorityFalse(selectionTemplate.authority, "selection decision template", [
    "selection",
    "repairAuthorization",
    "receiptPersistence",
    "candidateMutation",
    "candidatePromotion",
    "targetRepositoryMutation",
    "gitMutation",
    "publication",
  ]);
  assert(selectionTemplate.creativeReviewReceiptSha256 === decision.receipt.receiptSha256 && selectionTemplate.reviewEvidenceSha256 === decision.reviewEvidenceSha256, "selection decision template is not bound to the creative review receipt and evidence.");
  const policy = await loadPolicy();
  assert(decision.policySha256 === policy.policySha256 && packet.policySha256 === policy.policySha256, "creative review decision is stale against the governed policy.");
  const reconstructed = await compileHmfFrameBodyCreativeReviewDecision({
    packet,
    assessment: {
      reviewerId: decision.reviewEvidence.reviewer.actorId,
      occurredAt: decision.reviewEvidence.occurredAt,
      completedReviewModeIds: decision.reviewEvidence.completedReviewModeIds,
      criterionResults: decision.reviewEvidence.criterionResults,
      summary: decision.reviewEvidence.summary,
      recommendedOutcome: decision.reviewEvidence.recommendedOutcome,
      attestations: decision.reviewEvidence.attestations,
    },
  });
  assert(reconstructed.creativeReviewDecisionSha256 === decision.creativeReviewDecisionSha256 && canonical(reconstructed) === canonical(decision), "creative review decision does not recompile from its governed evidence.");
  const inputs = await validatedCreativeInputs(packet.qaReport, packet.workspaceRoot, { completedReviewReceipt: decision.receipt });
  assert(inputs.root === packet.workspaceRoot, "creative review workspace root changed after packet compilation.");
  assert(inputs.order.workOrderSha256 === packet.workOrderSha256 && inputs.policy.policySha256 === packet.policySha256, "creative review packet is stale against current authority.");
  assert(inputs.candidate.sha256 === packet.candidate.sha256 && inputs.candidate.size === packet.candidate.bytes, "creative review candidate changed after packet compilation.");
  assert(inputs.admission.admissionRecordSha256 === packet.admissionRecordSha256 && inputs.admission.submissionManifestSha256 === packet.referenceManifestSha256, "creative review reference lineage changed after packet compilation.");
  const expectedCompletedReceipts = [...packet.previousReceipts, decision.receipt];
  assert(
    canonical(inputs.receipts) === canonical(packet.previousReceipts) || canonical(inputs.receipts) === canonical(expectedCompletedReceipts),
    "creative review predecessor receipts changed after packet compilation.",
  );
  const target = safeRelativePath(decision.target, "creative review decision target");
  assert(target === creativeReviewPath(inputs.order, packet.attempt), "creative review decision target drifted from the immutable work order.");
  const targetDirectory = await ensureDirectory(inputs.root, path.posix.dirname(target));
  const decisionPath = path.resolve(inputs.root, ...target.split("/"));
  assert(pathWithin(inputs.root, decisionPath) && path.dirname(decisionPath) === targetDirectory, "creative review decision escaped its governed review directory.");
  const receiptPath = await safeWorkspacePath(inputs.root, inputs.receiptTarget, "creative review receipt chain");
  const decisionBytes = Buffer.from(canonical(decision), "utf8");
  const decisionStatus = await writeExactOrReuse(decisionPath, decisionBytes, hashBytes(decisionBytes));
  const persisted = await writeReceiptChain(receiptPath, packet.previousReceipts, decision.receipt);
  const resume = await heavyMetalFightingProductionBatchResumePlan(packet.batchId, persisted.chain);
  const unitState = resume.unitStates.find((state) => state.unitId === packet.unitId);
  assert(unitState?.currentState === "creative-review-passed" && unitState.nextAction === "select-or-request-repair", "creative review did not advance to the separate selection boundary.");
  const body = {
    schema: HMF_FRAME_BODY_CREATIVE_REVIEW_RESULT_SCHEMA,
    protocolVersion: HMF_FRAME_BODY_CREATIVE_REVIEW_PROTOCOL_VERSION,
    projectId: packet.projectId,
    unitId: packet.unitId,
    batchId: packet.batchId,
    frameId: packet.frameId,
    bodySlot: packet.bodySlot,
    attempt: packet.attempt,
    reviewPacketSha256: packet.reviewPacketSha256,
    creativeReviewDecisionSha256: decision.creativeReviewDecisionSha256,
    reviewEvidenceSha256: decision.reviewEvidenceSha256,
    creativeReviewReceiptSha256: decision.receipt.receiptSha256,
    candidateSha256: packet.candidate.sha256,
    status: decisionStatus === "reused" && persisted.status === "reused" ? "already-review-recorded" : "review-recorded",
    materialization: freeze({ creativeReviewDecision: decisionStatus, receiptChain: persisted.status }),
    currentState: unitState.currentState,
    nextLegalAction: unitState.nextAction,
    recommendedOutcome: decision.recommendedOutcome,
    failureCodes: decision.reviewEvidence.failureCodes,
    selectionDecisionTemplateSha256: decision.selectionDecisionTemplate.selectionDecisionTemplateSha256,
    authority: freeze({
      providerExecution: false,
      providerRetry: false,
      candidateMutation: false,
      automaticCreativeApproval: false,
      selection: false,
      repairAuthorization: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
    }),
  };
  return freeze({ ...body, creativeReviewResultSha256: hashValue(body) });
}
