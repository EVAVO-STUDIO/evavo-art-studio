import {
  CANONICAL_INSTANCE_POLICIES,
  SPRITE_CONTINUITY_LOCKS,
  SPRITE_PRODUCTION_METHODS,
  type CanonicalInstancePolicy,
  type SpriteContinuityLock,
  type SpriteProductionMethod,
} from "./constants.js";
import type { ValidationIssue } from "./validation-common.js";
import { inUnitInterval, isNonEmptyString, isNonNegativeInteger, isRecord, isStringArray, issue } from "./validation-common.js";
import { validateLayer } from "./validation-layer.js";

export function validateSprite(
  sprite: Record<string, unknown>,
  base: string,
  issues: ValidationIssue[],
): void {
  if (sprite.canonicalAssetId !== undefined && !isNonEmptyString(sprite.canonicalAssetId)) {
    issue(issues, `${base}.canonicalAssetId`, "canonicalAssetId must be a non-empty string.");
  }
  if (
    sprite.canonicalInstancePolicy !== undefined &&
    !CANONICAL_INSTANCE_POLICIES.includes(sprite.canonicalInstancePolicy as CanonicalInstancePolicy)
  ) {
    issue(issues, `${base}.canonicalInstancePolicy`, "Unsupported canonical instance policy.");
  }
  if (
    sprite.productionMethod !== undefined &&
    !SPRITE_PRODUCTION_METHODS.includes(sprite.productionMethod as SpriteProductionMethod)
  ) {
    issue(issues, `${base}.productionMethod`, "Unsupported sprite production method.");
  }
  if (sprite.layers !== undefined) {
    if (!Array.isArray(sprite.layers)) {
      issue(issues, `${base}.layers`, "layers must be an array.");
    } else {
      sprite.layers.forEach((layer, index) => {
        if (!isRecord(layer)) issue(issues, `${base}.layers[${index}]`, "Layer must be an object.");
        else validateLayer(layer, `${base}.layers[${index}]`, issues);
      });
    }
  }
  if (sprite.shot !== undefined) {
    if (!isRecord(sprite.shot)) {
      issue(issues, `${base}.shot`, "shot must be an object.");
    } else {
      if (sprite.shot.include !== undefined && !isStringArray(sprite.shot.include)) {
        issue(issues, `${base}.shot.include`, "include must be a string array.");
      }
      if (sprite.shot.exclude !== undefined && !isStringArray(sprite.shot.exclude)) {
        issue(issues, `${base}.shot.exclude`, "exclude must be a string array.");
      }
      if (sprite.shot.safePadding !== undefined && !isNonNegativeInteger(sprite.shot.safePadding)) {
        issue(issues, `${base}.shot.safePadding`, "safePadding must be a non-negative integer.");
      }
      if (
        sprite.shot.backgroundPolicy !== undefined &&
        !["transparent", "opaque-source", "declared-environment"].includes(String(sprite.shot.backgroundPolicy))
      ) {
        issue(issues, `${base}.shot.backgroundPolicy`, "Unsupported backgroundPolicy.");
      }
      if (sprite.shot.allowCrop !== undefined && typeof sprite.shot.allowCrop !== "boolean") {
        issue(issues, `${base}.shot.allowCrop`, "allowCrop must be boolean.");
      }
      if (
        sprite.shot.shadowPolicy !== undefined &&
        !["none", "baked", "separate"].includes(String(sprite.shot.shadowPolicy))
      ) {
        issue(issues, `${base}.shot.shadowPolicy`, "Unsupported shadowPolicy.");
      }
    }
  }
  if (sprite.continuityLocks !== undefined) {
    if (!Array.isArray(sprite.continuityLocks) || !sprite.continuityLocks.every((entry) => SPRITE_CONTINUITY_LOCKS.includes(entry as SpriteContinuityLock))) {
      issue(issues, `${base}.continuityLocks`, "continuityLocks contains an unsupported lock.");
    }
  }
  if (sprite.allowedChanges !== undefined && !isStringArray(sprite.allowedChanges)) {
    issue(issues, `${base}.allowedChanges`, "allowedChanges must be a string array.");
  }
  if (sprite.generation !== undefined) {
    if (!isRecord(sprite.generation)) {
      issue(issues, `${base}.generation`, "generation must be an object.");
    } else {
      for (const field of [
        "identityReferenceWeight",
        "structureReferenceWeight",
        "previousFrameWeight",
        "nextFrameWeight",
      ] as const) {
        if (sprite.generation[field] !== undefined && !inUnitInterval(sprite.generation[field])) {
          issue(issues, `${base}.generation.${field}`, `${field} must be between zero and one.`);
        }
      }
      if (
        sprite.generation.seedPolicy !== undefined &&
        !["family-derived", "fixed-family"].includes(String(sprite.generation.seedPolicy))
      ) {
        issue(issues, `${base}.generation.seedPolicy`, "Unsupported seedPolicy.");
      }
      if (
        sprite.generation.requestUnit !== undefined &&
        !["single-frame", "single-layer"].includes(String(sprite.generation.requestUnit))
      ) {
        issue(issues, `${base}.generation.requestUnit`, "requestUnit must be single-frame or single-layer.");
      }
      if (
        sprite.generation.allowIndependentTextOnlyFrames !== undefined &&
        sprite.generation.allowIndependentTextOnlyFrames !== false
      ) {
        issue(
          issues,
          `${base}.generation.allowIndependentTextOnlyFrames`,
          "Independent text-only frame generation is forbidden.",
        );
      }
      if (sprite.generation.structuralControls !== undefined) {
        const validControls = ["pose-map", "silhouette-mask", "edge-map", "depth-map", "layout-mask"];
        if (
          !Array.isArray(sprite.generation.structuralControls) ||
          !sprite.generation.structuralControls.every((entry) => validControls.includes(String(entry)))
        ) {
          issue(issues, `${base}.generation.structuralControls`, "Unsupported structural control.");
        }
      }
    }
  }
  if (sprite.source !== undefined) {
    if (!isRecord(sprite.source)) {
      issue(issues, `${base}.source`, "source must be an object.");
    } else {
      if (
        sprite.source.editableSource !== undefined &&
        !["aseprite", "ora", "psd"].includes(String(sprite.source.editableSource))
      ) {
        issue(issues, `${base}.source.editableSource`, "Unsupported editable source format.");
      }
      for (const field of [
        "retainIndividualFrames",
        "retainLayerFrames",
        "retainPackedDerivative",
        "retainLinkedCels",
      ] as const) {
        if (sprite.source[field] !== undefined && typeof sprite.source[field] !== "boolean") {
          issue(issues, `${base}.source.${field}`, `${field} must be boolean.`);
        }
      }
    }
  }
}
