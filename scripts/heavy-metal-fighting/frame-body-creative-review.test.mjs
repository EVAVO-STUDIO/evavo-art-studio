import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import "./frame-body-creative-review-adversarial.tests.mjs";
import {
  compileHmfFrameBodyCreativeReviewDecision,
  compileHmfFrameBodyCreativeReviewPacket,
  materializeHmfFrameBodyCreativeReview,
  verifyHmfFrameBodyCreativeReview,
} from "./frame-body-creative-review.mjs";
import { heavyMetalFightingProductionBatchResumePlan } from "./work-orders.mjs";
import {
  UNIT_ID,
  assessmentFor,
  cleanup,
  creativeReviewTarget,
  fixture,
} from "./frame-body-creative-review.test-support.mjs";

test("creative review verification binds the complete named-human boundary", async () => {
  const verification = await verifyHmfFrameBodyCreativeReview();
  assert.equal(verification.status, "passed");
  assert.equal(verification.reviewModeCount, 6);
  assert.equal(verification.criterionCount, 8);
  assert.ok(verification.checks.every((entry) => entry.passed));
  assert.equal(verification.authority.selection, false);
});

test("creative review packet binds the exact QA-passed candidate, reference lineage and role", async () => {
  const value = await fixture();
  try {
    const packet = await compileHmfFrameBodyCreativeReviewPacket({ qaReport: value.qaReport, workspaceRoot: value.root });
    assert.equal(packet.candidate.sha256, value.candidateSha256);
    assert.equal(packet.qaReportSha256, value.qaReport.qaReportSha256);
    assert.equal(packet.predecessorReceiptSha256, value.receipts.at(-1).receiptSha256);
    assert.equal(packet.referenceManifestSha256, value.admissionRecord.submissionManifestSha256);
    assert.equal(packet.reviewContext.semanticId, "standing-heavy:hero-impact");
    assert.equal(packet.target, creativeReviewTarget(value.order));
    assert.equal(packet.authority.selection, false);
  } finally {
    await cleanup(value);
  }
});

test("complete passing review compiles a human receipt but only recommends selection", async () => {
  const value = await fixture();
  try {
    const packet = await compileHmfFrameBodyCreativeReviewPacket({ qaReport: value.qaReport, workspaceRoot: value.root });
    const decision = await compileHmfFrameBodyCreativeReviewDecision({ packet, assessment: assessmentFor(packet) });
    assert.equal(decision.receipt.state, "creative-review-passed");
    assert.equal(decision.receipt.actorClass, "human");
    assert.equal(decision.receipt.actorId, "greg-parker");
    assert.equal(decision.recommendedOutcome, "selected");
    assert.equal(decision.reviewEvidence.failureCodes.length, 0);
    assert.equal(decision.selectionDecisionTemplate.authority.selection, false);
    assert.equal(decision.authority.automaticCreativeApproval, false);
  } finally {
    await cleanup(value);
  }
});

test("complete defect review records findings and recommends repair without authorizing it", async () => {
  const value = await fixture();
  try {
    const packet = await compileHmfFrameBodyCreativeReviewPacket({ qaReport: value.qaReport, workspaceRoot: value.root });
    const failedId = packet.criteria[0].id;
    const decision = await compileHmfFrameBodyCreativeReviewDecision({ packet, assessment: assessmentFor(packet, { failedCriterionId: failedId }) });
    assert.equal(decision.receipt.state, "creative-review-passed");
    assert.equal(decision.recommendedOutcome, "repair-requested");
    assert.equal(decision.reviewEvidence.failedCriteria.length, 1);
    assert.deepEqual(decision.reviewEvidence.failureCodes, [packet.criteria[0].failureCodes[0]]);
    assert.equal(decision.selectionDecisionTemplate.requiredActorClass, "human");
    assert.equal(decision.selectionDecisionTemplate.authority.repairAuthorization, false);
  } finally {
    await cleanup(value);
  }
});

test("write-enabled creative review persists evidence, advances once and is idempotent", async () => {
  const value = await fixture();
  try {
    const packet = await compileHmfFrameBodyCreativeReviewPacket({ qaReport: value.qaReport, workspaceRoot: value.root });
    const decision = await compileHmfFrameBodyCreativeReviewDecision({ packet, assessment: assessmentFor(packet) });
    const first = await materializeHmfFrameBodyCreativeReview(decision);
    assert.equal(first.status, "review-recorded");
    assert.equal(first.currentState, "creative-review-passed");
    assert.equal(first.nextLegalAction, "select-or-request-repair");
    assert.equal(first.recommendedOutcome, "selected");
    const decisionFile = JSON.parse(await readFile(path.join(value.root, ...decision.target.split("/")), "utf8"));
    assert.equal(decisionFile.creativeReviewDecisionSha256, decision.creativeReviewDecisionSha256);
    const receipts = JSON.parse(await readFile(path.join(value.root, ...value.receiptPath.split("/")), "utf8"));
    assert.equal(receipts.length, 5);
    assert.equal(receipts.at(-1).state, "creative-review-passed");
    const resume = await heavyMetalFightingProductionBatchResumePlan(value.order.batchId, receipts);
    assert.equal(resume.unitStates.find((entry) => entry.unitId === UNIT_ID).nextAction, "select-or-request-repair");
    const second = await materializeHmfFrameBodyCreativeReview(decision);
    assert.equal(second.status, "already-review-recorded");
    assert.equal(second.creativeReviewDecisionSha256, first.creativeReviewDecisionSha256);
  } finally {
    await cleanup(value);
  }
});
