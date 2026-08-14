import {
  exactKeys,
  fail,
  freeze,
  idValue,
  integerValue,
  numberValue,
  record,
  sha256,
  stringValue,
} from "./layered-production-internal.js";
import type { CompiledLayeredProductionPlan } from "./layered-production-types.js";
import {
  ART_PRODUCTION_HUMAN_APPROVAL_RECEIPT_KIND,
  ART_PRODUCTION_HUMAN_APPROVAL_REQUEST_KIND,
  ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
} from "./art-production-contract.js";
import type {
  ArtProductionHumanApprovalReceipt,
  ArtProductionHumanApprovalRequestInput,
} from "./art-production-human-approval-types.js";
import type { ArtProductionLoop } from "./art-production-loop-types.js";
import { verifyArtProductionLoop } from "./art-production-loop.js";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const ARTIFACT_ID_PATTERN = /^artifact_[0-9a-f]{64}$/u;
const MAXIMUM_SOURCE_BYTES = 256 * 1024 * 1024;

function sha256Value(value: unknown, label: string): string {
  const output = stringValue(value, label, 64);
  if (!SHA256_PATTERN.test(output)) {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_INVALID",
      `${label} must be lowercase SHA-256.`,
    );
  }
  return output;
}

function artifactIdValue(
  value: unknown,
  label: string,
  expectedSha256: string,
): string {
  const output = stringValue(value, label, 73);
  if (
    !ARTIFACT_ID_PATTERN.test(output) ||
    output !== `artifact_${expectedSha256}`
  ) {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_INVALID",
      `${label} must identify the exact declared SHA-256.`,
    );
  }
  return output;
}

function canonicalUtc(value: unknown, label: string): string {
  const output = stringValue(value, label, 64);
  const parsed = new Date(output);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== output) {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_INVALID",
      `${label} must be canonical UTC ISO-8601.`,
    );
  }
  return output;
}

function approvedValue(value: unknown, label: string): "approved" {
  if (value !== "approved") {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_INVALID",
      `${label} must equal approved.`,
    );
  }
  return "approved";
}

function approvalBasisSha256(
  receipt: Pick<
    ArtProductionHumanApprovalReceipt,
    | "planId"
    | "planSha256"
    | "loopSha256"
    | "profileSha256"
    | "unitId"
    | "sourceArtifactId"
    | "sourceSha256"
    | "sourceBytes"
    | "technicalReview"
    | "reviewer"
    | "reviewedAt"
    | "decision"
    | "decisionEvidenceArtifactId"
    | "decisionEvidenceSha256"
  >,
): string {
  return sha256({
    planId: receipt.planId,
    planSha256: receipt.planSha256,
    loopSha256: receipt.loopSha256,
    profileSha256: receipt.profileSha256,
    unitId: receipt.unitId,
    sourceArtifactId: receipt.sourceArtifactId,
    sourceSha256: receipt.sourceSha256,
    sourceBytes: receipt.sourceBytes,
    technicalReview: receipt.technicalReview,
    reviewer: receipt.reviewer,
    reviewedAt: receipt.reviewedAt,
    decision: receipt.decision,
    decisionEvidenceArtifactId: receipt.decisionEvidenceArtifactId,
    decisionEvidenceSha256: receipt.decisionEvidenceSha256,
  });
}

function requestFromReceipt(
  receipt: ArtProductionHumanApprovalReceipt,
): ArtProductionHumanApprovalRequestInput {
  return {
    schemaVersion: "1.0",
    kind: ART_PRODUCTION_HUMAN_APPROVAL_REQUEST_KIND,
    planId: receipt.planId,
    planSha256: receipt.planSha256,
    loopSha256: receipt.loopSha256,
    profileSha256: receipt.profileSha256,
    unitId: receipt.unitId,
    sourceArtifactId: receipt.sourceArtifactId,
    sourceSha256: receipt.sourceSha256,
    sourceBytes: receipt.sourceBytes,
    acceptedAttemptSha256: receipt.technicalReview.attemptSha256,
    reviewer: receipt.reviewer,
    reviewedAt: receipt.reviewedAt,
    decision: receipt.decision,
    decisionEvidenceArtifactId: receipt.decisionEvidenceArtifactId,
    decisionEvidenceSha256: receipt.decisionEvidenceSha256,
  };
}

