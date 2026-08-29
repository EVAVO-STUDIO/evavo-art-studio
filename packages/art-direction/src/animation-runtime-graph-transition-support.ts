import {
  ANIMATION_RUNTIME_CONDITION_OPERATORS,
  type AnimationRuntimeClip,
  type AnimationRuntimeCondition,
  type AnimationRuntimeParameter,
  type AnimationRuntimeTransition,
  type AnimationRuntimeTransitionTrigger,
} from "./animation-runtime-graph-types.js";
import { assertAnimationRuntimeSafeId } from "./animation-runtime-graph-validation-common.js";

export function triggerIdentity(trigger: AnimationRuntimeTransitionTrigger): string {
  if (trigger.kind === "automatic") return "automatic";
  if (trigger.kind === "command") return `command:${trigger.command}`;
  return `parameter:${trigger.parameterId}`;
}

export function conditionIdentity(conditions: readonly AnimationRuntimeCondition[]): string {
  return conditions
    .map((entry) => `${entry.parameterId}:${entry.operator}:${String(entry.value)}`)
    .sort()
    .join("|");
}

export function animationRuntimeTransitionAppliesToState(
  transition: AnimationRuntimeTransition,
  stateId: string,
): boolean {
  if (transition.fromStateId !== "*" && transition.fromStateId !== stateId) return false;
  return !(transition.excludedFromStateIds ?? []).includes(stateId);
}

export function validateCondition(
  condition: AnimationRuntimeCondition,
  parameters: ReadonlyMap<string, AnimationRuntimeParameter>,
  transitionId: string,
  index: number,
): void {
  assertAnimationRuntimeSafeId(condition.parameterId, `ANIMATION_RUNTIME_CONDITION_PARAMETER_ID_INVALID:${transitionId}:${index}`);
  if (!ANIMATION_RUNTIME_CONDITION_OPERATORS.includes(condition.operator)) {
    throw new Error(`ANIMATION_RUNTIME_CONDITION_OPERATOR_INVALID:${transitionId}:${index}`);
  }
  const parameter = parameters.get(condition.parameterId);
  if (!parameter) throw new Error(`ANIMATION_RUNTIME_CONDITION_PARAMETER_UNKNOWN:${transitionId}:${condition.parameterId}`);
  if (parameter.type === "trigger") {
    throw new Error(`ANIMATION_RUNTIME_CONDITION_TRIGGER_PARAMETER_FORBIDDEN:${transitionId}:${condition.parameterId}`);
  }
  if (parameter.type === "boolean") {
    if (typeof condition.value !== "boolean") {
      throw new Error(`ANIMATION_RUNTIME_CONDITION_VALUE_INVALID:${transitionId}:${condition.parameterId}`);
    }
    if (!["equals", "not-equals"].includes(condition.operator)) {
      throw new Error(`ANIMATION_RUNTIME_CONDITION_BOOLEAN_OPERATOR_INVALID:${transitionId}:${condition.parameterId}`);
    }
  } else if (typeof condition.value !== "number" || !Number.isFinite(condition.value)) {
    throw new Error(`ANIMATION_RUNTIME_CONDITION_VALUE_INVALID:${transitionId}:${condition.parameterId}`);
  }
}

export function conditionSetSatisfiable(
  transition: AnimationRuntimeTransition,
  parameters: ReadonlyMap<string, AnimationRuntimeParameter>,
): boolean {
  const byParameter = new Map<string, AnimationRuntimeCondition[]>();
  for (const condition of transition.conditions) {
    const existing = byParameter.get(condition.parameterId) ?? [];
    existing.push(condition);
    byParameter.set(condition.parameterId, existing);
  }
  if (transition.trigger.kind === "parameter") {
    const triggerParameter = parameters.get(transition.trigger.parameterId);
    if (triggerParameter?.type === "boolean") {
      const existing = byParameter.get(triggerParameter.id) ?? [];
      existing.push({ parameterId: triggerParameter.id, operator: "equals", value: true });
      byParameter.set(triggerParameter.id, existing);
    }
  }

  for (const [parameterId, conditions] of byParameter) {
    const parameter = parameters.get(parameterId);
    if (!parameter) return false;
    if (parameter.type === "boolean") {
      const allowed = new Set<boolean>([false, true]);
      for (const condition of conditions) {
        if (condition.operator === "equals") {
          allowed.delete(condition.value !== true);
        } else if (condition.operator === "not-equals") {
          allowed.delete(condition.value === true);
        }
      }
      if (allowed.size === 0) return false;
      continue;
    }
    if (parameter.type !== "number") return false;

    let equalValue: number | undefined;
    const excluded = new Set<number>();
    let lower: Readonly<{ value: number; inclusive: boolean }> | undefined;
    let upper: Readonly<{ value: number; inclusive: boolean }> | undefined;
    for (const condition of conditions) {
      const value = condition.value as number;
      if (condition.operator === "equals") {
        if (equalValue !== undefined && equalValue !== value) return false;
        equalValue = value;
      } else if (condition.operator === "not-equals") {
        excluded.add(value);
      } else if (condition.operator === "greater-than" || condition.operator === "greater-than-or-equal") {
        const candidate = { value, inclusive: condition.operator === "greater-than-or-equal" };
        if (
          !lower ||
          candidate.value > lower.value ||
          (candidate.value === lower.value && !candidate.inclusive && lower.inclusive)
        ) {
          lower = candidate;
        }
      } else {
        const candidate = { value, inclusive: condition.operator === "less-than-or-equal" };
        if (
          !upper ||
          candidate.value < upper.value ||
          (candidate.value === upper.value && !candidate.inclusive && upper.inclusive)
        ) {
          upper = candidate;
        }
      }
    }
    const aboveLower = (value: number): boolean =>
      !lower || value > lower.value || (lower.inclusive && value === lower.value);
    const belowUpper = (value: number): boolean =>
      !upper || value < upper.value || (upper.inclusive && value === upper.value);
    if (equalValue !== undefined) {
      if (!aboveLower(equalValue) || !belowUpper(equalValue) || excluded.has(equalValue)) return false;
      continue;
    }
    if (lower && upper) {
      if (lower.value > upper.value) return false;
      if (lower.value === upper.value) {
        if (!lower.inclusive || !upper.inclusive || excluded.has(lower.value)) return false;
      }
    }
  }
  return true;
}

export function weightedFrameStartPhase(clip: AnimationRuntimeClip, frame: number): number {
  const total = clip.frameDurations.reduce((sum, duration) => sum + duration, 0);
  const before = clip.frameDurations
    .slice(0, frame - 1)
    .reduce((sum, duration) => sum + duration, 0);
  return before / total;
}

export function circularPhaseDistance(left: number, right: number): number {
  const distance = Math.abs(left - right);
  return Math.min(distance, 1 - distance);
}
