import {
  ANIMATION_RUNTIME_GRAPH_KIND,
  ANIMATION_RUNTIME_GRAPH_PROTOCOL_VERSION,
  type AnimationRuntimeGraphPlan,
  type AnimationRuntimeGraphRequest,
  type AnimationRuntimeSwitchMode,
  type GodotAnimationRuntimeGraphDescriptor,
} from "./animation-runtime-graph-types.js";
import { animationRuntimeGraphDigest } from "./animation-runtime-graph-hash.js";
import {
  ANIMATION_RUNTIME_DIGEST_PATTERN,
  normaliseAnimationRuntimeGraphRequest,
  validateAnimationRuntimeGraphTopLevel,
} from "./animation-runtime-graph-validation-common.js";
import {
  assertAnimationRuntimeGraphInputShape,
  evaluateAnimationRuntimeGraph,
} from "./animation-runtime-graph-validation.js";

function digestInput(plan: Omit<AnimationRuntimeGraphPlan, "contentDigest" | "generatedAt">): unknown {
  return {
    protocolVersion: plan.protocolVersion,
    kind: plan.kind,
    id: plan.id,
    revision: plan.revision,
    subjectId: plan.subjectId,
    cameraProfileId: plan.cameraProfileId,
    initialStateId: plan.initialStateId,
    allowUnreachableStates: plan.allowUnreachableStates,
    parameters: plan.parameters,
    clips: plan.clips,
    states: plan.states,
    transitions: plan.transitions,
    quality: plan.quality,
    authority: plan.authority,
  };
}

export function compileAnimationRuntimeGraph(
  submitted: AnimationRuntimeGraphRequest,
  now = new Date(),
): AnimationRuntimeGraphPlan {
  if (!submitted || typeof submitted !== "object") {
    throw new Error("ANIMATION_RUNTIME_GRAPH_REQUEST_INVALID");
  }
  assertAnimationRuntimeGraphInputShape(submitted);
  for (const [field, value] of [
    ["id", submitted.id],
    ["subjectId", submitted.subjectId],
    ["cameraProfileId", submitted.cameraProfileId],
    ["initialStateId", submitted.initialStateId],
  ] as const) {
    if (typeof value !== "string") throw new Error(`ANIMATION_RUNTIME_GRAPH_${field.toUpperCase()}_INVALID`);
  }
  const request = normaliseAnimationRuntimeGraphRequest(submitted);
  validateAnimationRuntimeGraphTopLevel(request);
  const quality = evaluateAnimationRuntimeGraph(request);
  const body = {
    protocolVersion: ANIMATION_RUNTIME_GRAPH_PROTOCOL_VERSION,
    kind: ANIMATION_RUNTIME_GRAPH_KIND,
    id: request.id,
    revision: request.revision,
    subjectId: request.subjectId,
    cameraProfileId: request.cameraProfileId,
    initialStateId: request.initialStateId,
    allowUnreachableStates: request.allowUnreachableStates ?? false,
    parameters: request.parameters,
    clips: request.clips,
    states: request.states,
    transitions: request.transitions,
    quality,
    authority: {
      providerExecution: false as const,
      creativeApproval: false as const,
      runtimeActivation: false as const,
      repositoryMutation: false as const,
      publication: false as const,
    },
  };
  return {
    ...body,
    contentDigest: animationRuntimeGraphDigest(digestInput(body)),
    generatedAt: now.toISOString(),
  };
}

export function assertAnimationRuntimeGraphIntegrity(plan: AnimationRuntimeGraphPlan): void {
  if (plan.protocolVersion !== ANIMATION_RUNTIME_GRAPH_PROTOCOL_VERSION || plan.kind !== ANIMATION_RUNTIME_GRAPH_KIND) {
    throw new Error("ANIMATION_RUNTIME_GRAPH_PROTOCOL_INVALID");
  }
  if (!ANIMATION_RUNTIME_DIGEST_PATTERN.test(plan.contentDigest)) throw new Error("ANIMATION_RUNTIME_GRAPH_DIGEST_INVALID");
  const generatedAt = new Date(plan.generatedAt);
  if (Number.isNaN(generatedAt.valueOf()) || generatedAt.toISOString() !== plan.generatedAt) {
    throw new Error("ANIMATION_RUNTIME_GRAPH_GENERATED_AT_INVALID");
  }
  const expected = compileAnimationRuntimeGraph(
    {
      protocolVersion: plan.protocolVersion,
      kind: plan.kind,
      id: plan.id,
      revision: plan.revision,
      subjectId: plan.subjectId,
      cameraProfileId: plan.cameraProfileId,
      initialStateId: plan.initialStateId,
      allowUnreachableStates: plan.allowUnreachableStates,
      parameters: plan.parameters,
      clips: plan.clips,
      states: plan.states,
      transitions: plan.transitions,
    },
    generatedAt,
  );
  if (animationRuntimeGraphDigest(digestInput(plan)) !== plan.contentDigest || expected.contentDigest !== plan.contentDigest) {
    throw new Error("ANIMATION_RUNTIME_GRAPH_DIGEST_MISMATCH");
  }
  if (JSON.stringify(expected.quality) !== JSON.stringify(plan.quality)) {
    throw new Error("ANIMATION_RUNTIME_GRAPH_QUALITY_MISMATCH");
  }
}

