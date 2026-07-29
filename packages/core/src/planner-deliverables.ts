import type {
  ArtBrief,
  AssetRequest,
  DeliverableSpec,
  OutputFormat,
  SpriteContinuityBlueprint,
} from "@evavo/art-contracts";
import { slug, targetIncludes } from "./planner-common.js";

export function metadataPath(asset: AssetRequest, instance: string): string {
  const prefix = slug(asset.namingPrefix ?? asset.id);
  return `deliverables/${slug(asset.kind)}/${instance}/${prefix}.asset.json`;
}

export function declaredDeliverables(
  asset: AssetRequest,
  instance: string,
  blueprint?: SpriteContinuityBlueprint,
): readonly DeliverableSpec[] {
  const prefix = slug(asset.namingPrefix ?? asset.id);
  const metadataSidecar = metadataPath(asset, instance);
  const frameSources = blueprint?.frames.map((frame) => frame.id) ?? [];
  return asset.outputs.map((output, outputIndex) => ({
    id: `${instance}-${output.purpose}-${String(outputIndex + 1).padStart(2, "0")}`,
    assetInstanceId: instance,
    relativePath: `deliverables/${slug(asset.kind)}/${instance}/${prefix}.${output.purpose}.${output.format}`,
    format: output.format,
    purpose: output.purpose,
    width: asset.dimensions.width,
    height: asset.dimensions.height,
    transparency: asset.transparency,
    metadataSidecar,
    sourceOfTruth: output.purpose === "source" || output.purpose === "master",
    ...(blueprint ? { blueprintId: blueprint.id, derivativeOf: frameSources } : {}),
  }));
}

export function spriteDeliverables(
  asset: AssetRequest,
  blueprint: SpriteContinuityBlueprint,
): readonly DeliverableSpec[] {
  const instance = blueprint.assetInstanceId;
  const prefix = slug(asset.namingPrefix ?? asset.id);
  const metadataSidecar = metadataPath(asset, instance);
  const deliverables: DeliverableSpec[] = [];

  deliverables.push(
    {
      id: `${instance}-sprite-blueprint`,
      assetInstanceId: instance,
      relativePath: `source/${instance}/${prefix}.sprite-blueprint.json`,
      format: "json",
      purpose: "manifest",
      transparency: "opaque",
      metadataSidecar,
      blueprintId: blueprint.id,
      sourceOfTruth: true,
    },
    {
      id: `${instance}-frame-manifest`,
      assetInstanceId: instance,
      relativePath: `source/${instance}/${prefix}.frames.json`,
      format: "json",
      purpose: "manifest",
      transparency: "opaque",
      metadataSidecar,
      blueprintId: blueprint.id,
      sourceOfTruth: true,
    },
    {
      id: `${instance}-layer-manifest`,
      assetInstanceId: instance,
      relativePath: `source/${instance}/${prefix}.layers.json`,
      format: "json",
      purpose: "manifest",
      transparency: "opaque",
      metadataSidecar,
      blueprintId: blueprint.id,
      sourceOfTruth: true,
    },
    {
      id: `${instance}-editable-source`,
      assetInstanceId: instance,
      relativePath: `source/${instance}/${prefix}.source.${blueprint.source.editableSource}`,
      format: blueprint.source.editableSource,
      purpose: "source",
      width: asset.dimensions.width,
      height: asset.dimensions.height,
      transparency: asset.transparency,
      metadataSidecar,
      blueprintId: blueprint.id,
      sourceOfTruth: true,
    },
    {
      id: `${instance}-contact-sheet`,
      assetInstanceId: instance,
      relativePath: `previews/${instance}/${prefix}.continuity-contact-sheet.png`,
      format: "png",
      purpose: "preview",
      transparency: "opaque",
      metadataSidecar,
      blueprintId: blueprint.id,
      sourceOfTruth: false,
      derivativeOf: blueprint.frames.map((frame) => frame.id),
    },
  );

  for (const frame of blueprint.frames) {
    const frameDeliverableId = `${frame.id}-source`;
    deliverables.push({
      id: frameDeliverableId,
      assetInstanceId: instance,
      relativePath: `source/${instance}/frames/${frame.direction}/${prefix}_${slug(frame.direction)}_${String(frame.frameIndex + 1).padStart(3, "0")}.png`,
      format: "png",
      purpose: "source",
      width: asset.dimensions.width,
      height: asset.dimensions.height,
      transparency: asset.transparency,
      metadataSidecar,
      blueprintId: blueprint.id,
      frameIndex: frame.globalFrameIndex,
      direction: frame.direction,
      durationMs: frame.durationMs,
      sourceOfTruth: true,
    });

    if (!blueprint.source.retainLayerFrames) continue;
    for (const layer of blueprint.layers) {
      if (!["layer-frames", "engine-sidecar"].includes(layer.exportPolicy)) continue;
      const isCollision = layer.role === "collision";
      const format: OutputFormat = isCollision ? "json" : "png";
      deliverables.push({
        id: `${frame.id}-${layer.id}`,
        assetInstanceId: instance,
        relativePath: `source/${instance}/layers/${layer.id}/${prefix}_${slug(frame.direction)}_${String(frame.frameIndex + 1).padStart(3, "0")}_${layer.id}.${format}`,
        format,
        purpose: isCollision ? "manifest" : "source",
        transparency: isCollision ? "opaque" : "alpha-required",
        metadataSidecar,
        blueprintId: blueprint.id,
        frameIndex: frame.globalFrameIndex,
        direction: frame.direction,
        layerId: layer.id,
        durationMs: frame.durationMs,
        sourceOfTruth: true,
        derivativeOf: [frameDeliverableId],
        ...(!isCollision
          ? { width: asset.dimensions.width, height: asset.dimensions.height }
          : {}),
      });
    }
  }

  return deliverables;
}

export function deliverablesFor(
  asset: AssetRequest,
  index: number,
  brief: ArtBrief,
  blueprint?: SpriteContinuityBlueprint,
): readonly DeliverableSpec[] {
  const instance = `${slug(asset.id)}-${String(index + 1).padStart(2, "0")}`;
  const metadataSidecar = metadataPath(asset, instance);
  const prefix = slug(asset.namingPrefix ?? asset.id);
  const deliverables: DeliverableSpec[] = [
    ...declaredDeliverables(asset, instance, blueprint),
    ...(blueprint ? spriteDeliverables(asset, blueprint) : []),
  ];

  deliverables.push({
    id: `${instance}-evidence`,
    assetInstanceId: instance,
    relativePath: `deliverables/${slug(asset.kind)}/${instance}/${prefix}.evidence.json`,
    format: "json",
    purpose: "manifest",
    transparency: "opaque",
    metadataSidecar,
    ...(blueprint ? { blueprintId: blueprint.id } : {}),
  });

  if (targetIncludes(brief.project.targets, "godot-4.6.2")) {
    deliverables.push({
      id: `${instance}-godot-resource`,
      assetInstanceId: instance,
      relativePath: `deliverables/${slug(asset.kind)}/${instance}/${prefix}.tres`,
      format: "tres",
      purpose: "manifest",
      transparency: asset.transparency,
      metadataSidecar,
      ...(blueprint
        ? {
            blueprintId: blueprint.id,
            derivativeOf: blueprint.frames.map((frame) => frame.id),
          }
        : {}),
    });
  }

  return deliverables;
}
