import { clamp01, colourDistance, nearestColourDistance, quantizedColourKey } from "./math.js";
import type { DecodedSpriteFrame, NormalizedSpriteFrameQualityExpectations, RgbaColour, SpriteAlphaEvidence, SpriteFakeTransparencyEvidence } from "./types.js";

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

interface CheckerSample extends RgbaColour {
  readonly x: number;
  readonly y: number;
}

interface CheckerFit {
  readonly tileSize: number;
  readonly colours: readonly [RgbaColour, RgbaColour];
  readonly separation: number;
  readonly fitFraction: number;
  readonly coverageFraction: number;
  readonly rmse: number;
  readonly score: number;
}

const CHECKER_TILE_SIZES = Object.freeze([
  2, 3, 4, 6, 8, 10, 12, 16, 20, 22, 23, 24, 26, 28, 32, 48, 64, 96, 128,
]);

function checkerSamples(frame: DecodedSpriteFrame): Readonly<{
  samples: readonly CheckerSample[];
  visibleFraction: number;
  opaqueFraction: number;
  lowChromaFraction: number;
}> {
  const band = Math.max(8, Math.floor(Math.min(frame.width, frame.height) * 0.16));
  const bandPixels =
    frame.width * frame.height -
    Math.max(0, frame.width - band * 2) *
      Math.max(0, frame.height - band * 2);
  const stride = Math.max(1, Math.ceil(Math.sqrt(bandPixels / 40_000)));
  const samples: CheckerSample[] = [];
  let sampled = 0;
  let visible = 0;
  let opaque = 0;
  let lowChroma = 0;
  for (let y = 0; y < frame.height; y += stride) {
    for (let x = 0; x < frame.width; x += stride) {
      if (
        x >= band &&
        x < frame.width - band &&
        y >= band &&
        y < frame.height - band
      ) {
        continue;
      }
      sampled += 1;
      const offset = (y * frame.width + x) * 4;
      const alpha = frame.data[offset + 3]!;
      if (alpha < 32) continue;
      const red = frame.data[offset]!;
      const green = frame.data[offset + 1]!;
      const blue = frame.data[offset + 2]!;
      visible += 1;
      if (alpha >= 254) opaque += 1;
      if (Math.max(red, green, blue) - Math.min(red, green, blue) <= 32) {
        lowChroma += 1;
      }
      samples.push({ x, y, r: red, g: green, b: blue });
    }
  }
  return {
    samples,
    visibleFraction: sampled ? visible / sampled : 0,
    opaqueFraction: sampled ? opaque / sampled : 0,
    lowChromaFraction: visible ? lowChroma / visible : 0,
  };
}

function fitCheckerboard(
  samples: readonly CheckerSample[],
  tileSize: number,
  phaseX: number,
  phaseY: number,
): CheckerFit | null {
  const bins = [new Map<number, ColourBucket>(), new Map<number, ColourBucket>()];
  for (const sample of samples) {
    const parity =
      (Math.floor((sample.x + phaseX) / tileSize) +
        Math.floor((sample.y + phaseY) / tileSize)) &
      1;
    const key =
      (Math.floor(sample.r / 8) << 10) |
      (Math.floor(sample.g / 8) << 5) |
      Math.floor(sample.b / 8);
    const bucket = bins[parity]!.get(key) ?? {
      count: 0,
      red: 0,
      green: 0,
      blue: 0,
    };
    bucket.count += 1;
    bucket.red += sample.r;
    bucket.green += sample.g;
    bucket.blue += sample.b;
    bins[parity]!.set(key, bucket);
  }
  const dominant = bins.map((entries) => {
    let best: ColourBucket | null = null;
    for (const entry of entries.values()) {
      if (!best || entry.count > best.count) best = entry;
    }
    return best;
  });
  if (!dominant[0] || !dominant[1] || dominant[0].count < 16 || dominant[1].count < 16) {
    return null;
  }
  const colours = dominant.map((entry) => ({
    r: entry!.red / entry!.count,
    g: entry!.green / entry!.count,
    b: entry!.blue / entry!.count,
  })) as [RgbaColour, RgbaColour];
  const separation = colourDistance(colours[0], colours[1]);
  const fitDistance = Math.max(14, separation * 0.28);
  let fitted = 0;
  let eligible = 0;
  let fittedSquaredError = 0;
  for (const sample of samples) {
    const parity =
      (Math.floor((sample.x + phaseX) / tileSize) +
        Math.floor((sample.y + phaseY) / tileSize)) &
      1;
    const expectedDistance = colourDistance(sample, colours[parity]!);
    const alternateDistance = colourDistance(sample, colours[parity ^ 1]!);
    if (Math.min(expectedDistance, alternateDistance) <= fitDistance) eligible += 1;
    if (expectedDistance <= fitDistance && expectedDistance <= alternateDistance) {
      fitted += 1;
      fittedSquaredError += expectedDistance * expectedDistance;
    }
  }
  const fitFraction = fitted / Math.max(1, eligible);
  const coverageFraction = eligible / Math.max(1, samples.length);
  const rmse = Math.sqrt(fittedSquaredError / Math.max(1, fitted));
  return {
    tileSize,
    colours,
    separation,
    fitFraction,
    coverageFraction,
    rmse,
    score:
      (fitFraction * separation * Math.sqrt(coverageFraction)) /
      Math.max(1, rmse),
  };
}

