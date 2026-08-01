import { normalizeJson } from "@evavo/art-artifacts";

import { analyseAutomaticSpriteWorkflow, compileAutomaticSpriteWorkflow as compileBaseAutomaticSpriteWorkflow } from "./automatic-compiler.js";
import { applyDeterministicMirroring } from "./automatic-mirror-graph.js";
import { DERIVED_DIRECTION_CODE, assertMirrorSafety, mirrorInput } from "./automatic-mirror-policy.js";
import type { AutomaticSpriteWorkflowCompileRequestInput, CompiledAutomaticSpriteWorkflow } from "./automatic-types.js";
import { automaticSpriteWorkflowRequestSha256 } from "./automatic-validation.js";
import { compileSpriteSupervisorWorkflow } from "./compiler.js";
import type { SpriteSupervisorCompileRequestInput } from "./types.js";
import { SpriteSupervisorError } from "./types.js";

export { applyDeterministicMirroring } from "./automatic-mirror-graph.js";
export { assertMirrorSafety } from "./automatic-mirror-policy.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function compileAutomaticSpriteWorkflow(
  input: AutomaticSpriteWorkflowCompileRequestInput | unknown,
): CompiledAutomaticSpriteWorkflow {
  const initial = analyseAutomaticSpriteWorkflow(input);
  const derivedDirections = initial.request.spritePlan.directions.filter(
    (entry) => !entry.authored,
  );
  if (!derivedDirections.length) {
    return compileBaseAutomaticSpriteWorkflow(input);
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

  const base = compileBaseAutomaticSpriteWorkflow(mirrorInput(input));
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
