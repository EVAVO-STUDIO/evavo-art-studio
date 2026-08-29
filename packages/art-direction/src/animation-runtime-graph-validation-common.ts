import {
  ANIMATION_RUNTIME_GRAPH_KIND,
  ANIMATION_RUNTIME_GRAPH_PROTOCOL_VERSION,
  ANIMATION_RUNTIME_PARAMETER_TYPES,
  type AnimationRuntimeFinding,
  type AnimationRuntimeFindingSeverity,
  type AnimationRuntimeGraphRequest,
  type AnimationRuntimeParameter,
  type AnimationRuntimeTransitionTrigger,
} from "./animation-runtime-graph-types.js";

export const ANIMATION_RUNTIME_SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
export const ANIMATION_RUNTIME_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const ANIMATION_RUNTIME_EPSILON = 1e-9;

export function finding(
  findings: AnimationRuntimeFinding[],
  code: string,
  severity: AnimationRuntimeFindingSeverity,
  path: string,
  message: string,
  remediation: string,
): void {
  findings.push({ code, severity, path, message, remediation });
}

export function assertAnimationRuntimeSafeId(value: string, code: string): void {
  if (!ANIMATION_RUNTIME_SAFE_ID_PATTERN.test(value)) throw new Error(code);
}

export function assertAnimationRuntimePositiveInteger(value: number, code: string, maximum = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(code);
}

export function assertFinitePositive(value: number, code: string, maximum = Number.MAX_VALUE): void {
  if (!Number.isFinite(value) || value <= 0 || value > maximum) throw new Error(code);
}

function normaliseTrigger(trigger: AnimationRuntimeTransitionTrigger): AnimationRuntimeTransitionTrigger {
  if (trigger.kind === "automatic") return { kind: "automatic" };
  if (trigger.kind === "command") return { kind: "command", command: trigger.command.trim() };
  return { kind: "parameter", parameterId: trigger.parameterId.trim() };
}

