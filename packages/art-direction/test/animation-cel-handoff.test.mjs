import assert from "node:assert/strict";
import test from "node:test";

import {
  ART_STUDIO_ANIMATION_HANDOFF_SCHEMA,
  compileAnimationDirectorPlan,
  compileArtStudioCelAnimationHandoff,
} from "../dist/index.js";

const artifact = (hex) => `artifact_${hex.repeat(64)}`;

function plan(overrides = {}) {
  return compileAnimationDirectorPlan({
    clipId: "hero-walk-right",
    subjectId: "hero",
    action: "walk",
    direction: "right",
    motionStyle: "traditional-cel",
    fps: 12,
    canvas: { width: 640, height: 480 },
    canonicalIdentityArtifactId: artifact("a"),
    directionMasterArtifactId: artifact("b"),
    ...overrides,
  });
}

test("compiles a digest-bound traditional-cel intake without inventing an X-sheet", () => {
  const handoff = compileArtStudioCelAnimationHandoff(plan());
  assert.equal(handoff.schema, ART_STUDIO_ANIMATION_HANDOFF_SCHEMA);
  assert.equal(handoff.productionRoute, "cel-animation-studio");
  assert.equal(handoff.framesPerSecond, 12);
  assert.match(handoff.handoffDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(handoff.runId, handoff.handoffDigest.slice(7, 27));
  assert.deepEqual(
    handoff.motionGuidance.filter((entry) => entry.suggestedKeyPose).map((entry) => entry.frameNumber),
    [1, 5],
  );
  assert.deepEqual(handoff.celAuthority, {
    xSheetTiming: "cel-animation-studio",
    exposureAndHolds: "cel-animation-studio",
    drawingRoles: "cel-animation-studio",
    uniqueDrawingCount: "cel-animation-studio",
  });
  assert.ok(Object.values(handoff.authority).every((value) => value === false));
});

test("rejects non-cel routes and FPS values the Cel production brief cannot represent", () => {
  assert.throws(
    () => compileArtStudioCelAnimationHandoff(plan({ motionStyle: "vga-adventure" })),
    /routes to art-studio-sprite/,
  );
  assert.throws(
    () => compileArtStudioCelAnimationHandoff(plan({ fps: 10 })),
    /accepts 12, 24, 25 or 30 FPS/,
  );
});

test("rejects a Director plan mutated after compilation", () => {
  const changed = plan();
  changed.frames[0].phase = 0.5;
  assert.throws(
    () => compileArtStudioCelAnimationHandoff(changed),
    /not canonical or was mutated/,
  );
});
