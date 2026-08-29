export const ANIMATION_RUNTIME_GRAPH_PROTOCOL_VERSION = "2026-08-30.1" as const;
export const ANIMATION_RUNTIME_GRAPH_KIND = "evavo.animation-runtime-graph" as const;

export const ANIMATION_RUNTIME_STATE_KINDS = [
  "idle",
  "locomotion",
  "traversal",
  "action",
  "reaction",
  "death",
  "dialogue",
  "emote",
  "effect",
  "custom",
] as const;
export const ANIMATION_RUNTIME_DIRECTIONS = [
  "none",
  "left",
  "right",
  "up",
  "down",
  "up-left",
  "up-right",
  "down-left",
  "down-right",
] as const;
export const ANIMATION_RUNTIME_LOOP_MODES = ["none", "linear", "ping-pong"] as const;
export const ANIMATION_RUNTIME_MIRROR_POLICIES = ["forbidden", "safe-horizontal"] as const;
export const ANIMATION_RUNTIME_PARAMETER_TYPES = ["boolean", "number", "trigger"] as const;
export const ANIMATION_RUNTIME_CONDITION_OPERATORS = [
  "equals",
  "not-equals",
  "greater-than",
  "greater-than-or-equal",
  "less-than",
  "less-than-or-equal",
] as const;
export const ANIMATION_RUNTIME_SWITCH_MODES = [
  "immediate",
  "synchronized",
  "at-end",
  "at-marker",
] as const;
export const ANIMATION_RUNTIME_MARKER_KINDS = [
  "left-contact",
  "right-contact",
  "takeoff",
  "landing",
  "cancel-open",
  "cancel-close",
  "hitbox-on",
  "hitbox-off",
  "projectile-release",
  "effect-spawn",
  "sound",
  "dialogue",
  "custom",
] as const;

export type AnimationRuntimeStateKind = (typeof ANIMATION_RUNTIME_STATE_KINDS)[number];
export type AnimationRuntimeDirection = (typeof ANIMATION_RUNTIME_DIRECTIONS)[number];
export type AnimationRuntimeLoopMode = (typeof ANIMATION_RUNTIME_LOOP_MODES)[number];
export type AnimationRuntimeMirrorPolicy = (typeof ANIMATION_RUNTIME_MIRROR_POLICIES)[number];
export type AnimationRuntimeParameterType = (typeof ANIMATION_RUNTIME_PARAMETER_TYPES)[number];
export type AnimationRuntimeConditionOperator =
  (typeof ANIMATION_RUNTIME_CONDITION_OPERATORS)[number];
export type AnimationRuntimeSwitchMode = (typeof ANIMATION_RUNTIME_SWITCH_MODES)[number];
export type AnimationRuntimeMarkerKind = (typeof ANIMATION_RUNTIME_MARKER_KINDS)[number];
export type AnimationRuntimeFindingSeverity = "warning" | "blocking";
export type AnimationRuntimeDigest = `sha256:${string}`;

export interface AnimationRuntimeEventMarker {
  readonly id: string;
  readonly frame: number;
  readonly kind: AnimationRuntimeMarkerKind;
  readonly payload?: string;
}

export interface AnimationRuntimeClip {
  readonly id: string;
  readonly animationName: string;
  readonly kind: AnimationRuntimeStateKind;
  readonly direction: AnimationRuntimeDirection;
  readonly cameraProfileId: string;
  readonly sourcePlanDigest: AnimationRuntimeDigest;
  readonly frameCount: number;
  readonly framesPerSecond: number;
  readonly frameDurations: readonly number[];
  readonly loopMode: AnimationRuntimeLoopMode;
  readonly phaseFamily?: string;
  readonly mirrorPolicy: AnimationRuntimeMirrorPolicy;
  readonly asymmetricVisualAnchors: readonly string[];
  readonly markers: readonly AnimationRuntimeEventMarker[];
}

export interface AnimationRuntimeState {
  readonly id: string;
  readonly clipId: string;
  readonly entryFrame: number;
  readonly speedScale: number;
  readonly terminal: boolean;
}

export interface AnimationRuntimeParameter {
  readonly id: string;
  readonly type: AnimationRuntimeParameterType;
  readonly defaultValue: boolean | number | null;
}

export interface AnimationRuntimeCondition {
  readonly parameterId: string;
  readonly operator: AnimationRuntimeConditionOperator;
  readonly value: boolean | number;
}

export type AnimationRuntimeTransitionTrigger =
  | Readonly<{ kind: "automatic" }>
  | Readonly<{ kind: "command"; command: string }>
  | Readonly<{ kind: "parameter"; parameterId: string }>;

export interface AnimationRuntimeTransition {
  readonly id: string;
  readonly fromStateId: string | "*";
  readonly excludedFromStateIds?: readonly string[];
  readonly toStateId: string;
  readonly trigger: AnimationRuntimeTransitionTrigger;
  readonly priority: number;
  readonly switchMode: AnimationRuntimeSwitchMode;
  readonly markerId?: string;
  readonly resetTarget: boolean;
  readonly preserveCyclePhase: boolean;
  readonly conditions: readonly AnimationRuntimeCondition[];
}

