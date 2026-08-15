import type {
  SpriteFrameQualityReport,
  SpriteQualityGateResult,
} from "@evavo/art-quality";

import {
  SPRITE_FINALIZER_PROTOCOL_VERSION,
  type SpriteFinalizationAction,
  type SpriteFinalizationAssessment,
  type SpriteFinalizationDisposition,
  type SpriteFinalizationGateClassification,
} from "./types.js";

const DETERMINISTIC_GATES = new Set([
  "edge-halo",
  "transparent-pixel-colour",
]);
const PROVIDER_GATES = new Set([
  "alpha-channel",
  "fake-transparency",
  "frame-crop",
]);
const BLOCKED_GATES = new Set(["dimensions", "file-format"]);

function actionFor(gate: SpriteQualityGateResult): SpriteFinalizationAction {
  if (gate.id === "transparent-pixel-colour") {
    return {
      kind: "transparent-rgb-normalize",
      gateIds: [gate.id],
      automatic: true,
      description:
        "Normalize fully transparent RGB while retaining bounded subject-colour bleed beside visible edges.",
      preserve: ["visible pixels", "alpha", "canvas", "pivot", "palette"],
    };
  }
  if (gate.id === "edge-halo") {
    return {
      kind: "matte-edge-decontaminate",
      gateIds: [gate.id],
      automatic: true,
      description:
        "Replace matte-like partially transparent edge colour with the nearest approved foreground colour without changing alpha.",
      preserve: ["opaque pixels", "alpha", "canvas", "pivot", "silhouette"],
    };
  }
  if (gate.id === "alpha-channel") {
    return {
      kind: "regenerate-with-real-alpha",
      gateIds: [gate.id],
      automatic: false,
      description:
        "Use verified native alpha or smart border-connected background recovery. A painted transparency grid is removable source evidence, never acceptable delivered alpha.",
      preserve: ["identity", "pose", "camera", "palette", "framing"],
    };
  }
  if (gate.id === "fake-transparency") {
    return {
      kind: "reextract-matte",
      gateIds: [gate.id],
      automatic: false,
      description:
        "Route the immutable source back through smart background recovery. Reconstruct a confidently modelled painted checkerboard or declared matte; regenerate on a low-collision matte only when classification is ambiguous.",
      preserve: ["identity", "pose", "camera", "palette", "framing"],
    };
  }
  if (gate.id === "frame-crop") {
    return {
      kind: "regenerate-with-padding",
      gateIds: [gate.id],
      automatic: false,
      description:
        "Regenerate the bounded frame with the full motion silhouette and declared transparent safety padding.",
      preserve: ["identity", "pose intent", "camera", "palette", "timing"],
    };
  }
  if (gate.id === "dimensions" || gate.id === "file-format") {
    return {
      kind: "reencode-contract-output",
      gateIds: [gate.id],
      automatic: false,
      description:
        "The deterministic pipeline produced an output outside its declared format or geometry contract and must stop for an implementation correction.",
      preserve: ["source master", "all immutable evidence"],
    };
  }
  return {
    kind: "manual-review",
    gateIds: [gate.id],
    automatic: false,
    description:
      "The failure is not covered by a safe deterministic pixel repair and requires bounded review or provider regeneration.",
    preserve: ["source master", "identity", "art direction", "evidence"],
  };
}

export function classifySpriteFinalizationGate(
  gate: SpriteQualityGateResult,
): SpriteFinalizationGateClassification {
  const disposition: Exclude<SpriteFinalizationDisposition, "ready"> =
    DETERMINISTIC_GATES.has(gate.id)
      ? "deterministic-repair"
      : BLOCKED_GATES.has(gate.id)
        ? "blocked"
        : PROVIDER_GATES.has(gate.id)
          ? "provider-repair"
          : "manual-review";
  return { gate, disposition, action: actionFor(gate) };
}

function strongestDisposition(
  values: readonly Exclude<SpriteFinalizationDisposition, "ready">[],
): Exclude<SpriteFinalizationDisposition, "ready"> {
  if (values.includes("blocked")) return "blocked";
  if (values.includes("manual-review")) return "manual-review";
  if (values.includes("provider-repair")) return "provider-repair";
  return "deterministic-repair";
}

export function assessSpriteFinalization(
  report: SpriteFrameQualityReport,
): SpriteFinalizationAssessment {
  const failures = report.gates.filter(
    (gate) => gate.blocking && gate.status === "fail",
  );
  if (!failures.length) {
    return {
      schemaVersion: "1.0",
      protocolVersion: SPRITE_FINALIZER_PROTOCOL_VERSION,
      disposition: "ready",
      passed: true,
      failedBlockingGateIds: [],
      repairableGateIds: [],
      nonRepairableGateIds: [],
      actions: [],
    };
  }
  const classified = failures.map(classifySpriteFinalizationGate);
  const repairableGateIds = classified
    .filter((entry) => entry.disposition === "deterministic-repair")
    .map((entry) => entry.gate.id)
    .sort();
  const nonRepairableGateIds = classified
    .filter((entry) => entry.disposition !== "deterministic-repair")
    .map((entry) => entry.gate.id)
    .sort();
  const actionMap = new Map<string, SpriteFinalizationAction>();
  for (const entry of classified) {
    const key = `${entry.action.kind}:${entry.action.gateIds.join(",")}`;
    if (!actionMap.has(key)) actionMap.set(key, entry.action);
  }
  return {
    schemaVersion: "1.0",
    protocolVersion: SPRITE_FINALIZER_PROTOCOL_VERSION,
    disposition: strongestDisposition(
      classified.map((entry) => entry.disposition),
    ),
    passed: false,
    failedBlockingGateIds: failures.map((entry) => entry.id).sort(),
    repairableGateIds,
    nonRepairableGateIds,
    actions: [...actionMap.values()],
  };
}
