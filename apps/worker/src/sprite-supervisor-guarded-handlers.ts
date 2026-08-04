import {
  normalizeJson,
  type ArtifactReference,
} from "@evavo/art-artifacts";
import {
  PermanentRuntimeError,
  TransientRuntimeError,
  type RuntimeJobHandler,
  type RuntimeRepository,
} from "@evavo/art-runtime";
import {
  SPRITE_SUPERVISOR_CAPABILITIES,
  SpriteSupervisorError,
  applySpriteSupervisorReviewResolutions,
  compileSpriteSupervisorWorkflow,
  type CompiledSpriteSupervisorWorkflow,
  type NormalizedSpriteSupervisorCompileRequest,
  type SpriteSupervisorState,
} from "@evavo/art-sprite-supervisor";

import {
  createSpriteSupervisorHandlers as createBaseSpriteSupervisorHandlers,
  spriteSupervisorWorkerCapabilities,
} from "./sprite-supervisor-handlers.js";

const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const NON_NEGATIVE_INTEGER = /^(?:0|[1-9][0-9]*)$/;

type SupervisorWorkflow = CompiledSpriteSupervisorWorkflow;

type GuardedSupervisorPayload = Readonly<{
  workflow: SupervisorWorkflow;
  expectedStateTick: number;
}>;

type LoadedSupervisorState = Readonly<{
  state: SpriteSupervisorState;
  reference: ArtifactReference;
}>;

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

function parseTickLabel(value: string | undefined): number {
  if (!value || !NON_NEGATIVE_INTEGER.test(value)) {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_TICK_LABEL_INVALID",
      "Supervisor jobs must carry one canonical non-negative supervisorTick label.",
    );
  }
  const tick = Number(value);
  if (!Number.isSafeInteger(tick)) {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_TICK_LABEL_INVALID",
      "supervisorTick exceeds the supported integer range.",
    );
  }
  return tick;
}

function expectedReviewTick(
  request: NormalizedSpriteSupervisorCompileRequest,
): number | undefined {
  if (!request.reviewResolutions.length) return undefined;
  const ticks: number[] = [
    ...new Set<number>(
      request.reviewResolutions.map(
        (entry: { readonly expectedStateTick: number }) => entry.expectedStateTick,
      ),
    ),
  ];
  if (ticks.length !== 1) {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_REVIEW_TICK_AMBIGUOUS",
      "One supervisor submission may apply review resolutions for exactly one immutable state tick.",
      normalizeJson({ expectedStateTicks: ticks.sort((left, right) => left - right) }),
    );
  }
  return ticks[0];
}

function verifyPayloadAndJobIdentity(
  context: Parameters<RuntimeJobHandler>[0],
): GuardedSupervisorPayload {
  const payload = context.job.spec.payload;
  if (!isRecord(payload) || payload.schemaVersion !== "1.0") {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_PAYLOAD_INVALID",
      "Supervisor payload must be a schemaVersion 1.0 object.",
    );
  }
  try {
    const workflow = compileSpriteSupervisorWorkflow(payload.request);
    if (payload.workflowSha256 !== workflow.workflowSha256) {
      throw new PermanentRuntimeError(
        "SPRITE_SUPERVISOR_WORKFLOW_HASH_MISMATCH",
        "Supervisor payload does not match its declared workflow SHA-256.",
      );
    }
    const labelTick = parseTickLabel(
      context.job.spec.labels.supervisorTick,
    );
    const suppliedRequestSha256 = payload.requestSha256;
    const rootRequest = suppliedRequestSha256 !== undefined;
    if (rootRequest) {
      if (
        typeof suppliedRequestSha256 !== "string" ||
        suppliedRequestSha256 !== workflow.requestSha256
      ) {
        throw new PermanentRuntimeError(
          "SPRITE_SUPERVISOR_REQUEST_HASH_MISMATCH",
          "Root supervisor payload does not match its declared request SHA-256.",
        );
      }
      if (labelTick !== 0) {
        throw new PermanentRuntimeError(
          "SPRITE_SUPERVISOR_ROOT_TICK_INVALID",
          "Root supervisor submissions must carry supervisorTick 0.",
        );
      }
      const expectedKey = `${workflow.runId}:supervisor:${workflow.workflowSha256}:request-${workflow.requestSha256}:tick-0`;
      if (context.job.spec.idempotencyKey !== expectedKey) {
        throw new PermanentRuntimeError(
          "SPRITE_SUPERVISOR_ROOT_IDEMPOTENCY_INVALID",
          "Root supervisor idempotency identity differs from the compiled workflow.",
        );
      }
    } else {
      const expectedKey = `${workflow.runId}:supervisor:${workflow.workflowSha256}:tick-${labelTick}`;
      if (context.job.spec.idempotencyKey !== expectedKey) {
        throw new PermanentRuntimeError(
          "SPRITE_SUPERVISOR_CONTINUATION_IDEMPOTENCY_INVALID",
          "Continuation idempotency identity differs from its exact run and state tick.",
        );
      }
    }
    const reviewTick = rootRequest
      ? expectedReviewTick(workflow.request)
      : undefined;
    return {
      workflow,
      expectedStateTick: reviewTick ?? labelTick,
    };
  } catch (error: unknown) {
    if (
      error instanceof PermanentRuntimeError ||
      error instanceof TransientRuntimeError
    ) {
      throw error;
    }
    if (error instanceof SpriteSupervisorError) {
      throw new PermanentRuntimeError(error.code, error.message, error.details);
    }
    throw error;
  }
}