export function normaliseAnimationRuntimeGraphRequest(request: AnimationRuntimeGraphRequest): AnimationRuntimeGraphRequest {
  return {
    ...request,
    id: request.id.trim(),
    subjectId: request.subjectId.trim(),
    cameraProfileId: request.cameraProfileId.trim(),
    initialStateId: request.initialStateId.trim(),
    allowUnreachableStates: request.allowUnreachableStates ?? false,
    parameters: [...request.parameters]
      .map((entry) => ({ ...entry, id: entry.id.trim() }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    clips: [...request.clips]
      .map((clip) => ({
        ...clip,
        id: clip.id.trim(),
        animationName: clip.animationName.trim(),
        cameraProfileId: clip.cameraProfileId.trim(),
        ...(clip.phaseFamily ? { phaseFamily: clip.phaseFamily.trim() } : {}),
        asymmetricVisualAnchors: [...clip.asymmetricVisualAnchors]
          .map((entry) => entry.trim())
          .sort(),
        markers: [...clip.markers]
          .map((marker) => ({
            ...marker,
            id: marker.id.trim(),
            ...(marker.payload ? { payload: marker.payload.trim() } : {}),
          }))
          .sort((left, right) => left.frame - right.frame || left.id.localeCompare(right.id)),
        frameDurations: [...clip.frameDurations],
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    states: [...request.states]
      .map((state) => ({ ...state, id: state.id.trim(), clipId: state.clipId.trim() }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    transitions: [...request.transitions]
      .map((transition) => ({
        ...transition,
        id: transition.id.trim(),
        fromStateId: transition.fromStateId === "*" ? "*" : transition.fromStateId.trim(),
        toStateId: transition.toStateId.trim(),
        trigger: normaliseTrigger(transition.trigger),
        ...(transition.markerId ? { markerId: transition.markerId.trim() } : {}),
        ...(transition.excludedFromStateIds
          ? { excludedFromStateIds: [...transition.excludedFromStateIds].map((entry) => entry.trim()).sort() }
          : {}),
        conditions: [...transition.conditions]
          .map((condition) => ({ ...condition, parameterId: condition.parameterId.trim() }))
          .sort((left, right) =>
            left.parameterId.localeCompare(right.parameterId) ||
            left.operator.localeCompare(right.operator) ||
            String(left.value).localeCompare(String(right.value)),
          ),
      }))
      .sort((left, right) =>
        left.fromStateId.localeCompare(right.fromStateId) ||
        left.priority - right.priority ||
        left.id.localeCompare(right.id),
      ),
  };
}

export function validateAnimationRuntimeGraphTopLevel(request: AnimationRuntimeGraphRequest): void {
  if (request.protocolVersion !== ANIMATION_RUNTIME_GRAPH_PROTOCOL_VERSION) {
    throw new Error("ANIMATION_RUNTIME_GRAPH_PROTOCOL_UNSUPPORTED");
  }
  if (request.kind !== ANIMATION_RUNTIME_GRAPH_KIND) {
    throw new Error("ANIMATION_RUNTIME_GRAPH_KIND_INVALID");
  }
  assertAnimationRuntimeSafeId(request.id, "ANIMATION_RUNTIME_GRAPH_ID_INVALID");
  assertAnimationRuntimeSafeId(request.subjectId, "ANIMATION_RUNTIME_GRAPH_SUBJECT_ID_INVALID");
  assertAnimationRuntimeSafeId(request.cameraProfileId, "ANIMATION_RUNTIME_GRAPH_CAMERA_PROFILE_ID_INVALID");
  assertAnimationRuntimeSafeId(request.initialStateId, "ANIMATION_RUNTIME_GRAPH_INITIAL_STATE_ID_INVALID");
  assertAnimationRuntimePositiveInteger(request.revision, "ANIMATION_RUNTIME_GRAPH_REVISION_INVALID", 1_000_000);
  if (request.allowUnreachableStates !== undefined && typeof request.allowUnreachableStates !== "boolean") {
    throw new Error("ANIMATION_RUNTIME_GRAPH_ALLOW_UNREACHABLE_INVALID");
  }
  if (request.clips.length === 0) throw new Error("ANIMATION_RUNTIME_GRAPH_CLIPS_REQUIRED");
  if (request.states.length === 0) throw new Error("ANIMATION_RUNTIME_GRAPH_STATES_REQUIRED");
  if (
    request.parameters.length > 1_024 ||
    request.clips.length > 512 ||
    request.states.length > 512 ||
    request.transitions.length > 4_096
  ) {
    throw new Error("ANIMATION_RUNTIME_GRAPH_SIZE_LIMIT_EXCEEDED");
  }
}

export function validateParameters(
  parameters: readonly AnimationRuntimeParameter[],
  findings: AnimationRuntimeFinding[],
): ReadonlyMap<string, AnimationRuntimeParameter> {
  const map = new Map<string, AnimationRuntimeParameter>();
  for (const [index, parameter] of parameters.entries()) {
    assertAnimationRuntimeSafeId(parameter.id, `ANIMATION_RUNTIME_PARAMETER_ID_INVALID:${index}`);
    if (!ANIMATION_RUNTIME_PARAMETER_TYPES.includes(parameter.type)) {
      throw new Error(`ANIMATION_RUNTIME_PARAMETER_TYPE_INVALID:${index}`);
    }
    if (map.has(parameter.id)) throw new Error(`ANIMATION_RUNTIME_PARAMETER_ID_DUPLICATE:${parameter.id}`);
    if (parameter.type === "boolean" && typeof parameter.defaultValue !== "boolean") {
      throw new Error(`ANIMATION_RUNTIME_PARAMETER_DEFAULT_INVALID:${parameter.id}`);
    }
    if (
      parameter.type === "number" &&
      (typeof parameter.defaultValue !== "number" || !Number.isFinite(parameter.defaultValue))
    ) {
      throw new Error(`ANIMATION_RUNTIME_PARAMETER_DEFAULT_INVALID:${parameter.id}`);
    }
    if (parameter.type === "trigger" && parameter.defaultValue !== null) {
      throw new Error(`ANIMATION_RUNTIME_PARAMETER_DEFAULT_INVALID:${parameter.id}`);
    }
    map.set(parameter.id, parameter);
  }
  if (parameters.filter((entry) => entry.type === "trigger").length > 256) {
    finding(
      findings,
      "ANIMATION_RUNTIME_TRIGGER_PARAMETER_COUNT_HIGH",
      "warning",
      "parameters",
      "The graph declares more than 256 trigger parameters.",
      "Prefer reusable command triggers or divide the character into smaller runtime graph layers.",
    );
  }
  return map;
}
