import {
  SpritePlannerError,
  type CompiledSpriteProductionPlan,
  type NormalizedSpritePlanCompileRequest,
  type SpriteAtlasPlan,
  type SpriteLayerWorkload,
  type SpritePlanGate,
  type SpritePlanWorkItem,
  type SpritePlannedClip,
  type SpritePlannedDirection,
  type SpritePlannedFrame,
  type SpriteSheetPlan,
} from "./types.js";
import { spritePlanRequestSha256, spritePlanSha256, validateSpritePlanCompileRequest } from "./validation.js";
import { planClips, planDirections, planFrames, requiresEightIsometricDirections } from "./directions-clips.js";
import { planAseprite, planAtlas, planGodot, planLayers, planSheets, planVariants } from "./layers-delivery.js";

function gate(id: string, severity: "blocking" | "warning", description: string, evidence: readonly string[], expected?: number | string | boolean): SpritePlanGate {
  return { id, severity, description, evidence, ...(expected === undefined ? {} : { expected }) };
}

function qualityGates(
  request: NormalizedSpritePlanCompileRequest,
  directions: readonly SpritePlannedDirection[],
  clips: readonly SpritePlannedClip[],
  frames: readonly SpritePlannedFrame[],
  layers: readonly SpriteLayerWorkload[],
  sheets: readonly SpriteSheetPlan[],
  atlas: SpriteAtlasPlan,
): readonly SpritePlanGate[] {
  const authoredDirections = directions.filter((entry) => entry.authored).length;
  const runtimeFrames = frames.length;
  const authoredFrames = frames.filter((entry) => entry.authored).length;
  const requiredLayerUnits = layers.filter((entry) => entry.required).reduce((sum, entry) => sum + entry.minimumUniqueSourceUnits, 0);
  return [
    gate("art-direction-binding", "blocking", "The sprite plan remains bound to the exact compiled art-direction contract and SHA-256.", ["contract id", "contract SHA-256", "embedded contract rehash"], request.artDirectionContract.contractSha256),
    gate("required-direction-coverage", "blocking", "Every runtime direction declared by art direction exists in the plan.", ["direction manifest", "direction order", "runtime frame index"], directions.length),
    gate("authored-direction-master-coverage", "blocking", "Every independently authored facing has an approved direction master before clip generation.", ["direction-master artifacts", "direction order", "identity comparison"], authoredDirections),
    gate("unsafe-mirroring-rejected", "blocking", "Derived mirrors are allowed only when art direction permits mirroring and the asset has no asymmetry, held item or swappable equipment.", ["direction derivation map", "camera policy", "asymmetry and equipment flags"], true),
    gate("required-clip-coverage", "blocking", "Every role, gameplay and feature-required animation clip exists.", ["clip matrix", "role profile", "feature inventory"], clips.length),
    gate("frame-manifest-completeness", "blocking", "Every clip, direction and frame index has one ordered runtime frame entry.", ["frame manifest", "clip frame counts", "global indexes"], runtimeFrames),
    gate("authored-frame-source-coverage", "blocking", "Every authored frame has a lossless source or declared linked-cel relationship; derived frames identify one valid source direction.", ["authored frame set", "linked-cel declarations", "direction derivation map"], authoredFrames),
    gate("exact-duration-coverage", "blocking", "Every runtime frame retains a positive millisecond duration and Godot-relative duration multiplier.", ["frame durations", "SpriteFrames plan", "Aseprite tags"], runtimeFrames),
    gate("key-pose-coverage", "blocking", "Canonical identity, direction masters and clip key poses are approved before in-between production.", ["key-pose indexes", "provider dependencies", "approval evidence"], clips.reduce((sum, clip) => sum + clip.keyPoseFrames.length * clip.authoredDirectionNames.length, 0)),
    gate("layer-workload-completeness", "blocking", "Every required visible layer and engine sidecar has its authorised source workload and runtime binding set.", ["layer workload", "variant strategy", "family manifest"], requiredLayerUnits),
    gate("variant-flattening-prohibited", "blocking", "Runtime costume, equipment, weapon and team variants use the compiled layer or palette strategy instead of multiplying identity frames.", ["variant plan", "layer roles", "palette policy"], true),
    gate("transparent-master-authentic", "blocking", "Transparency-required outputs contain real decoded alpha and no checkerboard, flat matte or contaminated edge.", ["frame QA", "hostile matte proof", "alpha statistics"], request.artDirectionContract.asset.transparency === "required"),
    gate("sheet-derivative-only", "blocking", "Sprite sheets and atlases are reproducible derivatives; frames, layers, tags, pivots and timing remain authoritative.", ["source package", "sheet data", "artifact lineage"], true),
    gate("sheet-layout-completeness", "blocking", "Every requested sheet page stays within the maximum dimensions and accounts for all frames in scope.", ["sheet manifests", "cell dimensions", "page coverage"], sheets.length),
    gate("atlas-no-rotation", "blocking", "Directional frames and layers never rotate during atlas packing.", ["atlas manifest", "packing evidence"], atlas.enabled),
    gate("godot-spriteframes-completeness", "blocking", "Godot delivery contains every animation name, frame path, duration, loop flag, pivot and layer binding.", ["SpriteFrames descriptor", "atlas resources", "Godot import proof"], request.output.includeGodotResources),
    ...(requiresEightIsometricDirections(request) ? [
      gate("isometric-eight-direction-coverage", "blocking", "Isometric runtime families expose all eight ordered directions.", ["direction manifest", "direction master review"], 8),
      gate("isometric-ground-anchor-and-y-sort", "blocking", "Every frame and separate layer shares the compiled foot pivot, tile footprint and Y-sort origin.", ["pivot manifest", "Y-sort origin", "ground-contact overlays"], true),
    ] : []),
    ...(request.artDirectionContract.asset.family === "particle" ? [
      gate("particle-fixed-cell-coverage", "blocking", "Particle flipbooks retain fixed canvas cells, frame lifetime mapping and declared blend mode without per-frame trimming.", ["flipbook grid", "frame durations", "particle material"], true),
    ] : []),
  ];
}

