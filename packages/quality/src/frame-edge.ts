import { colourDistance, nearestColourDistance } from "./math.js";
import type { DecodedSpriteFrame, NormalizedSpriteFrameQualityExpectations, RgbaColour, SpriteHaloEvidence, SpriteTransparentRgbEvidence } from "./types.js";
import { colourAt } from "./frame-shared.js";

function nearestOpaqueNeighbour(
  frame: DecodedSpriteFrame,
  x: number,
  y: number,
  radius: number,
): RgbaColour | null {
  let best: RgbaColour | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= frame.width || ny >= frame.height) continue;
      const neighbour = colourAt(frame, nx, ny);
      if ((neighbour.a ?? 0) < 250) continue;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        best = neighbour;
        bestDistance = distance;
      }
    }
  }
  return best;
}

export function haloEvidence(
  frame: DecodedSpriteFrame,
  expectations: NormalizedSpriteFrameQualityExpectations,
): SpriteHaloEvidence {
  let partialPixelsInspected = 0;
  let haloPixels = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const colour = colourAt(frame, x, y);
      const alpha = colour.a ?? 255;
      if (alpha <= 0 || alpha >= 250) continue;
      const neighbour = nearestOpaqueNeighbour(frame, x, y, 2);
      if (!neighbour) continue;
      partialPixelsInspected += 1;
      const matteDistance = nearestColourDistance(colour, expectations.knownMatteColours);
      const subjectDistance = colourDistance(colour, neighbour);
      if (matteDistance <= 52 && subjectDistance >= 52) haloPixels += 1;
    }
  }
  return {
    partialPixelsInspected,
    haloPixels,
    haloFraction:
      partialPixelsInspected === 0
        ? 0
        : Number((haloPixels / partialPixelsInspected).toFixed(6)),
  };
}

export function transparentRgbEvidence(frame: DecodedSpriteFrame): SpriteTransparentRgbEvidence {
  let transparentPixelsInspected = 0;
  let nonZeroTransparentPixels = 0;
  let intentionalBleedPixels = 0;
  let unexpectedPixels = 0;

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const colour = colourAt(frame, x, y);
      if ((colour.a ?? 255) !== 0) continue;
      transparentPixelsInspected += 1;
      if (colour.r === 0 && colour.g === 0 && colour.b === 0) continue;
      nonZeroTransparentPixels += 1;
      const neighbour = nearestOpaqueNeighbour(frame, x, y, 2);
      if (neighbour && colourDistance(colour, neighbour) <= 52) intentionalBleedPixels += 1;
      else unexpectedPixels += 1;
    }
  }

  return {
    transparentPixelsInspected,
    nonZeroTransparentPixels,
    intentionalBleedPixels,
    unexpectedPixels,
    unexpectedFraction:
      transparentPixelsInspected === 0
        ? 0
        : Number((unexpectedPixels / transparentPixelsInspected).toFixed(6)),
  };
}