function godotSwitchMode(mode: AnimationRuntimeSwitchMode): 0 | 1 | 2 {
  if (mode === "synchronized") return 1;
  if (mode === "at-end") return 2;
  return 0;
}

function runtimeGate(mode: AnimationRuntimeSwitchMode): "none" | "animation-finished" | "event-marker" {
  if (mode === "at-end") return "animation-finished";
  if (mode === "at-marker") return "event-marker";
  return "none";
}

export function compileGodotAnimationRuntimeGraph(
  plan: AnimationRuntimeGraphPlan,
): GodotAnimationRuntimeGraphDescriptor {
  assertAnimationRuntimeGraphIntegrity(plan);
  if (!plan.quality.promotable) {
    throw new Error(`ANIMATION_RUNTIME_GRAPH_NOT_PROMOTABLE:${plan.quality.blockerCount}`);
  }
  const clips = new Map(plan.clips.map((clip) => [clip.id, clip]));
  return {
    schemaVersion: "1.0",
    sourceProtocolVersion: plan.protocolVersion,
    sourcePlanDigest: plan.contentDigest,
    targetEngine: "Godot 4.6.2",
    driver: "animated-sprite2d-controller",
    blendMode: "discrete",
    initialStateId: plan.initialStateId,
    parameters: plan.parameters,
    states: plan.states.map((state) => {
      const clip = clips.get(state.clipId);
      if (!clip) throw new Error(`ANIMATION_RUNTIME_STATE_CLIP_UNKNOWN:${state.id}`);
      return {
        id: state.id,
        animationName: clip.animationName,
        entryFrame: state.entryFrame,
        speedScale: state.speedScale,
        terminal: state.terminal,
        loopMode: clip.loopMode,
        frameCount: clip.frameCount,
        framesPerSecond: clip.framesPerSecond,
        frameDurations: clip.frameDurations,
        totalDurationSeconds:
          clip.frameDurations.reduce((sum, duration) => sum + duration, 0) /
          (clip.framesPerSecond * state.speedScale),
      };
    }),
    transitions: plan.transitions.map((transition) => ({
      id: transition.id,
      fromStateId: transition.fromStateId,
      excludedFromStateIds: transition.excludedFromStateIds ?? [],
      toStateId: transition.toStateId,
      trigger: transition.trigger,
      priority: transition.priority,
      switchMode: transition.switchMode,
      godotSwitchModeValue: godotSwitchMode(transition.switchMode),
      runtimeGate: runtimeGate(transition.switchMode),
      ...(transition.markerId ? { markerId: transition.markerId } : {}),
      reset: transition.resetTarget,
      carryPlaybackPosition: transition.switchMode === "synchronized",
      conditions: transition.conditions,
    })),
    eventMarkers: plan.states.flatMap((state) => {
      const clip = clips.get(state.clipId);
      if (!clip) return [];
      return clip.markers.map((marker) => ({
        stateId: state.id,
        clipId: clip.id,
        animationName: clip.animationName,
        markerId: marker.id,
        frame: marker.frame,
        kind: marker.kind,
        ...(marker.payload ? { payload: marker.payload } : {}),
      }));
    }),
    controllerRequirements: [
      "Use discrete frame switching for frame-by-frame sprite animation.",
      "Treat lower numeric transition priority as the preferred transition.",
      "Consume trigger parameters once after a transition is selected.",
      "Dispatch event markers exactly once when their authored frame is entered.",
      "Use set_frame_and_progress when carrying synchronized cycle phase.",
      "Do not activate a graph whose source digest or quality report fails integrity verification.",
    ],
    authority: {
      runtimeExecution: false,
      runtimeActivation: false,
      creativeApproval: false,
    },
  };
}
