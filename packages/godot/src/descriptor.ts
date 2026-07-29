import type { SpriteAtlasPackageWriteResult } from "@evavo/art-media";

import {
  GODOT_SPRITE_PACKAGE_VERSION,
  type GodotSpriteFramesDescriptor,
} from "./types.js";
import { toGodotResourcePath } from "./path.js";

function loopModeValue(mode: "none" | "linear" | "ping-pong"): 0 | 1 | 2 {
  if (mode === "linear") return 1;
  if (mode === "ping-pong") return 2;
  return 0;
}

export function createGodotSpriteFramesDescriptor(
  atlasPackage: SpriteAtlasPackageWriteResult,
  projectPath: string,
  outputResourcePath: string,
): GodotSpriteFramesDescriptor {
  return {
    schemaVersion: "1.0",
    generatorVersion: GODOT_SPRITE_PACKAGE_VERSION,
    targetEngine: "Godot 4.6.2",
    atlasId: atlasPackage.packageData.atlasId,
    atlasTexturePath: toGodotResourcePath(projectPath, atlasPackage.imagePath),
    outputResourcePath: toGodotResourcePath(projectPath, outputResourcePath),
    textureFiltering: atlasPackage.packageData.settings.textureFiltering,
    frames: atlasPackage.packageData.frames.map((frame) => ({
      id: frame.id,
      region: frame.region,
      trim: frame.trim,
      sourceSize: frame.sourceSize,
      pivot: frame.pivot,
      empty: frame.empty,
    })),
    animations: atlasPackage.packageData.animations.map((animation) => ({
      name: animation.name,
      loopMode: animation.loopMode,
      loopModeValue: loopModeValue(animation.loopMode),
      framesPerSecond: animation.framesPerSecond,
      totalDurationMs: animation.totalDurationMs,
      frames: animation.frames,
    })),
  };
}
