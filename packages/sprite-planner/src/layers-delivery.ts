import type { ArtLayerRole } from "@evavo/art-direction";

import type {
  NormalizedSpritePlanCompileRequest,
  SpriteAsepritePlan,
  SpriteAtlasPlan,
  SpriteGodotPlan,
  SpriteLayerWorkload,
  SpritePlannedClip,
  SpritePlannedFrame,
  SpriteSheetPlan,
  SpriteVariantPlan,
} from "./types.js";
import { requiresEightIsometricDirections } from "./directions-clips.js";

function variantCountForRole(role: ArtLayerRole, request: NormalizedSpritePlanCompileRequest): number {
  if (role === "costume") return request.variants.costumeVariants;
  if (role === "equipment") return request.variants.equipmentVariants;
  if (role === "weapon") return request.variants.weaponVariants;
  return 1;
}

export function planLayers(request: NormalizedSpritePlanCompileRequest, clips: readonly SpritePlannedClip[]): readonly SpriteLayerWorkload[] {
  const authoredFrames = clips.reduce((sum, clip) => sum + clip.authoredFrameCount, 0);
  const runtimeFrames = clips.reduce((sum, clip) => sum + clip.runtimeFrameCount, 0);
  const authoredClipDirections = clips.reduce((sum, clip) => sum + clip.authoredDirectionNames.length, 0);
  return request.artDirectionContract.production.layers.map((layer) => {
    const variantCount = variantCountForRole(layer.role, request);
    let minimumUniqueSourceUnits = 0;
    let maximumSourceUnits = 0;
    if (layer.treatment === "separate-per-frame") {
      minimumUniqueSourceUnits = authoredFrames * variantCount;
      maximumSourceUnits = minimumUniqueSourceUnits;
    } else if (layer.treatment === "linked-cel") {
      minimumUniqueSourceUnits = Math.max(1, authoredClipDirections) * variantCount;
      maximumSourceUnits = authoredFrames * variantCount;
    } else if (layer.treatment === "static-family") {
      minimumUniqueSourceUnits = variantCount;
      maximumSourceUnits = variantCount;
    } else if (layer.treatment === "engine-sidecar") {
      minimumUniqueSourceUnits = Math.max(1, authoredClipDirections);
      maximumSourceUnits = authoredFrames;
    } else if (layer.treatment === "runtime-rig") {
      const authoredDirections = new Set(clips.flatMap((clip) => clip.authoredDirectionNames)).size;
      minimumUniqueSourceUnits = Math.max(1, authoredDirections) * variantCount;
      maximumSourceUnits = minimumUniqueSourceUnits;
    } else if (layer.treatment === "guide-only") {
      minimumUniqueSourceUnits = 1;
      maximumSourceUnits = 1;
    }
    const runtimeBindings = layer.treatment === "guide-only"
      ? 0
      : layer.treatment === "static-family"
        ? runtimeFrames * variantCount
        : runtimeFrames * Math.max(1, variantCount);
    return {
      role: layer.role,
      treatment: layer.treatment,
      required: layer.required,
      contributesToColour: layer.contributesToColour,
      contributesToIdentity: layer.contributesToIdentity,
      variantCount,
      minimumUniqueSourceUnits,
      maximumSourceUnits,
      runtimeBindings,
      pathPattern: layer.treatment === "guide-only"
        ? `art/${request.artDirectionContract.asset.assetId}/guides/${layer.role}.json`
        : `art/${request.artDirectionContract.asset.assetId}/layers/${layer.role}/{variant}/{clip}/{direction}/frame-{frame}.png`,
      reason: layer.reason,
    };
  });
}

