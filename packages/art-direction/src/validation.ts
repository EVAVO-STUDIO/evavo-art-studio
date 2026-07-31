import { createHash } from "node:crypto";

import { resolveArtDirectionOutputProfile } from "./output-profiles.js";
import { resolveArtDirectionPreset } from "./presets.js";
import {
  ART_DIRECTION_OUTPUT_PROFILE_IDS,
  ART_DIRECTION_PRESET_IDS,
  ART_DIRECTION_PROTOCOL_VERSION,
  ArtDirectionError,
  type ArtAssetFamily,
  type ArtDirectionCompileRequestInput,
  type ArtDirectionLayerOverrideInput,
  type ArtDirectionOutputProfileId,
  type ArtDirectionPresetId,
  type ArtDirectionReferenceInput,
  type ArtDirectionStyleInput,
  type NormalizedArtDirectionCompileRequest,
  type NormalizedArtDirectionReference,
  type NormalizedArtDirectionStyle,
} from "./types.js";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HEX = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/;
const FAMILY = new Set<ArtAssetFamily>([
  "character", "creature", "prop", "tile", "terrain", "environment", "ui",
  "icon", "portrait", "particle", "cinematic", "background", "decal", "font",
]);
const PRESET = new Set<string>(ART_DIRECTION_PRESET_IDS);
const OUTPUT = new Set<string>(ART_DIRECTION_OUTPUT_PROFILE_IDS);
const REFERENCE_ROLES = new Set([
  "style", "palette", "camera", "lighting", "material", "identity", "motion", "historical", "composition",
]);
const LAYER_ROLES = new Set([
  "identity-core", "costume", "hair", "face", "shadow", "equipment", "weapon", "effect", "emission",
  "normal", "collision", "occlusion", "guide", "background", "foreground", "tile-mask", "depth",
]);
const LAYER_TREATMENTS = new Set([
  "baked", "separate-per-frame", "linked-cel", "static-family", "engine-sidecar", "guide-only", "runtime-rig",
]);
const RENDERING = new Set([
  "pixel-art", "indexed-raster", "painted-raster", "isometric-pixel", "pre-rendered-2.5d",
  "engraved-monochrome", "vector-flat", "painterly-illustration",
]);
const PROJECTIONS = new Set([
  "front", "side", "top-down", "three-quarter", "isometric-2:1", "dimetric",
  "orthographic-billboard", "perspective-2.5d", "screen-space-ui",
]);

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("ART_DIRECTION_REQUEST_INVALID", `${name} must be an object.`);
  return value as Record<string, unknown>;
}

function fail(code: string, message: string, details?: unknown): never {
  throw new ArtDirectionError(code, message, details);
}

function text(value: unknown, name: string, fallback?: string, maximum = 4096): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string") fail("ART_DIRECTION_REQUEST_INVALID", `${name} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || normalized.includes("\0")) {
    fail("ART_DIRECTION_REQUEST_INVALID", `${name} must contain 1 to ${maximum} safe characters.`);
  }
  return normalized;
}

function id(value: unknown, name: string): string {
  const normalized = text(value, name, undefined, 128);
  if (!SAFE_ID.test(normalized)) fail("ART_DIRECTION_REQUEST_INVALID", `${name} must be a safe identifier.`);
  return normalized;
}

function finite(value: unknown, name: string, fallback: number, minimum: number, maximum: number): number {
  const resolved = value === undefined ? fallback : value;
  if (typeof resolved !== "number" || !Number.isFinite(resolved) || resolved < minimum || resolved > maximum) {
    fail("ART_DIRECTION_REQUEST_INVALID", `${name} must be between ${minimum} and ${maximum}.`);
  }
  return resolved;
}

function integer(value: unknown, name: string, fallback: number, minimum: number, maximum: number): number {
  const resolved = finite(value, name, fallback, minimum, maximum);
  if (!Number.isInteger(resolved)) fail("ART_DIRECTION_REQUEST_INVALID", `${name} must be an integer.`);
  return resolved;
}

