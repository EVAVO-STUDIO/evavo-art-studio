import { createHash } from "node:crypto";

import { SpriteQualityInputError, type Point } from "./types.js";

export const ANIMATION_MOTION_EVIDENCE_SCHEMA_VERSION = "1.0" as const;

export type MotionEvidenceProducerKind =
  | "model"
  | "manual-reviewed"
  | "authored-control"
  | "3d-projection";

export interface MotionEvidenceLandmark {
  readonly x: number;
  readonly y: number;
  readonly confidence: number;
  readonly provenance: "detected" | "corrected" | "authored" | "projected";
}

export interface MotionEvidenceProducer {
  readonly kind: MotionEvidenceProducerKind;
  readonly id: string;
  readonly version: string;
  readonly configSha256: string;
  readonly model?: Readonly<{
    id: string;
    sha256: string;
  }>;
  readonly runtime?: Readonly<{
    id: string;
    version: string;
    sha256: string;
  }>;
  readonly reviewer?: string;
}

export interface AnimationMotionEvidenceFrameInput {
  readonly frameId: string;
  readonly frameIndex: number;
  readonly frameArtifactId: string;
  readonly frameContentSha256: string;
  readonly width: number;
  readonly height: number;
  readonly landmarks: Readonly<Record<string, MotionEvidenceLandmark>>;
  readonly plantedLandmarkId?: string;
}

export interface AnimationMotionEvidenceManifestInput {
  readonly sequenceId: string;
  readonly producer: MotionEvidenceProducer;
  readonly preprocessingSha256: string;
  readonly frames: readonly AnimationMotionEvidenceFrameInput[];
}

export interface AnimationMotionEvidenceManifest {
  readonly schemaVersion: typeof ANIMATION_MOTION_EVIDENCE_SCHEMA_VERSION;
  readonly sequenceId: string;
  readonly coordinateSpace: "source-pixels";
  readonly producer: MotionEvidenceProducer;
  readonly preprocessingSha256: string;
  readonly frames: readonly AnimationMotionEvidenceFrameInput[];
  readonly manifestSha256: string;
  readonly authority: Readonly<{
    creativeApproval: false;
    artifactPromotion: false;
    repositoryMutation: false;
    publication: false;
  }>;
}

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function fail(code: string, message: string): never {
  throw new SpriteQualityInputError(code, message);
}

function nonBlank(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    fail("ANIMATION_MOTION_EVIDENCE_INVALID_STRING", `${field} must be non-empty.`);
  }
  return value.trim();
}

function sha(value: unknown, field: string): string {
  const normalized = nonBlank(value, field);
  if (!SHA256.test(normalized)) {
    fail("ANIMATION_MOTION_EVIDENCE_INVALID_SHA256", `${field} must be 64 lowercase hexadecimal characters.`);
  }
  return normalized;
}

function artifact(value: unknown, field: string): string {
  const normalized = nonBlank(value, field);
  if (!ARTIFACT_ID.test(normalized)) {
    fail("ANIMATION_MOTION_EVIDENCE_INVALID_ARTIFACT", `${field} must be a canonical artifact_[64 lowercase hex] id.`);
  }
  return normalized;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    fail("ANIMATION_MOTION_EVIDENCE_INVALID_INTEGER", `${field} must be a positive integer.`);
  }
  return value;
}

function stableValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail("ANIMATION_MOTION_EVIDENCE_NON_FINITE", "Motion evidence may contain only finite numbers.");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry === undefined) {
        fail("ANIMATION_MOTION_EVIDENCE_UNDEFINED", `Motion evidence field ${key} may not be undefined.`);
      }
      result[key] = stableValue(entry);
    }
    return result;
  }
  fail("ANIMATION_MOTION_EVIDENCE_NOT_JSON", "Motion evidence must be JSON-compatible data.");
}

