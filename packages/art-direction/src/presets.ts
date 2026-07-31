import type {
  ArtDirectionPresetDefinition,
  ArtDirectionPresetId,
  ArtDirectionStyleInput,
} from "./types.js";

const ALL_GAME = [
  "character", "creature", "prop", "tile", "terrain", "environment", "ui",
  "icon", "portrait", "particle", "cinematic", "background", "decal", "font",
] as const;
const SPRITE = ["character", "creature", "prop", "particle", "decal"] as const;
const WORLD = ["tile", "terrain", "environment", "background", "prop"] as const;
const DIRECTIONS_8 = ["south", "south-west", "west", "north-west", "north", "north-east", "east", "south-east"] as const;

function pixelStyle(input: Partial<ArtDirectionStyleInput> = {}): ArtDirectionStyleInput {
  return {
    title: "Governed 1990s pixel production",
    intent: "Deliberately authored period game art with stable camera, palette, clusters, silhouette and frame-to-frame identity.",
    renderingMode: "pixel-art",
    projection: "side",
    era: "1990s game production",
    mustHave: ["clear silhouette", "purposeful value grouping", "project-specific motifs"],
    mustAvoid: ["generic fantasy filler", "random texture noise", "modern glossy rendering", "independent frame redesign"],
    palette: { mode: "indexed", maxColours: 32, preserveIndices: true, rampCount: 6, hueShift: "subtle" },
    pixelGrid: {
      enabled: true, nativePixelScale: 1, integerUpscaleOnly: true, antialias: "none",
      subpixelMotion: "forbidden", clusterPolicy: "deliberate-clusters",
      dithering: "manual", outline: "selective",
    },
    camera: {
      fixed: true, yawDegrees: 0, pitchDegrees: 0, rollDegrees: 0,
      orthographicScale: 1, horizon: "none", mirroring: "symmetric-only",
    },
    lighting: {
      fixed: true, keyDirectionDegrees: 315, keyElevationDegrees: 45,
      ambientLevel: 0.25, shadowDirectionDegrees: 135,
      shadowTreatment: "separate", frameVariation: "forbidden",
    },
    motion: {
      timingFeel: "snappy", keyPoseFirst: true, exactFrameDurations: true,
      maximumAnchorDriftPixels: 0, smearFrames: "limited",
      squashAndStretch: "limited", loopClosureRequired: true,
    },
    materialLanguage: ["readable material groups", "restrained highlights", "no physically implausible gloss"],
    lineTreatment: ["deliberate pixel clusters", "clean silhouette stair-stepping", "no accidental antialias fringe"],
    compositionRules: ["one production unit per image", "retain full motion bounds", "no labels or contact-sheet layout"],
    antiGeneric: {
      requiredDistinctiveMotifs: ["project-specific silhouette and costume construction"],
      prohibitedGenericMotifs: ["AI-like ornamental clutter", "unmotivated straps and pouches", "random glowing accents"],
      prohibitUnrequestedProps: true, prohibitReadableText: true, prohibitWatermarks: true,
      prohibitModernGloss: true, prohibitRandomMicrodetail: true,
      prohibitStyleDrift: true, requireHistoricalPlausibility: false,
    },
    ...input,
  };
}

function preset(
  id: ArtDirectionPresetId,
  title: string,
  description: string,
  style: ArtDirectionStyleInput,
  compatibleFamilies: readonly ArtDirectionPresetDefinition["compatibleFamilies"][number][],
  defaultDirections: readonly string[],
  defaultOutputProfileIds: ArtDirectionPresetDefinition["defaultOutputProfileIds"],
  lockedFields: readonly string[] = [
    "renderingMode", "projection", "palette.mode", "pixelGrid.enabled",
    "pixelGrid.integerUpscaleOnly", "pixelGrid.antialias", "camera.projection",
    "camera.fixed", "lighting.fixed", "lighting.frameVariation",
  ],
): ArtDirectionPresetDefinition {
  return { id, title, description, style, compatibleFamilies, defaultDirections, defaultOutputProfileIds, lockedFields };
}