export function planVariants(request: NormalizedSpritePlanCompileRequest, layers: readonly SpriteLayerWorkload[], authoredFrames: number): SpriteVariantPlan {
  const v = request.variants;
  const runtimeCombinations = v.costumeVariants * v.equipmentVariants * v.weaponVariants * v.teamColourVariants * v.damageVariants;
  const layerRoles = new Set(layers.map((layer) => layer.role));
  const strategies: SpriteVariantPlan["strategies"] = [
    {
      kind: "costume", count: v.costumeVariants,
      strategy: v.costumeVariants === 1 ? "not-required" : layerRoles.has("costume") ? "separate-layer" : "separate-family",
      reason: v.costumeVariants === 1 ? "No costume variation requested." : layerRoles.has("costume") ? "Costumes remain independently authored and combined at runtime." : "No governed costume layer exists, so each costume needs a separately verified family revision.",
    },
    {
      kind: "equipment", count: v.equipmentVariants,
      strategy: v.equipmentVariants === 1 ? "not-required" : layerRoles.has("equipment") ? "separate-layer" : "separate-family",
      reason: v.equipmentVariants === 1 ? "No equipment variation requested." : layerRoles.has("equipment") ? "Equipment variants bind to the approved attachment and occlusion contract." : "No separate equipment layer exists.",
    },
    {
      kind: "weapon", count: v.weaponVariants,
      strategy: v.weaponVariants === 1 ? "not-required" : layerRoles.has("weapon") ? "separate-layer" : "separate-family",
      reason: v.weaponVariants === 1 ? "No weapon variation requested." : layerRoles.has("weapon") ? "Weapons retain handedness, scale, pivot and per-frame occlusion independently." : "No separate weapon layer exists.",
    },
    {
      kind: "team-colour", count: v.teamColourVariants,
      strategy: v.teamColourVariants === 1 ? "not-required" : request.artDirectionContract.style.palette.preserveIndices ? "palette-map" : "separate-family",
      reason: v.teamColourVariants === 1 ? "No team-colour variation requested." : request.artDirectionContract.style.palette.preserveIndices ? "Indexed palette mappings create deterministic team variants without repainting identity." : "The style does not preserve palette indices, so team variants require separately verified output.",
    },
    {
      kind: "damage", count: v.damageVariants,
      strategy: v.damageVariants === 1 ? "not-required" : layerRoles.has("costume") || layerRoles.has("effect") ? "separate-layer" : "separate-family",
      reason: v.damageVariants === 1 ? "No damage-state variation requested." : layerRoles.has("costume") || layerRoles.has("effect") ? "Damage is isolated to an approved visible layer and does not multiply the identity-core family." : "Damage alters the composite without a governed separate layer.",
    },
  ];
  return {
    runtimeCombinations,
    flattenedFullFamilyCombinations: authoredFrames * runtimeCombinations,
    authoredVariantUnits: layers.reduce((sum, layer) => sum + layer.maximumSourceUnits, 0),
    strategies,
  };
}

function atlasPolicy(request: NormalizedSpritePlanCompileRequest) {
  const atlasProfiles = request.artDirectionContract.outputs.filter((entry) => entry.atlas.allowed);
  return {
    padding: Math.max(0, ...atlasProfiles.map((entry) => entry.atlas.paddingPixels)),
    extrusion: Math.max(0, ...atlasProfiles.map((entry) => entry.atlas.extrusionPixels)),
    trim: atlasProfiles.some((entry) => entry.atlas.trim === "alpha-aware") ? "alpha-aware" as const : "forbidden" as const,
  };
}

function sheetChunks(
  request: NormalizedSpritePlanCompileRequest,
  clip: SpritePlannedClip,
  directions: readonly string[],
  layerRole: ArtLayerRole | "composite",
  purpose: "source-review" | "runtime-derivative",
  includeDerivedDirections: boolean,
  suffix: string,
): readonly SpriteSheetPlan[] {
  const width = request.artDirectionContract.asset.dimensions.width;
  const height = request.artDirectionContract.asset.dimensions.height;
  const maxColumns = Math.max(1, Math.floor(request.output.maximumSheetSize / width));
  const maxRows = Math.max(1, Math.floor(request.output.maximumSheetSize / height));
  const padding = atlasPolicy(request).padding;
  const extrusion = atlasPolicy(request).extrusion;
  const output: SpriteSheetPlan[] = [];
  for (let directionStart = 0; directionStart < directions.length; directionStart += maxRows) {
    const rowDirections = directions.slice(directionStart, directionStart + maxRows);
    for (let frameStart = 0; frameStart < clip.framesPerDirection; frameStart += maxColumns) {
      const columns = Math.min(maxColumns, clip.framesPerDirection - frameStart);
      const page = output.length + 1;
      output.push({
        id: `${clip.id}:${layerRole}:${purpose}:page-${page}`,
        clipId: clip.id,
        layerRole,
        purpose,
        rows: rowDirections.length,
        columns,
        cellWidth: width,
        cellHeight: height,
        frameCount: rowDirections.length * columns,
        layout: "rows",
        includeDerivedDirections,
        trim: "forbidden",
        rotation: "forbidden",
        paddingPixels: padding,
        extrusionPixels: extrusion,
        imagePath: `art/${request.artDirectionContract.asset.assetId}/generated/sheets/${clip.id}.${suffix}.page-${page}.png`,
        dataPath: `art/${request.artDirectionContract.asset.assetId}/generated/sheets/${clip.id}.${suffix}.page-${page}.json`,
      });
    }
  }
  return output;
}

