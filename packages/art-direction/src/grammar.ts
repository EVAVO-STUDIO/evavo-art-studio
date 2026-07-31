import {
  ArtDirectionError,
  type ArtLayerRole,
  type ArtLayerTreatment,
  type ArtProductionMethod,
  type CompiledArtLayerDecision,
  type NormalizedArtDirectionCompileRequest,
} from "./types.js";

function layer(
  role: ArtLayerRole,
  treatment: ArtLayerTreatment,
  required: boolean,
  zOrder: number,
  reason: string,
  options: Partial<Pick<CompiledArtLayerDecision, "contributesToColour" | "contributesToIdentity" | "interchangeable" | "timingIndependent" | "exportPolicy">> = {},
): CompiledArtLayerDecision {
  return {
    id: role,
    role,
    treatment,
    required,
    contributesToColour: options.contributesToColour ?? !new Set(["normal", "collision", "occlusion", "guide", "tile-mask", "depth"]).has(role),
    contributesToIdentity: options.contributesToIdentity ?? new Set(["identity-core", "costume", "hair", "face", "equipment", "weapon"]).has(role),
    interchangeable: options.interchangeable ?? false,
    timingIndependent: options.timingIndependent ?? false,
    zOrder,
    reason,
    exportPolicy: options.exportPolicy ?? (treatment === "guide-only" ? "guide-only" : treatment === "engine-sidecar" ? "runtime-only" : "source-and-runtime"),
  };
}

function methodFor(request: NormalizedArtDirectionCompileRequest): { method: ArtProductionMethod; reasons: readonly string[] } {
  const { asset, style } = request;
  if (asset.family === "tile" || asset.family === "terrain") return { method: "tile-set", reasons: ["The asset is authored and delivered as exact untrimmed tile cells."] };
  if (asset.family === "particle") return { method: "particle-flipbook", reasons: ["The effect needs fixed-canvas authored frames and independent blend/timing metadata."] };
  if (asset.family === "cinematic") return { method: "cinematic-sequence", reasons: ["The asset is a shot-based lossless frame sequence rather than a sprite sheet authority."] };
  if (!asset.animated) return { method: "single-static", reasons: ["The asset has no animation family and retains one editable static master."] };
  if (style.renderingMode === "pre-rendered-2.5d") return { method: "authored-cel", reasons: ["Every frame is a render from one immutable model, camera, light and material rig.", "The reduced frame sequence remains authoritative for runtime delivery."] };
  if (asset.runtimeEquipmentSwaps || asset.runtimeCostumeVariants || asset.independentEffects || asset.independentShadow) {
    return { method: "hybrid", reasons: ["Identity deformation remains authored per frame.", "Reusable equipment, costume, shadow or effect content remains independently controlled."] };
  }
  if (asset.largeDeformations || asset.secondaryMotion.length) return { method: "authored-cel", reasons: ["Large anatomy or cloth deformation would expose mechanical seams in a cutout rig."] };
  return { method: "authored-cel", reasons: ["Authored cels preserve deliberate silhouette, pixel clusters and anatomy across motion."] };
}