function digest(value: unknown): string {
  const normalized = stableValue(value);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function producer(input: MotionEvidenceProducer): MotionEvidenceProducer {
  if (!input || typeof input !== "object") {
    fail("ANIMATION_MOTION_EVIDENCE_INVALID_PRODUCER", "producer must be an object.");
  }
  const kinds = new Set<MotionEvidenceProducerKind>([
    "model",
    "manual-reviewed",
    "authored-control",
    "3d-projection",
  ]);
  if (!kinds.has(input.kind)) {
    fail("ANIMATION_MOTION_EVIDENCE_INVALID_PRODUCER_KIND", "producer.kind is unsupported.");
  }
  const base = {
    kind: input.kind,
    id: nonBlank(input.id, "producer.id"),
    version: nonBlank(input.version, "producer.version"),
    configSha256: sha(input.configSha256, "producer.configSha256"),
  };
  const model = input.model
    ? {
        id: nonBlank(input.model.id, "producer.model.id"),
        sha256: sha(input.model.sha256, "producer.model.sha256"),
      }
    : undefined;
  const runtime = input.runtime
    ? {
        id: nonBlank(input.runtime.id, "producer.runtime.id"),
        version: nonBlank(input.runtime.version, "producer.runtime.version"),
        sha256: sha(input.runtime.sha256, "producer.runtime.sha256"),
      }
    : undefined;
  const reviewer = input.reviewer === undefined ? undefined : nonBlank(input.reviewer, "producer.reviewer");

  if (input.kind === "model" && (!model || !runtime)) {
    fail(
      "ANIMATION_MOTION_EVIDENCE_MODEL_PROVENANCE_REQUIRED",
      "Model-produced evidence requires exact model and runtime identities.",
    );
  }
  if (input.kind === "manual-reviewed" && !reviewer) {
    fail(
      "ANIMATION_MOTION_EVIDENCE_REVIEWER_REQUIRED",
      "Manual-reviewed evidence requires a named reviewer field.",
    );
  }

  return {
    ...base,
    ...(model ? { model } : {}),
    ...(runtime ? { runtime } : {}),
    ...(reviewer ? { reviewer } : {}),
  };
}

function landmark(
  value: MotionEvidenceLandmark,
  field: string,
  width: number,
  height: number,
): MotionEvidenceLandmark {
  if (!value || typeof value !== "object") {
    fail("ANIMATION_MOTION_EVIDENCE_INVALID_LANDMARK", `${field} must be an object.`);
  }
  if (
    typeof value.x !== "number" ||
    !Number.isFinite(value.x) ||
    typeof value.y !== "number" ||
    !Number.isFinite(value.y)
  ) {
    fail("ANIMATION_MOTION_EVIDENCE_INVALID_LANDMARK", `${field} coordinates must be finite numbers.`);
  }
  if (value.x < 0 || value.x > width || value.y < 0 || value.y > height) {
    fail("ANIMATION_MOTION_EVIDENCE_LANDMARK_OUT_OF_BOUNDS", `${field} must lie within the source canvas.`);
  }
  if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
    fail("ANIMATION_MOTION_EVIDENCE_INVALID_CONFIDENCE", `${field}.confidence must be between zero and one.`);
  }
  if (!["detected", "corrected", "authored", "projected"].includes(value.provenance)) {
    fail("ANIMATION_MOTION_EVIDENCE_INVALID_PROVENANCE", `${field}.provenance is unsupported.`);
  }
  return {
    x: value.x,
    y: value.y,
    confidence: value.confidence,
    provenance: value.provenance,
  };
}

function frame(input: AnimationMotionEvidenceFrameInput): AnimationMotionEvidenceFrameInput {
  if (!input || typeof input !== "object") {
    fail("ANIMATION_MOTION_EVIDENCE_INVALID_FRAME", "Every evidence frame must be an object.");
  }
  const width = positiveInteger(input.width, `${input.frameId}.width`);
  const height = positiveInteger(input.height, `${input.frameId}.height`);
  if (!Number.isInteger(input.frameIndex) || input.frameIndex < 0) {
    fail("ANIMATION_MOTION_EVIDENCE_INVALID_FRAME_INDEX", "frameIndex must be a non-negative integer.");
  }
  const frameId = nonBlank(input.frameId, "frame.frameId");
  const landmarks: Record<string, MotionEvidenceLandmark> = {};
  if (!input.landmarks || typeof input.landmarks !== "object") {
    fail("ANIMATION_MOTION_EVIDENCE_INVALID_LANDMARKS", `${frameId}.landmarks must be an object.`);
  }
  for (const key of Object.keys(input.landmarks).sort()) {
    const id = nonBlank(key, `${frameId}.landmarkId`);
    landmarks[id] = landmark(input.landmarks[key]!, `${frameId}.landmarks.${id}`, width, height);
  }
  return {
    frameId,
    frameIndex: input.frameIndex,
    frameArtifactId: artifact(input.frameArtifactId, `${frameId}.frameArtifactId`),
    frameContentSha256: sha(input.frameContentSha256, `${frameId}.frameContentSha256`),
    width,
    height,
    landmarks,
    ...(input.plantedLandmarkId === undefined
      ? {}
      : { plantedLandmarkId: nonBlank(input.plantedLandmarkId, `${frameId}.plantedLandmarkId`) }),
  };
}