function validateReceiptEnvelope(
  input: unknown,
): ArtProductionHumanApprovalReceipt {
  const value = record(input, "humanApprovalReceipt");
  exactKeys(value, "humanApprovalReceipt", [
    "schemaVersion",
    "kind",
    "protocolVersion",
    "planId",
    "planSha256",
    "loopSha256",
    "profileSha256",
    "unitId",
    "sourceArtifactId",
    "sourceSha256",
    "sourceBytes",
    "technicalReview",
    "reviewer",
    "reviewedAt",
    "decision",
    "decisionEvidenceArtifactId",
    "decisionEvidenceSha256",
    "requestSha256",
    "approvalBasisSha256",
    "authority",
    "approvalReceiptSha256",
  ]);
  const receipt = value as unknown as ArtProductionHumanApprovalReceipt;
  if (
    receipt.schemaVersion !== "1.0" ||
    receipt.kind !== ART_PRODUCTION_HUMAN_APPROVAL_RECEIPT_KIND ||
    receipt.protocolVersion !== ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION
  ) {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_RECEIPT_INVALID",
      "Human approval receipt protocol identity is invalid.",
    );
  }

  idValue(receipt.planId, "humanApprovalReceipt.planId");
  idValue(receipt.unitId, "humanApprovalReceipt.unitId");
  sha256Value(receipt.planSha256, "humanApprovalReceipt.planSha256");
  sha256Value(receipt.loopSha256, "humanApprovalReceipt.loopSha256");
  sha256Value(receipt.profileSha256, "humanApprovalReceipt.profileSha256");
  const sourceSha256 = sha256Value(
    receipt.sourceSha256,
    "humanApprovalReceipt.sourceSha256",
  );
  artifactIdValue(
    receipt.sourceArtifactId,
    "humanApprovalReceipt.sourceArtifactId",
    sourceSha256,
  );
  integerValue(
    receipt.sourceBytes,
    "humanApprovalReceipt.sourceBytes",
    1,
    MAXIMUM_SOURCE_BYTES,
  );

  const technicalReview = record(
    receipt.technicalReview,
    "humanApprovalReceipt.technicalReview",
  );
  exactKeys(technicalReview, "humanApprovalReceipt.technicalReview", [
    "attemptSha256",
    "weightedScore",
    "decision",
  ]);
  sha256Value(
    receipt.technicalReview.attemptSha256,
    "humanApprovalReceipt.technicalReview.attemptSha256",
  );
  numberValue(
    receipt.technicalReview.weightedScore,
    "humanApprovalReceipt.technicalReview.weightedScore",
    0,
    100,
  );
  if (receipt.technicalReview.decision !== "review-passed") {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_RECEIPT_INVALID",
      "Human approval receipt technical review must remain review-passed.",
    );
  }

  stringValue(receipt.reviewer, "humanApprovalReceipt.reviewer", 300);
  canonicalUtc(receipt.reviewedAt, "humanApprovalReceipt.reviewedAt");
  approvedValue(receipt.decision, "humanApprovalReceipt.decision");
  const evidenceSha256 = sha256Value(
    receipt.decisionEvidenceSha256,
    "humanApprovalReceipt.decisionEvidenceSha256",
  );
  artifactIdValue(
    receipt.decisionEvidenceArtifactId,
    "humanApprovalReceipt.decisionEvidenceArtifactId",
    evidenceSha256,
  );
  if (receipt.decisionEvidenceArtifactId === receipt.sourceArtifactId) {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_RECEIPT_INVALID",
      "Human decision evidence must be distinct from the approved source artifact.",
    );
  }

  sha256Value(receipt.requestSha256, "humanApprovalReceipt.requestSha256");
  sha256Value(
    receipt.approvalBasisSha256,
    "humanApprovalReceipt.approvalBasisSha256",
  );
  sha256Value(
    receipt.approvalReceiptSha256,
    "humanApprovalReceipt.approvalReceiptSha256",
  );

  const authority = record(
    receipt.authority,
    "humanApprovalReceipt.authority",
  );
  exactKeys(authority, "humanApprovalReceipt.authority", [
    "providerExecution",
    "imageMutation",
    "creativeDecision",
    "packagingExecution",
    "targetRepositoryMutation",
    "gitCommit",
    "gitPush",
    "publication",
    "forcePush",
  ]);
  if (Object.values(authority).some((entry) => entry !== false)) {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_RECEIPT_INVALID",
      "Human approval receipt authority must remain entirely false.",
    );
  }

  if (receipt.requestSha256 !== sha256(requestFromReceipt(receipt))) {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_RECEIPT_INVALID",
      "Human approval receipt requestSha256 does not match its normalized request.",
    );
  }
  if (receipt.approvalBasisSha256 !== approvalBasisSha256(receipt)) {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_RECEIPT_INVALID",
      "Human approval receipt approvalBasisSha256 does not match its governed basis.",
    );
  }
  const { approvalReceiptSha256, ...withoutReceiptSha256 } = receipt;
  if (sha256(withoutReceiptSha256) !== approvalReceiptSha256) {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_RECEIPT_INVALID",
      "Human approval receipt SHA-256 does not match its submitted payload.",
    );
  }
  return receipt;
}

