import { ANIMATION_RUNTIME_SWITCH_MODES } from "./animation-runtime-graph-types.js";
import type {
  AnimationRuntimeClip,
  AnimationRuntimeFinding,
  AnimationRuntimeGraphRequest,
  AnimationRuntimeParameter,
  AnimationRuntimeState,
  AnimationRuntimeTransition,
} from "./animation-runtime-graph-types.js";
import {
  ANIMATION_RUNTIME_EPSILON,
  assertAnimationRuntimeSafeId,
  finding,
} from "./animation-runtime-graph-validation-common.js";
import {
  animationRuntimeTransitionAppliesToState,
  circularPhaseDistance,
  conditionIdentity,
  conditionSetSatisfiable,
  triggerIdentity,
  validateCondition,
  weightedFrameStartPhase,
} from "./animation-runtime-graph-transition-support.js";

function expandedAutomaticEdges(
  states: readonly AnimationRuntimeState[],
  transitions: readonly AnimationRuntimeTransition[],
): ReadonlyMap<string, readonly string[]> {
  const edges = new Map<string, string[]>();
  for (const state of states) edges.set(state.id, []);
  for (const transition of transitions) {
    if (
      transition.trigger.kind !== "automatic" ||
      transition.conditions.length > 0 ||
      (transition.switchMode !== "immediate" && transition.switchMode !== "synchronized")
    ) {
      continue;
    }
    for (const state of states) {
      if (animationRuntimeTransitionAppliesToState(transition, state.id)) {
        edges.get(state.id)?.push(transition.toStateId);
      }
    }
  }
  return edges;
}

function automaticCycle(edges: ReadonlyMap<string, readonly string[]>): readonly string[] | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (stateId: string): readonly string[] | null => {
    if (visiting.has(stateId)) {
      const start = stack.indexOf(stateId);
      return [...stack.slice(start), stateId];
    }
    if (visited.has(stateId)) return null;
    visiting.add(stateId);
    stack.push(stateId);
    for (const target of edges.get(stateId) ?? []) {
      const found = visit(target);
      if (found) return found;
    }
    stack.pop();
    visiting.delete(stateId);
    visited.add(stateId);
    return null;
  };

  for (const stateId of edges.keys()) {
    const found = visit(stateId);
    if (found) return found;
  }
  return null;
}

