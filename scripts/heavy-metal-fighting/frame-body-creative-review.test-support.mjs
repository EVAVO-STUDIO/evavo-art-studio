import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createHmfProductionReceipt,
  heavyMetalFightingProductionWorkOrder,
} from "./work-orders.mjs";

export const UNIT_ID = "hmf.frame-animation.bastion.slot-121";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  return value;
}
export function canonical(value) {
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}
export function hashValue(value) {
  return sha256(Buffer.from(canonical(value), "utf8"));
}
function selfHash(body, field) {
  return Object.freeze({ ...body, [field]: hashValue(body) });
}
function rehash(value, field) {
  const body = structuredClone(value);
  delete body[field];
  return { ...body, [field]: hashValue(body) };
}
async function ensureParent(root, relative) {
  await mkdir(path.dirname(path.join(root, ...relative.split("/"))), { recursive: true });
}
export function creativeReviewTarget(order, attempt = 1) {
  const base = order.executionPaths.reviewEvidencePath;
  return `${base.slice(0, -5)}-attempt-${String(attempt).padStart(2, "0")}-creative-review.json`;
}
function qaReportTarget(order, attempt = 1) {
  const base = order.executionPaths.reviewEvidencePath;
  return `${base.slice(0, -5)}-attempt-${String(attempt).padStart(2, "0")}-deterministic-qa.json`;
}

