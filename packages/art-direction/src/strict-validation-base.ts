import type { NormalizedArtDirectionCompileRequest } from "./types.js";
import { ArtDirectionError } from "./types.js";
import {
  validateArtDirectionCompileRequest as normalizeArtDirectionCompileRequest,
} from "./validation.js";

const RENDERING_MODES = new Set([
  "pixel-art",
  "indexed-raster",
  "painted-raster",
  "isometric-pixel",
  "pre-rendered-2.5d",
  "engraved-monochrome",
  "vector-flat",
  "painterly-illustration",
]);
const PROJECTIONS = new Set([
  "front",
  "side",
  "top-down",
  "three-quarter",
  "isometric-2:1",
  "dimetric",
  "orthographic-billboard",
  "perspective-2.5d",
  "screen-space-ui",
]);
const PALETTE_MODES = new Set(["indexed", "rgb", "monochrome"]);
const HUE_SHIFTS = new Set(["none", "subtle", "pronounced"]);
const ANTIALIAS_POLICIES = new Set(["none", "selective", "full"]);
const SUBPIXEL_POLICIES = new Set(["forbidden", "limited", "allowed"]);
const CLUSTER_POLICIES = new Set([
  "deliberate-clusters",
  "clean-raster",
  "painted-edge",
  "not-applicable",
]);
const DITHER_POLICIES = new Set([
  "none",
  "ordered",
  "patterned",
  "manual",
  "adaptive",
]);
const OUTLINE_POLICIES = new Set([
  "none",
  "single-colour",
  "selective",
  "coloured",
  "inked",
]);
const HORIZONS = new Set(["none", "low", "mid", "high"]);
const MIRRORING_POLICIES = new Set([
  "forbidden",
  "symmetric-only",
  "allowed",
]);
const SHADOW_TREATMENTS = new Set(["none", "baked", "separate", "engine"]);
const FRAME_VARIATION_POLICIES = new Set([
  "forbidden",
  "authored",
  "allowed",
]);
const TIMING_FEELS = new Set([
  "snappy",
  "weighty",
  "floaty",
  "mechanical",
  "naturalistic",
  "cinematic",
]);
const MOTION_POLICIES = new Set(["forbidden", "limited", "allowed"]);
const TRANSPARENCY_POLICIES = new Set([
  "required",
  "preferred",
  "opaque",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function atPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (current, key) =>
      isRecord(current) ? current[key] : undefined,
    value,
  );
}

function reject(path: string, expectation: string, value: unknown): never {
  throw new ArtDirectionError(
    "ART_DIRECTION_REQUEST_INVALID",
    `${path} ${expectation}.`,
    { path, value },
  );
}

function optionalEnum(
  input: unknown,
  path: string,
  allowed: ReadonlySet<string>,
): void {
  const value = atPath(input, path);
  if (value === undefined) return;
  if (typeof value !== "string" || !allowed.has(value)) {
    reject(path, `must be one of ${[...allowed].join(", ")}`, value);
  }
}

function optionalBoolean(input: unknown, path: string): void {
  const value = atPath(input, path);
  if (value !== undefined && typeof value !== "boolean") {
    reject(path, "must be true or false", value);
  }
}

function assertRuntimeTypes(input: unknown): void {
  optionalEnum(input, "style.renderingMode", RENDERING_MODES);
  optionalEnum(input, "style.projection", PROJECTIONS);
  optionalEnum(input, "style.palette.mode", PALETTE_MODES);
  optionalEnum(input, "style.palette.hueShift", HUE_SHIFTS);
  optionalEnum(input, "style.pixelGrid.antialias", ANTIALIAS_POLICIES);
  optionalEnum(input, "style.pixelGrid.subpixelMotion", SUBPIXEL_POLICIES);
  optionalEnum(input, "style.pixelGrid.clusterPolicy", CLUSTER_POLICIES);
  optionalEnum(input, "style.pixelGrid.dithering", DITHER_POLICIES);
  optionalEnum(input, "style.pixelGrid.outline", OUTLINE_POLICIES);
  optionalEnum(input, "style.camera.projection", PROJECTIONS);
  optionalEnum(input, "style.camera.horizon", HORIZONS);
  optionalEnum(input, "style.camera.mirroring", MIRRORING_POLICIES);
  optionalEnum(input, "style.lighting.shadowTreatment", SHADOW_TREATMENTS);
  optionalEnum(
    input,
    "style.lighting.frameVariation",
    FRAME_VARIATION_POLICIES,
  );
  optionalEnum(input, "style.motion.timingFeel", TIMING_FEELS);
  optionalEnum(input, "style.motion.smearFrames", MOTION_POLICIES);
  optionalEnum(input, "style.motion.squashAndStretch", MOTION_POLICIES);
  optionalEnum(input, "asset.transparency", TRANSPARENCY_POLICIES);

  for (const path of [
    "style.palette.preserveIndices",
    "style.pixelGrid.enabled",
    "style.pixelGrid.integerUpscaleOnly",
    "style.camera.fixed",
    "style.lighting.fixed",
    "style.motion.keyPoseFirst",
    "style.motion.exactFrameDurations",
    "style.motion.loopClosureRequired",
    "style.antiGeneric.prohibitUnrequestedProps",
    "style.antiGeneric.prohibitReadableText",
    "style.antiGeneric.prohibitWatermarks",
    "style.antiGeneric.prohibitModernGloss",
    "style.antiGeneric.prohibitRandomMicrodetail",
    "style.antiGeneric.prohibitStyleDrift",
    "style.antiGeneric.requireHistoricalPlausibility",
    "asset.animated",
    "asset.loop",
    "asset.asymmetric",
    "asset.hasHeldItems",
    "asset.runtimeEquipmentSwaps",
    "asset.runtimeCostumeVariants",
    "asset.independentEffects",
    "asset.independentShadow",
    "asset.needsCollision",
    "asset.needsNormalMap",
    "asset.needsEmissionMap",
    "asset.largeDeformations",
  ]) {
    optionalBoolean(input, path);
  }
}

export function validateArtDirectionCompileRequest(
  input: unknown,
): NormalizedArtDirectionCompileRequest {
  assertRuntimeTypes(input);
  return normalizeArtDirectionCompileRequest(input);
}
