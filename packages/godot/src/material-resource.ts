import type { GodotMaterialBinding, GodotMaterialDeliveryPlan } from "./material-delivery.js";

export const GODOT_MATERIAL_RESOURCE_CONTRACT = "evavo.godot-material-resource.v1" as const;

export interface GodotMaterialResourceRenderResult {
  readonly text: string;
  readonly evidence: Readonly<{
    contract: typeof GODOT_MATERIAL_RESOURCE_CONTRACT;
    materialId: string;
    materialClass: GodotMaterialDeliveryPlan["materialClass"];
    externalResourceCount: number;
    propertyCount: number;
    format: 3;
    sourceMutationAllowed: false;
  }>;
}

const TEXTURE_PROPERTIES = new Set([
  "albedo_texture",
  "normal_texture",
  "roughness_texture",
  "metallic_texture",
  "ao_texture",
  "heightmap_texture",
  "emission_texture",
  "orm_texture",
]);

const ENUM_VALUES: Readonly<Record<string, number>> = Object.freeze({
  TEXTURE_CHANNEL_RED: 0,
  TEXTURE_CHANNEL_GREEN: 1,
  TEXTURE_CHANNEL_BLUE: 2,
  TEXTURE_CHANNEL_ALPHA: 3,
  TEXTURE_CHANNEL_GRAYSCALE: 4,
  TRANSPARENCY_DISABLED: 0,
  TRANSPARENCY_ALPHA: 1,
  TRANSPARENCY_ALPHA_SCISSOR: 2,
  TRANSPARENCY_ALPHA_HASH: 3,
  TRANSPARENCY_ALPHA_DEPTH_PRE_PASS: 4,
});

function quote(value: string): string {
  return JSON.stringify(value);
}

function safeId(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_]+/gu, "_").replace(/^_+|_+$/gu, "");
  return normalized || "texture";
}

function serializedNonTextureValue(binding: GodotMaterialBinding): string {
  if (typeof binding.value === "boolean") return binding.value ? "true" : "false";
  if (typeof binding.value === "number") {
    if (!Number.isFinite(binding.value)) throw new Error(`Binding ${binding.property} has a non-finite numeric value.`);
    return String(binding.value);
  }
  const enumValue = ENUM_VALUES[binding.value];
  if (enumValue !== undefined) return String(enumValue);
  throw new Error(`Binding ${binding.property} has unsupported string value ${JSON.stringify(binding.value)}.`);
}

/** Render a deterministic Godot 4.6 text material resource from a ready delivery plan. */
export function renderGodotMaterialTres(plan: GodotMaterialDeliveryPlan): GodotMaterialResourceRenderResult {
  if (!plan || plan.contract !== "evavo.godot-material-delivery.v1") throw new Error("A current Godot material delivery plan is required.");
  if (plan.decision !== "ready") throw new Error(`Material plan must be ready before resource rendering; received ${plan.decision}.`);
  if (plan.blockers.length || plan.preprocessing.length || plan.unboundMaps.length) {
    throw new Error("Material plan still contains blockers, preprocessing or unbound maps.");
  }

  const externalByPath = new Map<string, { id: string; path: string }>();
  const propertyLines: string[] = [];
  let resourceOrdinal = 0;

  for (const binding of plan.bindings) {
    if (!binding || typeof binding.property !== "string" || !binding.property.trim()) {
      throw new Error("Material binding property must be a non-empty string.");
    }
    if (TEXTURE_PROPERTIES.has(binding.property)) {
      if (typeof binding.value !== "string" || !binding.value.startsWith("res://")) {
        throw new Error(`${binding.property} requires a res:// Texture2D path for deterministic TRES rendering.`);
      }
      let resource = externalByPath.get(binding.value);
      if (!resource) {
        resourceOrdinal += 1;
        resource = {
          id: `${resourceOrdinal}_${safeId(binding.sourceId ?? binding.property)}`,
          path: binding.value,
        };
        externalByPath.set(binding.value, resource);
      }
      propertyLines.push(`${binding.property} = ExtResource(${quote(resource.id)})`);
    } else {
      propertyLines.push(`${binding.property} = ${serializedNonTextureValue(binding)}`);
    }
  }

  const externalResources = [...externalByPath.values()];
  const lines: string[] = [`[gd_resource type=${quote(plan.materialClass)} format=3]`, ""];
  for (const resource of externalResources) {
    lines.push(`[ext_resource type="Texture2D" path=${quote(resource.path)} id=${quote(resource.id)}]`);
  }
  if (externalResources.length) lines.push("");
  lines.push("[resource]");
  lines.push(`resource_name = ${quote(plan.materialId)}`);
  lines.push(...propertyLines);
  lines.push("");

  return Object.freeze({
    text: lines.join("\n"),
    evidence: Object.freeze({
      contract: GODOT_MATERIAL_RESOURCE_CONTRACT,
      materialId: plan.materialId,
      materialClass: plan.materialClass,
      externalResourceCount: externalResources.length,
      propertyCount: propertyLines.length + 1,
      format: 3 as const,
      sourceMutationAllowed: false as const,
    }),
  });
}
