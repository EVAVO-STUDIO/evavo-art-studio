import {
  ArtifactStoreError,
  normalizeJson,
  type ArtifactId,
  type ArtifactReference,
  type JsonValue,
  type StoredArtifact,
} from "@evavo/art-artifacts";
import {
  PermanentRuntimeError,
  RuntimeError,
  TransientRuntimeError,
  type RuntimeJobHandler,
  type RuntimeJobRecord,
  type RuntimeRepository,
} from "@evavo/art-runtime";
import {
  SPRITE_SUPERVISOR_CAPABILITIES,
  SpriteSupervisorError,
  applySpriteSupervisorReviewResolutions,
  compileSpriteSupervisorWorkflow,
  createInitialSpriteSupervisorState,
  decideSpriteSupervisorFailure,
  materializeSupervisorChildSubmission,
  supervisorActiveTaskCount,
  supervisorRequiredTasksComplete,
  supervisorTaskReady,
  supervisorTerminalTaskFailure,
  valueAtJsonPointer,
  type NormalizedSpriteSupervisorArtifactSelector,
  type NormalizedSpriteSupervisorCompileRequest,
  type NormalizedSpriteSupervisorTask,
  type SpriteSupervisorDecision,
  type SpriteSupervisorState,
  type SpriteSupervisorTaskAttempt,
  type SpriteSupervisorTaskState,
} from "@evavo/art-sprite-supervisor";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const ACTIVE_JOB_STATES = new Set([
  "waiting",
  "queued",
  "leased",
  "running",
  "retry-wait",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function actor(runId: string): string {
  return `sprite-supervisor:${runId}`;
}

function stateNamespace(request: NormalizedSpriteSupervisorCompileRequest): string {
  return `sprite-supervisor/${request.spritePlan.project.projectId}`;
}

function stateReferenceName(request: NormalizedSpriteSupervisorCompileRequest): string {
  return request.runId;
}

function payloadWorkflow(value: unknown) {
  if (!isRecord(value) || value.schemaVersion !== "1.0") {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_PAYLOAD_INVALID",
      "Supervisor payload must be a schemaVersion 1.0 object.",
    );
  }
  if (
    typeof value.workflowSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.workflowSha256)
  ) {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_PAYLOAD_INVALID",
      "workflowSha256 must be a 64-character lowercase SHA-256.",
    );
  }
  const workflow = compileSpriteSupervisorWorkflow(value.request);
  if (workflow.workflowSha256 !== value.workflowSha256) {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_WORKFLOW_HASH_MISMATCH",
      "Supervisor payload does not match its declared workflow SHA-256.",
    );
  }
  return workflow;
}

function parseState(
  value: unknown,
  request: NormalizedSpriteSupervisorCompileRequest,
  workflowSha256: string,
): SpriteSupervisorState {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "1.0" ||
    value.runId !== request.runId ||
    value.workflowSha256 !== workflowSha256 ||
    value.spritePlanId !== request.spritePlan.planId ||
    value.spritePlanSha256 !== request.spritePlan.planSha256 ||
    typeof value.tick !== "number" ||
    !isRecord(value.taskStates) ||
    !isRecord(value.artifactBindings) ||
    !Array.isArray(value.decisions)
  ) {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_STATE_INVALID",
      "Stored supervisor state does not match the compiled workflow.",
    );
  }
  return value as unknown as SpriteSupervisorState;
}

