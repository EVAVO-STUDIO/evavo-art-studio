import assert from "node:assert/strict";
import test from "node:test";

import {
  ANIMATION_DIRECTOR_PLAN_KIND,
  compileAnimationDirectorPlan,
} from "../dist/index.js";

const artifact = (hex) => `artifact_${hex.repeat(64)}`;

function request(overrides = {}) {
  return {
    clipId: "hero-walk-right",
    subjectId: "hero",
    action: "walk",
    direction: "right",
    motionStyle: "vga-adventure",
    canvas: { width: 96, height: 128 },
    canonicalIdentityArtifactId: artifact("a"),
    directionMasterArtifactId: artifact("b"),
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

test("locks identity, anchors and provider-valid temporal roles", () => {
  const plan = compileAnimationDirectorPlan(request());

  assert.deepEqual(plan.qualityRequirements, {
    identityLocked: true,
    pivotLocked: true,
    baselineLocked: true,
    cameraLocked: true,
    loopClosureRequired: true,
    plantedFootDriftTolerancePixels: 1,
    rootLandmarkId: "root",
    requiredLandmarkIds: ["root", "leftFoot", "rightFoot"],
    loopClosureLandmarkIds: ["root"],
    maximumRootStepPixels: 4,
    loopClosureTolerancePixels: 2,
    alphaRequired: true,
  });
  assert.deepEqual(
    plan.frames.map((frame) => frame.plantedFoot),
    ["left", "left", "left", "left", "right", "right", "right", "right"],
  );
  assert.deepEqual(
    plan.frames.map((frame) => frame.plantedLandmarkId),
    ["leftFoot", "leftFoot", "leftFoot", "leftFoot", "rightFoot", "rightFoot", "rightFoot", "rightFoot"],
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
  for (const frameNumber of [2, 3, 4, 6, 7, 8]) {
    const frame = plan.frames[frameNumber - 1];
    assert.ok(frame.providerReferenceRoles.includes("previous-key-pose"));
    assert.ok(frame.providerReferenceRoles.includes("next-key-pose"));
  }
  assert.equal(plan.frames[0].providerReferenceRoles.includes("previous-key-pose"), false);
  assert.equal(plan.frames[4].providerReferenceRoles.includes("previous-key-pose"), false);
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

test("fails closed on malformed, unsupported or non-canonical runtime input", () => {
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
        request({ canonicalIdentityArtifactId: "artifact_identity_hero" }),
      ),
    /canonicalIdentityArtifactId must be a canonical artifact/,
  );
  assert.throws(
    () =>
      compileAnimationDirectorPlan(
        request({ directionMasterArtifactId: "artifact_direction_right" }),
      ),
    /directionMasterArtifactId must be a canonical artifact/,
  );
  assert.throws(
    () => compileAnimationDirectorPlan(request({ action: "run" })),
    /action must be walk/,
  );
  assert.throws(
    () => compileAnimationDirectorPlan(request({ motionStyle: "generic-ai" })),
    /motionStyle must be one of/,
  );
  assert.throws(
    () => compileAnimationDirectorPlan(request({ direction: "diagonal" })),
    /direction must be one of/,
  );
  assert.throws(
    () => compileAnimationDirectorPlan(request({ loop: "yes" })),
    /loop must be a boolean/,
  );
});

test("non-looping playback still keeps terminal key guidance for generation", () => {
  const plan = compileAnimationDirectorPlan(request({ loop: false }));
  assert.equal(plan.qualityRequirements.loopClosureRequired, false);
  assert.deepEqual(plan.generationBatches[2].dependsOnFrames, [5, 1]);
});
