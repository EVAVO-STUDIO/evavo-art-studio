import { createHash } from "node:crypto";
import type {
  AnimationSpec,
  AssetRequest,
  Point,
  SpriteContinuityLock,
  SpriteLayerExportPolicy,
  SpriteLayerFramePolicy,
  SpriteLayerRole,
  SpriteLayerSpec,
  SpriteLayerTreatment,
} from "@evavo/art-contracts";

export const SPRITE_KINDS = new Set<AssetRequest["kind"]>([
  "character",
  "animation",
  "sprite-sheet",
  "particle",
]);

export const DEFAULT_CHARACTER_LOCKS: readonly SpriteContinuityLock[] = Object.freeze([
  "identity",
  "proportions",
  "silhouette-language",
  "palette",
  "line-treatment",
  "camera",
  "pivot",
  "baseline",
  "ground-contact",
  "equipment",
  "handedness",
  "materials",
]);

export const DEFAULT_EFFECT_LOCKS: readonly SpriteContinuityLock[] = Object.freeze([
  "silhouette-language",
  "palette",
  "line-treatment",
  "camera",
  "pivot",
]);

export function slug(value: string): string {
  const result = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return result || "sprite";
}

export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function instanceId(assetId: string, index: number): string {
  return `${slug(assetId)}-${String(index + 1).padStart(2, "0")}`;
}

export function isSpriteAsset(asset: AssetRequest): boolean {
  return SPRITE_KINDS.has(asset.kind);
}

export function directionNames(animation?: AnimationSpec): readonly string[] {
  const count = animation?.directions ?? animation?.directionNames?.length ?? 1;
  if (animation?.directionNames?.length === count) return [...animation.directionNames];

  if (count === 1) return ["front"];
  if (count === 2) return ["left", "right"];
  if (count === 4) return ["down", "left", "right", "up"];
  if (count === 8) {
    return [
      "down",
      "down-left",
      "left",
      "up-left",
      "up",
      "up-right",
      "right",
      "down-right",
    ];
  }
  return Array.from({ length: count }, (_, index) => `direction-${String(index + 1).padStart(2, "0")}`);
}

export function keyPoseFrames(animation?: AnimationSpec): readonly number[] {
  const count = animation?.frameCount ?? 1;
  if (animation?.keyPoseFrames?.length) {
    return [...animation.keyPoseFrames].sort((left, right) => left - right);
  }
  if (count <= 3) return Array.from({ length: count }, (_, index) => index);

  const candidates = [0, Math.floor(count / 4), Math.floor(count / 2), Math.floor((count * 3) / 4)];
  return [...new Set(candidates)].sort((left, right) => left - right);
}

export function frameDurations(animation?: AnimationSpec): readonly number[] {
  const count = animation?.frameCount ?? 1;
  if (animation?.frameDurationsMs?.length === count) return [...animation.frameDurationsMs];
  const duration = Math.max(1, Math.round(1000 / (animation?.framesPerSecond ?? 1)));
  return Array.from({ length: count }, () => duration);
}

export function normalizedPivot(asset: AssetRequest): Point {
  if (asset.animation?.pivot) return asset.animation.pivot;
  return {
    x: Math.floor(asset.dimensions.width / 2),
    y: Math.max(0, asset.dimensions.height - 1),
  };
}

export function defaultLayerRole(asset: AssetRequest): SpriteLayerRole {
  if (asset.kind === "particle") return "effect";
  if (asset.kind === "character") return "body";
  return "subject";
}

export function defaultLayer(asset: AssetRequest): SpriteLayerSpec {
  return {
    id: defaultLayerRole(asset),
    role: defaultLayerRole(asset),
    treatment: "baked-into-cel",
    zIndex: 0,
    framePolicy: "every-frame",
    exportPolicy: "composite-only",
    required: true,
    interchangeable: false,
    allowEmpty: false,
    reason: "The primary visible subject remains authored as one cel unless the brief explicitly proves a reusable or independently controlled separation.",
  };
}

export function defaultFramePolicy(treatment: SpriteLayerTreatment): SpriteLayerFramePolicy {
  if (treatment === "linked-cel") return "linked-until-change";
  if (treatment === "engine-sidecar") return "derived";
  if (treatment === "guide-only") return "keyed-only";
  return "every-frame";
}

export function defaultExportPolicy(treatment: SpriteLayerTreatment): SpriteLayerExportPolicy {
  if (treatment === "baked-into-cel") return "composite-only";
  if (treatment === "engine-sidecar") return "engine-sidecar";
  if (treatment === "guide-only") return "source-only";
  return "layer-frames";
}
