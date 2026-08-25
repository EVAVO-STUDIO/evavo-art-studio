import assert from "node:assert/strict";
import test from "node:test";

import {
  ANIMATION_DIRECTOR_PLAN_KIND,
  compileAnimationDirectorPlan,
} from "../dist/index.js";

function request(overrides = {}) {
  return {
    clipId: "hero-walk-right",
    subjectId: "hero",
    action: "walk",
    direction: "right",
    motionStyle: "vga-adventure",
    canvas: { width: 96, height: 128 },
    canonicalIdentityArtifactId: "artifact_identity_hero",
    directionMasterArtifactId: "artifact_direction_right",
    ...overrides,
  };
}

test("plans an eight-drawing walk from two key contacts and bounded in-betweens", () => {
  const plan = compileAnimationDirectorPlan(request());

  assert.equal(plan.kind, ANIMATION_DIRECTOR_PLAN_KIND);
  assert.equal(plan.fps, 8);
  assert.equal(plan.loop, true);
  assert.deepEqual(
    plan.frames.map((frame) => frame.role),
    ["contact", "down", "passing", "up", "contact", "down", "passing", "up"],
  );
  assert.deepEqual(plan.generationBatches, [
    {
      id: "hero-walk-right:keys",
      phase: "key-pose",
      frames: [1, 5],
      dependsOnFrames: [],
      maximumCandidatesPerFrame: 4,
    },
    {
      id: "hero-walk-right:inbetweens-a",
      phase: "in-between",
      frames: [2, 3, 4],
      dependsOnFrames: [1, 5],
      maximumCandidatesPerFrame: 3,
    },
    {
      id: "hero-walk-right:inbetweens-b",
      phase: "in-between",
      frames: [6, 7, 8],
      dependsOnFrames: [5, 1],
      maximumCandidatesPerFrame: 3,
    },
  ]);
});

test("locks identity, baseline, pivot, camera, alpha and planted-foot continuity", () => {
  const plan = compileAnimationDirectorPlan(request());

  assert.deepEqual(plan.qualityRequirements, {
    identityLocked: true,
    pivotLocked: true,
    baselineLocked: true,
    cameraLocked: true,
    loopClosureRequired: true,
    plantedFootDriftTolerancePixels: 1,
    alphaRequired: true,
  });
  assert.deepEqual(
    plan.frames.map((frame) => frame.plantedFoot),
    ["left", "left", "left", "left", "right", "right", "right", "right"],
  );
  assert.ok(
    plan.frames.every((frame) =>
      frame.providerReferenceRoles.includes("canonical-identity"),
    ),
  );
  assert.ok(
    plan.frames.every((frame) =>
      frame.providerReferenceRoles.includes("pose-control"),
    ),
  );
});

test("uses rational per-frame timing instead of rounding milliseconds", () => {
  const plan = compileAnimationDirectorPlan(
    request({ motionStyle: "cinematic-naturalistic", fps: 12 }),
  );

  assert.ok(
    plan.frames.every(
      (frame) =>
        frame.duration.numeratorMs === 1000 && frame.duration.denominator === 12,
    ),
  );
});

test("fails closed on invalid dimensions, fps and blank identity", () => {
  assert.throws(
    () => compileAnimationDirectorPlan(request({ fps: 31 })),
    /fps must be between 4 and 30/,
  );
  assert.throws(
    () =>
      compileAnimationDirectorPlan(
        request({ canvas: { width: 0, height: 128 } }),
      ),
    /canvas.width must be a positive integer/,
  );
  assert.throws(
    () =>
      compileAnimationDirectorPlan(
        request({ canonicalIdentityArtifactId: "   " }),
      ),
    /canonicalIdentityArtifactId must be non-empty/,
  );
});

test("non-looping clips do not fabricate a dependency back to frame one", () => {
  const plan = compileAnimationDirectorPlan(request({ loop: false }));
  assert.equal(plan.qualityRequirements.loopClosureRequired, false);
  assert.deepEqual(plan.generationBatches[2].dependsOnFrames, [5]);
});
