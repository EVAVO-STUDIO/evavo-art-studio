import { normalizeJson } from "@evavo/art-artifacts";

import {
  analyseAutomaticSpriteWorkflow,
  compileAutomaticSpriteWorkflow as compileBaseAutomaticSpriteWorkflow,
} from "./automatic-compiler.js";
import { applyDeterministicMirroring } from "./automatic-mirror-graph.js";
import {
  DERIVED_DIRECTION_CODE,
  assertMirrorSafety,
  mirrorInput,
} from "./automatic-mirror-policy.js";
import type {
  AutomaticSpriteWorkflowCompileRequestInput,
  CompiledAutomaticSpriteWorkflow,
} from "./automatic-types.js";
import { automaticSpriteWorkflowRequestSha256 } from "./automatic-validation.js";
import { compileSpriteSupervisorWorkflow } from "./compiler.js";
import type { SpriteSupervisorCompileRequestInput } from "./types.js";
import { SpriteSupervisorError } from "./types.js";

export { applyDeterministicMirroring } from "./automatic-mirror-graph.js";
export { assertMirrorSafety } from "./automatic-mirror-policy.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function artDirectionWithExplicitShadowOwnership(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.asset)) return value;
  const style = isRecord(value.style) ? value.style : {};
  const lighting = isRecord(style.lighting) ? style.lighting : {};
  const independentlyOwned = value.asset.independentShadow === true;
  const isometric =
    style.projection === "isometric-2:1" ||
    value.presetId === "isometric-rpg-1997";
  const callerSelectedTreatment = lighting.shadowTreatment !== undefined;
  if (independentlyOwned || isometric || callerSelectedTreatment) return value;

  // Presets describe a default lighting treatment, but the asset contract owns
  // whether the cast shadow is a separately produced deliverable. When the
  // caller has not explicitly selected a treatment and independentShadow is
  // false, keep the shadow baked into the authored identity frame instead of
  // inventing a required layer reference.
  return {
    ...value,
    style: {
      ...style,
      lighting: {
        ...lighting,
        shadowTreatment: "baked",
      },
    },
  };
}

function withExplicitShadowOwnership(input: unknown): unknown {
  if (!isRecord(input)) return input;
  if (input.artDirectionRequest !== undefined) {
    return {
      ...input,
      artDirectionRequest: artDirectionWithExplicitShadowOwnership(
        input.artDirectionRequest,
      ),
    };
  }
  if (
    isRecord(input.spritePlanRequest) &&
    input.spritePlanRequest.artDirectionRequest !== undefined
  ) {
    return {
      ...input,
      spritePlanRequest: {
        ...input.spritePlanRequest,
        artDirectionRequest: artDirectionWithExplicitShadowOwnership(
          input.spritePlanRequest.artDirectionRequest,
        ),
      },
    };
  }
  return input;
}

export function compileAutomaticSpriteWorkflow(
  input: AutomaticSpriteWorkflowCompileRequestInput | unknown,
): CompiledAutomaticSpriteWorkflow {
  const preparedInput = withExplicitShadowOwnership(input);
  const initial = analyseAutomaticSpriteWorkflow(preparedInput);
  const boundedLimit = initial.analysis.blockers.find(
    (entry) =>
      entry.code === "AUTOMATIC_SPRITE_WORKFLOW_UNIT_LIMIT_EXCEEDED" ||
      entry.code === "AUTOMATIC_SPRITE_WORKFLOW_TASK_LIMIT_EXCEEDED",
  );
  if (boundedLimit) {
    throw new SpriteSupervisorError(
      boundedLimit.code,
      boundedLimit.message,
      boundedLimit.details,
    );
  }
  const derivedDirections = initial.request.spritePlan.directions.filter(
    (entry) => !entry.authored,
  );
  if (!derivedDirections.length) {
    return compileBaseAutomaticSpriteWorkflow(preparedInput);
  }

  const nonMirrorBlockers = initial.analysis.blockers.filter(
    (entry) => entry.code !== DERIVED_DIRECTION_CODE,
  );
  if (nonMirrorBlockers.length) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_WORKFLOW_BLOCKED",
      "The automatic sprite workflow has blocking requirements and was not compiled for execution.",
      normalizeJson({ blockers: initial.analysis.blockers }),
    );
  }
  assertMirrorSafety(initial, derivedDirections);

  const base = compileBaseAutomaticSpriteWorkflow(mirrorInput(preparedInput));
  const applied = applyDeterministicMirroring(
    base,
    base.supervisorRequest,
    initial.request.policy.requireFinalHumanApproval,
  );
  const requestSha256 = automaticSpriteWorkflowRequestSha256(initial.request);
  const supervisorMetadata = isRecord(applied.supervisorRequest.metadata)
    ? applied.supervisorRequest.metadata
    : {};
  const supervisorRequest: SpriteSupervisorCompileRequestInput = {
    ...applied.supervisorRequest,
    metadata: normalizeJson({
      ...supervisorMetadata,
      automaticRequestSha256: requestSha256,
    }),
  };
  return {
    ...base,
    request: initial.request,
    requestSha256,
    analysis: applied.analysis,
    supervisorRequest,
    supervisorWorkflow: compileSpriteSupervisorWorkflow(supervisorRequest),
  };
}
