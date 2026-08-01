import { normalizeJson, type JsonValue } from "@evavo/art-artifacts";
import type { SpritePlannedDirection } from "@evavo/art-sprite-planner";

import { analyseAutomaticSpriteWorkflow } from "./automatic-compiler.js";
import type { AutomaticSpriteWorkflowCompileRequestInput } from "./automatic-types.js";
import { SpriteSupervisorError } from "./types.js";

export const DERIVED_DIRECTION_CODE =
  "AUTOMATIC_SPRITE_WORKFLOW_DERIVED_DIRECTION_UNSUPPORTED";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mirrorInput(
  input: AutomaticSpriteWorkflowCompileRequestInput | unknown,
): AutomaticSpriteWorkflowCompileRequestInput | unknown {
  if (!isRecord(input)) return input;
  return {
    ...input,
    policy: {
      ...(isRecord(input.policy) ? input.policy : {}),
      failOnDerivedDirections: false,
    },
  };
}

function authorization(metadata: JsonValue | undefined): Record<string, unknown> {
  if (!isRecord(metadata) || !isRecord(metadata.deterministicMirroring)) {
    return {};
  }
  return metadata.deterministicMirroring;
}

function mirrorInvariantAngle(value: number): boolean {
  const normalized = ((value % 360) + 360) % 360;
  return normalized === 90 || normalized === 270;
}

export function assertMirrorSafety(
  analysed: ReturnType<typeof analyseAutomaticSpriteWorkflow>,
  derivedDirections: readonly SpritePlannedDirection[],
): void {
  const { request } = analysed;
  const { artDirectionContract: contract } = request;
  const review = authorization(request.metadata);
  const blockers: Array<
    Readonly<{ code: string; message: string; details?: JsonValue }>
  > = [];
  const add = (code: string, message: string, details?: JsonValue): void => {
    blockers.push({ code, message, ...(details === undefined ? {} : { details }) });
  };

  if (contract.asset.asymmetric) {
    add(
      "AUTOMATIC_SPRITE_MIRROR_ASYMMETRIC_ASSET",
      "An asymmetric asset cannot use deterministic horizontal derivation.",
    );
  }
  if (contract.asset.hasHeldItems || contract.asset.runtimeEquipmentSwaps) {
    add(
      "AUTOMATIC_SPRITE_MIRROR_EQUIPMENT_UNSAFE",
      "Held items and runtime equipment swaps require independently authored directions.",
    );
  }
  if (contract.asset.runtimeCostumeVariants) {
    add(
      "AUTOMATIC_SPRITE_MIRROR_COSTUME_UNSAFE",
      "Runtime costume variants require an independently reviewed directional family.",
    );
  }
  if (contract.asset.needsNormalMap) {
    add(
      "AUTOMATIC_SPRITE_MIRROR_NORMAL_MAP_UNSUPPORTED",
      "Normal-map X-channel inversion is not yet part of the deterministic mirror worker.",
    );
  }
  if (!contract.style.antiGeneric.prohibitReadableText) {
    add(
      "AUTOMATIC_SPRITE_MIRROR_READABLE_TEXT_UNSAFE",
      "Horizontal derivation requires readable text, labels, glyphs, and logos to be prohibited because reflection reverses them.",
    );
  }
  if (
    contract.style.camera.mirroring === "forbidden" ||
    !contract.style.camera.fixed ||
    contract.style.camera.rollDegrees !== 0
  ) {
    add(
      "AUTOMATIC_SPRITE_MIRROR_CAMERA_UNSAFE",
      "Horizontal derivation requires a fixed, unrolled camera that permits mirroring.",
    );
  }
  if (contract.style.lighting.frameVariation !== "forbidden") {
    add(
      "AUTOMATIC_SPRITE_MIRROR_LIGHT_VARIATION_UNSAFE",
      "Direction derivation requires a frame-invariant lighting contract.",
    );
  }

  const directionalLight =
    !mirrorInvariantAngle(contract.style.lighting.keyDirectionDegrees) ||
    (contract.style.lighting.shadowTreatment !== "none" &&
      contract.style.lighting.shadowTreatment !== "engine" &&
      !mirrorInvariantAngle(contract.style.lighting.shadowDirectionDegrees));
  if (directionalLight && review.lightingReviewed !== true) {
    add(
      "AUTOMATIC_SPRITE_MIRROR_LIGHTING_REVIEW_REQUIRED",
      "Screen-space highlights or cast shadows change handedness under reflection. Set metadata.deterministicMirroring.lightingReviewed=true only after style-owner approval.",
    );
  }
  if (
    contract.style.antiGeneric.requireHistoricalPlausibility &&
    review.historicalSymmetryReviewed !== true
  ) {
    add(
      "AUTOMATIC_SPRITE_MIRROR_HISTORICAL_REVIEW_REQUIRED",
      "Historically constrained clothing and equipment require explicit symmetry review before mirroring.",
    );
  }
  const expectedPivotX = Math.floor(contract.asset.dimensions.width / 2);
  if (contract.production.pivot.x !== expectedPivotX) {
    add(
      "AUTOMATIC_SPRITE_MIRROR_PIVOT_OFF_AXIS",
      "The declared pivot must use the centred integer column for the full-canvas horizontal reflection axis.",
      normalizeJson({
        pivotX: contract.production.pivot.x,
        expectedPivotX,
        width: contract.asset.dimensions.width,
      }),
    );
  }

  const directions = new Map(
    request.spritePlan.directions.map((entry) => [entry.name, entry]),
  );
  for (const direction of derivedDirections) {
    const source = direction.mirrorOf
      ? directions.get(direction.mirrorOf)
      : undefined;
    if (!direction.mirrorOf || !source?.authored) {
      add(
        "AUTOMATIC_SPRITE_MIRROR_SOURCE_DIRECTION_INVALID",
        `Derived direction ${direction.name} has no authored mirror source.`,
        normalizeJson({
          direction: direction.name,
          mirrorOf: direction.mirrorOf ?? null,
        }),
      );
    }
  }

  if (blockers.length) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_MIRROR_BLOCKED",
      "The deterministic horizontal-mirror workflow has blocking requirements.",
      normalizeJson({ blockers }),
    );
  }
}
