export const ART_STUDIO_PROTOCOL_VERSION = "2026-07-29.2" as const;

export const ASSET_KINDS = [
  "character",
  "animation",
  "sprite-sheet",
  "tileset",
  "texture",
  "ui",
  "icon",
  "background",
  "cinematic",
  "particle",
  "print",
  "vector",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const TARGET_KINDS = [
  "godot-4.6.2",
  "web",
  "mobile",
  "desktop",
  "print",
  "source-master",
] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

export const TRANSPARENCY_MODES = [
  "opaque",
  "alpha-required",
  "alpha-preferred",
  "chroma-key-intermediate",
] as const;
export type TransparencyMode = (typeof TRANSPARENCY_MODES)[number];

export const AUTONOMY_MODES = [
  "manual",
  "review-gated",
  "fully-automatic",
] as const;
export type AutonomyMode = (typeof AUTONOMY_MODES)[number];

export const SPRITE_PRODUCTION_METHODS = [
  "authored-cel",
  "layered-rig",
  "hybrid",
] as const;
export type SpriteProductionMethod = (typeof SPRITE_PRODUCTION_METHODS)[number];

export const CANONICAL_INSTANCE_POLICIES = [
  "shared",
  "index-matched",
] as const;
export type CanonicalInstancePolicy = (typeof CANONICAL_INSTANCE_POLICIES)[number];

export const SPRITE_LAYER_ROLES = [
  "subject",
  "body",
  "head",
  "face",
  "hair",
  "clothing",
  "equipment",
  "held-item",
  "weapon",
  "shadow",
  "effect",
  "collision",
  "normal",
  "emission",
  "guide",
] as const;
export type SpriteLayerRole = (typeof SPRITE_LAYER_ROLES)[number];

export const SPRITE_LAYER_TREATMENTS = [
  "baked-into-cel",
  "separate-frame",
  "linked-cel",
  "rigged-part",
  "engine-sidecar",
  "guide-only",
] as const;
export type SpriteLayerTreatment = (typeof SPRITE_LAYER_TREATMENTS)[number];

export const SPRITE_LAYER_FRAME_POLICIES = [
  "every-frame",
  "keyed-only",
  "linked-until-change",
  "static",
  "derived",
] as const;
export type SpriteLayerFramePolicy = (typeof SPRITE_LAYER_FRAME_POLICIES)[number];

export const SPRITE_LAYER_EXPORT_POLICIES = [
  "composite-only",
  "layer-frames",
  "source-only",
  "engine-sidecar",
] as const;
export type SpriteLayerExportPolicy = (typeof SPRITE_LAYER_EXPORT_POLICIES)[number];

export const SPRITE_CONTINUITY_LOCKS = [
  "identity",
  "proportions",
  "silhouette-language",
  "palette",
  "line-treatment",
  "camera",
  "pivot",
  "baseline",
  "ground-contact",
  "equipment",
  "handedness",
  "materials",
  "lighting-logic",
] as const;
export type SpriteContinuityLock = (typeof SPRITE_CONTINUITY_LOCKS)[number];

export const SPRITE_FRAME_ROLES = [
  "identity-master",
  "direction-master",
  "key-pose",
  "inbetween",
] as const;
export type SpriteFrameRole = (typeof SPRITE_FRAME_ROLES)[number];

export const PIPELINE_STAGE_KINDS = [
  "analyse",
  "art-direction",
  "concept",
  "select-candidate",
  "construct",
  "motion-design",
  "identity-master",
  "direction-master",
  "key-pose",
  "inbetween-frame",
  "frame-generation",
  "frame-layout",
  "layer-registration",
  "composite-reconstruction",
  "continuity-validation",
  "source-package",
  "tile-topology",
  "shot-plan",
  "keyframes",
  "inbetweens",
  "cleanup",
  "alpha-extraction",
  "edge-decontamination",
  "consistency",
  "timing",
  "loop-validation",
  "seam-validation",
  "colour-proof",
  "bleed-safe-area",
  "master",
  "atlas-pack",
  "manifest",
  "particle-profile",
  "godot-import-profile",
  "godot-resource",
  "encode",
  "export",
  "matte-validation",
  "quality",
] as const;
export type PipelineStageKind = (typeof PIPELINE_STAGE_KINDS)[number];

export const QUALITY_GATE_IDS = [
  "dimensions",
  "file-format",
  "alpha-channel",
  "fake-transparency",
  "edge-halo",
  "transparent-pixel-colour",
  "colour-profile",
  "palette",
  "style-consistency",
  "composition",
  "artifact-scan",
  "compression-delta",
  "frame-canvas",
  "frame-anchor",
  "frame-crop",
  "frame-order",
  "frame-duration",
  "frame-duplicates",
  "identity-consistency",
  "proportion-consistency",
  "silhouette-consistency",
  "direction-consistency",
  "equipment-consistency",
  "layer-registration",
  "layer-occlusion",
  "source-composite-parity",
  "editable-source",
  "loop-closure",
  "atlas-padding",
  "atlas-bleed",
  "tile-seams",
  "print-resolution",
  "print-safe-area",
  "manifest-integrity",
  "provenance",
] as const;
export type QualityGateId = (typeof QUALITY_GATE_IDS)[number];

export const OUTPUT_FORMATS = [
  "png",
  "webp",
  "avif",
  "svg",
  "tiff",
  "gif",
  "apng",
  "json",
  "tres",
  "aseprite",
  "ora",
  "psd",
] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

export const OUTPUT_PURPOSES = [
  "source",
  "master",
  "runtime",
  "preview",
  "print",
  "manifest",
] as const;
export type OutputPurpose = (typeof OUTPUT_PURPOSES)[number];
