import {
  ASSET_KINDS,
  AUTONOMY_MODES,
  OUTPUT_FORMATS,
  OUTPUT_PURPOSES,
  TARGET_KINDS,
  TRANSPARENCY_MODES,
  type AssetKind,
  type AutonomyMode,
  type OutputFormat,
  type OutputPurpose,
  type TargetKind,
  type TransparencyMode,
} from "./constants.js";
import type { ArtBrief } from "./models.js";
import {
  type ValidationIssue,
  type ValidationResult,
  SPRITE_ASSET_KINDS,
  inUnitInterval,
  isFinitePositiveInteger,
  isNonEmptyString,
  isRecord,
  isStringArray,
  issue,
  validateAnimation,
} from "./validation-common.js";
import { validateCanonicalRelationships } from "./validation-canonical.js";
import { validateLayerRelationships } from "./validation-layer.js";
import { validateSprite } from "./validation-sprite.js";

export function validateArtBrief(value: unknown): ValidationResult<ArtBrief> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return { success: false, issues: [{ path: "$", message: "Brief must be a JSON object." }] };
  }

  if (value.schemaVersion !== "1.0") issue(issues, "$.schemaVersion", "schemaVersion must be \"1.0\".");

  const project = value.project;
  if (!isRecord(project)) {
    issue(issues, "$.project", "project must be an object.");
  } else {
    if (!isNonEmptyString(project.projectName)) issue(issues, "$.project.projectName", "projectName is required.");
    if (!Array.isArray(project.targets) || project.targets.length === 0) {
      issue(issues, "$.project.targets", "At least one target profile is required.");
    } else {
      project.targets.forEach((target, index) => {
        if (!isRecord(target) || !TARGET_KINDS.includes(target.kind as TargetKind)) {
          issue(issues, `$.project.targets[${index}].kind`, "Unsupported target kind.");
        }
      });
    }
  }

  const direction = value.artDirection;
  if (!isRecord(direction)) {
    issue(issues, "$.artDirection", "artDirection must be an object.");
  } else {
    if (!isNonEmptyString(direction.styleName)) issue(issues, "$.artDirection.styleName", "styleName is required.");
    if (!isNonEmptyString(direction.intent)) issue(issues, "$.artDirection.intent", "intent is required.");
    if (!isStringArray(direction.mustHave)) issue(issues, "$.artDirection.mustHave", "mustHave must be a string array.");
    if (!isStringArray(direction.mustAvoid)) issue(issues, "$.artDirection.mustAvoid", "mustAvoid must be a string array.");
  }

  const rawAssets = value.assets;
  const assets: Record<string, unknown>[] = [];
  if (!Array.isArray(rawAssets) || rawAssets.length === 0) {
    issue(issues, "$.assets", "At least one asset request is required.");
  } else {
    const ids = new Set<string>();
    rawAssets.forEach((asset, index) => {
      const base = `$.assets[${index}]`;
      if (!isRecord(asset)) {
        issue(issues, base, "Asset request must be an object.");
        return;
      }
      assets.push(asset);
      if (!isNonEmptyString(asset.id)) issue(issues, `${base}.id`, "Asset id is required.");
      else if (ids.has(asset.id)) issue(issues, `${base}.id`, "Asset ids must be unique.");
      else ids.add(asset.id);
      if (!isNonEmptyString(asset.name)) issue(issues, `${base}.name`, "Asset name is required.");
      if (!ASSET_KINDS.includes(asset.kind as AssetKind)) issue(issues, `${base}.kind`, "Unsupported asset kind.");
      if (!isNonEmptyString(asset.purpose)) issue(issues, `${base}.purpose`, "Asset purpose is required.");
      if (!isFinitePositiveInteger(asset.quantity)) issue(issues, `${base}.quantity`, "quantity must be a positive integer.");
      if (
        !isRecord(asset.dimensions) ||
        !isFinitePositiveInteger(asset.dimensions.width) ||
        !isFinitePositiveInteger(asset.dimensions.height)
      ) {
        issue(issues, `${base}.dimensions`, "dimensions must contain positive integer width and height.");
      }
      if (!TRANSPARENCY_MODES.includes(asset.transparency as TransparencyMode)) {
        issue(issues, `${base}.transparency`, "Unsupported transparency mode.");
      }
      if (!Array.isArray(asset.outputs) || asset.outputs.length === 0) {
        issue(issues, `${base}.outputs`, "At least one output is required.");
      } else {
        asset.outputs.forEach((output, outputIndex) => {
          const outputBase = `${base}.outputs[${outputIndex}]`;
          if (!isRecord(output)) {
            issue(issues, outputBase, "Output must be an object.");
            return;
          }
          if (!OUTPUT_FORMATS.includes(output.format as OutputFormat)) {
            issue(issues, `${outputBase}.format`, "Unsupported output format.");
          }
          if (!OUTPUT_PURPOSES.includes(output.purpose as OutputPurpose)) {
            issue(issues, `${outputBase}.purpose`, "Unsupported output purpose.");
          }
          if (typeof output.lossless !== "boolean") {
            issue(issues, `${outputBase}.lossless`, "lossless must be boolean.");
          }
        });
      }
      if (asset.animation !== undefined) {
        if (!isRecord(asset.animation)) issue(issues, `${base}.animation`, "animation must be an object.");
        else validateAnimation(asset.animation, `${base}.animation`, issues);
      }
      if (asset.sprite !== undefined) {
        if (!isRecord(asset.sprite)) issue(issues, `${base}.sprite`, "sprite must be an object.");
        else {
          if (!SPRITE_ASSET_KINDS.has(asset.kind as AssetKind)) {
            issue(issues, `${base}.sprite`, "sprite continuity is only valid for character, animation, sprite-sheet or particle assets.");
          }
          validateSprite(asset.sprite, `${base}.sprite`, issues);
        }
      }
      if (asset.tags !== undefined && !isStringArray(asset.tags)) issue(issues, `${base}.tags`, "tags must be a string array.");
      if (asset.notes !== undefined && !isStringArray(asset.notes)) issue(issues, `${base}.notes`, "notes must be a string array.");
    });

    rawAssets.forEach((asset, index) => {
      if (isRecord(asset)) validateLayerRelationships(asset, index, issues);
    });
    validateCanonicalRelationships(assets, issues);
  }

  const autonomy = value.autonomy;
  if (!isRecord(autonomy)) {
    issue(issues, "$.autonomy", "autonomy must be an object.");
  } else {
    if (!AUTONOMY_MODES.includes(autonomy.mode as AutonomyMode)) {
      issue(issues, "$.autonomy.mode", "Unsupported autonomy mode.");
    }
    if (!isFinitePositiveInteger(autonomy.candidateCount)) {
      issue(issues, "$.autonomy.candidateCount", "candidateCount must be a positive integer.");
    }
    if (!isFinitePositiveInteger(autonomy.maximumIterations)) {
      issue(issues, "$.autonomy.maximumIterations", "maximumIterations must be a positive integer.");
    }
    if (!inUnitInterval(autonomy.autoApproveThreshold)) {
      issue(issues, "$.autonomy.autoApproveThreshold", "autoApproveThreshold must be between zero and one.");
    }
    if (typeof autonomy.allowProviderFallback !== "boolean") {
      issue(issues, "$.autonomy.allowProviderFallback", "allowProviderFallback must be boolean.");
    }
    if (typeof autonomy.requireEvidenceBundle !== "boolean") {
      issue(issues, "$.autonomy.requireEvidenceBundle", "requireEvidenceBundle must be boolean.");
    }
  }

  if (issues.length > 0) return { success: false, issues };
  return { success: true, value: value as unknown as ArtBrief };
}

export function assertArtBrief(value: unknown): ArtBrief {
  const result = validateArtBrief(value);
  if (result.success) return result.value;
  const detail = result.issues.map((entry) => `${entry.path}: ${entry.message}`).join("\n");
  throw new Error(`Invalid EVAVO Art Studio brief:\n${detail}`);
}
