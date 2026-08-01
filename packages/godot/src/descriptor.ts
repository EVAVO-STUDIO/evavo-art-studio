import type { SpriteAtlasPackageWriteResult } from "@evavo/art-media";

import {
  GODOT_SPRITE_PACKAGE_VERSION,
  GodotSpritePackageError,
  type GodotSpriteFramesArtifactDescriptorInput,
  type GodotSpriteFramesDescriptor,
} from "./types.js";
import { toGodotResourcePath } from "./path.js";

function loopModeValue(mode: "none" | "linear" | "ping-pong"): 0 | 1 | 2 {
  if (mode === "linear") return 1;
  if (mode === "ping-pong") return 2;
  return 0;
}

function resourcePath(value: string, name: string): string {
  const result = value.trim();
  if (
    !result.startsWith("res://") ||
    result.length > 2_048 ||
    result.includes("\0") ||
    result.includes("\\")
  ) {
    throw new GodotSpritePackageError(
      "GODOT_SPRITE_RESOURCE_PATH_INVALID",
      `${name} must be one safe res:// path.`,
    );
  }
  return result;
}

export function createGodotSpriteFramesDescriptorFromAtlasPages(
  input: GodotSpriteFramesArtifactDescriptorInput,
): GodotSpriteFramesDescriptor {
  const atlasId = input.atlasId.trim();
  if (!atlasId || atlasId.length > 128 || atlasId.includes("\0")) {
    throw new GodotSpritePackageError(
      "GODOT_SPRITE_ATLAS_ID_INVALID",
      "atlasId must contain 1 to 128 safe characters.",
    );
  }
  if (input.pages.length < 1 || input.pages.length > 1_024) {
    throw new GodotSpritePackageError(
      "GODOT_SPRITE_ATLAS_PAGE_COUNT_INVALID",
      "Godot delivery requires 1 to 1024 atlas pages.",
    );
  }
  const texturePaths = input.pages.map((page, index) =>
    resourcePath(page.texturePath, `pages[${index}].texturePath`),
  );
  if (new Set(texturePaths).size !== texturePaths.length) {
    throw new GodotSpritePackageError(
      "GODOT_SPRITE_ATLAS_TEXTURE_DUPLICATE",
      "Every atlas page must use a unique Godot texture path.",
    );
  }
  const filtering = new Set(
    input.pages.map((page) => page.packageData.settings.textureFiltering),
  );
  if (filtering.size !== 1) {
    throw new GodotSpritePackageError(
      "GODOT_SPRITE_FILTERING_MISMATCH",
      "All atlas pages must use the same texture filtering policy.",
    );
  }
  const frameIds = new Set<string>();
  const frames = input.pages.flatMap((page, atlasPage) =>
    page.packageData.frames.map((frame) => {
      if (frameIds.has(frame.id)) {
        throw new GodotSpritePackageError(
          "GODOT_SPRITE_FRAME_DUPLICATE",
          `Packed frame appears on more than one atlas page: ${frame.id}`,
        );
      }
      frameIds.add(frame.id);
      return {
        id: frame.id,
        ...(input.pages.length === 1 ? {} : { atlasPage }),
        region: frame.region,
        trim: frame.trim,
        sourceSize: frame.sourceSize,
        pivot: frame.pivot,
        empty: frame.empty,
      };
    }),
  );
  if (!frames.length) {
    throw new GodotSpritePackageError(
      "GODOT_SPRITE_FRAME_SET_EMPTY",
      "Godot delivery requires at least one packed frame.",
    );
  }
  for (const animation of input.animations) {
    for (const frame of animation.frames) {
      if (!frameIds.has(frame.frameId)) {
        throw new GodotSpritePackageError(
          "GODOT_SPRITE_ANIMATION_FRAME_MISSING",
          `Animation ${animation.name} references missing packed frame ${frame.frameId}.`,
        );
      }
    }
  }
  const outputResourcePath = resourcePath(
    input.outputResourcePath,
    "outputResourcePath",
  );
  return {
    schemaVersion: "1.0",
    generatorVersion: GODOT_SPRITE_PACKAGE_VERSION,
    targetEngine: "Godot 4.6.2",
    atlasId,
    atlasTexturePath: texturePaths[0]!,
    ...(texturePaths.length === 1 ? {} : { atlasTexturePaths: texturePaths }),
    outputResourcePath,
    textureFiltering: [...filtering][0]!,
    frames,
    animations: input.animations.map((animation) => ({
      name: animation.name,
      loopMode: animation.loopMode,
      loopModeValue: loopModeValue(animation.loopMode),
      framesPerSecond: animation.framesPerSecond,
      totalDurationMs: animation.totalDurationMs,
      frames: animation.frames,
    })),
  };
}

export function createGodotSpriteFramesDescriptor(
  atlasPackage: SpriteAtlasPackageWriteResult,
  projectPath: string,
  outputResourcePath: string,
): GodotSpriteFramesDescriptor {
  return createGodotSpriteFramesDescriptorFromAtlasPages({
    atlasId: atlasPackage.packageData.atlasId,
    pages: [
      {
        texturePath: toGodotResourcePath(
          projectPath,
          atlasPackage.imagePath,
        ),
        packageData: atlasPackage.packageData,
      },
    ],
    animations: atlasPackage.packageData.animations,
    outputResourcePath: toGodotResourcePath(
      projectPath,
      outputResourcePath,
    ),
  });
}