function parseStoredState(
  value: unknown,
  workflow: SupervisorWorkflow,
): SpriteSupervisorState {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "1.0" ||
    value.runId !== workflow.runId ||
    value.workflowSha256 !== workflow.workflowSha256 ||
    value.spritePlanId !== workflow.request.spritePlan.planId ||
    value.spritePlanSha256 !== workflow.request.spritePlan.planSha256 ||
    !Number.isSafeInteger(value.tick) ||
    Number(value.tick) < 0 ||
    typeof value.status !== "string" ||
    typeof value.updatedAt !== "string" ||
    Number.isNaN(Date.parse(value.updatedAt)) ||
    !isRecord(value.taskStates) ||
    !isRecord(value.artifactBindings) ||
    !Array.isArray(value.decisions) ||
    !Array.isArray(value.appliedReviewResolutions)
  ) {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_STATE_INVALID",
      "Stored supervisor state does not match the compiled workflow.",
    );
  }
  if (
    value.releaseEvidenceArtifactId !== undefined &&
    (typeof value.releaseEvidenceArtifactId !== "string" ||
      !ARTIFACT_ID.test(value.releaseEvidenceArtifactId))
  ) {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_STATE_INVALID",
      "Stored supervisor release evidence identity is invalid.",
    );
  }
  return value as unknown as SpriteSupervisorState;
}

