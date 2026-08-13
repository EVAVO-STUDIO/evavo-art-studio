import type { LayeredProductionRequestInput } from "./layered-production-types.js";
import {
  compileJonezSourceArtCalibration,
  verifyJonezSourceArtCalibration as verifyCalibrationEnvelope,
  type CompiledJonezSourceArtCalibration,
} from "./jonez-source-art-calibration.js";
import {
  fail,
  jonezSourceArtCalibrationSha256,
  promptAddendum,
} from "./jonez-source-art-calibration-internal.js";
import {
  CANONICAL_PROOF_UNITS,
  CANONICAL_UNIT_LOCKS,
  COMMON_NEGATIVE_TERMS,
  ROLE_RECIPES,
} from "./jonez-source-art-recipes.js";

const AUTHORSHIP_PASSES = [
  "block one readable silhouette using connected masses only",
  "reduce the design to four or five value groups before hue",
  "assign only canonical palette ramps to declared materials",
  "replace smooth or noisy marks with deliberate connected clusters",
  "add selective contours, focal accents and authored asymmetry",
  "inspect at 1x and 8x nearest, then remove every non-functional pixel",
] as const;

const REVIEW_SCORING = [
  { id: "layer-purity", weight: 20, minimum: 20 },
  { id: "native-silhouette-readability", weight: 15, minimum: 13 },
  { id: "canonical-palette-discipline", weight: 15, minimum: 13 },
  { id: "connected-pixel-cluster-quality", weight: 15, minimum: 13 },
  { id: "1991-vga-authenticity", weight: 15, minimum: 13 },
  { id: "jonez-project-distinctiveness", weight: 10, minimum: 9 },
  { id: "runtime-usability-and-alpha", weight: 10, minimum: 10 },
] as const;

const ORIGINALITY_BOUNDARY = {
  originalEvavoDesignRequired: true,
  namedStyleImitationAllowed: false,
  copyrightedCharacterReconstructionAllowed: false,
  compositionInfluenceOnly: [
    "crowded visual discovery and recurring background micro-stories",
    "readable life-sim destinations and logical route movement",
    "early-1990s VGA technical constraints and native-scale discipline",
  ],
} as const;

const AUTHORITY_BOUNDARY = {
  planningOnly: true,
  providerExecution: false,
  creativeApproval: false,
  imageMutation: false,
  assembly: false,
  targetRepositoryMutation: false,
} as const;

const GLOBAL_BLOCKING_FAILURES = [
  "any layer contamination or more than one asset appears",
  "any antialiasing, soft gradient, bloom, procedural noise or hidden matte RGB appears",
  "any copyrighted character, costume, building, UI or logo is reconstructed",
  "the exact native dimensions, alpha policy, pivot or continuity contract is broken",
] as const;

