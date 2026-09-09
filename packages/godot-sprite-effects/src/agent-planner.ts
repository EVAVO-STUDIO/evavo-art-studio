import {
  listSpriteEffectDefinitions,
  resolveSpriteEffectDefinition,
} from "./catalog.js";
import type { SpriteEffectDefinition, SpriteEffectId } from "./types.js";

export const SPRITE_EFFECT_AGENT_PLAN_SCHEMA =
  "evavo.art-godot-sprite-effect-agent-plan.v1" as const;

export type SpriteEffectIntent =
  | "selection-outline"
  | "hover-emphasis"
  | "damage-flash"
  | "fade-or-dissolve"
  | "memory-apparition"
  | "ambient-sway"
  | "engraved-treatment"
  | "spark-or-glint";

export type SpriteEffectStrength = "subtle" | "standard" | "strong";
export type SpriteEffectPerformanceBudget = "cheap-only" | "allow-moderate";

export interface SpriteEffectAgentPlanRequest {
  readonly intent: SpriteEffectIntent;
  readonly role: string;
  readonly strength?: SpriteEffectStrength;
  readonly performanceBudget?: SpriteEffectPerformanceBudget;
}

export interface SpriteEffectAgentControl {
  readonly uniform: string;
  readonly type: "float" | "vec2" | "vec4" | "bool";
  readonly value: number | boolean | readonly number[];
  readonly purpose: string;
  readonly binderMethod: "SetFloat" | "SetVector2" | "SetVector4" | "SetColour" | "SetBoolean";
}

export interface SpriteEffectAgentPlan {
  readonly schema: typeof SPRITE_EFFECT_AGENT_PLAN_SCHEMA;
  readonly intent: SpriteEffectIntent;
  readonly role: string;
  readonly strength: SpriteEffectStrength;
  readonly effectId: SpriteEffectId | null;
  readonly title: string | null;
  readonly decision: "recommended" | "review-role-compatibility" | "unsupported";
  readonly performanceClass: SpriteEffectDefinition["performanceClass"] | null;
  readonly controls: readonly SpriteEffectAgentControl[];
  readonly setup: readonly string[];
  readonly warnings: readonly string[];
  readonly runtimeApprovalRequired: true;
}

const INTENT_EFFECT: Readonly<Record<SpriteEffectIntent, SpriteEffectId>> = Object.freeze({
  "selection-outline": "sprite_feedback",
  "hover-emphasis": "sprite_feedback",
  "damage-flash": "sprite_feedback",
  "fade-or-dissolve": "sprite_dissolve",
  "memory-apparition": "sprite_ghost",
  "ambient-sway": "sprite_sway",
  "engraved-treatment": "sprite_engraved_ink",
  "spark-or-glint": "sprite_additive_pulse",
});

const LEVEL: Readonly<Record<SpriteEffectStrength, number>> = Object.freeze({
  subtle: 0.35,
  standard: 0.65,
  strong: 1,
});

function strength(value: SpriteEffectStrength | undefined): SpriteEffectStrength {
  return value ?? "standard";
}