export function validateTransitions(
  request: AnimationRuntimeGraphRequest,
  states: ReadonlyMap<string, AnimationRuntimeState>,
  clips: ReadonlyMap<string, AnimationRuntimeClip>,
  parameters: ReadonlyMap<string, AnimationRuntimeParameter>,
  findings: AnimationRuntimeFinding[],
): void {
  const ids = new Set<string>();
  for (const [index, transition] of request.transitions.entries()) {
    const path = `transitions[${index}]`;
    assertAnimationRuntimeSafeId(transition.id, `ANIMATION_RUNTIME_TRANSITION_ID_INVALID:${index}`);
    if (ids.has(transition.id)) throw new Error(`ANIMATION_RUNTIME_TRANSITION_ID_DUPLICATE:${transition.id}`);
    ids.add(transition.id);
    if (transition.fromStateId !== "*") {
      assertAnimationRuntimeSafeId(transition.fromStateId, `ANIMATION_RUNTIME_TRANSITION_FROM_INVALID:${transition.id}`);
      if (!states.has(transition.fromStateId)) {
        throw new Error(`ANIMATION_RUNTIME_TRANSITION_FROM_UNKNOWN:${transition.id}:${transition.fromStateId}`);
      }
      if ((transition.excludedFromStateIds ?? []).length > 0) {
        throw new Error(`ANIMATION_RUNTIME_TRANSITION_EXCLUSIONS_REQUIRE_WILDCARD:${transition.id}`);
      }
    }
    assertAnimationRuntimeSafeId(transition.toStateId, `ANIMATION_RUNTIME_TRANSITION_TO_INVALID:${transition.id}`);
    if (!states.has(transition.toStateId)) {
      throw new Error(`ANIMATION_RUNTIME_TRANSITION_TO_UNKNOWN:${transition.id}:${transition.toStateId}`);
    }
    if (!Number.isSafeInteger(transition.priority) || transition.priority < 0 || transition.priority > 1_000_000) {
      throw new Error(`ANIMATION_RUNTIME_TRANSITION_PRIORITY_INVALID:${transition.id}`);
    }
    if (!ANIMATION_RUNTIME_SWITCH_MODES.includes(transition.switchMode)) {
      throw new Error(`ANIMATION_RUNTIME_TRANSITION_SWITCH_MODE_INVALID:${transition.id}`);
    }
    if (typeof transition.resetTarget !== "boolean" || typeof transition.preserveCyclePhase !== "boolean") {
      throw new Error(`ANIMATION_RUNTIME_TRANSITION_BOOLEAN_INVALID:${transition.id}`);
    }
    if (transition.trigger.kind === "command") {
      assertAnimationRuntimeSafeId(transition.trigger.command, `ANIMATION_RUNTIME_TRANSITION_COMMAND_INVALID:${transition.id}`);
    } else if (transition.trigger.kind === "parameter") {
      assertAnimationRuntimeSafeId(transition.trigger.parameterId, `ANIMATION_RUNTIME_TRANSITION_PARAMETER_INVALID:${transition.id}`);
      const parameter = parameters.get(transition.trigger.parameterId);
      if (!parameter) {
        throw new Error(`ANIMATION_RUNTIME_TRANSITION_PARAMETER_UNKNOWN:${transition.id}:${transition.trigger.parameterId}`);
      }
      if (parameter.type === "number") {
        throw new Error(`ANIMATION_RUNTIME_TRANSITION_NUMBER_TRIGGER_FORBIDDEN:${transition.id}`);
      }
    } else if (transition.trigger.kind !== "automatic") {
      throw new Error(`ANIMATION_RUNTIME_TRANSITION_TRIGGER_INVALID:${transition.id}`);
    }
    const excluded = transition.excludedFromStateIds ?? [];
    if (new Set(excluded).size !== excluded.length) {
      throw new Error(`ANIMATION_RUNTIME_TRANSITION_EXCLUSION_DUPLICATE:${transition.id}`);
    }
    for (const stateId of excluded) {
      assertAnimationRuntimeSafeId(stateId, `ANIMATION_RUNTIME_TRANSITION_EXCLUSION_INVALID:${transition.id}`);
      if (!states.has(stateId)) {
        throw new Error(`ANIMATION_RUNTIME_TRANSITION_EXCLUSION_UNKNOWN:${transition.id}:${stateId}`);
      }
    }
    const conditionKeys = new Set<string>();
    for (const [conditionIndex, condition] of transition.conditions.entries()) {
      validateCondition(condition, parameters, transition.id, conditionIndex);
      const key = `${condition.parameterId}|${condition.operator}|${String(condition.value)}`;
      if (conditionKeys.has(key)) {
        throw new Error(`ANIMATION_RUNTIME_CONDITION_DUPLICATE:${transition.id}:${condition.parameterId}`);
      }
      conditionKeys.add(key);
    }
    if (!conditionSetSatisfiable(transition, parameters)) {
      finding(
        findings,
        "ANIMATION_RUNTIME_TRANSITION_CONDITIONS_UNSATISFIABLE",
        "blocking",
        `${path}.conditions`,
        `Transition ${transition.id} has conditions that cannot be true together.`,
        "Remove contradictory bounds or separate the intended behaviours into distinct transitions.",
      );
    }

    const sourceStates = [...states.values()].filter((state) => animationRuntimeTransitionAppliesToState(transition, state.id));
    if (sourceStates.length === 0) {
      finding(
        findings,
        "ANIMATION_RUNTIME_TRANSITION_HAS_NO_SOURCE",
        "blocking",
        path,
        `Transition ${transition.id} cannot apply to any state after exclusions.`,
        "Remove unnecessary exclusions or bind the transition to an existing source state.",
      );
    }

    for (const sourceState of sourceStates) {
      const sourceClip = clips.get(sourceState.clipId);
      const targetState = states.get(transition.toStateId);
      const targetClip = targetState ? clips.get(targetState.clipId) : undefined;
      if (!sourceClip || !targetState || !targetClip) continue;

      if (transition.switchMode === "at-end" && sourceClip.loopMode !== "none") {
        finding(
          findings,
          "ANIMATION_RUNTIME_AT_END_FROM_LOOPING_CLIP",
          "blocking",
          `${path}.switchMode`,
          `Transition ${transition.id} waits for the end of looping clip ${sourceClip.id}.`,
          "Use a marker gate, command, synchronized switch or a non-looping source clip.",
        );
      }
      if (transition.switchMode === "at-marker") {
        if (!transition.markerId) {
          finding(
            findings,
            "ANIMATION_RUNTIME_MARKER_REQUIRED",
            "blocking",
            `${path}.markerId`,
            `Transition ${transition.id} uses at-marker switching without a marker id.`,
            "Reference an event marker declared by every applicable source clip.",
          );
        } else if (!sourceClip.markers.some((marker) => marker.id === transition.markerId)) {
          finding(
            findings,
            "ANIMATION_RUNTIME_MARKER_UNKNOWN",
            "blocking",
            `${path}.markerId`,
            `Source clip ${sourceClip.id} does not declare marker ${transition.markerId}.`,
            "Use a shared marker identity or split the wildcard transition by source clip.",
          );
        }
      } else if (transition.markerId !== undefined) {
        finding(
          findings,
          "ANIMATION_RUNTIME_MARKER_UNUSED",
          "warning",
          `${path}.markerId`,
          `Transition ${transition.id} declares a marker outside at-marker mode.`,
          "Remove the marker id or change the switch mode to at-marker.",
        );
      }
      if (transition.switchMode === "synchronized" && !transition.preserveCyclePhase) {
        finding(
          findings,
          "ANIMATION_RUNTIME_SYNCHRONIZED_PHASE_REQUIRED",
          "blocking",
          `${path}.preserveCyclePhase`,
          `Transition ${transition.id} uses synchronized switching without explicit phase preservation.`,
          "Set preserveCyclePhase to true and bind compatible linear loop phase families, or use immediate switching.",
        );
      }
      if (transition.preserveCyclePhase) {
        if (transition.switchMode !== "synchronized") {
          finding(
            findings,
            "ANIMATION_RUNTIME_PHASE_CARRY_SWITCH_MODE_INVALID",
            "blocking",
            `${path}.preserveCyclePhase`,
            `Transition ${transition.id} requests phase carry without synchronized switching.`,
            "Use synchronized switching or disable phase preservation.",
          );
        }
        if (
          !sourceClip.phaseFamily ||
          !targetClip.phaseFamily ||
          sourceClip.phaseFamily !== targetClip.phaseFamily ||
          sourceClip.loopMode !== "linear" ||
          targetClip.loopMode !== "linear"
        ) {
          finding(
            findings,
            "ANIMATION_RUNTIME_PHASE_FAMILY_MISMATCH",
            "blocking",
            `${path}.preserveCyclePhase`,
            `Transition ${transition.id} cannot carry phase between ${sourceClip.id} and ${targetClip.id}.`,
            "Bind both linear-loop clips to the same authored phase family or reset the target clip.",
          );
        }
        if (transition.resetTarget) {
          finding(
            findings,
            "ANIMATION_RUNTIME_PHASE_CARRY_RESET_CONFLICT",
            "blocking",
            `${path}.resetTarget`,
            `Transition ${transition.id} cannot reset the target while preserving cycle phase.`,
            "Set resetTarget to false for synchronized phase carry.",
          );
        }
        const contactKinds = ["left-contact", "right-contact"] as const;
        const sourceContactCount = sourceClip.markers.filter((marker) =>
          contactKinds.includes(marker.kind as (typeof contactKinds)[number]),
        ).length;
        const targetContactCount = targetClip.markers.filter((marker) =>
          contactKinds.includes(marker.kind as (typeof contactKinds)[number]),
        ).length;
        if (sourceContactCount > 0 || targetContactCount > 0) {
          for (const kind of contactKinds) {
            const sourceMarkers = sourceClip.markers.filter((marker) => marker.kind === kind);
            const targetMarkers = targetClip.markers.filter((marker) => marker.kind === kind);
            if (sourceMarkers.length !== 1 || targetMarkers.length !== 1) {
              finding(
                findings,
                "ANIMATION_RUNTIME_CONTACT_MARKER_PARITY_INVALID",
                "blocking",
                `${path}.preserveCyclePhase`,
                `Transition ${transition.id} requires exactly one ${kind} marker in each phase-linked clip.`,
                "Author one matching left-contact and right-contact marker per biped locomotion cycle.",
              );
              continue;
            }
            const sourceMarker = sourceMarkers[0];
            const targetMarker = targetMarkers[0];
            if (!sourceMarker || !targetMarker) continue;
            const distance = circularPhaseDistance(
              weightedFrameStartPhase(sourceClip, sourceMarker.frame),
              weightedFrameStartPhase(targetClip, targetMarker.frame),
            );
            if (distance > 0.125 + ANIMATION_RUNTIME_EPSILON) {
              finding(
                findings,
                "ANIMATION_RUNTIME_CONTACT_PHASE_MISMATCH",
                "blocking",
                `${path}.preserveCyclePhase`,
                `Transition ${transition.id} shifts ${kind} by ${distance.toFixed(6)} of a cycle.`,
                "Retiming one clip or move its contact marker so synchronized phase carry preserves the planted foot.",
              );
            }
          }
        }
      }
      if (sourceState.terminal) {
        finding(
          findings,
          "ANIMATION_RUNTIME_TERMINAL_STATE_HAS_TRANSITION",
          "blocking",
          path,
          `Terminal state ${sourceState.id} can take transition ${transition.id}.`,
          "Exclude terminal states from wildcard transitions and remove direct outgoing transitions.",
        );
      }
    }
  }

  for (const state of states.values()) {
    const signatures = new Map<string, AnimationRuntimeTransition>();
    const priorities = new Map<number, AnimationRuntimeTransition[]>();
    const candidates = request.transitions.filter((transition) => animationRuntimeTransitionAppliesToState(transition, state.id));
    for (const transition of candidates) {
      const signature = `${triggerIdentity(transition.trigger)}|${transition.priority}|${transition.switchMode}|${transition.markerId ?? ""}|${conditionIdentity(transition.conditions)}`;
      const previous = signatures.get(signature);
      if (previous) {
        finding(
          findings,
          "ANIMATION_RUNTIME_TRANSITION_AMBIGUOUS",
          "blocking",
          `states.${state.id}`,
          `State ${state.id} has duplicate eligibility for transitions ${previous.id} and ${transition.id}.`,
          "Assign distinct priorities, triggers or conditions and keep only one transition for each eligibility signature.",
        );
      } else {
        signatures.set(signature, transition);
      }
      const sharedPriority = priorities.get(transition.priority) ?? [];
      sharedPriority.push(transition);
      priorities.set(transition.priority, sharedPriority);
    }
    for (const [priority, transitions] of priorities) {
      if (transitions.length < 2) continue;
      finding(
        findings,
        "ANIMATION_RUNTIME_TRANSITION_PRIORITY_SHARED",
        "warning",
        `states.${state.id}`,
        `State ${state.id} has ${transitions.length} transitions at priority ${priority}.`,
        "Prefer unique priorities whenever triggers may become active in the same update; transition id remains the deterministic tie-breaker.",
      );
    }
  }

  const cycle = automaticCycle(expandedAutomaticEdges([...states.values()], request.transitions));
  if (cycle) {
    finding(
      findings,
      "ANIMATION_RUNTIME_AUTOMATIC_TRANSITION_CYCLE",
      "blocking",
      "transitions",
      `Automatic transitions form a cycle: ${cycle.join(" -> ")}.`,
      "Replace at least one automatic edge with an explicit command, trigger or bounded marker gate.",
    );
  }
}
