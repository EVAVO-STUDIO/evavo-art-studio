import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTHORED_ANIMATION_DIRECTOR_PLAN_KIND,
  AUTHORED_ANIMATION_DIRECTOR_PROTOCOL_VERSION,
  compileAuthoredAnimationDirectorPlan,
} from "../dist/index.js";

const artifact = (hex) => "artifact_" + hex.repeat(64);

function attackRequest(overrides = {}) {
  return {
    clipId: "hero-heavy-attack-right",
    subjectId: "hero",
    action: "heavy-attack",
    direction: "right",
    motionStyle: "arcade-snappy",
    fps: 10,
    canvas: { width: 96, height: 128 },
    canonicalIdentityArtifactId: artifact("a"),
    directionMasterArtifactId: artifact("b"),
    loop: false,
    frames: [
      {
        role: "anticipation",
        keyPose: true,
        groundContactRequired: true,
        contactLandmarkId: "root",
      },
      {
        role: "windup",
        keyPose: false,
        groundContactRequired: true,
        contactLandmarkId: "root",
      },
      {
        role: "strike",
        keyPose: true,
        groundContactRequired: true,
        contactLandmarkId: "root",
      },
      {
        role: "follow-through",
        keyPose: false,
        groundContactRequired: true,
        contactLandmarkId: "root",
      },
      {
        role: "recovery",
        keyPose: true,
        groundContactRequired: true,
        contactLandmarkId: "root",
      },
    ],
    structure: {
      rootLandmarkId: "root",
      requiredLandmarkIds: [
        "root",
        "weaponHand",
        "weaponTip",
      ],
      loopClosureLandmarkIds: ["root"],
      maximumRootStepPixels: 5,
      loopClosureTolerancePixels: 2,
      contactDriftTolerancePixels: 1,
    },
    ...overrides,
  };
}

test("compiles arbitrary non-walk authored clips into deterministic key/in-between batches", () => {
  const plan = compileAuthoredAnimationDirectorPlan(
    attackRequest(),
  );

  assert.equal(
    plan.kind,
    AUTHORED_ANIMATION_DIRECTOR_PLAN_KIND,
  );
  assert.equal(
    plan.protocolVersion,
    AUTHORED_ANIMATION_DIRECTOR_PROTOCOL_VERSION,
  );
  assert.equal(plan.action, "heavy-attack");
  assert.equal(plan.loop, false);
  assert.equal(plan.frames.length, 5);
  assert.deepEqual(
    plan.frames.map((frame) => frame.role),
    [
      "anticipation",
      "windup",
      "strike",
      "follow-through",
      "recovery",
    ],
  );
  assert.deepEqual(plan.generationBatches, [
    {
      id: "hero-heavy-attack-right:keys",
      phase: "key-pose",
      frames: [1, 3, 5],
      dependsOnFrames: [],
      maximumCandidatesPerFrame: 4,
    },
    {
      id: "hero-heavy-attack-right:inbetweens-01",
      phase: "in-between",
      frames: [2],
      dependsOnFrames: [1, 3],
      maximumCandidatesPerFrame: 3,
    },
    {
      id: "hero-heavy-attack-right:inbetweens-02",
      phase: "in-between",
      frames: [4],
      dependsOnFrames: [3, 5],
      maximumCandidatesPerFrame: 3,
    },
  ]);
});

test("looped authored clips create a deterministic wrap segment", () => {
  const plan = compileAuthoredAnimationDirectorPlan({
    ...attackRequest(),
    clipId: "creature-tail-loop",
    action: "tail-swish",
    loop: true,
    frames: [
      {
        role: "neutral",
        keyPose: true,
        groundContactRequired: true,
        contactLandmarkId: "root",
      },
      {
        role: "sweep-left",
        keyPose: false,
        groundContactRequired: true,
        contactLandmarkId: "root",
      },
      {
        role: "left-extreme",
        keyPose: true,
        groundContactRequired: true,
        contactLandmarkId: "root",
      },
      {
        role: "sweep-right",
        keyPose: false,
        groundContactRequired: true,
        contactLandmarkId: "root",
      },
      {
        role: "right-extreme",
        keyPose: true,
        groundContactRequired: true,
        contactLandmarkId: "root",
      },
      {
        role: "return",
        keyPose: false,
        groundContactRequired: true,
        contactLandmarkId: "root",
      },
    ],
  });

  assert.deepEqual(plan.generationBatches, [
    {
      id: "creature-tail-loop:keys",
      phase: "key-pose",
      frames: [1, 3, 5],
      dependsOnFrames: [],
      maximumCandidatesPerFrame: 4,
    },
    {
      id: "creature-tail-loop:inbetweens-01",
      phase: "in-between",
      frames: [2],
      dependsOnFrames: [1, 3],
      maximumCandidatesPerFrame: 3,
    },
    {
      id: "creature-tail-loop:inbetweens-02",
      phase: "in-between",
      frames: [4],
      dependsOnFrames: [3, 5],
      maximumCandidatesPerFrame: 3,
    },
    {
      id: "creature-tail-loop:inbetweens-03",
      phase: "in-between",
      frames: [6],
      dependsOnFrames: [5, 1],
      maximumCandidatesPerFrame: 3,
    },
  ]);
});

