import type {
  ArtBrief,
  AssetRequest,
  SpriteGenerationContract,
  SpriteLayerPlan,
  SpritePackingPolicy,
  SpriteProductionMethod,
  SpriteRepairPolicy,
  SpriteShotContract,
  SpriteSourceContract,
  TargetProfile,
} from "@evavo/art-contracts";
import { defaultExportPolicy, defaultFramePolicy, defaultLayer, slug } from "./common.js";

export function normalizedLayers(asset: AssetRequest): readonly SpriteLayerPlan[] {
  const source = asset.sprite?.layers?.length ? asset.sprite.layers : [defaultLayer(asset)];
  return [...source]
    .map((layer, index): SpriteLayerPlan => {
      const plan: SpriteLayerPlan = {
        id: slug(layer.id),
        role: layer.role,
        treatment: layer.treatment,
        zIndex: layer.zIndex ?? index,
        framePolicy: layer.framePolicy ?? defaultFramePolicy(layer.treatment),
        exportPolicy: layer.exportPolicy ?? defaultExportPolicy(layer.treatment),
        required: layer.required ?? true,
        interchangeable: layer.interchangeable ?? false,
        allowEmpty: layer.allowEmpty ?? false,
        occludes: layer.occludes ? [...layer.occludes.map(slug)] : [],
        reason: layer.reason,
        notes: layer.notes ? [...layer.notes] : [],
        ...(layer.parentId ? { parentId: slug(layer.parentId) } : {}),
      };
      return plan;
    })
    .sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id));
}

export function productionMethod(asset: AssetRequest, layers: readonly SpriteLayerPlan[]): SpriteProductionMethod {
  if (asset.sprite?.productionMethod) return asset.sprite.productionMethod;

  const tags = new Set((asset.tags ?? []).map((tag) => tag.toLowerCase()));
  const hasRiggedPart = layers.some((layer) => layer.treatment === "rigged-part");
  const hasAuthoredCel = layers.some((layer) => layer.treatment === "baked-into-cel");
  const hasIndependentLayers = layers.some((layer) =>
    ["separate-frame", "linked-cel", "engine-sidecar"].includes(layer.treatment),
  );

  if (hasRiggedPart && hasAuthoredCel) return "hybrid";
  if (hasRiggedPart || tags.has("cutout") || tags.has("skeletal")) return "layered-rig";
  if (
    hasIndependentLayers ||
    tags.has("modular") ||
    tags.has("runtime-customisation") ||
    tags.has("equipment-variants")
  ) {
    return "hybrid";
  }
  return "authored-cel";
}

export function normalizedShot(asset: AssetRequest): SpriteShotContract {
  const requested = asset.sprite?.shot;
  const safePadding = requested?.safePadding ?? Math.max(
    2,
    Math.ceil(Math.min(asset.dimensions.width, asset.dimensions.height) * 0.04),
  );
  const defaultBackground =
    asset.transparency === "opaque" ? "opaque-source" : "transparent";

  return {
    include: requested?.include
      ? [...requested.include]
      : [
          "the complete declared subject or effect silhouette",
          "persistent identity, costume and material details",
          "declared equipment, held items and intentional secondary motion",
          "the complete motion arc inside the safe canvas bounds",
        ],
    exclude: requested?.exclude
      ? [...requested.exclude]
      : [
          "scenery or decorative backgrounds unless the asset explicitly declares them",
          "checkerboards, chroma mattes or any imitation of transparency",
          "labels, unrelated interface elements and readable text",
          "unrelated props, characters or ambient effects",
          "collision, normal, emission and guide data in visible colour artwork",
          "content already represented by a registered separate asset",
        ],
    safePadding,
    backgroundPolicy: requested?.backgroundPolicy ?? defaultBackground,
    allowCrop: requested?.allowCrop ?? false,
    shadowPolicy: requested?.shadowPolicy ?? "none",
  };
}

export function normalizedGeneration(asset: AssetRequest): SpriteGenerationContract {
  const requested = asset.sprite?.generation;
  return {
    identityReferenceWeight: requested?.identityReferenceWeight ?? 0.9,
    structureReferenceWeight: requested?.structureReferenceWeight ?? 0.85,
    previousFrameWeight: requested?.previousFrameWeight ?? 0.72,
    nextFrameWeight: requested?.nextFrameWeight ?? 0.72,
    seedPolicy: requested?.seedPolicy ?? "family-derived",
    requestUnit: requested?.requestUnit ?? "single-frame",
    allowIndependentTextOnlyFrames: false,
    structuralControls: requested?.structuralControls
      ? [...requested.structuralControls]
      : ["pose-map", "silhouette-mask", "edge-map"],
  };
}

export function normalizedSource(asset: AssetRequest, layers: readonly SpriteLayerPlan[]): SpriteSourceContract {
  const requested = asset.sprite?.source;
  const hasLayerFrames = layers.some((layer) =>
    ["layer-frames", "engine-sidecar"].includes(layer.exportPolicy),
  );
  return {
    editableSource: requested?.editableSource ?? "aseprite",
    retainIndividualFrames: true,
    retainLayerFrames: requested?.retainLayerFrames ?? hasLayerFrames,
    retainPackedDerivative: true,
    retainLinkedCels: requested?.retainLinkedCels ?? layers.some((layer) => layer.treatment === "linked-cel"),
  };
}

export function targetWithNearestFiltering(targets: readonly TargetProfile[]): boolean {
  return targets.some((target) => target.textureFiltering === "nearest");
}

export function packingPolicy(asset: AssetRequest, brief: ArtBrief): SpritePackingPolicy {
  const nearest = targetWithNearestFiltering(brief.project.targets);
  const directional = (asset.animation?.directions ?? 1) > 1;
  const pixelTagged = (asset.tags ?? []).some((tag) => /pixel|indexed|low-res/i.test(tag));
  return {
    padding: nearest ? 2 : 4,
    extrusion: nearest ? 1 : 2,
    allowRotation: !(nearest || directional || pixelTagged),
    trimFrames: false,
    preservePivot: true,
  };
}

export function repairPolicy(brief: ArtBrief): SpriteRepairPolicy {
  return {
    preferSmallestScope: true,
    neverLowerThresholds: true,
    maximumFrameRetries: brief.autonomy.maximumIterations,
    maximumLayerRetries: Math.max(2, Math.min(brief.autonomy.maximumIterations, 4)),
    escalationReasons: [
      "identity or costume ambiguity cannot be resolved from approved references",
      "a requested separation creates visible seams or missing hidden artwork",
      "frame repair exceeds the bounded retry policy",
      "a blocking continuity gate remains an outlier against approved sibling frames",
      "the requested motion cannot fit inside the locked canvas without a design decision",
    ],
  };
}