function finite(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function floatControl(
  uniform: string,
  value: number,
  purpose: string,
): SpriteEffectAgentControl {
  return Object.freeze({ uniform, type: "float" as const, value, purpose, binderMethod: "SetFloat" as const });
}

function colourControl(
  uniform: string,
  rgba: readonly [number, number, number, number],
  purpose: string,
): SpriteEffectAgentControl {
  return Object.freeze({ uniform, type: "vec4" as const, value: Object.freeze([...rgba]), purpose, binderMethod: "SetColour" as const });
}

function controlsFor(intent: SpriteEffectIntent, selectedStrength: SpriteEffectStrength): readonly SpriteEffectAgentControl[] {
  const amount = LEVEL[selectedStrength];
  switch (intent) {
    case "selection-outline":
      return Object.freeze([
        floatControl("outline_amount", amount, "Selection outline visibility."),
        floatControl("outline_width_px", selectedStrength === "strong" ? 2 : 1, "Outline radius in source pixels."),
        colourControl("outline_color", [1, 0.141, 0.306, 1], "EVAVO cherry-red selection colour."),
        floatControl("flash_amount", 0, "Keep hit flash disabled for selection-only use."),
        floatControl("opacity", 1, "Preserve source opacity."),
      ]);
    case "hover-emphasis":
      return Object.freeze([
        floatControl("outline_amount", finite(amount * 0.55, 0, 1), "Restrained hover outline."),
        floatControl("outline_width_px", 1, "One-source-pixel hover outline."),
        colourControl("outline_color", [1, 0.141, 0.306, 1], "EVAVO cherry-red hover colour."),
        floatControl("flash_amount", finite(amount * 0.08, 0, 0.12), "Very small luminance lift without texture swapping."),
        colourControl("flash_color", [1, 1, 1, 1], "Neutral hover flash colour."),
      ]);
    case "damage-flash":
      return Object.freeze([
        floatControl("outline_amount", 0, "Do not add an outline for damage-only feedback."),
        floatControl("flash_amount", amount, "Damage flash mix."),
        colourControl("flash_color", [1, 1, 1, 1], "Neutral damage flash target."),
        floatControl("opacity", 1, "Preserve opacity during the flash."),
      ]);
    case "fade-or-dissolve":
      return Object.freeze([
        floatControl("dissolve_amount", 0, "Drive this from 0 to 1 through game-owned state/tweening."),
        floatControl("edge_width", selectedStrength === "subtle" ? 0.045 : selectedStrength === "strong" ? 0.12 : 0.08, "Dissolve edge width."),
        colourControl("edge_color", [1, 0.141, 0.306, 1], "Controlled dissolve edge colour."),
        floatControl("dither_phase", 0, "Stable whole-pixel Bayer phase; vary per instance only when deliberate."),
      ]);
    case "memory-apparition":
      return Object.freeze([
        floatControl("ghost_amount", amount, "Apparition treatment mix."),
        floatControl("drift_px", selectedStrength === "strong" ? 2 : 1, "Horizontal drift amplitude in source pixels."),
        floatControl("drift_speed", selectedStrength === "subtle" ? 0.9 : selectedStrength === "strong" ? 2 : 1.4, "Game-owned effect clock multiplier."),
        colourControl("ghost_tint", [0.78, 0.84, 0.88, 1], "Restrained apparition tint."),
        floatControl("ghost_opacity", selectedStrength === "strong" ? 0.46 : selectedStrength === "subtle" ? 0.75 : 0.62, "Apparition alpha multiplier."),
      ]);
    case "ambient-sway":
      return Object.freeze([
        floatControl("sway_amount_px", selectedStrength === "subtle" ? 1 : selectedStrength === "strong" ? 4 : 2, "Maximum horizontal displacement in pixels."),
        floatControl("sway_speed", selectedStrength === "subtle" ? 0.55 : selectedStrength === "strong" ? 1.6 : 1, "Game-owned effect clock multiplier."),
        floatControl("sway_phase", 0, "Stable per-instance phase; randomise once, not every frame."),
        floatControl("anchor_from_bottom", 0.08, "Bottom fraction held rigid."),
      ]);
    case "engraved-treatment":
      return Object.freeze([
        floatControl("ink_amount", amount, "Mix from source artwork to engraved output."),
        floatControl("black_point", 0.25, "Luminance mapped toward black."),
        floatControl("white_point", 0.78, "Luminance mapped toward white."),
        floatControl("dither_strength", selectedStrength === "subtle" ? 0.1 : selectedStrength === "strong" ? 0.22 : 0.16, "Stable ordered-dither contribution."),
        colourControl("accent_color", [1, 0.141, 0.306, 1], "Optional retained accent colour."),
        floatControl("accent_tolerance", 0.26, "Distance threshold for authored accent retention."),
      ]);
    case "spark-or-glint":
      return Object.freeze([
        floatControl("pulse_amount", selectedStrength === "subtle" ? 0.55 : selectedStrength === "strong" ? 2.2 : 1.25, "Additive pulse intensity."),
        floatControl("pulse_speed", selectedStrength === "subtle" ? 1.4 : selectedStrength === "strong" ? 4 : 2.4, "Game-owned effect clock multiplier."),
        colourControl("pulse_color", [1, 0.82, 0.5, 1], "Warm glint/light colour."),
      ]);
  }
}

export function listSpriteEffectAgentIntents(): readonly SpriteEffectIntent[] {
  return Object.freeze(Object.keys(INTENT_EFFECT) as SpriteEffectIntent[]);
}

export function planSpriteEffectForAgent(
  request: SpriteEffectAgentPlanRequest,
): SpriteEffectAgentPlan {
  if (!request || typeof request.intent !== "string" || typeof request.role !== "string" || !request.role.trim()) {
    throw new Error("Sprite effect agent planning requires intent and a non-empty role.");
  }
  if (!Object.prototype.hasOwnProperty.call(INTENT_EFFECT, request.intent)) {
    return Object.freeze({
      schema: SPRITE_EFFECT_AGENT_PLAN_SCHEMA,
      intent: request.intent,
      role: request.role,
      strength: strength(request.strength),
      effectId: null,
      title: null,
      decision: "unsupported" as const,
      performanceClass: null,
      controls: Object.freeze([]),
      setup: Object.freeze([]),
      warnings: Object.freeze(["No governed runtime sprite effect currently maps to this intent. Prefer a reviewed raster effect, authored animation, or provider edit instead of inventing a shader." ]),
      runtimeApprovalRequired: true as const,
    });
  }

  const effectId = INTENT_EFFECT[request.intent];
  const definition = resolveSpriteEffectDefinition(effectId);
  const selectedStrength = strength(request.strength);
  const roleCompatible = definition.compatibleRoles.includes(request.role);
  const budget = request.performanceBudget ?? "allow-moderate";
  const budgetCompatible = budget !== "cheap-only" || definition.performanceClass === "cheap";
  const warnings: string[] = [];
  if (!roleCompatible) warnings.push(`Role ${request.role} is not in the reviewed compatibility list for ${effectId}.`);
  if (!budgetCompatible) warnings.push(`${effectId} is moderate-cost but the request allows cheap effects only.`);
  if (definition.usesNeighbourSampling) warnings.push("Requires transparent atlas padding/extrusion and a correct source_uv_rect.");
  if (effectId === "sprite_additive_pulse") warnings.push("Use on a dedicated light/effect sprite or reviewed overlay; do not replace an ordinary character material with additive blending.");

  return Object.freeze({
    schema: SPRITE_EFFECT_AGENT_PLAN_SCHEMA,
    intent: request.intent,
    role: request.role,
    strength: selectedStrength,
    effectId,
    title: definition.title,
    decision: roleCompatible && budgetCompatible ? "recommended" as const : "review-role-compatibility" as const,
    performanceClass: definition.performanceClass,
    controls: controlsFor(request.intent, selectedStrength),
    setup: Object.freeze([
      "Bind source_uv_rect from the actual AtlasTexture region or bind the whole texture.",
      ...(definition.animated ? ["Drive effect_time from a pause-aware game-owned clock; never derive gameplay state from the visual effect."] : []),
      "Apply suggested controls through the generated per-instance binder so shared ShaderMaterial state cannot leak between sprites.",
      "Capture the target Godot 4.6.2 renderer before production approval.",
    ]),
    warnings: Object.freeze(warnings),
    runtimeApprovalRequired: true as const,
  });
}

export function describeSpriteEffectAgentCatalog(): readonly Readonly<{
  id: SpriteEffectId;
  title: string;
  description: string;
  performanceClass: SpriteEffectDefinition["performanceClass"];
  animated: boolean;
  compatibleRoles: readonly string[];
  uniforms: SpriteEffectDefinition["uniforms"];
}>[] {
  return Object.freeze(listSpriteEffectDefinitions().map((definition) => Object.freeze({
    id: definition.id,
    title: definition.title,
    description: definition.description,
    performanceClass: definition.performanceClass,
    animated: definition.animated,
    compatibleRoles: definition.compatibleRoles,
    uniforms: definition.uniforms,
  })));
}
