import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  animationFrameLedgerSha256,
  applyAnimationFrameCandidateBatch,
  assertAnimationFrameWorkLedgerIntegrity,
  compileAnimationFrameCandidateReceipt,
  compileNextAnimationFrameWorkBatch,
  createAnimationFrameWorkLedger,
  reviewAnimationFrameWorkLedger,
  summarizeAnimationFrameWorkLedger,
} from "../../../tools/animation_frame_work_ledger_v1.mjs";
import {
  describeAnimationFrameLedgerV1,
  executeAnimationFrameLedgerOperationV1,
} from "../../../tools/animation_frame_work_ledger_v1_mcp.mjs";
import { compileAnimationProductionProfile } from "../../../tools/animation_production_profile_canonical_v1.mjs";

const root = new URL("../../../", import.meta.url);
const artifactId = (value) =>
  `artifact_${createHash("sha256").update(value).digest("hex")}`;
const digest = (value) => animationFrameLedgerSha256(value);

function candidate(workOrder, label) {
  return {
    artifactId: artifactId(`${workOrder.workOrderDigest}:${label}`),
    contentDigest: digest(`candidate:${workOrder.workOrderDigest}:${label}`),
    byteLength: 4096,
    mediaType: "image/png",
    width: workOrder.expectedOutput.width,
    height: workOrder.expectedOutput.height,
    meaningfulAlpha: workOrder.expectedOutput.meaningfulAlphaRequired,
    providerRequestDigest: digest(`request:${workOrder.workOrderDigest}`),
    providerResponseDigest: digest(`response:${workOrder.workOrderDigest}:${label}`),
    inspectionEvidenceDigest: digest(`inspection:${workOrder.workOrderDigest}:${label}`),
    adapterId: "fixture-local-renderer",
    modelId: "fixture-animation-model",
  };
}

function drawingEvidence(ledger, failedDrawingId = null) {
  return ledger.drawingStates.map((state) => {
    const latest = state.candidates.at(-1)?.candidate;
    assert.ok(latest);
    const identity = state.drawingId === failedDrawingId ? 0.4 : 1;
    return {
      drawingId: state.drawingId,
      artifactId: latest.artifactId,
      contentDigest: latest.contentDigest,
      attempt: state.attemptCount,
      width: latest.width,
      height: latest.height,
      meaningfulAlpha: latest.meaningfulAlpha,
      unsafeEdgeContactPixels: 0,
      scores: {
        identity,
        style: 1,
        silhouette: 1,
        camera: 1,
        anatomy: 1,
        palette: 1,
        motionReadability: 1,
      },
      findings: [],
    };
  });
}

const passingSequenceEvidence = {
  normalSpeedReviewed: true,
  frameByFrameReviewed: true,
  timingReadabilityScore: 1,
  motionReadabilityScore: 1,
  styleContinuityScore: 1,
  cameraContinuityScore: 1,
  loopSeamScore: 1,
  affectedDrawingIds: [],
  findings: [],
};