export interface AnimationRuntimeGraphRequest {
  readonly protocolVersion: typeof ANIMATION_RUNTIME_GRAPH_PROTOCOL_VERSION;
  readonly kind: typeof ANIMATION_RUNTIME_GRAPH_KIND;
  readonly id: string;
  readonly revision: number;
  readonly subjectId: string;
  readonly cameraProfileId: string;
  readonly initialStateId: string;
  readonly allowUnreachableStates?: boolean;
  readonly parameters: readonly AnimationRuntimeParameter[];
  readonly clips: readonly AnimationRuntimeClip[];
  readonly states: readonly AnimationRuntimeState[];
  readonly transitions: readonly AnimationRuntimeTransition[];
}

export interface AnimationRuntimeFinding {
  readonly code: string;
  readonly severity: AnimationRuntimeFindingSeverity;
  readonly path: string;
  readonly message: string;
  readonly remediation: string;
}

export interface AnimationRuntimeGraphQuality {
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly findings: readonly AnimationRuntimeFinding[];
  readonly reachableStateIds: readonly string[];
  readonly unreachableStateIds: readonly string[];
  readonly promotable: boolean;
}

export interface AnimationRuntimeGraphPlan {
  readonly protocolVersion: typeof ANIMATION_RUNTIME_GRAPH_PROTOCOL_VERSION;
  readonly kind: typeof ANIMATION_RUNTIME_GRAPH_KIND;
  readonly id: string;
  readonly revision: number;
  readonly subjectId: string;
  readonly cameraProfileId: string;
  readonly initialStateId: string;
  readonly allowUnreachableStates: boolean;
  readonly parameters: readonly AnimationRuntimeParameter[];
  readonly clips: readonly AnimationRuntimeClip[];
  readonly states: readonly AnimationRuntimeState[];
  readonly transitions: readonly AnimationRuntimeTransition[];
  readonly quality: AnimationRuntimeGraphQuality;
  readonly contentDigest: AnimationRuntimeDigest;
  readonly generatedAt: string;
  readonly authority: Readonly<{
    providerExecution: false;
    creativeApproval: false;
    runtimeActivation: false;
    repositoryMutation: false;
    publication: false;
  }>;
}

export interface GodotAnimationRuntimeGraphDescriptor {
  readonly schemaVersion: "1.0";
  readonly sourceProtocolVersion: typeof ANIMATION_RUNTIME_GRAPH_PROTOCOL_VERSION;
  readonly sourcePlanDigest: AnimationRuntimeDigest;
  readonly targetEngine: "Godot 4.6.2";
  readonly driver: "animated-sprite2d-controller";
  readonly blendMode: "discrete";
  readonly initialStateId: string;
  readonly parameters: readonly AnimationRuntimeParameter[];
  readonly states: readonly Readonly<{
    id: string;
    animationName: string;
    entryFrame: number;
    speedScale: number;
    terminal: boolean;
    loopMode: AnimationRuntimeLoopMode;
    frameCount: number;
    framesPerSecond: number;
    frameDurations: readonly number[];
    totalDurationSeconds: number;
  }>[];
  readonly transitions: readonly Readonly<{
    id: string;
    fromStateId: string | "*";
    excludedFromStateIds: readonly string[];
    toStateId: string;
    trigger: AnimationRuntimeTransitionTrigger;
    priority: number;
    switchMode: AnimationRuntimeSwitchMode;
    godotSwitchModeValue: 0 | 1 | 2;
    runtimeGate: "none" | "animation-finished" | "event-marker";
    markerId?: string;
    reset: boolean;
    carryPlaybackPosition: boolean;
    conditions: readonly AnimationRuntimeCondition[];
  }>[];
  readonly eventMarkers: readonly Readonly<{
    stateId: string;
    clipId: string;
    animationName: string;
    markerId: string;
    frame: number;
    kind: AnimationRuntimeMarkerKind;
    payload?: string;
  }>[];
  readonly controllerRequirements: readonly string[];
  readonly authority: Readonly<{
    runtimeExecution: false;
    runtimeActivation: false;
    creativeApproval: false;
  }>;
}

export interface ResolveAnimationRuntimeTransitionInput {
  readonly plan: AnimationRuntimeGraphPlan;
  readonly currentStateId: string;
  readonly currentFrame: number;
  readonly frameProgress?: number;
  readonly atEnd?: boolean;
  readonly firedMarkerIds?: readonly string[];
  readonly activeCommands?: readonly string[];
  readonly activeTriggers?: readonly string[];
  readonly parameterValues?: Readonly<Record<string, boolean | number>>;
}

export interface ResolvedAnimationRuntimeTransition {
  readonly transitionId: string;
  readonly fromStateId: string;
  readonly toStateId: string;
  readonly targetFrame: number;
  readonly targetFrameProgress: number;
  readonly carriedCyclePhase: number | null;
  readonly resetTarget: boolean;
}
