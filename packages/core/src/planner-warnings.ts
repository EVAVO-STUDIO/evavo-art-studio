import type { ArtBrief, SpriteContinuityBlueprint } from "@evavo/art-contracts";
import { isSpriteAsset } from "./sprite-continuity.js";

export function plannerWarnings(
  brief: ArtBrief,
  spriteBlueprints: readonly SpriteContinuityBlueprint[],
): readonly string[] {
  const warnings: string[] = [];
  if (!brief.artDirection.references?.length) {
    warnings.push(
      "No reference assets were supplied; style consistency will rely only on written art-direction rules.",
    );
  }
  if (brief.autonomy.mode === "fully-automatic" && brief.autonomy.autoApproveThreshold < 0.9) {
    warnings.push(
      "Fully automatic approval below 0.90 is not recommended for final production assets.",
    );
  }
  if (
    brief.assets.some((asset) => asset.transparency !== "opaque") &&
    !brief.autonomy.requireEvidenceBundle
  ) {
    warnings.push(
      "Transparent outputs should retain evidence bundles so fake transparency and edge-matte checks remain auditable.",
    );
  }
  for (const asset of brief.assets) {
    if (isSpriteAsset(asset) && !asset.sprite) {
      warnings.push(
        `${asset.id} uses the safe default authored-cel continuity contract; add sprite.layers and sprite.shot when independent runtime parts are required.`,
      );
    }
  }
  for (const blueprint of spriteBlueprints) {
    if (
      blueprint.productionMethod === "layered-rig" &&
      !blueprint.layers.some((layer) => layer.treatment === "rigged-part")
    ) {
      warnings.push(
        `${blueprint.assetInstanceId} requests layered-rig production without an explicit rigged-part hierarchy.`,
      );
    }
    if (
      blueprint.shot.shadowPolicy === "separate" &&
      !blueprint.layers.some((layer) => layer.role === "shadow" && layer.exportPolicy === "layer-frames")
    ) {
      warnings.push(
        `${blueprint.assetInstanceId} requests a separate shadow but has no exported shadow layer.`,
      );
    }
  }
  return warnings;
}
