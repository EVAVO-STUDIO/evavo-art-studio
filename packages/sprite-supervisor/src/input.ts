import { compileSpriteProductionPlan } from "@evavo/art-sprite-planner";

import { SpriteSupervisorError } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function prepareSpriteSupervisorCompileInput(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const hasCompiledPlan = input.spritePlan !== undefined;
  const hasPlanRequest = input.spritePlanRequest !== undefined;
  if (hasCompiledPlan && hasPlanRequest) {
    throw new SpriteSupervisorError(
      "SPRITE_SUPERVISOR_PLAN_SOURCE_AMBIGUOUS",
      "Provide exactly one of spritePlan or spritePlanRequest, not both.",
    );
  }
  if (!hasPlanRequest) return input;
  const { spritePlanRequest, ...rest } = input;
  return {
    ...rest,
    spritePlan: compileSpriteProductionPlan(spritePlanRequest),
  };
}
