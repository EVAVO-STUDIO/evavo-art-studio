import { SpriteQualityInputError, type Point, type SpriteQualityGateResult } from "./types.js";

export const ANIMATION_MOTION_QUALITY_SCHEMA_VERSION = "1.0" as const;

export interface AnimationMotionFrameEvidence {
  readonly frameId: string;
  readonly frameIndex: number;
  readonly landmarks: Readonly<Record<string, Point>>;
  readonly plantedLandmarkId?: string;
}

export interface AnimationAttachmentConstraint {
  readonly id: string;
  readonly fromLandmarkId: string;
  readonly toLandmarkId: string;
  readonly maximumDistancePixels: number;
}

export interface AnimationMotionQualityRequest {
  readonly sequenceId: string;
  readonly loop: boolean;
  readonly plantedLandmarkDriftTolerancePixels: number;
  readonly rootLandmarkId?: string;
  readonly maximumRootStepPixels?: number;
  readonly loopClosureTolerancePixels?: number;
  readonly requiredLandmarkIds?: readonly string[];
  readonly attachmentConstraints?: readonly AnimationAttachmentConstraint[];
  readonly frames: readonly AnimationMotionFrameEvidence[];
}

export interface AnimationMotionQualityReport {
  readonly schemaVersion: typeof ANIMATION_MOTION_QUALITY_SCHEMA_VERSION;
  readonly sequenceId: string;
  readonly passed: boolean;
  readonly gates: readonly SpriteQualityGateResult[];
  readonly summary: Readonly<{
    frameCount: number;
    plantedSegments: number;
    attachmentConstraintCount: number;
  }>;
}

function finitePoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") return false;
  const point = value as Record<string, unknown>;
  return (
    typeof point.x === "number" &&
    Number.isFinite(point.x) &&
    typeof point.y === "number" &&
    Number.isFinite(point.y)
  );
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function gate(
  id: string,
  status: SpriteQualityGateResult["status"],
  blocking: boolean,
  message: string,
  evidence: Readonly<Record<string, unknown>>,
  value?: number | string | boolean,
  threshold?: number | string | boolean,
): SpriteQualityGateResult {
  return {
    id,
    status,
    blocking,
    message,
    ...(value !== undefined ? { value } : {}),
    ...(threshold !== undefined ? { threshold } : {}),
    evidence,
  };
}

function requireNonNegativeFinite(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new SpriteQualityInputError(
      "ANIMATION_MOTION_INVALID_THRESHOLD",
      `${field} must be a finite number greater than or equal to zero.`,
    );
  }
  return value;
}

function validateRequest(input: AnimationMotionQualityRequest): AnimationMotionQualityRequest {
  if (!input || typeof input !== "object") {
    throw new SpriteQualityInputError(
      "ANIMATION_MOTION_INVALID_REQUEST",
      "Animation motion quality request must be an object.",
    );
  }
  if (typeof input.sequenceId !== "string" || !input.sequenceId.trim()) {
    throw new SpriteQualityInputError(
      "ANIMATION_MOTION_INVALID_SEQUENCE_ID",
      "sequenceId must be non-empty.",
    );
  }
  if (typeof input.loop !== "boolean") {
    throw new SpriteQualityInputError(
      "ANIMATION_MOTION_INVALID_LOOP",
      "loop must be boolean.",
    );
  }
  requireNonNegativeFinite(
    input.plantedLandmarkDriftTolerancePixels,
    "plantedLandmarkDriftTolerancePixels",
  );
  if (input.maximumRootStepPixels !== undefined) {
    requireNonNegativeFinite(input.maximumRootStepPixels, "maximumRootStepPixels");
  }
  if (input.loopClosureTolerancePixels !== undefined) {
    requireNonNegativeFinite(input.loopClosureTolerancePixels, "loopClosureTolerancePixels");
  }
  if (!Array.isArray(input.frames) || input.frames.length < 2) {
    throw new SpriteQualityInputError(
      "ANIMATION_MOTION_FRAME_COUNT",
      "At least two motion-evidence frames are required.",
    );
  }

  const seenIndices = new Set<number>();
  for (const frame of input.frames) {
    if (!Number.isInteger(frame.frameIndex) || frame.frameIndex < 0) {
      throw new SpriteQualityInputError(
        "ANIMATION_MOTION_FRAME_INDEX",
        "frameIndex values must be non-negative integers.",
      );
    }
    if (seenIndices.has(frame.frameIndex)) {
      throw new SpriteQualityInputError(
        "ANIMATION_MOTION_DUPLICATE_FRAME_INDEX",
        `Duplicate frameIndex ${frame.frameIndex}.`,
      );
    }
    seenIndices.add(frame.frameIndex);
    if (typeof frame.frameId !== "string" || !frame.frameId.trim()) {
      throw new SpriteQualityInputError(
        "ANIMATION_MOTION_FRAME_ID",
        "Every motion-evidence frame requires a non-empty frameId.",
      );
    }
    for (const [landmarkId, point] of Object.entries(frame.landmarks ?? {})) {
      if (!landmarkId.trim() || !finitePoint(point)) {
        throw new SpriteQualityInputError(
          "ANIMATION_MOTION_INVALID_LANDMARK",
          `Frame ${frame.frameId} contains an invalid landmark.`,
        );
      }
    }
  }

  for (let index = 1; index < input.frames.length; index += 1) {
    if (input.frames[index]!.frameIndex <= input.frames[index - 1]!.frameIndex) {
      throw new SpriteQualityInputError(
        "ANIMATION_MOTION_FRAME_ORDER",
        "Motion-evidence frames must be supplied in ascending frameIndex order.",
      );
    }
  }

  for (const constraint of input.attachmentConstraints ?? []) {
    if (!constraint.id.trim() || !constraint.fromLandmarkId.trim() || !constraint.toLandmarkId.trim()) {
      throw new SpriteQualityInputError(
        "ANIMATION_MOTION_INVALID_ATTACHMENT",
        "Attachment constraints require non-empty ids and landmark ids.",
      );
    }
    requireNonNegativeFinite(
      constraint.maximumDistancePixels,
      `attachmentConstraints.${constraint.id}.maximumDistancePixels`,
    );
  }

  return input;
}