test("runs an approved animation through resumable targeted repair", async () => {
  const request = JSON.parse(
    readFileSync(
      new URL("examples/animation-production-profile-side-stage-v1.json", root),
      "utf8",
    ),
  );
  const profile = compileAnimationProductionProfile(
    request,
    new Date("2026-08-30T00:00:00.000Z"),
  );
  const references = [
    {
      artifactId: request.subject.identityReferenceArtifactId,
      contentDigest: digest("identity-master"),
      mediaType: "image/png",
      width: request.delivery.canvas.width,
      height: request.delivery.canvas.height,
    },
    {
      artifactId: request.subject.directionMasterArtifactId,
      contentDigest: digest("direction-master"),
      mediaType: "image/png",
      width: request.delivery.canvas.width,
      height: request.delivery.canvas.height,
    },
  ];

  await assert.rejects(
    createAnimationFrameWorkLedger(
      { profile, sessionId: `session-${"x".repeat(180)}` },
      new Date("2026-08-30T00:59:00.000Z"),
    ),
    /DERIVED_ID_INVALID/,
  );

  let ledger = await createAnimationFrameWorkLedger(
    { profile, sessionId: "harbour-runner-walk-right-session" },
    new Date("2026-08-30T01:00:00.000Z"),
  );

  const missingReferences = await compileNextAnimationFrameWorkBatch(
    { profile, ledger },
    new Date("2026-08-30T01:00:10.000Z"),
  );
  assert.equal(missingReferences.status, "awaiting-reference-bindings");
  assert.ok(missingReferences.missingReferences.length >= 2);

  let serial = 0;
  while (summarizeAnimationFrameWorkLedger(ledger).pendingDrawingIds.length) {
    const batch = await compileNextAnimationFrameWorkBatch(
      { profile, ledger, referenceBindings: references },
      new Date(1_788_054_000_000 + serial * 60_000),
    );
    assert.equal(batch.status, "work-ready");
    const receipts = batch.workOrders.map((workOrder) =>
      compileAnimationFrameCandidateReceipt(
        {
          ledgerDigest: ledger.contentDigest,
          workOrder,
          candidate: candidate(workOrder, `initial-${serial}`),
        },
        new Date(1_788_054_010_000 + serial * 60_000),
      ),
    );
    if (batch.workOrders.length > 1) {
      await assert.rejects(
        applyAnimationFrameCandidateBatch(
          { profile, ledger, batch, receipts: receipts.slice(0, -1) },
          new Date(1_788_054_015_000 + serial * 60_000),
        ),
        /RECEIPT_COUNT_MISMATCH/,
      );
    }
    ledger = await applyAnimationFrameCandidateBatch(
      { profile, ledger, batch, receipts },
      new Date(1_788_054_020_000 + serial * 60_000),
    );
    serial += 1;
  }

  const failedDrawingId = profile.drawings[Math.floor(profile.drawings.length / 2)].id;
  let reviewed = await reviewAnimationFrameWorkLedger(
    {
      profile,
      ledger,
      reviewInput: {
        cycle: 1,
        drawingEvidence: drawingEvidence(ledger, failedDrawingId),
        sequenceEvidence: passingSequenceEvidence,
      },
    },
    new Date("2026-08-30T03:00:00.000Z"),
  );
  ledger = reviewed.ledger;
  assert.equal(reviewed.decision.status, "rework-required");
  assert.deepEqual(
    summarizeAnimationFrameWorkLedger(ledger).repairDrawingIds,
    [failedDrawingId],
  );

  const repairBatch = await compileNextAnimationFrameWorkBatch(
    { profile, ledger, referenceBindings: references },
    new Date("2026-08-30T03:01:00.000Z"),
  );
  assert.equal(repairBatch.status, "work-ready");
  assert.equal(repairBatch.workOrders.length, 1);
  assert.equal(repairBatch.workOrders[0].mode, "repair");
  assert.equal(repairBatch.workOrders[0].drawingId, failedDrawingId);
  assert.equal(
    repairBatch.workOrders[0].preserveDrawingIds.length,
    profile.drawings.length - 1,
  );

  const repairReceipts = repairBatch.workOrders.map((workOrder) =>
    compileAnimationFrameCandidateReceipt(
      {
        ledgerDigest: ledger.contentDigest,
        workOrder,
        candidate: candidate(workOrder, "repair"),
      },
      new Date("2026-08-30T03:01:10.000Z"),
    ),
  );
  ledger = await applyAnimationFrameCandidateBatch(
    { profile, ledger, batch: repairBatch, receipts: repairReceipts },
    new Date("2026-08-30T03:01:20.000Z"),
  );

  reviewed = await reviewAnimationFrameWorkLedger(
    {
      profile,
      ledger,
      reviewInput: {
        cycle: 2,
        drawingEvidence: drawingEvidence(ledger),
        sequenceEvidence: passingSequenceEvidence,
      },
    },
    new Date("2026-08-30T03:02:00.000Z"),
  );
  ledger = reviewed.ledger;
  assert.equal(reviewed.decision.status, "accepted");
  assert.equal(summarizeAnimationFrameWorkLedger(ledger).status, "accepted");
  await assertAnimationFrameWorkLedgerIntegrity(profile, ledger);

  const tampered = structuredClone(ledger);
  tampered.drawingStates[0].attemptCount += 1;
  await assert.rejects(
    assertAnimationFrameWorkLedgerIntegrity(profile, tampered),
    /DIGEST_MISMATCH|REPLAY_MISMATCH/,
  );
});

test("locks the implementation and enforces Art Studio authority", async () => {
  const implementation = readFileSync(
    new URL("tools/animation_frame_work_ledger_v1.mjs", root),
  );
  const internalImplementation = readFileSync(
    new URL("tools/animation_frame_work_ledger_v1_internal.mjs", root),
  );
  const mcp = readFileSync(
    new URL("tools/animation_frame_work_ledger_v1_mcp.mjs", root),
  );
  const schema = readFileSync(
    new URL("contracts/animation-frame-work-ledger-v1.schema.json", root),
  );
  const lock = JSON.parse(
    readFileSync(
      new URL("contracts/animation-frame-work-ledger-v1.lock.json", root),
      "utf8",
    ),
  );
  assert.equal(
    lock.implementationSha256,
    `sha256:${createHash("sha256").update(implementation).digest("hex")}`,
  );
  assert.equal(
    lock.internalImplementationSha256,
    `sha256:${createHash("sha256").update(internalImplementation).digest("hex")}`,
  );
  assert.equal(
    lock.mcpSha256,
    `sha256:${createHash("sha256").update(mcp).digest("hex")}`,
  );
  assert.equal(
    lock.schemaSha256,
    `sha256:${createHash("sha256").update(schema).digest("hex")}`,
  );

  const operations = describeAnimationFrameLedgerV1("art-studio").operations;
  assert.ok(operations.includes("create_animation_frame_ledger_v1"));
  assert.ok(operations.includes("apply_animation_frame_candidate_batch_v1"));
  assert.ok(!operations.includes("review_animation_frame_ledger_v1"));
  await assert.rejects(
    executeAnimationFrameLedgerOperationV1(
      "art-studio",
      "review_animation_frame_ledger_v1",
      {},
    ),
    /OPERATION_NOT_ALLOWED_FOR_ROLE/,
  );
});