function canonicalEqual(left: unknown, right: unknown): boolean {
  return jonezSourceArtCalibrationSha256(left) ===
    jonezSourceArtCalibrationSha256(right);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function expectedEvidenceViews(alpha: CompiledJonezSourceArtCalibration["layer"]["alpha"]) {
  return [
    "1x native isolated source",
    "8x nearest-neighbour cluster inspection",
    alpha === "opaque"
      ? "complete opaque coverage proof"
      : "black white and checkerboard alpha proof",
    "canonical palette index and local-colour count report",
    "edge-map proof with antialias and fringe detection",
    "composite against approved lower layers only",
  ] as const;
}

function reject(message: string, details?: unknown): never {
  fail("CALIBRATION_INVALID", message, details);
}

export function verifyJonezSourceArtCalibration(
  value: CompiledJonezSourceArtCalibration,
): true {
  if (!value || typeof value !== "object") {
    reject("JONEZ calibration must be an object.");
  }
  verifyCalibrationEnvelope(value);

  if (
    !isNonEmptyString(value.planId) ||
    !isNonEmptyString(value.revision) ||
    !isNonEmptyString(value.unitId) ||
    !isNonEmptyString(value.layer.id) ||
    !isStringList(value.layer.include) ||
    !isStringList(value.layer.exclude)
  ) {
    reject("JONEZ calibration identity and layer declarations must be non-empty canonical strings.");
  }
  if (
    !Number.isInteger(value.target.width) ||
    value.target.width <= 0 ||
    !Number.isInteger(value.target.height) ||
    value.target.height <= 0 ||
    value.target.filtering !== "nearest"
  ) {
    reject("JONEZ calibration target dimensions and nearest-neighbour filtering are invalid.");
  }

  const recipe = ROLE_RECIPES[value.layer.role];
  if (!recipe) {
    reject(`JONEZ source role ${value.layer.role} has no canonical drawing recipe.`);
  }
  if (!canonicalEqual(value.drawing, recipe)) {
    reject("JONEZ calibration drawing recipe drifted from its canonical layer role.");
  }

  const proofUnit = CANONICAL_PROOF_UNITS.includes(
    value.unitId as (typeof CANONICAL_PROOF_UNITS)[number],
  );
  if (value.proofUnit !== proofUnit) {
    reject("JONEZ calibration proof-unit identity is inconsistent with the canonical proof set.");
  }

  const unitLock = CANONICAL_UNIT_LOCKS[value.unitId];
  if (
    unitLock &&
    (
      unitLock.role !== value.layer.role ||
      unitLock.alpha !== value.layer.alpha ||
      unitLock.width !== value.target.width ||
      unitLock.height !== value.target.height
    )
  ) {
    reject("JONEZ calibration changed a canonical unit role, alpha policy or native dimensions.", {
      expected: unitLock,
      actual: {
        role: value.layer.role,
        alpha: value.layer.alpha,
        width: value.target.width,
        height: value.target.height,
      },
    });
  }

  const expectedPrompt = promptAddendum(value.unitId, value.layer.role, recipe);
  const expectedNegativeTerms = [...COMMON_NEGATIVE_TERMS, ...recipe.blockingFailures];
  if (
    value.provider.promptAddendum !== expectedPrompt ||
    !canonicalEqual(value.provider.negativeTerms, expectedNegativeTerms)
  ) {
    reject("JONEZ calibration provider instructions drifted from the canonical measured recipe.");
  }
  if (!canonicalEqual(value.authorshipPasses, AUTHORSHIP_PASSES)) {
    reject("JONEZ calibration authorship passes drifted from the canonical drawing order.");
  }

  const expectedBlockingFailures = [
    ...recipe.blockingFailures,
    ...GLOBAL_BLOCKING_FAILURES,
  ];
  if (
    value.review.minimumScore !== 92 ||
    !canonicalEqual(value.review.scoring, REVIEW_SCORING) ||
    !canonicalEqual(value.review.evidenceViews, expectedEvidenceViews(value.layer.alpha)) ||
    !canonicalEqual(value.review.blockingFailures, expectedBlockingFailures)
  ) {
    reject("JONEZ calibration review gates drifted from the canonical fail-closed rubric.");
  }
  if (!canonicalEqual(value.originality, ORIGINALITY_BOUNDARY)) {
    reject("JONEZ calibration originality boundary was weakened or altered.");
  }
  if (!canonicalEqual(value.authority, AUTHORITY_BOUNDARY)) {
    reject("JONEZ calibration authority boundary was weakened or altered.");
  }
  return true;
}

export function verifyJonezSourceArtCalibrationAgainstRequest(
  request: LayeredProductionRequestInput,
  unitId: string,
  value: CompiledJonezSourceArtCalibration,
): true {
  verifyJonezSourceArtCalibration(value);
  if (value.unitId !== unitId) {
    fail(
      "CALIBRATION_REQUEST_MISMATCH",
      `JONEZ calibration unit ${value.unitId} does not match the expected unit ${unitId}.`,
    );
  }
  const expected = compileJonezSourceArtCalibration(request, unitId);
  if (expected.calibrationSha256 !== value.calibrationSha256) {
    fail(
      "CALIBRATION_REQUEST_MISMATCH",
      "JONEZ calibration does not match the exact canonical request, revision and source unit.",
      {
        expectedCalibrationSha256: expected.calibrationSha256,
        actualCalibrationSha256: value.calibrationSha256,
      },
    );
  }
  return true;
}