function bool(value: unknown, fallback: boolean): boolean {
  return value === undefined ? fallback : value === true;
}

function strings(value: unknown, name: string, fallback: readonly string[] = [], maximumItems = 64): readonly string[] {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value) || value.length > maximumItems) fail("ART_DIRECTION_REQUEST_INVALID", `${name} must contain no more than ${maximumItems} strings.`);
  const result = value.map((entry, index) => text(entry, `${name}[${index}]`, undefined, 1024));
  return [...new Set(result)];
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`;
}

export function artDirectionSha256(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!override || typeof override !== "object" || Array.isArray(override)) return base;
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    const previous = result[key];
    result[key] = previous && typeof previous === "object" && !Array.isArray(previous) && value && typeof value === "object" && !Array.isArray(value)
      ? deepMerge(previous, value)
      : value;
  }
  return result as T;
}

function atPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) =>
    current && typeof current === "object" && !Array.isArray(current)
      ? (current as Record<string, unknown>)[key]
      : undefined, value);
}

function lockPreset(style: ArtDirectionStyleInput | undefined, presetId: ArtDirectionPresetId | undefined): ArtDirectionStyleInput {
  if (!presetId) return style ?? {};
  const preset = resolveArtDirectionPreset(presetId);
  for (const path of preset.lockedFields) {
    const supplied = atPath(style, path);
    const locked = atPath(preset.style, path);
    if (supplied !== undefined && JSON.stringify(supplied) !== JSON.stringify(locked)) {
      fail("ART_DIRECTION_PRESET_LOCK_VIOLATION", `${path} conflicts with locked preset ${presetId}.`, { path, supplied, locked });
    }
  }
  return deepMerge(preset.style, style ?? {});
}

function references(value: unknown): readonly NormalizedArtDirectionReference[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 32) fail("ART_DIRECTION_REQUEST_INVALID", "style.references must contain no more than 32 entries.");
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const item = record(entry, `style.references[${index}]`);
    const referenceId = id(item.id, `style.references[${index}].id`);
    if (seen.has(referenceId)) fail("ART_DIRECTION_REQUEST_INVALID", `Duplicate reference id ${referenceId}.`);
    seen.add(referenceId);
    if (typeof item.role !== "string" || !REFERENCE_ROLES.has(item.role)) fail("ART_DIRECTION_REQUEST_INVALID", `style.references[${index}].role is unsupported.`);
    const uri = text(item.uri, `style.references[${index}].uri`, undefined, 2048);
    return {
      id: referenceId,
      role: item.role as ArtDirectionReferenceInput["role"],
      uri,
      weight: finite(item.weight, `style.references[${index}].weight`, 1, 0, 1),
      ...(item.note === undefined ? {} : { note: text(item.note, `style.references[${index}].note`, undefined, 1024) }),
      ...(item.rights === undefined ? {} : { rights: text(item.rights, `style.references[${index}].rights`, undefined, 1024) }),
    };
  });
}

function style(input: ArtDirectionStyleInput): NormalizedArtDirectionStyle {
  const palette = input.palette ?? {};
  const pixel = input.pixelGrid ?? {};
  const camera = input.camera ?? {};
  const lighting = input.lighting ?? {};
  const motion = input.motion ?? {};
  const anti = input.antiGeneric ?? {};
  const renderingMode = input.renderingMode ?? "pixel-art";
  const projection = input.projection ?? camera.projection ?? "side";
  if (!RENDERING.has(renderingMode)) fail("ART_DIRECTION_REQUEST_INVALID", "style.renderingMode is unsupported.");
  if (!PROJECTIONS.has(projection)) fail("ART_DIRECTION_REQUEST_INVALID", "style.projection is unsupported.");
  const colours = strings(palette.colours, "style.palette.colours", []);
  for (const colour of colours) if (!HEX.test(colour)) fail("ART_DIRECTION_REQUEST_INVALID", `Invalid palette colour ${colour}.`);
  const maxColours = integer(palette.maxColours, "style.palette.maxColours", palette.mode === "monochrome" ? 2 : 256, 1, 4096);
  const transparentIndex = palette.transparentIndex === undefined ? undefined : integer(palette.transparentIndex, "style.palette.transparentIndex", 0, 0, maxColours - 1);
  return {
    title: text(input.title, "style.title", "Project-specific governed art direction", 512),
    intent: text(input.intent, "style.intent", "Create distinctive, coherent production art that follows the approved project language rather than generic model defaults."),
    renderingMode,
    projection,
    era: text(input.era, "style.era", "project-defined"),
    mustHave: strings(input.mustHave, "style.mustHave"),
    mustAvoid: strings(input.mustAvoid, "style.mustAvoid"),
    palette: {
      mode: palette.mode ?? (renderingMode === "engraved-monochrome" ? "monochrome" : renderingMode.includes("pixel") ? "indexed" : "rgb"),
      colours,
      maxColours,
      ...(transparentIndex === undefined ? {} : { transparentIndex }),
      preserveIndices: bool(palette.preserveIndices, renderingMode.includes("pixel") || renderingMode === "indexed-raster" || renderingMode === "engraved-monochrome"),
      rampCount: integer(palette.rampCount, "style.palette.rampCount", Math.min(8, maxColours), 1, 128),
      hueShift: palette.hueShift ?? "subtle",
    },
    pixelGrid: {
      enabled: bool(pixel.enabled, renderingMode.includes("pixel") || renderingMode === "indexed-raster" || renderingMode === "engraved-monochrome"),
      nativePixelScale: integer(pixel.nativePixelScale, "style.pixelGrid.nativePixelScale", 1, 1, 64),
      integerUpscaleOnly: bool(pixel.integerUpscaleOnly, true),
      antialias: pixel.antialias ?? "none",
      subpixelMotion: pixel.subpixelMotion ?? "forbidden",
      clusterPolicy: pixel.clusterPolicy ?? (renderingMode === "painted-raster" ? "painted-edge" : "deliberate-clusters"),
      dithering: pixel.dithering ?? "manual",
      outline: pixel.outline ?? "selective",
    },
    camera: {
      projection,
      fixed: bool(camera.fixed, true),
      yawDegrees: finite(camera.yawDegrees, "style.camera.yawDegrees", projection === "isometric-2:1" ? 45 : 0, -360, 360),
      pitchDegrees: finite(camera.pitchDegrees, "style.camera.pitchDegrees", projection === "isometric-2:1" ? 35.264 : 0, -90, 90),
      rollDegrees: finite(camera.rollDegrees, "style.camera.rollDegrees", 0, -360, 360),
      orthographicScale: finite(camera.orthographicScale, "style.camera.orthographicScale", 1, 0.001, 100000),
      horizon: camera.horizon ?? "none",
      mirroring: camera.mirroring ?? "symmetric-only",
    },
    lighting: {
      fixed: bool(lighting.fixed, true),
      keyDirectionDegrees: finite(lighting.keyDirectionDegrees, "style.lighting.keyDirectionDegrees", 315, -360, 360),
      keyElevationDegrees: finite(lighting.keyElevationDegrees, "style.lighting.keyElevationDegrees", 45, -90, 90),
      ambientLevel: finite(lighting.ambientLevel, "style.lighting.ambientLevel", 0.25, 0, 1),
      shadowDirectionDegrees: finite(lighting.shadowDirectionDegrees, "style.lighting.shadowDirectionDegrees", 135, -360, 360),
      shadowTreatment: lighting.shadowTreatment ?? "separate",
      frameVariation: lighting.frameVariation ?? "forbidden",
      notes: strings(lighting.notes, "style.lighting.notes"),
    },
    motion: {
      timingFeel: motion.timingFeel ?? "snappy",
      keyPoseFirst: bool(motion.keyPoseFirst, true),
      exactFrameDurations: bool(motion.exactFrameDurations, true),
      maximumAnchorDriftPixels: finite(motion.maximumAnchorDriftPixels, "style.motion.maximumAnchorDriftPixels", 0, 0, 1024),
      smearFrames: motion.smearFrames ?? "limited",
      squashAndStretch: motion.squashAndStretch ?? "limited",
      loopClosureRequired: bool(motion.loopClosureRequired, true),
    },
    materialLanguage: strings(input.materialLanguage, "style.materialLanguage"),
    lineTreatment: strings(input.lineTreatment, "style.lineTreatment"),
    compositionRules: strings(input.compositionRules, "style.compositionRules"),
    antiGeneric: {
      requiredDistinctiveMotifs: strings(anti.requiredDistinctiveMotifs, "style.antiGeneric.requiredDistinctiveMotifs"),
      prohibitedGenericMotifs: strings(anti.prohibitedGenericMotifs, "style.antiGeneric.prohibitedGenericMotifs"),
      prohibitUnrequestedProps: bool(anti.prohibitUnrequestedProps, true),
      prohibitReadableText: bool(anti.prohibitReadableText, true),
      prohibitWatermarks: bool(anti.prohibitWatermarks, true),
      prohibitModernGloss: bool(anti.prohibitModernGloss, true),
      prohibitRandomMicrodetail: bool(anti.prohibitRandomMicrodetail, true),
      prohibitStyleDrift: bool(anti.prohibitStyleDrift, true),
      requireHistoricalPlausibility: bool(anti.requireHistoricalPlausibility, false),
    },
    references: references(input.references),
  };
}

function layerOverrides(value: unknown): readonly ArtDirectionLayerOverrideInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 32) fail("ART_DIRECTION_REQUEST_INVALID", "layerOverrides must contain no more than 32 entries.");
  const roles = new Set<string>();
  return value.map((entry, index) => {
    const item = record(entry, `layerOverrides[${index}]`);
    if (typeof item.role !== "string" || !LAYER_ROLES.has(item.role)) fail("ART_DIRECTION_REQUEST_INVALID", `layerOverrides[${index}].role is unsupported.`);
    if (roles.has(item.role)) fail("ART_DIRECTION_REQUEST_INVALID", `Duplicate layer override ${item.role}.`);
    roles.add(item.role);
    if (typeof item.treatment !== "string" || !LAYER_TREATMENTS.has(item.treatment)) fail("ART_DIRECTION_REQUEST_INVALID", `layerOverrides[${index}].treatment is unsupported.`);
    return { role: item.role as ArtDirectionLayerOverrideInput["role"], treatment: item.treatment as ArtDirectionLayerOverrideInput["treatment"], reason: text(item.reason, `layerOverrides[${index}].reason`) };
  });
}

export function validateArtDirectionCompileRequest(input: ArtDirectionCompileRequestInput | unknown): NormalizedArtDirectionCompileRequest {
  const root = record(input, "request");
  if (root.schemaVersion !== "1.0") fail("ART_DIRECTION_REQUEST_INVALID", 'schemaVersion must be "1.0".');
  const project = record(root.project, "project");
  const asset = record(root.asset, "asset");
  const presetId = root.presetId === undefined ? undefined : root.presetId;
  if (presetId !== undefined && (typeof presetId !== "string" || !PRESET.has(presetId))) fail("ART_DIRECTION_REQUEST_INVALID", "presetId is unsupported.");
  if (typeof asset.family !== "string" || !FAMILY.has(asset.family as ArtAssetFamily)) fail("ART_DIRECTION_REQUEST_INVALID", "asset.family is unsupported.");
  const family = asset.family as ArtAssetFamily;
  const dimensions = record(asset.dimensions, "asset.dimensions");
  const width = integer(dimensions.width, "asset.dimensions.width", 0, 1, 32768);
  const height = integer(dimensions.height, "asset.dimensions.height", 0, 1, 32768);
  if (width * height > 268_435_456) fail("ART_DIRECTION_REQUEST_INVALID", "asset dimensions exceed the pixel ceiling.");
  const mergedStyle = style(lockPreset(root.style as ArtDirectionStyleInput | undefined, presetId as ArtDirectionPresetId | undefined));
  const preset = presetId ? resolveArtDirectionPreset(presetId as ArtDirectionPresetId) : undefined;
  if (preset && !preset.compatibleFamilies.includes(family)) fail("ART_DIRECTION_PRESET_INCOMPATIBLE", `${presetId} does not support ${family}.`);

  if (!Array.isArray(root.outputProfileIds) || root.outputProfileIds.length < 1 || root.outputProfileIds.length > 16) fail("ART_DIRECTION_REQUEST_INVALID", "outputProfileIds must contain 1 to 16 entries.");
  const outputProfileIds = root.outputProfileIds.map((value, index) => {
    if (typeof value !== "string" || !OUTPUT.has(value)) fail("ART_DIRECTION_REQUEST_INVALID", `outputProfileIds[${index}] is unsupported.`);
    const profile = resolveArtDirectionOutputProfile(value as ArtDirectionOutputProfileId);
    if (!profile.compatibleFamilies.includes(family)) fail("ART_DIRECTION_OUTPUT_INCOMPATIBLE", `${value} does not support ${family}.`);
    if (profile.requiresTransparency && asset.transparency === "opaque") fail("ART_DIRECTION_OUTPUT_INCOMPATIBLE", `${value} requires transparency.`);
    return value as ArtDirectionOutputProfileId;
  });
  if (new Set(outputProfileIds).size !== outputProfileIds.length) fail("ART_DIRECTION_REQUEST_INVALID", "outputProfileIds contains duplicates.");

  const worldScaleInput = project.worldScale === undefined ? undefined : record(project.worldScale, "project.worldScale");
  const worldScale = worldScaleInput ? {
    ...(worldScaleInput.pixelsPerTile === undefined ? {} : { pixelsPerTile: integer(worldScaleInput.pixelsPerTile, "project.worldScale.pixelsPerTile", 0, 1, 8192) }),
    ...(worldScaleInput.characterHeightPixels === undefined ? {} : { characterHeightPixels: integer(worldScaleInput.characterHeightPixels, "project.worldScale.characterHeightPixels", 0, 1, 32768) }),
    ...(worldScaleInput.tileWidthPixels === undefined ? {} : { tileWidthPixels: integer(worldScaleInput.tileWidthPixels, "project.worldScale.tileWidthPixels", 0, 1, 8192) }),
    ...(worldScaleInput.tileHeightPixels === undefined ? {} : { tileHeightPixels: integer(worldScaleInput.tileHeightPixels, "project.worldScale.tileHeightPixels", 0, 1, 8192) }),
  } : undefined;
  if (mergedStyle.projection === "isometric-2:1") {
    const tw = worldScale?.tileWidthPixels;
    const th = worldScale?.tileHeightPixels;
    if (!tw || !th || Math.abs(tw / th - 2) > 0.000001) fail("ART_DIRECTION_ISOMETRIC_RATIO_INVALID", "Isometric 2:1 production requires tileWidthPixels exactly twice tileHeightPixels.", { tileWidthPixels: tw ?? null, tileHeightPixels: th ?? null });
  }

  const animated = bool(asset.animated, false);
  const frameCount = integer(asset.frameCount, "asset.frameCount", animated ? 1 : 1, 1, 4096);
  const directionCount = integer(asset.directionCount, "asset.directionCount", animated && preset ? preset.defaultDirections.length : 1, 1, 32);
  const suppliedDirections = strings(asset.directionNames, "asset.directionNames");
  const defaultDirections = preset?.defaultDirections ?? ["default"];
  const directionNames = suppliedDirections.length ? suppliedDirections : directionCount === defaultDirections.length ? defaultDirections : Array.from({ length: directionCount }, (_, index) => `direction-${index + 1}`);
  if (directionNames.length !== directionCount) fail("ART_DIRECTION_REQUEST_INVALID", "asset.directionNames length must equal asset.directionCount.");
  if (new Set(directionNames).size !== directionNames.length) fail("ART_DIRECTION_REQUEST_INVALID", "asset.directionNames must be unique.");
  const asymmetric = bool(asset.asymmetric, false);
  const hasHeldItems = bool(asset.hasHeldItems, false);
  if ((asymmetric || hasHeldItems) && mergedStyle.camera.mirroring === "allowed") fail("ART_DIRECTION_MIRRORING_UNSAFE", "Asymmetric or held-item sprites may not use unrestricted mirroring.");

  const tileFootprintInput = asset.tileFootprint === undefined ? undefined : record(asset.tileFootprint, "asset.tileFootprint");
  const tileFootprint = tileFootprintInput ? { width: integer(tileFootprintInput.width, "asset.tileFootprint.width", 1, 1, 64), height: integer(tileFootprintInput.height, "asset.tileFootprint.height", 1, 1, 64) } : undefined;
  const secondaryMotion = strings(asset.secondaryMotion, "asset.secondaryMotion") as readonly ("hair" | "cloak" | "tail" | "equipment")[];
  for (const value of secondaryMotion) if (!new Set(["hair", "cloak", "tail", "equipment"]).has(value)) fail("ART_DIRECTION_REQUEST_INVALID", `Unsupported secondary motion ${value}.`);

  const normalized: NormalizedArtDirectionCompileRequest = {
    schemaVersion: "1.0",
    protocolVersion: ART_DIRECTION_PROTOCOL_VERSION,
    contractId: id(root.contractId, "contractId"),
    ...(presetId === undefined ? {} : { presetId: presetId as ArtDirectionPresetId }),
    project: {
      projectId: id(project.projectId, "project.projectId"),
      title: text(project.title, "project.title", undefined, 512),
      engine: text(project.engine, "project.engine", "unspecified", 128),
      engineVersion: text(project.engineVersion, "project.engineVersion", "unspecified", 128),
      gameGenre: text(project.gameGenre, "project.gameGenre", "unspecified", 512),
      targetPlatform: text(project.targetPlatform, "project.targetPlatform", "unspecified", 128),
      ...(project.viewport === undefined ? {} : (() => { const v = record(project.viewport, "project.viewport"); return { viewport: { width: integer(v.width, "project.viewport.width", 0, 1, 32768), height: integer(v.height, "project.viewport.height", 0, 1, 32768) } }; })()),
      ...(worldScale === undefined ? {} : { worldScale }),
    },
    style: mergedStyle,
    asset: {
      assetId: id(asset.assetId, "asset.assetId"),
      family,
      purpose: text(asset.purpose, "asset.purpose"),
      dimensions: { width, height },
      transparency: asset.transparency === "opaque" || asset.transparency === "preferred" ? asset.transparency : "required",
      animated,
      frameCount,
      framesPerSecond: finite(asset.framesPerSecond, "asset.framesPerSecond", animated ? 8 : 1, 0.01, 240),
      loop: bool(asset.loop, animated),
      directionCount,
      directionNames,
      asymmetric,
      hasHeldItems,
      runtimeEquipmentSwaps: bool(asset.runtimeEquipmentSwaps, false),
      runtimeCostumeVariants: bool(asset.runtimeCostumeVariants, false),
      independentEffects: bool(asset.independentEffects, false),
      independentShadow: bool(asset.independentShadow, mergedStyle.lighting.shadowTreatment === "separate"),
      needsCollision: bool(asset.needsCollision, false),
      needsNormalMap: bool(asset.needsNormalMap, false),
      needsEmissionMap: bool(asset.needsEmissionMap, false),
      largeDeformations: bool(asset.largeDeformations, false),
      secondaryMotion,
      ...(tileFootprint === undefined ? {} : { tileFootprint }),
      notes: strings(asset.notes, "asset.notes"),
    },
    outputProfileIds,
    layerOverrides: layerOverrides(root.layerOverrides),
    ...(root.metadata === undefined ? {} : { metadata: root.metadata }),
  };
  return normalized;
}
