import { normalizeJson } from "@evavo/art-artifacts";

import {
  compileAutomaticSpriteFinalizationWorkflow as compileBaseAutomaticSpriteFinalizationWorkflow,
} from "./adaptive-finalization-compiler.js";
import {
  analyseAutomaticSpriteWorkflow,
} from "./automatic-compiler.js";
import {
  applyDeterministicMirroring,
  assertMirrorSafety,
  compileAutomaticSpriteWorkflow,
} from "./automatic-mirror-compiler.js";
import type {
  AutomaticSpriteFinalizationCompileRequestInput,
  CompiledAutomaticSpriteFinalizationWorkflow,
} from "./automatic-finalization-types.js";
import { compileSpriteSupervisorWorkflow } from "./compiler.js";
import type { SpriteSupervisorCompileRequestInput } from "./types.js";
import { SpriteSupervisorError } from "./types.js";

const DERIVED_DIRECTION_CODE =
  "AUTOMATIC_SPRITE_WORKFLOW_DERIVED_DIRECTION_UNSUPPORTED";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mirrorFinalizationInput(
  input: AutomaticSpriteFinalizationCompileRequestInput | unknown,
): AutomaticSpriteFinalizationCompileRequestInput | unknown {
  if (!isRecord(input) || !isRecord(input.workflow)) return input;
  const policy = isRecord(input.workflow.policy)
    ? input.workflow.policy
    : {};
  return {
    ...input,
    workflow: {
      ...input.workflow,
      policy: {
        ...policy,
        failOnDerivedDirections: false,
      },
    },
  };
}

export function compileAutomaticSpriteFinalizationWorkflow(
  input: AutomaticSpriteFinalizationCompileRequestInput | unknown,
): CompiledAutomaticSpriteFinalizationWorkflow {
  if (!isRecord(input) || input.workflow === undefined) {
    return compileBaseAutomaticSpriteFinalizationWorkflow(input);
  }
  const initial = analyseAutomaticSpriteWorkflow(input.workflow);
  const derivedDirections = initial.request.spritePlan.directions.filter(
    (entry) => !entry.authored,
  );
  if (!derivedDirections.length) {
    return compileBaseAutomaticSpriteFinalizationWorkflow(input);
  }
  const nonMirrorBlockers = initial.analysis.blockers.filter(
    (entry) => entry.code !== DERIVED_DIRECTION_CODE,
  );
  if (nonMirrorBlockers.length) {
    throw new SpriteSupervisorError(
      "AUTOMATIC_SPRITE_WORKFLOW_BLOCKED",
      "The automatic sprite workflow has blocking requirements and was not compiled for finalization.",
      normalizeJson({ blockers: initial.analysis.blockers }),
    );
  }
  assertMirrorSafety(initial, derivedDirections);

  const compiled = compileBaseAutomaticSpriteFinalizationWorkflow(
    mirrorFinalizationInput(input),
  );
  const mirroredBase = compileAutomaticSpriteWorkflow(input.workflow);
  const applied = applyDeterministicMirroring(
    compiled.baseWorkflow,
    compiled.supervisorRequest,
    initial.request.policy.requireFinalHumanApproval,
  );
  const supervisorMetadata = isRecord(applied.supervisorRequest.metadata)
    ? applied.supervisorRequest.metadata
    : {};
  const supervisorRequest: SpriteSupervisorCompileRequestInput = {
    ...applied.supervisorRequest,
    metadata: normalizeJson({
      ...supervisorMetadata,
      automaticRequestSha256: mirroredBase.requestSha256,
    }),
  };
  const baseAnalysis = {
    ...applied.analysis,
    totals: {
      ...applied.analysis.totals,
      tasks: supervisorRequest.tasks.length,
    },
  };
  return {
    ...compiled,
    baseWorkflow: mirroredBase,
    analysis: {
      ...compiled.analysis,
      base: baseAnalysis,
    },
    supervisorRequest,
    supervisorWorkflow: compileSpriteSupervisorWorkflow(supervisorRequest),
  };
}
