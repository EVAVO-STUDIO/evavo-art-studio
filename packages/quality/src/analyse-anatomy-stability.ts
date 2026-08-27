import { SpriteQualityInputError, type Point, type SpriteQualityGateResult } from "./types.js";

export const ANIMATION_ANATOMY_STABILITY_VERSION = "2026-08-26.2" as const;

export interface AnimationAnatomyFrameEvidence {
  readonly frameId: string;
  readonly frameIndex: number;
  readonly landmarks: Readonly<Record<string, Point>>;
}

export interface AnimationAnatomySegmentConstraint {
  readonly id: string;
  readonly fromLandmarkId: string;
  readonly toLandmarkId: string;
  readonly maximumRelativeDeviation: number;
  readonly blocking?: boolean;
}

export interface AnimationAnatomyStabilityRequest {
  readonly sequenceId: string;
  readonly frames: readonly AnimationAnatomyFrameEvidence[];
  readonly segments: readonly AnimationAnatomySegmentConstraint[];
}

interface AnimationAnatomyMeasurement {
  readonly frameId: string;
  readonly lengthPixels: number | null;
}

interface AnimationAnatomyFailure extends AnimationAnatomyMeasurement {
  readonly relativeDeviation: number | null;
}

export interface AnimationAnatomyStabilityReport {
  readonly version: typeof ANIMATION_ANATOMY_STABILITY_VERSION;
  readonly sequenceId: string;
  readonly passed: boolean;
  readonly gates: readonly SpriteQualityGateResult[];
  readonly authority: Readonly<{
    creativeApproval: false;
    artifactPromotion: false;
    repositoryMutation: false;
    publication: false;
  }>;
}

function fail(message: string): never {
  throw new SpriteQualityInputError("ANIMATION_ANATOMY_INVALID", message);
}

function finitePoint(value: unknown): value is Point {
  if (!value || typeof value !== "object") return false;
  const point = value as Record<string, unknown>;
  return (
    typeof point.x === "number" && Number.isFinite(point.x) &&
    typeof point.y === "number" && Number.isFinite(point.y)
  );
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

export function analyseAnimationAnatomyStability(
  request: AnimationAnatomyStabilityRequest,
): AnimationAnatomyStabilityReport {
  if (!request || typeof request !== "object") fail("request must be an object.");
  if (typeof request.sequenceId !== "string" || !request.sequenceId.trim()) {
    fail("sequenceId must be non-empty.");
  }
  if (!Array.isArray(request.frames) || request.frames.length < 2) {
    fail("at least two ordered frames are required.");
  }
  if (!Array.isArray(request.segments) || request.segments.length < 1) {
    fail("at least one anatomy segment constraint is required.");
  }

  const frameIds = new Set<string>();
  let previousIndex = -1;
  for (const [index, frame] of request.frames.entries()) {
    if (!frame || typeof frame !== "object" || typeof frame.frameId !== "string" || !frame.frameId.trim()) {
      fail(`frames[${index}] must have a non-empty frameId.`);
    }
    if (frameIds.has(frame.frameId)) fail(`duplicate frameId ${frame.frameId}.`);
    frameIds.add(frame.frameId);
    if (!Number.isInteger(frame.frameIndex) || frame.frameIndex < 0 || frame.frameIndex <= previousIndex) {
      fail("frameIndex values must be unique non-negative integers in ascending order.");
    }
    previousIndex = frame.frameIndex;
    if (!frame.landmarks || typeof frame.landmarks !== "object") fail(`frame ${frame.frameId} lacks landmarks.`);
    for (const [landmarkId, point] of Object.entries(frame.landmarks)) {
      if (!landmarkId.trim() || !finitePoint(point)) fail(`frame ${frame.frameId} contains invalid landmark ${landmarkId}.`);
    }
  }

  const segmentIds = new Set<string>();
  const gates: SpriteQualityGateResult[] = [];
  for (const [index, segment] of request.segments.entries()) {
    if (!segment || typeof segment !== "object" || typeof segment.id !== "string" || !segment.id.trim()) {
      fail(`segments[${index}] requires a non-empty id.`);
    }
    if (segmentIds.has(segment.id)) fail(`duplicate segment id ${segment.id}.`);
    segmentIds.add(segment.id);
    if (
      typeof segment.fromLandmarkId !== "string" || !segment.fromLandmarkId.trim() ||
      typeof segment.toLandmarkId !== "string" || !segment.toLandmarkId.trim() ||
      segment.fromLandmarkId === segment.toLandmarkId
    ) {
      fail(`segment ${segment.id} requires two distinct landmark ids.`);
    }
    if (
      typeof segment.maximumRelativeDeviation !== "number" ||
      !Number.isFinite(segment.maximumRelativeDeviation) ||
      segment.maximumRelativeDeviation < 0 ||
      segment.maximumRelativeDeviation > 2
    ) {
      fail(`segment ${segment.id}.maximumRelativeDeviation must be from 0 to 2.`);
    }
    if (segment.blocking !== undefined && typeof segment.blocking !== "boolean") {
      fail(`segment ${segment.id}.blocking must be boolean when supplied.`);
    }

    const measurements: AnimationAnatomyMeasurement[] = request.frames.map((frame) => {
      const from = frame.landmarks[segment.fromLandmarkId];
      const to = frame.landmarks[segment.toLandmarkId];
      return {
        frameId: frame.frameId,
        lengthPixels: from && to ? distance(from, to) : null,
      };
    });
    const validLengths = measurements
      .map((entry) => entry.lengthPixels)
      .filter((value): value is number => value !== null && value > 0);
    const referenceLength = validLengths.length > 0 ? median(validLengths) : null;
    const failures: AnimationAnatomyFailure[] = [];
    for (const entry of measurements) {
      if (entry.lengthPixels === null || referenceLength === null || referenceLength <= 0) {
        failures.push({ ...entry, relativeDeviation: null });
        continue;
      }
      const relativeDeviation = Math.abs(entry.lengthPixels - referenceLength) / referenceLength;
      if (relativeDeviation > segment.maximumRelativeDeviation) {
        failures.push({ ...entry, relativeDeviation });
      }
    }
    const blocking = segment.blocking ?? true;
    gates.push({
      id: `anatomy-segment:${segment.id}`,
      status: failures.length === 0 ? "pass" : blocking ? "fail" : "warning",
      blocking,
      message:
        failures.length === 0
          ? `Segment ${segment.id} remains within its declared length-stability tolerance.`
          : `Segment ${segment.id} changes length beyond its declared tolerance in one or more frames.`,
      threshold: segment.maximumRelativeDeviation,
      evidence: {
        segmentId: segment.id,
        fromLandmarkId: segment.fromLandmarkId,
        toLandmarkId: segment.toLandmarkId,
        referenceLengthPixels: referenceLength,
        measurements,
        failures,
      },
    });
  }

  return {
    version: ANIMATION_ANATOMY_STABILITY_VERSION,
    sequenceId: request.sequenceId.trim(),
    passed: !gates.some((gate) => gate.blocking && gate.status === "fail"),
    gates,
    authority: {
      creativeApproval: false,
      artifactPromotion: false,
      repositoryMutation: false,
      publication: false,
    },
  };
}
