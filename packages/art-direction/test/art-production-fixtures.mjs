import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  ART_PRODUCTION_ATTEMPT_KIND,
  ART_PRODUCTION_HUMAN_APPROVAL_REQUEST_KIND,
  ART_PRODUCTION_METRIC_IDS,
  applyLayeredProductionStyleProofApproval,
  compileArtProductionHumanApprovalReceipt,
  compileLayeredProductionPlan,
  compileLayeredProductionStyleProofApprovalReceipt,
} from "../dist/index.js";

const REQUEST_URL = new URL(
  "../../../config/jonez-layered-production-style-proof.v1.json",
  import.meta.url,
);
const PROFILE_URL = new URL(
  "../../../config/game-art-production/loops/jonez-1991-iterative-loop.v1.json",
  import.meta.url,
);
const REQUEST = JSON.parse(await readFile(REQUEST_URL, "utf8"));
const PROFILE = JSON.parse(await readFile(PROFILE_URL, "utf8"));

const digest = (value) =>
  createHash("sha256").update(String(value)).digest("hex");

function request() {
  return structuredClone(REQUEST);
}

function profile() {
  return structuredClone(PROFILE);
}

function approvalInput(plan) {
  return {
    schemaVersion: "1.0",
    kind: "evavo.layered-production.style-proof-approval.request",
    planId: plan.planId,
    pendingPlanSha256: plan.planSha256,
    styleFingerprintSha256: plan.styleFingerprintSha256,
    reviewer: "Greg Parker",
    reviewedAt: "2026-08-14T01:00:00.000Z",
    evidence: plan.styleProof.unitIds.map((unitId, index) => {
      const unit = plan.layers
        .flatMap((layer) => layer.units)
        .find((entry) => entry.id === unitId);
      assert.ok(unit);
      const sourceSha256 = digest(`source:${unitId}`);
      const sealedReviewReceiptSha256 = digest(`sealed:${unitId}`);
      const reviewBundleSha256 = digest(`bundle:${unitId}`);
      return {
        unitId,
        sourceArtifactId: `artifact_${sourceSha256}`,
        sourceSha256,
        sourceBytes: 2048 + index,
        width: unit.dimensions.width,
        height: unit.dimensions.height,
        providerJobIdempotencyKey: unit.providerJob.idempotencyKey,
        providerRequestSha256: digest(`provider:${unitId}`),
        sealedReviewArtifactId: `artifact_${sealedReviewReceiptSha256}`,
        sealedReviewReceiptSha256,
        reviewBundleArtifactId: `artifact_${reviewBundleSha256}`,
        reviewBundleSha256,
        decision: "approved",
      };
    }),
    crossUnitReview: {
      decision: "approved",
      styleFingerprintSha256: plan.styleFingerprintSha256,
      cameraConsistency: "approved",
      lightingConsistency: "approved",
      paletteConsistency: "approved",
      pixelGrammarConsistency: "approved",
      layerSeparation: "approved",
      antiGenericQuality: "approved",
      evidenceArtifactId: `artifact_${digest("cross-unit")}`,
      evidenceSha256: digest("cross-unit"),
    },
  };
}

function approvedPlan(input) {
  const pending = compileLayeredProductionPlan(input);
  const receipt = compileLayeredProductionStyleProofApprovalReceipt(
    pending,
    approvalInput(pending),
  );
  return applyLayeredProductionStyleProofApproval(pending, receipt);
}

function unit(plan, unitId) {
  const result = plan.layers
    .flatMap((layer) => layer.units)
    .find((entry) => entry.id === unitId);
  assert.ok(result, `missing unit ${unitId}`);
  return result;
}

function attempt(loop, plan, unitId, options = {}) {
  const state = loop.unitStates.find((entry) => entry.unitId === unitId);
  assert.ok(state, `missing state ${unitId}`);
  const source = unit(plan, unitId);
  const score = options.score ?? 100;
  const attemptNumber = state.attemptCount + 1;
  const candidateSha256 =
    options.candidateSha256 ?? digest(`${unitId}:${attemptNumber}:${score}`);
  const requiredMetrics =
    source.kind === "animation-frame"
      ? ART_PRODUCTION_METRIC_IDS
      : ART_PRODUCTION_METRIC_IDS.slice(0, 9);
  return {
    schemaVersion: "1.0",
    kind: ART_PRODUCTION_ATTEMPT_KIND,
    loopSha256: loop.loopSha256,
    unitId,
    evaluator: "EVAVO deterministic pixel-art critic",
    evaluatedAt: new Date(
      Date.UTC(2026, 7, 14, 1, state.sequence, attemptNumber),
    ).toISOString(),
    candidate: {
      artifactId: `artifact_${candidateSha256}`,
      sha256: candidateSha256,
      bytes: options.candidateBytes ?? 4096 + state.sequence,
      width: source.dimensions.width,
      height: source.dimensions.height,
      alphaPolicy: source.alpha,
    },
    metrics: requiredMetrics.map((metricId) => ({
      metricId,
      score,
      evidenceSha256: digest(`${unitId}:${attemptNumber}:${metricId}:${score}`),
    })),
    detections: (options.detections ?? []).map((detection) => ({
      detection,
      evidenceSha256: digest(`${unitId}:${attemptNumber}:${detection}`),
    })),
  };
}

function humanApprovalRequest(plan, loop, unitId, options = {}) {
  const state = loop.unitStates.find((entry) => entry.unitId === unitId);
  assert.ok(state?.acceptedCandidate, `missing accepted candidate ${unitId}`);
  const decisionEvidenceSha256 =
    options.decisionEvidenceSha256 ??
    digest(`human-approval-evidence:${loop.loopSha256}:${unitId}`);
  return {
    schemaVersion: "1.0",
    kind: ART_PRODUCTION_HUMAN_APPROVAL_REQUEST_KIND,
    planId: plan.planId,
    planSha256: plan.planSha256,
    loopSha256: loop.loopSha256,
    profileSha256: loop.profileSha256,
    unitId,
    sourceArtifactId: state.acceptedCandidate.artifactId,
    sourceSha256: state.acceptedCandidate.sha256,
    sourceBytes: state.acceptedCandidate.bytes,
    acceptedAttemptSha256: state.acceptedCandidate.attemptSha256,
    reviewer: options.reviewer ?? "Greg Parker",
    reviewedAt:
      options.reviewedAt ??
      new Date(Date.UTC(2026, 7, 14, 2, state.sequence, 0)).toISOString(),
    decision: "approved",
    decisionEvidenceArtifactId: `artifact_${decisionEvidenceSha256}`,
    decisionEvidenceSha256,
  };
}

function humanApprovals(plan, loop) {
  return loop.unitStates.map((state) =>
    compileArtProductionHumanApprovalReceipt(
      plan,
      loop,
      humanApprovalRequest(plan, loop, state.unitId),
    ),
  );
}

function canonicalSort(value) {
  if (Array.isArray(value)) return value.map(canonicalSort);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalSort(value[key])]),
  );
}

function canonicalSha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalSort(value)))
    .digest("hex");
}

export {
  assert,
  ART_PRODUCTION_ATTEMPT_KIND,
  ART_PRODUCTION_METRIC_IDS,
  request as productionRequest,
  profile,
  digest,
  canonicalSha256,
  approvedPlan,
  attempt,
  humanApprovalRequest,
  humanApprovals,
};
