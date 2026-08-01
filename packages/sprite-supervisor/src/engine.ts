import {
  normalizeJson,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";
import type {
  RuntimeJobRecord,
  RuntimeJobSubmission,
} from "@evavo/art-runtime";

import {
  SPRITE_SUPERVISOR_PROTOCOL_VERSION,
  SpriteSupervisorError,
  type NormalizedSpriteSupervisorCompileRequest,
  type NormalizedSpriteSupervisorReviewResolution,
  type NormalizedSpriteSupervisorTask,
  type SpriteSupervisorDecision,
  type SpriteSupervisorFailureAction,
  type SpriteSupervisorState,
  type SpriteSupervisorTaskState,
} from "./types.js";
import { spriteSupervisorSha256 } from "./validation.js";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;

function nowIso(now: Date): string {
  if (!Number.isFinite(now.getTime())) {
    throw new SpriteSupervisorError(
      "SPRITE_SUPERVISOR_TIME_INVALID",
      "Supervisor time must be a valid Date.",
    );
  }
  return now.toISOString();
}

function pointerSegments(pointer: string): readonly string[] {
  if (!pointer) return [];
  if (!pointer.startsWith("/")) {
    throw new SpriteSupervisorError(
      "SPRITE_SUPERVISOR_POINTER_INVALID",
      `JSON pointer must begin with '/': ${pointer}`,
    );
  }
  return pointer
    .slice(1)
    .split("/")
    .map((entry) => entry.replace(/~1/g, "/").replace(/~0/g, "~"));
}

export function valueAtJsonPointer(value: unknown, pointer: string): unknown {
  let current = value;
  for (const segment of pointerSegments(pointer)) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function planValue(request: NormalizedSpriteSupervisorCompileRequest, pointer: string): unknown {
  return valueAtJsonPointer(request.spritePlan, pointer);
}

function roleArtifacts(
  state: SpriteSupervisorState,
  role: string,
): readonly ArtifactId[] {
  return state.artifactBindings[role] ?? [];
}

function materializeValue(
  value: JsonValue,
  request: NormalizedSpriteSupervisorCompileRequest,
  state: SpriteSupervisorState,
  task: NormalizedSpriteSupervisorTask,
): JsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => materializeValue(entry, request, state, task));
  }
  if (typeof value !== "object" || value === null) return value;
  const source = value as Readonly<Record<string, JsonValue>>;
  const keys = Object.keys(source);
  if (keys.length === 1 && typeof source.$artifact === "string") {
    const artifacts = roleArtifacts(state, source.$artifact);
    if (artifacts.length !== 1) {
      throw new SpriteSupervisorError(
        "SPRITE_SUPERVISOR_ARTIFACT_CARDINALITY_INVALID",
        `Placeholder $artifact:${source.$artifact} requires exactly one bound artifact; found ${artifacts.length}.`,
      );
    }
    return artifacts[0]!;
  }
  if (keys.length === 1 && typeof source.$artifacts === "string") {
    const artifacts = roleArtifacts(state, source.$artifacts);
    if (!artifacts.length) {
      throw new SpriteSupervisorError(
        "SPRITE_SUPERVISOR_ARTIFACT_BINDING_MISSING",
        `Placeholder $artifacts:${source.$artifacts} has no bound artifacts.`,
      );
    }
    return artifacts;
  }
  if (keys.length === 1 && typeof source.$plan === "string") {
    const resolved = planValue(request, source.$plan);
    if (resolved === undefined) {
      throw new SpriteSupervisorError(
        "SPRITE_SUPERVISOR_PLAN_POINTER_MISSING",
        `Plan pointer did not resolve: ${source.$plan}`,
      );
    }
    return normalizeJson(resolved);
  }
  if (keys.length === 1 && typeof source.$run === "string") {
    const runValue = source.$run;
    if (runValue === "runId") return request.runId;
    if (runValue === "tick") return state.tick;
    if (runValue === "taskId") return task.id;
    if (runValue === "taskCycle") return state.taskStates[task.id]?.cycle ?? 0;
    if (runValue === "workflowSha256") return state.workflowSha256;
    throw new SpriteSupervisorError(
      "SPRITE_SUPERVISOR_RUN_PLACEHOLDER_INVALID",
      `Unsupported $run placeholder: ${runValue}`,
    );
  }
  const output: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(source)) {
    output[key] = materializeValue(entry, request, state, task);
  }
  return output;
}

