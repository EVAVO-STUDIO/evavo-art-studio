import {
  SPRITE_LAYER_EXPORT_POLICIES,
  SPRITE_LAYER_FRAME_POLICIES,
  SPRITE_LAYER_ROLES,
  SPRITE_LAYER_TREATMENTS,
  type SpriteLayerExportPolicy,
  type SpriteLayerFramePolicy,
  type SpriteLayerRole,
  type SpriteLayerTreatment,
} from "./constants.js";
import type { ValidationIssue } from "./validation-common.js";
import { isFiniteNumber, isNonEmptyString, isRecord, isStringArray, issue } from "./validation-common.js";

export function validateLayer(
  layer: Record<string, unknown>,
  base: string,
  issues: ValidationIssue[],
): void {
  if (!isNonEmptyString(layer.id)) issue(issues, `${base}.id`, "Layer id is required.");
  if (!SPRITE_LAYER_ROLES.includes(layer.role as SpriteLayerRole)) {
    issue(issues, `${base}.role`, "Unsupported sprite layer role.");
  }
  if (!SPRITE_LAYER_TREATMENTS.includes(layer.treatment as SpriteLayerTreatment)) {
    issue(issues, `${base}.treatment`, "Unsupported sprite layer treatment.");
  }
  if (!isNonEmptyString(layer.reason)) issue(issues, `${base}.reason`, "Every layer needs a separation or bake reason.");
  if (layer.parentId !== undefined && !isNonEmptyString(layer.parentId)) {
    issue(issues, `${base}.parentId`, "parentId must be a non-empty string.");
  }
  if (layer.zIndex !== undefined && !isFiniteNumber(layer.zIndex)) {
    issue(issues, `${base}.zIndex`, "zIndex must be finite.");
  }
  if (layer.framePolicy !== undefined && !SPRITE_LAYER_FRAME_POLICIES.includes(layer.framePolicy as SpriteLayerFramePolicy)) {
    issue(issues, `${base}.framePolicy`, "Unsupported layer frame policy.");
  }
  if (layer.exportPolicy !== undefined && !SPRITE_LAYER_EXPORT_POLICIES.includes(layer.exportPolicy as SpriteLayerExportPolicy)) {
    issue(issues, `${base}.exportPolicy`, "Unsupported layer export policy.");
  }
  for (const field of ["required", "interchangeable", "allowEmpty"] as const) {
    if (layer[field] !== undefined && typeof layer[field] !== "boolean") {
      issue(issues, `${base}.${field}`, `${field} must be boolean.`);
    }
  }
  if (layer.occludes !== undefined && !isStringArray(layer.occludes)) {
    issue(issues, `${base}.occludes`, "occludes must be a string array.");
  }
  if (layer.notes !== undefined && !isStringArray(layer.notes)) {
    issue(issues, `${base}.notes`, "notes must be a string array.");
  }

  const treatment = layer.treatment as SpriteLayerTreatment;
  const exportPolicy = layer.exportPolicy as SpriteLayerExportPolicy | undefined;
  if (treatment === "baked-into-cel" && exportPolicy !== undefined && exportPolicy !== "composite-only" && exportPolicy !== "source-only") {
    issue(issues, `${base}.exportPolicy`, "A baked layer cannot export independent layer frames.");
  }
  if (treatment === "engine-sidecar" && exportPolicy !== undefined && exportPolicy !== "engine-sidecar") {
    issue(issues, `${base}.exportPolicy`, "An engine sidecar must use engine-sidecar export.");
  }
  if (treatment === "guide-only" && exportPolicy !== undefined && exportPolicy !== "source-only") {
    issue(issues, `${base}.exportPolicy`, "A guide-only layer must remain source-only.");
  }
}

export function validateLayerRelationships(
  asset: Record<string, unknown>,
  assetIndex: number,
  issues: ValidationIssue[],
): void {
  if (!isRecord(asset.sprite) || !Array.isArray(asset.sprite.layers)) return;
  const layers = asset.sprite.layers.filter(isRecord);
  const ids = new Set<string>();
  const parentById = new Map<string, string>();

  layers.forEach((layer, layerIndex) => {
    if (!isNonEmptyString(layer.id)) return;
    if (ids.has(layer.id)) {
      issue(issues, `$.assets[${assetIndex}].sprite.layers[${layerIndex}].id`, "Layer ids must be unique.");
    }
    ids.add(layer.id);
  });

  layers.forEach((layer, layerIndex) => {
    if (!isNonEmptyString(layer.id)) return;
    if (isNonEmptyString(layer.parentId)) {
      if (!ids.has(layer.parentId)) {
        issue(
          issues,
          `$.assets[${assetIndex}].sprite.layers[${layerIndex}].parentId`,
          "Layer parent does not exist.",
        );
      } else if (layer.parentId === layer.id) {
        issue(
          issues,
          `$.assets[${assetIndex}].sprite.layers[${layerIndex}].parentId`,
          "A layer cannot parent itself.",
        );
      } else {
        parentById.set(layer.id, layer.parentId);
      }
    }
    if (Array.isArray(layer.occludes)) {
      layer.occludes.forEach((target, targetIndex) => {
        if (isNonEmptyString(target) && !ids.has(target)) {
          issue(
            issues,
            `$.assets[${assetIndex}].sprite.layers[${layerIndex}].occludes[${targetIndex}]`,
            "Occluded layer does not exist.",
          );
        }
      });
    }
  });

  for (const id of ids) {
    const seen = new Set<string>();
    let current: string | undefined = id;
    while (current !== undefined) {
      if (seen.has(current)) {
        issue(issues, `$.assets[${assetIndex}].sprite.layers`, `Layer parent cycle includes ${current}.`);
        break;
      }
      seen.add(current);
      current = parentById.get(current);
    }
  }
}
