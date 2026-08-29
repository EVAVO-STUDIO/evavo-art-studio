import type {
  AnimationRuntimeClip,
  AnimationRuntimeCondition,
  AnimationRuntimeParameter,
  AnimationRuntimeTransition,
  ResolveAnimationRuntimeTransitionInput,
  ResolvedAnimationRuntimeTransition,
} from "./animation-runtime-graph-types.js";
import { assertAnimationRuntimeGraphIntegrity } from "./animation-runtime-graph-plan.js";
import {
  ANIMATION_RUNTIME_EPSILON,
  assertAnimationRuntimePositiveInteger,
  assertAnimationRuntimeSafeId,
} from "./animation-runtime-graph-validation-common.js";
import { animationRuntimeTransitionAppliesToState } from "./animation-runtime-graph-transition-support.js";

function parameterValue(
  parameter: AnimationRuntimeParameter,
  supplied: Readonly<Record<string, boolean | number>> | undefined,
): boolean | number | null {
  return supplied?.[parameter.id] ?? parameter.defaultValue;
}

function conditionPasses(
  condition: AnimationRuntimeCondition,
  parameter: AnimationRuntimeParameter,
  supplied: Readonly<Record<string, boolean | number>> | undefined,
): boolean {
  const actual = parameterValue(parameter, supplied);
  const expected = condition.value;
  if (condition.operator === "equals") return actual === expected;
  if (condition.operator === "not-equals") return actual !== expected;
  if (typeof actual !== "number" || typeof expected !== "number") return false;
  if (condition.operator === "greater-than") return actual > expected;
  if (condition.operator === "greater-than-or-equal") return actual >= expected;
  if (condition.operator === "less-than") return actual < expected;
  return actual <= expected;
}

function triggerPasses(
  transition: AnimationRuntimeTransition,
  parameters: ReadonlyMap<string, AnimationRuntimeParameter>,
  input: ResolveAnimationRuntimeTransitionInput,
): boolean {
  if (transition.trigger.kind === "automatic") return true;
  if (transition.trigger.kind === "command") {
    return (input.activeCommands ?? []).includes(transition.trigger.command);
  }
  const parameter = parameters.get(transition.trigger.parameterId);
  if (!parameter) return false;
  if (parameter.type === "trigger") {
    return (input.activeTriggers ?? []).includes(parameter.id);
  }
  return parameterValue(parameter, input.parameterValues) === true;
}

function assertDistinctSafeIds(values: readonly string[], code: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    assertAnimationRuntimeSafeId(value, code);
    if (seen.has(value)) throw new Error(`${code}_DUPLICATE:${value}`);
    seen.add(value);
  }
}

