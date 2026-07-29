import type { DecodedSpriteFrame, SpriteAlphaEvidence, SpriteVisibleBoundsEvidence } from "./types.js";
import { pixelOffset } from "./frame-shared.js";

export function alphaEvidence(
  frame: DecodedSpriteFrame,
  visibleThreshold: number,
): SpriteAlphaEvidence {
  let transparentPixels = 0;
  let partialPixels = 0;
  let opaquePixels = 0;
  let minimumAlpha = 255;
  let maximumAlpha = 0;
  const pixels = frame.width * frame.height;

  for (let offset = 3; offset < frame.data.length; offset += 4) {
    const alpha = frame.data[offset]!;
    minimumAlpha = Math.min(minimumAlpha, alpha);
    maximumAlpha = Math.max(maximumAlpha, alpha);
    if (alpha < visibleThreshold) transparentPixels += 1;
    else if (alpha < 255) partialPixels += 1;
    else opaquePixels += 1;
  }

  return {
    transparentPixels,
    partialPixels,
    opaquePixels,
    transparentFraction: transparentPixels / pixels,
    partialFraction: partialPixels / pixels,
    opaqueFraction: opaquePixels / pixels,
    minimumAlpha,
    maximumAlpha,
  };
}

export function visibleBounds(
  frame: DecodedSpriteFrame,
  visibleThreshold: number,
): SpriteVisibleBoundsEvidence {
  let minX = frame.width;
  let minY = frame.height;
  let maxX = -1;
  let maxY = -1;
  let visiblePixels = 0;
  let weightedX = 0;
  let weightedY = 0;
  let totalWeight = 0;

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const alpha = frame.data[pixelOffset(frame.width, x, y) + 3]!;
      if (alpha < visibleThreshold) continue;
      visiblePixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      weightedX += x * alpha;
      weightedY += y * alpha;
      totalWeight += alpha;
    }
  }

  if (visiblePixels === 0) {
    return {
      visiblePixels: 0,
      visibleFraction: 0,
      minX: null,
      minY: null,
      maxX: null,
      maxY: null,
      width: 0,
      height: 0,
      clearance: {
        left: frame.width,
        top: frame.height,
        right: frame.width,
        bottom: frame.height,
      },
      centroid: null,
      touchingSides: [],
    };
  }

  const clearance = {
    left: minX,
    top: minY,
    right: frame.width - 1 - maxX,
    bottom: frame.height - 1 - maxY,
  };
  const touchingSides: Array<"left" | "top" | "right" | "bottom"> = [];
  if (clearance.left === 0) touchingSides.push("left");
  if (clearance.top === 0) touchingSides.push("top");
  if (clearance.right === 0) touchingSides.push("right");
  if (clearance.bottom === 0) touchingSides.push("bottom");

  return {
    visiblePixels,
    visibleFraction: visiblePixels / (frame.width * frame.height),
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    clearance,
    centroid: {
      x: Number((weightedX / totalWeight).toFixed(4)),
      y: Number((weightedY / totalWeight).toFixed(4)),
    },
    touchingSides,
  };
}

