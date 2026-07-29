import { normalizeJson, type JsonValue } from "@evavo/art-artifacts";

import type {
  DeterministicSelectionMetricId,
  SelectionAlignmentEvidence,
} from "./types.js";
import type { SelectionImageFeatures } from "./features.js";

const SQRT_TWO = Math.SQRT2;
const LARGE_DISTANCE = 1_000_000;

export interface RawSelectionMetric {
  readonly score: number;
  readonly evidence: JsonValue;
}

export interface CandidateImageComparison {
  readonly alignment: SelectionAlignmentEvidence;
  readonly metrics: Readonly<Record<DeterministicSelectionMetricId, RawSelectionMetric>>;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function histogramIntersection(
  left: Float64Array,
  right: Float64Array,
): number {
  let total = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    total += Math.min(left[index]!, right[index]!);
  }
  return clamp01(total);
}

function shiftedIntersection(
  candidate: SelectionImageFeatures,
  reference: SelectionImageFeatures,
  offsetX: number,
  offsetY: number,
): number {
  let intersection = 0;
  for (let y = 0; y < candidate.height; y += 1) {
    const targetY = y + offsetY;
    if (targetY < 0 || targetY >= reference.height) continue;
    for (let x = 0; x < candidate.width; x += 1) {
      if (!candidate.visibleMask[y * candidate.width + x]) continue;
      const targetX = x + offsetX;
      if (targetX < 0 || targetX >= reference.width) continue;
      if (reference.visibleMask[targetY * reference.width + targetX]) {
        intersection += 1;
      }
    }
  }
  return intersection;
}

function betterAlignment(
  current: Readonly<{ iou: number; offsetX: number; offsetY: number }> | null,
  candidate: Readonly<{ iou: number; offsetX: number; offsetY: number }>,
): boolean {
  if (!current) return true;
  const epsilon = 1e-12;
  if (candidate.iou > current.iou + epsilon) return true;
  if (Math.abs(candidate.iou - current.iou) > epsilon) return false;
  const candidateDistance = Math.abs(candidate.offsetX) + Math.abs(candidate.offsetY);
  const currentDistance = Math.abs(current.offsetX) + Math.abs(current.offsetY);
  if (candidateDistance !== currentDistance) {
    return candidateDistance < currentDistance;
  }
  if (candidate.offsetY !== current.offsetY) {
    return candidate.offsetY < current.offsetY;
  }
  return candidate.offsetX < current.offsetX;
}

function bestAlignment(
  candidate: SelectionImageFeatures,
  reference: SelectionImageFeatures,
  maximumTranslationPixels: number,
): SelectionAlignmentEvidence {
  let best: Readonly<{
    iou: number;
    offsetX: number;
    offsetY: number;
    intersection: number;
    union: number;
  }> | null = null;
  for (
    let offsetY = -maximumTranslationPixels;
    offsetY <= maximumTranslationPixels;
    offsetY += 1
  ) {
    for (
      let offsetX = -maximumTranslationPixels;
      offsetX <= maximumTranslationPixels;
      offsetX += 1
    ) {
      const intersection = shiftedIntersection(
        candidate,
        reference,
        offsetX,
        offsetY,
      );
      const union =
        candidate.visiblePixels + reference.visiblePixels - intersection;
      const iou = union > 0 ? intersection / union : 0;
      const attempt = { iou, offsetX, offsetY, intersection, union };
      if (betterAlignment(best, attempt)) best = attempt;
    }
  }
  const resolved = best ?? {
    iou: 0,
    offsetX: 0,
    offsetY: 0,
    intersection: 0,
    union: candidate.visiblePixels + reference.visiblePixels,
  };
  return {
    offsetX: resolved.offsetX,
    offsetY: resolved.offsetY,
    translatedPixels: Math.abs(resolved.offsetX) + Math.abs(resolved.offsetY),
    silhouetteIntersection: resolved.intersection,
    silhouetteUnion: resolved.union,
  };
}

function distanceTransform(
  mask: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const distance = new Float32Array(width * height);
  for (let index = 0; index < distance.length; index += 1) {
    distance[index] = mask[index] ? 0 : LARGE_DISTANCE;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      let value = distance[index]!;
      if (x > 0) value = Math.min(value, distance[index - 1]! + 1);
      if (y > 0) value = Math.min(value, distance[index - width]! + 1);
      if (x > 0 && y > 0) {
        value = Math.min(value, distance[index - width - 1]! + SQRT_TWO);
      }
      if (x + 1 < width && y > 0) {
        value = Math.min(value, distance[index - width + 1]! + SQRT_TWO);
      }
      distance[index] = value;
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      let value = distance[index]!;
      if (x + 1 < width) value = Math.min(value, distance[index + 1]! + 1);
      if (y + 1 < height) value = Math.min(value, distance[index + width]! + 1);
      if (x + 1 < width && y + 1 < height) {
        value = Math.min(value, distance[index + width + 1]! + SQRT_TWO);
      }
      if (x > 0 && y + 1 < height) {
        value = Math.min(value, distance[index + width - 1]! + SQRT_TWO);
      }
      distance[index] = value;
    }
  }
  return distance;
}