export function materializeSupervisorTaskPayload(
  request: NormalizedSpriteSupervisorCompileRequest,
  state: SpriteSupervisorState,
  task: NormalizedSpriteSupervisorTask,
): JsonValue {
  return materializeValue(task.payloadTemplate, request, state, task);
}

export function createInitialSpriteSupervisorState(
  request: NormalizedSpriteSupervisorCompileRequest,
  workflowSha256: string,
  now = new Date(),
): SpriteSupervisorState {
  const at = nowIso(now);
  const artifactBindings: Record<string, readonly ArtifactId[]> = {};
  for (const binding of request.initialArtifactBindings) {
    artifactBindings[binding.role] = [...binding.artifactIds];
  }
  const taskStates: Record<string, SpriteSupervisorTaskState> = {};
  for (const task of request.tasks) {
    taskStates[task.id] = {
      taskId: task.id,
      status: task.triggeredByFailureOfTaskId ? "waiting" : "pending",
      cycle: 0,
      redrives: 0,
      repairCycles: 0,
      attempts: [],
      outputArtifactIds: [],
    };
  }
  return {
    schemaVersion: "1.0",
    protocolVersion: SPRITE_SUPERVISOR_PROTOCOL_VERSION,
    runId: request.runId,
    workflowSha256,
    spritePlanId: request.spritePlan.planId,
    spritePlanSha256: request.spritePlan.planSha256,
    status: "pending",
    tick: 0,
    startedAt: at,
    updatedAt: at,
    taskStates,
    artifactBindings,
    decisions: [
      {
        at,
        tick: 0,
        action: "initialise",
        reason: "Initialised immutable supervisor state from the compiled workflow.",
        data: normalizeJson({
          taskCount: request.tasks.length,
          seededArtifactRoles: Object.keys(artifactBindings).sort(),
        }),
      },
    ],
    appliedReviewResolutions: [],
    ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
  };
}

function succeededOrSkipped(status: SpriteSupervisorTaskState["status"]): boolean {
  return status === "succeeded" || status === "skipped";
}

export function supervisorTaskReady(
  request: NormalizedSpriteSupervisorCompileRequest,
  state: SpriteSupervisorState,
  task: NormalizedSpriteSupervisorTask,
): boolean {
  const taskState = state.taskStates[task.id];
  if (!taskState || taskState.status !== "pending") return false;
  if (task.triggeredByFailureOfTaskId) {
    const sourceState = state.taskStates[task.triggeredByFailureOfTaskId];
    if (!sourceState || sourceState.status !== "repairing") return false;
  } else {
    for (const dependencyId of task.dependencyTaskIds) {
      const dependency = state.taskStates[dependencyId];
      if (!dependency || !succeededOrSkipped(dependency.status)) return false;
    }
  }
  return task.requiredArtifactRoles.every(
    (role) => (state.artifactBindings[role]?.length ?? 0) > 0,
  );
}

