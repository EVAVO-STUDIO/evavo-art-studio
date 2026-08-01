import {
  type SpriteEffectDefinition,
  type SpriteEffectId,
  type SpriteEffectUniformDefinition,
} from "./types.js";

const uniform = (
  name: string,
  type: SpriteEffectUniformDefinition["type"],
  scope: SpriteEffectUniformDefinition["scope"],
  defaultValue: string,
  purpose: string,
): SpriteEffectUniformDefinition =>
  Object.freeze({ name, type, scope, defaultValue, purpose });

const sourceRect = uniform(
  "source_uv_rect",
  "vec4",
  "instance",
  "vec4(0.0, 0.0, 1.0, 1.0)",
  "Normalized atlas-safe source rectangle: x, y, width, height.",
);
const effectTime = uniform(
  "effect_time",
  "float",
  "instance",
  "0.0",
  "Game-owned effect clock. Never uses the global TIME built-in.",
);

const catalog: Readonly<Record<SpriteEffectId, SpriteEffectDefinition>> =
  Object.freeze({
    sprite_feedback: Object.freeze({
      id: "sprite_feedback",
      title: "Sprite feedback outline and hit flash",
      description:
        "One atlas-safe pass for selection outlines, hover emphasis, damage flash and opacity without swapping textures.",
      blendMode: "blend_mix",
      animated: false,
      usesVertexStage: false,
      usesNeighbourSampling: true,
      compatibleRoles: Object.freeze([
        "standing-character",
        "room-character",
        "dialogue-portrait",
        "ui-icon",
        "prop",
      ]),
      uniforms: Object.freeze([
        sourceRect,
        uniform("outline_amount", "float", "instance", "0.0", "Outline visibility from 0 to 1."),
        uniform("outline_width_px", "float", "instance", "1.0", "Outline radius in source texture pixels."),
        uniform("outline_color", "vec4", "instance", "vec4(1.0, 0.141, 0.306, 1.0)", "Outline colour, default EVAVO cherry red."),
        uniform("flash_amount", "float", "instance", "0.0", "Damage or interaction flash mix from 0 to 1."),
        uniform("flash_color", "vec4", "instance", "vec4(1.0, 1.0, 1.0, 1.0)", "Flash target colour."),
        uniform("opacity", "float", "instance", "1.0", "Final sprite opacity."),
      ]),
      performanceClass: "moderate",
      notes: Object.freeze([
        "Uses eight alpha-neighbour samples and clamps every sample to source_uv_rect.",
        "Prefer this combined pass over stacking separate outline and flash materials.",
      ]),
    }),
    sprite_dissolve: Object.freeze({
      id: "sprite_dissolve",
      title: "Deterministic sprite dissolve",
      description:
        "Pixel-grid dissolve with a controllable ink/red edge, driven by explicit state instead of engine-global time.",
      blendMode: "blend_mix",
      animated: true,
      usesVertexStage: false,
      usesNeighbourSampling: false,
      compatibleRoles: Object.freeze([
        "standing-character",
        "room-character",
        "prop",
        "particle",
      ]),
      uniforms: Object.freeze([
        sourceRect,
        effectTime,
        uniform("dissolve_amount", "float", "instance", "0.0", "Dissolve progress from 0 to 1."),
        uniform("edge_width", "float", "instance", "0.08", "Dissolve edge band width."),
        uniform("edge_color", "vec4", "instance", "vec4(1.0, 0.141, 0.306, 1.0)", "Dissolve edge colour."),
        uniform("dither_phase", "float", "instance", "0.0", "Whole-pixel 4x4 Bayer phase offset for stable per-instance variation."),
      ]),
      performanceClass: "cheap",
      notes: Object.freeze([
        "Uses an ordered 4x4 Bayer threshold in source pixel space with no texture dependency or screen copy.",
        "effect_time is available for a subtle edge pulse but dissolve progression remains command-owned.",
      ]),
    }),
    sprite_ghost: Object.freeze({
      id: "sprite_ghost",
      title: "Ghost and memory apparition",
      description:
        "Low-amplitude atlas-safe UV drift, desaturation and alpha modulation for memories, spirits and historical echoes.",
      blendMode: "blend_mix",
      animated: true,
      usesVertexStage: false,
      usesNeighbourSampling: true,
      compatibleRoles: Object.freeze([
        "standing-character",
        "room-character",
        "dialogue-portrait",
      ]),
      uniforms: Object.freeze([
        sourceRect,
        effectTime,
        uniform("ghost_amount", "float", "instance", "0.0", "Effect mix from normal sprite to apparition."),
        uniform("drift_px", "float", "instance", "1.0", "Horizontal sample drift in source pixels."),
        uniform("drift_speed", "float", "instance", "1.4", "Explicit effect clock multiplier."),
        uniform("ghost_tint", "vec4", "instance", "vec4(0.78, 0.84, 0.88, 1.0)", "Apparition tint."),
        uniform("ghost_opacity", "float", "instance", "0.62", "Apparition alpha multiplier."),
      ]),
      performanceClass: "moderate",
      notes: Object.freeze([
        "Samples the source twice and never samples beyond source_uv_rect.",
        "Use for restrained period atmosphere, not generic neon glow.",
      ]),
    }),
    sprite_sway: Object.freeze({
      id: "sprite_sway",
      title: "Anchored sprite sway",
      description:
        "Vertex-only movement for cloth, signs, foliage and hanging props with a fixed lower anchor.",
      blendMode: "blend_mix",
      animated: true,
      usesVertexStage: true,
      usesNeighbourSampling: false,
      compatibleRoles: Object.freeze([
        "standing-character",
        "prop",
        "foliage",
        "sign",
      ]),
      uniforms: Object.freeze([
        sourceRect,
        effectTime,
        uniform("sway_amount_px", "float", "instance", "0.0", "Maximum horizontal vertex displacement in pixels."),
        uniform("sway_speed", "float", "instance", "1.0", "Explicit effect clock multiplier."),
        uniform("sway_phase", "float", "instance", "0.0", "Stable per-instance phase offset."),
        uniform("anchor_from_bottom", "float", "instance", "0.08", "Fraction of sprite height held rigid from the bottom."),
      ]),
      performanceClass: "cheap",
      notes: Object.freeze([
        "Keeps the feet or attachment point stable and avoids per-frame sprite variants.",
        "Use small amplitudes for 1990s-style restrained motion.",
      ]),
    }),
    sprite_engraved_ink: Object.freeze({
      id: "sprite_engraved_ink",
      title: "Engraved ink treatment",
      description:
        "Bayer-dithered black/white engraving with controlled red accent retention for Brass & Brine UI and dramatic states.",
      blendMode: "blend_mix",
      animated: false,
      usesVertexStage: false,
      usesNeighbourSampling: false,
      compatibleRoles: Object.freeze([
        "dialogue-portrait",
        "standing-character",
        "ui-icon",
        "prop",
        "scene-overlay",
      ]),
      uniforms: Object.freeze([
        sourceRect,
        uniform("ink_amount", "float", "instance", "0.0", "Treatment mix from source to engraved output."),
        uniform("black_point", "float", "instance", "0.25", "Luminance mapped to solid black."),
        uniform("white_point", "float", "instance", "0.78", "Luminance mapped to solid white."),
        uniform("dither_strength", "float", "instance", "0.16", "Ordered dither contribution."),
        uniform("accent_color", "vec4", "instance", "vec4(1.0, 0.141, 0.306, 1.0)", "Project accent colour."),
        uniform("accent_tolerance", "float", "instance", "0.26", "RGB distance for preserving authored accent pixels."),
      ]),
      performanceClass: "cheap",
      notes: Object.freeze([
        "Ordered dithering is stable in texture pixel space and does not shimmer with camera movement.",
        "The treatment is optional; source delivery profiles already provide canonical grayscale storage where required.",
      ]),
    }),
    sprite_additive_pulse: Object.freeze({
      id: "sprite_additive_pulse",
      title: "Additive sprite pulse",
      description:
        "Explicit additive highlight for sparks, lamp glints, telegraph cues and compact magical or electrical effects.",
      blendMode: "blend_add",
      animated: true,
      usesVertexStage: false,
      usesNeighbourSampling: false,
      compatibleRoles: Object.freeze([
        "particle",
        "light-overlay",
        "ui-notification",
        "effect-sprite",
      ]),
      uniforms: Object.freeze([
        sourceRect,
        effectTime,
        uniform("pulse_amount", "float", "instance", "0.0", "Additive pulse intensity."),
        uniform("pulse_speed", "float", "instance", "2.0", "Explicit effect clock multiplier."),
        uniform("pulse_color", "vec4", "instance", "vec4(1.0, 0.82, 0.5, 1.0)", "Additive light colour."),
      ]),
      performanceClass: "cheap",
      notes: Object.freeze([
        "Uses blend_add deliberately and should not be assigned to ordinary opaque portraits or characters.",
        "Keep particle counts bounded and pool effect sprites in the game runtime.",
      ]),
    }),
  });

export function listSpriteEffectDefinitions(): readonly SpriteEffectDefinition[] {
  return Object.values(catalog);
}

export function resolveSpriteEffectDefinition(
  id: SpriteEffectId,
): SpriteEffectDefinition {
  return catalog[id];
}

export function isSpriteEffectId(value: string): value is SpriteEffectId {
  return Object.prototype.hasOwnProperty.call(catalog, value);
}
