export const GODOT_MATERIAL_DELIVERY_CONTRACT = "evavo.godot-material-delivery.v1" as const;

export type GodotMaterialMapKind =
  | "base-color"
  | "normal-tangent"
  | "roughness"
  | "metallic"
  | "ambient-occlusion"
  | "height"
  | "specular"
  | "emissive"
  | "opacity"
  | "orm-packed";

export type GodotMaterialClass = "StandardMaterial3D" | "ORMMaterial3D";
export type GodotMaterialTarget = "auto" | "standard" | "orm";
export type GodotMaterialDeliveryDecision = "ready" | "needs-preprocess" | "reject";
export type GodotTextureScalarChannel = "red" | "green" | "blue" | "alpha";
export type GodotNormalConvention = "opengl" | "directx";
export type GodotTransparencyMode = "disabled" | "alpha" | "alpha-scissor" | "alpha-hash" | "alpha-depth-pre-pass";

export interface GodotMaterialTextureInput {
  readonly id: string;
  readonly kind: GodotMaterialMapKind;
  readonly resourcePath: string;
  readonly scalarChannel?: GodotTextureScalarChannel;
}

export interface GodotMaterialDeliverySpec {
  readonly materialId: string;
  readonly textures: readonly GodotMaterialTextureInput[];
  readonly targetMaterial?: GodotMaterialTarget;
  readonly normalConvention?: GodotNormalConvention;
  readonly transparencyMode?: GodotTransparencyMode;
  /** True only when intended opacity has already been authored into albedo alpha. */
  readonly albedoAlphaCarriesOpacity?: boolean;
  readonly normalScale?: number;
  readonly heightScale?: number;
  readonly emissionEnergyMultiplier?: number;
  readonly alphaScissorThreshold?: number;
}

export interface GodotMaterialBinding {
  readonly property: string;
  readonly value: string | number | boolean;
  readonly sourceId?: string;
  readonly sourceKind?: GodotMaterialMapKind;
  readonly reason: string;
}

export interface GodotMaterialUnboundMap {
  readonly id: string;
  readonly kind: GodotMaterialMapKind;
  readonly resourcePath: string;
  readonly reason: string;
  readonly requiredAction: string;
}

export interface GodotTextureImportIntent {
  readonly id: string;
  readonly kind: GodotMaterialMapKind;
  readonly resourcePath: string;
  readonly sampling: "srgb-colour" | "linear-data" | "normal-map";
  readonly notes: readonly string[];
}