async function loadCurrentState(
  workflow: SupervisorWorkflow,
  context: Parameters<RuntimeJobHandler>[0],
): Promise<LoadedSupervisorState | null> {
  const reference = await context.artifacts.resolveReference(
    stateNamespace(workflow.request),
    stateReferenceName(workflow.request),
  );
  if (!reference) return null;
  const [artifact, verification] = await Promise.all([
    context.artifacts.get(reference.artifactId),
    context.artifacts.verify(reference.artifactId),
  ]);
  if (
    !artifact ||
    !verification.exists ||
    !verification.descriptorValid ||
    !verification.contentValid ||
    artifact.mediaType !== "application/json" ||
    artifact.labels.artifactRole !== "sprite-supervisor-state" ||
    artifact.labels.runId !== workflow.runId ||
    artifact.labels.workflowSha256 !== workflow.workflowSha256
  ) {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_STATE_VERIFICATION_FAILED",
      "The current supervisor state reference does not resolve to one verified matching state artifact.",
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(
      (await context.artifacts.read(reference.artifactId)).toString("utf8"),
    ) as unknown;
  } catch (error: unknown) {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_STATE_JSON_INVALID",
      `Stored supervisor state could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    state: parseStoredState(value, workflow),
    reference,
  };
}

function continuationIdempotencyKey(
  workflow: SupervisorWorkflow,
  tick: number,
): string {
  return `${workflow.runId}:supervisor:${workflow.workflowSha256}:tick-${tick}`;
}

function continuationNotBefore(
  state: SpriteSupervisorState,
  request: NormalizedSpriteSupervisorCompileRequest,
): string {
  const updatedAt = Date.parse(state.updatedAt);
  if (!Number.isFinite(updatedAt)) {
    throw new PermanentRuntimeError(
      "SPRITE_SUPERVISOR_STATE_TIME_INVALID",
      "Stored supervisor state updatedAt is invalid.",
    );
  }
  return new Date(updatedAt + request.policy.tickDelayMs).toISOString();
}

async function ensureContinuation(
  workflow: SupervisorWorkflow,
  loaded: LoadedSupervisorState,
  currentJobId: string,
  runtime: RuntimeRepository,
): Promise<string | undefined> {
  if (loaded.state.status !== "running") return undefined;
  const tick = loaded.state.tick;
  const idempotencyKey = continuationIdempotencyKey(workflow, tick);
  const snapshot = await runtime.snapshot();
  const existingId = snapshot.idempotencyIndex[idempotencyKey];
  if (existingId) {
    const existing = await runtime.get(existingId);
    if (
      !existing ||
      existing.spec.kind !== "art.sprite-production.supervise" ||
      existing.spec.queue !== "control" ||
      existing.spec.idempotencyKey !== idempotencyKey ||
      existing.spec.labels.runId !== workflow.runId ||
      existing.spec.labels.workflowSha256 !== workflow.workflowSha256 ||
      existing.spec.labels.supervisorTick !== String(tick)
    ) {
      throw new PermanentRuntimeError(
        "SPRITE_SUPERVISOR_CONTINUATION_IDENTITY_CONFLICT",
        "The runtime idempotency index contains an incompatible supervisor continuation.",
        normalizeJson({ idempotencyKey, existingJobId: existingId }),
      );
    }
    return existing.id;
  }
  const continuation = await runtime.submit(
    {
      queue: "control",
      kind: "art.sprite-production.supervise",
      idempotencyKey,
      payload: normalizeJson({
        schemaVersion: "1.0",
        workflowSha256: workflow.workflowSha256,
        request: workflow.request,
      }),
      requiredCapabilities: SPRITE_SUPERVISOR_CAPABILITIES,
      dependencyJobIds: [currentJobId],
      inputArtifacts: [loaded.reference.artifactId],
      maximumAttempts: 3,
      leaseDurationMs: 120_000,
      timeoutMs: 300_000,
      notBefore: continuationNotBefore(loaded.state, workflow.request),
      labels: {
        runId: workflow.runId,
        spritePlanId: workflow.request.spritePlan.planId,
        workflowSha256: workflow.workflowSha256,
        supervisorTick: String(tick),
      },
    },
    actor(workflow.runId),
  );
  return continuation.id;
}

function assertStaleReviewsWereApplied(
  request: NormalizedSpriteSupervisorCompileRequest,
  state: SpriteSupervisorState,
): void {
  if (!request.reviewResolutions.length) return;
  try {
    applySpriteSupervisorReviewResolutions(
      request,
      state,
      new Date(state.updatedAt),
    );
  } catch (error: unknown) {
    if (error instanceof SpriteSupervisorError) {
      throw new PermanentRuntimeError(error.code, error.message, error.details);
    }
    throw error;
  }
}

async function replayCurrentState(
  guarded: GuardedSupervisorPayload,
  loaded: LoadedSupervisorState,
  context: Parameters<RuntimeJobHandler>[0],
  runtime: RuntimeRepository,
) {
  assertStaleReviewsWereApplied(guarded.workflow.request, loaded.state);
  const nextTickJobId = await ensureContinuation(
    guarded.workflow,
    loaded,
    context.job.id,
    runtime,
  );
  return {
    outputArtifacts: [
      loaded.reference.artifactId,
      ...(loaded.state.releaseEvidenceArtifactId
        ? [loaded.state.releaseEvidenceArtifactId]
        : []),
    ],
    result: normalizeJson({
      schemaVersion: "1.0",
      runId: guarded.workflow.runId,
      workflowSha256: guarded.workflow.workflowSha256,
      status: loaded.state.status,
      tick: loaded.state.tick,
      stateArtifactId: loaded.reference.artifactId,
      stateReference: loaded.reference,
      replayDisposition: "stale-supervisor-job",
      expectedStateTick: guarded.expectedStateTick,
      ...(loaded.state.releaseEvidenceArtifactId
        ? { releaseEvidenceArtifactId: loaded.state.releaseEvidenceArtifactId }
        : {}),
      ...(nextTickJobId ? { nextTickJobId } : {}),
    }),
  };
}

export function createSpriteSupervisorHandlers(
  runtime: RuntimeRepository,
): Readonly<Record<string, RuntimeJobHandler>> {
  const base = createBaseSpriteSupervisorHandlers(runtime);
  const handler = base["art.sprite-production.supervise"];
  if (!handler) {
    throw new Error("Base sprite supervisor handler is not registered.");
  }
  const guarded: RuntimeJobHandler = async (context) => {
    const claim = verifyPayloadAndJobIdentity(context);
    const loaded = await loadCurrentState(claim.workflow, context);
    if (!loaded) {
      if (claim.expectedStateTick !== 0) {
        throw new TransientRuntimeError(
          "SPRITE_SUPERVISOR_STATE_NOT_READY",
          `Supervisor continuation expected state tick ${claim.expectedStateTick}, but no state reference exists yet.`,
          normalizeJson({ expectedStateTick: claim.expectedStateTick }),
        );
      }
    } else if (loaded.state.tick < claim.expectedStateTick) {
      throw new TransientRuntimeError(
        "SPRITE_SUPERVISOR_STATE_NOT_READY",
        `Supervisor continuation expected state tick ${claim.expectedStateTick}, but the durable state is only tick ${loaded.state.tick}.`,
        normalizeJson({
          expectedStateTick: claim.expectedStateTick,
          currentStateTick: loaded.state.tick,
        }),
      );
    } else if (loaded.state.tick > claim.expectedStateTick) {
      return replayCurrentState(claim, loaded, context, runtime);
    }
    try {
      return await handler(context);
    } catch (error: unknown) {
      if (
        error instanceof PermanentRuntimeError &&
        error.code === "SPRITE_SUPERVISOR_STATE_CONFLICT"
      ) {
        throw new TransientRuntimeError(
          error.code,
          error.message,
          error.details,
        );
      }
      throw error;
    }
  };
  return Object.freeze({
    "art.sprite-production.supervise": guarded,
  });
}

export { spriteSupervisorWorkerCapabilities };
