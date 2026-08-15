import { clamp01, colourDistance, nearestColourDistance, quantizedColourKey } from "./math.js";
import type { DecodedSpriteFrame, NormalizedSpriteFrameQualityExpectations, RgbaColour, SpriteAlphaEvidence, SpriteFakeTransparencyEvidence } from "./types.js";
import { colourAt } from "./frame-shared.js";

interface ColourBucket {
  count: number;
  red: number;
  green: number;
  blue: number;
}

function dominantColours(
  frame: DecodedSpriteFrame,
  indices: readonly number[],
  limit: number,
): readonly Readonly<{ colour: RgbaColour; fraction: number }>[] {
  const buckets = new Map<string, ColourBucket>();
  for (const index of indices) {
    const offset = index * 4;
    const red = frame.data[offset]!;
    const green = frame.data[offset + 1]!;
    const blue = frame.data[offset + 2]!;
    const key = quantizedColourKey(red, green, blue);
    const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
    bucket.count += 1;
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    buckets.set(key, bucket);
  }
  const denominator = Math.max(1, indices.length);
  return [...buckets.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, limit)
    .map((entry) => ({
      colour: {
        r: Math.round(entry.red / entry.count),
        g: Math.round(entry.green / entry.count),
        b: Math.round(entry.blue / entry.count),
      },
      fraction: entry.count / denominator,
    }));
}

function borderIndices(width: number, height: number): number[] {
  const result: number[] = [];
  if (width === 1 || height === 1) {
    for (let index = 0; index < width * height; index += 1) result.push(index);
    return result;
  }
  for (let x = 0; x < width; x += 1) {
    result.push(x, (height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    result.push(y * width, y * width + width - 1);
  }
  return result;
}

function nearestOfTwo(colour: RgbaColour, colours: readonly RgbaColour[]): number {
  const left = colourDistance(colour, colours[0]!);
  const right = colourDistance(colour, colours[1]!);
  return left <= right ? 0 : 1;
}

function checkerboardEvidence(
  frame: DecodedSpriteFrame,
  topColours: readonly Readonly<{ colour: RgbaColour; fraction: number }>[],
): Readonly<{
  detected: boolean;
  confidence: number;
  tileSize: number | null;
  colours: readonly RgbaColour[];
}> {
  if (topColours.length < 2) {
    return { detected: false, confidence: 0, tileSize: null, colours: [] };
  }
  const colours = [topColours[0]!.colour, topColours[1]!.colour] as const;
  const coverage = topColours[0]!.fraction + topColours[1]!.fraction;
  if (coverage < 0.55 || colourDistance(colours[0], colours[1]) < 24) {
    return { detected: false, confidence: 0, tileSize: null, colours };
  }

  const maximumTile = Math.max(2, Math.floor(Math.min(frame.width, frame.height) / 2));
  const candidates = [2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 48, 64, 96, 128].filter(
    (entry) => entry <= maximumTile,
  );
  const sampleStride = Math.max(1, Math.floor(Math.sqrt((frame.width * frame.height) / 4096)));
  let bestConfidence = 0;
  let bestTile: number | null = null;

  for (const tile of candidates) {
    const offsets = [...new Set([0, Math.floor(tile / 4), Math.floor(tile / 2), Math.floor((3 * tile) / 4)])];
    for (const offsetX of offsets) {
      for (const offsetY of offsets) {
        let considered = 0;
        let matchesNormal = 0;
        let matchesFlipped = 0;
        for (let y = 0; y < frame.height; y += sampleStride) {
          for (let x = 0; x < frame.width; x += sampleStride) {
            const colour = colourAt(frame, x, y);
            const nearest = nearestOfTwo(colour, colours);
            const nearestDistance = colourDistance(colour, colours[nearest]!);
            if (nearestDistance > 56) continue;
            const parity =
              (Math.floor((x + offsetX) / tile) + Math.floor((y + offsetY) / tile)) % 2;
            considered += 1;
            if (nearest === parity) matchesNormal += 1;
            if (nearest === 1 - parity) matchesFlipped += 1;
          }
        }
        if (considered < 32) continue;
        const pattern = Math.max(matchesNormal, matchesFlipped) / considered;
        const confidence = pattern * (0.65 + 0.35 * coverage);
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestTile = tile;
        }
      }
    }
  }

  return {
    detected: bestTile !== null,
    confidence: Number(clamp01(bestConfidence).toFixed(6)),
    tileSize: bestTile,
    colours,
  };
}

export function fakeTransparencyEvidence(
  frame: DecodedSpriteFrame,
  expectations: NormalizedSpriteFrameQualityExpectations,
  alpha: SpriteAlphaEvidence,
): SpriteFakeTransparencyEvidence {
  const border = borderIndices(frame.width, frame.height);
  const borderColours = dominantColours(frame, border, 2);
  const dominant = borderColours[0] ?? null;
  const nearestMatteDistance = dominant
    ? nearestColourDistance(dominant.colour, expectations.knownMatteColours)
    : null;
  const opaqueLike = alpha.transparentFraction < 0.2;
  const matteConfidence = dominant
    ? dominant.fraction * (nearestMatteDistance === null ? 0 : clamp01(1 - nearestMatteDistance / 96))
    : 0;
  const flatMatteDetected =
    expectations.transparency !== "opaque" &&
    opaqueLike &&
    dominant !== null &&
    dominant.fraction >= expectations.flatMatteBorderThreshold &&
    (nearestMatteDistance ?? Number.POSITIVE_INFINITY) <= 48;

  const allIndices = Array.from({ length: frame.width * frame.height }, (_, index) => index);
  const overallColours = dominantColours(frame, allIndices, 2);
  const checkerboard =
    expectations.transparency === "opaque" || !opaqueLike
      ? { detected: false, confidence: 0, tileSize: null, colours: [] as readonly RgbaColour[] }
      : checkerboardEvidence(frame, overallColours);

  return {
    flatMatteDetected,
    flatMatteConfidence: Number(clamp01(matteConfidence).toFixed(6)),
    dominantBorderColour: dominant?.colour ?? null,
    dominantBorderFraction: Number((dominant?.fraction ?? 0).toFixed(6)),
    nearestKnownMatteDistance:
      nearestMatteDistance === null ? null : Number(nearestMatteDistance.toFixed(4)),
    checkerboardDetected:
      checkerboard.detected &&
      checkerboard.confidence >= expectations.checkerboardConfidenceThreshold,
    checkerboardConfidence: checkerboard.confidence,
    checkerboardTileSize: checkerboard.tileSize,
    checkerboardColours: checkerboard.colours,
  };
}

