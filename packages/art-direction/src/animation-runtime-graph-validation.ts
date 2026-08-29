import type {
  AnimationRuntimeFinding,
  AnimationRuntimeGraphQuality,
  AnimationRuntimeGraphRequest,
  AnimationRuntimeState,
  AnimationRuntimeTransition,
} from "./animation-runtime-graph-types.js";
import { finding, validateParameters } from "./animation-runtime-graph-validation-common.js";
import { validateClips, validateStates } from "./animation-runtime-graph-model-validation.js";
import { animationRuntimeTransitionAppliesToState } from "./animation-runtime-graph-transition-support.js";
import { validateTransitions } from "./animation-runtime-graph-transition-validation.js";

function reachableStates(
  initialStateId: string,
  states: readonly AnimationRuntimeState[],
  transitions: readonly AnimationRuntimeTransition[],
): readonly string[] {
  const reachable = new Set<string>([initialStateId]);
  const queue = [initialStateId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    for (const transition of transitions) {
      if (!animationRuntimeTransitionAppliesToState(transition, current)) continue;
      if (!reachable.has(transition.toStateId)) {
        reachable.add(transition.toStateId);
        queue.push(transition.toStateId);
      }
    }
  }
  return states.map((state) => state.id).filter((stateId) => reachable.has(stateId)).sort();
}

export function evaluateAnimationRuntimeGraph(request: AnimationRuntimeGraphRequest): AnimationRuntimeGraphQuality {
  const findings: AnimationRuntimeFinding[] = [];
  const parameters = validateParameters(request.parameters, findings);
  const clips = validateClips(request, findings);
  const states = validateStates(request, clips, findings);
  validateTransitions(request, states, clips, parameters, findings);

  const reachableStateIds = reachableStates(request.initialStateId, request.states, request.transitions);
  const reachable = new Set(reachableStateIds);
  const unreachableStateIds = request.states
    .map((state) => state.id)
    .filter((stateId) => !reachable.has(stateId))
    .sort();
  for (const stateId of unreachableStateIds) {
    finding(
      findings,
      "ANIMATION_RUNTIME_STATE_UNREACHABLE",
      request.allowUnreachableStates ? "warning" : "blocking",
      `states.${stateId}`,
      `State ${stateId} cannot be reached from initial state ${request.initialStateId}.`,
      "Add a valid incoming transition or remove the state from the runtime graph.",
    );
  }

  const usedClipIds = new Set(request.states.map((state) => state.clipId));
  for (const clip of request.clips) {
    if (!usedClipIds.has(clip.id)) {
      finding(
        findings,
        "ANIMATION_RUNTIME_CLIP_UNUSED",
        "warning",
        `clips.${clip.id}`,
        `Clip ${clip.id} is not bound to a runtime state.`,
        "Bind it to a state or move it out of the active character animation set.",
      );
    }
  }

  for (const state of request.states) {
    if (state.terminal) continue;
    const outgoing = request.transitions.some((transition) => animationRuntimeTransitionAppliesToState(transition, state.id));
    if (!outgoing) {
      finding(
        findings,
        "ANIMATION_RUNTIME_STATE_HAS_NO_EXIT",
        "warning",
        `states.${state.id}`,
        `Non-terminal state ${state.id} has no outgoing transition.`,
        "Add an explicit exit or mark the state terminal when it is intentionally final.",
      );
    }
  }

  const blockerCount = findings.filter((entry) => entry.severity === "blocking").length;
  const warningCount = findings.filter((entry) => entry.severity === "warning").length;
  return {
    blockerCount,
    warningCount,
    findings,
    reachableStateIds,
    unreachableStateIds,
    promotable: blockerCount === 0,
  };
}

export function assertAnimationRuntimeGraphInputShape(submitted: AnimationRuntimeGraphRequest): void {
  const collections = [
    ["parameters", submitted.parameters],
    ["clips", submitted.clips],
    ["states", submitted.states],
    ["transitions", submitted.transitions],
  ] as const;
  for (const [name, value] of collections) {
    if (!Array.isArray(value)) throw new Error(`ANIMATION_RUNTIME_GRAPH_${name.toUpperCase()}_INVALID`);
    for (const [index, entry] of value.entries()) {
      if (!entry || typeof entry !== "object") {
        throw new Error(`ANIMATION_RUNTIME_GRAPH_${name.toUpperCase()}_ENTRY_INVALID:${index}`);
      }
    }
  }
  for (const [index, parameter] of submitted.parameters.entries()) {
    if (typeof parameter.id !== "string") {
      throw new Error(`ANIMATION_RUNTIME_PARAMETER_ID_INVALID:${index}`);
    }
  }
  for (const [index, clip] of submitted.clips.entries()) {
    if (
      typeof clip.id !== "string" ||
      typeof clip.animationName !== "string" ||
      typeof clip.cameraProfileId !== "string" ||
      (clip.phaseFamily !== undefined && typeof clip.phaseFamily !== "string") ||
      !Array.isArray(clip.frameDurations) ||
      !Array.isArray(clip.asymmetricVisualAnchors) ||
      !Array.isArray(clip.markers)
    ) {
      throw new Error(`ANIMATION_RUNTIME_CLIP_SHAPE_INVALID:${index}`);
    }
    for (const [markerIndex, marker] of clip.markers.entries()) {
      if (
        !marker ||
        typeof marker !== "object" ||
        typeof marker.id !== "string" ||
        (marker.payload !== undefined && typeof marker.payload !== "string")
      ) {
        throw new Error(`ANIMATION_RUNTIME_MARKER_SHAPE_INVALID:${index}:${markerIndex}`);
      }
    }
  }
  for (const [index, state] of submitted.states.entries()) {
    if (typeof state.id !== "string" || typeof state.clipId !== "string") {
      throw new Error(`ANIMATION_RUNTIME_STATE_SHAPE_INVALID:${index}`);
    }
  }
  for (const [index, transition] of submitted.transitions.entries()) {
    if (
      typeof transition.id !== "string" ||
      typeof transition.fromStateId !== "string" ||
      typeof transition.toStateId !== "string" ||
      !transition.trigger ||
      typeof transition.trigger !== "object" ||
      !Array.isArray(transition.conditions) ||
      (transition.markerId !== undefined && typeof transition.markerId !== "string") ||
      (transition.excludedFromStateIds !== undefined &&
        !Array.isArray(transition.excludedFromStateIds))
    ) {
      throw new Error(`ANIMATION_RUNTIME_TRANSITION_SHAPE_INVALID:${index}`);
    }
    if (
      (transition.trigger.kind === "command" && typeof transition.trigger.command !== "string") ||
      (transition.trigger.kind === "parameter" &&
        typeof transition.trigger.parameterId !== "string") ||
      !["automatic", "command", "parameter"].includes(transition.trigger.kind)
    ) {
      throw new Error(`ANIMATION_RUNTIME_TRANSITION_TRIGGER_INVALID:${index}`);
    }
    for (const [conditionIndex, condition] of transition.conditions.entries()) {
      if (!condition || typeof condition !== "object" || typeof condition.parameterId !== "string") {
        throw new Error(`ANIMATION_RUNTIME_CONDITION_SHAPE_INVALID:${index}:${conditionIndex}`);
      }
    }
  }
}