function compileArtProductionHumanApprovalReceiptForVerifiedLoop(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  input: unknown,
): ArtProductionHumanApprovalReceipt {
  if (loop.scope !== "full-production") {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_INVALID",
      "Named-human approval receipts require a full-production loop.",
    );
  }

  const approval = record(input, "humanApproval");
  exactKeys(approval, "humanApproval", [
    "schemaVersion",
    "kind",
    "planId",
    "planSha256",
    "loopSha256",
    "profileSha256",
    "unitId",
    "sourceArtifactId",
    "sourceSha256",
    "sourceBytes",
    "acceptedAttemptSha256",
    "reviewer",
    "reviewedAt",
    "decision",
    "decisionEvidenceArtifactId",
    "decisionEvidenceSha256",
  ]);
  if (
    approval.schemaVersion !== "1.0" ||
    approval.kind !== ART_PRODUCTION_HUMAN_APPROVAL_REQUEST_KIND
  ) {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_INVALID",
      `Human approval request must use schema 1.0 and kind ${ART_PRODUCTION_HUMAN_APPROVAL_REQUEST_KIND}.`,
    );
  }

  const planId = idValue(approval.planId, "humanApproval.planId");
  const planSha256 = sha256Value(
    approval.planSha256,
    "humanApproval.planSha256",
  );
  const loopSha256 = sha256Value(
    approval.loopSha256,
    "humanApproval.loopSha256",
  );
  const profileSha256 = sha256Value(
    approval.profileSha256,
    "humanApproval.profileSha256",
  );
  if (
    planId !== plan.planId ||
    planSha256 !== plan.planSha256 ||
    loopSha256 !== loop.loopSha256 ||
    profileSha256 !== loop.profileSha256
  ) {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_INVALID",
      "Human approval request is not bound to the exact plan, loop and profile.",
    );
  }

  const unitId = idValue(approval.unitId, "humanApproval.unitId");
  const state = loop.unitStates.find((candidate) => candidate.unitId === unitId);
  if (!state?.acceptedCandidate || state.status !== "review-passed") {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_INVALID",
      `Human approval unit ${unitId} has no exact deterministic technical pass.`,
    );
  }

  const sourceSha256 = sha256Value(
    approval.sourceSha256,
    "humanApproval.sourceSha256",
  );
  const sourceArtifactId = artifactIdValue(
    approval.sourceArtifactId,
    "humanApproval.sourceArtifactId",
    sourceSha256,
  );
  const sourceBytes = integerValue(
    approval.sourceBytes,
    "humanApproval.sourceBytes",
    1,
    MAXIMUM_SOURCE_BYTES,
  );
  const acceptedAttemptSha256 = sha256Value(
    approval.acceptedAttemptSha256,
    "humanApproval.acceptedAttemptSha256",
  );
  if (
    sourceArtifactId !== state.acceptedCandidate.artifactId ||
    sourceSha256 !== state.acceptedCandidate.sha256 ||
    sourceBytes !== state.acceptedCandidate.bytes ||
    acceptedAttemptSha256 !== state.acceptedCandidate.attemptSha256
  ) {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_INVALID",
      `Human approval for ${unitId} is not bound to the exact review-passed source and attempt.`,
    );
  }

  const decisionEvidenceSha256 = sha256Value(
    approval.decisionEvidenceSha256,
    "humanApproval.decisionEvidenceSha256",
  );
  const decisionEvidenceArtifactId = artifactIdValue(
    approval.decisionEvidenceArtifactId,
    "humanApproval.decisionEvidenceArtifactId",
    decisionEvidenceSha256,
  );
  if (decisionEvidenceArtifactId === sourceArtifactId) {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_INVALID",
      "Human decision evidence must be distinct from the approved source artifact.",
    );
  }

  const normalizedRequest = freeze({
    schemaVersion: "1.0" as const,
    kind: ART_PRODUCTION_HUMAN_APPROVAL_REQUEST_KIND,
    planId,
    planSha256,
    loopSha256,
    profileSha256,
    unitId,
    sourceArtifactId,
    sourceSha256,
    sourceBytes,
    acceptedAttemptSha256,
    reviewer: stringValue(approval.reviewer, "humanApproval.reviewer", 300),
    reviewedAt: canonicalUtc(
      approval.reviewedAt,
      "humanApproval.reviewedAt",
    ),
    decision: approvedValue(approval.decision, "humanApproval.decision"),
    decisionEvidenceArtifactId,
    decisionEvidenceSha256,
  });
  const technicalReview = freeze({
    attemptSha256: state.acceptedCandidate.attemptSha256,
    weightedScore: state.acceptedCandidate.weightedScore,
    decision: "review-passed" as const,
  });
  const partial = {
    schemaVersion: "1.0" as const,
    kind: ART_PRODUCTION_HUMAN_APPROVAL_RECEIPT_KIND,
    protocolVersion: ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
    planId,
    planSha256,
    loopSha256,
    profileSha256,
    unitId,
    sourceArtifactId,
    sourceSha256,
    sourceBytes,
    technicalReview,
    reviewer: normalizedRequest.reviewer,
    reviewedAt: normalizedRequest.reviewedAt,
    decision: normalizedRequest.decision,
    decisionEvidenceArtifactId,
    decisionEvidenceSha256,
    requestSha256: sha256(normalizedRequest),
    approvalBasisSha256: approvalBasisSha256({
      planId,
      planSha256,
      loopSha256,
      profileSha256,
      unitId,
      sourceArtifactId,
      sourceSha256,
      sourceBytes,
      technicalReview,
      reviewer: normalizedRequest.reviewer,
      reviewedAt: normalizedRequest.reviewedAt,
      decision: normalizedRequest.decision,
      decisionEvidenceArtifactId,
      decisionEvidenceSha256,
    }),
    authority: freeze({
      providerExecution: false as const,
      imageMutation: false as const,
      creativeDecision: false as const,
      packagingExecution: false as const,
      targetRepositoryMutation: false as const,
      gitCommit: false as const,
      gitPush: false as const,
      publication: false as const,
      forcePush: false as const,
    }),
  };
  return freeze({
    ...partial,
    approvalReceiptSha256: sha256(partial),
  });
}

