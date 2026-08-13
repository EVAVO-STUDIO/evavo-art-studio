import type {
  LayeredProductionAlphaPolicy,
  LayeredProductionLayerRole,
  LayeredProductionRequestInput,
} from "./layered-production-types.js";
import type { RoleRecipe } from "./jonez-source-art-recipes.js";
import {
  JONEZ_CANONICAL_STYLE_ID,
  JONEZ_SOURCE_ART_CALIBRATION_KIND,
  JONEZ_SOURCE_ART_CALIBRATION_PROTOCOL_VERSION,
  JonezSourceArtCalibrationError,
  assertCanonicalRequest,
  assertUnitLock,
  fail,
  jonezSourceArtCalibrationSha256,
  locateUnit,
  promptAddendum,
} from "./jonez-source-art-calibration-internal.js";
import {
  CANONICAL_PROOF_UNITS,
  COMMON_NEGATIVE_TERMS,
  ROLE_RECIPES,
} from "./jonez-source-art-recipes.js";

export {
  JONEZ_CANONICAL_STYLE_ID,
  JONEZ_SOURCE_ART_CALIBRATION_KIND,
  JONEZ_SOURCE_ART_CALIBRATION_PROTOCOL_VERSION,
  JonezSourceArtCalibrationError,
  jonezSourceArtCalibrationSha256,
} from "./jonez-source-art-calibration-internal.js";

export interface CompiledJonezSourceArtCalibration {
  readonly schemaVersion: "1.0";
  readonly kind: typeof JONEZ_SOURCE_ART_CALIBRATION_KIND;
  readonly protocolVersion: typeof JONEZ_SOURCE_ART_CALIBRATION_PROTOCOL_VERSION;
  readonly planId: string;
  readonly revision: string;
  readonly styleId: typeof JONEZ_CANONICAL_STYLE_ID;
  readonly unitId: string;
  readonly proofUnit: boolean;
  readonly layer: Readonly<{
    readonly id: string;
    readonly role: LayeredProductionLayerRole;
    readonly alpha: LayeredProductionAlphaPolicy;
    readonly include: readonly string[];
    readonly exclude: readonly string[];
  }>;
  readonly target: Readonly<{
    readonly width: number;
    readonly height: number;
    readonly oneImage: 1;
    readonly outputFormat: "png";
    readonly filtering: "nearest";
  }>;
  readonly drawing: RoleRecipe;
  readonly authorshipPasses: readonly string[];
  readonly provider: Readonly<{
    readonly promptAddendum: string;
    readonly negativeTerms: readonly string[];
  }>;
  readonly review: Readonly<{
    readonly minimumScore: 92;
    readonly scoring: readonly Readonly<{
      readonly id: string;
      readonly weight: number;
      readonly minimum: number;
    }>[];
    readonly evidenceViews: readonly string[];
    readonly blockingFailures: readonly string[];
  }>;
  readonly originality: Readonly<{
    readonly originalEvavoDesignRequired: true;
    readonly namedStyleImitationAllowed: false;
    readonly copyrightedCharacterReconstructionAllowed: false;
    readonly compositionInfluenceOnly: readonly string[];
  }>;
  readonly authority: Readonly<{
    readonly planningOnly: true;
    readonly providerExecution: false;
    readonly creativeApproval: false;
    readonly imageMutation: false;
    readonly assembly: false;
    readonly targetRepositoryMutation: false;
  }>;
  readonly calibrationSha256: string;
}

