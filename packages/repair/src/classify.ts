import type {
  SpriteFamilyFrameEvidence,
  SpriteFamilyGateResult,
  SpriteLayerEvidence,
} from "@evavo/art-sprite-family";

import type {
  TargetedRepairFailure,
  TargetedRepairStrategy,
} from "./types.js";

function categoryFor(id: string): TargetedRepairFailure["category"] {
  const value = id.toLowerCase();
  if (value.includes("hash") || value.includes("lineage")) {
    return "immutable-source";
  }
  if (value.includes("alpha") || value.includes("halo") || value.includes("matte")) {
    return "alpha";
  }
  if (
    value.includes("bounds") ||
    value.includes("registration") ||
    value.includes("offset") ||
    value.includes("contribution")
  ) {
    return "geometry";
  }
  if (
    value.includes("pivot") ||
    value.includes("baseline") ||
    value.includes("ground-contact") ||
    value.includes("duration") ||
    value.includes("order")
  ) {
    return "metadata";
  }
  if (
    value.includes("parity") ||
    value.includes("composite") ||
    value.includes("occlusion") ||
    value.includes("separate")
  ) {
    return "composition";
  }
  if (
    value.includes("identity") ||
    value.includes("silhouette") ||
    value.includes("visible-area") ||
    value.includes("centroid")
  ) {
    return "identity";
  }
  if (value.includes("palette") || value.includes("luminance") || value.includes("style")) {
    return "style-palette";
  }
  if (
    value.includes("adjacent") ||
    value.includes("loop") ||
    value.includes("duplicate") ||
    value.includes("motion")
  ) {
    return "motion-loop";
  }
  if (value.includes("quality") || value.includes("approved")) {
    return "quality";
  }
  return "unknown";
}

export function strategyForFailure(
  failure: TargetedRepairFailure,
): TargetedRepairStrategy {
  switch (failure.category) {
    case "immutable-source":
    case "quality":
      return "source-replace";
    case "metadata":
      return "metadata-adjustment";
    case "geometry":
      return "layer-transform";
    case "composition":
      return "layer-recompose";
    case "alpha":
      return "alpha-remaster";
    case "identity":
    case "style-palette":
    case "motion-loop":
      return "masked-provider-inpaint";
    default:
      return "manual-review";
  }
}

function blockingFailures(
  frameId: string,
  layerId: string | undefined,
  gates: readonly SpriteFamilyGateResult[],
): readonly TargetedRepairFailure[] {
  return gates
    .filter((gate) => gate.blocking && gate.status === "fail")
    .map((gate) => ({
      frameId,
      ...(layerId === undefined ? {} : { layerId }),
      gate,
      category: categoryFor(gate.id),
    }));
}

export function collectFrameRepairFailures(
  frame: SpriteFamilyFrameEvidence,
  layer: SpriteLayerEvidence | undefined,
  requestedGateIds: readonly string[],
): readonly TargetedRepairFailure[] {
  const all = [
    ...blockingFailures(frame.frameId, undefined, frame.gates),
    ...frame.comparisons.flatMap((comparison) =>
      blockingFailures(frame.frameId, undefined, comparison.gates),
    ),
    ...(layer
      ? blockingFailures(frame.frameId, layer.layerId, layer.gates)
      : []),
  ];
  if (!requestedGateIds.length) return all;
  const requested = new Set(requestedGateIds);
  return all.filter((failure) => requested.has(failure.gate.id));
}

export function orderedStrategies(
  failures: readonly TargetedRepairFailure[],
): readonly TargetedRepairStrategy[] {
  const order: readonly TargetedRepairStrategy[] = [
    "source-replace",
    "metadata-adjustment",
    "layer-transform",
    "layer-recompose",
    "alpha-remaster",
    "masked-provider-inpaint",
    "manual-review",
  ];
  const present = new Set(failures.map(strategyForFailure));
  return order.filter((strategy) => present.has(strategy));
}
