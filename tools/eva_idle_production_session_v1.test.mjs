import assert from "node:assert/strict";
import test from "node:test";

import { compileEvaCoreMotionProductionPlan } from "./eva_core_motion_production_plan_v1.mjs";
import {
  compileEvaIdleProductionSession,
  applyEvaIdleReadyBatch,
} from "./eva_idle_production_session_v1.mjs";

const hex = (char) => char.repeat(64);
const sha = (char) => `sha256:${hex(char)}`;
const artifact = (char) => `artifact_${hex(char)}`;

function clip(id, kind, loopMode, targetFrames, fps, performance) {
  return { id, kind, loopMode, targetFrames, fps, performance };
}

function suitePlan() {
  return {
    schema: "evavo.project-art-avatar-animation-suite-plan.v3",
    characterId: "eva-female",
    planSha256: hex("b"),
    compiledAt: "2026-08-31T00:00:00.000Z",
    targetCanvas: { width: 1024, height: 1536 },
    animationIdentityMaster: { asset: { sha256: hex("a") } },
    clips: [
      clip("idle-primary", "idle", "loop", 36, 24, "quiet neutral breathing"),
      clip("attention", "idle", "loop", 30, 24, "alert neutral attention"),
      clip("listening", "listening", "loop", 40, 24, "engaged listening"),
      clip("thinking", "thinking", "ping-pong", 40, 24, "considered thinking"),
      clip("talk-in", "talk-in", "once", 12, 30, "neutral-to-speaking transition"),
      clip("talk-neutral", "talk-loop", "loop", 36, 30, "conversational neutral body cadence"),
      clip("talk-out", "talk-out", "once", 12, 30, "speaking-to-neutral transition"),
    ],
  };
}

function idleEntry() {
  const core = compileEvaCoreMotionProductionPlan(suitePlan(), {
    generatedAt: "2026-08-31T01:00:00.000Z",
    profileState: "approved",
  });
  return core.byClip["idle-primary"];
}

function referenceBindings(entry) {
  const identityArtifactId = entry.plan.request.subject.identityReferenceArtifactId;
  return [
    {
      artifactId: identityArtifactId,
      contentDigest: sha("a"),
      mediaType: "image/png",
      width: 1024,
      height: 1536,
    },
  ];
}

function reviewedSource(id, drawingId, char) {
  return {
    sourceId: id,
    reviewDecisionId: `${id}:review`,
    reviewDecisionDigest: sha(char),
    inspectionEvidenceDigest: sha(char === "f" ? "e" : "f"),
    artifactId: artifact(char),
    contentDigest: sha(char),
    byteLength: 123456,
    mediaType: "image/png",
    width: 1024,
    height: 1536,
    meaningfulAlpha: true,
    reviewStatus: "sealed",
    decision: "keep",
    identityLockId: "eva-female-identity-lock",
    identityRevision: 1,
    eligibleDrawingIds: [drawingId],
    reusePriority: 10,
  };
}

test("idle session preserves atomic first batch while routing reusable and unresolved drawings separately", async () => {
  const entry = idleEntry();
  const firstKey = entry.plan.generationBatches[0].drawingIds[0];
  const session = await compileEvaIdleProductionSession(
    {
      profileEntry: entry,
      reviewedSources: [reviewedSource("reviewed-key", firstKey, "c")],
      referenceBindings: referenceBindings(entry),
      sessionId: "eva-idle-session-partial-reuse",
    },
    new Date("2026-08-31T02:00:00.000Z"),
  );

  assert.equal(session.firstBatch.status, "batch-routing-ready");
  assert.equal(session.firstBatch.reusedWorkOrderCount, 1);
  assert.ok(session.firstBatch.unresolvedWorkOrderCount >= 1);
  assert.equal(session.firstBatch.allCandidatesReady, false);
  assert.equal(session.nextAction, "route-unresolved-work-orders");
  assert.equal(session.ledger.revision, 0);
  assert.ok(session.ledger.drawingStates.every((state) => state.status === "pending"));

  const reused = session.firstBatch.workOrders.find(
    (workOrder) => workOrder.route === "reviewed-source-reuse",
  );
  const unresolved = session.firstBatch.workOrders.find(
    (workOrder) => workOrder.route === "unresolved",
  );
  assert.ok(reused);
  assert.equal(reused.productionHandoff, null);
  assert.ok(unresolved?.productionHandoff);
  assert.equal(
    unresolved.productionHandoff.schema,
    "evavo.animation-candidate-production-handoff.v1",
  );
  assert.equal(
    unresolved.productionHandoff.workOrderDigest,
    unresolved.workOrder.workOrderDigest,
  );
  assert.equal(unresolved.productionHandoff.routePolicy.candidateOnly, true);
  assert.equal(unresolved.productionHandoff.authority.localExecution, false);
});

test("idle session can atomically admit an all-reused first key batch and advance to dependent work", async () => {
  const entry = idleEntry();
  const firstBatchDrawingIds = entry.plan.generationBatches[0].drawingIds;
  const reviewedSources = firstBatchDrawingIds.map((drawingId, index) =>
    reviewedSource(`reviewed-${index + 1}`, drawingId, String.fromCharCode(99 + index)),
  );
  const session = await compileEvaIdleProductionSession(
    {
      profileEntry: entry,
      reviewedSources,
      referenceBindings: referenceBindings(entry),
      sessionId: "eva-idle-session-all-reuse",
    },
    new Date("2026-08-31T02:10:00.000Z"),
  );

  assert.equal(session.firstBatch.allCandidatesReady, true);
  assert.equal(session.nextAction, "apply-reused-candidate-batch");
  assert.ok(session.firstBatch.workOrders.every((entryValue) => entryValue.productionHandoff === null));

  const candidates = session.firstBatch.workOrders.map((entryValue) => ({
    drawingId: entryValue.drawingId,
    candidate: entryValue.candidate,
  }));
  const applied = await applyEvaIdleReadyBatch(
    {
      profile: entry.plan,
      ledger: session.ledger,
      batch: session.firstBatch.batch,
      candidates,
      referenceBindings: referenceBindings(entry),
    },
    new Date("2026-08-31T02:11:00.000Z"),
  );

  assert.equal(applied.ledger.revision, 1);
  for (const drawingId of firstBatchDrawingIds) {
    const state = applied.ledger.drawingStates.find((candidate) => candidate.drawingId === drawingId);
    assert.equal(state.status, "candidate-ready");
    assert.equal(state.attemptCount, 1);
  }
  assert.notEqual(applied.nextBatch.status, "blocked-by-dependencies");
  assert.equal(applied.operation, "apply-ready-batch");
  assert.equal(applied.authority.providerExecution, false);
});