test("authored clips preserve rational per-frame timing and arbitrary structural landmarks", () => {
  const plan = compileAuthoredAnimationDirectorPlan({
    ...attackRequest(),
    frames: [
      {
        role: "anticipation",
        keyPose: true,
        duration: { numeratorMs: 200, denominator: 1 },
        groundContactRequired: true,
        contactLandmarkId: "root",
      },
      {
        role: "strike",
        keyPose: true,
        duration: { numeratorMs: 1000, denominator: 24 },
        groundContactRequired: false,
      },
    ],
    structure: {
      rootLandmarkId: "root",
      requiredLandmarkIds: [
        "root",
        "weaponHand",
        "weaponTip",
      ],
      loopClosureLandmarkIds: ["root", "weaponHand"],
    },
  });

  assert.deepEqual(plan.frames[0].duration, {
    numeratorMs: 200,
    denominator: 1,
  });
  assert.deepEqual(plan.frames[1].duration, {
    numeratorMs: 1000,
    denominator: 24,
  });
  assert.equal(plan.frames[0].plantedLandmarkId, "root");
  assert.equal(plan.frames[0].plantedFoot, "none");
  assert.deepEqual(
    plan.qualityRequirements.requiredLandmarkIds,
    ["root", "weaponHand", "weaponTip"],
  );
  assert.deepEqual(
    plan.qualityRequirements.loopClosureLandmarkIds,
    ["root", "weaponHand"],
  );
});

test("all-key-pose clips are valid and require no in-between batches", () => {
  const plan = compileAuthoredAnimationDirectorPlan({
    ...attackRequest(),
    clipId: "hero-two-pose-gesture",
    action: "gesture",
    frames: [
      {
        role: "start",
        keyPose: true,
        groundContactRequired: true,
        contactLandmarkId: "root",
      },
      {
        role: "end",
        keyPose: true,
        groundContactRequired: true,
        contactLandmarkId: "root",
      },
    ],
  });
  assert.equal(plan.generationBatches.length, 1);
  assert.equal(plan.generationBatches[0].phase, "key-pose");
  assert.deepEqual(plan.generationBatches[0].frames, [1, 2]);
});

test("authored director fails closed on topology and landmark ambiguity", () => {
  assert.throws(
    () =>
      compileAuthoredAnimationDirectorPlan({
        ...attackRequest(),
        frames: attackRequest().frames.map((frame, index) => ({
          ...frame,
          keyPose: index === 2 || index === 4,
        })),
      }),
    /frame 1 must be a key pose/u,
  );

  assert.throws(
    () =>
      compileAuthoredAnimationDirectorPlan({
        ...attackRequest(),
        frames: [
          {
            role: "start",
            keyPose: true,
            groundContactRequired: true,
            contactLandmarkId: "unknown-anchor",
          },
          {
            role: "end",
            keyPose: true,
            groundContactRequired: true,
            contactLandmarkId: "root",
          },
        ],
      }),
    /contactLandmarkId must be one required landmark/u,
  );

  assert.throws(
    () =>
      compileAuthoredAnimationDirectorPlan({
        ...attackRequest(),
        loop: false,
        frames: [
          {
            role: "start",
            keyPose: true,
            groundContactRequired: true,
            contactLandmarkId: "root",
          },
          {
            role: "middle",
            keyPose: false,
            groundContactRequired: true,
            contactLandmarkId: "root",
          },
        ],
      }),
    /final frame to be a key pose/u,
  );
});