export function materializeSupervisorChildSubmission(
  request: NormalizedSpriteSupervisorCompileRequest,
  state: SpriteSupervisorState,
  task: NormalizedSpriteSupervisorTask,
): RuntimeJobSubmission {
  const taskState = state.taskStates[task.id];
  if (!taskState) {
    throw new SpriteSupervisorError(
      "SPRITE_SUPERVISOR_TASK_STATE_MISSING",
      `Task state is missing for ${task.id}.`,
    );
  }
  const dependencyJobIds = task.dependencyTaskIds.flatMap((dependencyId) => {
    const dependency = state.taskStates[dependencyId];
    if (!dependency) return [];
    const latest = dependency.attempts.at(-1)?.childJobId;
    return latest ? [latest] : [];
  });
  const inputArtifacts = [
    ...task.staticInputArtifacts,
    ...task.requiredArtifactRoles.flatMap((role) => roleArtifacts(state, role)),
  ];
  return {
    queue: task.queue,
    kind: task.kind,
    idempotencyKey: `${request.runId}:${task.id}:cycle-${taskState.cycle}`,
    payload: materializeSupervisorTaskPayload(request, state, task),
    requiredCapabilities: task.requiredCapabilities,
    dependencyJobIds: [...new Set(dependencyJobIds)].sort(),
    inputArtifacts: [...new Set(inputArtifacts)].sort(),
    priority: task.priority,
    maximumAttempts: task.maximumAttempts,
    retryPolicy: task.retryPolicy,
    leaseDurationMs: task.leaseDurationMs,
    timeoutMs: task.timeoutMs,
    labels: {
      supervisorRunId: request.runId,
      supervisorTaskId: task.id,
      supervisorStage: task.stage,
      supervisorCycle: String(taskState.cycle),
      spritePlanId: request.spritePlan.planId,
      workflowSha256: state.workflowSha256,
    },
  };
}

function prefixMatch(code: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => code.startsWith(prefix));
}

export function decideSpriteSupervisorFailure(
  task: NormalizedSpriteSupervisorTask,
  taskState: SpriteSupervisorTaskState,
  failure: Readonly<{
    classification: RuntimeJobRecord["failure"] extends infer _T
      ? import("@evavo/art-runtime").RuntimeFailureClassification
      : never;
    code: string;
    message: string;
  }>,
): SpriteSupervisorFailureAction {
  const policy = task.failurePolicy;
  if (prefixMatch(failure.code, policy.abortCodePrefixes)) {
    return {
      action: "abort",
      reason: `Failure ${failure.code} matches an explicit abort rule.`,
    };
  }
  const transientByDefault = new Set([
    "transient",
    "lease-expired",
    "timeout",
  ]).has(failure.classification);
  if (
    taskState.redrives < policy.maxRedrives &&
    (transientByDefault ||
      policy.redriveClassifications.includes(failure.classification) ||
      prefixMatch(failure.code, policy.redriveCodePrefixes))
  ) {
    return {
      action: "redrive",
      reason: `Failure ${failure.code} is eligible for bounded redrive ${taskState.redrives + 1}/${policy.maxRedrives}.`,
    };
  }
  if (
    policy.repairTaskId &&
    taskState.repairCycles < policy.maxRepairCycles
  ) {
    return {
      action: "repair",
      repairTaskId: policy.repairTaskId,
      reason: `Failure ${failure.code} is routed into repair cycle ${taskState.repairCycles + 1}/${policy.maxRepairCycles}.`,
    };
  }
  if (
    prefixMatch(failure.code, policy.reviewCodePrefixes) ||
    policy.reviewOnUnclassified
  ) {
    return {
      action: "review",
      reason: `Failure ${failure.code} requires review because automatic redrive and repair are unavailable or exhausted.`,
    };
  }
  return {
    action: "abort",
    reason: `Failure ${failure.code} is not recoverable under the compiled policy.`,
  };
}

function mergeBindings(
  current: Readonly<Record<string, readonly ArtifactId[]>>,
  additions: readonly Readonly<{ role: string; artifactIds: readonly ArtifactId[] }>[],
): Readonly<Record<string, readonly ArtifactId[]>> {
  const result: Record<string, readonly ArtifactId[]> = { ...current };
  for (const binding of additions) {
    const merged = [
      ...(result[binding.role] ?? []),
      ...binding.artifactIds,
    ];
    result[binding.role] = [...new Set(merged)].sort();
  }
  return result;
}

function decision(
  state: SpriteSupervisorState,
  at: string,
  action: SpriteSupervisorDecision["action"],
  reason: string,
  taskId?: string,
  data?: JsonValue,
): SpriteSupervisorDecision {
  return {
    at,
    tick: state.tick,
    ...(taskId === undefined ? {} : { taskId }),
    action,
    reason,
    ...(data === undefined ? {} : { data }),
  };
}

