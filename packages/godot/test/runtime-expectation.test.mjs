import assert from "node:assert/strict";
import test from "node:test";

import {
  GODOT_SPRITE_ANIMATION_RUNTIME_EXPECTATION_SCHEMA,
  GodotSpritePackageError,
  compileGodotSpriteAnimationRuntimeExpectation,
} from "../dist/index.js";

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
        totalDurationMs: 500,
        frames: [
          { frameId: "walk-1", durationMs: 125, relativeDuration: 1 },
          { frameId: "walk-2", durationMs: 250, relativeDuration: 2 },
          { frameId: "walk-3", durationMs: 125, relativeDuration: 1 },
        ],
      },
    ],
    ...overrides,
  };
}

function animation(overrides = {}) {
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

test("compiles a self-hashed Test Lab expectation only after descriptor acceptance", () => {
  const result = compileGodotSpriteAnimationRuntimeExpectation({
    descriptor: descriptor(),
    descriptorSha256: "a".repeat(64),
    animationDirectorPlanSha256: "b".repeat(64),
    animation: animation(),
    maximumPivotDriftPixels: 0,
  });

  assert.equal(result.schema, GODOT_SPRITE_ANIMATION_RUNTIME_EXPECTATION_SCHEMA);
  assert.equal(result.clipId, "walk-right");
  assert.deepEqual(result.frameIds, ["walk-1", "walk-2", "walk-3"]);
  assert.deepEqual(result.frameDurationMicros, [125000, 250000, 125000]);
  assert.equal(result.maximumFrameTimingErrorMs, 20);
  assert.equal(result.maximumPivotDriftPixels, 0);
  assert.match(result.expectationSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.runId, result.expectationSha256.slice(0, 20));
  assert.ok(Object.values(result.authority).every((value) => value === false));
});

test("allows a stricter explicit observed-cadence tolerance when a lane can support it", () => {
  const result = compileGodotSpriteAnimationRuntimeExpectation({
    descriptor: descriptor(),
    descriptorSha256: "a".repeat(64),
    animationDirectorPlanSha256: "b".repeat(64),
    animation: animation(),
    maximumFrameTimingErrorMs: 3,
  });
  assert.equal(result.maximumFrameTimingErrorMs, 3);
});

test("fails closed when descriptor semantics do not match the requested runtime expectation", () => {
  assert.throws(
    () =>
      compileGodotSpriteAnimationRuntimeExpectation({
        descriptor: descriptor(),
        descriptorSha256: "a".repeat(64),
        animationDirectorPlanSha256: "b".repeat(64),
        animation: animation({ frameIds: ["walk-2", "walk-1", "walk-3"] }),
      }),
    (error) =>
      error instanceof GodotSpritePackageError &&
      error.code === "GODOT_ANIMATION_RUNTIME_EXPECTATION_DESCRIPTOR_BLOCKED",
  );
});

test("requires canonical hashes and integer cross-runtime tolerances", () => {
  assert.throws(
    () =>
      compileGodotSpriteAnimationRuntimeExpectation({
        descriptor: descriptor(),
        descriptorSha256: "bad",
        animationDirectorPlanSha256: "b".repeat(64),
        animation: animation(),
      }),
    /descriptorSha256/,
  );
  assert.throws(
    () =>
      compileGodotSpriteAnimationRuntimeExpectation({
        descriptor: descriptor(),
        descriptorSha256: "a".repeat(64),
        animationDirectorPlanSha256: "b".repeat(64),
        animation: animation(),
        maximumPivotDriftPixels: 0.25,
      }),
    /maximumPivotDriftPixels must be an integer/,
  );
});