export function compileJonezSourceArtCalibration(
  request: LayeredProductionRequestInput,
  unitId: string,
): CompiledJonezSourceArtCalibration {
  assertCanonicalRequest(request);
  const { layer, unit } = locateUnit(request, unitId);
  const recipe = ROLE_RECIPES[layer.role];
  if (!recipe) fail("ROLE_UNSUPPORTED", `JONEZ source role ${layer.role} has no calibrated drawing grammar.`);
  assertUnitLock(unit.id, layer.role, unit.kind, layer.alpha, unit.dimensions.width, unit.dimensions.height);
  const payload = {
    schemaVersion: "1.0" as const,
    kind: JONEZ_SOURCE_ART_CALIBRATION_KIND,
    protocolVersion: JONEZ_SOURCE_ART_CALIBRATION_PROTOCOL_VERSION,
    planId: request.planId,
    revision: request.revision,
    styleId: JONEZ_CANONICAL_STYLE_ID,
    unitId: unit.id,
    proofUnit: request.styleProof.unitIds.includes(unit.id),
    layer: {
      id: layer.id,
      role: layer.role,
      alpha: layer.alpha,
      include: [...layer.include, ...unit.include],
      exclude: [...layer.exclude, ...unit.exclude],
    },
    target: {
      width: unit.dimensions.width,
      height: unit.dimensions.height,
      oneImage: 1 as const,
      outputFormat: "png" as const,
      filtering: "nearest" as const,
    },
    drawing: recipe,
    authorshipPasses: [
      "block one readable silhouette using connected masses only",
      "reduce the design to four or five value groups before hue",
      "assign only canonical palette ramps to declared materials",
      "replace smooth or noisy marks with deliberate connected clusters",
      "add selective contours, focal accents and authored asymmetry",
      "inspect at 1x and 8x nearest, then remove every non-functional pixel",
    ],
    provider: {
      promptAddendum: promptAddendum(unit.id, layer.role, recipe),
      negativeTerms: [...COMMON_NEGATIVE_TERMS, ...recipe.blockingFailures],
    },
    review: {
      minimumScore: 92 as const,
      scoring: [
        { id: "layer-purity", weight: 20, minimum: 20 },
        { id: "native-silhouette-readability", weight: 15, minimum: 13 },
        { id: "canonical-palette-discipline", weight: 15, minimum: 13 },
        { id: "connected-pixel-cluster-quality", weight: 15, minimum: 13 },
        { id: "1991-vga-authenticity", weight: 15, minimum: 13 },
        { id: "jonez-project-distinctiveness", weight: 10, minimum: 9 },
        { id: "runtime-usability-and-alpha", weight: 10, minimum: 10 },
      ],
      evidenceViews: [
        "1x native isolated source",
        "8x nearest-neighbour cluster inspection",
        layer.alpha === "opaque"
          ? "complete opaque coverage proof"
          : "black white and checkerboard alpha proof",
        "canonical palette index and local-colour count report",
        "edge-map proof with antialias and fringe detection",
        "composite against approved lower layers only",
      ],
      blockingFailures: [
        ...recipe.blockingFailures,
        "any layer contamination or more than one asset appears",
        "any antialiasing, soft gradient, bloom, procedural noise or hidden matte RGB appears",
        "any copyrighted character, costume, building, UI or logo is reconstructed",
        "the exact native dimensions, alpha policy, pivot or continuity contract is broken",
      ],
    },
    originality: {
      originalEvavoDesignRequired: true as const,
      namedStyleImitationAllowed: false as const,
      copyrightedCharacterReconstructionAllowed: false as const,
      compositionInfluenceOnly: [
        "crowded visual discovery and recurring background micro-stories",
        "readable life-sim destinations and logical route movement",
        "early-1990s VGA technical constraints and native-scale discipline",
      ],
    },
    authority: {
      planningOnly: true as const,
      providerExecution: false as const,
      creativeApproval: false as const,
      imageMutation: false as const,
      assembly: false as const,
      targetRepositoryMutation: false as const,
    },
  };
  return Object.freeze({
    ...payload,
    calibrationSha256: jonezSourceArtCalibrationSha256(payload),
  });
}

export function projectSourceArtCalibration(
  request: LayeredProductionRequestInput,
  unitId: string,
): CompiledJonezSourceArtCalibration | undefined {
  if (request.project.gameId !== "jonez") return undefined;
  return compileJonezSourceArtCalibration(request, unitId);
}

export function verifyJonezSourceArtCalibration(
  value: CompiledJonezSourceArtCalibration,
): true {
  if (
    value.schemaVersion !== "1.0" ||
    value.kind !== JONEZ_SOURCE_ART_CALIBRATION_KIND ||
    value.protocolVersion !== JONEZ_SOURCE_ART_CALIBRATION_PROTOCOL_VERSION ||
    value.styleId !== JONEZ_CANONICAL_STYLE_ID
  ) fail("CALIBRATION_INVALID", "JONEZ calibration identity is invalid.");
  const { calibrationSha256, ...payload } = value;
  if (!/^[0-9a-f]{64}$/u.test(calibrationSha256) || jonezSourceArtCalibrationSha256(payload) !== calibrationSha256) {
    fail("CALIBRATION_INVALID", "JONEZ calibration self-hash does not match its canonical payload.");
  }
  if (value.target.oneImage !== 1 || value.target.outputFormat !== "png" || value.review.minimumScore !== 92) {
    fail("CALIBRATION_INVALID", "JONEZ calibration runtime-source or review threshold drifted.");
  }
  return true;
}

export function jonezSourceArtCalibrationProtocolSummary() {
  return Object.freeze({
    schemaVersion: "1.0" as const,
    kind: "evavo.jonez.source-art-calibration.protocol" as const,
    protocolVersion: JONEZ_SOURCE_ART_CALIBRATION_PROTOCOL_VERSION,
    purpose:
      "Convert the canonical layered JONEZ request from a broad style description into measurable one-image source-art drawing specifications and native-scale review gates.",
    canonicalProofUnits: CANONICAL_PROOF_UNITS,
    drawingOrder: [
      "silhouette masses",
      "value groups",
      "canonical palette roles",
      "connected cluster pass",
      "selective contour and asymmetry",
      "1x and 8x native cleanup",
    ],
    boundaries: {
      conceptArtAsRuntimeSource: false,
      multipleAssetsPerImage: false,
      namedStyleImitation: false,
      copyrightedCharacterReconstruction: false,
      providerExecution: false,
      creativeApproval: false,
      repositoryMutation: false,
    },
  });
}
