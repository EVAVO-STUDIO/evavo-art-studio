import { createHash } from "node:crypto";
import path from "node:path";

import { ArtDirectionError } from "./types.js";
import type {
  LayeredProductionAlphaPolicy,
  LayeredProductionAssemblyMode,
  LayeredProductionLayerInput,
  LayeredProductionLayerRole,
  LayeredProductionUnitInput,
  LayeredProductionUnitKind,
  LayeredProductionYSortMode,
} from "./layered-production-types.js";

export const ID_PATTERN = /^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/;
export const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
export const HEX_COLOUR_PATTERN = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;
export const FORBIDDEN_SOURCE_TERMS = /(?:contact[ -]?sheet|sprite[ -]?sheet|concept[ -]?sheet|moodboard|storyboard|multi[ -]?panel|collage|comparison[ -]?grid)/i;
export const LAYER_ROLES = new Set<LayeredProductionLayerRole>([
  "ground-base",
  "route-base",
  "architecture-back",
  "destination-structure",
  "world-prop",
  "crowd-character",
  "player-character",
  "foreground-occlusion",
  "ambient-effect",
  "route-highlight",
  "ui",
  "custom",
]);
export const UNIT_KINDS = new Set<LayeredProductionUnitKind>([
  "full-canvas-layer",
  "sprite",
  "animation-frame",
  "tile",
  "overlay",
]);
export const ALPHA_POLICIES = new Set<LayeredProductionAlphaPolicy>(["opaque", "transparent", "mixed"]);
export const ASSEMBLY_MODES = new Set<LayeredProductionAssemblyMode>(["full-canvas", "positioned", "tilemap", "y-sorted"]);
export const Y_SORT_MODES = new Set<LayeredProductionYSortMode>(["none", "ground-contact", "runtime"]);

export function fail(code: string, message: string, details?: unknown): never {
  throw new ArtDirectionError(code, message, details);
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("LAYERED_PRODUCTION_INPUT_INVALID", `${label} must be an object.`);
  return value as Record<string, unknown>;
}

export function exactKeys(value: Record<string, unknown>, label: string, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length) fail("LAYERED_PRODUCTION_INPUT_INVALID", `${label} contains unsupported fields: ${unknown.join(", ")}.`);
}

export function stringValue(value: unknown, label: string, maximum = 4096): string {
  if (typeof value !== "string" || value.trim().length === 0) fail("LAYERED_PRODUCTION_INPUT_INVALID", `${label} must be a non-empty string.`);
  const output = value.trim();
  if (output.length > maximum) fail("LAYERED_PRODUCTION_INPUT_INVALID", `${label} must not exceed ${maximum} characters.`);
  return output;
}

export function idValue(value: unknown, label: string): string {
  const output = stringValue(value, label, 160);
  if (!ID_PATTERN.test(output) || output.includes("..")) fail("LAYERED_PRODUCTION_INPUT_INVALID", `${label} must be a canonical lowercase identifier.`);
  return output;
}

