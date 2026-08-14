import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtDirectionError,
  compileArtProductionHumanApprovalReceipt,
  compileArtProductionLoop,
  compileArtProductionPackagingPlan,
  compileNextArtProductionBatch,
  evaluateArtProductionAttempt,
  verifyArtProductionHumanApprovalReceipt,
  verifyArtProductionHumanApprovalReceiptAgainstRequest,
} from "../dist/index.js";
import {
  attempt,
  approvedPlan,
  canonicalSha256,
  digest,
  humanApprovalRequest,
  humanApprovals,
  productionRequest,
  profile,
} from "./art-production-fixtures.mjs";

function reviewedFixture(score = 100) {
  const complete = productionRequest();
  for (const source of complete.layers.flatMap((layer) => layer.units)) {
    if (source.frame) source.frame.frameCount = 1;
  }
  const plan = approvedPlan(complete);
  let loop = compileArtProductionLoop(plan, profile());
  while (loop.totals.reviewPassed < loop.totals.units) {
    const batch = compileNextArtProductionBatch(plan, loop);
    assert.equal(batch.status, "jobs-ready");
    for (const job of batch.jobs) {
      loop = evaluateArtProductionAttempt(
        plan,
        loop,
        attempt(loop, plan, job.unitId, { score }),
      );
    }
  }
  return { plan, loop };
}

function receiptBasis(receipt) {
  return canonicalSha256({
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

function rehashReceipt(receipt) {
  receipt.approvalBasisSha256 = receiptBasis(receipt);
  const { approvalReceiptSha256: _discarded, ...payload } = receipt;
  receipt.approvalReceiptSha256 = canonicalSha256(payload);
  return receipt;
}

function isReceiptInvalid(error) {
  return (
    error instanceof ArtDirectionError &&
    error.code === "ART_PRODUCTION_HUMAN_APPROVAL_RECEIPT_INVALID"
  );
}

const canonical = reviewedFixture();
const canonicalUnitId = canonical.loop.unitStates[0].unitId;
const canonicalRequest = humanApprovalRequest(
  canonical.plan,
  canonical.loop,
  canonicalUnitId,
);
const canonicalReceipt = compileArtProductionHumanApprovalReceipt(
  canonical.plan,
  canonical.loop,
  canonicalRequest,
);

test("compiles and verifies an exact candidate-bound named-human approval receipt", () => {
  assert.equal(
    verifyArtProductionHumanApprovalReceipt(
      canonical.plan,
      canonical.loop,
      canonicalReceipt,
    ),
    true,
  );
  assert.equal(
    verifyArtProductionHumanApprovalReceiptAgainstRequest(
      canonical.plan,
      canonical.loop,
      canonicalRequest,
      canonicalReceipt,
    ),
    true,
  );
  assert.equal(
    canonicalReceipt.technicalReview.attemptSha256,
    canonical.loop.unitStates[0].acceptedCandidate.attemptSha256,
  );
  assert.equal(canonicalReceipt.authority.creativeDecision, false);
  assert.notEqual(
    canonicalReceipt.decisionEvidenceArtifactId,
    canonicalReceipt.sourceArtifactId,
  );
});

test("rejects the previous loose hash-only approval shape at the packaging boundary", () => {
  const approvals = humanApprovals(canonical.plan, canonical.loop);
  const candidate = canonical.loop.unitStates[0].acceptedCandidate;
  assert.ok(candidate);
  approvals[0] = {
    unitId: canonicalUnitId,
    sourceArtifactId: candidate.artifactId,
    sourceSha256: candidate.sha256,
    sourceBytes: candidate.bytes,
    reviewer: "Greg Parker",
    reviewedAt: "2026-08-14T02:00:00.000Z",
    approvalReceiptSha256: digest(`legacy:${canonicalUnitId}`),
  };
  assert.throws(
    () =>
      compileArtProductionPackagingPlan(
        canonical.plan,
        canonical.loop,
        approvals,
      ),
    isReceiptInvalid,
  );
});

test("rejects retained-hash mutation of named-human request fields", () => {
  const forged = structuredClone(canonicalReceipt);
  forged.reviewer = "Mallory Example";
  assert.equal(
    forged.approvalReceiptSha256,
    canonicalReceipt.approvalReceiptSha256,
  );
  assert.throws(
    () =>
      verifyArtProductionHumanApprovalReceipt(
        canonical.plan,
        canonical.loop,
        forged,
      ),
    (error) =>
      isReceiptInvalid(error) && /requestSha256/u.test(error.message),
  );
});

test("rejects attacker-rehashed mutation of derived technical-review evidence", () => {
  const forged = structuredClone(canonicalReceipt);
  forged.technicalReview.weightedScore -= 1;
  rehashReceipt(forged);
  assert.notEqual(
    forged.approvalReceiptSha256,
    canonicalReceipt.approvalReceiptSha256,
  );
  assert.throws(
    () =>
      verifyArtProductionHumanApprovalReceipt(
        canonical.plan,
        canonical.loop,
        forged,
      ),
    (error) =>
      isReceiptInvalid(error) && /deterministic compilation/u.test(error.message),
  );
});

test("rejects attacker-rehashed creative-decision authority escalation", () => {
  const forged = structuredClone(canonicalReceipt);
  forged.authority.creativeDecision = true;
  rehashReceipt(forged);
  assert.throws(
    () =>
      verifyArtProductionHumanApprovalReceipt(
        canonical.plan,
        canonical.loop,
        forged,
      ),
    (error) =>
      isReceiptInvalid(error) && /authority must remain entirely false/u.test(error.message),
  );
});

test("rejects replay against another valid loop and accepted candidate", () => {
  const alternate = reviewedFixture(99);
  assert.notEqual(alternate.loop.loopSha256, canonical.loop.loopSha256);
  assert.throws(
    () =>
      verifyArtProductionHumanApprovalReceipt(
        alternate.plan,
        alternate.loop,
        canonicalReceipt,
      ),
    (error) =>
      error instanceof ArtDirectionError &&
      /exact plan, loop and profile/u.test(error.message),
  );
});

test("request-bound verification distinguishes two legitimate named-human decisions", () => {
  const alternateRequest = humanApprovalRequest(
    canonical.plan,
    canonical.loop,
    canonicalUnitId,
    { reviewer: "Another Named Reviewer" },
  );
  const alternateReceipt = compileArtProductionHumanApprovalReceipt(
    canonical.plan,
    canonical.loop,
    alternateRequest,
  );
  assert.equal(
    verifyArtProductionHumanApprovalReceipt(
      canonical.plan,
      canonical.loop,
      alternateReceipt,
    ),
    true,
  );
  assert.throws(
    () =>
      verifyArtProductionHumanApprovalReceiptAgainstRequest(
        canonical.plan,
        canonical.loop,
        canonicalRequest,
        alternateReceipt,
      ),
    (error) =>
      isReceiptInvalid(error) &&
      /exact supplied approval request/u.test(error.message),
  );
});