function symmetricEdgeDistance(
  candidate: SelectionImageFeatures,
  reference: SelectionImageFeatures,
  alignment: SelectionAlignmentEvidence,
  maximumDistance: number,
): Readonly<{
  meanDistance: number;
  candidateToReference: number;
  referenceToCandidate: number;
  comparedEdges: number;
}> {
  const referenceDistance = distanceTransform(
    reference.edgeMask,
    reference.width,
    reference.height,
  );
  const candidateDistance = distanceTransform(
    candidate.edgeMask,
    candidate.width,
    candidate.height,
  );
  let forwardTotal = 0;
  let forwardCount = 0;
  for (let y = 0; y < candidate.height; y += 1) {
    for (let x = 0; x < candidate.width; x += 1) {
      if (!candidate.edgeMask[y * candidate.width + x]) continue;
      const targetX = x + alignment.offsetX;
      const targetY = y + alignment.offsetY;
      forwardTotal +=
        targetX < 0 ||
        targetY < 0 ||
        targetX >= reference.width ||
        targetY >= reference.height
          ? maximumDistance
          : Math.min(
              maximumDistance,
              referenceDistance[targetY * reference.width + targetX]!,
            );
      forwardCount += 1;
    }
  }
  let reverseTotal = 0;
  let reverseCount = 0;
  for (let y = 0; y < reference.height; y += 1) {
    for (let x = 0; x < reference.width; x += 1) {
      if (!reference.edgeMask[y * reference.width + x]) continue;
      const sourceX = x - alignment.offsetX;
      const sourceY = y - alignment.offsetY;
      reverseTotal +=
        sourceX < 0 ||
        sourceY < 0 ||
        sourceX >= candidate.width ||
        sourceY >= candidate.height
          ? maximumDistance
          : Math.min(
              maximumDistance,
              candidateDistance[sourceY * candidate.width + sourceX]!,
            );
      reverseCount += 1;
    }
  }
  const candidateToReference = forwardCount
    ? forwardTotal / forwardCount
    : maximumDistance;
  const referenceToCandidate = reverseCount
    ? reverseTotal / reverseCount
    : maximumDistance;
  return {
    meanDistance: (candidateToReference + referenceToCandidate) / 2,
    candidateToReference,
    referenceToCandidate,
    comparedEdges: forwardCount + reverseCount,
  };
}

function overlapColour(
  candidate: SelectionImageFeatures,
  reference: SelectionImageFeatures,
  alignment: SelectionAlignmentEvidence,
): Readonly<{ similarity: number; comparedPixels: number; meanDistance: number }> {
  let totalDistance = 0;
  let totalWeight = 0;
  let comparedPixels = 0;
  const maximum = Math.sqrt(3 * 255 * 255);
  for (let y = 0; y < candidate.height; y += 1) {
    const targetY = y + alignment.offsetY;
    if (targetY < 0 || targetY >= reference.height) continue;
    for (let x = 0; x < candidate.width; x += 1) {
      const candidatePixel = y * candidate.width + x;
      if (!candidate.visibleMask[candidatePixel]) continue;
      const targetX = x + alignment.offsetX;
      if (targetX < 0 || targetX >= reference.width) continue;
      const referencePixel = targetY * reference.width + targetX;
      if (!reference.visibleMask[referencePixel]) continue;
      const candidateOffset = candidatePixel * 4;
      const referenceOffset = referencePixel * 4;
      const dr = candidate.rgba[candidateOffset]! - reference.rgba[referenceOffset]!;
      const dg =
        candidate.rgba[candidateOffset + 1]! - reference.rgba[referenceOffset + 1]!;
      const db =
        candidate.rgba[candidateOffset + 2]! - reference.rgba[referenceOffset + 2]!;
      const weight =
        Math.min(
          candidate.rgba[candidateOffset + 3]!,
          reference.rgba[referenceOffset + 3]!,
        ) / 255;
      totalDistance += Math.hypot(dr, dg, db) * weight;
      totalWeight += weight;
      comparedPixels += 1;
    }
  }
  const meanDistance = totalWeight > 0 ? totalDistance / totalWeight : maximum;
  return {
    similarity: clamp01(1 - meanDistance / maximum),
    comparedPixels,
    meanDistance,
  };
}