export function planSheets(request: NormalizedSpritePlanCompileRequest, clips: readonly SpritePlannedClip[], layers: readonly SpriteLayerWorkload[]): readonly SpriteSheetPlan[] {
  if (!request.output.includePerClipSheets || request.output.sheetStrategy === "individual-frames-only" || request.output.sheetStrategy === "atlas-only") return [];
  const output: SpriteSheetPlan[] = [];
  for (const clip of clips) {
    if (request.output.sheetStrategy === "per-clip-layer-grid") {
      for (const layer of layers.filter((entry) => entry.contributesToColour && entry.treatment !== "baked" && entry.treatment !== "guide-only")) {
        output.push(...sheetChunks(request, clip, clip.authoredDirectionNames, layer.role, "source-review", false, `${layer.role}.source`));
      }
    }
    output.push(...sheetChunks(request, clip, clip.directionNames, "composite", "runtime-derivative", true, "composite.runtime"));
  }
  return output;
}

export function planAtlas(request: NormalizedSpritePlanCompileRequest, clips: readonly SpritePlannedClip[], layers: readonly SpriteLayerWorkload[]): SpriteAtlasPlan {
  const enabled = request.output.includeFamilyAtlas;
  const runtimeFrames = clips.reduce((sum, clip) => sum + clip.runtimeFrameCount, 0);
  const visibleLayerBindings = layers.filter((entry) => entry.contributesToColour && entry.treatment !== "baked").reduce((sum, layer) => sum + layer.runtimeBindings, 0);
  const sourceFrameCount = runtimeFrames + visibleLayerBindings;
  const area = sourceFrameCount * request.artDirectionContract.asset.dimensions.width * request.artDirectionContract.asset.dimensions.height;
  const pageArea = request.output.maximumSheetSize * request.output.maximumSheetSize * 0.78;
  const policy = atlasPolicy(request);
  return {
    enabled,
    maximumWidth: request.output.maximumSheetSize,
    maximumHeight: request.output.maximumSheetSize,
    packing: "deterministic-maxrects-no-rotation",
    trim: policy.trim,
    paddingPixels: policy.padding,
    extrusionPixels: policy.extrusion,
    estimatedPages: enabled ? Math.max(1, Math.ceil(area / pageArea)) : 0,
    sourceFrameCount,
    imagePathPattern: `art/${request.artDirectionContract.asset.assetId}/generated/atlas/${request.artDirectionContract.asset.assetId}.page-{page}.png`,
    dataPathPattern: `art/${request.artDirectionContract.asset.assetId}/generated/atlas/${request.artDirectionContract.asset.assetId}.page-{page}.json`,
  };
}

export function planAseprite(request: NormalizedSpritePlanCompileRequest, clips: readonly SpritePlannedClip[]): SpriteAsepritePlan {
  const enabled = request.output.includeAsepriteExport;
  const sourcePath = `art/${request.artDirectionContract.asset.assetId}/source/${request.artDirectionContract.asset.assetId}.aseprite`;
  let cursor = 0;
  const tags: Array<SpriteAsepritePlan["tags"][number]> = [];
  for (const clip of clips) for (const direction of clip.authoredDirectionNames) {
    tags.push({ name: `${clip.id}/${direction}`, clipId: clip.id, direction, fromFrame: cursor, toFrame: cursor + clip.framesPerDirection - 1, loopMode: clip.loopMode });
    cursor += clip.framesPerDirection;
  }
  const pivot = request.artDirectionContract.production.pivot;
  const slices: SpriteAsepritePlan["slices"] = [
    { name: "pivot", purpose: "pivot", x: pivot.x, y: pivot.y },
    { name: "ground-contact", purpose: "ground-contact", x: pivot.x, y: request.artDirectionContract.production.baseline },
    { name: "safe-bounds", purpose: "safe-bounds", x: request.artDirectionContract.production.shot.safePaddingPixels, y: request.artDirectionContract.production.shot.safePaddingPixels },
    ...(requiresEightIsometricDirections(request) ? [{ name: "tile-footprint", purpose: "tile-footprint" as const, x: request.artDirectionContract.production.ySortOrigin.x, y: request.artDirectionContract.production.ySortOrigin.y }] : []),
  ];
  const assetId = request.artDirectionContract.asset.assetId;
  const padding = atlasPolicy(request).padding;
  return {
    enabled,
    sourcePath,
    tags,
    slices,
    exportCommands: enabled ? [
      `aseprite -b "${sourcePath}" --list-tags --list-slices`,
      `aseprite -b "${sourcePath}" --sheet "art/${assetId}/generated/aseprite/${assetId}.review.png" --data "art/${assetId}/generated/aseprite/${assetId}.review.json" --sheet-type rows --border-padding ${padding} --shape-padding ${padding} --inner-padding 0 --extrude`,
      `aseprite -b --all-layers --split-layers "${sourcePath}" --save-as "art/${assetId}/layers/{layer}/{tag}/frame-{frame}.png"`,
    ] : [],
    prohibitedOptions: [
      "--merge-duplicates unless the manifest explicitly declares intentional linked-cel holds",
      "--trim for fixed-cell source or review sheets",
      "--sheet-pack as the authoritative source layout; deterministic Art Studio atlas packing is a later derivative stage",
    ],
  };
}

