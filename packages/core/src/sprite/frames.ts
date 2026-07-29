import type {
  ArtBrief,
  AssetRequest,
  CanonicalInstancePolicy,
  Point,
  SpriteFrameBlueprint,
  SpriteGenerationContract,
  SpriteLayerPlan,
  SpriteProductionMethod,
} from "@evavo/art-contracts";
import { digest, directionNames, frameDurations, instanceId, isSpriteAsset, keyPoseFrames, normalizedPivot, slug } from "./common.js";
import { normalizedLayers, productionMethod } from "./policy.js";

export function resolvedCanonicalPolicy(
  asset: AssetRequest,
  canonical: AssetRequest,
): CanonicalInstancePolicy {
  if (asset.sprite?.canonicalInstancePolicy) return asset.sprite.canonicalInstancePolicy;
  return canonical.quantity === 1 ? "shared" : "index-matched";
}

export function resolveCanonicalBinding(
  asset: AssetRequest,
  index: number,
  brief: ArtBrief,
): Readonly<{ canonicalAsset: AssetRequest; canonicalIndex: number }> {
  const byId = new Map(brief.assets.map((entry) => [entry.id, entry] as const));
  let current = asset;
  let currentIndex = index;
  const seen = new Set<string>();

  while (current.sprite?.canonicalAssetId) {
    if (seen.has(current.id)) throw new Error(`Canonical identity cycle reached ${current.id}.`);
    seen.add(current.id);
    const canonical = byId.get(current.sprite.canonicalAssetId);
    if (!canonical) throw new Error(`Canonical asset ${current.sprite.canonicalAssetId} was not found.`);
    const policy = resolvedCanonicalPolicy(current, canonical);
    currentIndex = policy === "shared" ? 0 : currentIndex;
    current = canonical;
  }
  return { canonicalAsset: current, canonicalIndex: currentIndex };
}

export function nearestKeyPose(
  keyPoses: readonly number[],
  frame: number,
  frameCount: number,
  direction: "previous" | "next",
  loop: boolean,
): number {
  if (direction === "previous") {
    const candidates = keyPoses.filter((entry) => entry <= frame);
    if (candidates.length) return candidates[candidates.length - 1]!;
    return loop ? keyPoses[keyPoses.length - 1]! : keyPoses[0]!;
  }
  const candidates = keyPoses.filter((entry) => entry >= frame);
  if (candidates.length) return candidates[0]!;
  return loop ? keyPoses[0]! : keyPoses[keyPoses.length - 1]!;
}

export function frameId(assetInstanceId: string, direction: string, frameIndex: number): string {
  return `${assetInstanceId}-${slug(direction)}-frame-${String(frameIndex + 1).padStart(3, "0")}`;
}

export type BlueprintShell = Readonly<{
  asset: AssetRequest;
  assetIndex: number;
  assetInstanceId: string;
  canonicalAsset: AssetRequest;
  canonicalIndex: number;
  canonicalInstanceId: string;
  directions: readonly string[];
  keyPoses: readonly number[];
  durations: readonly number[];
  layers: readonly SpriteLayerPlan[];
  method: SpriteProductionMethod;
  pivot: Point;
}>;

export function buildShells(brief: ArtBrief): readonly BlueprintShell[] {
  const shells: BlueprintShell[] = [];
  for (const asset of brief.assets) {
    if (!isSpriteAsset(asset)) continue;
    for (let index = 0; index < asset.quantity; index += 1) {
      const binding = resolveCanonicalBinding(asset, index, brief);
      const layers = normalizedLayers(asset);
      shells.push({
        asset,
        assetIndex: index,
        assetInstanceId: instanceId(asset.id, index),
        canonicalAsset: binding.canonicalAsset,
        canonicalIndex: binding.canonicalIndex,
        canonicalInstanceId: instanceId(binding.canonicalAsset.id, binding.canonicalIndex),
        directions: directionNames(asset.animation),
        keyPoses: keyPoseFrames(asset.animation),
        durations: frameDurations(asset.animation),
        layers,
        method: productionMethod(asset, layers),
        pivot: normalizedPivot(asset),
      });
    }
  }
  return shells;
}

export function buildFrames(
  shell: BlueprintShell,
  canonicalShell: BlueprintShell,
  generation: SpriteGenerationContract,
): readonly SpriteFrameBlueprint[] {
  const animation = shell.asset.animation;
  const frameCount = animation?.frameCount ?? 1;
  const loop = animation?.loop ?? false;
  const baseDuration = 1000 / (animation?.framesPerSecond ?? 1);
  const familySeed = digest(
    `${canonicalShell.assetInstanceId}|${canonicalShell.asset.name}|${canonicalShell.asset.purpose}`,
  ).slice(0, 16);
  const identityMasterId = frameId(
    canonicalShell.assetInstanceId,
    canonicalShell.directions[0]!,
    0,
  );
  const layerIds = shell.layers
    .filter((layer) => layer.treatment !== "guide-only")
    .map((layer) => layer.id);
  const frames: SpriteFrameBlueprint[] = [];

  shell.directions.forEach((direction, directionIndex) => {
    const directionMasterId = frameId(shell.assetInstanceId, direction, 0);
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const id = frameId(shell.assetInstanceId, direction, frameIndex);
      const isIdentityMaster =
        shell.assetInstanceId === canonicalShell.assetInstanceId &&
        directionIndex === 0 &&
        frameIndex === 0;
      const isDirectionMaster = frameIndex === 0 && !isIdentityMaster;
      const isKeyPose = shell.keyPoses.includes(frameIndex);
      const role = isIdentityMaster
        ? "identity-master"
        : isDirectionMaster
          ? "direction-master"
          : isKeyPose
            ? "key-pose"
            : "inbetween";
      const previousKey = nearestKeyPose(
        shell.keyPoses,
        frameIndex,
        frameCount,
        "previous",
        loop,
      );
      const nextKey = nearestKeyPose(
        shell.keyPoses,
        frameIndex,
        frameCount,
        "next",
        loop,
      );
      const previousKeyPoseId = frameId(shell.assetInstanceId, direction, previousKey);
      const nextKeyPoseId = frameId(shell.assetInstanceId, direction, nextKey);
      const globalFrameIndex =
        (animation?.frameOrder ?? "direction-major") === "direction-major"
          ? directionIndex * frameCount + frameIndex
          : frameIndex * shell.directions.length + directionIndex;
      const durationMs = shell.durations[frameIndex]!;
      const frame: SpriteFrameBlueprint = {
        id,
        globalFrameIndex,
        direction,
        directionIndex,
        frameIndex,
        role,
        durationMs,
        godotRelativeDuration: Number((durationMs / baseDuration).toFixed(6)),
        pivot: shell.pivot,
        directionReferenceId: isIdentityMaster ? id : directionMasterId,
        layerIds,
        familySeed,
        frameSeed: digest(`${familySeed}|${shell.assetInstanceId}|${direction}|${frameIndex}`).slice(0, 16),
        structuralControls: [...generation.structuralControls],
        ...(animation?.baseline !== undefined ? { baseline: animation.baseline } : {}),
        ...(!isIdentityMaster ? { identityReferenceId: identityMasterId } : {}),
        ...(role === "inbetween"
          ? {
              previousKeyPoseId,
              nextKeyPoseId,
              previousApprovedFrameId: previousKeyPoseId,
              nextApprovedFrameId: nextKeyPoseId,
            }
          : {}),
      };
      frames.push(frame);
    }
  });

  return frames.sort((left, right) => left.globalFrameIndex - right.globalFrameIndex);
}
