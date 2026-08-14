import { fail } from "./layered-production-internal.js";
import type { CompiledLayeredProductionUnit } from "./layered-production-types.js";
import type {
  ArtProductionMetricEvidence,
  ArtProductionMetricId,
  CompiledArtProductionProfile,
} from "./art-production-orchestrator-types.js";

export function weightedScore(
  metrics: readonly ArtProductionMetricEvidence[],
  profile: CompiledArtProductionProfile,
): number {
  let numerator = 0;
  let denominator = 0;
  for (const metric of metrics) {
    const weight = profile.iteration.metricWeights[metric.metricId];
    numerator += metric.score * weight;
    denominator += weight;
  }
  if (denominator <= 0) {
    fail(
      "ART_PRODUCTION_PROFILE_INVALID",
      "Required production metrics have no positive configured weight.",
    );
  }
  return Number((numerator / denominator).toFixed(4));
}

export function metricMinimum(
  metricId: ArtProductionMetricId,
  profile: CompiledArtProductionProfile,
): number {
  if (metricId === "identity-consistency") {
    return profile.animation.identityMetricMinimum;
  }
  if (metricId === "pivot-stability") {
    return profile.animation.pivotMetricMinimum;
  }
  if (metricId === "ground-contact-stability") {
    return profile.animation.groundContactMetricMinimum;
  }
  return profile.iteration.minimumMetricScore;
}

export function retryPrompt(
  unit: CompiledLayeredProductionUnit,
  attemptNumber: number,
  directives: readonly string[],
): string {
  return [
    unit.providerJob.prompt,
    "ITERATIVE REPAIR PASS — preserve every approved lock and correct only the measured failures below.",
    `Repair attempt ${attemptNumber + 1}. Return exactly one corrected ${unit.dimensions.width}x${unit.dimensions.height} native PNG for ${unit.id}.`,
    `Keep alpha policy ${unit.alpha}, continuity key ${unit.continuityKey}, layer ${unit.layerRole}, fixed camera, palette, pivot and ground contact unchanged unless a listed repair explicitly restores one of those locks.`,
    ...directives.map((directive, index) => `${index + 1}. ${directive}`),
    "Do not return SVG, vector art, a wordmark, a concept sheet, a sprite sheet, a collage, alternates, labels, generated readable text or an approved/final claim.",
  ].join("\n\n");
}
