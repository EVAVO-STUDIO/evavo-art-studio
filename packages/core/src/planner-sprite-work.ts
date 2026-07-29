import type {
  ArtBrief,
  AssetRequest,
  PipelineStageKind,
  SpriteContinuityBlueprint,
  SpriteFrameBlueprint,
  WorkItem,
} from "@evavo/art-contracts";
import {
  approvalFor,
  deterministicStages,
  frameWorkItemId,
  slug,
  stageCapabilities,
  targetIncludes,
} from "./planner-common.js";

export function spriteWorkItemsFor(
  asset: AssetRequest,
  blueprint: SpriteContinuityBlueprint,
  brief: ArtBrief,
): readonly WorkItem[] {
  const instance = blueprint.assetInstanceId;
  const items: WorkItem[] = [];
  const add = (
    stage: PipelineStageKind,
    id: string,
    title: string,
    dependsOn: readonly string[],
    produces: readonly string[],
    options: Readonly<{
      deterministic?: boolean;
      requiredCapabilities?: readonly string[];
      frame?: SpriteFrameBlueprint;
      repairScope?: WorkItem["repairScope"];
    }> = {},
  ): void => {
    const item: WorkItem = {
      id,
      assetInstanceId: instance,
      stage,
      title,
      dependsOn: [...dependsOn],
      requiredCapabilities: options.requiredCapabilities ?? stageCapabilities[stage],
      deterministic: options.deterministic ?? deterministicStages.has(stage),
      maximumAttempts:
        options.deterministic ?? deterministicStages.has(stage)
          ? 2
          : brief.autonomy.maximumIterations,
      approval: approvalFor(stage, brief),
      produces: [...produces],
      blueprintId: blueprint.id,
      repairScope: options.repairScope ?? "asset",
      ...(options.frame
        ? {
            frameIndex: options.frame.globalFrameIndex,
            direction: options.frame.direction,
          }
        : {}),
    };
    items.push(item);
  };

  const analyseId = `${instance}-analyse`;
  const artDirectionId = `${instance}-art-direction`;
  const motionId = `${instance}-motion-design`;
  const identityId = `${instance}-identity-master`;

  add(
    "analyse",
    analyseId,
    `${asset.name}: inspect sprite context and existing visual language`,
    [],
    [`work/${instance}/analysis.json`],
  );
  add(
    "art-direction",
    artDirectionId,
    `${asset.name}: lock art direction, exclusions and continuity envelope`,
    [analyseId],
    [`work/${instance}/art-direction.json`],
  );
  add(
    "motion-design",
    motionId,
    `${asset.name}: compile directions, key poses, timing and layer treatment`,
    [artDirectionId],
    [`work/${instance}/sprite-blueprint.json`],
  );

  if (blueprint.isCanonicalMaster) {
    const identityFrame = blueprint.frames.find((frame) => frame.role === "identity-master");
    if (!identityFrame) throw new Error(`Canonical blueprint ${blueprint.id} has no identity-master frame.`);
    add(
      "identity-master",
      identityId,
      `${asset.name}: author canonical identity master`,
      [motionId],
      [`source/frames/${identityFrame.direction}/${identityFrame.id}.png`],
      {
        deterministic: false,
        frame: identityFrame,
        repairScope: "asset",
      },
    );
  } else {
    add(
      "identity-master",
      identityId,
      `${asset.name}: bind approved canonical identity ${blueprint.canonicalInstanceId}`,
      [motionId, `${blueprint.canonicalInstanceId}-identity-master`],
      [`work/${instance}/canonical-binding.json`],
      {
        deterministic: true,
        requiredCapabilities: ["sprite.plan", "vision.identity"],
        repairScope: "asset",
      },
    );
  }

  const directionMasterIds = new Map<string, string>();
  const frameIds = new Map<string, string>();
  for (const frame of blueprint.frames) {
    if (frame.role === "identity-master") {
      frameIds.set(frame.id, identityId);
      directionMasterIds.set(frame.direction, identityId);
      continue;
    }
    if (frame.role !== "direction-master") continue;
    const id = frameWorkItemId(blueprint, frame);
    directionMasterIds.set(frame.direction, id);
    frameIds.set(frame.id, id);
    add(
      "direction-master",
      id,
      `${asset.name}: author ${frame.direction} direction master`,
      [identityId],
      [`source/frames/${frame.direction}/${frame.id}.png`],
      {
        deterministic: false,
        frame,
        repairScope: "frame",
      },
    );
  }

  for (const frame of blueprint.frames) {
    if (frame.role !== "key-pose") continue;
    const id = frameWorkItemId(blueprint, frame);
    frameIds.set(frame.id, id);
    const directionMasterId = directionMasterIds.get(frame.direction);
    if (!directionMasterId) {
      throw new Error(`Direction master missing for ${blueprint.id}:${frame.direction}.`);
    }
    add(
      "key-pose",
      id,
      `${asset.name}: author ${frame.direction} key pose ${String(frame.frameIndex + 1).padStart(3, "0")}`,
      [identityId, directionMasterId],
      [`source/frames/${frame.direction}/${frame.id}.png`],
      {
        deterministic: false,
        frame,
        repairScope: "frame",
      },
    );
  }

  for (const frame of blueprint.frames) {
    if (frame.role !== "inbetween") continue;
    const id = frameWorkItemId(blueprint, frame);
    frameIds.set(frame.id, id);
    const previous = frame.previousKeyPoseId ? frameIds.get(frame.previousKeyPoseId) : undefined;
    const next = frame.nextKeyPoseId ? frameIds.get(frame.nextKeyPoseId) : undefined;
    if (!previous || !next) {
      throw new Error(`In-between ${frame.id} cannot resolve both approved key-pose dependencies.`);
    }
    add(
      "inbetween-frame",
      id,
      `${asset.name}: construct ${frame.direction} in-between ${String(frame.frameIndex + 1).padStart(3, "0")}`,
      previous === next ? [previous] : [previous, next],
      [`source/frames/${frame.direction}/${frame.id}.png`],
      {
        deterministic: false,
        frame,
        repairScope: "frame",
      },
    );
  }

  const allFrameItems = [...new Set(blueprint.frames.map((frame) => {
    const id = frameIds.get(frame.id);
    if (!id) throw new Error(`Frame work item missing for ${frame.id}.`);
    return id;
  }))];
  const layoutId = `${instance}-frame-layout`;
  const layerRegistrationId = `${instance}-layer-registration`;
  const compositeId = `${instance}-composite-reconstruction`;
  const cleanupId = `${instance}-cleanup`;

  add(
    "frame-layout",
    layoutId,
    `${asset.name}: verify canvas, pivots, baselines and frame order`,
    allFrameItems,
    [`work/${instance}/frame-layout.json`],
    { repairScope: "frame" },
  );
  add(
    "layer-registration",
    layerRegistrationId,
    `${asset.name}: register layers, hierarchy, z-order and occlusion`,
    [layoutId],
    [`work/${instance}/layers.json`],
    { repairScope: "layer" },
  );
  add(
    "composite-reconstruction",
    compositeId,
    `${asset.name}: reconstruct approved composites from registered layers`,
    [layerRegistrationId],
    [`work/${instance}/composites.json`],
    { repairScope: "layer" },
  );
  add(
    "cleanup",
    cleanupId,
    `${asset.name}: clean linework, pixels, anatomy and local artifacts`,
    [compositeId],
    [`work/${instance}/cleanup.json`],
    { repairScope: "frame" },
  );

  let previous = cleanupId;
  if (asset.transparency !== "opaque") {
    const alphaId = `${instance}-alpha-extraction`;
    const edgeId = `${instance}-edge-decontamination`;
    const matteId = `${instance}-matte-validation`;
    add(
      "alpha-extraction",
      alphaId,
      `${asset.name}: extract and verify real alpha`,
      [previous],
      [`work/${instance}/alpha.json`],
      { repairScope: "frame" },
    );
    add(
      "edge-decontamination",
      edgeId,
      `${asset.name}: remove matte contamination and repair transparent RGB`,
      [alphaId],
      [`work/${instance}/edge-cleanup.json`],
      { repairScope: "frame" },
    );
    add(
      "matte-validation",
      matteId,
      `${asset.name}: prove edges over black, white, grey, green and magenta`,
      [edgeId],
      [`work/${instance}/matte-evidence.json`],
      { repairScope: "frame" },
    );
    previous = matteId;
  }

  const continuityId = `${instance}-continuity-validation`;
  const timingId = `${instance}-timing`;
  add(
    "continuity-validation",
    continuityId,
    `${asset.name}: compare identity, proportions, silhouette, palette and equipment`,
    [previous],
    [`work/${instance}/continuity-evidence.json`],
    { repairScope: "frame" },
  );
  add(
    "timing",
    timingId,
    `${asset.name}: lock exact frame durations and playback metadata`,
    [continuityId],
    [`work/${instance}/timing.json`],
    { repairScope: "derivative" },
  );
  previous = timingId;

  if (asset.animation?.loop) {
    const loopId = `${instance}-loop-validation`;
    add(
      "loop-validation",
      loopId,
      `${asset.name}: validate loop closure and endpoint motion`,
      [previous],
      [`work/${instance}/loop-evidence.json`],
      { repairScope: "frame" },
    );
    previous = loopId;
  }

  const sourceId = `${instance}-source-package`;
  const masterId = `${instance}-master`;
  add(
    "source-package",
    sourceId,
    `${asset.name}: assemble editable source, individual frames, layers and tags`,
    [previous],
    [`source/${instance}/source-package.json`],
    { repairScope: "layer" },
  );
  add(
    "master",
    masterId,
    `${asset.name}: create lossless approved masters`,
    [sourceId],
    [`work/${instance}/master.json`],
    { repairScope: "derivative" },
  );
  previous = masterId;

  if (["sprite-sheet", "particle"].includes(asset.kind)) {
    const atlasId = `${instance}-atlas-pack`;
    const manifestId = `${instance}-manifest`;
    add(
      "atlas-pack",
      atlasId,
      `${asset.name}: pack derivative sheet with governed padding and extrusion`,
      [previous],
      [`work/${instance}/atlas.json`],
      { repairScope: "derivative" },
    );
    add(
      "manifest",
      manifestId,
      `${asset.name}: bind frame, layer, timing and atlas manifests`,
      [atlasId],
      [`work/${instance}/manifest.json`],
      { repairScope: "derivative" },
    );
    previous = manifestId;
  }

  if (asset.kind === "particle") {
    const particleId = `${instance}-particle-profile`;
    add(
      "particle-profile",
      particleId,
      `${asset.name}: create particle flipbook and engine profile`,
      [previous],
      [`work/${instance}/particle-profile.json`],
      { repairScope: "derivative" },
    );
    previous = particleId;
  }

  if (targetIncludes(brief.project.targets, "godot-4.6.2")) {
    const importId = `${instance}-godot-import-profile`;
    const resourceId = `${instance}-godot-resource`;
    add(
      "godot-import-profile",
      importId,
      `${asset.name}: write Godot 4.6.2 import recommendations`,
      [previous],
      [`work/${instance}/godot-import.json`],
      { repairScope: "derivative" },
    );
    add(
      "godot-resource",
      resourceId,
      `${asset.name}: write SpriteFrames or AtlasTexture resource metadata`,
      [importId],
      [`work/${instance}/godot-resource.json`],
      { repairScope: "derivative" },
    );
    previous = resourceId;
  }

  const exportId = `${instance}-export`;
  const qualityId = `${instance}-quality`;
  add(
    "export",
    exportId,
    `${asset.name}: export source-of-truth and runtime derivatives`,
    [previous],
    [`work/${instance}/export.json`],
    { repairScope: "derivative" },
  );
  add(
    "quality",
    qualityId,
    `${asset.name}: approve only when every blocking gate and evidence record passes`,
    [exportId],
    [`work/${instance}/quality.json`],
    { repairScope: "asset" },
  );

  return items;
}
