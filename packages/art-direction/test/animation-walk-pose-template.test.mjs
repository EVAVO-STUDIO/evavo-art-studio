import assert from "node:assert/strict";
import test from "node:test";

import {
  compileAnimationDirectorPlan,
  compileSideViewBipedWalkPoseControls,
} from "../dist/index.js";

const artifact = (hex) => `artifact_${hex.repeat(64)}`;

function plan(direction = "right", overrides = {}) {
  return compileAnimationDirectorPlan({
    clipId: `hero-walk-${direction}`,
    subjectId: "hero",
    action: "walk",
    direction,
    motionStyle: "vga-adventure",
    canvas: { width: 96, height: 128 },
    canonicalIdentityArtifactId: artifact("a"),
    directionMasterArtifactId: artifact("b"),
    ...overrides,
  });
}

test("compiles eight canonical pose controls with a real template digest", () => {
  const set = compileSideViewBipedWalkPoseControls(plan());
  assert.equal(set.poses.length, 8);
  assert.match(set.templateSha256, /^[a-f0-9]{64}$/);
  assert.match(set.animationDirectorPlanSha256, /^[a-f0-9]{64}$/);
  assert.ok(set.poses.every((pose) => pose.source.configSha256 === set.templateSha256));
  assert.deepEqual(set.poses.map((pose) => pose.frameNumber), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("locks the declared stance foot across each four-frame support phase", () => {
  const set = compileSideViewBipedWalkPoseControls(plan());
  const firstHalf = set.poses.slice(0, 4).map((pose) => pose.landmarks.leftFoot);
  assert.ok(firstHalf.every((point) => point.x === firstHalf[0].x && point.y === firstHalf[0].y));
  const secondHalf = set.poses.slice(4).map((pose) => pose.landmarks.rightFoot);
  assert.ok(secondHalf.every((point) => point.x === secondHalf[0].x && point.y === secondHalf[0].y));
});

test("left-facing controls are exact horizontal mirrors of right-facing controls", () => {
  const right = compileSideViewBipedWalkPoseControls(plan("right"));
  const left = compileSideViewBipedWalkPoseControls(plan("left"));
  for (let index = 0; index < 8; index += 1) {
    for (const landmarkId of Object.keys(right.poses[index].landmarks)) {
      const r = right.poses[index].landmarks[landmarkId];
      const l = left.poses[index].landmarks[landmarkId];
      assert.ok(Math.abs(l.x - (1 - r.x)) < 1e-12, `${landmarkId} x mirror mismatch`);
      assert.equal(l.y, r.y);
    }
  }
});

test("refuses unsupported directions and traditional-cel routing", () => {
  assert.throws(
    () => compileSideViewBipedWalkPoseControls(plan("up")),
    /supports only left or right directions/,
  );
  assert.throws(
    () => compileSideViewBipedWalkPoseControls(plan("right", { motionStyle: "traditional-cel" })),
    /route to Cel Animation Studio/,
  );
});

test("rejects a Director plan mutated after compilation", () => {
  const input = plan();
  input.frames[0].plantedFoot = "right";
  assert.throws(
    () => compileSideViewBipedWalkPoseControls(input),
    /noncanonical or was mutated/,
  );
});
