
import type { ArtBrief } from "@evavo/art-contracts";

export const DEFAULT_ART_BRIEF: ArtBrief = {
  schemaVersion: "1.0",
  project: {
    projectName: "Godot 4.6.2 adventure art system",
    gameGenre: "1990s cinematic point-and-click adventure",
    engine: "Godot 4.6.2",
    audience: "PC and web players who value authentic period art direction",
    targets: [
      {
        kind: "godot-4.6.2",
        platform: "desktop and web",
        maximumTextureSize: 4096,
        powerOfTwo: "preferred",
        textureFiltering: "nearest",
        compressionPolicy: "lossless",
        notes: ["Preserve pixel edges", "Export SpriteFrames resources and atlas metadata"],
      },
      { kind: "source-master", compressionPolicy: "lossless" },
    ],
  },
  artDirection: {
    styleName: "Authored 1990s game illustration",
    intent: "Deliberate human-directed shapes, silhouettes, material decisions and animation timing rather than generic model defaults.",
    era: "1990s PC and console production discipline",
    mustHave: [
      "strong readable silhouettes",
      "consistent character proportions",
      "clean production-ready transparency",
      "cohesive environment and interface language",
    ],
    mustAvoid: [
      "generic AI composition",
      "fake checkerboard transparency",
      "edge halos",
      "uncontrolled detail noise",
      "inconsistent animation anchors",
    ],
    palette: {
      colours: ["#070707", "#f4f4f0", "#ff244e", "#7b5b3b", "#41545f"],
      maxColours: 32,
      colourSpace: "srgb",
    },
    cameraRules: ["stage scenes for gameplay readability", "keep interaction lanes clear", "avoid accidental perspective changes between related backgrounds"],
  },
  assets: [
    {
      id: "hero-idle",
      name: "Hero idle animation",
      kind: "sprite-sheet",
      purpose: "Primary controllable character idle loop",
      quantity: 1,
      dimensions: { width: 96, height: 128 },
      transparency: "alpha-required",
      animation: { name: "idle", frameCount: 8, framesPerSecond: 8, loop: true, directions: 4, pivot: { x: 48, y: 118 }, baseline: 118 },
      outputs: [
        { format: "png", purpose: "master", lossless: true, colourSpace: "srgb" },
        { format: "webp", purpose: "preview", lossless: true, colourSpace: "srgb" },
        { format: "json", purpose: "manifest", lossless: true },
      ],
      tags: ["character", "four-direction", "pixel-art"],
      namingPrefix: "hero_idle",
    },
    {
      id: "rain-particles",
      name: "Rain particle family",
      kind: "particle",
      purpose: "Layered weather particles for foreground and background rain",
      quantity: 3,
      dimensions: { width: 32, height: 64 },
      transparency: "alpha-required",
      animation: { name: "fall", frameCount: 6, framesPerSecond: 12, loop: true },
      outputs: [
        { format: "png", purpose: "runtime", lossless: true, colourSpace: "srgb" },
        { format: "json", purpose: "manifest", lossless: true },
      ],
      namingPrefix: "weather_rain",
    },
  ],
  autonomy: {
    mode: "review-gated",
    candidateCount: 6,
    maximumIterations: 4,
    autoApproveThreshold: 0.94,
    allowProviderFallback: true,
    requireEvidenceBundle: true,
  },
  outputRoot: "art-production",
};
