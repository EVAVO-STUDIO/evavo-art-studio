import type {
  AutomaticSpriteFinalizationCompileRequestInput,
  NormalizedAutomaticSpriteFinalizationRequest,
  ResolvedAutomaticSpriteBackgroundPolicy,
} from "./automatic-finalization-types.js";
import {
  automaticSpriteFinalizationRequestSha256,
  resolveAutomaticSpriteBackgroundPolicy,
  validateAutomaticSpriteFinalizationRequest,
} from "./automatic-finalization-validation-core.js";
import { compileAutomaticSpriteWorkflow } from "./automatic-mirror-compiler.js";
import type { CompiledAutomaticSpriteWorkflow } from "./automatic-types.js";

export {
  automaticSpriteFinalizationRequestSha256,
  resolveAutomaticSpriteBackgroundPolicy,
  validateAutomaticSpriteFinalizationRequest,
};

/**
 * Compiles the finalization base through the public mirror-aware automatic
 * workflow boundary. Safely derived directions therefore retain their exact
 * deterministic mirror tasks instead of being rejected by the authored-only
 * core compiler.
 */
export function compileAutomaticSpriteFinalizationBase(
  input: AutomaticSpriteFinalizationCompileRequestInput | unknown,
): Readonly<{
  request: NormalizedAutomaticSpriteFinalizationRequest;
  baseWorkflow: CompiledAutomaticSpriteWorkflow;
  background: ResolvedAutomaticSpriteBackgroundPolicy;
}> {
  const request = validateAutomaticSpriteFinalizationRequest(input);
  const baseWorkflow = compileAutomaticSpriteWorkflow(request.workflow);
  return {
    request,
    baseWorkflow,
    background: resolveAutomaticSpriteBackgroundPolicy(request, baseWorkflow),
  };
}
