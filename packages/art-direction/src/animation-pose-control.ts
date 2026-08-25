import { createHash } from "node:crypto";

export const ANIMATION_POSE_CONTROL_VERSION = "2026-08-26.1" as const;
export const ANIMATION_POSE_CONTROL_KIND = "evavo.animation.pose-control" as const;
export const ANIMATION_POSE_CONTROL_BINDING_KIND =
  "evavo.animation.pose-control-binding" as const;

export type AnimationPoseControlSourceKind =
  | "authored"
  | "pose-estimator"
  | "3d-projection";

export interface AnimationPoseLandmark {
  readonly x: number;
  readonly y: number;
  readonly confidence?: number;
}

export interface AnimationPoseControlCompileRequest {
  readonly clipId: string;
  readonly frameId: string;
  readonly frameNumber: number;
  readonly canvas: Readonly<{ width: number; height: number }>;
  readonly landmarks: Readonly<Record<string, AnimationPoseLandmark>>;
  readonly requiredLandmarkIds: readonly string[];
  readonly source: Readonly<{
    kind: AnimationPoseControlSourceKind;
    id: string;
    version: string;
    configSha256: string;
    model?: Readonly<{ id: string; version: string; sha256: string }>;
    runtime?: Readonly<{ id: string; version: string; sha256: string }>;
    sourceArtifactIds?: readonly string[];
  }>;
}

export interface AnimationPoseControlManifest {
  readonly kind: typeof ANIMATION_POSE_CONTROL_KIND;
  readonly version: typeof ANIMATION_POSE_CONTROL_VERSION;
  readonly clipId: string;
  readonly frameId: string;
  readonly frameNumber: number;
  readonly canvas: Readonly<{ width: number; height: number }>;
  readonly coordinateSpace: "normalized-0-1";
  readonly landmarks: Readonly<Record<string, Readonly<{ x: number; y: number; confidence: number }>>>;
  readonly requiredLandmarkIds: readonly string[];
  readonly source: AnimationPoseControlCompileRequest["source"];
  readonly manifestSha256: string;
  readonly authority: Readonly<{
    providerExecution: false;
    creativeApproval: false;
    artifactPromotion: false;
    repositoryMutation: false;
    publication: false;
  }>;
}

export interface AnimationPoseControlBinding {
  readonly kind: typeof ANIMATION_POSE_CONTROL_BINDING_KIND;
  readonly version: typeof ANIMATION_POSE_CONTROL_VERSION;
  readonly poseControlManifestSha256: string;
  readonly clipId: string;
  readonly frameId: string;
  readonly frameNumber: number;
  readonly artifactId: `artifact_${string}`;
  readonly contentSha256: string;
  readonly mediaType: "image/png";
  readonly width: number;
  readonly height: number;
  readonly bindingSha256: string;
  readonly authority: Readonly<{
    providerExecution: false;
    creativeApproval: false;
    artifactPromotion: false;
    repositoryMutation: false;
    publication: false;
  }>;
}

const SHA256 = /^[a-f0-9]{64}$/;
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function fail(message: string): never {
  throw new Error(`Animation pose control failed: ${message}`);
}

function text(value: unknown, field: string, maximum = 256): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > maximum || value.includes("\0")) {
    fail(`${field} must be a non-empty safe string.`);
  }
  return value;
}

function safeId(value: unknown, field: string): string {
  const result = text(value, field, 128);
  if (!SAFE_ID.test(result)) fail(`${field} must use the EVAVO safe id character set.`);
  return result;
}

function sha(value: unknown, field: string): string {
  if (typeof value !== "string" || !SHA256.test(value)) {
    fail(`${field} must be 64 lowercase hexadecimal characters.`);
  }
  return value;
}

function positiveInteger(value: unknown, field: string, maximum = 8192): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > maximum) {
    fail(`${field} must be an integer from 1 to ${maximum}.`);
  }
  return value;
}

function unit(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    fail(`${field} must be a finite normalized value from 0 to 1.`);
  }
  return value;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

