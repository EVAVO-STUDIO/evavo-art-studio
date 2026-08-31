import assert from "node:assert/strict";
import test from "node:test";

import {
  EVA_CANONICAL_PROFILE_BUNDLE_VERSION,
  compileEvaCanonicalProfileBundle,
  compileEvaCanonicalProfileRequest,
} from "../tools/eva_avatar_canonical_profile_adapter_v1.mjs";
import { assertAnimationProductionProfileIntegrity } from "../tools/animation_production_profile_v1.mjs";

const SHA = "a".repeat(64);

function suitePlanFixture() {
  return {
    schema: "evavo.project-art-avatar-animation-suite-plan.v3",
    characterId: "eva-female",
    compiledAt: "2026-08-31T04:00:00.000Z",
    planSha256: "b".repeat(64),
    targetCanvas: { width: 1024, height: 1536 },
    animationIdentityMaster: {
      asset: {
        path: "assets/eva-female/candidates/eva-female-animation-master-v1.alpha.png",
        width: 1024,
        height: 1536,
        sha256: SHA,
      },
    },
    clips: [
      { id: "idle-primary", kind: "idle", loopMode: "loop", targetFrames: 36, fps: 24, performance: "quiet neutral breathing" },
      { id: "blink-single", kind: "blink", loopMode: "once", targetFrames: 9, fps: 30, performance: "natural blink" },
      { id: "talk-neutral", kind: "talk-loop", loopMode: "loop", targetFrames: 36, fps: 30, performance: "conversational neutral body cadence" },
      { id: "wave", kind: "wave", loopMode: "once", targetFrames: 32, fps: 30, performance: "clean greeting wave with stable fingers" },
    ],
  };
}

test("EVA suite clips compile into canonical authored drawing profiles rather than one drawing per presentation frame", () => {
  const bundle = compileEvaCanonicalProfileBundle(suitePlanFixture(), {
    generatedAt: "2026-08-31T04:05:00.000Z",
  });
  assert.equal(bundle.schema, EVA_CANONICAL_PROFILE_BUNDLE_VERSION);
  assert.deepEqual(bundle.faceOnlyClips, ["blink-single"]);
  assert.equal(bundle.bodyProfiles.length, 3);
  assert.ok(bundle.totals.uniqueDrawings < bundle.totals.logicalPresentationFrames);

  const idle = bundle.bodyProfiles.find((entry) => entry.clipId === "idle-primary");
  assert.equal(idle.productionClass, "hybrid");
  assert.equal(idle.logicalPresentationFrames, 36);
  assert.ok(idle.uniqueDrawings >= 4 && idle.uniqueDrawings < 36);
  assert.equal(idle.plan.targetPlans[0].timingMode, "x-sheet-exposure");
  assert.ok(idle.plan.drawings.some((drawing) => drawing.exposureFrames > 1));
  assertAnimationProductionProfileIntegrity(idle.plan);
});

test("blink clips are explicitly face-only and do not create body generation plans", () => {
  const plan = suitePlanFixture();
  assert.equal(compileEvaCanonicalProfileRequest(plan, plan.clips[1]), null);
});

test("wave remains drawing-dominant while retaining both-key dependency semantics for generated inbetweens", () => {
  const bundle = compileEvaCanonicalProfileBundle(suitePlanFixture(), {
    generatedAt: "2026-08-31T04:05:00.000Z",
  });
  const wave = bundle.bodyProfiles.find((entry) => entry.clipId === "wave");
  assert.equal(wave.productionClass, "drawing");
  assert.ok(wave.plan.drawings.some((drawing) => drawing.generationClass === "inbetween"));
  for (const drawing of wave.plan.drawings.filter((entry) => entry.generationClass === "inbetween")) {
    assert.ok(drawing.dependencyDrawingIds.length >= 1);
    assert.ok(drawing.dependencyDrawingIds.every((id) => typeof id === "string" && id.length > 0));
  }
});

test("adapter fails closed without a hash-bound animation identity master", () => {
  const plan = suitePlanFixture();
  plan.animationIdentityMaster = null;
  assert.throws(
    () => compileEvaCanonicalProfileBundle(plan),
    /EVA_CANONICAL_PROFILE_ANIMATION_MASTER_REQUIRED/u,
  );
});