function baseLayers(request: NormalizedArtDirectionCompileRequest, method: ArtProductionMethod): CompiledArtLayerDecision[] {
  const { asset, style } = request;
  const animatedTreatment: ArtLayerTreatment = asset.animated ? "separate-per-frame" : "static-family";
  const layers: CompiledArtLayerDecision[] = [];
  if (!new Set(["tile", "terrain", "background", "ui", "icon", "font", "particle", "cinematic"]).has(asset.family)) {
    layers.push(layer("identity-core", animatedTreatment, true, 0,
      "The complete approved anatomy and silhouette remain one authored identity surface; it is not fragmented into mechanical limbs."));
  }
  if (asset.runtimeCostumeVariants) layers.push(layer("costume", "linked-cel", true, 10, "Costume variants are reused and repaired independently without changing canonical anatomy.", { interchangeable: true }));
  if (asset.secondaryMotion.some((entry) => entry === "hair" || entry === "cloak" || entry === "tail")) {
    layers.push(layer("hair", asset.dimensions.height >= 96 ? "separate-per-frame" : "baked", false, 20,
      asset.dimensions.height >= 96 ? "Secondary silhouette motion is large enough to register cleanly as a retained layer." : "At this resolution, separation would create seams and unstable pixel clusters."));
  }
  if (asset.hasHeldItems || asset.runtimeEquipmentSwaps) layers.push(layer("weapon", asset.runtimeEquipmentSwaps ? "linked-cel" : animatedTreatment, true, 30, "Held items require explicit handedness, scale, occlusion and independent repair evidence.", { interchangeable: asset.runtimeEquipmentSwaps }));
  if (asset.runtimeEquipmentSwaps || asset.secondaryMotion.includes("equipment")) layers.push(layer("equipment", "linked-cel", true, 25, "Equipment is reused or exchanged independently and keeps an explicit attachment contract.", { interchangeable: true }));
  if (asset.independentShadow || style.projection === "isometric-2:1" || style.lighting.shadowTreatment === "separate") layers.push(layer("shadow", "static-family", true, -20, "The cast shadow has independent world placement, lighting and occlusion ownership.", { contributesToIdentity: false, timingIndependent: true }));
  if (asset.independentEffects) layers.push(layer("effect", "separate-per-frame", false, 40, "Action effects use independent timing, blend and repair scopes.", { contributesToIdentity: false, timingIndependent: true }));
  if (asset.needsEmissionMap) layers.push(layer("emission", "engine-sidecar", true, 0, "Emission is engine material data and never baked into the colour identity master.", { contributesToColour: false, contributesToIdentity: false, exportPolicy: "runtime-only" }));
  if (asset.needsNormalMap) layers.push(layer("normal", "engine-sidecar", true, 0, "Normal data remains an engine sidecar with a separate hash and import binding.", { contributesToColour: false, contributesToIdentity: false, exportPolicy: "runtime-only" }));
  if (style.renderingMode === "pre-rendered-2.5d") layers.push(layer("depth", "engine-sidecar", false, 0, "Optional depth evidence preserves render ordering and future 2.5D integration without contaminating colour pixels.", { contributesToColour: false, contributesToIdentity: false, exportPolicy: "runtime-only" }));
  if (asset.needsCollision) layers.push(layer("collision", "engine-sidecar", true, 0, "Collision belongs to deterministic engine metadata, never visible artwork.", { contributesToColour: false, contributesToIdentity: false, exportPolicy: "runtime-only" }));
  if (asset.family === "tile" || asset.family === "terrain") {
    layers.push(layer("background", "static-family", true, 0, "The visual tile cell is retained untrimmed on the declared grid.", { contributesToIdentity: false }));
    layers.push(layer("tile-mask", "engine-sidecar", false, 0, "Terrain peering, navigation and transition masks remain engine sidecars.", { contributesToColour: false, contributesToIdentity: false, exportPolicy: "runtime-only" }));
    layers.push(layer("occlusion", "engine-sidecar", false, 0, "Tile occlusion polygons and height ownership remain engine metadata rather than visible colour pixels.", { contributesToColour: false, contributesToIdentity: false, exportPolicy: "runtime-only" }));
  }
  if (asset.family === "particle") layers.push(layer("effect", "separate-per-frame", true, 0, "Every effect frame uses the same fixed canvas and declared blend mode.", { contributesToIdentity: false }));
  if (asset.family === "cinematic") {
    layers.push(layer("background", "separate-per-frame", true, -10, "Cinematic background plate remains independently editable.", { contributesToIdentity: false }));
    layers.push(layer("foreground", "separate-per-frame", false, 10, "Foreground occluders remain independently editable and reviewable.", { contributesToIdentity: false }));
  }
  layers.push(layer("guide", "guide-only", false, 1000, "Pivots, baselines, tile diamonds, camera guides and safe bounds are retained for evidence but excluded from visible delivery.", { contributesToColour: false, contributesToIdentity: false, exportPolicy: "guide-only" }));
  return layers;
}

