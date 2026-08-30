#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const repositoryNames = {
  art: "evavo-art-studio",
  cel: "cel-animation-studio",
};

function repositoryRoots() {
  const current = resolve(process.cwd());
  const parent = resolve(current, "..");
  const roots = {
    art: resolve(parent, repositoryNames.art),
    cel: resolve(parent, repositoryNames.cel),
  };
  for (const [key, name] of Object.entries(repositoryNames)) {
    if (basename(current).toLowerCase() === name.toLowerCase()) roots[key] = current;
  }
  return roots;
}

async function moduleAt(path) {
  return import(pathToFileURL(path).href);
}

async function fileSha(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function drawingEvidence(profile, drawing, overrides = {}) {
  return {
    drawingId: drawing.id,
    attempt: 1,
    artifactId: `artifact_${drawing.ordinal.toString(16).padStart(64, "0")}`,
    contentDigest: `sha256:${drawing.ordinal.toString(16).padStart(64, "a")}`,
    width: profile.request.delivery.canvas.width,
    height: profile.request.delivery.canvas.height,
    meaningfulAlpha: true,
    unsafeEdgeContactPixels: 0,
    scores: {
      identity: 0.99,
      style: 0.99,
      silhouette: 0.99,
      camera: 0.99,
      anatomy: 0.99,
      motionReadability: 0.99,
      palette: 0.99,
    },
    findings: [],
    ...overrides,
  };
}

function sequenceEvidence() {
  return {
    normalSpeedReviewed: true,
    frameByFrameReviewed: true,
    timingReadabilityScore: 0.99,
    motionReadabilityScore: 0.99,
    styleContinuityScore: 0.99,
    cameraContinuityScore: 0.99,
    loopSeamScore: 0.99,
    affectedDrawingIds: [],
    findings: [],
  };
}

const roots = repositoryRoots();
const artPlanner = await moduleAt(resolve(roots.art, "tools/animation_production_profile_canonical_v1.mjs"));
const artReceipt = await moduleAt(resolve(roots.art, "tools/animation_production_review_receipt_v2.mjs"));
const celReceipt = await moduleAt(resolve(roots.cel, "tools/animation_production_review_receipt_v2.mjs"));

assert.equal(
  await fileSha(resolve(roots.art, "tools/animation_production_review_receipt_v2.mjs")),
  await fileSha(resolve(roots.cel, "tools/animation_production_review_receipt_v2.mjs")),
  "Review Receipt V2 implementation drifted between Art and Cel",
);

const request = JSON.parse(
  await readFile(resolve(roots.art, "examples/animation-production-profile-side-stage-v1.json"), "utf8"),
);
const profile = artPlanner.compileAnimationProductionProfile(
  request,
  new Date("2026-08-30T00:00:00.000Z"),
);
const acceptedEvidence = profile.drawings.map((drawing) => drawingEvidence(profile, drawing));
const acceptedInput = {
  profile,
  cycle: 1,
  drawingEvidence: [...acceptedEvidence].reverse(),
  sequenceEvidence: sequenceEvidence(),
};
const acceptedTime = new Date("2026-08-30T01:00:00.000Z");
const acceptedArt = await artReceipt.compileAnimationProductionReviewReceipt(acceptedInput, acceptedTime);
const acceptedCel = await celReceipt.compileAnimationProductionReviewReceipt(acceptedInput, acceptedTime);

assert.equal(acceptedArt.reviewerRole, "art-studio-supervisor");
assert.equal(acceptedCel.reviewerRole, "cel-animation-studio-independent");
assert.equal(acceptedArt.reviewInputDigest, acceptedCel.reviewInputDigest);
assert.equal(acceptedArt.evidenceSummary.drawingEvidenceDigest, acceptedCel.evidenceSummary.drawingEvidenceDigest);
assert.deepEqual(acceptedArt.decision, acceptedCel.decision);
assert.equal(acceptedArt.decision.status, "accepted");
assert.notEqual(acceptedArt.receiptDigest, acceptedCel.receiptDigest);
artReceipt.assertAnimationProductionReviewReceiptSelfIntegrity(acceptedArt);
celReceipt.assertAnimationProductionReviewReceiptSelfIntegrity(acceptedCel);
await artReceipt.assertAnimationProductionReviewReceiptAgainstInput(acceptedInput, acceptedArt);
await celReceipt.assertAnimationProductionReviewReceiptAgainstInput(acceptedInput, acceptedCel);

const failedDrawing = profile.drawings[Math.floor(profile.drawings.length / 2)];
const rejectedEvidence = profile.drawings.map((drawing) =>
  drawingEvidence(
    profile,
    drawing,
    drawing.id === failedDrawing.id
      ? {
          scores: {
            ...drawingEvidence(profile, drawing).scores,
            identity: 0.1,
            camera: 0.2,
          },
        }
      : {},
  ),
);
const rejectedInput1 = { profile, cycle: 1, drawingEvidence: rejectedEvidence };
const rejectedTime1 = new Date("2026-08-30T02:00:00.000Z");
const rejectedArt1 = await artReceipt.compileAnimationProductionReviewReceipt(rejectedInput1, rejectedTime1);
const rejectedCel1 = await celReceipt.compileAnimationProductionReviewReceipt(rejectedInput1, rejectedTime1);
assert.equal(rejectedArt1.reviewInputDigest, rejectedCel1.reviewInputDigest);
assert.deepEqual(rejectedArt1.decision, rejectedCel1.decision);
assert.equal(rejectedArt1.decision.status, "rework-required");
assert.deepEqual(rejectedArt1.decision.rejectedDrawingIds, [failedDrawing.id]);
assert.equal(rejectedArt1.decision.retryQueue.length, 1);
assert.equal(rejectedArt1.decision.retryQueue[0].preserveDrawingIds.length, profile.drawings.length - 1);

const rejectedInput2Art = {
  profile,
  cycle: 2,
  drawingEvidence: rejectedEvidence,
  previousReceipt: rejectedArt1,
};
const rejectedInput2Cel = {
  profile,
  cycle: 2,
  drawingEvidence: rejectedEvidence,
  previousReceipt: rejectedCel1,
};
const rejectedTime2 = new Date("2026-08-30T03:00:00.000Z");
const rejectedArt2 = await artReceipt.compileAnimationProductionReviewReceipt(rejectedInput2Art, rejectedTime2);
const rejectedCel2 = await celReceipt.compileAnimationProductionReviewReceipt(rejectedInput2Cel, rejectedTime2);
assert.equal(rejectedArt2.previousDecisionDigest, rejectedCel2.previousDecisionDigest);
assert.notEqual(rejectedArt2.previousReceiptDigest, rejectedCel2.previousReceiptDigest);
assert.equal(rejectedArt2.reviewInputDigest, rejectedCel2.reviewInputDigest);
assert.deepEqual(rejectedArt2.decision, rejectedCel2.decision);
assert.equal(rejectedArt2.decision.noProgressCycles, 1);

const rejectedInput3Art = {
  profile,
  cycle: 3,
  drawingEvidence: rejectedEvidence,
  previousReceipt: rejectedArt2,
};
const rejectedInput3Cel = {
  profile,
  cycle: 3,
  drawingEvidence: rejectedEvidence,
  previousReceipt: rejectedCel2,
};
const rejectedTime3 = new Date("2026-08-30T04:00:00.000Z");
const rejectedArt3 = await artReceipt.compileAnimationProductionReviewReceipt(rejectedInput3Art, rejectedTime3);
const rejectedCel3 = await celReceipt.compileAnimationProductionReviewReceipt(rejectedInput3Cel, rejectedTime3);
assert.equal(rejectedArt3.reviewInputDigest, rejectedCel3.reviewInputDigest);
assert.deepEqual(rejectedArt3.decision, rejectedCel3.decision);
assert.equal(rejectedArt3.decision.status, "blocked");
assert.ok(rejectedArt3.decision.blockers.includes("NO_PROGRESS_BUDGET_EXHAUSTED"));

assert.throws(
  () => artReceipt.assertAnimationProductionReviewReceiptSelfIntegrity({
    ...acceptedArt,
    evidenceSummary: {
      ...acceptedArt.evidenceSummary,
      drawingEvidenceCount: 999,
    },
  }),
  /DIGEST_MISMATCH/,
);
await assert.rejects(
  () => artReceipt.compileAnimationProductionReviewReceipt({
    ...acceptedInput,
    drawingEvidence: [
      ...acceptedInput.drawingEvidence,
      {
        ...acceptedInput.drawingEvidence[0],
        sourcePath: "C:\\untrusted\\frame.png",
      },
    ],
  }),
  /LOCATION_KEY_FORBIDDEN|DRAWING_ID_DUPLICATE/,
);

process.stdout.write(`${JSON.stringify({
  status: "pass",
  profileDigest: profile.contentDigest,
  acceptedDecisionDigest: acceptedArt.decision.decisionDigest,
  acceptedReviewInputDigest: acceptedArt.reviewInputDigest,
  artReceiptDigest: acceptedArt.receiptDigest,
  celReceiptDigest: acceptedCel.receiptDigest,
  rejectedDecisionDigest: rejectedArt1.decision.decisionDigest,
  blockedDecisionDigest: rejectedArt3.decision.decisionDigest,
  failedDrawingId: failedDrawing.id,
}, null, 2)}\n`);
