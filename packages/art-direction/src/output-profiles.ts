import type {
  ArtDirectionOutputProfileDefinition,
  ArtDirectionOutputProfileId,
} from "./types.js";

const CHARACTER = ["character", "creature", "prop", "decal"] as const;
const profiles: Readonly<Record<ArtDirectionOutputProfileId, ArtDirectionOutputProfileDefinition>> = Object.freeze({
  "godot-4.6.2-character-sprite": {
    id: "godot-4.6.2-character-sprite", title: "Godot 4.6.2 character SpriteFrames", target: "godot-4.6.2",
    compatibleFamilies: [...CHARACTER], requiresTransparency: true,
    masterFormats: ["PNG RGBA individual frames", "ASEPRITE or ORA editable source"],
    derivativeFormats: ["PNG atlas", "Godot SpriteFrames .tres", "AtlasTexture resources"], textureFiltering: "nearest",
    atlas: { allowed: true, rotation: "forbidden", paddingPixels: 2, extrusionPixels: 1, trim: "alpha-aware" },
    sourceRetention: ["individual lossless frames", "editable cels and layers", "exact frame durations", "pivots and baselines", "animation tags"],
    engineMetadata: ["SpriteFrames animation names", "per-frame duration multiplier", "loop mode", "AtlasTexture region and margin", "source-size and trim offset"],
    importRecommendations: ["AnimatedSprite2D for authored frame animation", "nearest filtering for pixel art", "centered=false or 2D pixel snap for pixel-perfect placement"],
  },
  "godot-4.7.1-character-sprite": {
    id: "godot-4.7.1-character-sprite", title: "Godot 4.7.1 character SpriteFrames", target: "godot-4.7.1",
    compatibleFamilies: [...CHARACTER], requiresTransparency: true,
    masterFormats: ["PNG RGBA individual frames", "ASEPRITE or ORA editable source"],
    derivativeFormats: ["PNG no-rotation atlas", "Godot 4.7.1 SpriteFrames .tres", "AtlasTexture resources"], textureFiltering: "nearest",
    atlas: { allowed: true, rotation: "forbidden", paddingPixels: 2, extrusionPixels: 1, trim: "alpha-aware" },
    sourceRetention: ["individual lossless frames", "editable cels and layers", "exact frame durations", "pivots and baselines", "independent direction and animation tags", "source-size and trim metadata"],
    engineMetadata: ["SpriteFrames animation names", "per-frame duration multiplier", "loop mode", "AtlasTexture region and margin", "source-size and trim offset", "direction ownership", "Godot 4.7.1 import identity"],
    importRecommendations: ["AnimatedSprite2D for authored frame animation", "nearest filtering and integer placement", "forbid atlas rotation", "retain independently authored directions instead of runtime mirroring", "verify pivots, baselines and trim offsets in Godot 4.7.1"],
  },
  "godot-4.6.2-isometric-character": {
    id: "godot-4.6.2-isometric-character", title: "Godot 4.6.2 isometric character family", target: "godot-4.6.2",
    compatibleFamilies: ["character", "creature", "prop"], requiresTransparency: true,
    masterFormats: ["PNG RGBA individual directional frames", "ASEPRITE or ORA layered source"],
    derivativeFormats: ["PNG no-rotation atlas", "Godot SpriteFrames .tres", "Y-sort and footprint manifest"], textureFiltering: "nearest",
    atlas: { allowed: true, rotation: "forbidden", paddingPixels: 3, extrusionPixels: 1, trim: "alpha-aware" },
    sourceRetention: ["eight-direction masters", "individual frames", "separate cast shadow", "exact pivot and Y-sort origin", "tile footprint"],
    engineMetadata: ["direction animation tags", "SpriteFrames exact durations", "Y-sort origin", "2:1 tile footprint", "collision sidecar"],
    importRecommendations: ["use sibling TileMapLayer nodes under a Y-sorted parent", "keep feet on one shared ground anchor", "do not rotate atlas regions", "use nearest filtering and integer placement"],
  },
  "godot-4.6.2-tile-atlas": {
    id: "godot-4.6.2-tile-atlas", title: "Godot 4.6.2 TileSet atlas", target: "godot-4.6.2",
    compatibleFamilies: ["tile", "terrain", "environment", "prop", "decal"], requiresTransparency: false,
    masterFormats: ["PNG tile cells", "ASEPRITE tile set source"], derivativeFormats: ["PNG tile atlas", "Godot TileSet resource", "terrain and alternative-tile metadata"], textureFiltering: "nearest",
    atlas: { allowed: true, rotation: "forbidden", paddingPixels: 0, extrusionPixels: 0, trim: "forbidden" },
    sourceRetention: ["untrimmed tile cells", "tile origin", "terrain masks", "alternative tile variants", "collision and occlusion sidecars"],
    engineMetadata: ["tile size and shape", "terrain peering bits", "physics layers", "navigation layers", "occlusion polygons", "Y-sort origin"],
    importRecommendations: ["preserve exact cell dimensions", "use isometric tile shape for 2:1 grids", "separate visual, collision and navigation data"],
  },
  "godot-4.6.2-particle-flipbook": {
    id: "godot-4.6.2-particle-flipbook", title: "Godot 4.6.2 particle flipbook", target: "godot-4.6.2",
    compatibleFamilies: ["particle", "decal"], requiresTransparency: true,
    masterFormats: ["PNG RGBA individual effect frames"], derivativeFormats: ["fixed-cell PNG flipbook", "particle timing manifest"], textureFiltering: "mixed",
    atlas: { allowed: true, rotation: "forbidden", paddingPixels: 2, extrusionPixels: 1, trim: "forbidden" },
    sourceRetention: ["individual fixed-canvas frames", "exact durations", "blend mode", "pivot", "emission and normal sidecars when required"],
    engineMetadata: ["flipbook rows and columns", "frame count", "lifetime mapping", "blend mode", "particle material recommendations"],
    importRecommendations: ["keep every frame on one fixed canvas", "do not trim individual effect extents", "use additive or alpha blend only when declared"],
  },
  "godot-4.6.2-ui-pixel": {
    id: "godot-4.6.2-ui-pixel", title: "Godot 4.6.2 pixel UI", target: "godot-4.6.2",
    compatibleFamilies: ["ui", "icon", "font", "portrait"], requiresTransparency: true,
    masterFormats: ["PNG RGBA", "ASEPRITE, SVG or editable design source"], derivativeFormats: ["PNG atlas", "StyleBoxTexture and icon manifest"], textureFiltering: "nearest",
    atlas: { allowed: true, rotation: "forbidden", paddingPixels: 2, extrusionPixels: 1, trim: "forbidden" },
    sourceRetention: ["nine-slice margins", "baseline and optical bounds", "states and variants", "source palette"],
    engineMetadata: ["Control minimum size", "nine-slice margins", "state names", "theme resource mapping"],
    importRecommendations: ["preserve nine-slice edges", "use nearest filtering", "test at every supported integer scale"],
  },
  "godot-4.6.2-2.5d-billboard": {
    id: "godot-4.6.2-2.5d-billboard", title: "Godot 4.6.2 pre-rendered 2.5D billboard", target: "godot-4.6.2",
    compatibleFamilies: ["character", "creature", "prop", "cinematic"], requiresTransparency: true,
    masterFormats: ["lossless RGBA frame sequence", "source model, rig, materials, camera and light manifest"],
    derivativeFormats: ["PNG atlas", "Godot SpriteFrames .tres", "normal, depth and emission sidecars"], textureFiltering: "mixed",
    atlas: { allowed: true, rotation: "forbidden", paddingPixels: 3, extrusionPixels: 1, trim: "alpha-aware" },
    sourceRetention: ["individual lossless frame sequence", "render scene", "rig and animation", "camera and lighting manifest", "render settings", "sidecar maps"],
    engineMetadata: ["SpriteFrames exact durations", "billboard pivot", "depth ordering", "normal and emission map bindings"],
    importRecommendations: ["lock model, camera, lighting and render settings across the family", "validate alpha and edge decontamination after reduction"],
  },
  "web-game-raster": {
    id: "web-game-raster", title: "Web game raster delivery", target: "web",
    compatibleFamilies: ["character", "creature", "prop", "tile", "terrain", "environment", "ui", "icon", "portrait", "particle", "background", "decal", "font"], requiresTransparency: false,
    masterFormats: ["PNG or lossless WebP", "editable source"], derivativeFormats: ["PNG", "WebP", "AVIF where visually appropriate", "JSON atlas"], textureFiltering: "mixed",
    atlas: { allowed: true, rotation: "forbidden", paddingPixels: 2, extrusionPixels: 1, trim: "alpha-aware" },
    sourceRetention: ["lossless master", "individual frames", "colour profile", "atlas metadata"], engineMetadata: ["CSS pixel size", "device-pixel ratio", "atlas regions"],
    importRecommendations: ["do not recompress an already compressed derivative", "retain PNG masters for alpha-critical art"],
  },
  "cinematic-frame-sequence": {
    id: "cinematic-frame-sequence", title: "Cinematic frame sequence", target: "generic",
    compatibleFamilies: ["cinematic", "background", "environment", "character", "creature", "particle"], requiresTransparency: false,
    masterFormats: ["PNG or EXR frame sequence", "layered scene source"], derivativeFormats: ["PNG sequence", "lossless mezzanine video", "review proxy"], textureFiltering: "linear",
    atlas: { allowed: false, rotation: "forbidden", paddingPixels: 0, extrusionPixels: 0, trim: "forbidden" },
    sourceRetention: ["individual lossless frames", "exact timebase", "shot list", "layers and mattes", "colour management"], engineMetadata: ["frame rate", "shot boundaries", "audio cue markers"],
    importRecommendations: ["retain source sequence before video encoding", "validate every shot boundary and frame duration"],
  },
  "print-illustration-master": {
    id: "print-illustration-master", title: "Print illustration master", target: "print",
    compatibleFamilies: ["portrait", "environment", "background", "cinematic", "ui", "icon", "font"], requiresTransparency: false,
    masterFormats: ["16-bit TIFF or PSD", "layered editable source"], derivativeFormats: ["print PDF", "CMYK TIFF", "sRGB preview"], textureFiltering: "not-applicable",
    atlas: { allowed: false, rotation: "forbidden", paddingPixels: 0, extrusionPixels: 0, trim: "forbidden" },
    sourceRetention: ["layered master", "embedded colour profile", "bleed and trim", "linked references", "font and rights manifest"], engineMetadata: ["physical dimensions", "DPI", "colour profile", "bleed", "trim box"],
    importRecommendations: ["master in a wide-gamut or print-safe workflow", "soft-proof final CMYK conversion", "retain an sRGB digital derivative"],
  },
});

export function listArtDirectionOutputProfiles(): readonly ArtDirectionOutputProfileDefinition[] {
  return Object.values(profiles);
}

export function resolveArtDirectionOutputProfile(id: ArtDirectionOutputProfileId): ArtDirectionOutputProfileDefinition {
  return profiles[id];
}
