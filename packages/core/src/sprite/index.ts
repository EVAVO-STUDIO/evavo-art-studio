import type { ArtBrief, SpriteContinuityBlueprint } from "@evavo/art-contracts";
import { DEFAULT_CHARACTER_LOCKS, DEFAULT_EFFECT_LOCKS, digest, slug } from "./common.js";
import { buildFrames, buildShells } from "./frames.js";
import { normalizedGeneration, normalizedShot, normalizedSource, packingPolicy, repairPolicy } from "./policy.js";

export function compileSpriteContinuityBlueprints(
  brief: ArtBrief,
): readonly SpriteContinuityBlueprint[] {
  const shells = buildShells(brief);
  const shellByInstance = new Map(shells.map((shell) => [shell.assetInstanceId, shell] as const));

  return shells.map((shell): SpriteContinuityBlueprint => {
    const canonicalShell = shellByInstance.get(shell.canonicalInstanceId);
    if (!canonicalShell) {
      throw new Error(`Canonical sprite shell ${shell.canonicalInstanceId} was not compiled.`);
    }
    const generation = normalizedGeneration(shell.asset);
    const frames = buildFrames(shell, canonicalShell, generation);
    const source = normalizedSource(shell.asset, shell.layers);
    const continuityLocks =
      shell.asset.sprite?.continuityLocks ??
      (shell.asset.kind === "particle" ? DEFAULT_EFFECT_LOCKS : DEFAULT_CHARACTER_LOCKS);
    const blueprint: SpriteContinuityBlueprint = {
      schemaVersion: "1.0",
      id: `sprite_${digest(`${shell.assetInstanceId}|${shell.canonicalInstanceId}`).slice(0, 16)}`,
      assetId: shell.asset.id,
      assetInstanceId: shell.assetInstanceId,
      familyId: `family_${slug(shell.canonicalInstanceId)}`,
      canonicalAssetId: shell.canonicalAsset.id,
      canonicalInstanceId: shell.canonicalInstanceId,
      isCanonicalMaster: shell.assetInstanceId === shell.canonicalInstanceId,
      productionMethod: shell.method,
      canvas: shell.asset.dimensions,
      pivot: shell.pivot,
      directions: [...shell.directions],
      framesPerDirection: shell.asset.animation?.frameCount ?? 1,
      totalFrames: frames.length,
      frameOrder: shell.asset.animation?.frameOrder ?? "direction-major",
      layers: shell.layers,
      shot: normalizedShot(shell.asset),
      continuityLocks: [...continuityLocks],
      allowedChanges: shell.asset.sprite?.allowedChanges
        ? [...shell.asset.sprite.allowedChanges]
        : [
            "declared pose and motion",
            "intentional secondary motion",
            "approved expression changes",
            "declared layer visibility and occlusion changes",
          ],
      generation,
      source,
      packing: packingPolicy(shell.asset, brief),
      repairPolicy: repairPolicy(brief),
      frames,
      ...(shell.asset.animation?.baseline !== undefined
        ? { baseline: shell.asset.animation.baseline }
        : {}),
    };
    return blueprint;
  });
}

export { isSpriteAsset } from "./common.js";
