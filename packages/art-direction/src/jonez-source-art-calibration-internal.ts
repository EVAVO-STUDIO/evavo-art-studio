import { createHash } from "node:crypto";

import { ArtDirectionError } from "./types.js";
import type {
  LayeredProductionAlphaPolicy,
  LayeredProductionLayerRole,
  LayeredProductionRequestInput,
  LayeredProductionUnitKind,
} from "./layered-production-types.js";

export const JONEZ_SOURCE_ART_CALIBRATION_PROTOCOL_VERSION =
  "2026-08-13.1" as const;
export const JONEZ_SOURCE_ART_CALIBRATION_KIND =
  "evavo.jonez.source-art-calibration" as const;
export const JONEZ_CANONICAL_STYLE_ID =
  "jonez-1991-vga-story-city" as const;


import {
  CANONICAL_PALETTE,
  CANONICAL_PROOF_UNITS,
  CANONICAL_UNIT_LOCKS,
  COMMON_NEGATIVE_TERMS,
  ROLE_RECIPES,
  type RoleRecipe,
} from "./jonez-source-art-recipes.js";

export class JonezSourceArtCalibrationError extends ArtDirectionError {
  constructor(code: string, message: string, details?: unknown) {
    super(code, message, details);
    this.name = "JonezSourceArtCalibrationError";
  }
}

export function fail(code: string, message: string, details?: unknown): never {
  throw new JonezSourceArtCalibrationError(
    `JONEZ_SOURCE_ART_${code}`,
    message,
    details,
  );
}

function canonicalize(value: unknown, seen = new Set<object>()): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("INPUT_INVALID", "Canonical payload contains a non-finite number.");
    return value;
  }
  if (typeof value !== "object" || value === undefined) {
    fail("INPUT_INVALID", "Canonical payload contains a non-JSON value.");
  }
  if (seen.has(value)) fail("INPUT_INVALID", "Canonical payload contains a cycle.");
  seen.add(value);
  let output: unknown;
  if (Array.isArray(value)) {
    output = value.map((entry) => canonicalize(entry, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      fail("INPUT_INVALID", "Canonical payload contains a non-plain object.");
    }
    output = Object.fromEntries(
      Object.keys(value).sort().map((key) => {
        const entry = (value as Record<string, unknown>)[key];
        if (entry === undefined) fail("INPUT_INVALID", `Canonical payload property ${key} is undefined.`);
        return [key, canonicalize(entry, seen)];
      }),
    );
  }
  seen.delete(value);
  return output;
}