const PRESETS: Readonly<Record<ArtDirectionPresetId, ArtDirectionPresetDefinition>> = Object.freeze({
  "dos-rpg-1992": preset(
    "dos-rpg-1992", "DOS RPG 1992", "Compact indexed sprites and interface art with hard value separation and restrained animation.",
    pixelStyle({
      title: "Early 1990s DOS role-playing production",
      projection: "three-quarter",
      palette: { mode: "indexed", maxColours: 16, preserveIndices: true, rampCount: 4, hueShift: "none" },
      pixelGrid: { enabled: true, nativePixelScale: 1, integerUpscaleOnly: true, antialias: "none", subpixelMotion: "forbidden", clusterPolicy: "deliberate-clusters", dithering: "patterned", outline: "single-colour" },
      motion: { timingFeel: "weighty", keyPoseFirst: true, exactFrameDurations: true, maximumAnchorDriftPixels: 0, smearFrames: "forbidden", squashAndStretch: "limited", loopClosureRequired: true },
    }), ALL_GAME, ["left", "right", "toward", "away"], ["godot-4.6.2-character-sprite"],
  ),
  "dos-strategy-1994": preset(
    "dos-strategy-1994", "DOS Strategy 1994", "Top-down indexed units, tiles and UI designed for rapid recognition at small scale.",
    pixelStyle({ title: "Mid-1990s DOS strategy production", projection: "top-down", palette: { mode: "indexed", maxColours: 32, preserveIndices: true, rampCount: 5, hueShift: "subtle" }, camera: { projection: "top-down", fixed: true, yawDegrees: 0, pitchDegrees: 90, rollDegrees: 0, orthographicScale: 1, horizon: "none", mirroring: "symmetric-only" } }),
    ALL_GAME, ["south", "west", "north", "east"], ["godot-4.6.2-tile-atlas"],
  ),
  "point-and-click-1993": preset(
    "point-and-click-1993", "Point-and-click 1993", "Painted or indexed side-stage characters and environments with controlled perspective and scene readability.",
    pixelStyle({ title: "Early-1990s point-and-click production", renderingMode: "indexed-raster", projection: "side", palette: { mode: "indexed", maxColours: 64, preserveIndices: true, rampCount: 8, hueShift: "subtle" }, pixelGrid: { enabled: true, nativePixelScale: 1, integerUpscaleOnly: true, antialias: "selective", subpixelMotion: "limited", clusterPolicy: "clean-raster", dithering: "manual", outline: "selective" }, camera: { projection: "side", fixed: true, yawDegrees: 0, pitchDegrees: 0, rollDegrees: 0, orthographicScale: 1, horizon: "low", mirroring: "symmetric-only" } }),
    ALL_GAME, ["left", "right"], ["godot-4.6.2-character-sprite", "web-game-raster"],
  ),
  "console-platformer-16bit": preset(
    "console-platformer-16bit", "16-bit console platformer", "Strong silhouettes, selective outlines and economical expressive animation on an integer pixel grid.",
    pixelStyle({ title: "16-bit platform character production", projection: "side", palette: { mode: "indexed", maxColours: 32, preserveIndices: true, rampCount: 6, hueShift: "pronounced" }, motion: { timingFeel: "snappy", keyPoseFirst: true, exactFrameDurations: true, maximumAnchorDriftPixels: 0, smearFrames: "allowed", squashAndStretch: "allowed", loopClosureRequired: true } }),
    [...SPRITE, "tile", "terrain", "ui", "icon", "background"], ["left", "right"], ["godot-4.6.2-character-sprite"],
  ),
  "isometric-rpg-1997": preset(
    "isometric-rpg-1997", "Isometric RPG 1997", "Eight-direction 2:1 isometric sprites, tiles and effects with fixed projection, ground anchor and Y-sort ownership.",
    pixelStyle({
      title: "Late-1990s isometric role-playing production", renderingMode: "isometric-pixel", projection: "isometric-2:1",
      palette: { mode: "indexed", maxColours: 64, preserveIndices: true, rampCount: 8, hueShift: "subtle" },
      pixelGrid: { enabled: true, nativePixelScale: 1, integerUpscaleOnly: true, antialias: "none", subpixelMotion: "forbidden", clusterPolicy: "deliberate-clusters", dithering: "manual", outline: "selective" },
      camera: { projection: "isometric-2:1", fixed: true, yawDegrees: 45, pitchDegrees: 35.264, rollDegrees: 0, orthographicScale: 1, horizon: "none", mirroring: "symmetric-only" },
      lighting: { fixed: true, keyDirectionDegrees: 315, keyElevationDegrees: 45, ambientLevel: 0.3, shadowDirectionDegrees: 135, shadowTreatment: "separate", frameVariation: "forbidden" },
      compositionRules: ["2:1 diamond footprint", "feet remain on the declared Y-sort origin", "separate cast shadow", "eight-direction silhouettes remain individually authored when asymmetric"],
    }), [...SPRITE, ...WORLD, "ui", "icon", "portrait"], DIRECTIONS_8,
    ["godot-4.6.2-isometric-character"],
    ["renderingMode", "projection", "palette.mode", "pixelGrid.enabled", "pixelGrid.antialias", "pixelGrid.subpixelMotion", "camera.projection", "camera.fixed", "camera.yawDegrees", "camera.pitchDegrees", "lighting.fixed", "lighting.frameVariation"],
  ),
  "prerendered-2.5d-1996": preset(
    "prerendered-2.5d-1996", "Pre-rendered 2.5D 1996", "Sprites rendered from a fixed model, camera and light rig, then reduced to stable transparent frame sequences.",
    pixelStyle({
      title: "Mid-1990s pre-rendered 2.5D production", renderingMode: "pre-rendered-2.5d", projection: "orthographic-billboard",
      palette: { mode: "rgb", maxColours: 256, preserveIndices: false, rampCount: 12, hueShift: "subtle" },
      pixelGrid: { enabled: true, nativePixelScale: 1, integerUpscaleOnly: true, antialias: "selective", subpixelMotion: "forbidden", clusterPolicy: "clean-raster", dithering: "adaptive", outline: "none" },
      camera: { projection: "orthographic-billboard", fixed: true, yawDegrees: 0, pitchDegrees: 15, rollDegrees: 0, orthographicScale: 1, horizon: "none", mirroring: "forbidden" },
      lighting: { fixed: true, keyDirectionDegrees: 315, keyElevationDegrees: 50, ambientLevel: 0.25, shadowDirectionDegrees: 135, shadowTreatment: "separate", frameVariation: "forbidden" },
      motion: { timingFeel: "weighty", keyPoseFirst: true, exactFrameDurations: true, maximumAnchorDriftPixels: 0, smearFrames: "forbidden", squashAndStretch: "limited", loopClosureRequired: true },
      compositionRules: ["one immutable render rig for every frame and direction", "retain source model, rig, camera and lighting manifest", "reduce only after render-rig verification"],
    }), [...SPRITE, "cinematic"], DIRECTIONS_8, ["godot-4.6.2-2.5d-billboard"],
  ),
  "dark-fantasy-pc-1998": preset(
    "dark-fantasy-pc-1998", "Dark fantasy PC 1998", "Restrained painted-raster assets with material-specific highlights, high silhouette contrast and no generic ornamental noise.",
    pixelStyle({ title: "Late-1990s dark fantasy PC production", renderingMode: "painted-raster", projection: "three-quarter", palette: { mode: "rgb", maxColours: 256, preserveIndices: false, rampCount: 12, hueShift: "subtle" }, pixelGrid: { enabled: false, nativePixelScale: 1, integerUpscaleOnly: false, antialias: "selective", subpixelMotion: "limited", clusterPolicy: "painted-edge", dithering: "none", outline: "selective" }, antiGeneric: { requiredDistinctiveMotifs: ["project-specific faction and material language"], prohibitedGenericMotifs: ["random skull trim", "unmotivated spikes", "purple magic fog", "generic heroic pose"], prohibitUnrequestedProps: true, prohibitReadableText: true, prohibitWatermarks: true, prohibitModernGloss: true, prohibitRandomMicrodetail: true, prohibitStyleDrift: true, requireHistoricalPlausibility: false } }),
    ALL_GAME, ["left", "right", "toward", "away"], ["godot-4.6.2-character-sprite", "web-game-raster"],
  ),
  "engraved-monochrome-1871": preset(
    "engraved-monochrome-1871", "Engraved monochrome 1871", "Historically grounded black-and-white engraved art with hatching, stipple, hard silhouette and no grayscale or modern intrusion.",
    pixelStyle({
      title: "1871 monochrome engraved production", renderingMode: "engraved-monochrome", projection: "side", era: "1871",
      palette: { mode: "monochrome", colours: ["#000000", "#ffffff"], maxColours: 2, preserveIndices: true, rampCount: 2, hueShift: "none" },
      pixelGrid: { enabled: true, nativePixelScale: 1, integerUpscaleOnly: true, antialias: "none", subpixelMotion: "forbidden", clusterPolicy: "deliberate-clusters", dithering: "patterned", outline: "inked" },
      lineTreatment: ["engraved contour", "controlled hatching", "stipple and dither", "pure black and white output"],
      materialLanguage: ["period-correct timber, iron, brass, cloth and paper", "humid maritime wear", "no modern synthetic finish"],
      antiGeneric: { requiredDistinctiveMotifs: ["historically plausible 1871 construction and clothing"], prohibitedGenericMotifs: ["pirate-fantasy decoration", "tourist postcard composition", "modern industrial equipment", "grey airbrush gradients"], prohibitUnrequestedProps: true, prohibitReadableText: true, prohibitWatermarks: true, prohibitModernGloss: true, prohibitRandomMicrodetail: true, prohibitStyleDrift: true, requireHistoricalPlausibility: true },
    }), ALL_GAME, ["left", "right", "toward", "away"], ["godot-4.6.2-character-sprite", "cinematic-frame-sequence"],
    ["renderingMode", "projection", "era", "palette.mode", "palette.maxColours", "pixelGrid.enabled", "pixelGrid.antialias", "pixelGrid.outline", "camera.fixed", "lighting.fixed", "lighting.frameVariation"],
  ),
});

export function listArtDirectionPresets(): readonly ArtDirectionPresetDefinition[] {
  return Object.values(PRESETS);
}

export function resolveArtDirectionPreset(id: ArtDirectionPresetId): ArtDirectionPresetDefinition {
  return PRESETS[id];
}