export async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "hmf-frame-body-creative-review-"));
  const order = await heavyMetalFightingProductionWorkOrder(UNIT_ID);
  const candidate = Buffer.from("governed-creative-review-candidate-bytes", "utf8");
  const candidateSha256 = sha256(candidate);
  const referencesLocked = await createHmfProductionReceipt({
    unitId: UNIT_ID,
    state: "references-locked",
    attempt: 1,
    evidenceSha256: sha256(Buffer.from("creative-review-references")),
    actorClass: "agent",
    actorId: "creative-review-fixture-agent",
    occurredAt: "2026-08-13T08:00:00.000Z",
  });
  const generationAuthorized = await createHmfProductionReceipt({
    unitId: UNIT_ID,
    state: "generation-authorized",
    attempt: 1,
    evidenceSha256: sha256(Buffer.from("creative-review-generation")),
    actorClass: "human",
    actorId: "named-generation-authorizer",
    occurredAt: "2026-08-13T08:01:00.000Z",
  }, referencesLocked);
  const candidatesAdmitted = await createHmfProductionReceipt({
    unitId: UNIT_ID,
    state: "candidates-admitted",
    attempt: 1,
    evidenceSha256: sha256(Buffer.from("creative-review-admission")),
    candidateSha256,
    actorClass: "system",
    actorId: "hmf-provider-runtime",
    occurredAt: "2026-08-13T08:02:00.000Z",
  }, generationAuthorized);
  const candidatePath = order.executionPaths.candidatePathTemplate.replace("{candidate:02}", "01");
  const admissionPath = `${candidatePath.slice(0, -4)}.candidate-admission.json`;
  const receiptPath = order.executionPaths.receiptPath;
  const admissionBody = {
    schema: "evavo.heavy-metal-fighting-candidate-admission-record.v1",
    protocolVersion: "2026-08-13.1",
    projectId: order.projectId,
    publicTitle: order.publicTitle,
    unitId: order.unitId,
    batchId: order.batchId,
    frameId: order.subjectId,
    bodySlot: 121,
    attempt: 1,
    workOrderSha256: order.workOrderSha256,
    submissionManifestSha256: "1".repeat(64),
    runtimeDispatchSha256: "3".repeat(64),
    runtimeBindingSha256: "4".repeat(64),
    runtimeOutcomeSha256: "5".repeat(64),
    submissionIdempotencyKey: "hmf-creative-review-fixture",
    adapterId: "fixture-adapter",
    model: "fixture-model",
    candidateArtifactId: `artifact_${candidateSha256}`,
    candidateSha256,
    candidateBytes: candidate.length,
    providerEvidenceArtifactId: `artifact_${"6".repeat(64)}`,
    providerEvidenceSha256: "6".repeat(64),
    providerEvidenceBytes: 128,
    png: { width: 160, height: 160, bitDepth: 8, colorType: 6, compression: 0, filter: 0, interlace: 0 },
    targets: {
      candidate: candidatePath,
      providerEvidence: `${candidatePath.slice(0, -4)}.provider-evidence.json`,
      admissionRecord: admissionPath,
      receiptChain: receiptPath
    },
    runtimeActorMapping: { providerOutcomeActorClass: "runtime", productionReceiptActorClass: "system" },
    receipt: candidatesAdmitted,
    occurredAt: "2026-08-13T08:02:00.000Z",
    nextLegalAction: "run-deterministic-qa",
    authority: {
      workspaceCandidateWrite: true,
      workspaceEvidenceWrite: true,
      receiptPersistence: true,
      deterministicQa: false,
      creativeReview: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false
    }
  };
  const admissionRecord = selfHash(admissionBody, "admissionRecordSha256");
  const qaPolicySha256 = "2".repeat(64);
  const qaEvidenceBody = {
    schema: "evavo.heavy-metal-fighting-frame-body-deterministic-qa-evidence.v1",
    protocolVersion: "2026-08-13.1",
    projectId: order.projectId,
    unitId: order.unitId,
    batchId: order.batchId,
    frameId: order.subjectId,
    bodySlot: 121,
    attempt: 1,
    workOrderSha256: order.workOrderSha256,
    admissionRecordSha256: admissionRecord.admissionRecordSha256,
    candidateAdmissionReceiptSha256: candidatesAdmitted.receiptSha256,
    candidateSha256,
    candidateBytes: candidate.length,
    policySha256: qaPolicySha256,
    role: {
      frameId: "bastion",
      slot: 121,
      bankId: "standing-heavy",
      roleId: "hero-impact",
      semanticId: "standing-heavy:hero-impact",
      phase: "active",
      hero: true,
      contactRole: true,
      holdPriority: "hero"
    },
    failureCodes: [],
    status: "passed",
    occurredAt: "2026-08-13T08:03:00.000Z"
  };
  const qaEvidenceSha256 = hashValue(qaEvidenceBody);
  const deterministicQaPassed = await createHmfProductionReceipt({
    unitId: UNIT_ID,
    state: "deterministic-qa-passed",
    attempt: 1,
    evidenceSha256: qaEvidenceSha256,
    candidateSha256,
    actorClass: "system",
    actorId: "hmf-frame-body-deterministic-qa",
    occurredAt: "2026-08-13T08:03:00.000Z",
  }, candidatesAdmitted);
  const receipts = [referencesLocked, generationAuthorized, candidatesAdmitted, deterministicQaPassed];
  const reportPath = qaReportTarget(order);
  const qaReportBody = {
    schema: "evavo.heavy-metal-fighting-frame-body-deterministic-qa-report.v1",
    protocolVersion: "2026-08-13.1",
    projectId: order.projectId,
    publicTitle: order.publicTitle,
    unitId: order.unitId,
    batchId: order.batchId,
    frameId: order.subjectId,
    bodySlot: 121,
    attempt: 1,
    workOrderSha256: order.workOrderSha256,
    admissionRecordSha256: admissionRecord.admissionRecordSha256,
    candidateAdmissionReceiptSha256: candidatesAdmitted.receiptSha256,
    candidateSha256,
    policySha256: qaPolicySha256,
    qaEvidence: qaEvidenceBody,
    qaEvidenceSha256,
    status: "passed",
    receipt: deterministicQaPassed,
    boundedRepairTemplate: null,
    productionReceiptStateAfterMaterialization: "deterministic-qa-passed",
    operatorNextAction: "run-creative-review",
    targets: {
      candidate: candidatePath,
      admissionRecord: admissionPath,
      qaReport: reportPath,
      receiptChain: receiptPath
    },
    authority: {
      deterministicQa: true,
      reportPersistence: false,
      receiptPersistence: false,
      providerExecution: false,
      providerRetry: false,
      creativeReview: false,
      repairAuthorization: false,
      candidateApproval: false,
      candidatePromotion: false,
      targetRepositoryMutation: false,
      gitMutation: false,
      deployment: false,
      publication: false,
      namedHumanRepairAuthorizationRequired: true
    }
  };
  const qaReport = selfHash(qaReportBody, "qaReportSha256");
  for (const relative of [candidatePath, admissionPath, reportPath, receiptPath]) await ensureParent(root, relative);
  await writeFile(path.join(root, ...candidatePath.split("/")), candidate);
  await writeFile(path.join(root, ...admissionPath.split("/")), canonical(admissionRecord));
  await writeFile(path.join(root, ...reportPath.split("/")), canonical(qaReport));
  await writeFile(path.join(root, ...receiptPath.split("/")), canonical(receipts));
  return {
    root,
    order,
    candidate,
    candidateSha256,
    candidatePath,
    admissionPath,
    reportPath,
    receiptPath,
    admissionRecord,
    qaReport,
    receipts,
  };
}
export async function cleanup(value) {
  await rm(value.root, { recursive: true, force: true });
}
export function assessmentFor(packet, { failedCriterionId = null } = {}) {
  const criterionResults = packet.criteria.map((criterion) => {
    const failed = criterion.id === failedCriterionId;
    return {
      id: criterion.id,
      status: failed ? "fail" : "pass",
      observation: failed
        ? `The governed ${criterion.label.toLowerCase()} check found a bounded defect in this exact candidate.`
        : `The exact candidate satisfies the governed ${criterion.label.toLowerCase()} requirement.`,
      failureCodes: failed ? [criterion.failureCodes[0]] : []
    };
  });
  const recommendedOutcome = failedCriterionId ? "repair-requested" : "selected";
  return {
    reviewerId: "greg-parker",
    occurredAt: "2026-08-13T08:04:00.000Z",
    completedReviewModeIds: packet.reviewModes.map((mode) => mode.id),
    criterionResults,
    summary: failedCriterionId
      ? "The creative review is complete and records one bounded defect. Repair is recommended, but no repair has been authorized."
      : "The creative review is complete. Every governed criterion passes and selection is recommended, but selection remains a separate human decision.",
    recommendedOutcome,
    attestations: {
      candidateSha256: packet.candidate.sha256,
      qaReportSha256: packet.qaReportSha256,
      referenceManifestSha256: packet.referenceManifestSha256,
      independentNamedHumanReview: true,
      noSelectionRepairAuthorizationOrPromotionPerformed: true
    }
  };
}