export function jonezSourceArtCalibrationSha256(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

function equalArray(left: readonly string[] | undefined, right: readonly string[]): boolean {
  return Boolean(
    left &&
      left.length === right.length &&
      left.every((entry, index) => entry === right[index]),
  );
}

export function assertCanonicalRequest(request: LayeredProductionRequestInput): void {
  if (
    request.project.gameId !== "jonez" ||
    request.project.gameTitle !== "JONEZ" ||
    request.project.engine !== "Godot" ||
    request.project.engineVersion !== "4.6.2"
  ) fail("PROJECT_INVALID", "Calibration accepts only the canonical JONEZ Godot 4.6.2 project.");
  if (
    request.canvas.width !== 320 ||
    request.canvas.height !== 200 ||
    request.canvas.worldWidth !== 960 ||
    request.canvas.worldHeight !== 600 ||
    request.canvas.coordinateSystem !== "top-left-integer" ||
    request.canvas.pixelAspect !== "dos-vga-4:3-corrected" ||
    request.canvas.filtering !== "nearest"
  ) fail("CANVAS_INVALID", "JONEZ calibration requires the exact 320x200 / 960x600 native DOS canvas contract.");
  if (
    request.style.styleId !== JONEZ_CANONICAL_STYLE_ID ||
    request.style.renderingMode !== "isometric-pixel" ||
    request.style.projection !== "dimetric" ||
    request.style.camera.fixed !== true ||
    request.style.camera.yawDegrees !== 45 ||
    request.style.camera.pitchDegrees !== 30 ||
    request.style.camera.rollDegrees !== 0 ||
    request.style.lighting.fixed !== true ||
    request.style.lighting.frameVariation !== "forbidden"
  ) fail("STYLE_INVALID", "JONEZ camera, projection or style identity drifted from the canonical authored source contract.");
  if (
    request.style.palette.mode !== "indexed" ||
    request.style.palette.maximumSceneColours !== 256 ||
    request.style.palette.maximumLocalColours !== 32 ||
    request.style.palette.preserveIndices !== true ||
    !equalArray(request.style.palette.colours, CANONICAL_PALETTE)
  ) fail("PALETTE_INVALID", "JONEZ source art must retain the exact canonical indexed palette order and budgets.");
  if (
    request.style.pixelGrammar.antialias !== "none" ||
    request.style.pixelGrammar.subpixelMotion !== "forbidden" ||
    request.style.pixelGrammar.gradientPolicy !== "forbidden" ||
    request.style.pixelGrammar.textureNoise !== "forbidden" ||
    request.style.pixelGrammar.dithering !== "manual" ||
    request.style.pixelGrammar.fixedPixelDensity !== true ||
    request.style.pixelGrammar.deliberateClusters !== true
  ) fail("PIXEL_GRAMMAR_INVALID", "JONEZ source art must retain manual clustered raster grammar with no smoothing, gradients or noise.");
  if (!equalArray(request.styleProof.unitIds, CANONICAL_PROOF_UNITS)) {
    fail("PROOF_SET_INVALID", "JONEZ style proof must retain the exact cross-layer canonical proof-unit order.");
  }
  if (
    request.sourcePolicy.oneImagePerProviderJob !== true ||
    request.sourcePolicy.oneLayerRolePerSourceUnit !== true ||
    request.sourcePolicy.maximumProviderImagesPerJob !== 1 ||
    request.sourcePolicy.conceptArtAsRuntimeSourceForbidden !== true ||
    request.sourcePolicy.collagesAsRuntimeSourceForbidden !== true ||
    request.sourcePolicy.contactSheetsAsRuntimeSourceForbidden !== true ||
    request.sourcePolicy.readableGeneratedTextForbidden !== true
  ) fail("SOURCE_POLICY_INVALID", "JONEZ source policy must remain one isolated runtime-source PNG per exact layer unit.");
}

export function locateUnit(request: LayeredProductionRequestInput, unitId: string) {
  for (const layer of request.layers) {
    const unit = layer.units.find((entry) => entry.id === unitId);
    if (unit) return { layer, unit };
  }
  fail("UNIT_NOT_FOUND", `JONEZ source unit ${unitId} does not exist in the production request.`);
}

export function assertUnitLock(
  unitId: string,
  role: LayeredProductionLayerRole,
  kind: LayeredProductionUnitKind,
  alpha: LayeredProductionAlphaPolicy,
  width: number,
  height: number,
): void {
  const lock = CANONICAL_UNIT_LOCKS[unitId];
  if (!lock) return;
  if (
    lock.role !== role ||
    lock.kind !== kind ||
    lock.alpha !== alpha ||
    lock.width !== width ||
    lock.height !== height
  ) fail("UNIT_GEOMETRY_INVALID", `Canonical JONEZ unit ${unitId} changed role, kind, alpha policy or native dimensions.`, { expected: lock, actual: { role, kind, alpha, width, height } });
}

export function promptAddendum(
  unitId: string,
  role: LayeredProductionLayerRole,
  recipe: RoleRecipe,
): string {
  return [
    "MEASURED JONEZ SOURCE-ART CALIBRATION — HAND-AUTHORED 1991 VGA RASTER, NOT A STYLE VIBE.",
    `Unit ${unitId}; exclusive role ${role}. Build the asset in this order: silhouette masses, four-to-five value groups, canonical palette assignment, connected cluster pass, selective contour pass, native-scale cleanup.`,
    `Native scale anchors: ${recipe.scaleAnchors.join("; ")}.`,
    `Silhouette rules: ${recipe.silhouetteRules.join("; ")}.`,
    `Value structure: ${recipe.valueRules.join("; ")}.`,
    `Palette roles: ${recipe.paletteRoles.join("; ")}.`,
    `Pixel-cluster grammar: ${recipe.clusterRules.join("; ")}.`,
    `Material construction: ${recipe.materialRules.join("; ")}.`,
    `Composition: ${recipe.compositionRules.join("; ")}.`,
    `Visual storytelling: ${recipe.storyRules.join("; ")}.`,
    "Originality boundary: use only original EVAVO silhouettes and architecture. The crowded seek-and-find influence is limited to density, recurring micro-stories and visual discovery; the life-sim influence is limited to readable destinations, route logic and everyday activity. Do not recreate any copyrighted character, costume, building, UI, logo or screenshot.",
    "Review threshold: score at least 92/100, pass every rubric minimum, and treat any listed blocking failure as an automatic rejection rather than something averaged away.",
    `Blocking failures: ${recipe.blockingFailures.join("; ")}.`,
    "Final native-scale test: the isolated source must remain readable at 1x, structurally clean at 8x nearest-neighbour, and useful when composited only with approved lower layers.",
  ].join("\n\n");
}

