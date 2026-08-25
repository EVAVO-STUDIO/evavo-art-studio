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
  readonly loopClosureLandmarkIds?: readonly string[];
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

function requireNonNegativeFinite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new SpriteQualityInputError(
      "ANIMATION_MOTION_INVALID_THRESHOLD",
      `${field} must be a finite number greater than or equal to zero.`,
    );
  }
  return value;
}

function requireStringList(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new SpriteQualityInputError(
      "ANIMATION_MOTION_INVALID_LANDMARK_LIST",
      `${field} must be an array of non-empty landmark ids.`,
    );
  }
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) {
      throw new SpriteQualityInputError(
        "ANIMATION_MOTION_INVALID_LANDMARK_LIST",
        `${field} must contain only non-empty landmark ids.`,
      );
    }
    const id = item.trim();
    if (seen.has(id)) {
      throw new SpriteQualityInputError(
        "ANIMATION_MOTION_DUPLICATE_LANDMARK_ID",
        `${field} contains duplicate landmark id ${id}.`,
      );
    }
    seen.add(id);
    result.push(id);
  }
  return result;
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
  if (input.rootLandmarkId !== undefined && (typeof input.rootLandmarkId !== "string" || !input.rootLandmarkId.trim())) {
    throw new SpriteQualityInputError(
      "ANIMATION_MOTION_INVALID_ROOT_LANDMARK",
      "rootLandmarkId must be non-empty when supplied.",
    );
  }
  if (input.requiredLandmarkIds !== undefined) {
    requireStringList(input.requiredLandmarkIds, "requiredLandmarkIds");
  }
  if (input.loopClosureLandmarkIds !== undefined) {
    requireStringList(input.loopClosureLandmarkIds, "loopClosureLandmarkIds");
  }
  if (!Array.isArray(input.frames) || input.frames.length < 2) {
    throw new SpriteQualityInputError(
      "ANIMATION_MOTION_FRAME_COUNT",
      "At least two motion-evidence frames are required.",
    );
  }

  const seenIndices = new Set<number>();
  for (const frame of input.frames) {
    if (!frame || typeof frame !== "object") {
      throw new SpriteQualityInputError(
        "ANIMATION_MOTION_INVALID_FRAME",
        "Every motion-evidence frame must be an object.",
      );
    }
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
    if (!frame.landmarks || typeof frame.landmarks !== "object") {
      throw new SpriteQualityInputError(
        "ANIMATION_MOTION_INVALID_LANDMARKS",
        `Frame ${frame.frameId} requires a landmark map.`,
      );
    }
    if (
      frame.plantedLandmarkId !== undefined &&
      (typeof frame.plantedLandmarkId !== "string" || !frame.plantedLandmarkId.trim())
    ) {
      throw new SpriteQualityInputError(
        "ANIMATION_MOTION_INVALID_PLANTED_LANDMARK",
        `Frame ${frame.frameId} has an invalid plantedLandmarkId.`,
      );
    }
    for (const [landmarkId, point] of Object.entries(frame.landmarks)) {
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

  if (input.attachmentConstraints !== undefined && !Array.isArray(input.attachmentConstraints)) {
    throw new SpriteQualityInputError(
      "ANIMATION_MOTION_INVALID_ATTACHMENTS",
      "attachmentConstraints must be an array when supplied.",
    );
  }
  for (const constraint of input.attachmentConstraints ?? []) {
    if (
      !constraint ||
      typeof constraint !== "object" ||
      typeof constraint.id !== "string" ||
      !constraint.id.trim() ||
      typeof constraint.fromLandmarkId !== "string" ||
      !constraint.fromLandmarkId.trim() ||
      typeof constraint.toLandmarkId !== "string" ||
      !constraint.toLandmarkId.trim()
    ) {
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
  const requiredIds = new Set(request.requiredLandmarkIds ?? []);
  if (request.rootLandmarkId) requiredIds.add(request.rootLandmarkId);
  for (const frame of request.frames) {
    for (const landmarkId of requiredIds) {
      if (!frame.landmarks[landmarkId]) {
        missingRequired.push({ frameId: frame.frameId, landmarkId });
      }
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
    maximumDriftPixels: number | null;
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
    let maximumDriftPixels: number | null = anchor ? 0 : null;
    if (anchor) {
      for (let index = start; index <= end; index += 1) {
        const point = request.frames[index]!.landmarks[landmarkId];
        if (!point) {
          maximumDriftPixels = null;
          break;
        }
        maximumDriftPixels = Math.max(maximumDriftPixels ?? 0, distance(anchor, point));
      }
    }
    const segment = {
      landmarkId,
      startFrameId: request.frames[start]!.frameId,
      endFrameId: request.frames[end]!.frameId,
      maximumDriftPixels,
    };
    plantedSegments.push(segment);
    if (
      maximumDriftPixels === null ||
      maximumDriftPixels > request.plantedLandmarkDriftTolerancePixels
    ) {
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
          : "One or more planted landmarks are missing or slide beyond the allowed tolerance.",
      { segments: plantedSegments, failures: plantedFailures },
      plantedFailures.length,
      request.plantedLandmarkDriftTolerancePixels,
    ),
  );

  const rootSteps: Array<{ fromFrameId: string; toFrameId: string; distancePixels: number | null }> = [];
  if (request.rootLandmarkId && request.maximumRootStepPixels !== undefined) {
    for (let index = 1; index < request.frames.length; index += 1) {
      const previous = request.frames[index - 1]!;
      const current = request.frames[index]!;
      const a = previous.landmarks[request.rootLandmarkId];
      const b = current.landmarks[request.rootLandmarkId];
      rootSteps.push({
        fromFrameId: previous.frameId,
        toFrameId: current.frameId,
        distancePixels: a && b ? distance(a, b) : null,
      });
    }
  }
  const rootFailures = rootSteps.filter(
    (step) =>
      step.distancePixels === null ||
      step.distancePixels > (request.maximumRootStepPixels ?? Number.MAX_SAFE_INTEGER),
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
          : "Root motion contains missing measurements or one or more discontinuous jumps.",
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
          : "One or more declared attachments are missing or separate beyond tolerance.",
      { failures: attachmentFailures },
      attachmentFailures.length,
    ),
  );

  const loopClosureTolerance = request.loopClosureTolerancePixels ?? 0;
  const loopClosure: Array<{ landmarkId: string; distancePixels: number | null }> = [];
  if (request.loop) {
    const first = request.frames[0]!;
    const last = request.frames[request.frames.length - 1]!;
    const loopIds = request.loopClosureLandmarkIds ?? (request.rootLandmarkId ? [request.rootLandmarkId] : []);
    for (const landmarkId of loopIds) {
      const a = first.landmarks[landmarkId];
      const b = last.landmarks[landmarkId];
      loopClosure.push({
        landmarkId,
        distancePixels: a && b ? distance(a, b) : null,
      });
    }
  }
  const loopFailures = loopClosure.filter(
    (entry) =>
      entry.distancePixels === null ||
      entry.distancePixels > loopClosureTolerance,
  );
  gates.push(
    gate(
      "motion-loop-closure",
      !request.loop
        ? "skipped"
        : loopClosure.length === 0
          ? "skipped"
          : loopFailures.length === 0
            ? "pass"
            : "fail",
      request.loop && loopClosure.length > 0,
      !request.loop
        ? "Sequence is not declared as a loop."
        : loopClosure.length === 0
          ? "No loop-closure landmarks were declared."
          : loopFailures.length === 0
            ? "Declared seam anchors close within tolerance."
            : "Loop seam anchors are missing or do not close within the declared tolerance.",
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
