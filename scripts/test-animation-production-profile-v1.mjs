import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  ACTIONS,
  REQUEST_KIND,
  PROTOCOL_VERSION,
  assertAnimationProductionProfileIntegrity,
  compileAcceptedRuntimeClip,
  compileAnimationProductionProfile,
  nextAnimationProductionBatch,
  reviewAnimationProductionProfile,
} from "../tools/animation_production_profile_v1.mjs";

const example = JSON.parse(
  await readFile(new URL("../examples/animation-production-profile-side-stage-v1.json", import.meta.url), "utf8"),
);

function evidenceFor(plan, drawing, overrides = {}) {
  return {
    drawingId: drawing.id,
    attempt: 1,
    artifactId: `artifact_${String(drawing.ordinal).padStart(64, "0")}`,
    contentDigest: `sha256:${String(drawing.ordinal).padStart(64, "a")}`,
    width: plan.request.delivery.canvas.width,
    height: plan.request.delivery.canvas.height,
    meaningfulAlpha: true,
    unsafeEdgeContactPixels: 0,
    scores: {
      identity: 0.98,
      style: 0.97,
      silhouette: 0.96,
      camera: 0.99,
      anatomy: 0.95,
      motionReadability: 0.96,
      palette: 0.97,
    },
    findings: [],
    ...overrides,
  };
}

function sequenceEvidence(overrides = {}) {
  return {
    normalSpeedReviewed: true,
    frameByFrameReviewed: true,
    timingReadabilityScore: 0.97,
    motionReadabilityScore: 0.96,
    styleContinuityScore: 0.97,
    cameraContinuityScore: 0.99,
    loopSeamScore: 0.96,
    affectedDrawingIds: [],
    findings: [],
    ...overrides,
  };
}

test("compiles deterministic camera-aware plans for every built-in action", () => {
  for (const action of ACTIONS.filter((entry) => entry !== "custom")) {
    const directional = ["walk", "run", "sprint", "jump", "land", "climb", "swim", "fly"].includes(action);
    const request = {
      ...example,
      id: `profile-${action}`,
      title: `Profile ${action}`,
      action,
      direction: directional ? "right" : "camera",
      loop: ["idle", "walk", "run", "sprint", "climb", "swim", "fly", "dialogue", "emote", "effect"].includes(action),
      delivery: { ...example.delivery, animationName: `action.${action}` },
      events: [],
    };
    const first = compileAnimationProductionProfile(request, new Date("2026-08-30T00:00:00.000Z"));
    const second = compileAnimationProductionProfile(request, new Date("2026-08-30T01:00:00.000Z"));
    assert.equal(first.contentDigest, second.contentDigest);
    assert.ok(first.drawings.length >= 3);
    assert.equal(first.drawings.reduce((sum, drawing) => sum + drawing.exposureFrames, 0), first.totalTimelineFrames);
    assert.doesNotThrow(() => assertAnimationProductionProfileIntegrity(first));
  }
});

test("rejects camera/direction contradictions and generic prompt filler", () => {
  assert.throws(
    () => compileAnimationProductionProfile({ ...example, direction: "up" }),
    /DIRECTION_CAMERA_MISMATCH/,
  );
  assert.throws(
    () => compileAnimationProductionProfile({
      ...example,
      performance: { ...example.performance, intent: "8K masterpiece trending animation" },
    }),
    /GENERIC_PROMPT_FILLER_FORBIDDEN/,
  );
});

test("orders generation by keys, breakdowns and in-betweens", () => {
  const plan = compileAnimationProductionProfile(example);
  assert.deepEqual(
    [...new Set(plan.generationBatches.map((batch) => batch.phase))],
    ["key-pose", "breakdown", "inbetween"],
  );
  const first = nextAnimationProductionBatch(plan, []);
  assert.equal(first.phase, "key-pose");
  const keyIds = plan.generationBatches
    .filter((batch) => batch.phase === "key-pose")
    .flatMap((batch) => batch.drawingIds);
  const next = nextAnimationProductionBatch(plan, keyIds);
  assert.notEqual(next.phase, "key-pose");
  assert.ok(next.dependencyDrawingIds.every((id) => keyIds.includes(id)));
});

