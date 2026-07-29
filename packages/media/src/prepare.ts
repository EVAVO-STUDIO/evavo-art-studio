import { createHash } from "node:crypto";

import {
  SpriteAtlasInputError,
  type DecodedAtlasSourceFrame,
  type PreparedAtlasFrame,
  type Rect,
} from "./types.js";

function rgbaSha256(frame: DecodedAtlasSourceFrame): string {
  return createHash("sha256")
    .update(`${frame.width}x${frame.height}x4\0`)
    .update(frame.data)
    .digest("hex");
}

function visibleBounds(
  frame: DecodedAtlasSourceFrame,
  alphaThreshold: number,
): Readonly<Rect & { empty: boolean }> {
  let minX = frame.width;
  let minY = frame.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      if (frame.data[(y * frame.width + x) * 4 + 3]! < alphaThreshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0 || maxY < 0) {
    if (!frame.allowEmpty) {
      throw new SpriteAtlasInputError(
        "SPRITE_ATLAS_FRAME_EMPTY",
        `${frame.id} contains no pixels at or above alpha ${alphaThreshold}.`,
      );
    }
    return { x: 0, y: 0, width: 1, height: 1, empty: true };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    empty: false,
  };
}

export function prepareAtlasFrame(
  frame: DecodedAtlasSourceFrame,
  trim: boolean,
  alphaThreshold: number,
): PreparedAtlasFrame {
  if (frame.data.length !== frame.width * frame.height * 4) {
    throw new SpriteAtlasInputError(
      "SPRITE_ATLAS_FRAME_DECODE_INVALID",
      `${frame.id} decoded RGBA length does not match its dimensions.`,
    );
  }
  const bounds = trim
    ? visibleBounds(frame, alphaThreshold)
    : {
        x: 0,
        y: 0,
        width: frame.width,
        height: frame.height,
        empty: false,
      };

  return {
    id: frame.id,
    sourcePath: frame.sourcePath,
    sourceFormat: frame.sourceFormat,
    sourceHasAlpha: frame.sourceHasAlpha,
    sourceRgbaSha256: rgbaSha256(frame),
    data: frame.data,
    sourceSize: { width: frame.width, height: frame.height },
    trim: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
    empty: bounds.empty,
    pivot: frame.pivot,
    trimmedPivot: {
      x: frame.pivot.x - bounds.x,
      y: frame.pivot.y - bounds.y,
    },
    tags: frame.tags,
  };
}