function workItems(
  request: NormalizedSpritePlanCompileRequest,
  directions: readonly SpritePlannedDirection[],
  clips: readonly SpritePlannedClip[],
  layers: readonly SpriteLayerWorkload[],
  sheets: readonly SpriteSheetPlan[],
  atlas: SpriteAtlasPlan,
): readonly SpritePlanWorkItem[] {
  const keyPoseUnits = clips.reduce((sum, clip) => sum + clip.keyPoseFrames.length * clip.authoredDirectionNames.length, 0);
  const authoredFrames = clips.reduce((sum, clip) => sum + clip.authoredFrameCount, 0);
  const inbetweenUnits = Math.max(0, authoredFrames - keyPoseUnits);
  const layerUnits = layers.reduce((sum, layer) => sum + layer.maximumSourceUnits, 0);
  return [
    { id: "sprite-plan:bind-art-direction", stage: "bind-art-direction", title: "Verify exact art-direction contract binding", dependsOn: [], units: 1, requiredCapabilities: ["art-direction.compile", "evidence.bundle"], produces: ["art-direction binding evidence"] },
    { id: "sprite-plan:identity-master", stage: "identity-master", title: "Approve canonical identity master", dependsOn: ["sprite-plan:bind-art-direction"], units: request.artDirectionContract.asset.family === "particle" || request.artDirectionContract.asset.family === "ui" ? 0 : 1, requiredCapabilities: ["provider.reference-lock", "vision.identity", "evidence.bundle"], produces: ["canonical identity master"] },
    { id: "sprite-plan:direction-masters", stage: "direction-masters", title: "Author and approve direction masters", dependsOn: ["sprite-plan:identity-master"], units: directions.filter((entry) => entry.authored).length, requiredCapabilities: ["provider.generate", "vision.identity", "vision.consistency"], produces: ["direction masters", "direction derivation map"] },
    { id: "sprite-plan:key-poses", stage: "key-poses", title: "Author clip key poses", dependsOn: ["sprite-plan:direction-masters"], units: keyPoseUnits, requiredCapabilities: ["provider.generate", "provider.reference-lock", "quality.sprite-frame"], produces: ["approved key poses"] },
    { id: "sprite-plan:inbetweens", stage: "inbetweens", title: "Produce neighbour-conditioned in-between frames", dependsOn: ["sprite-plan:key-poses"], units: inbetweenUnits, requiredCapabilities: ["provider.generate", "provider.reference-lock", "quality.sprite-frame"], produces: ["authored frame candidates"] },
    { id: "sprite-plan:layers", stage: "layers", title: "Produce retained layers and engine sidecars", dependsOn: ["sprite-plan:key-poses"], units: layerUnits, requiredCapabilities: ["provider.generate", "media.layer-compose", "evidence.bundle"], produces: ["layer frame set", "sidecar manifests"] },
    { id: "sprite-plan:mastering", stage: "mastering", title: "Master alpha, edges, palette and exact canvas geometry", dependsOn: ["sprite-plan:inbetweens", "sprite-plan:layers"], units: authoredFrames, requiredCapabilities: ["media.raster", "media.chroma-extract", "quality.sprite-frame"], produces: ["lossless mastered frames"] },
    { id: "sprite-plan:family-verification", stage: "family-verification", title: "Verify complete layered sprite family", dependsOn: ["sprite-plan:mastering"], units: 1, requiredCapabilities: ["sprite.family.verify", "vision.consistency", "selection.compare"], produces: ["manifest-bound family evidence"] },
    { id: "sprite-plan:sheets", stage: "sheets", title: "Build deterministic per-clip sheets", dependsOn: ["sprite-plan:family-verification"], units: sheets.length, requiredCapabilities: ["media.animation", "sprite.sheet-plan.compile", "evidence.bundle"], produces: ["sheet PNGs", "sheet JSON"] },
    { id: "sprite-plan:atlas", stage: "atlas", title: "Build no-rotation family atlas", dependsOn: ["sprite-plan:family-verification"], units: atlas.estimatedPages, requiredCapabilities: ["media.atlas-build", "atlas.pack", "evidence.bundle"], produces: ["atlas pages", "atlas manifest"] },
    { id: "sprite-plan:godot", stage: "godot", title: "Build Godot SpriteFrames and layer bindings", dependsOn: ["sprite-plan:sheets", "sprite-plan:atlas"], units: request.output.includeGodotResources ? 1 : 0, requiredCapabilities: ["godot.spriteframes-plan", "godot.spriteframes-build", "godot.export"], produces: ["SpriteFrames resource", "Godot import manifest"] },
    { id: "sprite-plan:release-evidence", stage: "release-evidence", title: "Bundle complete coverage and reproducibility evidence", dependsOn: ["sprite-plan:godot"], units: 1, requiredCapabilities: ["evidence.bundle"], produces: ["sprite production evidence bundle"] },
  ];
}