export function compileArtProductionHumanApprovalReceipt(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  input: unknown,
): ArtProductionHumanApprovalReceipt {
  verifyArtProductionLoop(plan, loop);
  return compileArtProductionHumanApprovalReceiptForVerifiedLoop(
    plan,
    loop,
    input,
  );
}

/**
 * Internal package seam for callers that have already semantically verified the
 * exact loop once. It is intentionally not re-exported from the public
 * orchestrator surface.
 */
export function verifyArtProductionHumanApprovalReceiptForVerifiedLoop(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  input: unknown,
): true {
  const receipt = validateReceiptEnvelope(input);
  const expected = compileArtProductionHumanApprovalReceiptForVerifiedLoop(
    plan,
    loop,
    requestFromReceipt(receipt),
  );
  if (expected.approvalReceiptSha256 !== receipt.approvalReceiptSha256) {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_RECEIPT_INVALID",
      "Human approval receipt is not the deterministic compilation of its exact plan, loop, candidate and named-human request.",
    );
  }
  return true;
}

export function verifyArtProductionHumanApprovalReceipt(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  input: unknown,
): true {
  verifyArtProductionLoop(plan, loop);
  return verifyArtProductionHumanApprovalReceiptForVerifiedLoop(
    plan,
    loop,
    input,
  );
}

export function verifyArtProductionHumanApprovalReceiptAgainstRequest(
  plan: CompiledLayeredProductionPlan,
  loop: ArtProductionLoop,
  request: unknown,
  receipt: unknown,
): true {
  verifyArtProductionLoop(plan, loop);
  verifyArtProductionHumanApprovalReceiptForVerifiedLoop(
    plan,
    loop,
    receipt,
  );
  const expected = compileArtProductionHumanApprovalReceiptForVerifiedLoop(
    plan,
    loop,
    request,
  );
  const submitted = validateReceiptEnvelope(receipt);
  if (expected.approvalReceiptSha256 !== submitted.approvalReceiptSha256) {
    fail(
      "ART_PRODUCTION_HUMAN_APPROVAL_RECEIPT_INVALID",
      "Human approval receipt does not belong to the exact supplied approval request.",
    );
  }
  return true;
}
