import { Buffer } from "node:buffer";

import type { AtlasLayout, PackPlacement } from "./maxrects.js";
import { clamp } from "./math.js";
import {
  SpriteAtlasInputError,
  type PackedAtlasFrame,
  type PreparedAtlasFrame,
} from "./types.js";

function copyPixel(
  source: Uint8Array,
  sourceOffset: number,
  target: Buffer,
  targetOffset: number,
): void {
  target[targetOffset] = source[sourceOffset]!;
  target[targetOffset + 1] = source[sourceOffset + 1]!;
  target[targetOffset + 2] = source[sourceOffset + 2]!;
  target[targetOffset + 3] = source[sourceOffset + 3]!;
}

export function renderAtlasRgba(
  preparedFrames: readonly PreparedAtlasFrame[],
  layout: AtlasLayout,
  padding: number,
  extrusion: number,
): Readonly<{
  data: Buffer;
  frames: readonly PackedAtlasFrame[];
}> {
  const target = Buffer.alloc(layout.width * layout.height * 4);
  const frameById = new Map(preparedFrames.map((frame) => [frame.id, frame] as const));
  const packedFrames: PackedAtlasFrame[] = [];

  for (const placement of layout.placements) {
    const frame = frameById.get(placement.id);
    if (!frame) {
      throw new SpriteAtlasInputError(
        "SPRITE_ATLAS_PACK_INTERNAL",
        `Packed placement ${placement.id} has no decoded source frame.`,
      );
    }
    const regionX = placement.x + padding + extrusion;
    const regionY = placement.y + padding + extrusion;

    if (!frame.empty) {
      for (let offsetY = -extrusion; offsetY < frame.trim.height + extrusion; offsetY += 1) {
        for (let offsetX = -extrusion; offsetX < frame.trim.width + extrusion; offsetX += 1) {
          const sourceX = frame.trim.x + clamp(offsetX, 0, frame.trim.width - 1);
          const sourceY = frame.trim.y + clamp(offsetY, 0, frame.trim.height - 1);
          const targetX = regionX + offsetX;
          const targetY = regionY + offsetY;
          copyPixel(
            frame.data,
            (sourceY * frame.sourceSize.width + sourceX) * 4,
            target,
            (targetY * layout.width + targetX) * 4,
          );
        }
      }
    }

    packedFrames.push({
      id: frame.id,
      sourcePath: frame.sourcePath,
      sourceFormat: frame.sourceFormat,
      sourceHasAlpha: frame.sourceHasAlpha,
      sourceRgbaSha256: frame.sourceRgbaSha256,
      sourceSize: frame.sourceSize,
      trim: frame.trim,
      empty: frame.empty,
      region: {
        x: regionX,
        y: regionY,
        width: frame.trim.width,
        height: frame.trim.height,
      },
      outer: {
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
      },
      pivot: frame.pivot,
      trimmedPivot: frame.trimmedPivot,
      tags: frame.tags,
    });
  }

  return {
    data: target,
    frames: packedFrames.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function placementFor(
  layout: AtlasLayout,
  id: string,
): PackPlacement | undefined {
  return layout.placements.find((placement) => placement.id === id);
}