function validateResolutionEvidence(
  input: ResolveAnimationRuntimeTransitionInput,
  currentClip: AnimationRuntimeClip,
  parameters: ReadonlyMap<string, AnimationRuntimeParameter>,
): void {
  if (input.atEnd !== undefined && typeof input.atEnd !== "boolean") {
    throw new Error("ANIMATION_RUNTIME_AT_END_EVIDENCE_INVALID");
  }
  if (input.atEnd === true && input.currentFrame !== currentClip.frameCount) {
    throw new Error("ANIMATION_RUNTIME_AT_END_FRAME_MISMATCH");
  }

  const firedMarkerIds = input.firedMarkerIds ?? [];
  assertDistinctSafeIds(firedMarkerIds, "ANIMATION_RUNTIME_FIRED_MARKER_ID_INVALID");
  for (const markerId of firedMarkerIds) {
    const marker = currentClip.markers.find((entry) => entry.id === markerId);
    if (!marker) throw new Error(`ANIMATION_RUNTIME_FIRED_MARKER_UNKNOWN:${markerId}`);
    if (marker.frame !== input.currentFrame) {
      throw new Error(`ANIMATION_RUNTIME_FIRED_MARKER_FRAME_MISMATCH:${markerId}`);
    }
  }

  const activeTriggers = input.activeTriggers ?? [];
  assertDistinctSafeIds(activeTriggers, "ANIMATION_RUNTIME_ACTIVE_TRIGGER_ID_INVALID");
  for (const triggerId of activeTriggers) {
    const parameter = parameters.get(triggerId);
    if (!parameter || parameter.type !== "trigger") {
      throw new Error(`ANIMATION_RUNTIME_ACTIVE_TRIGGER_UNKNOWN:${triggerId}`);
    }
  }

  const activeCommands = input.activeCommands ?? [];
  assertDistinctSafeIds(activeCommands, "ANIMATION_RUNTIME_ACTIVE_COMMAND_ID_INVALID");
  const declaredCommands = new Set(
    input.plan.transitions.flatMap((transition) =>
      transition.trigger.kind === "command" ? [transition.trigger.command] : [],
    ),
  );
  for (const command of activeCommands) {
    if (!declaredCommands.has(command)) {
      throw new Error(`ANIMATION_RUNTIME_ACTIVE_COMMAND_UNKNOWN:${command}`);
    }
  }

  if (input.parameterValues !== undefined) {
    if (!input.parameterValues || typeof input.parameterValues !== "object" || Array.isArray(input.parameterValues)) {
      throw new Error("ANIMATION_RUNTIME_PARAMETER_VALUES_INVALID");
    }
    for (const [parameterId, value] of Object.entries(input.parameterValues)) {
      assertAnimationRuntimeSafeId(parameterId, "ANIMATION_RUNTIME_PARAMETER_VALUE_ID_INVALID");
      const parameter = parameters.get(parameterId);
      if (!parameter || parameter.type === "trigger") {
        throw new Error(`ANIMATION_RUNTIME_PARAMETER_VALUE_UNKNOWN:${parameterId}`);
      }
      if (parameter.type === "boolean" && typeof value !== "boolean") {
        throw new Error(`ANIMATION_RUNTIME_PARAMETER_VALUE_TYPE_INVALID:${parameterId}`);
      }
      if (
        parameter.type === "number" &&
        (typeof value !== "number" || !Number.isFinite(value))
      ) {
        throw new Error(`ANIMATION_RUNTIME_PARAMETER_VALUE_TYPE_INVALID:${parameterId}`);
      }
    }
  }
}

function switchGatePasses(
  transition: AnimationRuntimeTransition,
  input: ResolveAnimationRuntimeTransitionInput,
  currentClip: AnimationRuntimeClip,
): boolean {
  if (transition.switchMode === "at-end") {
    return input.atEnd === true && input.currentFrame === currentClip.frameCount;
  }
  if (transition.switchMode === "at-marker") {
    if (transition.markerId === undefined) return false;
    const marker = currentClip.markers.find((entry) => entry.id === transition.markerId);
    return (
      marker?.frame === input.currentFrame &&
      (input.firedMarkerIds ?? []).includes(transition.markerId)
    );
  }
  return true;
}

function cyclePosition(
  clip: AnimationRuntimeClip,
  frame: number,
  frameProgress: number,
): number {
  const total = clip.frameDurations.reduce((sum, duration) => sum + duration, 0);
  const before = clip.frameDurations.slice(0, frame - 1).reduce((sum, duration) => sum + duration, 0);
  const current = clip.frameDurations[frame - 1] ?? 1;
  return Math.min(1 - ANIMATION_RUNTIME_EPSILON, Math.max(0, (before + current * frameProgress) / total));
}

function frameAtCyclePosition(
  clip: AnimationRuntimeClip,
  phase: number,
): Readonly<{ frame: number; progress: number }> {
  const total = clip.frameDurations.reduce((sum, duration) => sum + duration, 0);
  const target = Math.min(total - ANIMATION_RUNTIME_EPSILON, Math.max(0, phase * total));
  let cursor = 0;
  for (const [index, duration] of clip.frameDurations.entries()) {
    if (target < cursor + duration) {
      return { frame: index + 1, progress: (target - cursor) / duration };
    }
    cursor += duration;
  }
  return { frame: clip.frameCount, progress: 1 - ANIMATION_RUNTIME_EPSILON };
}