export function compileAnimationMotionEvidenceManifest(
  input: AnimationMotionEvidenceManifestInput,
): AnimationMotionEvidenceManifest {
  if (!input || typeof input !== "object") {
    fail("ANIMATION_MOTION_EVIDENCE_INVALID_REQUEST", "Motion evidence input must be an object.");
  }
  const sequenceId = nonBlank(input.sequenceId, "sequenceId");
  if (!Array.isArray(input.frames) || input.frames.length < 2) {
    fail("ANIMATION_MOTION_EVIDENCE_FRAME_COUNT", "At least two evidence frames are required.");
  }
  const frames = input.frames.map(frame);
  const seenIndices = new Set<number>();
  const seenArtifacts = new Set<string>();
  for (let index = 0; index < frames.length; index += 1) {
    const current = frames[index]!;
    if (seenIndices.has(current.frameIndex)) {
      fail("ANIMATION_MOTION_EVIDENCE_DUPLICATE_INDEX", `Duplicate frameIndex ${current.frameIndex}.`);
    }
    seenIndices.add(current.frameIndex);
    if (seenArtifacts.has(current.frameArtifactId)) {
      fail("ANIMATION_MOTION_EVIDENCE_DUPLICATE_ARTIFACT", `Frame artifact ${current.frameArtifactId} is duplicated.`);
    }
    seenArtifacts.add(current.frameArtifactId);
    if (index > 0 && current.frameIndex <= frames[index - 1]!.frameIndex) {
      fail("ANIMATION_MOTION_EVIDENCE_FRAME_ORDER", "Evidence frames must be ordered by ascending frameIndex.");
    }
  }

  const body = {
    schemaVersion: ANIMATION_MOTION_EVIDENCE_SCHEMA_VERSION,
    sequenceId,
    coordinateSpace: "source-pixels" as const,
    producer: producer(input.producer),
    preprocessingSha256: sha(input.preprocessingSha256, "preprocessingSha256"),
    frames,
    authority: {
      creativeApproval: false as const,
      artifactPromotion: false as const,
      repositoryMutation: false as const,
      publication: false as const,
    },
  };
  return {
    ...body,
    manifestSha256: digest(body),
  };
}

export function verifyAnimationMotionEvidenceManifest(
  manifest: AnimationMotionEvidenceManifest,
): boolean {
  const compiled = compileAnimationMotionEvidenceManifest({
    sequenceId: manifest.sequenceId,
    producer: manifest.producer,
    preprocessingSha256: manifest.preprocessingSha256,
    frames: manifest.frames,
  });
  return compiled.manifestSha256 === manifest.manifestSha256 && digest({
    schemaVersion: manifest.schemaVersion,
    sequenceId: manifest.sequenceId,
    coordinateSpace: manifest.coordinateSpace,
    producer: manifest.producer,
    preprocessingSha256: manifest.preprocessingSha256,
    frames: manifest.frames,
    authority: manifest.authority,
  }) === manifest.manifestSha256;
}

export function motionPointsFromEvidence(
  manifest: AnimationMotionEvidenceManifest,
): readonly Readonly<{
  frameId: string;
  frameIndex: number;
  landmarks: Readonly<Record<string, Point>>;
  plantedLandmarkId?: string;
}>[] {
  if (!verifyAnimationMotionEvidenceManifest(manifest)) {
    fail("ANIMATION_MOTION_EVIDENCE_MANIFEST_INVALID", "Motion evidence manifest verification failed.");
  }
  return manifest.frames.map((entry) => ({
    frameId: entry.frameId,
    frameIndex: entry.frameIndex,
    landmarks: Object.fromEntries(
      Object.entries(entry.landmarks).map(([id, point]) => [id, { x: point.x, y: point.y }]),
    ),
    ...(entry.plantedLandmarkId ? { plantedLandmarkId: entry.plantedLandmarkId } : {}),
  }));
}