export function compileSpriteProductionPlan(input: NormalizedSpritePlanCompileRequest | unknown): CompiledSpriteProductionPlan {
  const request = "protocolVersion" in (input as object ?? {}) ? input as NormalizedSpritePlanCompileRequest : validateSpritePlanCompileRequest(input);
  const requestSha256 = spritePlanRequestSha256(request);
  const directions = planDirections(request);
  if (requiresEightIsometricDirections(request) && directions.length !== 8) throw new SpritePlannerError("SPRITE_PLAN_ISOMETRIC_DIRECTION_COUNT_INVALID", "Isometric 2:1 sprite production requires exactly eight runtime directions.");
  const clips = planClips(request, directions);
  if (!clips.length) throw new SpritePlannerError("SPRITE_PLAN_CLIP_SET_EMPTY", "The role, gameplay profile and overrides produced no animation clips.");
  const frames = planFrames(clips, directions, request.artDirectionContract.asset.assetId);
  const authoredFrames = frames.filter((entry) => entry.authored).length;
  if (frames.length > 32_768) throw new SpritePlannerError("SPRITE_PLAN_FRAME_CEILING_EXCEEDED", `The plan contains ${frames.length} runtime frames; split the family or reduce coverage below 32768.`);
  const layers = planLayers(request, clips);
  const variants = planVariants(request, layers, authoredFrames);
  const sheets = planSheets(request, clips, layers);
  const atlas = planAtlas(request, clips, layers);
  const aseprite = planAseprite(request, clips);
  const godot = planGodot(request, clips, frames, layers);
  const gates = qualityGates(request, directions, clips, frames, layers, sheets, atlas);
  const planWorkItems = workItems(request, directions, clips, layers, sheets, atlas);
  const layerSourceUnits = layers.reduce((sum, entry) => sum + entry.maximumSourceUnits, 0);
  const runtimeLayerBindings = layers.reduce((sum, entry) => sum + entry.runtimeBindings, 0);
  if (layerSourceUnits > 250_000) throw new SpritePlannerError("SPRITE_PLAN_LAYER_CEILING_EXCEEDED", `The plan contains ${layerSourceUnits} layer source units; split the family or reduce variant scope.`);
  const warnings = [
    ...(directions.some((entry) => !entry.authored) ? ["Derived mirrored directions remain runtime outputs, but all mirror sources and handedness proofs must pass before release."] : []),
    ...(frames.length > 4_000 ? [`This premium family contains ${frames.length} runtime frames; schedule staged approval by clip category and direction.`] : []),
    ...(variants.runtimeCombinations > 128 ? [`Runtime variants produce ${variants.runtimeCombinations} combinations; keep variants as separate layers or palette maps and never flatten the Cartesian product.`] : []),
    ...(layers.some((entry) => entry.role === "shadow" && entry.treatment === "static-family") && clips.some((clip) => ["walk", "run", "dodge", "jump-start", "jump-loop", "fall", "land"].includes(clip.id)) ? ["A static-family shadow is requested for moving clips; verify that the approved style genuinely uses a reusable shadow or revise its treatment."] : []),
    ...request.artDirectionContract.outputs.flatMap((entry) => entry.sourceRetention.length ? [] : [`Output profile ${entry.id} has no declared source-retention rules.`]),
  ];
  const partial = {
    schemaVersion: "1.0" as const,
    protocolVersion: request.protocolVersion,
    planId: request.planId,
    requestSha256,
    artDirectionBinding: {
      contractId: request.artDirectionContract.contractId,
      contractSha256: request.artDirectionContract.contractSha256,
      protocolVersion: request.artDirectionContract.protocolVersion,
      ...(request.artDirectionContractArtifactId === undefined ? {} : { artifactId: request.artDirectionContractArtifactId }),
    },
    project: request.artDirectionContract.project,
    asset: request.artDirectionContract.asset,
    role: request.role,
    gameplayProfile: request.gameplayProfile,
    coverage: request.coverage,
    fidelity: request.fidelity,
    features: request.features,
    directions,
    clips,
    frames,
    layers,
    variants,
    sheets,
    atlas,
    aseprite,
    godot,
    workItems: planWorkItems,
    qualityGates: gates,
    totals: {
      clips: clips.length,
      runtimeFrames: frames.length,
      authoredFrames,
      layerSourceUnits,
      runtimeLayerBindings,
      sheets: sheets.length,
      estimatedAtlasPages: atlas.estimatedPages,
    },
    sourceOfTruth: [
      "approved compiled art-direction contract and SHA-256",
      "canonical identity and direction masters",
      "editable Aseprite or OpenRaster source with layers, tags and slices",
      "individual lossless authored and derived runtime frames",
      "exact millisecond durations, pivots, baselines and Y-sort origin",
      "layer and variant manifests",
      "manifest-bound family verification evidence",
      "sprite sheets, atlases and Godot resources as reproducible derivatives",
    ],
    warnings,
    ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
  };
  return { ...partial, planSha256: spritePlanSha256(partial) };
}