function checkerboardEvidence(frame: DecodedSpriteFrame): Readonly<{
  detected: boolean;
  confidence: number;
  tileSize: number | null;
  colours: readonly RgbaColour[];
  fitFraction: number | null;
  coverageFraction: number | null;
  rmse: number | null;
}> {
  const sampleSet = checkerSamples(frame);
  let best: CheckerFit | null = null;
  for (const tile of CHECKER_TILE_SIZES) {
    if (frame.width / tile < 4 || frame.height / tile < 4) continue;
    const offsets = [...new Set([0, Math.floor(tile / 4), Math.floor(tile / 2), Math.floor((3 * tile) / 4)])];
    for (const offsetX of offsets) {
      for (const offsetY of offsets) {
        const fit = fitCheckerboard(sampleSet.samples, tile, offsetX, offsetY);
        if (fit && (!best || fit.score > best.score)) best = fit;
      }
    }
  }
  const neutralGrid = Boolean(
    best &&
      sampleSet.lowChromaFraction >= 0.78 &&
      ((best.separation >= 18 &&
        best.rmse <= 18 &&
        best.fitFraction >= 0.88 &&
        best.coverageFraction >= 0.3) ||
        (best.separation >= 10 &&
          best.rmse <= 4 &&
          best.fitFraction >= 0.82 &&
          best.coverageFraction >= 0.5 &&
          frame.width / best.tileSize >= 8 &&
          frame.height / best.tileSize >= 8)),
  );
  const chromaticGrid = Boolean(
    best &&
      best.separation >= 32 &&
      best.rmse <= 12 &&
      best.fitFraction >= 0.92 &&
      best.coverageFraction >= 0.3,
  );
  const detected = Boolean(
    best &&
      (sampleSet.opaqueFraction >= 0.25 ||
        sampleSet.visibleFraction >= 0.7) &&
      (neutralGrid || chromaticGrid),
  );
  const confidence = detected && best
    ? Math.max(
        0.86,
        Math.min(
          1,
          best.fitFraction *
            Math.min(1, 8 / Math.max(1, best.rmse)) *
            (0.9 + 0.1 * Math.sqrt(best.coverageFraction)),
        ),
      )
    : 0;
  return {
    detected,
    confidence: Number(clamp01(confidence).toFixed(6)),
    tileSize: detected && best ? best.tileSize : null,
    colours: detected && best
      ? best.colours.map((colour) => ({
          r: Math.round(colour.r),
          g: Math.round(colour.g),
          b: Math.round(colour.b),
        }))
      : [],
    fitFraction: detected && best ? Number(best.fitFraction.toFixed(6)) : null,
    coverageFraction:
      detected && best ? Number(best.coverageFraction.toFixed(6)) : null,
    rmse: detected && best ? Number(best.rmse.toFixed(4)) : null,
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

  const checkerboard =
    expectations.transparency === "opaque" || !opaqueLike
      ? {
          detected: false,
          confidence: 0,
          tileSize: null,
          colours: [] as readonly RgbaColour[],
          fitFraction: null,
          coverageFraction: null,
          rmse: null,
        }
      : checkerboardEvidence(frame);

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
    checkerboardFitFraction: checkerboard.fitFraction,
    checkerboardCoverageFraction: checkerboard.coverageFraction,
    checkerboardRmse: checkerboard.rmse,
  };
}