export interface GodotMaterialDeliveryPlan {
  readonly contract: typeof GODOT_MATERIAL_DELIVERY_CONTRACT;
  readonly materialId: string;
  readonly decision: GodotMaterialDeliveryDecision;
  readonly materialClass: GodotMaterialClass;
  readonly bindings: readonly GodotMaterialBinding[];
  readonly unboundMaps: readonly GodotMaterialUnboundMap[];
  readonly importIntent: readonly GodotTextureImportIntent[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly preprocessing: readonly string[];
  readonly runtimeChecks: readonly string[];
}

const MAP_KINDS = new Set<GodotMaterialMapKind>([
  "base-color",
  "normal-tangent",
  "roughness",
  "metallic",
  "ambient-occlusion",
  "height",
  "specular",
  "emissive",
  "opacity",
  "orm-packed",
]);

const CHANNEL_ENUM: Readonly<Record<GodotTextureScalarChannel, string>> = Object.freeze({
  red: "TEXTURE_CHANNEL_RED",
  green: "TEXTURE_CHANNEL_GREEN",
  blue: "TEXTURE_CHANNEL_BLUE",
  alpha: "TEXTURE_CHANNEL_ALPHA",
});

const TRANSPARENCY_ENUM: Readonly<Record<GodotTransparencyMode, string>> = Object.freeze({
  disabled: "TRANSPARENCY_DISABLED",
  alpha: "TRANSPARENCY_ALPHA",
  "alpha-scissor": "TRANSPARENCY_ALPHA_SCISSOR",
  "alpha-hash": "TRANSPARENCY_ALPHA_HASH",
  "alpha-depth-pre-pass": "TRANSPARENCY_ALPHA_DEPTH_PRE_PASS",
});

function bounded(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
}

function positive(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than 0.`);
  return value;
}

function importIntent(texture: GodotMaterialTextureInput): GodotTextureImportIntent {
  if (texture.kind === "base-color" || texture.kind === "emissive") {
    return Object.freeze({
      id: texture.id,
      kind: texture.kind,
      resourcePath: texture.resourcePath,
      sampling: "srgb-colour" as const,
      notes: Object.freeze(["Treat as colour data."]),
    });
  }
  if (texture.kind === "normal-tangent") {
    return Object.freeze({
      id: texture.id,
      kind: texture.kind,
      resourcePath: texture.resourcePath,
      sampling: "normal-map" as const,
      notes: Object.freeze(["Use Godot normal-map import handling.", "The runtime binding expects OpenGL-style X+, Y+, Z+ tangent normals."]),
    });
  }
  return Object.freeze({
    id: texture.id,
    kind: texture.kind,
    resourcePath: texture.resourcePath,
    sampling: "linear-data" as const,
    notes: Object.freeze(["Treat as material data, not display colour."]),
  });
}

function binding(
  property: string,
  value: string | number | boolean,
  reason: string,
  source?: GodotMaterialTextureInput,
): GodotMaterialBinding {
  return Object.freeze({
    property,
    value,
    ...(source ? { sourceId: source.id, sourceKind: source.kind } : {}),
    reason,
  });
}

function unbound(texture: GodotMaterialTextureInput, reason: string, requiredAction: string): GodotMaterialUnboundMap {
  return Object.freeze({
    id: texture.id,
    kind: texture.kind,
    resourcePath: texture.resourcePath,
    reason,
    requiredAction,
  });
}

/**
 * Plan explicit Godot 4.x BaseMaterial3D texture/property bindings without
 * silently converting unsupported texture workflows.
 */
export function planGodotMaterialDelivery(spec: GodotMaterialDeliverySpec): GodotMaterialDeliveryPlan {
  if (!spec || typeof spec.materialId !== "string" || !spec.materialId.trim()) throw new Error("materialId must be a non-empty string.");
  if (!Array.isArray(spec.textures) || spec.textures.length < 1 || spec.textures.length > 32) throw new Error("textures must contain 1 through 32 entries.");

  const byKind = new Map<GodotMaterialMapKind, GodotMaterialTextureInput>();
  const ids = new Set<string>();
  for (const [index, texture] of spec.textures.entries()) {
    if (!texture || typeof texture.id !== "string" || !texture.id.trim()) throw new Error(`textures[${index}].id must be a non-empty string.`);
    if (ids.has(texture.id)) throw new Error(`Duplicate material texture id ${JSON.stringify(texture.id)}.`);
    ids.add(texture.id);
    if (!MAP_KINDS.has(texture.kind)) throw new Error(`textures[${index}].kind is not supported.`);
    if (typeof texture.resourcePath !== "string" || !texture.resourcePath.trim()) throw new Error(`textures[${index}].resourcePath must be a non-empty string.`);
    if (byKind.has(texture.kind)) throw new Error(`Duplicate material map kind ${JSON.stringify(texture.kind)}.`);
    byKind.set(texture.kind, texture);
  }

  const target = spec.targetMaterial ?? "auto";
  if (target !== "auto" && target !== "standard" && target !== "orm") throw new Error("targetMaterial must be auto, standard or orm.");
  const normalConvention = spec.normalConvention ?? "opengl";
  if (normalConvention !== "opengl" && normalConvention !== "directx") throw new Error("normalConvention must be opengl or directx.");
  const transparencyMode = spec.transparencyMode ?? "disabled";
  if (!(transparencyMode in TRANSPARENCY_ENUM)) throw new Error("Unsupported transparencyMode.");

  const normalScale = bounded(spec.normalScale, 1, -16, 16, "normalScale");
  const heightScale = positive(spec.heightScale, 5, "heightScale");
  const emissionEnergyMultiplier = positive(spec.emissionEnergyMultiplier, 1, "emissionEnergyMultiplier");
  const alphaScissorThreshold = bounded(spec.alphaScissorThreshold, 0.5, 0, 1, "alphaScissorThreshold");

  const orm = byKind.get("orm-packed");
  const separateOrm = [byKind.get("ambient-occlusion"), byKind.get("roughness"), byKind.get("metallic")].filter(
    (value): value is GodotMaterialTextureInput => value !== undefined,
  );

  const blockers: string[] = [];
  const warnings: string[] = [];
  const preprocessing: string[] = [];
  const bindings: GodotMaterialBinding[] = [];
  const unboundMaps: GodotMaterialUnboundMap[] = [];

  if (orm && separateOrm.length) blockers.push("packed-orm-and-separate-orm-maps-are-both-authoritative");

  let materialClass: GodotMaterialClass;
  if (target === "orm") materialClass = "ORMMaterial3D";
  else if (target === "standard") materialClass = "StandardMaterial3D";
  else materialClass = orm ? "ORMMaterial3D" : "StandardMaterial3D";

  if (materialClass === "ORMMaterial3D" && !orm && separateOrm.length) {
    preprocessing.push("pack-ambient-occlusion-roughness-metallic-to-rgb-orm");
    warnings.push("orm-material-selected-without-packed-orm-texture");
  }
  if (materialClass === "ORMMaterial3D" && !orm && !separateOrm.length) warnings.push("orm-material-selected-without-any-orm-data");
  if (materialClass === "StandardMaterial3D" && orm) {
    preprocessing.push("unpack-orm-to-separate-ao-roughness-metallic-or-switch-to-ormmaterial3d");
    warnings.push("standard-material-cannot-consume-packed-orm-as-the-separate-pbr-workflow");
  }

  const albedo = byKind.get("base-color");
  if (albedo) bindings.push(binding("albedo_texture", albedo.resourcePath, "Bind base colour/albedo texture.", albedo));
  else warnings.push("no-base-color-texture");

  const normal = byKind.get("normal-tangent");
  if (normal) {
    if (normalConvention === "directx") {
      preprocessing.push("convert-normal-map-y-from-directx-to-opengl-before-binding");
      unboundMaps.push(unbound(normal, "Godot expects OpenGL-style X+, Y+, Z+ tangent normals.", "Invert the normal Y/green channel in a governed preprocessing step, then bind the converted result."));
    } else {
      bindings.push(binding("normal_enabled", true, "Enable tangent-space normal mapping."));
      bindings.push(binding("normal_texture", normal.resourcePath, "Bind admitted OpenGL-style tangent normal map.", normal));
      bindings.push(binding("normal_scale", normalScale, "Apply explicit normal strength."));
    }
  }

  if (materialClass === "ORMMaterial3D") {
    if (orm) {
      bindings.push(binding("orm_texture", orm.resourcePath, "Bind packed R=AO, G=roughness, B=metallic texture.", orm));
      bindings.push(binding("ao_enabled", true, "Enable ambient occlusion contribution from the ORM red channel."));
      bindings.push(binding("roughness", 1, "Keep roughness multiplier at 1 so the ORM green channel remains authoritative."));
      bindings.push(binding("metallic", 1, "Set metallic multiplier to 1 so the ORM blue channel remains authoritative."));
    }
  } else {
    const ao = byKind.get("ambient-occlusion");
    const roughness = byKind.get("roughness");
    const metallic = byKind.get("metallic");
    if (ao) {
      bindings.push(binding("ao_enabled", true, "Enable ambient occlusion."));
      bindings.push(binding("ao_texture", ao.resourcePath, "Bind ambient occlusion texture.", ao));
      bindings.push(binding("ao_texture_channel", CHANNEL_ENUM[ao.scalarChannel ?? "red"], "Select the authored AO scalar channel.", ao));
    }
    if (roughness) {
      bindings.push(binding("roughness_texture", roughness.resourcePath, "Bind roughness texture.", roughness));
      bindings.push(binding("roughness_texture_channel", CHANNEL_ENUM[roughness.scalarChannel ?? "red"], "Select the authored roughness scalar channel.", roughness));
      bindings.push(binding("roughness", 1, "Keep roughness multiplier at 1 so the texture remains authoritative."));
    }
    if (metallic) {
      bindings.push(binding("metallic_texture", metallic.resourcePath, "Bind metallic texture.", metallic));
      bindings.push(binding("metallic_texture_channel", CHANNEL_ENUM[metallic.scalarChannel ?? "red"], "Select the authored metallic scalar channel.", metallic));
      bindings.push(binding("metallic", 1, "Set metallic multiplier to 1 so the metallic texture is not suppressed by the default scalar."));
    }
  }

  const height = byKind.get("height");
  if (height) {
    bindings.push(binding("heightmap_enabled", true, "Enable height/parallax mapping."));
    bindings.push(binding("heightmap_texture", height.resourcePath, "Bind height data texture.", height));
    bindings.push(binding("heightmap_scale", heightScale, "Apply explicit height-map scale."));
  }

  const emissive = byKind.get("emissive");
  if (emissive) {
    bindings.push(binding("emission_enabled", true, "Enable material emission."));
    bindings.push(binding("emission_texture", emissive.resourcePath, "Bind emissive colour/intensity texture.", emissive));
    bindings.push(binding("emission_energy_multiplier", emissionEnergyMultiplier, "Apply explicit emission energy multiplier."));
  }

  const opacity = byKind.get("opacity");
  if (opacity) {
    preprocessing.push("compose-opacity-map-into-albedo-alpha-or-use-a-reviewed-custom-shader");
    unboundMaps.push(unbound(opacity, "BaseMaterial3D transparency is driven by albedo alpha; there is no standalone opacity_texture binding in this material workflow.", "Compose the opacity mask into albedo alpha, or deliberately use a custom ShaderMaterial."));
  }

  const specular = byKind.get("specular");
  if (specular) {
    preprocessing.push("re-author-specular-map-for-metallic-roughness-workflow-or-use-a-reviewed-custom-shader");
    unboundMaps.push(unbound(specular, "BaseMaterial3D exposes metallic_specular as a scalar but not a standalone per-pixel specular texture binding.", "Use a reviewed custom shader or convert/re-author the material to the supported metallic/roughness workflow."));
  }

  bindings.push(binding("transparency", TRANSPARENCY_ENUM[transparencyMode], "Set explicit BaseMaterial3D transparency mode."));
  if (transparencyMode === "alpha-scissor") {
    bindings.push(binding("alpha_scissor_threshold", alphaScissorThreshold, "Set explicit alpha-scissor threshold."));
  }
  if (transparencyMode !== "disabled") {
    if (spec.albedoAlphaCarriesOpacity !== true) warnings.push("transparency-enabled-without-confirmed-albedo-alpha-opacity");
    if (!albedo) blockers.push("transparency-requires-albedo-alpha-or-an-explicit-custom-material-path");
  } else if (spec.albedoAlphaCarriesOpacity === true) {
    warnings.push("albedo-alpha-declared-but-transparency-is-disabled");
  }

  for (const texture of spec.textures) {
    if (!texture.resourcePath.startsWith("res://") && !texture.resourcePath.startsWith("uid://")) {
      warnings.push(`non-godot-resource-path:${texture.id}`);
    }
  }

  let decision: GodotMaterialDeliveryDecision = "ready";
  if (blockers.length) decision = "reject";
  else if (preprocessing.length || unboundMaps.length) decision = "needs-preprocess";

  return Object.freeze({
    contract: GODOT_MATERIAL_DELIVERY_CONTRACT,
    materialId: spec.materialId,
    decision,
    materialClass,
    bindings: Object.freeze(bindings),
    unboundMaps: Object.freeze(unboundMaps),
    importIntent: Object.freeze(spec.textures.map(importIntent)),
    blockers: Object.freeze(blockers),
    warnings: Object.freeze([...new Set(warnings)]),
    preprocessing: Object.freeze([...new Set(preprocessing)]),
    runtimeChecks: Object.freeze([
      "Verify the mesh has normals and tangents before judging tangent-space normal maps.",
      "Inspect the bound material on representative geometry under representative lighting and camera distances.",
      "For UV atlases, verify lower-mip bleed and island padding in-engine, not only at source resolution.",
      "For transparent materials, verify the selected transparency mode's shadowing, sorting and performance tradeoffs.",
      "Do not promote the material solely because bindings are syntactically valid; visual and scene-context review remains required.",
    ]),
  });
}
