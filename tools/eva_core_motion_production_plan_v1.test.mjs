import assert from "node:assert/strict";
import test from "node:test";

import {
  EVA_CORE_BODY_CLIPS,
  EVA_CORE_MOTION_PRODUCTION_PLAN_VERSION,
  compileEvaCoreMotionProductionPlan,
} from "./eva_core_motion_production_plan_v1.mjs";

const sha = "a".repeat(64);

function clip(id, kind, loopMode, targetFrames, fps, performance) {
  return { id, kind, loopMode, targetFrames, fps, performance };
}

function suitePlan() {
  return {
    schema: "evavo.project-art-avatar-animation-suite-plan.v3",
    characterId: "eva-female",
    planSha256: "b".repeat(64),
    compiledAt: "2026-08-31T00:00:00.000Z",
    targetCanvas: { width: 1024, height: 1536 },
    animationIdentityMaster: {
      asset: { sha256: sha },
    },
    clips: [
      clip("idle-primary", "idle", "loop", 36, 24, "quiet neutral breathing"),
      clip("attention", "idle", "loop", 30, 24, "alert neutral attention"),
      clip("listening", "listening", "loop", 40, 24, "engaged listening"),
      clip("thinking", "thinking", "ping-pong", 40, 24, "considered thinking"),
      clip("talk-in", "talk-in", "once", 12, 30, "neutral-to-speaking transition"),
      clip("talk-neutral", "talk-loop", "loop", 36, 30, "conversational neutral body cadence"),
      clip("talk-out", "talk-out", "once", 12, 30, "speaking-to-neutral transition"),
      clip("blink-single", "blink", "once", 9, 30, "natural blink"),
    ],
  };
}

test("EVA core plan executes the small proof pack instead of the whole legacy suite", () => {
  const plan = compileEvaCoreMotionProductionPlan(suitePlan(), {
    generatedAt: "2026-08-31T01:00:00.000Z",
  });
  assert.equal(plan.schema, EVA_CORE_MOTION_PRODUCTION_PLAN_VERSION);
  assert.deepEqual(plan.coreBodyClips, EVA_CORE_BODY_CLIPS);
  assert.equal(plan.profiles.length, 7);
  assert.equal(plan.profiles[0].clipId, "idle-primary");
  assert.ok(plan.profiles.every((entry) => entry.uniqueDrawings < entry.logicalPresentationFrames));
  assert.ok(plan.totals.uniqueDrawings < plan.totals.logicalPresentationFrames);
  assert.deepEqual(
    plan.stages.map((entry) => entry.id),
    [
      "source-reconciliation",
      "idle-proof",
      "attention-system",
      "speech-body-system",
      "registered-face-core",
      "runtime-proof",
    ],
  );
  assert.equal(plan.productionPolicy.reuseReviewedSourcesBeforeGeneration, true);
  assert.equal(plan.productionPolicy.localAiBeforeProvider, true);
  assert.equal(plan.productionPolicy.xSheetExposureInsteadOfDuplicateFrames, true);
  assert.equal(plan.authority.providerExecution, false);
});

test("EVA core plan fails closed when a required proof clip is absent", () => {
  const value = suitePlan();
  value.clips = value.clips.filter((entry) => entry.id !== "idle-primary");
  assert.throws(
    () => compileEvaCoreMotionProductionPlan(value),
    /EVA_CORE_CLIPS_MISSING/u,
  );
});