async function readVerifiedJson(
  artifactId: ArtifactId,
  expectedRole: string,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<{ artifact: StoredArtifact; value: unknown }> {
  const [artifact, verification] = await Promise.all([
    context.artifacts.get(artifactId),
    context.artifacts.verify(artifactId),
  ]);
  if (!artifact || !verification.exists) {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_ARTIFACT_NOT_FOUND",
      `Supervisor artifact was not found: ${artifactId}`,
    );
  }
  if (!verification.descriptorValid || !verification.contentValid) {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_ARTIFACT_VERIFICATION_FAILED",
      `Supervisor artifact failed immutable verification: ${artifactId}`,
    );
  }
  if (
    artifact.mediaType !== "application/json" ||
    artifact.labels.artifactRole !== expectedRole
  ) {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_ARTIFACT_ROLE_INVALID",
      `Expected ${expectedRole} JSON artifact, received ${artifact.labels.artifactRole ?? "unlabelled"}.`,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(
      (await context.artifacts.read(artifactId)).toString("utf8"),
    ) as unknown;
  } catch (error: unknown) {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_ARTIFACT_JSON_INVALID",
      `Supervisor JSON artifact could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return { artifact, value };
}

async function loadState(
  request: NormalizedSpriteSupervisorCompileRequest,
  workflowSha256: string,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<{
  state: SpriteSupervisorState;
  reference: ArtifactReference | null;
  previousStateArtifactId?: ArtifactId;
}> {
  const reference = await context.artifacts.resolveReference(
    stateNamespace(request),
    stateReferenceName(request),
  );
  if (!reference) {
    return {
      state: createInitialSpriteSupervisorState(request, workflowSha256),
      reference: null,
    };
  }
  const stored = await readVerifiedJson(
    reference.artifactId,
    "sprite-supervisor-state",
    context,
  );
  if (
    stored.artifact.labels.runId !== request.runId ||
    stored.artifact.labels.workflowSha256 !== workflowSha256
  ) {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_STATE_LABEL_MISMATCH",
      "Stored supervisor state labels do not match the requested run.",
    );
  }
  return {
    state: parseState(stored.value, request, workflowSha256),
    reference,
    previousStateArtifactId: reference.artifactId,
  };
}

function matchesLabels(
  artifact: StoredArtifact,
  expected: Readonly<Record<string, string>>,
): boolean {
  return Object.entries(expected).every(
    ([key, value]) => artifact.labels[key] === value,
  );
}

function artifactIdsFromUnknown(value: unknown): readonly ArtifactId[] {
  const values = Array.isArray(value) ? value : [value];
  const result: ArtifactId[] = [];
  for (const candidate of values) {
    if (typeof candidate === "string" && ARTIFACT_ID.test(candidate)) {
      result.push(candidate as ArtifactId);
    }
  }
  return [...new Set(result)].sort();
}

async function selectorArtifactIds(
  selector: NormalizedSpriteSupervisorArtifactSelector,
  job: RuntimeJobRecord,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<readonly ArtifactId[]> {
  if (selector.source === "failure-details") {
    return artifactIdsFromUnknown(
      valueAtJsonPointer(job.failure?.details, selector.pointer),
    );
  }
  const descriptors = (
    await Promise.all(
      job.outputArtifacts.map((artifactId) => context.artifacts.get(artifactId)),
    )
  ).filter((entry): entry is StoredArtifact => entry !== null);
  if (selector.source === "output-artifact-labels") {
    return descriptors
      .filter((artifact) => matchesLabels(artifact, selector.labels))
      .map((artifact) => artifact.artifactId)
      .sort();
  }
  const resultArtifacts = descriptors.filter(
    (artifact) => artifact.labels.runtimeResult === "true",
  );
  const output: ArtifactId[] = [];
  for (const artifact of resultArtifacts) {
    const verification = await context.artifacts.verify(artifact.artifactId);
    if (!verification.contentValid || !verification.descriptorValid) continue;
    try {
      const value = JSON.parse(
        (await context.artifacts.read(artifact.artifactId)).toString("utf8"),
      ) as unknown;
      output.push(
        ...artifactIdsFromUnknown(valueAtJsonPointer(value, selector.pointer)),
      );
    } catch {
      continue;
    }
  }
  return [...new Set(output)].sort();
}

function mergeArtifactBindings(
  state: SpriteSupervisorState,
  additions: readonly Readonly<{
    role: string;
    artifactIds: readonly ArtifactId[];
  }>[],
): SpriteSupervisorState["artifactBindings"] {
  const result: Record<string, readonly ArtifactId[]> = {
    ...state.artifactBindings,
  };
  for (const addition of additions) {
    result[addition.role] = [
      ...new Set([
        ...(result[addition.role] ?? []),
        ...addition.artifactIds,
      ]),
    ].sort();
  }
  return result;
}

function appendDecision(
  state: SpriteSupervisorState,
  action: SpriteSupervisorDecision["action"],
  reason: string,
  at: string,
  taskId?: string,
  data?: JsonValue,
): readonly SpriteSupervisorDecision[] {
  return [
    ...state.decisions,
    {
      at,
      tick: state.tick,
      ...(taskId === undefined ? {} : { taskId }),
      action,
      reason,
      ...(data === undefined ? {} : { data }),
    },
  ];
}

function taskAttempt(
  taskState: SpriteSupervisorTaskState,
  job: RuntimeJobRecord,
): SpriteSupervisorTaskAttempt {
  return {
    cycle: taskState.cycle,
    childJobId: job.id,
    childState: job.state,
    submittedAt: job.createdAt,
    ...(job.finishedAt === undefined ? {} : { completedAt: job.finishedAt }),
    outputArtifactIds: job.outputArtifacts,
    ...(job.failure === undefined
      ? {}
      : {
          failure: {
            classification: job.failure.classification,
            code: job.failure.code,
            message: job.failure.message,
            ...(job.failure.details === undefined
              ? {}
              : { details: job.failure.details }),
          },
        }),
  };
}

function taskWithoutCurrent(
  taskState: SpriteSupervisorTaskState,
): Omit<
  SpriteSupervisorTaskState,
  "currentChildJobId" | "lastFailure" | "reviewReason"
> {
  const {
    currentChildJobId: _currentChildJobId,
    lastFailure: _lastFailure,
    reviewReason: _reviewReason,
    ...base
  } = taskState;
  return base;
}

async function bindTaskSelectors(
  state: SpriteSupervisorState,
  task: NormalizedSpriteSupervisorTask,
  job: RuntimeJobRecord,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<{
  state: SpriteSupervisorState;
  boundRoles: readonly string[];
}> {
  const additions: Array<{
    role: string;
    artifactIds: readonly ArtifactId[];
  }> = [];
  for (const selector of task.outputBindings) {
    if (
      selector.source === "failure-details" &&
      job.failure === undefined
    ) {
      continue;
    }
    if (
      selector.source !== "failure-details" &&
      job.state !== "succeeded"
    ) {
      continue;
    }
    const artifactIds = await selectorArtifactIds(selector, job, context);
    const validCardinality =
      selector.cardinality === "many"
        ? artifactIds.length > 0
        : artifactIds.length === 1;
    if (!validCardinality && selector.required) {
      throw new SpriteSupervisorError(
        "SPRITE_SUPERVISOR_OUTPUT_BINDING_MISSING",
        `Task ${task.id} did not produce required ${selector.cardinality} binding ${selector.role}.`,
        normalizeJson({
          source: selector.source,
          pointer: selector.pointer,
          labels: selector.labels,
          artifactIds,
        }),
      );
    }
    if (artifactIds.length) {
      additions.push({ role: selector.role, artifactIds });
    }
  }
  if (!additions.length) return { state, boundRoles: [] };
  const at = new Date().toISOString();
  return {
    state: {
      ...state,
      artifactBindings: mergeArtifactBindings(state, additions),
      decisions: appendDecision(
        state,
        "bind-artifacts",
        `Bound immutable output artifacts from task ${task.id}.`,
        at,
        task.id,
        normalizeJson({
          roles: additions.map((entry) => entry.role),
          artifacts: additions.flatMap((entry) => entry.artifactIds),
        }),
      ),
    },
    boundRoles: additions.map((entry) => entry.role),
  };
}

async function observeTask(
  request: NormalizedSpriteSupervisorCompileRequest,
  state: SpriteSupervisorState,
  task: NormalizedSpriteSupervisorTask,
  runtime: RuntimeRepository,
  context: Parameters<RuntimeJobHandler>[0],
  at: string,
): Promise<SpriteSupervisorState> {
  const taskState = state.taskStates[task.id];
  if (!taskState?.currentChildJobId) return state;
  const job = await runtime.get(taskState.currentChildJobId);
  if (!job) {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_CHILD_JOB_MISSING",
      `Supervisor child job was not found: ${taskState.currentChildJobId}`,
    );
  }
  let next = state;
  try {
    next = (await bindTaskSelectors(next, task, job, context)).state;
  } catch (error: unknown) {
    if (!(error instanceof SpriteSupervisorError)) throw error;
    const states = { ...next.taskStates };
    states[task.id] = {
      ...taskState,
      status: "review-required",
      reviewReason: error.message,
    };
    return {
      ...next,
      status: "review-required",
      taskStates: states,
      decisions: appendDecision(
        next,
        "require-review",
        error.message,
        at,
        task.id,
        error.details,
      ),
    };
  }

  const currentState = next.taskStates[task.id] ?? taskState;
  if (ACTIVE_JOB_STATES.has(job.state)) {
    const states = { ...next.taskStates };
    states[task.id] = {
      ...currentState,
      status: job.state === "waiting" ? "waiting" : "running",
    };
    return { ...next, taskStates: states };
  }
  if (job.state === "paused") {
    const states = { ...next.taskStates };
    states[task.id] = {
      ...currentState,
      status: "review-required",
      reviewReason: "Child job is paused and requires an operator decision.",
    };
    return {
      ...next,
      status: "review-required",
      taskStates: states,
      decisions: appendDecision(
        next,
        "require-review",
        "Child job is paused and requires an operator decision.",
        at,
        task.id,
      ),
    };
  }

  const alreadyRecorded = currentState.attempts.some(
    (attempt) =>
      attempt.childJobId === job.id && attempt.childState === job.state,
  );
  const attempts = alreadyRecorded
    ? currentState.attempts
    : [...currentState.attempts, taskAttempt(currentState, job)];

  if (job.state === "succeeded") {
    const states = { ...next.taskStates };
    states[task.id] = {
      ...taskWithoutCurrent(currentState),
      status: "succeeded",
      attempts,
      outputArtifactIds: job.outputArtifacts,
    };
    let completed: SpriteSupervisorState = {
      ...next,
      taskStates: states,
      decisions: appendDecision(
        next,
        "observe",
        `Child job ${job.id} succeeded.`,
        at,
        task.id,
        normalizeJson({ outputArtifacts: job.outputArtifacts }),
      ),
    };
    if (task.triggeredByFailureOfTaskId) {
      const source = completed.taskStates[task.triggeredByFailureOfTaskId];
      if (source?.status === "repairing") {
        const repairedStates = { ...completed.taskStates };
        repairedStates[task.triggeredByFailureOfTaskId] = {
          ...taskWithoutCurrent(source),
          status: "pending",
          cycle: source.cycle + 1,
          attempts: source.attempts,
          outputArtifactIds: source.outputArtifactIds,
        };
        completed = {
          ...completed,
          taskStates: repairedStates,
          decisions: appendDecision(
            completed,
            "retry-after-repair",
            `Repair task ${task.id} succeeded; source task ${task.triggeredByFailureOfTaskId} will run a new bounded cycle.`,
            at,
            task.triggeredByFailureOfTaskId,
          ),
        };
      }
    }
    return completed;
  }

  const failure = job.failure ?? {
    classification:
      job.state === "cancelled" ? ("cancelled" as const) : ("permanent" as const),
    code:
      job.state === "cancelled"
        ? "RUNTIME_JOB_CANCELLED"
        : "SPRITE_SUPERVISOR_CHILD_TERMINAL_WITHOUT_FAILURE",
    message: `Child job reached ${job.state}.`,
  };
  const taskWithFailure: SpriteSupervisorTaskState = {
    ...currentState,
    attempts,
    outputArtifactIds: job.outputArtifacts,
    lastFailure: {
      classification: failure.classification,
      code: failure.code,
      message: failure.message,
      ...(failure.details === undefined ? {} : { details: failure.details }),
    },
  };
  const action = decideSpriteSupervisorFailure(task, taskWithFailure, failure);
  if (action.action === "redrive") {
    await runtime.redrive(job.id, 1, actor(request.runId));
    const states = { ...next.taskStates };
    states[task.id] = {
      ...taskWithFailure,
      status: "submitted",
      redrives: taskWithFailure.redrives + 1,
    };
    return {
      ...next,
      taskStates: states,
      decisions: appendDecision(
        next,
        "redrive",
        action.reason,
        at,
        task.id,
        normalizeJson({ childJobId: job.id }),
      ),
    };
  }
  if (action.action === "repair") {
    const repairState = next.taskStates[action.repairTaskId];
    if (!repairState) {
      throw new PermanentRuntimeError(
        "SPRITE_SUPERVISOR_REPAIR_STATE_MISSING",
        `Repair task state is missing: ${action.repairTaskId}`,
      );
    }
    const states = { ...next.taskStates };
    states[task.id] = {
      ...taskWithFailure,
      status: "repairing",
      repairCycles: taskWithFailure.repairCycles + 1,
    };
    states[action.repairTaskId] = {
      ...taskWithoutCurrent(repairState),
      status: "pending",
      cycle: taskWithFailure.repairCycles + 1,
      attempts: repairState.attempts,
      outputArtifactIds: repairState.outputArtifactIds,
    };
    return {
      ...next,
      taskStates: states,
      decisions: appendDecision(
        next,
        "route-repair",
        action.reason,
        at,
        task.id,
        normalizeJson({ repairTaskId: action.repairTaskId }),
      ),
    };
  }
  if (action.action === "review") {
    const states = { ...next.taskStates };
    states[task.id] = {
      ...taskWithFailure,
      status: "review-required",
      reviewReason: action.reason,
    };
    return {
      ...next,
      status: "review-required",
      taskStates: states,
      decisions: appendDecision(
        next,
        "require-review",
        action.reason,
        at,
        task.id,
      ),
    };
  }
  const states = { ...next.taskStates };
  states[task.id] = {
    ...taskWithFailure,
    status: job.state === "cancelled" ? "cancelled" : "failed",
    reviewReason: action.reason,
  };
  return {
    ...next,
    status: job.state === "cancelled" ? "cancelled" : "failed",
    taskStates: states,
    decisions: appendDecision(
      next,
      "abort",
      action.reason,
      at,
      task.id,
    ),
  };
}

async function cancelActiveChildren(
  request: NormalizedSpriteSupervisorCompileRequest,
  state: SpriteSupervisorState,
  runtime: RuntimeRepository,
  at: string,
): Promise<SpriteSupervisorState> {
  const cancelled: string[] = [];
  for (const taskState of Object.values(state.taskStates)) {
    if (!taskState.currentChildJobId) continue;
    const job = await runtime.get(taskState.currentChildJobId);
    if (!job || !ACTIVE_JOB_STATES.has(job.state)) continue;
    await runtime
      .cancel(job.id, actor(request.runId), { force: true })
      .catch(() => undefined);
    cancelled.push(job.id);
  }
  if (!cancelled.length) return state;
  return {
    ...state,
    decisions: appendDecision(
      state,
      "cancel-children",
      "Cancelled remaining active child jobs after supervisor termination.",
      at,
      undefined,
      normalizeJson({ childJobIds: cancelled }),
    ),
  };
}

async function submitReadyTasks(
  request: NormalizedSpriteSupervisorCompileRequest,
  state: SpriteSupervisorState,
  runtime: RuntimeRepository,
  at: string,
): Promise<SpriteSupervisorState> {
  let next = state;
  let available = Math.max(
    0,
    request.policy.maximumActiveChildren - supervisorActiveTaskCount(next),
  );
  for (const task of request.tasks) {
    if (available <= 0) break;
    if (!supervisorTaskReady(request, next, task)) continue;
    const submission = materializeSupervisorChildSubmission(request, next, task);
    const child = await runtime.submit(submission, actor(request.runId));
    const current = next.taskStates[task.id]!;
    const states = { ...next.taskStates };
    states[task.id] = {
      ...current,
      status: "submitted",
      currentChildJobId: child.id,
    };
    next = {
      ...next,
      status: "running",
      taskStates: states,
      decisions: appendDecision(
        next,
        "submit",
        `Submitted bounded child job ${child.id} for ${task.title}.`,
        at,
        task.id,
        normalizeJson({
          queue: child.spec.queue,
          kind: child.spec.kind,
          specHash: child.specHash,
          inputArtifacts: child.spec.inputArtifacts,
        }),
      ),
    };
    available -= 1;
  }
  return next;
}

async function verifyReleaseArtifacts(
  request: NormalizedSpriteSupervisorCompileRequest,
  state: SpriteSupervisorState,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<readonly StoredArtifact[]> {
  const artifacts: StoredArtifact[] = [];
  for (const role of request.policy.requiredReleaseArtifactRoles) {
    const ids = state.artifactBindings[role] ?? [];
    if (!ids.length) {
      throw new SpriteSupervisorError(
        "SPRITE_SUPERVISOR_RELEASE_ROLE_MISSING",
        `Required release artifact role is not bound: ${role}`,
      );
    }
    for (const artifactId of ids) {
      const [artifact, verification] = await Promise.all([
        context.artifacts.get(artifactId),
        context.artifacts.verify(artifactId),
      ]);
      if (
        !artifact ||
        !verification.exists ||
        !verification.descriptorValid ||
        !verification.contentValid
      ) {
        throw new SpriteSupervisorError(
          "SPRITE_SUPERVISOR_RELEASE_ARTIFACT_INVALID",
          `Release artifact failed immutable verification: ${artifactId}`,
        );
      }
      if (
        artifact.storageClass === "intermediate" ||
        artifact.labels.approvalState === "unapproved"
      ) {
        throw new SpriteSupervisorError(
          "SPRITE_SUPERVISOR_RELEASE_ARTIFACT_UNAPPROVED",
          `Intermediate or unapproved artifact cannot satisfy release role ${role}: ${artifactId}`,
        );
      }
      if (artifact.labels.qualityState === "rejected") {
        throw new SpriteSupervisorError(
          "SPRITE_SUPERVISOR_RELEASE_ARTIFACT_REJECTED",
          `Rejected artifact cannot enter release evidence: ${artifactId}`,
        );
      }
      artifacts.push(artifact);
    }
  }
  return artifacts;
}

async function storeReleaseEvidence(
  request: NormalizedSpriteSupervisorCompileRequest,
  state: SpriteSupervisorState,
  workflowSha256: string,
  context: Parameters<RuntimeJobHandler>[0],
  at: string,
): Promise<ArtifactId> {
  const releaseArtifacts = await verifyReleaseArtifacts(request, state, context);
  const body = normalizeJson({
    schemaVersion: "1.0",
    protocolVersion: state.protocolVersion,
    runId: request.runId,
    workflowSha256,
    spritePlanId: request.spritePlan.planId,
    spritePlanSha256: request.spritePlan.planSha256,
    completedAt: at,
    releaseApprovedBy: state.releaseApprovedBy ?? null,
    requiredArtifactRoles: request.policy.requiredReleaseArtifactRoles,
    artifactBindings: state.artifactBindings,
    releaseArtifacts: releaseArtifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      descriptorSha256: artifact.descriptorSha256,
      contentSha256: artifact.contentSha256,
      mediaType: artifact.mediaType,
      storageClass: artifact.storageClass,
      labels: artifact.labels,
    })),
    taskStates: state.taskStates,
    decisionCount: state.decisions.length,
    qualityThresholdsRelaxed: false,
    liveProviderRequestBySupervisor: false,
    deploymentPerformed: false,
  });
  const evidence = await context.putArtifact(
    `${JSON.stringify(body, null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "evidence",
      fileName: `${request.runId}.sprite-production.release.json`,
      sourceArtifacts: releaseArtifacts.map((artifact) => artifact.artifactId),
      labels: {
        artifactRole: "sprite-production-release-evidence",
        runId: request.runId,
        workflowSha256,
        qualityState: "passed",
        approvalState: "evidence-only",
        finalDeliverable: "false",
      },
      metadata: normalizeJson({
        spritePlanId: request.spritePlan.planId,
        spritePlanSha256: request.spritePlan.planSha256,
      }),
    },
  );
  return evidence.artifactId;
}

