import {
  compileAutomaticSpriteFinalizationWorkflow as compileCoreAutomaticSpriteFinalizationWorkflow,
} from "./automatic-finalization-compiler-core.js";
import { compileSpriteSupervisorWorkflow } from "./compiler.js";
import type {
  AutomaticSpriteFinalizationCompileRequestInput,
  CompiledAutomaticSpriteFinalizationWorkflow,
} from "./automatic-finalization-types.js";
import type { SpriteSupervisorCompileRequestInput } from "./types.js";

const SUPERSEDED_BASE_FAMILY_ROLE = "automatic.family-evidence";

/**
 * Preserve every non-superseded release proof already required by the compiled
 * automatic workflow when the finalization layer adds its stronger family
 * evidence. Ordinary family evidence is replaced by finalization evidence, but
 * deterministic horizontal-mirror proof remains independently mandatory.
 */
export function compileAutomaticSpriteFinalizationWorkflow(
  input: AutomaticSpriteFinalizationCompileRequestInput | unknown,
): CompiledAutomaticSpriteFinalizationWorkflow {
  const compiled = compileCoreAutomaticSpriteFinalizationWorkflow(input);
  const existingPolicy = compiled.supervisorRequest.policy ?? {};
  const retainedBaseRoles = (
    compiled.baseWorkflow.supervisorRequest.policy
      ?.requiredReleaseArtifactRoles ?? []
  ).filter((role) => role !== SUPERSEDED_BASE_FAMILY_ROLE);
  const requiredReleaseArtifactRoles = [
    ...new Set([
      ...retainedBaseRoles,
      ...(existingPolicy.requiredReleaseArtifactRoles ?? []),
    ]),
  ];
  const supervisorRequest: SpriteSupervisorCompileRequestInput = {
    ...compiled.supervisorRequest,
    policy: {
      ...existingPolicy,
      requiredReleaseArtifactRoles,
    },
  };
  return {
    ...compiled,
    supervisorRequest,
    supervisorWorkflow: compileSpriteSupervisorWorkflow(supervisorRequest),
  };
}