function applyOverrides(layers: readonly CompiledArtLayerDecision[], request: NormalizedArtDirectionCompileRequest): readonly CompiledArtLayerDecision[] {
  const result = new Map(layers.map((entry) => [entry.role, entry]));
  for (const override of request.layerOverrides) {
    const current = result.get(override.role);
    if (!current) throw new ArtDirectionError("ART_DIRECTION_LAYER_OVERRIDE_INVALID", `Layer override ${override.role} is not justified by the asset contract.`);
    if (new Set(["normal", "collision", "occlusion", "depth", "emission", "tile-mask"]).has(override.role) && override.treatment !== "engine-sidecar") {
      throw new ArtDirectionError("ART_DIRECTION_LAYER_OVERRIDE_INVALID", `${override.role} must remain an engine sidecar.`);
    }
    if (override.role === "guide" && override.treatment !== "guide-only") throw new ArtDirectionError("ART_DIRECTION_LAYER_OVERRIDE_INVALID", "Guide pixels cannot enter production artwork.");
    result.set(override.role, { ...current, treatment: override.treatment, reason: override.reason });
  }
  return [...result.values()].sort((left, right) => left.zOrder - right.zOrder || left.role.localeCompare(right.role));
}

export function compileProductionGrammar(request: NormalizedArtDirectionCompileRequest) {
  const selected = methodFor(request);
  const { asset, style } = request;
  const layers = applyOverrides(baseLayers(request, selected.method), request);
  const pivot = { x: Math.floor(asset.dimensions.width / 2), y: Math.max(0, asset.dimensions.height - (style.projection === "isometric-2:1" ? 5 : 1)) };
  const baseline = pivot.y;
  const ySortOrigin = { ...pivot };
  const include = [
    `the complete requested ${asset.family} silhouette`, asset.purpose,
    "persistent approved identity, costume and material details",
    ...(asset.hasHeldItems ? ["the declared held item with stable scale and handedness"] : []),
    ...(asset.secondaryMotion.length ? [`authored secondary motion: ${asset.secondaryMotion.join(", ")}`] : []),
  ];
  const exclude = [
    "scenery or decorative background unless the asset family explicitly owns it",
    "checkerboards, chroma mattes or any visual imitation of transparency",
    "labels, watermarks, readable text and contact-sheet layout",
    "unrequested characters, props, weapons, particles or modern details",
    ...layers.filter((entry) => !entry.contributesToColour).map((entry) => `${entry.role} ${entry.treatment} pixels`),
    ...layers.filter((entry) => entry.role !== "identity-core" && entry.treatment !== "baked" && entry.contributesToColour).map((entry) => `content owned by separate ${entry.role} layer`),
  ];
  const safePaddingPixels = style.pixelGrid.enabled ? Math.max(1, Math.ceil(Math.min(asset.dimensions.width, asset.dimensions.height) * 0.03)) : Math.max(2, Math.ceil(Math.min(asset.dimensions.width, asset.dimensions.height) * 0.02));
  return {
    method: selected.method,
    methodReasons: selected.reasons,
    directionNames: asset.directionNames,
    frameUnit: selected.method === "tile-set" ? "tile" as const : selected.method === "cinematic-sequence" ? "cinematic-frame" as const : selected.method === "single-static" ? "single-static" as const : layers.some((entry) => entry.role !== "identity-core" && entry.contributesToColour && entry.treatment !== "baked") ? "single-layer" as const : "single-frame" as const,
    pivot, baseline, ySortOrigin,
    ...(asset.tileFootprint === undefined ? {} : { tileFootprint: asset.tileFootprint }),
    layers,
    shot: {
      include, exclude,
      framing: ["one asset, frame or layer per provider result", "retain full silhouette, motion arc, shadow and effect extents", `anchor at ${pivot.x},${pivot.y}`, ...(style.projection === "isometric-2:1" ? ["respect the declared 2:1 tile diamond and Y-sort origin"] : [])],
      safePaddingPixels,
      cropPolicy: selected.method === "tile-set" ? "tile-bounds" as const : selected.method === "cinematic-sequence" ? "full-canvas" as const : "full-motion-bounds" as const,
      backgroundPolicy: asset.transparency === "opaque" ? "opaque" as const : asset.family === "cinematic" || asset.family === "background" ? "separate-background" as const : "transparent" as const,
    },
  };
}