export function numberValue(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail("LAYERED_PRODUCTION_INPUT_INVALID", `${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

export function integerValue(value: unknown, label: string, minimum: number, maximum: number): number {
  const output = numberValue(value, label, minimum, maximum);
  if (!Number.isInteger(output)) fail("LAYERED_PRODUCTION_INPUT_INVALID", `${label} must be an integer.`);
  return output;
}

export function literalTrue(value: unknown, label: string): true {
  if (value !== true) fail("LAYERED_PRODUCTION_POLICY_INVALID", `${label} must remain true.`);
  return true;
}

export function strings(value: unknown, label: string, minimum = 1, maximumItems = 128, maximumText = 500): readonly string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximumItems) {
    fail("LAYERED_PRODUCTION_INPUT_INVALID", `${label} must contain between ${minimum} and ${maximumItems} items.`);
  }
  const output = value.map((item, index) => stringValue(item, `${label}[${index}]`, maximumText));
  const duplicates = output.filter((item, index) => output.indexOf(item) !== index);
  if (duplicates.length) fail("LAYERED_PRODUCTION_INPUT_INVALID", `${label} contains duplicate value ${duplicates[0]}.`);
  return output;
}

export function optionalStrings(value: unknown, label: string): readonly string[] {
  if (value === undefined) return [];
  return strings(value, label, 0);
}

export function dimensions(value: unknown, label: string): Readonly<{ width: number; height: number }> {
  const input = record(value, label);
  exactKeys(input, label, ["width", "height"]);
  return {
    width: integerValue(input.width, `${label}.width`, 1, 8192),
    height: integerValue(input.height, `${label}.height`, 1, 8192),
  };
}

export function point(value: unknown, label: string, maximumX: number, maximumY: number): Readonly<{ x: number; y: number }> {
  const input = record(value, label);
  exactKeys(input, label, ["x", "y"]);
  return {
    x: integerValue(input.x, `${label}.x`, 0, maximumX),
    y: integerValue(input.y, `${label}.y`, 0, maximumY),
  };
}

export function relativePath(value: unknown, label: string): string {
  const output = stringValue(value, label, 1000);
  if (output.includes("\\") || path.posix.isAbsolute(output)) fail("LAYERED_PRODUCTION_PATH_INVALID", `${label} must be a repository-relative POSIX path.`);
  const normalized = path.posix.normalize(output);
  if (normalized !== output || normalized === "." || normalized.startsWith("../")) fail("LAYERED_PRODUCTION_PATH_INVALID", `${label} may not escape its root.`);
  return output;
}

export function fileName(value: unknown, label: string): string {
  const output = stringValue(value, label, 255);
  if (output.includes("/") || output.includes("\\") || !/^[a-z0-9][a-z0-9_.-]*\.png$/.test(output)) {
    fail("LAYERED_PRODUCTION_PATH_INVALID", `${label} must be a lowercase PNG basename.`);
  }
  if (FORBIDDEN_SOURCE_TERMS.test(output)) fail("LAYERED_PRODUCTION_SOURCE_INVALID", `${label} describes a forbidden flattened or multi-panel source.`);
  return output;
}

export function canonicalSort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalSort);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, canonicalSort((value as Record<string, unknown>)[key])]));
}

export function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalSort(value))).digest("hex");
}

export function freeze<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach((item) => freeze(item));
    return Object.freeze(value) as T;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) => freeze(item));
    return Object.freeze(value);
  }
  return value;
}

export function normalizedUnit(
  value: unknown,
  label: string,
  canvas: Readonly<{ width: number; height: number }>,
  layer: Readonly<{ alpha: LayeredProductionAlphaPolicy; assemblyMode: LayeredProductionAssemblyMode; ySortMode: LayeredProductionYSortMode }>,
): LayeredProductionUnitInput {
  const input = record(value, label);
  exactKeys(input, label, ["id", "kind", "purpose", "dimensions", "position", "pivot", "ySortOrigin", "continuityKey", "include", "exclude", "fileName", "targetPath", "frame"]);
  const id = idValue(input.id, `${label}.id`);
  const kind = stringValue(input.kind, `${label}.kind`, 40) as LayeredProductionUnitKind;
  if (!UNIT_KINDS.has(kind)) fail("LAYERED_PRODUCTION_UNIT_INVALID", `${label}.kind is unsupported.`);
  const purpose = stringValue(input.purpose, `${label}.purpose`, 1000);
  if (FORBIDDEN_SOURCE_TERMS.test(purpose)) fail("LAYERED_PRODUCTION_SOURCE_INVALID", `${label}.purpose requests a forbidden flattened or multi-panel source.`);
  const size = dimensions(input.dimensions, `${label}.dimensions`);
  const position = input.position === undefined ? undefined : point(input.position, `${label}.position`, canvas.width, canvas.height);
  const pivot = input.pivot === undefined ? undefined : point(input.pivot, `${label}.pivot`, size.width, size.height);
  const ySortOrigin = input.ySortOrigin === undefined ? undefined : point(input.ySortOrigin, `${label}.ySortOrigin`, size.width, size.height);
  if (kind === "full-canvas-layer") {
    if (size.width !== canvas.width || size.height !== canvas.height) fail("LAYERED_PRODUCTION_GEOMETRY_INVALID", `${label} full-canvas dimensions must equal ${canvas.width}x${canvas.height}.`);
    if (position && (position.x !== 0 || position.y !== 0)) fail("LAYERED_PRODUCTION_GEOMETRY_INVALID", `${label} full-canvas position must be 0,0.`);
    if (layer.assemblyMode !== "full-canvas") fail("LAYERED_PRODUCTION_GEOMETRY_INVALID", `${label} full-canvas unit requires full-canvas assembly mode.`);
  }
  if (layer.assemblyMode === "positioned" && !position) fail("LAYERED_PRODUCTION_GEOMETRY_INVALID", `${label} requires an assembly position.`);
  if (layer.assemblyMode === "y-sorted" && !pivot) fail("LAYERED_PRODUCTION_GEOMETRY_INVALID", `${label} requires a pivot for Y-sorted assembly.`);
  if (layer.ySortMode !== "none" && !ySortOrigin) fail("LAYERED_PRODUCTION_GEOMETRY_INVALID", `${label} requires a Y-sort origin.`);
  if ((kind === "sprite" || kind === "animation-frame") && layer.alpha === "opaque") fail("LAYERED_PRODUCTION_ALPHA_INVALID", `${label} sprite sources may not use an opaque layer policy.`);
  const frame = input.frame === undefined ? undefined : (() => {
    const frameInput = record(input.frame, `${label}.frame`);
    exactKeys(frameInput, `${label}.frame`, ["clipId", "frameNumber", "frameCount", "framesPerSecond", "loop", "pose"]);
    const frameCount = integerValue(frameInput.frameCount, `${label}.frame.frameCount`, 1, 256);
    const frameNumber = integerValue(frameInput.frameNumber, `${label}.frame.frameNumber`, 1, frameCount);
    if (typeof frameInput.loop !== "boolean") fail("LAYERED_PRODUCTION_INPUT_INVALID", `${label}.frame.loop must be boolean.`);
    return {
      clipId: idValue(frameInput.clipId, `${label}.frame.clipId`),
      frameNumber,
      frameCount,
      framesPerSecond: numberValue(frameInput.framesPerSecond, `${label}.frame.framesPerSecond`, 0.1, 60),
      loop: frameInput.loop,
      pose: stringValue(frameInput.pose, `${label}.frame.pose`, 1000),
    };
  })();
  if (kind === "animation-frame" && !frame) fail("LAYERED_PRODUCTION_UNIT_INVALID", `${label} animation frame requires frame metadata.`);
  if (kind !== "animation-frame" && frame) fail("LAYERED_PRODUCTION_UNIT_INVALID", `${label} frame metadata is only valid for animation-frame units.`);
  const include = strings(input.include, `${label}.include`, 1);
  const exclude = strings(input.exclude, `${label}.exclude`, 1);
  if ([...include, ...exclude].some((entry) => FORBIDDEN_SOURCE_TERMS.test(entry))) {
    fail("LAYERED_PRODUCTION_SOURCE_INVALID", `${label} may not request a sheet, collage, storyboard, grid or multi-panel source.`);
  }
  const outputFileName = fileName(input.fileName, `${label}.fileName`);
  const targetPath = relativePath(input.targetPath, `${label}.targetPath`);
  if (!targetPath.endsWith(`/${outputFileName}`) && targetPath !== outputFileName) fail("LAYERED_PRODUCTION_PATH_INVALID", `${label}.targetPath must end with its fileName.`);
  return freeze({
    id,
    kind,
    purpose,
    dimensions: size,
    ...(position ? { position } : {}),
    ...(pivot ? { pivot } : {}),
    ...(ySortOrigin ? { ySortOrigin } : {}),
    continuityKey: idValue(input.continuityKey, `${label}.continuityKey`),
    include,
    exclude,
    fileName: outputFileName,
    targetPath,
    ...(frame ? { frame } : {}),
  });
}

export function normalizedLayer(value: unknown, label: string, canvas: Readonly<{ width: number; height: number }>): LayeredProductionLayerInput {
  const input = record(value, label);
  exactKeys(input, label, ["id", "role", "zOrder", "alpha", "assemblyMode", "ySortMode", "dependsOn", "include", "exclude", "units"]);
  const id = idValue(input.id, `${label}.id`);
  const role = stringValue(input.role, `${label}.role`, 80) as LayeredProductionLayerRole;
  if (!LAYER_ROLES.has(role)) fail("LAYERED_PRODUCTION_LAYER_INVALID", `${label}.role is unsupported.`);
  const alpha = stringValue(input.alpha, `${label}.alpha`, 20) as LayeredProductionAlphaPolicy;
  if (!ALPHA_POLICIES.has(alpha)) fail("LAYERED_PRODUCTION_ALPHA_INVALID", `${label}.alpha is unsupported.`);
  const assemblyMode = stringValue(input.assemblyMode, `${label}.assemblyMode`, 30) as LayeredProductionAssemblyMode;
  if (!ASSEMBLY_MODES.has(assemblyMode)) fail("LAYERED_PRODUCTION_LAYER_INVALID", `${label}.assemblyMode is unsupported.`);
  const ySortMode = stringValue(input.ySortMode, `${label}.ySortMode`, 30) as LayeredProductionYSortMode;
  if (!Y_SORT_MODES.has(ySortMode)) fail("LAYERED_PRODUCTION_LAYER_INVALID", `${label}.ySortMode is unsupported.`);
  if (ySortMode !== "none" && assemblyMode !== "y-sorted") fail("LAYERED_PRODUCTION_LAYER_INVALID", `${label} Y-sort mode requires y-sorted assembly.`);
  const layerContext = { alpha, assemblyMode, ySortMode };
  if (!Array.isArray(input.units) || input.units.length === 0 || input.units.length > 512) fail("LAYERED_PRODUCTION_LAYER_INVALID", `${label}.units must contain between 1 and 512 units.`);
  const units = input.units.map((unit, index) => normalizedUnit(unit, `${label}.units[${index}]`, canvas, layerContext));
  const unitIds = units.map((unit) => unit.id);
  if (new Set(unitIds).size !== unitIds.length) fail("LAYERED_PRODUCTION_LAYER_INVALID", `${label} contains duplicate unit IDs.`);
  const include = strings(input.include, `${label}.include`, 1);
  const exclude = strings(input.exclude, `${label}.exclude`, 1);
  if ([...include, ...exclude].some((entry) => FORBIDDEN_SOURCE_TERMS.test(entry))) fail("LAYERED_PRODUCTION_SOURCE_INVALID", `${label} may not request flattened concept or sheet output.`);
  return freeze({
    id,
    role,
    zOrder: integerValue(input.zOrder, `${label}.zOrder`, -10000, 10000),
    alpha,
    assemblyMode,
    ySortMode,
    dependsOn: optionalStrings(input.dependsOn, `${label}.dependsOn`).map((dependency) => idValue(dependency, `${label}.dependsOn`)),
    include,
    exclude,
    units,
  });
}