export function compareSelectionImages(
  candidate: SelectionImageFeatures,
  reference: SelectionImageFeatures,
  options: Readonly<{
    maximumTranslationPixels: number;
    maximumEdgeDistancePixels: number;
  }>,
): CandidateImageComparison {
  if (candidate.width !== reference.width || candidate.height !== reference.height) {
    const emptyEvidence = normalizeJson({
      candidate: { width: candidate.width, height: candidate.height },
      reference: { width: reference.width, height: reference.height },
      reason: "dimensions differ",
    });
    const zero = { score: 0, evidence: emptyEvidence };
    return {
      alignment: {
        offsetX: 0,
        offsetY: 0,
        translatedPixels: 0,
        silhouetteIntersection: 0,
        silhouetteUnion: candidate.visiblePixels + reference.visiblePixels,
      },
      metrics: {
        "silhouette-iou": zero,
        "silhouette-dice": zero,
        "edge-similarity": zero,
        "visible-area-similarity": zero,
        "centroid-similarity": zero,
        "bounds-aspect-similarity": zero,
        "palette-similarity": zero,
        "luminance-similarity": zero,
        "edge-orientation-similarity": zero,
        "overlap-colour-similarity": zero,
      },
    };
  }

  const alignment = bestAlignment(
    candidate,
    reference,
    options.maximumTranslationPixels,
  );
  const silhouetteIou = alignment.silhouetteUnion
    ? alignment.silhouetteIntersection / alignment.silhouetteUnion
    : 0;
  const silhouetteDice =
    candidate.visiblePixels + reference.visiblePixels > 0
      ? (2 * alignment.silhouetteIntersection) /
        (candidate.visiblePixels + reference.visiblePixels)
      : 0;
  const edgeDistance = symmetricEdgeDistance(
    candidate,
    reference,
    alignment,
    options.maximumEdgeDistancePixels,
  );
  const edgeSimilarity = clamp01(
    1 - edgeDistance.meanDistance / options.maximumEdgeDistancePixels,
  );
  const visibleAreaSimilarity =
    Math.min(candidate.visiblePixels, reference.visiblePixels) /
    Math.max(candidate.visiblePixels, reference.visiblePixels);
  const alignedCentroid = {
    x: candidate.centroid.x + alignment.offsetX,
    y: candidate.centroid.y + alignment.offsetY,
  };
  const centroidDistance = Math.hypot(
    alignedCentroid.x - reference.centroid.x,
    alignedCentroid.y - reference.centroid.y,
  );
  const centroidTolerance = Math.max(
    1,
    options.maximumTranslationPixels +
      Math.hypot(reference.width, reference.height) * 0.08,
  );
  const centroidSimilarity = clamp01(1 - centroidDistance / centroidTolerance);
  const candidateAspect = candidate.bounds.width / candidate.bounds.height;
  const referenceAspect = reference.bounds.width / reference.bounds.height;
  const boundsAspectSimilarity = clamp01(
    Math.exp(-Math.abs(Math.log(candidateAspect / referenceAspect))),
  );
  const paletteSimilarity = histogramIntersection(
    candidate.paletteHistogram,
    reference.paletteHistogram,
  );
  const luminanceSimilarity = histogramIntersection(
    candidate.luminanceHistogram,
    reference.luminanceHistogram,
  );
  const edgeOrientationSimilarity = histogramIntersection(
    candidate.edgeOrientationHistogram,
    reference.edgeOrientationHistogram,
  );
  const overlap = overlapColour(candidate, reference, alignment);

  return {
    alignment,
    metrics: {
      "silhouette-iou": {
        score: clamp01(silhouetteIou),
        evidence: normalizeJson({
          intersection: alignment.silhouetteIntersection,
          union: alignment.silhouetteUnion,
          offsetX: alignment.offsetX,
          offsetY: alignment.offsetY,
        }),
      },
      "silhouette-dice": {
        score: clamp01(silhouetteDice),
        evidence: normalizeJson({
          intersection: alignment.silhouetteIntersection,
          candidateVisiblePixels: candidate.visiblePixels,
          referenceVisiblePixels: reference.visiblePixels,
        }),
      },
      "edge-similarity": {
        score: edgeSimilarity,
        evidence: normalizeJson(edgeDistance),
      },
      "visible-area-similarity": {
        score: clamp01(visibleAreaSimilarity),
        evidence: normalizeJson({
          candidateVisiblePixels: candidate.visiblePixels,
          referenceVisiblePixels: reference.visiblePixels,
          candidateAlphaWeight: candidate.alphaWeight,
          referenceAlphaWeight: reference.alphaWeight,
        }),
      },
      "centroid-similarity": {
        score: centroidSimilarity,
        evidence: normalizeJson({
          candidateCentroid: candidate.centroid,
          alignedCandidateCentroid: alignedCentroid,
          referenceCentroid: reference.centroid,
          distancePixels: centroidDistance,
          tolerancePixels: centroidTolerance,
        }),
      },
      "bounds-aspect-similarity": {
        score: boundsAspectSimilarity,
        evidence: normalizeJson({
          candidateBounds: candidate.bounds,
          referenceBounds: reference.bounds,
          candidateAspect,
          referenceAspect,
        }),
      },
      "palette-similarity": {
        score: paletteSimilarity,
        evidence: normalizeJson({ histogramBins: candidate.paletteHistogram.length }),
      },
      "luminance-similarity": {
        score: luminanceSimilarity,
        evidence: normalizeJson({ histogramBins: candidate.luminanceHistogram.length }),
      },
      "edge-orientation-similarity": {
        score: edgeOrientationSimilarity,
        evidence: normalizeJson({
          histogramBins: candidate.edgeOrientationHistogram.length,
        }),
      },
      "overlap-colour-similarity": {
        score: overlap.similarity,
        evidence: normalizeJson({
          comparedPixels: overlap.comparedPixels,
          meanRgbDistance: overlap.meanDistance,
        }),
      },
    },
  };
}
