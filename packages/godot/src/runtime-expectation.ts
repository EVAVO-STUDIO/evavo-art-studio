import { createHash } from "node:crypto";

import {
  verifyGodotAnimationDescriptor,
  type GodotAnimationAcceptanceExpectation,
} from "./animation-acceptance.js";
import {
  GodotSpritePackageError,
  type GodotSpriteFramesDescriptor,
} from "./types.js";

export const GODOT_SPRITE_ANIMATION_RUNTIME_EXPECTATION_SCHEMA =
  "evavo.godot-sprite-animation-runtime-expectation.v1" as const;

export interface GodotSpriteAnimationRuntimeExpectationCompileRequest {
  readonly descriptor: GodotSpriteFramesDescriptor;
  readonly descriptorSha256: string;
  readonly animationDirectorPlanSha256: string;
  readonly animation: GodotAnimationAcceptanceExpectation;
  readonly maximumFrameTimingErrorMs?: number;
  readonly maximumPivotDriftPixels?: number;
}

export interface GodotSpriteAnimationRuntimeExpectation {
  readonly schema: typeof GODOT_SPRITE_ANIMATION_RUNTIME_EXPECTATION_SCHEMA;
  readonly clipId: string;
  readonly animationDirectorPlanSha256: string;
  readonly godotDescriptorSha256: string;
  readonly frameIds: readonly string[];
  readonly frameDurationMicros: readonly number[];
  readonly framesPerSecond: number;
  readonly loopMode: "none" | "linear" | "ping-pong";
  readonly maximumFrameTimingErrorMs: number;
  readonly maximumPivotDriftPixels: number;
  readonly authority: Readonly<{
    automaticApproval: false;
    creativeApproval: false;
    nativeVisualApproval: false;
    candidatePromotion: false;
    gameRepositoryMutation: false;
    gitCommit: false;
    gitPush: false;
    publication: false;
    forcePush: false;
  }>;
  readonly expectationSha256: string;
  readonly runId: string;
}

const SHA256 = /^[a-f0-9]{64}$/;

function fail(code: string, message: string): never {
  throw new GodotSpritePackageError(code, message);
}

function sha(value: unknown, field: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(
      "GODOT_ANIMATION_RUNTIME_EXPECTATION_INVALID",
      `${field} must be 64 lowercase hexadecimal characters.`,
    );
  }
  return value;
}

function boundedInteger(
  value: unknown,
  field: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const resolved = value === undefined ? fallback : value;
  if (
    typeof resolved !== "number" ||
    !Number.isInteger(resolved) ||
    resolved < minimum ||
    resolved > maximum
  ) {
    fail(
      "GODOT_ANIMATION_RUNTIME_EXPECTATION_INVALID",
      `${field} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return resolved;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function durationMicros(durationMs: number, frameId: string): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    fail(
      "GODOT_ANIMATION_RUNTIME_EXPECTATION_INVALID",
      `frame ${frameId} duration must be finite and greater than zero.`,
    );
  }
  const micros = Math.round(durationMs * 1000);
  if (!Number.isSafeInteger(micros) || micros <= 0) {
    fail(
      "GODOT_ANIMATION_RUNTIME_EXPECTATION_INVALID",
      `frame ${frameId} duration cannot be represented as integer microseconds.`,
    );
  }
  return micros;
}

export function compileGodotSpriteAnimationRuntimeExpectation(
  request: GodotSpriteAnimationRuntimeExpectationCompileRequest,
): GodotSpriteAnimationRuntimeExpectation {
  if (!request || typeof request !== "object") {
    fail(
      "GODOT_ANIMATION_RUNTIME_EXPECTATION_INVALID",
      "request must be an object.",
    );
  }
  const descriptorSha256 = sha(request.descriptorSha256, "descriptorSha256");
  const animationDirectorPlanSha256 = sha(
    request.animationDirectorPlanSha256,
    "animationDirectorPlanSha256",
  );
  const acceptance = verifyGodotAnimationDescriptor(
    request.descriptor,
    request.animation,
  );
  if (!acceptance.passed) {
    fail(
      "GODOT_ANIMATION_RUNTIME_EXPECTATION_DESCRIPTOR_BLOCKED",
      `Godot descriptor acceptance failed: ${acceptance.checks
        .filter((check) => !check.passed)
        .map((check) => check.id)
        .join(", ")}`,
    );
  }

  const animation = request.descriptor.animations.find(
    (entry) => entry.name === request.animation.animationName,
  );
  if (!animation) {
    fail(
      "GODOT_ANIMATION_RUNTIME_EXPECTATION_DESCRIPTOR_BLOCKED",
      "accepted animation is missing from the descriptor.",
    );
  }
  const frameDurationMicros = animation.frames.map((frame) =>
    durationMicros(frame.durationMs, frame.frameId),
  );

  // Wall-clock frame-change observations are scheduler/render-cadence evidence,
  // not the authored timing source of truth. Exact configured timing is checked
  // independently from SpriteFrames metadata in Test Lab; 20 ms avoids making
  // a healthy 60 Hz desktop fail because one signal arrived on the next render tick.
  const maximumFrameTimingErrorMs = boundedInteger(
    request.maximumFrameTimingErrorMs,
    "maximumFrameTimingErrorMs",
    20,
    1,
    1000,
  );
  const maximumPivotDriftPixels = boundedInteger(
    request.maximumPivotDriftPixels,
    "maximumPivotDriftPixels",
    0,
    0,
    1024,
  );

  const body = {
    schema: GODOT_SPRITE_ANIMATION_RUNTIME_EXPECTATION_SCHEMA,
    clipId: request.animation.animationName,
    animationDirectorPlanSha256,
    godotDescriptorSha256: descriptorSha256,
    frameIds: [...request.animation.frameIds],
    frameDurationMicros,
    framesPerSecond: request.animation.framesPerSecond,
    loopMode: request.animation.loopMode,
    maximumFrameTimingErrorMs,
    maximumPivotDriftPixels,
    authority: {
      automaticApproval: false as const,
      creativeApproval: false as const,
      nativeVisualApproval: false as const,
      candidatePromotion: false as const,
      gameRepositoryMutation: false as const,
      gitCommit: false as const,
      gitPush: false as const,
      publication: false as const,
      forcePush: false as const,
    },
  };
  const expectationSha256 = digest(body);
  return {
    ...body,
    expectationSha256,
    runId: expectationSha256.slice(0, 20),
  };
}