export function analyseAnimationMotion(
  input: AnimationMotionQualityRequest,
): AnimationMotionQualityReport {
  const request = validateRequest(input);
  const gates: SpriteQualityGateResult[] = [];

  const missingRequired: Array<{ frameId: string; landmarkId: string }> = [];
  for (const frame of request.frames) {
    for (const landmarkId of request.requiredLandmarkIds ?? []) {
      if (!frame.landmarks[landmarkId]) {
        missingRequired.push({ frameId: frame.frameId, landmarkId });
      }
    }
    if (request.rootLandmarkId && !frame.landmarks[request.rootLandmarkId]) {
      missingRequired.push({ frameId: frame.frameId, landmarkId: request.rootLandmarkId });
    }
    if (frame.plantedLandmarkId && !frame.landmarks[frame.plantedLandmarkId]) {
      missingRequired.push({ frameId: frame.frameId, landmarkId: frame.plantedLandmarkId });
    }
  }
  gates.push(
    gate(
      "motion-required-landmarks",
      missingRequired.length === 0 ? "pass" : "fail",
      true,
      missingRequired.length === 0
        ? "Every required motion landmark is present."
        : "One or more required motion landmarks are missing.",
      { missing: missingRequired },
    ),
  );

  const plantedSegments: Array<{
    landmarkId: string;
    startFrameId: string;
    endFrameId: string;
    maximumDriftPixels: number;
  }> = [];
  const plantedFailures: typeof plantedSegments = [];
  let start = 0;
  while (start < request.frames.length) {
    const landmarkId = request.frames[start]!.plantedLandmarkId;
    if (!landmarkId) {
      start += 1;
      continue;
    }
    let end = start;
    while (
      end + 1 < request.frames.length &&
      request.frames[end + 1]!.plantedLandmarkId === landmarkId
    ) {
      end += 1;
    }
    const anchor = request.frames[start]!.landmarks[landmarkId];
    let maximumDriftPixels = Number.POSITIVE_INFINITY;
    if (anchor) {
      maximumDriftPixels = 0;
      for (let index = start; index <= end; index += 1) {
        const point = request.frames[index]!.landmarks[landmarkId];
        if (!point) {
          maximumDriftPixels = Number.POSITIVE_INFINITY;
          break;
        }
        maximumDriftPixels = Math.max(maximumDriftPixels, distance(anchor, point));
      }
    }
    const segment = {
      landmarkId,
      startFrameId: request.frames[start]!.frameId,
      endFrameId: request.frames[end]!.frameId,
      maximumDriftPixels,
    };
    plantedSegments.push(segment);
    if (maximumDriftPixels > request.plantedLandmarkDriftTolerancePixels) {
      plantedFailures.push(segment);
    }
    start = end + 1;
  }
  gates.push(
    gate(
      "motion-planted-lock",
      plantedSegments.length === 0
        ? "skipped"
        : plantedFailures.length === 0
          ? "pass"
          : "fail",
      plantedSegments.length > 0,
      plantedSegments.length === 0
        ? "No planted-landmark segments were declared."
        : plantedFailures.length === 0
          ? "Every planted landmark remains within its drift tolerance."
          : "One or more planted landmarks slide beyond the allowed tolerance.",
      { segments: plantedSegments, failures: plantedFailures },
      plantedFailures.length,
      request.plantedLandmarkDriftTolerancePixels,
    ),
  );

  const rootSteps: Array<{ fromFrameId: string; toFrameId: string; distancePixels: number }> = [];
  if (request.rootLandmarkId && request.maximumRootStepPixels !== undefined) {
    for (let index = 1; index < request.frames.length; index += 1) {
      const previous = request.frames[index - 1]!;
      const current = request.frames[index]!;
      const a = previous.landmarks[request.rootLandmarkId];
      const b = current.landmarks[request.rootLandmarkId];
      if (a && b) {
        rootSteps.push({
          fromFrameId: previous.frameId,
          toFrameId: current.frameId,
          distancePixels: distance(a, b),
        });
      }
    }
  }
  const rootFailures = rootSteps.filter(
    (step) => step.distancePixels > (request.maximumRootStepPixels ?? Number.POSITIVE_INFINITY),
  );
  gates.push(
    gate(
      "motion-root-step",
      request.rootLandmarkId === undefined || request.maximumRootStepPixels === undefined
        ? "skipped"
        : rootFailures.length === 0
          ? "pass"
          : "fail",
      request.rootLandmarkId !== undefined && request.maximumRootStepPixels !== undefined,
      request.rootLandmarkId === undefined || request.maximumRootStepPixels === undefined
        ? "No maximum root step was declared."
        : rootFailures.length === 0
          ? "Root motion remains within the declared per-frame step tolerance."
          : "Root motion contains one or more discontinuous jumps.",
      { rootLandmarkId: request.rootLandmarkId ?? null, steps: rootSteps, failures: rootFailures },
      rootFailures.length,
      request.maximumRootStepPixels,
    ),
  );

  const attachmentFailures: Array<{
    constraintId: string;
    frameId: string;
    distancePixels: number | null;
    maximumDistancePixels: number;
  }> = [];
  for (const constraint of request.attachmentConstraints ?? []) {
    for (const frame of request.frames) {
      const from = frame.landmarks[constraint.fromLandmarkId];
      const to = frame.landmarks[constraint.toLandmarkId];
      const measured = from && to ? distance(from, to) : null;
      if (measured === null || measured > constraint.maximumDistancePixels) {
        attachmentFailures.push({
          constraintId: constraint.id,
          frameId: frame.frameId,
          distancePixels: measured,
          maximumDistancePixels: constraint.maximumDistancePixels,
        });
      }
    }
  }
  gates.push(
    gate(
      "motion-attachments",
      (request.attachmentConstraints?.length ?? 0) === 0
        ? "skipped"
        : attachmentFailures.length === 0
          ? "pass"
          : "fail",
      (request.attachmentConstraints?.length ?? 0) > 0,
      (request.attachmentConstraints?.length ?? 0) === 0
        ? "No attachment constraints were declared."
        : attachmentFailures.length === 0
          ? "Every declared attachment remains connected within tolerance."
          : "One or more declared attachments separate beyond tolerance.",
      { failures: attachmentFailures },
      attachmentFailures.length,
    ),
  );

  const loopClosureTolerance = request.loopClosureTolerancePixels ?? 0;
  const loopClosure: Array<{ landmarkId: string; distancePixels: number }> = [];
  if (request.loop) {
    const first = request.frames[0]!;
    const last = request.frames[request.frames.length - 1]!;
    const ids = new Set([
      ...(request.requiredLandmarkIds ?? []),
      ...(request.rootLandmarkId ? [request.rootLandmarkId] : []),
    ]);
    for (const landmarkId of ids) {
      const a = first.landmarks[landmarkId];
      const b = last.landmarks[landmarkId];
      if (a && b) {
        loopClosure.push({ landmarkId, distancePixels: distance(a, b) });
      }
    }
  }
  const loopFailures = loopClosure.filter(
    (entry) => entry.distancePixels > loopClosureTolerance,
  );
  gates.push(
    gate(
      "motion-loop-closure",
      !request.loop ? "skipped" : loopFailures.length === 0 ? "pass" : "fail",
      request.loop,
      !request.loop
        ? "Sequence is not declared as a loop."
        : loopFailures.length === 0
          ? "First and last motion landmarks close within tolerance."
          : "Loop endpoints do not close within the declared tolerance.",
      { tolerancePixels: loopClosureTolerance, landmarks: loopClosure, failures: loopFailures },
      loopFailures.length,
      loopClosureTolerance,
    ),
  );

  const passed = !gates.some((entry) => entry.blocking && entry.status === "fail");
  return {
    schemaVersion: ANIMATION_MOTION_QUALITY_SCHEMA_VERSION,
    sequenceId: request.sequenceId,
    passed,
    gates,
    summary: {
      frameCount: request.frames.length,
      plantedSegments: plantedSegments.length,
      attachmentConstraintCount: request.attachmentConstraints?.length ?? 0,
    },
  };
}