function resolutionSha256(
  resolution: NormalizedSpriteSupervisorReviewResolution,
): string {
  return spriteSupervisorSha256(resolution);
}

function releaseReviewReady(
  request: NormalizedSpriteSupervisorCompileRequest,
  state: SpriteSupervisorState,
): boolean {
  if (state.status !== "review-required" || !request.policy.requireFinalHumanApproval) {
    return false;
  }
  if (!supervisorRequiredTasksComplete(request, state)) return false;
  if (supervisorActiveTaskCount(state) > 0) return false;
  return !Object.values(state.taskStates).some(
    (taskState) => taskState.status === "review-required",
  );
}

export function applySpriteSupervisorReviewResolutions(
  request: NormalizedSpriteSupervisorCompileRequest,
  state: SpriteSupervisorState,
  now = new Date(),
): SpriteSupervisorState {
  if (!request.reviewResolutions.length) return state;
  const at = nowIso(now);
  let status = state.status;
  let releaseApprovedBy = state.releaseApprovedBy;
  let artifactBindings = state.artifactBindings;
  const taskStates: Record<string, SpriteSupervisorTaskState> = {
    ...state.taskStates,
  };
  const decisions = [...state.decisions];
  const appliedReviewResolutions = [...state.appliedReviewResolutions];

  for (const resolution of request.reviewResolutions) {
    const hash = resolutionSha256(resolution);
    const existing = appliedReviewResolutions.find(
      (entry) => entry.resolutionId === resolution.resolutionId,
    );
    if (existing) {
      if (existing.resolutionSha256 !== hash) {
        throw new SpriteSupervisorError(
          "SPRITE_SUPERVISOR_REVIEW_ID_CONFLICT",
          `Review resolution ${resolution.resolutionId} was already applied with different content.`,
        );
      }
      continue;
    }
    if (resolution.expectedStateTick !== state.tick) {
      throw new SpriteSupervisorError(
        "SPRITE_SUPERVISOR_REVIEW_STATE_STALE",
        `Review resolution ${resolution.resolutionId} expected state tick ${resolution.expectedStateTick}, but the current state is tick ${state.tick}.`,
        normalizeJson({
          resolutionId: resolution.resolutionId,
          expectedStateTick: resolution.expectedStateTick,
          currentStateTick: state.tick,
        }),
      );
    }

    if (resolution.taskId === "$release") {
      if (resolution.action !== "approve-release" || !releaseReviewReady(request, state)) {
        throw new SpriteSupervisorError(
          "SPRITE_SUPERVISOR_RELEASE_REVIEW_NOT_READY",
          "Final release approval is accepted only from the exact review-required state reached after every required task succeeds and no child work remains active.",
        );
      }
      if (releaseApprovedBy) {
        throw new SpriteSupervisorError(
          "SPRITE_SUPERVISOR_RELEASE_ALREADY_APPROVED",
          "Final release approval has already been recorded for this run.",
        );
      }
      artifactBindings = mergeBindings(
        artifactBindings,
        resolution.artifactBindings,
      );
      releaseApprovedBy = {
        resolutionId: resolution.resolutionId,
        expectedStateTick: resolution.expectedStateTick,
        approver: resolution.approver,
        reason: resolution.reason,
        at,
      };
      decisions.push(
        decision(
          state,
          at,
          "apply-review",
          `Final release approved by ${resolution.approver}: ${resolution.reason}`,
          undefined,
          normalizeJson({ resolutionId: resolution.resolutionId }),
        ),
      );
      appliedReviewResolutions.push({
        resolutionId: resolution.resolutionId,
        resolutionSha256: hash,
        expectedStateTick: resolution.expectedStateTick,
        taskId: resolution.taskId,
        action: resolution.action,
        approver: resolution.approver,
        appliedAt: at,
      });
      continue;
    }

    const task = request.tasks.find((entry) => entry.id === resolution.taskId);
    const taskState = taskStates[resolution.taskId];
    if (!task || !taskState || taskState.status !== "review-required") {
      throw new SpriteSupervisorError(
        "SPRITE_SUPERVISOR_TASK_REVIEW_NOT_READY",
        `Task ${resolution.taskId} is not currently waiting for review.`,
      );
    }
    artifactBindings = mergeBindings(
      artifactBindings,
      resolution.artifactBindings,
    );
    if (resolution.action === "abort") {
      taskStates[task.id] = {
        ...taskState,
        status: "failed",
        reviewReason: `Aborted by ${resolution.approver}: ${resolution.reason}`,
      };
      status = "failed";
      decisions.push(
        decision(
          state,
          at,
          "abort",
          `Task aborted by ${resolution.approver}: ${resolution.reason}`,
          task.id,
          normalizeJson({ resolutionId: resolution.resolutionId }),
        ),
      );
    } else if (resolution.action === "skip") {
      if (task.required) {
        throw new SpriteSupervisorError(
          "SPRITE_SUPERVISOR_REQUIRED_TASK_SKIP_REJECTED",
          `Required task ${task.id} cannot be skipped.`,
        );
      }
      taskStates[task.id] = {
        ...taskState,
        status: "skipped",
        reviewReason: `Skipped by ${resolution.approver}: ${resolution.reason}`,
      };
      decisions.push(
        decision(
          state,
          at,
          "skip",
          `Optional task skipped by ${resolution.approver}: ${resolution.reason}`,
          task.id,
          normalizeJson({ resolutionId: resolution.resolutionId }),
        ),
      );
    } else if (resolution.action === "retry") {
      const {
        currentChildJobId: _currentChildJobId,
        lastFailure: _lastFailure,
        reviewReason: _reviewReason,
        ...base
      } = taskState;
      taskStates[task.id] = {
        ...base,
        status: "pending",
        cycle: taskState.cycle + 1,
      };
      decisions.push(
        decision(
          state,
          at,
          "apply-review",
          `Task retry authorised by ${resolution.approver}: ${resolution.reason}`,
          task.id,
          normalizeJson({ resolutionId: resolution.resolutionId }),
        ),
      );
    } else {
      throw new SpriteSupervisorError(
        "SPRITE_SUPERVISOR_TASK_REVIEW_ACTION_INVALID",
        `Action ${resolution.action} is not valid for task ${task.id}.`,
      );
    }
    appliedReviewResolutions.push({
      resolutionId: resolution.resolutionId,
      resolutionSha256: hash,
      expectedStateTick: resolution.expectedStateTick,
      taskId: resolution.taskId,
      action: resolution.action,
      approver: resolution.approver,
      appliedAt: at,
    });
  }

  if (status === "review-required") {
    const unresolved = Object.values(taskStates).some(
      (entry) => entry.status === "review-required",
    );
    if (!unresolved && releaseApprovedBy) status = "running";
    else if (!unresolved && !request.policy.requireFinalHumanApproval) status = "running";
  }
  return {
    ...state,
    status,
    updatedAt: at,
    taskStates,
    artifactBindings,
    decisions,
    appliedReviewResolutions,
    ...(releaseApprovedBy === undefined ? {} : { releaseApprovedBy }),
  };
}

export function supervisorActiveTaskCount(state: SpriteSupervisorState): number {
  return Object.values(state.taskStates).filter((entry) =>
    ["submitted", "waiting", "running"].includes(entry.status),
  ).length;
}

export function supervisorRequiredTasksComplete(
  request: NormalizedSpriteSupervisorCompileRequest,
  state: SpriteSupervisorState,
): boolean {
  return request.tasks
    .filter((task) => task.required)
    .every((task) => state.taskStates[task.id]?.status === "succeeded");
}

export function supervisorTerminalTaskFailure(
  request: NormalizedSpriteSupervisorCompileRequest,
  state: SpriteSupervisorState,
): boolean {
  return request.tasks
    .filter((task) => task.required)
    .some((task) =>
      ["failed", "cancelled"].includes(
        state.taskStates[task.id]?.status ?? "failed",
      ),
    );
}