export function resolveAnimationRuntimeTransition(
  input: ResolveAnimationRuntimeTransitionInput,
): ResolvedAnimationRuntimeTransition | null {
  assertAnimationRuntimeGraphIntegrity(input.plan);
  if (!input.plan.quality.promotable) {
    throw new Error("ANIMATION_RUNTIME_GRAPH_NOT_PROMOTABLE");
  }
  const states = new Map(input.plan.states.map((state) => [state.id, state]));
  const clips = new Map(input.plan.clips.map((clip) => [clip.id, clip]));
  const parameters = new Map(input.plan.parameters.map((parameter) => [parameter.id, parameter]));
  const currentState = states.get(input.currentStateId);
  if (!currentState) throw new Error("ANIMATION_RUNTIME_CURRENT_STATE_UNKNOWN");
  const currentClip = clips.get(currentState.clipId);
  if (!currentClip) throw new Error("ANIMATION_RUNTIME_CURRENT_CLIP_UNKNOWN");
  assertAnimationRuntimePositiveInteger(input.currentFrame, "ANIMATION_RUNTIME_CURRENT_FRAME_INVALID");
  if (input.currentFrame > currentClip.frameCount) {
    throw new Error("ANIMATION_RUNTIME_CURRENT_FRAME_OUTSIDE_CLIP");
  }
  const frameProgress = input.frameProgress ?? 0;
  if (!Number.isFinite(frameProgress) || frameProgress < 0 || frameProgress >= 1) {
    throw new Error("ANIMATION_RUNTIME_FRAME_PROGRESS_INVALID");
  }
  validateResolutionEvidence(input, currentClip, parameters);

  const candidates = input.plan.transitions
    .filter((transition) => animationRuntimeTransitionAppliesToState(transition, currentState.id))
    .filter((transition) => triggerPasses(transition, parameters, input))
    .filter((transition) => switchGatePasses(transition, input, currentClip))
    .filter((transition) =>
      transition.conditions.every((condition) => {
        const parameter = parameters.get(condition.parameterId);
        return parameter ? conditionPasses(condition, parameter, input.parameterValues) : false;
      }),
    )
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));

  const selected = candidates[0];
  if (!selected) return null;
  const targetState = states.get(selected.toStateId);
  if (!targetState) throw new Error("ANIMATION_RUNTIME_TARGET_STATE_UNKNOWN");
  const targetClip = clips.get(targetState.clipId);
  if (!targetClip) throw new Error("ANIMATION_RUNTIME_TARGET_CLIP_UNKNOWN");

  if (selected.preserveCyclePhase) {
    const phase = cyclePosition(currentClip, input.currentFrame, frameProgress);
    const target = frameAtCyclePosition(targetClip, phase);
    return {
      transitionId: selected.id,
      fromStateId: currentState.id,
      toStateId: targetState.id,
      targetFrame: target.frame,
      targetFrameProgress: target.progress,
      carriedCyclePhase: phase,
      resetTarget: selected.resetTarget,
    };
  }
  if (!selected.resetTarget) {
    return {
      transitionId: selected.id,
      fromStateId: currentState.id,
      toStateId: targetState.id,
      targetFrame: Math.min(input.currentFrame, targetClip.frameCount),
      targetFrameProgress: frameProgress,
      carriedCyclePhase: null,
      resetTarget: false,
    };
  }
  return {
    transitionId: selected.id,
    fromStateId: currentState.id,
    toStateId: targetState.id,
    targetFrame: targetState.entryFrame,
    targetFrameProgress: 0,
    carriedCyclePhase: null,
    resetTarget: true,
  };
}
