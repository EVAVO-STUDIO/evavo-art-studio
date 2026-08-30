import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  assertAnimationProductionReviewIntegrity,
  compileAcceptedRuntimeClip,
  compileAnimationProductionProfile,
  reviewAnimationProductionProfile,
} from "../tools/animation_production_profile_canonical_v1.mjs";

const example = JSON.parse(
  await readFile(new URL("../examples/animation-production-profile-side-stage-v1.json", import.meta.url), "utf8"),
);

function drawingEvidence(plan, drawing, overrides = {}) {
  return {
    drawingId: drawing.id,
    attempt: 1,
    artifactId: `artifact_${drawing.ordinal.toString(16).padStart(64, "0")}`,
    contentDigest: `sha256:${drawing.ordinal.toString(16).padStart(64, "a")}`,
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

test("emits a digest-bound canonical accepted decision", () => {
  const profile = compileAnimationProductionProfile(example, new Date("2026-08-30T00:00:00.000Z"));
  const input = {
    profile,
    cycle: 1,
    drawingEvidence: profile.drawings.map((drawing) => drawingEvidence(profile, drawing)),
    sequenceEvidence: sequenceEvidence(),
  };
  const decision = reviewAnimationProductionProfile(input, new Date("2026-08-30T01:00:00.000Z"));
  assert.equal(decision.status, "accepted");
  assert.match(decision.failureFingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.match(decision.decisionDigest, /^sha256:[0-9a-f]{64}$/);
  assert.doesNotThrow(() => assertAnimationProductionReviewIntegrity(input, decision));
  assert.throws(
    () => assertAnimationProductionReviewIntegrity(input, { ...decision, status: "blocked" }),
    /DIGEST_MISMATCH|INTEGRITY_MISMATCH/,
  );
});

test("requires sequence failures to name exact repairable drawings", () => {
  const profile = compileAnimationProductionProfile(example);
  assert.throws(
    () => reviewAnimationProductionProfile({
      profile,
      cycle: 1,
      drawingEvidence: profile.drawings.map((drawing) => drawingEvidence(profile, drawing)),
      sequenceEvidence: sequenceEvidence({ timingReadabilityScore: 0.1 }),
    }),
    /SEQUENCE_FAILURES_REQUIRE_AFFECTED_DRAWINGS/,
  );
});

test("preserves all accepted drawings when one sequence pose is rejected", () => {
  const profile = compileAnimationProductionProfile(example);
  const affected = profile.drawings[Math.floor(profile.drawings.length / 2)];
  const decision = reviewAnimationProductionProfile({
    profile,
    cycle: 1,
    drawingEvidence: profile.drawings.map((drawing) => drawingEvidence(profile, drawing)),
    sequenceEvidence: sequenceEvidence({
      motionReadabilityScore: 0.1,
      affectedDrawingIds: [affected.id],
    }),
  });
  assert.equal(decision.status, "rework-required");
  assert.deepEqual(decision.rejectedDrawingIds, [affected.id]);
  assert.equal(decision.retryQueue.length, 1);
  assert.equal(decision.retryQueue[0].preserveDrawingIds.length, profile.drawings.length - 1);
  assert.ok(decision.retryQueue[0].preserveDrawingIds.includes(profile.drawings.at(-1).id) || affected.id === profile.drawings.at(-1).id);
});

test("normalises integer duration weights without changing authored duration", () => {
  const profile = compileAnimationProductionProfile(example);
  const decision = reviewAnimationProductionProfile({
    profile,
    cycle: 1,
    drawingEvidence: profile.drawings.map((drawing) => drawingEvidence(profile, drawing)),
    sequenceEvidence: sequenceEvidence(),
  });
  const clip = compileAcceptedRuntimeClip(profile, decision);
  const sourceSeconds = profile.drawings.reduce((sum, drawing) => sum + drawing.exposureFrames, 0) / profile.request.sourceFramesPerSecond;
  const runtimeSeconds = clip.frameDurations.reduce((sum, duration) => sum + duration, 0) / clip.framesPerSecond;
  assert.equal(runtimeSeconds, sourceSeconds);
  assert.ok(clip.frameDurations.every((duration) => Number.isSafeInteger(duration) && duration > 0));
});

test("rejects a stale or tampered previous decision", () => {
  const profile = compileAnimationProductionProfile(example);
  const evidence = profile.drawings.map((drawing) =>
    drawingEvidence(profile, drawing, drawing.id === profile.drawings[0].id
      ? { scores: { ...drawingEvidence(profile, drawing).scores, identity: 0.1 } }
      : {}),
  );
  const first = reviewAnimationProductionProfile({ profile, cycle: 1, drawingEvidence: evidence });
  assert.throws(
    () => reviewAnimationProductionProfile({
      profile,
      cycle: 2,
      drawingEvidence: evidence,
      previousDecision: { ...first, noProgressCycles: 99 },
    }),
    /DIGEST_MISMATCH/,
  );
});
