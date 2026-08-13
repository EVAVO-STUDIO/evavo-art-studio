import assert from "node:assert/strict";
import { rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  compileHmfFrameBodyCreativeReviewDecision,
  compileHmfFrameBodyCreativeReviewPacket,
  materializeHmfFrameBodyCreativeReview,
} from "./frame-body-creative-review.mjs";
import {
  assessmentFor,
  canonical,
  cleanup,
  fixture,
  hashValue,
} from "./frame-body-creative-review.test-support.mjs";

test("creative review rejects incomplete, contradictory or non-human evidence", async () => {
  const value = await fixture();
  try {
    const packet = await compileHmfFrameBodyCreativeReviewPacket({ qaReport: value.qaReport, workspaceRoot: value.root });
    const incomplete = assessmentFor(packet);
    incomplete.criterionResults = incomplete.criterionResults.slice(1);
    await assert.rejects(
      () => compileHmfFrameBodyCreativeReviewDecision({ packet, assessment: incomplete }),
      /cover every governed criterion/i,
    );
    const contradictory = assessmentFor(packet, { failedCriterionId: packet.criteria[0].id });
    contradictory.recommendedOutcome = "selected";
    await assert.rejects(
      () => compileHmfFrameBodyCreativeReviewDecision({ packet, assessment: contradictory }),
      /recommendedOutcome must be repair-requested/i,
    );
    const anonymous = assessmentFor(packet);
    anonymous.reviewerId = "";
    await assert.rejects(
      () => compileHmfFrameBodyCreativeReviewDecision({ packet, assessment: anonymous }),
      /reviewerId/i,
    );
    const unsafeReviewer = assessmentFor(packet);
    unsafeReviewer.reviewerId = "greg parker";
    await assert.rejects(
      () => compileHmfFrameBodyCreativeReviewDecision({ packet, assessment: unsafeReviewer }),
      /stable identifier/i,
    );
  } finally {
    await cleanup(value);
  }
});

test("creative review rejects recomputed packets that smuggle authority or policy drift", async () => {
  const value = await fixture();
  try {
    const packet = await compileHmfFrameBodyCreativeReviewPacket({ qaReport: value.qaReport, workspaceRoot: value.root });
    const authorityBody = structuredClone(packet);
    delete authorityBody.reviewPacketSha256;
    authorityBody.authority.candidatePromotion = true;
    const authorityPacket = { ...authorityBody, reviewPacketSha256: hashValue(authorityBody) };
    await assert.rejects(
      () => compileHmfFrameBodyCreativeReviewDecision({ packet: authorityPacket, assessment: assessmentFor(authorityPacket) }),
      /forbidden authority: candidatePromotion/i,
    );

    const policyBody = structuredClone(packet);
    delete policyBody.reviewPacketSha256;
    policyBody.criteria[0].instruction = `${policyBody.criteria[0].instruction} Unauthorized drift.`;
    const policyPacket = { ...policyBody, reviewPacketSha256: hashValue(policyBody) };
    await assert.rejects(
      () => compileHmfFrameBodyCreativeReviewDecision({ packet: policyPacket, assessment: assessmentFor(policyPacket) }),
      /criteria drifted from the governed policy/i,
    );
  } finally {
    await cleanup(value);
  }
});

test("creative review rejects a QA report rebound to another candidate-admission receipt", async () => {
  const value = await fixture();
  try {
    const report = structuredClone(value.qaReport);
    delete report.qaReportSha256;
    report.candidateAdmissionReceiptSha256 = "f".repeat(64);
    report.qaEvidence.candidateAdmissionReceiptSha256 = report.candidateAdmissionReceiptSha256;
    report.qaEvidenceSha256 = hashValue(report.qaEvidence);
    delete report.receipt.receiptSha256;
    report.receipt.previousReceiptSha256 = report.candidateAdmissionReceiptSha256;
    report.receipt.evidenceSha256 = report.qaEvidenceSha256;
    report.receipt.receiptSha256 = hashValue(report.receipt);
    const rebound = { ...report, qaReportSha256: hashValue(report) };
    await writeFile(path.join(value.root, ...value.reportPath.split("/")), canonical(rebound));
    await assert.rejects(
      () => compileHmfFrameBodyCreativeReviewPacket({ qaReport: rebound, workspaceRoot: value.root }),
      /bound to another candidate-admission receipt/i,
    );
  } finally {
    await cleanup(value);
  }
});

test("creative review materialization rejects candidate drift after review", async () => {
  const value = await fixture();
  try {
    const packet = await compileHmfFrameBodyCreativeReviewPacket({ qaReport: value.qaReport, workspaceRoot: value.root });
    const decision = await compileHmfFrameBodyCreativeReviewDecision({ packet, assessment: assessmentFor(packet) });
    await writeFile(path.join(value.root, ...value.candidatePath.split("/")), Buffer.from("drifted-candidate"));
    await assert.rejects(
      () => materializeHmfFrameBodyCreativeReview(decision),
      /candidate bytes changed after deterministic QA/i,
    );
  } finally {
    await cleanup(value);
  }
});

test("creative review rejects symlinked candidate paths", async () => {
  const value = await fixture();
  try {
    const absolute = path.join(value.root, ...value.candidatePath.split("/"));
    const external = path.join(value.root, "external-candidate.bin");
    await writeFile(external, value.candidate);
    await rm(absolute);
    await symlink(external, absolute);
    await assert.rejects(
      () => compileHmfFrameBodyCreativeReviewPacket({ qaReport: value.qaReport, workspaceRoot: value.root }),
      /symlinked component/i,
    );
  } finally {
    await cleanup(value);
  }
});