async function storeState(
  request: NormalizedSpriteSupervisorCompileRequest,
  state: SpriteSupervisorState,
  reference: ArtifactReference | null,
  previousStateArtifactId: ArtifactId | undefined,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<{ artifactId: ArtifactId; reference: ArtifactReference }> {
  const boundArtifacts = Object.values(state.artifactBindings).flat();
  const stateArtifact = await context.putArtifact(
    `${JSON.stringify(normalizeJson(state), null, 2)}\n`,
    {
      mediaType: "application/json",
      storageClass: "runtime",
      fileName: `${request.runId}.sprite-supervisor.state.json`,
      sourceArtifacts: [
        ...(previousStateArtifactId ? [previousStateArtifactId] : []),
        ...boundArtifacts,
        ...(state.releaseEvidenceArtifactId
          ? [state.releaseEvidenceArtifactId]
          : []),
      ],
      labels: {
        artifactRole: "sprite-supervisor-state",
        runId: request.runId,
        workflowSha256: state.workflowSha256,
        supervisorStatus: state.status,
        supervisorTick: String(state.tick),
      },
      metadata: normalizeJson({
        spritePlanId: request.spritePlan.planId,
        spritePlanSha256: request.spritePlan.planSha256,
        taskCount: request.tasks.length,
      }),
    },
  );
  try {
    const updated = await context.artifacts.updateReference(
      stateNamespace(request),
      stateReferenceName(request),
      stateArtifact.artifactId,
      {
        expectedGeneration: reference?.generation ?? 0,
        ...(reference ? { expectedArtifactId: reference.artifactId } : {}),
        actor: actor(request.runId),
      },
    );
    return { artifactId: stateArtifact.artifactId, reference: updated };
  } catch (error: unknown) {
    if (
      error instanceof ArtifactStoreError &&
      error.code === "ARTIFACT_REFERENCE_CONFLICT"
    ) {
      throw new TransientRuntimeError(
        "SPRITE_SUPERVISOR_STATE_CONFLICT",
        "Supervisor state changed concurrently; retry against the latest reference.",
      );
    }
    throw error;
  }
}

async function submitNextTick(
  request: NormalizedSpriteSupervisorCompileRequest,
  state: SpriteSupervisorState,
  workflowSha256: string,
  stateArtifactId: ArtifactId,
  currentJobId: string,
  runtime: RuntimeRepository,
  now: Date,
): Promise<string> {
  const nextTick = state.tick;
  const next = await runtime.submit(
    {
      queue: "control",
      kind: "art.sprite-production.supervise",
      idempotencyKey: `${request.runId}:supervisor:${workflowSha256}:tick-${nextTick}`,
      payload: normalizeJson({
        schemaVersion: "1.0",
        workflowSha256,
        request,
      }),
      requiredCapabilities: SPRITE_SUPERVISOR_CAPABILITIES,
      dependencyJobIds: [currentJobId],
      inputArtifacts: [stateArtifactId],
      maximumAttempts: 3,
      leaseDurationMs: 120_000,
      timeoutMs: 300_000,
      notBefore: new Date(
        now.getTime() + request.policy.tickDelayMs,
      ).toISOString(),
      labels: {
        runId: request.runId,
        spritePlanId: request.spritePlan.planId,
        workflowSha256,
        supervisorTick: String(nextTick),
      },
    },
    actor(request.runId),
    now,
  );
  return next.id;
}

function supervisorFailure(error: SpriteSupervisorError): PermanentRuntimeError {
  return new PermanentRuntimeError(error.code, error.message, error.details);
}

export function createSpriteSupervisorHandlers(
  runtime: RuntimeRepository,
): Readonly<Record<string, RuntimeJobHandler>> {
  const supervise: RuntimeJobHandler = async (context) => {
    try {
      const workflow = payloadWorkflow(context.job.spec.payload);
      const request = workflow.request;
      for (const capability of SPRITE_SUPERVISOR_CAPABILITIES) {
        if (!context.job.spec.requiredCapabilities.includes(capability)) {
          throw new PermanentRuntimeError(
            "SPRITE_SUPERVISOR_CAPABILITY_MISSING",
            `Supervisor job must require ${capability}.`,
          );
        }
      }
      const now = new Date();
      const at = now.toISOString();
      const loaded = await loadState(
        request,
        workflow.workflowSha256,
        context,
      );
      let state = applySpriteSupervisorReviewResolutions(
        request,
        loaded.state,
        now,
      );
      state = {
        ...state,
        tick: state.tick + 1,
        updatedAt: at,
        status: state.status === "pending" ? "running" : state.status,
      };

      if (state.tick > request.policy.maximumTicks) {
        state = {
          ...state,
          status: "review-required",
          decisions: appendDecision(
            state,
            "require-review",
            `Supervisor reached the maximum tick budget of ${request.policy.maximumTicks}.`,
            at,
          ),
        };
      }

      const cancellationRequested =
        context.signal.aborted || (await context.cancellationRequested());
      if (cancellationRequested) {
        state = await cancelActiveChildren(
          request,
          { ...state, status: "cancelled" },
          runtime,
          at,
        );
      } else if (
        state.status !== "review-required" &&
        state.status !== "failed" &&
        state.status !== "cancelled"
      ) {
        for (const task of request.tasks) {
          state = await observeTask(
            request,
            state,
            task,
            runtime,
            context,
            at,
          );
        }
        if (
          state.status !== "review-required" &&
          state.status !== "failed" &&
          state.status !== "cancelled"
        ) {
          state = await submitReadyTasks(request, state, runtime, at);
        }
      }

      if (supervisorTerminalTaskFailure(request, state)) {
        state = { ...state, status: "failed" };
      }
      if (
        state.status !== "failed" &&
        state.status !== "cancelled" &&
        state.status !== "review-required" &&
        supervisorRequiredTasksComplete(request, state) &&
        supervisorActiveTaskCount(state) === 0
      ) {
        if (
          request.policy.requireFinalHumanApproval &&
          !state.releaseApprovedBy
        ) {
          state = {
            ...state,
            status: "review-required",
            decisions: appendDecision(
              state,
              "require-review",
              "All required tasks passed; named human release approval remains required.",
              at,
            ),
          };
        } else {
          try {
            const releaseEvidenceArtifactId = await storeReleaseEvidence(
              request,
              state,
              workflow.workflowSha256,
              context,
              at,
            );
            state = {
              ...state,
              status: "succeeded",
              releaseEvidenceArtifactId,
              decisions: appendDecision(
                state,
                "complete",
                "All required tasks and immutable release artifact checks passed.",
                at,
                undefined,
                normalizeJson({ releaseEvidenceArtifactId }),
              ),
            };
          } catch (error: unknown) {
            if (!(error instanceof SpriteSupervisorError)) throw error;
            state = {
              ...state,
              status: "review-required",
              decisions: appendDecision(
                state,
                "require-review",
                error.message,
                at,
                undefined,
                error.details,
              ),
            };
          }
        }
      }

      if (
        (state.status === "failed" || state.status === "cancelled") &&
        request.policy.cancelChildrenOnAbort
      ) {
        state = await cancelActiveChildren(request, state, runtime, at);
      }

      const persisted = await storeState(
        request,
        state,
        loaded.reference,
        loaded.previousStateArtifactId,
        context,
      );
      let nextTickJobId: string | undefined;
      if (state.status === "running") {
        nextTickJobId = await submitNextTick(
          request,
          state,
          workflow.workflowSha256,
          persisted.artifactId,
          context.job.id,
          runtime,
          now,
        );
      }
      return {
        outputArtifacts: [
          persisted.artifactId,
          ...(state.releaseEvidenceArtifactId
            ? [state.releaseEvidenceArtifactId]
            : []),
        ],
        result: normalizeJson({
          schemaVersion: "1.0",
          runId: request.runId,
          workflowSha256: workflow.workflowSha256,
          status: state.status,
          tick: state.tick,
          stateArtifactId: persisted.artifactId,
          stateReference: persisted.reference,
          ...(state.releaseEvidenceArtifactId
            ? { releaseEvidenceArtifactId: state.releaseEvidenceArtifactId }
            : {}),
          ...(nextTickJobId ? { nextTickJobId } : {}),
          taskSummary: Object.values(state.taskStates).map((taskState) => ({
            taskId: taskState.taskId,
            status: taskState.status,
            cycle: taskState.cycle,
            redrives: taskState.redrives,
            repairCycles: taskState.repairCycles,
            currentChildJobId: taskState.currentChildJobId ?? null,
          })),
        }),
      };
    } catch (error: unknown) {
      if (
        error instanceof TransientRuntimeError ||
        error instanceof PermanentRuntimeError
      ) {
        throw error;
      }
      if (error instanceof SpriteSupervisorError) {
        throw supervisorFailure(error);
      }
      if (error instanceof RuntimeError || error instanceof ArtifactStoreError) {
        throw new PermanentRuntimeError(error.code, error.message);
      }
      throw error;
    }
  };

  return Object.freeze({
    "art.sprite-production.supervise": supervise,
  });
}

export function spriteSupervisorWorkerCapabilities(): readonly string[] {
  return [...SPRITE_SUPERVISOR_CAPABILITIES];
}
