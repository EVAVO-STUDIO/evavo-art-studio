import {
  GodotSpritePackageError,
  type GodotSpriteFramesDescriptor,
} from "./types.js";

export interface GodotAnimationAcceptanceExpectation {
  readonly animationName: string;
  readonly frameIds: readonly string[];
  readonly framesPerSecond: number;
  readonly loopMode: "none" | "linear" | "ping-pong";
  readonly expectedPivot?: Readonly<{ x: number; y: number }>;
  readonly pivotTolerancePixels?: number;
}

export interface GodotAnimationAcceptanceReport {
  readonly schemaVersion: "1.0";
  readonly animationName: string;
  readonly passed: boolean;
  readonly checks: readonly Readonly<{
    id: string;
    passed: boolean;
    message: string;
  }>[];
  readonly authority: Readonly<{
    runtimeExecution: false;
    visualApproval: false;
    releaseApproval: false;
  }>;
}

function fail(code: string, message: string): never {
  throw new GodotSpritePackageError(code, message);
}

function finitePositive(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    fail("GODOT_ANIMATION_ACCEPTANCE_INVALID", `${field} must be a finite number greater than zero.`);
  }
  return value;
}

function finiteNonNegative(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("GODOT_ANIMATION_ACCEPTANCE_INVALID", `${field} must be a finite number greater than or equal to zero.`);
  }
  return value;
}

export function verifyGodotAnimationDescriptor(
  descriptor: GodotSpriteFramesDescriptor,
  expectation: GodotAnimationAcceptanceExpectation,
): GodotAnimationAcceptanceReport {
  if (!descriptor || typeof descriptor !== "object") {
    fail("GODOT_ANIMATION_ACCEPTANCE_INVALID", "descriptor must be an object.");
  }
  if (!expectation || typeof expectation !== "object") {
    fail("GODOT_ANIMATION_ACCEPTANCE_INVALID", "expectation must be an object.");
  }
  if (typeof expectation.animationName !== "string" || !expectation.animationName.trim()) {
    fail("GODOT_ANIMATION_ACCEPTANCE_INVALID", "animationName must be non-empty.");
  }
  if (!Array.isArray(expectation.frameIds) || expectation.frameIds.length === 0) {
    fail("GODOT_ANIMATION_ACCEPTANCE_INVALID", "frameIds must contain at least one frame id.");
  }
  if (expectation.frameIds.some((frameId) => typeof frameId !== "string" || !frameId.trim())) {
    fail("GODOT_ANIMATION_ACCEPTANCE_INVALID", "frameIds must contain only non-empty strings.");
  }
  if (new Set(expectation.frameIds).size !== expectation.frameIds.length) {
    fail("GODOT_ANIMATION_ACCEPTANCE_INVALID", "frameIds must not contain duplicates.");
  }
  const expectedFps = finitePositive(expectation.framesPerSecond, "framesPerSecond");
  const pivotTolerance = finiteNonNegative(
    expectation.pivotTolerancePixels ?? 0,
    "pivotTolerancePixels",
  );

  const animation = descriptor.animations.find(
    (entry) => entry.name === expectation.animationName,
  );
  if (!animation) {
    return {
      schemaVersion: "1.0",
      animationName: expectation.animationName,
      passed: false,
      checks: [
        {
          id: "animation-exists",
          passed: false,
          message: `Animation ${expectation.animationName} is missing from the Godot descriptor.`,
        },
      ],
      authority: {
        runtimeExecution: false,
        visualApproval: false,
        releaseApproval: false,
      },
    };
  }

  const actualFrameIds = animation.frames.map((entry) => entry.frameId);
  const frameLookup = new Map(descriptor.frames.map((entry) => [entry.id, entry]));
  const checks: Array<{ id: string; passed: boolean; message: string }> = [];

  const orderMatches =
    actualFrameIds.length === expectation.frameIds.length &&
    actualFrameIds.every((frameId, index) => frameId === expectation.frameIds[index]);
  checks.push({
    id: "frame-order",
    passed: orderMatches,
    message: orderMatches
      ? "Animation frame order exactly matches the expected source order."
      : `Expected ${expectation.frameIds.join(", ")} but descriptor contains ${actualFrameIds.join(", ")}.`,
  });

  const allFramesExist = actualFrameIds.every((frameId) => frameLookup.has(frameId));
  checks.push({
    id: "frame-references",
    passed: allFramesExist,
    message: allFramesExist
      ? "Every animation frame references a declared atlas frame."
      : "One or more animation frames reference missing atlas-frame metadata.",
  });

  const fpsMatches = Math.abs(animation.framesPerSecond - expectedFps) <= 1e-9;
  checks.push({
    id: "frames-per-second",
    passed: fpsMatches,
    message: fpsMatches
      ? "Animation FPS exactly matches the expected authored cadence."
      : `Expected ${expectedFps} FPS but descriptor contains ${animation.framesPerSecond}.`,
  });

  const loopMatches = animation.loopMode === expectation.loopMode;
  checks.push({
    id: "loop-mode",
    passed: loopMatches,
    message: loopMatches
      ? "Animation loop mode matches the expected playback topology."
      : `Expected ${expectation.loopMode} but descriptor contains ${animation.loopMode}.`,
  });

  const durationsValid = animation.frames.every(
    (entry) =>
      Number.isFinite(entry.durationMs) &&
      entry.durationMs > 0 &&
      Number.isFinite(entry.relativeDuration) &&
      entry.relativeDuration > 0,
  );
  const summedDuration = animation.frames.reduce((sum, entry) => sum + entry.durationMs, 0);
  const totalDurationMatches =
    durationsValid && Math.abs(summedDuration - animation.totalDurationMs) <= 0.001;
  checks.push({
    id: "frame-durations",
    passed: totalDurationMatches,
    message: totalDurationMatches
      ? "Every frame has positive timing and totalDurationMs matches the frame-duration sum."
      : "Frame timing is invalid or totalDurationMs does not match the sum of frame durations.",
  });

  if (expectation.expectedPivot) {
    const pivotMatches = actualFrameIds.every((frameId) => {
      const frame = frameLookup.get(frameId);
      if (!frame) return false;
      return (
        Math.abs(frame.pivot.x - expectation.expectedPivot!.x) <= pivotTolerance &&
        Math.abs(frame.pivot.y - expectation.expectedPivot!.y) <= pivotTolerance
      );
    });
    checks.push({
      id: "pivot-stability",
      passed: pivotMatches,
      message: pivotMatches
        ? "Every animation frame pivot remains within the declared tolerance."
        : "One or more animation frame pivots drift beyond the declared tolerance.",
    });
  }

  return {
    schemaVersion: "1.0",
    animationName: expectation.animationName,
    passed: checks.every((entry) => entry.passed),
    checks,
    authority: {
      runtimeExecution: false,
      visualApproval: false,
      releaseApproval: false,
    },
  };
}