test("classifies missing evidence as review work, not redraw permission", () => {
  const plan = compileAnimationProductionProfile(example);
  const decision = reviewAnimationProductionProfile({
    profile: plan,
    cycle: 1,
    drawingEvidence: [],
  });
  assert.equal(decision.status, "review-required");
  assert.equal(decision.reviewRequiredDrawingIds.length, plan.drawings.length);
  assert.deepEqual(decision.rejectedDrawingIds, []);
  assert.deepEqual(decision.retryQueue, []);
});

test("retries only failed drawings and preserves every accepted neighbour", () => {
  const plan = compileAnimationProductionProfile(example);
  const failed = plan.drawings[Math.floor(plan.drawings.length / 2)];
  const evidence = plan.drawings.map((drawing) =>
    evidenceFor(plan, drawing, drawing.id === failed.id
      ? { scores: { ...evidenceFor(plan, drawing).scores, identity: 0.2 } }
      : {}),
  );
  const decision = reviewAnimationProductionProfile({
    profile: plan,
    cycle: 1,
    drawingEvidence: evidence,
  });
  assert.equal(decision.status, "rework-required");
  assert.deepEqual(decision.rejectedDrawingIds, [failed.id]);
  assert.equal(decision.retryQueue.length, 1);
  assert.equal(decision.retryQueue[0].drawingId, failed.id);
  assert.equal(decision.retryQueue[0].preserveDrawingIds.length, plan.drawings.length - 1);
  assert.ok(decision.retryQueue[0].preserveDrawingIds.includes(plan.drawings.at(-1).id));
});

test("blocks repeated non-improving repair cycles", () => {
  const plan = compileAnimationProductionProfile(example);
  const failed = plan.drawings[1];
  const evidence = plan.drawings.map((drawing) => evidenceFor(plan, drawing, drawing.id === failed.id
    ? { scores: { ...evidenceFor(plan, drawing).scores, camera: 0.1 } }
    : {}));
  const first = reviewAnimationProductionProfile({ profile: plan, cycle: 1, drawingEvidence: evidence });
  const second = reviewAnimationProductionProfile({ profile: plan, cycle: 2, drawingEvidence: evidence, previousDecision: first });
  const third = reviewAnimationProductionProfile({ profile: plan, cycle: 3, drawingEvidence: evidence, previousDecision: second });
  assert.equal(first.status, "rework-required");
  assert.equal(second.status, "rework-required");
  assert.equal(third.status, "blocked");
  assert.ok(third.blockers.includes("NO_PROGRESS_BUDGET_EXHAUSTED"));
});

test("allows acceptance on the final configured review cycle", () => {
  const plan = compileAnimationProductionProfile({
    ...example,
    iteration: { ...example.iteration, maximumReviewCycles: 2 },
  });
  const decision = reviewAnimationProductionProfile({
    profile: plan,
    cycle: 2,
    drawingEvidence: plan.drawings.map((drawing) => evidenceFor(plan, drawing)),
    sequenceEvidence: sequenceEvidence(),
  });
  assert.equal(decision.status, "accepted");
  assert.deepEqual(decision.blockers, []);
});

test("compiles an accepted profile into the existing runtime clip contract", () => {
  assert.equal(example.protocolVersion, PROTOCOL_VERSION);
  assert.equal(example.kind, REQUEST_KIND);
  const plan = compileAnimationProductionProfile(example);
  const decision = reviewAnimationProductionProfile({
    profile: plan,
    cycle: 1,
    drawingEvidence: plan.drawings.map((drawing) => evidenceFor(plan, drawing)),
    sequenceEvidence: sequenceEvidence(),
  });
  const clip = compileAcceptedRuntimeClip(plan, decision);
  assert.equal(clip.sourcePlanDigest, plan.contentDigest);
  assert.equal(clip.frameCount, plan.drawings.length);
  assert.deepEqual(clip.frameDurations, plan.drawings.map((drawing) => drawing.exposureFrames));
  assert.equal(clip.loopMode, "linear");
  assert.equal(clip.markers.length, 2);
});