export function compileAnimationPoseControl(
  request: AnimationPoseControlCompileRequest,
): AnimationPoseControlManifest {
  if (!request || typeof request !== "object") fail("request must be an object.");
  const clipId = safeId(request.clipId, "clipId");
  const frameId = safeId(request.frameId, "frameId");
  const frameNumber = positiveInteger(request.frameNumber, "frameNumber", 100_000);
  const canvas = {
    width: positiveInteger(request.canvas?.width, "canvas.width"),
    height: positiveInteger(request.canvas?.height, "canvas.height"),
  };
  if (!request.landmarks || typeof request.landmarks !== "object" || Array.isArray(request.landmarks)) {
    fail("landmarks must be an object.");
  }
  if (!Array.isArray(request.requiredLandmarkIds) || request.requiredLandmarkIds.length === 0) {
    fail("requiredLandmarkIds must be a non-empty array.");
  }
  const requiredLandmarkIds = [...new Set(request.requiredLandmarkIds.map((id, index) => safeId(id, `requiredLandmarkIds[${index}]`)))];
  if (requiredLandmarkIds.length !== request.requiredLandmarkIds.length) {
    fail("requiredLandmarkIds must not contain duplicates.");
  }

  const landmarks: Record<string, { x: number; y: number; confidence: number }> = {};
  for (const [landmarkId, raw] of Object.entries(request.landmarks)) {
    const id = safeId(landmarkId, "landmark id");
    if (!raw || typeof raw !== "object") fail(`landmark ${id} must be an object.`);
    landmarks[id] = {
      x: unit(raw.x, `${id}.x`),
      y: unit(raw.y, `${id}.y`),
      confidence: unit(raw.confidence ?? 1, `${id}.confidence`),
    };
  }
  for (const required of requiredLandmarkIds) {
    if (!landmarks[required]) fail(`required landmark ${required} is missing.`);
  }

  const source = request.source;
  if (!source || typeof source !== "object" || !["authored", "pose-estimator", "3d-projection"].includes(source.kind)) {
    fail("source.kind must be authored, pose-estimator or 3d-projection.");
  }
  const normalizedSource = {
    kind: source.kind,
    id: safeId(source.id, "source.id"),
    version: text(source.version, "source.version"),
    configSha256: sha(source.configSha256, "source.configSha256"),
    ...(source.model
      ? { model: { id: safeId(source.model.id, "source.model.id"), version: text(source.model.version, "source.model.version"), sha256: sha(source.model.sha256, "source.model.sha256") } }
      : {}),
    ...(source.runtime
      ? { runtime: { id: safeId(source.runtime.id, "source.runtime.id"), version: text(source.runtime.version, "source.runtime.version"), sha256: sha(source.runtime.sha256, "source.runtime.sha256") } }
      : {}),
    ...(source.sourceArtifactIds
      ? {
          sourceArtifactIds: source.sourceArtifactIds.map((value, index) => {
            if (typeof value !== "string" || !ARTIFACT_ID.test(value)) fail(`source.sourceArtifactIds[${index}] must use artifact_<sha256> format.`);
            return value;
          }),
        }
      : {}),
  } as AnimationPoseControlCompileRequest["source"];
  if (normalizedSource.kind === "pose-estimator" && (!normalizedSource.model || !normalizedSource.runtime)) {
    fail("pose-estimator controls require exact model and runtime identities.");
  }

  const body = {
    kind: ANIMATION_POSE_CONTROL_KIND,
    version: ANIMATION_POSE_CONTROL_VERSION,
    clipId,
    frameId,
    frameNumber,
    canvas,
    coordinateSpace: "normalized-0-1" as const,
    landmarks,
    requiredLandmarkIds,
    source: normalizedSource,
    authority: {
      providerExecution: false as const,
      creativeApproval: false as const,
      artifactPromotion: false as const,
      repositoryMutation: false as const,
      publication: false as const,
    },
  };
  return { ...body, manifestSha256: digest(body) };
}

export function bindAnimationPoseControlArtifact(
  manifest: AnimationPoseControlManifest,
  artifact: Readonly<{
    artifactId: string;
    contentSha256: string;
    mediaType: "image/png";
    width: number;
    height: number;
  }>,
): AnimationPoseControlBinding {
  if (!manifest || manifest.kind !== ANIMATION_POSE_CONTROL_KIND || manifest.version !== ANIMATION_POSE_CONTROL_VERSION) {
    fail("manifest kind/version is unsupported.");
  }
  const recompiled = compileAnimationPoseControl({
    clipId: manifest.clipId,
    frameId: manifest.frameId,
    frameNumber: manifest.frameNumber,
    canvas: manifest.canvas,
    landmarks: manifest.landmarks,
    requiredLandmarkIds: manifest.requiredLandmarkIds,
    source: manifest.source,
  });
  if (stable(recompiled) !== stable(manifest)) fail("pose-control manifest is not canonical or was mutated.");
  if (!artifact || typeof artifact !== "object" || typeof artifact.artifactId !== "string" || !ARTIFACT_ID.test(artifact.artifactId)) {
    fail("artifactId must use artifact_<sha256> format.");
  }
  const contentSha256 = sha(artifact.contentSha256, "artifact.contentSha256");
  if (artifact.mediaType !== "image/png") fail("pose-control render binding must use image/png.");
  const width = positiveInteger(artifact.width, "artifact.width");
  const height = positiveInteger(artifact.height, "artifact.height");
  if (width !== manifest.canvas.width || height !== manifest.canvas.height) {
    fail("pose-control rendered artifact dimensions must match the semantic control canvas.");
  }
  const body = {
    kind: ANIMATION_POSE_CONTROL_BINDING_KIND,
    version: ANIMATION_POSE_CONTROL_VERSION,
    poseControlManifestSha256: manifest.manifestSha256,
    clipId: manifest.clipId,
    frameId: manifest.frameId,
    frameNumber: manifest.frameNumber,
    artifactId: artifact.artifactId as `artifact_${string}`,
    contentSha256,
    mediaType: "image/png" as const,
    width,
    height,
    authority: {
      providerExecution: false as const,
      creativeApproval: false as const,
      artifactPromotion: false as const,
      repositoryMutation: false as const,
      publication: false as const,
    },
  };
  return { ...body, bindingSha256: digest(body) };
}