function durationMultipliers(clip: SpritePlannedClip): readonly number[] {
  const base = 1000 / clip.framesPerSecond;
  return clip.frameDurationsMs.map((duration) => Math.round((duration / base) * 1_000_000) / 1_000_000);
}

export function planGodot(request: NormalizedSpritePlanCompileRequest, clips: readonly SpritePlannedClip[], frames: readonly SpritePlannedFrame[], layers: readonly SpriteLayerWorkload[]): SpriteGodotPlan {
  const enabled = request.output.includeGodotResources && request.artDirectionContract.outputs.some((entry) => entry.target === "godot-4.6.2");
  const assetId = request.artDirectionContract.asset.assetId;
  const primaryNode = clips.some((clip) => clip.framesPerDirection > 1) ? "AnimatedSprite2D" as const : "Sprite2D" as const;
  const animations = clips.flatMap((clip) => clip.directionNames.map((direction) => ({
    name: `${clip.id}/${direction}`,
    clipId: clip.id,
    direction,
    loop: clip.loopMode !== "none",
    framesPerSecond: clip.framesPerSecond,
    durationMultipliers: durationMultipliers(clip),
    framePaths: frames.filter((frame) => frame.clipId === clip.id && frame.direction === direction).map((frame) => `res://${frame.compositePath}`),
  })));
  const layerNodes: SpriteGodotPlan["layerNodes"][number][] = [];
  for (const layer of layers) {
    if (layer.role === "collision") { layerNodes.push({ name: "Collision", role: layer.role, node: "CollisionShape2D", synchroniseAnimationAndFrame: true }); continue; }
    if (layer.role === "occlusion") { layerNodes.push({ name: "Occlusion", role: layer.role, node: "LightOccluder2D", synchroniseAnimationAndFrame: true }); continue; }
    if (layer.contributesToColour && layer.treatment !== "baked" && layer.treatment !== "guide-only") {
      layerNodes.push({
        name: layer.role.replace(/(^|-)([a-z])/g, (_match, _prefix, letter: string) => letter.toUpperCase()),
        role: layer.role,
        node: layer.treatment === "static-family" ? "Sprite2D" : "AnimatedSprite2D",
        synchroniseAnimationAndFrame: layer.treatment !== "static-family",
      });
    }
  }
  const requirements = [
    "Retain SpriteFrames animation names, loop flags and exact per-frame duration multipliers.",
    "Keep individual lossless frames and editable source authoritative over packed atlases.",
    "AtlasTexture regions must retain source size, trim margin, pivot and baseline metadata.",
    "Directional art and sheets may not rotate during packing.",
    ...(request.artDirectionContract.style.pixelGrid.enabled ? ["Use nearest texture filtering and integer placement; use centered=false or verified 2D pixel snapping to avoid half-pixel deformation."] : []),
    ...(requiresEightIsometricDirections(request) ? ["Place sibling TileMapLayer and sprite nodes under one Y-sorted Node2D parent and use the compiled Y-sort origin."] : []),
    ...request.artDirectionContract.outputs.flatMap((entry) => entry.importRecommendations),
  ];
  return {
    enabled,
    engineVersion: request.artDirectionContract.project.engineVersion || "4.6.2",
    primaryNode,
    resourcePath: `res://art/${assetId}/generated/godot/${assetId}.sprite_frames.tres`,
    atlasResourcePath: `res://art/${assetId}/generated/godot/${assetId}.atlas_manifest.json`,
    animationLibraryPath: `res://art/${assetId}/generated/godot/${assetId}.animation_library.json`,
    layerNodes,
    animations,
    projectRequirements: [...new Set(requirements)],
    ySortOrigin: request.artDirectionContract.production.ySortOrigin,
    pivot: request.artDirectionContract.production.pivot,
  };
}
