import assert from "node:assert/strict";
import test from "node:test";

import { verifyGodotAnimationDescriptor } from "../dist/index.js";

function descriptor(overrides = {}) {
  return {
    schemaVersion: "1.0",
    generatorVersion: "2026-07-29.1",
    targetEngine: "Godot 4.6.2",
    atlasId: "hero",
    atlasTexturePath: "res://art/hero.png",
    outputResourcePath: "res://art/hero.sprite_frames.tres",
    textureFiltering: "nearest",
    frames: [1, 2, 3].map((frame) => ({
      id: `walk-${frame}`,
      region: { x: (frame - 1) * 32, y: 0, width: 32, height: 48 },
      trim: { x: 0, y: 0, width: 32, height: 48 },
      sourceSize: { width: 32, height: 48 },
      pivot: { x: 16, y: 46 },
      empty: false,
    })),
    animations: [
      {
        name: "walk-right",
        loopMode: "linear",
        loopModeValue: 1,
        framesPerSecond: 8,
        totalDurationMs: 375,
        frames: [1, 2, 3].map((frame) => ({
          frameId: `walk-${frame}`,
          durationMs: 125,
          relativeDuration: 1,
        })),
      },
    ],
    ...overrides,
  };
}

function expectation(overrides = {}) {
  return {
    animationName: "walk-right",
    frameIds: ["walk-1", "walk-2", "walk-3"],
    framesPerSecond: 8,
    loopMode: "linear",
    expectedPivot: { x: 16, y: 46 },
    pivotTolerancePixels: 0,
    ...overrides,
  };
}

test("accepts exact frame order, timing, loop mode and pivot policy", () => {
  const report = verifyGodotAnimationDescriptor(descriptor(), expectation());
  assert.equal(report.passed, true);
  assert.ok(report.checks.every((check) => check.passed));
  assert.equal(report.authority.runtimeExecution, false);
  assert.equal(report.authority.visualApproval, false);
});

test("reports frame-order, timing and pivot drift without pretending to run Godot", () => {
  const changed = descriptor();
  changed.animations[0].frames = [
    changed.animations[0].frames[1],
    changed.animations[0].frames[0],
    changed.animations[0].frames[2],
  ];
  changed.animations[0].totalDurationMs = 999;
  changed.frames[1].pivot.x = 19;

  const report = verifyGodotAnimationDescriptor(changed, expectation());
  assert.equal(report.passed, false);
  assert.equal(report.checks.find((check) => check.id === "frame-order").passed, false);
  assert.equal(report.checks.find((check) => check.id === "frame-durations").passed, false);
  assert.equal(report.checks.find((check) => check.id === "pivot-stability").passed, false);
  assert.equal(report.authority.runtimeExecution, false);
});

test("fails closed when the requested animation is absent", () => {
  const report = verifyGodotAnimationDescriptor(
    descriptor({ animations: [] }),
    expectation(),
  );
  assert.equal(report.passed, false);
  assert.deepEqual(report.checks.map((check) => check.id), ["animation-exists"]);
});
