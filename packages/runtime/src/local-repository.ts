import { randomUUID } from "node:crypto";

import {
  normalizeJson,
  type ArtifactId,
  type JsonValue,
} from "@evavo/art-artifacts";

import {
  LocalRuntimeJournal,
  type MutableRuntimeSnapshot,
  type RuntimeEventDraft,
} from "./journal.js";
import {
  cloneJson,
  eventData,
  idempotencyIndexKey,
  isTerminalState,
  normalizeRuntimeJobSubmission,
  normalizeRuntimeWorkerDescriptor,
  retryDelayMs,
  safeRuntimeName,
  workerCanRun,
} from "./normalize.js";
import {
  RUNTIME_PROTOCOL_VERSION,
  RuntimeError,
  type LocalRuntimeOptions,
  type RuntimeAttemptRecord,
  type RuntimeClaimRequest,
  type RuntimeClaimedJob,
  type RuntimeFailure,
  type RuntimeFailureInput,
  type RuntimeHeartbeatResult,
  type RuntimeJobRecord,
  type RuntimeJobState,
  type RuntimeJobSubmission,
  type RuntimeQuery,
  type RuntimeRepository,
  type RuntimeResumableState,
  type RuntimeSnapshot,
} from "./types.js";

const ACTIVE_STATES = new Set<RuntimeJobState>(["leased", "running"]);
const RESUMABLE_STATES = new Set<RuntimeJobState>([
  "waiting",
  "queued",
  "retry-wait",
]);
const ARTIFACT_ID = /^artifact_[a-f0-9]{64}$/;
const MAX_RUNTIME_OUTPUT_ARTIFACTS = 10_000;
const MAX_RUNTIME_QUERY_FILTERS = 10_000;
const RUNTIME_JOB_STATES = new Set<RuntimeJobState>([
  "waiting",
  "queued",
  "leased",
  "running",
  "retry-wait",
  "paused",
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
  "dead-letter",
]);
const RUNTIME_FAILURE_CLASSIFICATIONS = new Set<
  RuntimeFailure["classification"]
>([
  "transient",
  "permanent",
  "cancelled",
  "lease-expired",
  "deadline-exceeded",
  "dependency-failed",
  "timeout",
]);

type RuntimeControlOptionsSnapshot = Readonly<{
  force: boolean;
  now: Date;
  at: string;
}>;

type RuntimeClaimRequestSnapshot = Readonly<{
  worker: ReturnType<typeof normalizeRuntimeWorkerDescriptor>;
  maximumJobs: number;
  now: Date;
  at: string;
}>;

type RuntimeQuerySnapshot = Readonly<{
  states: readonly RuntimeJobState[] | null;
  queues: readonly string[] | null;
  kinds: readonly string[] | null;
  limit: number;
}>;

function iso(now: Date): string {
  if (!Number.isFinite(now.getTime())) {
    throw new RuntimeError("RUNTIME_TIME_INVALID", "Runtime time must be a valid Date.");
  }
  return now.toISOString();
}

function actorName(value: string | undefined): string {
  const actor = (value ?? "system").trim();
  if (!actor || actor.length > 256 || actor.includes("\0")) {
    throw new RuntimeError(
      "RUNTIME_ACTOR_INVALID",
      "Runtime actor must contain 1 to 256 characters.",
    );
  }
  return actor;
}

function invalidRuntimeControlOptions(message: string): never {
  throw new RuntimeError("RUNTIME_JOB_CONTROL_OPTIONS_INVALID", message);
}

function snapshotRuntimeControlDate(value: unknown): Date {
  let milliseconds = Number.NaN;
  try {
    milliseconds = Date.prototype.getTime.call(value);
  } catch {
    invalidRuntimeControlOptions(
      "Runtime job control time must be a valid Date.",
    );
  }
  if (!Number.isFinite(milliseconds)) {
    invalidRuntimeControlOptions(
      "Runtime job control time must be a valid Date.",
    );
  }
  return new Date(milliseconds);
}

function snapshotRuntimeControlOptions(
  value: unknown,
): RuntimeControlOptionsSnapshot {
  let recordLike = false;
  try {
    recordLike =
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value);
  } catch {
    invalidRuntimeControlOptions(
      "Runtime job control options could not be inspected safely.",
    );
  }
  if (!recordLike) {
    invalidRuntimeControlOptions(
      "Runtime job control options must be an object.",
    );
  }

  const source = value as Readonly<Record<string, unknown>>;
  let forceInput: unknown;
  let nowInput: unknown;
  try {
    forceInput = source.force;
    nowInput = source.now;
  } catch {
    invalidRuntimeControlOptions(
      "Runtime job control option fields could not be read safely.",
    );
  }

  let force = false;
  if (forceInput !== undefined) {
    if (typeof forceInput !== "boolean") {
      invalidRuntimeControlOptions(
        "Runtime job control force must be a boolean.",
      );
    }
    force = forceInput;
  }

  const now = nowInput === undefined
    ? new Date()
    : snapshotRuntimeControlDate(nowInput);
  return Object.freeze({ force, now, at: iso(now) });
}

function invalidRuntimeClaimRequest(message: string): never {
  throw new RuntimeError("RUNTIME_CLAIM_INVALID", message);
}

function snapshotRuntimeClaimDate(value: unknown): Date {
  let milliseconds = Number.NaN;
  try {
    milliseconds = Date.prototype.getTime.call(value);
  } catch {
    invalidRuntimeClaimRequest(
      "Runtime claim time must be a valid Date.",
    );
  }
  if (!Number.isFinite(milliseconds)) {
    invalidRuntimeClaimRequest(
      "Runtime claim time must be a valid Date.",
    );
  }
  return new Date(milliseconds);
}

function snapshotRuntimeClaimRequest(
  value: unknown,
): RuntimeClaimRequestSnapshot {
  let recordLike = false;
  try {
    recordLike =
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value);
  } catch {
    invalidRuntimeClaimRequest(
      "Runtime claim request could not be inspected safely.",
    );
  }
  if (!recordLike) {
    invalidRuntimeClaimRequest(
      "Runtime claim request must be an object.",
    );
  }

  const source = value as Readonly<Record<string, unknown>>;
  let workerInput: unknown;
  let maximumJobsInput: unknown;
  let nowInput: unknown;
  try {
    workerInput = source.worker;
    maximumJobsInput = source.maximumJobs;
    nowInput = source.now;
  } catch {
    invalidRuntimeClaimRequest(
      "Runtime claim request fields could not be read safely.",
    );
  }

  const now = nowInput === undefined
    ? new Date()
    : snapshotRuntimeClaimDate(nowInput);
  const worker = normalizeRuntimeWorkerDescriptor(
    workerInput as RuntimeClaimRequest["worker"],
  );
  const maximumJobs = maximumJobsInput === undefined
    ? 1
    : maximumJobsInput;
  if (
    typeof maximumJobs !== "number" ||
    !Number.isInteger(maximumJobs) ||
    maximumJobs < 1 ||
    maximumJobs > 100
  ) {
    invalidRuntimeClaimRequest(
      "maximumJobs must be an integer between 1 and 100.",
    );
  }

  return Object.freeze({
    worker,
    maximumJobs,
    now,
    at: iso(now),
  });
}

function snapshotRuntimeTransitionClock(value: unknown): Date {
  let milliseconds = Number.NaN;
  try {
    milliseconds = Date.prototype.getTime.call(value);
  } catch {
    throw new RuntimeError(
      "RUNTIME_TIME_INVALID",
      "Runtime transition time must be a valid Date.",
    );
  }
  if (!Number.isFinite(milliseconds)) {
    throw new RuntimeError(
      "RUNTIME_TIME_INVALID",
      "Runtime transition time must be a valid Date.",
    );
  }
  return new Date(milliseconds);
}


function invalidRuntimeQuery(message: string): never {
  throw new RuntimeError("RUNTIME_QUERY_INVALID", message);
}

function snapshotRuntimeQueryName(value: unknown, name: string): string {
  try {
    return safeRuntimeName(value, name);
  } catch {
    invalidRuntimeQuery(`${name} must contain 1 to 128 safe characters.`);
  }
}

function snapshotRuntimeQueryArray<T extends string>(
  value: unknown,
  name: "states" | "queues" | "kinds",
  normalize: (entry: unknown, index: number) => T,
): readonly T[] | null {
  if (value === undefined) return null;

  let arrayLike = false;
  try {
    arrayLike = Array.isArray(value);
  } catch {
    invalidRuntimeQuery(`Runtime query ${name} could not be inspected safely.`);
  }
  if (!arrayLike) {
    invalidRuntimeQuery(`Runtime query ${name} must be an array.`);
  }

  const source = value as readonly unknown[];
  let length = 0;
  try {
    length = source.length;
  } catch {
    invalidRuntimeQuery(`Runtime query ${name} length could not be read safely.`);
  }
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > MAX_RUNTIME_QUERY_FILTERS
  ) {
    invalidRuntimeQuery(
      `Runtime query ${name} must contain no more than ${MAX_RUNTIME_QUERY_FILTERS} entries.`,
    );
  }

  const snapshot: T[] = [];
  for (let index = 0; index < length; index += 1) {
    let entry: unknown;
    try {
      entry = source[index];
    } catch {
      invalidRuntimeQuery(
        `Runtime query ${name}[${index}] could not be read safely.`,
      );
    }
    if (entry === undefined) {
      invalidRuntimeQuery(
        `Runtime query ${name}[${index}] may not be undefined or sparse.`,
      );
    }
    snapshot.push(normalize(entry, index));
  }
  return Object.freeze([...new Set(snapshot)].sort());
}

function snapshotRuntimeQueryStates(
  value: unknown,
): readonly RuntimeJobState[] | null {
  return snapshotRuntimeQueryArray(
    value,
    "states",
    (entry, index) => {
      if (
        typeof entry !== "string" ||
        !RUNTIME_JOB_STATES.has(entry as RuntimeJobState)
      ) {
        invalidRuntimeQuery(
          `Runtime query states[${index}] must be a supported runtime job state.`,
        );
      }
      return entry as RuntimeJobState;
    },
  );
}

function snapshotRuntimeQueryNames(
  value: unknown,
  name: "queues" | "kinds",
): readonly string[] | null {
  return snapshotRuntimeQueryArray(
    value,
    name,
    (entry, index) => snapshotRuntimeQueryName(entry, `${name}[${index}]`),
  );
}

function snapshotRuntimeQuery(value: unknown): RuntimeQuerySnapshot {
  let recordLike = false;
  try {
    recordLike =
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value);
  } catch {
    invalidRuntimeQuery("Runtime query could not be inspected safely.");
  }
  if (!recordLike) {
    invalidRuntimeQuery("Runtime query must be an object.");
  }

  const source = value as Readonly<Record<string, unknown>>;
  let statesInput: unknown;
  let queuesInput: unknown;
  let kindsInput: unknown;
  let limitInput: unknown;
  try {
    statesInput = source.states;
    queuesInput = source.queues;
    kindsInput = source.kinds;
    limitInput = source.limit;
  } catch {
    invalidRuntimeQuery("Runtime query fields could not be read safely.");
  }

  const limit = limitInput === undefined ? 1_000 : limitInput;
  if (
    typeof limit !== "number" ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100_000
  ) {
    invalidRuntimeQuery("Runtime query limit must be 1 to 100000.");
  }

  return Object.freeze({
    states: snapshotRuntimeQueryStates(statesInput),
    queues: snapshotRuntimeQueryNames(queuesInput, "queues"),
    kinds: snapshotRuntimeQueryNames(kindsInput, "kinds"),
    limit,
  });
}

function snapshotRuntimeJobId(value: unknown): string {
  if (typeof value !== "string") {
    invalidRuntimeQuery(
      "Runtime job ID must contain 1 to 128 safe characters.",
    );
  }
  try {
    return safeRuntimeName(value, "Runtime job ID");
  } catch {
    invalidRuntimeQuery(
      "Runtime job ID must contain 1 to 128 safe characters.",
    );
  }
}

function draft(
  type: string,
  actor: string,
  at: string,
  jobId: string | undefined,
  data: unknown,
): RuntimeEventDraft {
  return {
    type,
    actor,
    at,
    ...(jobId === undefined ? {} : { jobId }),
    data: eventData(data),
  };
}

function jobOrThrow(snapshot: MutableRuntimeSnapshot, jobId: string): RuntimeJobRecord {
  const job = snapshot.jobs[jobId];
  if (!job) {
    throw new RuntimeError("RUNTIME_JOB_NOT_FOUND", `Runtime job was not found: ${jobId}`);
  }
  return job;
}

function isGovernedSingleAttemptBookArtJob(job: RuntimeJobRecord): boolean {
  const migrationMode = job.spec.labels.migrationMode;
  return (
    job.spec.maximumAttempts === 1 &&
    (migrationMode === "book-art-shadow-candidate" ||
      migrationMode === "book-art-candidate-set")
  );
}

function executionAttemptLimit(job: RuntimeJobRecord): number {
  return isGovernedSingleAttemptBookArtJob(job)
    ? job.spec.maximumAttempts
    : job.attemptLimit;
}

function assertExecutionAttemptAllowed(job: RuntimeJobRecord): void {
  const limit = executionAttemptLimit(job);
  if (job.attempts.length <= limit) return;
  throw new RuntimeError(
    "RUNTIME_ATTEMPT_POLICY_FORBIDDEN",
    `Governed Book Art provider job ${job.id} cannot execute attempt ${job.attempts.length}; its immutable provider attempt limit is ${limit}.`,
  );
}

function invalidRuntimeOutputArtifacts(message: string): never {
  throw new RuntimeError("RUNTIME_OUTPUT_ARTIFACT_INVALID", message);
}

function snapshotRuntimeOutputArtifacts(
  value: unknown,
): readonly ArtifactId[] {
  let arrayLike = false;
  try {
    arrayLike = Array.isArray(value);
  } catch {
    invalidRuntimeOutputArtifacts(
      "Runtime output artifacts could not be inspected safely.",
    );
  }
  if (!arrayLike) {
    invalidRuntimeOutputArtifacts(
      "Runtime output artifacts must be an array.",
    );
  }

  const source = value as readonly unknown[];
  let length = 0;
  try {
    length = source.length;
  } catch {
    invalidRuntimeOutputArtifacts(
      "Runtime output artifact length could not be read safely.",
    );
  }
  if (
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > MAX_RUNTIME_OUTPUT_ARTIFACTS
  ) {
    invalidRuntimeOutputArtifacts(
      `Runtime output artifacts must contain no more than ${MAX_RUNTIME_OUTPUT_ARTIFACTS} entries.`,
    );
  }

  const snapshot: ArtifactId[] = [];
  for (let index = 0; index < length; index += 1) {
    let entry: unknown;
    try {
      entry = source[index];
    } catch {
      invalidRuntimeOutputArtifacts(
        `Runtime output artifact ${index} could not be read safely.`,
      );
    }
    if (typeof entry !== "string" || !ARTIFACT_ID.test(entry)) {
      invalidRuntimeOutputArtifacts(
        `Runtime output artifact ${index} must be a canonical artifact ID.`,
      );
    }
    snapshot.push(entry as ArtifactId);
  }
  return Object.freeze([...new Set(snapshot)].sort());
}

function invalidRuntimeFailureInput(message: string): never {
  throw new RuntimeError("RUNTIME_FAILURE_INVALID", message);
}

function freezeRuntimeJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    for (const entry of value) freezeRuntimeJson(entry);
    return Object.freeze(value);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Readonly<Record<string, JsonValue>>;
    for (const key of Object.keys(record)) {
      freezeRuntimeJson(record[key]!);
    }
    return Object.freeze(record);
  }
  return value;
}

function snapshotRuntimeFailureInput(value: unknown): RuntimeFailure {
  let recordLike = false;
  try {
    recordLike =
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value);
  } catch {
    invalidRuntimeFailureInput(
      "Runtime failure input could not be inspected safely.",
    );
  }
  if (!recordLike) {
    invalidRuntimeFailureInput("Runtime failure input must be an object.");
  }

  const source = value as Readonly<Record<string, unknown>>;
  let classificationInput: unknown;
  let codeInput: unknown;
  let messageInput: unknown;
  let detailsInput: unknown;
  try {
    classificationInput = source.classification;
    codeInput = source.code;
    messageInput = source.message;
    detailsInput = source.details;
  } catch {
    invalidRuntimeFailureInput(
      "Runtime failure fields could not be read safely.",
    );
  }

  if (
    typeof classificationInput !== "string" ||
    !RUNTIME_FAILURE_CLASSIFICATIONS.has(
      classificationInput as RuntimeFailure["classification"],
    )
  ) {
    invalidRuntimeFailureInput(
      "Runtime failure classification is not supported.",
    );
  }
  const classification =
    classificationInput as RuntimeFailure["classification"];

  let code = "";
  try {
    code = safeRuntimeName(codeInput, "failure.code");
  } catch {
    invalidRuntimeFailureInput(
      "Runtime failure code must contain 1 to 128 safe characters.",
    );
  }

  if (typeof messageInput !== "string") {
    invalidRuntimeFailureInput(
      "Failure message must contain 1 to 4096 characters.",
    );
  }
  const message = messageInput.trim();
  if (!message || message.length > 4_096 || message.includes(" ")) {
    invalidRuntimeFailureInput(
      "Failure message must contain 1 to 4096 characters.",
    );
  }

  let details: JsonValue | undefined;
  if (detailsInput !== undefined) {
    try {
      details = freezeRuntimeJson(
        normalizeJson(detailsInput, "$.failure.details"),
      );
    } catch {
      invalidRuntimeFailureInput(
        "Runtime failure details must contain valid JSON data.",
      );
    }
  }

  return Object.freeze({
    classification,
    code,
    message,
    ...(details === undefined ? {} : { details }),
  });
}

function replaceLastAttempt(
  job: RuntimeJobRecord,
  patch: Partial<RuntimeAttemptRecord>,
): readonly RuntimeAttemptRecord[] {
  if (job.attempts.length === 0) {
    throw new RuntimeError(
      "RUNTIME_ATTEMPT_MISSING",
      `Job ${job.id} has no active attempt record.`,
    );
  }
  const attempts = [...job.attempts];
  const index = attempts.length - 1;
  attempts[index] = { ...attempts[index]!, ...patch };
  return attempts;
}

function withoutExecutionFields(job: RuntimeJobRecord) {
  const {
    lease: _lease,
    nextAttemptAt: _nextAttemptAt,
    cancellationRequestedAt: _cancellationRequestedAt,
    pauseRequestedAt: _pauseRequestedAt,
    pausedFromState: _pausedFromState,
    finishedAt: _finishedAt,
    failure: _failure,
    ...base
  } = job;
  return base;
}

function withoutNextAttempt(job: RuntimeJobRecord) {
  const { nextAttemptAt: _nextAttemptAt, ...base } = job;
  return base;
}

function dependencyFailure(
  job: RuntimeJobRecord,
  dependencyId: string,
  at: string,
): RuntimeJobRecord {
  const base = withoutExecutionFields(job);
  return {
    ...base,
    state: "blocked",
    updatedAt: at,
    finishedAt: at,
    failure: {
      classification: "dependency-failed",
      code: "RUNTIME_DEPENDENCY_FAILED",
      message: `Dependency ${dependencyId} did not succeed.`,
      details: { dependencyJobId: dependencyId },
    },
  };
}

function deadlineFailure(job: RuntimeJobRecord, at: string): RuntimeJobRecord {
  const base = withoutExecutionFields(job);
  return {
    ...base,
    state: "failed",
    updatedAt: at,
    finishedAt: at,
    failure: {
      classification: "deadline-exceeded",
      code: "RUNTIME_DEADLINE_EXCEEDED",
      message: "The job deadline elapsed before execution completed.",
      ...(job.spec.deadline === undefined
        ? {}
        : { details: { deadline: job.spec.deadline } }),
    },
  };
}

function attemptsExhausted(job: RuntimeJobRecord, at: string): RuntimeJobRecord {
  const base = withoutExecutionFields(job);
  return {
    ...base,
    state: "dead-letter",
    updatedAt: at,
    finishedAt: at,
    failure: job.failure ?? {
      classification: "permanent",
      code: "RUNTIME_ATTEMPTS_EXHAUSTED",
      message: "The job has no remaining execution attempts.",
    },
  };
}

function transitionAvailability(
  job: RuntimeJobRecord,
  snapshot: MutableRuntimeSnapshot,
  now: Date,
): RuntimeJobRecord {
  if (!RESUMABLE_STATES.has(job.state)) return job;
  const at = iso(now);
  if (job.spec.deadline && Date.parse(job.spec.deadline) <= now.getTime()) {
    return deadlineFailure(job, at);
  }
  if (job.attempts.length >= executionAttemptLimit(job)) {
    return attemptsExhausted(job, at);
  }

  for (const dependencyId of job.spec.dependencyJobIds) {
    const dependency = snapshot.jobs[dependencyId];
    if (!dependency || !isTerminalState(dependency.state)) {
      return job.state === "waiting"
        ? job
        : { ...job, state: "waiting", updatedAt: at };
    }
    if (dependency.state !== "succeeded") {
      return dependencyFailure(job, dependencyId, at);
    }
  }

  const delayedUntil = job.nextAttemptAt ?? job.spec.notBefore;
  if (delayedUntil && Date.parse(delayedUntil) > now.getTime()) {
    const desired: RuntimeJobState = job.nextAttemptAt ? "retry-wait" : "waiting";
    return job.state === desired ? job : { ...job, state: desired, updatedAt: at };
  }

  if (job.state === "queued" && job.nextAttemptAt === undefined) return job;
  const base = withoutNextAttempt(job);
  return { ...base, state: "queued", updatedAt: at };
}

function reconcileSnapshot(
  snapshot: MutableRuntimeSnapshot,
  actor: string,
  now: Date,
  events: RuntimeEventDraft[],
): boolean {
  let changed = false;
  const maximumPasses = Math.max(1, Object.keys(snapshot.jobs).length + 1);
  for (let pass = 0; pass < maximumPasses; pass += 1) {
    let passChanged = false;
    for (const jobId of Object.keys(snapshot.jobs).sort()) {
      const before = snapshot.jobs[jobId]!;
      const after = transitionAvailability(before, snapshot, now);
      if (after === before) continue;
      snapshot.jobs[jobId] = after;
      changed = true;
      passChanged = true;
      events.push(
        draft(
          after.state === "queued"
            ? "job.ready"
            : after.state === "blocked"
              ? "job.blocked"
              : after.state === "failed"
                ? "job.deadline-exceeded"
                : after.state === "dead-letter"
                  ? "job.dead-lettered"
                  : "job.waiting",
          actor,
          after.updatedAt,
          jobId,
          { previousState: before.state, state: after.state },
        ),
      );
    }
    if (!passChanged) break;
  }
  return changed;
}

function assertAcyclic(snapshot: MutableRuntimeSnapshot): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (jobId: string, stack: readonly string[]): void => {
    if (visited.has(jobId)) return;
    if (visiting.has(jobId)) {
      throw new RuntimeError(
        "RUNTIME_DEPENDENCY_CYCLE",
        `Runtime dependency cycle detected: ${[...stack, jobId].join(" -> ")}`,
      );
    }
    const job = snapshot.jobs[jobId];
    if (!job) return;
    visiting.add(jobId);
    for (const dependencyId of job.spec.dependencyJobIds) {
      if (snapshot.jobs[dependencyId]) visit(dependencyId, [...stack, jobId]);
    }
    visiting.delete(jobId);
    visited.add(jobId);
  };
  for (const jobId of Object.keys(snapshot.jobs).sort()) visit(jobId, []);
}

function ensureLease(
  job: RuntimeJobRecord,
  leaseToken: string,
  states: readonly RuntimeJobState[],
  now: Date,
): void {
  if (!states.includes(job.state) || !job.lease) {
    throw new RuntimeError(
      "RUNTIME_LEASE_STATE_INVALID",
      `Job ${job.id} is not in an expected leased state.`,
    );
  }
  if (job.lease.token !== leaseToken) {
    throw new RuntimeError("RUNTIME_LEASE_TOKEN_INVALID", `Lease token is invalid for ${job.id}.`);
  }
  if (Date.parse(job.lease.expiresAt) <= now.getTime()) {
    throw new RuntimeError("RUNTIME_LEASE_EXPIRED", `Lease has expired for ${job.id}.`);
  }
}

function finishActiveAttempt(
  job: RuntimeJobRecord,
  failure: RuntimeFailure,
  state: "cancelled" | "paused",
  at: string,
): RuntimeJobRecord {
  const attempts = replaceLastAttempt(job, {
    finishedAt: at,
    outcome: "cancelled",
    failure,
  });
  const base = withoutExecutionFields(job);
  if (state === "paused") {
    return {
      ...base,
      state,
      updatedAt: at,
      attempts,
      outputArtifacts: [],
      pauseRequestedAt: at,
      pausedFromState: "queued",
      failure,
    };
  }
  return {
    ...base,
    state,
    updatedAt: at,
    attempts,
    outputArtifacts: [],
    finishedAt: at,
    failure,
  };
}

function applyFailure(
  job: RuntimeJobRecord,
  failure: RuntimeFailure,
  now: Date,
): RuntimeJobRecord {
  const at = iso(now);
  const attempts = replaceLastAttempt(job, {
    finishedAt: at,
    outcome:
      failure.classification === "lease-expired"
        ? "expired"
        : failure.classification === "cancelled"
          ? "cancelled"
          : "failed",
    failure,
  });
  const attempted: RuntimeJobRecord = { ...job, attempts };
  const base = withoutExecutionFields(attempted);

  if (failure.classification === "cancelled") {
    return {
      ...base,
      state: "cancelled",
      updatedAt: at,
      attempts,
      outputArtifacts: [],
      finishedAt: at,
      failure,
    };
  }
  if (failure.classification === "dependency-failed") {
    return {
      ...base,
      state: "blocked",
      updatedAt: at,
      attempts,
      outputArtifacts: [],
      finishedAt: at,
      failure,
    };
  }
  if (
    failure.classification === "permanent" ||
    failure.classification === "deadline-exceeded"
  ) {
    return {
      ...base,
      state: "failed",
      updatedAt: at,
      attempts,
      outputArtifacts: [],
      finishedAt: at,
      failure,
    };
  }

  if (attempts.length >= executionAttemptLimit(job)) {
    return {
      ...base,
      state: "dead-letter",
      updatedAt: at,
      attempts,
      outputArtifacts: [],
      finishedAt: at,
      failure,
    };
  }

  const delay = retryDelayMs(attempted);
  const nextAttemptAt = new Date(now.getTime() + delay).toISOString();
  if (job.spec.deadline && Date.parse(job.spec.deadline) <= Date.parse(nextAttemptAt)) {
    return deadlineFailure({ ...attempted, failure }, at);
  }
  return {
    ...base,
    state: "retry-wait",
    updatedAt: at,
    attempts,
    nextAttemptAt,
    outputArtifacts: [],
    failure,
  };
}

function initialJob(
  specHash: string,
  spec: ReturnType<typeof normalizeRuntimeJobSubmission>["spec"],
  now: Date,
): RuntimeJobRecord {
  const at = iso(now);
  return {
    schemaVersion: "1.0",
    protocolVersion: RUNTIME_PROTOCOL_VERSION,
    id: spec.id,
    specHash,
    spec,
    state: "waiting",
    createdAt: at,
    updatedAt: at,
    attemptLimit: spec.maximumAttempts,
    attempts: [],
    outputArtifacts: [],
    redriveCount: 0,
  };
}

export class LocalRuntimeRepository implements RuntimeRepository {
  readonly #journal: LocalRuntimeJournal;

  public constructor(options: LocalRuntimeOptions) {
    this.#journal = new LocalRuntimeJournal(options);
  }

  public async submit(
    submission: RuntimeJobSubmission,
    actor = "system",
    now = new Date(),
  ): Promise<RuntimeJobRecord> {
    return (await this.submitBatch([submission], actor, now))[0]!;
  }

  public async submitBatch(
    submissions: readonly RuntimeJobSubmission[],
    actorInput = "system",
    now = new Date(),
  ): Promise<readonly RuntimeJobRecord[]> {
    const transitionNow = snapshotRuntimeTransitionClock(now);
    if (submissions.length === 0 || submissions.length > 10_000) {
      throw new RuntimeError(
        "RUNTIME_BATCH_INVALID",
        "Runtime submission batch must contain 1 to 10000 jobs.",
      );
    }
    const actor = actorName(actorInput);
    const normalized = submissions.map(normalizeRuntimeJobSubmission);
    const at = iso(transitionNow);

    return this.#journal.transact((snapshot) => {
      const events: RuntimeEventDraft[] = [];
      const resultIds: string[] = [];
      let changed = false;

      for (const entry of normalized) {
        const indexKey = idempotencyIndexKey(
          entry.spec.queue,
          entry.spec.idempotencyKey,
        );
        const existingId = snapshot.idempotencyIndex[indexKey];
        if (existingId) {
          const existing = jobOrThrow(snapshot, existingId);
          if (existing.specHash !== entry.specHash) {
            throw new RuntimeError(
              "RUNTIME_IDEMPOTENCY_CONFLICT",
              `Idempotency key already belongs to a different job specification: ${entry.spec.idempotencyKey}`,
            );
          }
          resultIds.push(existing.id);
          continue;
        }

        const sameId = snapshot.jobs[entry.spec.id];
        if (sameId) {
          if (sameId.specHash !== entry.specHash) {
            throw new RuntimeError(
              "RUNTIME_JOB_ID_CONFLICT",
              `Job ID already belongs to another specification: ${entry.spec.id}`,
            );
          }
          snapshot.idempotencyIndex[indexKey] = sameId.id;
          resultIds.push(sameId.id);
          changed = true;
          continue;
        }

        const job = initialJob(entry.specHash, entry.spec, transitionNow);
        snapshot.jobs[job.id] = job;
        snapshot.idempotencyIndex[indexKey] = job.id;
        resultIds.push(job.id);
        changed = true;
        events.push(
          draft("job.submitted", actor, at, job.id, {
            queue: job.spec.queue,
            kind: job.spec.kind,
            specHash: job.specHash,
            dependencies: job.spec.dependencyJobIds,
          }),
        );
      }

      assertAcyclic(snapshot);
      changed = reconcileSnapshot(snapshot, actor, transitionNow, events) || changed;
      return {
        result: resultIds.map((jobId) => cloneJson(jobOrThrow(snapshot, jobId))),
        events,
        changed,
      };
    });
  }

  public async get(jobIdInput: string): Promise<RuntimeJobRecord | null> {
    const jobId = snapshotRuntimeJobId(jobIdInput);
    const snapshot = await this.#journal.snapshot();
    const job = snapshot.jobs[jobId];
    return job ? cloneJson(job) : null;
  }

  public async list(queryInput: RuntimeQuery = {}): Promise<readonly RuntimeJobRecord[]> {
    const {
      states: stateValues,
      queues: queueValues,
      kinds: kindValues,
      limit,
    } = snapshotRuntimeQuery(queryInput);
    const states = stateValues === null ? null : new Set(stateValues);
    const queues = queueValues === null ? null : new Set(queueValues);
    const kinds = kindValues === null ? null : new Set(kindValues);
    const snapshot = await this.#journal.snapshot();
    return Object.values(snapshot.jobs)
      .filter((job) => !states || states.has(job.state))
      .filter((job) => !queues || queues.has(job.spec.queue))
      .filter((job) => !kinds || kinds.has(job.spec.kind))
      .sort(
        (left, right) =>
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
          left.id.localeCompare(right.id),
      )
      .slice(0, limit)
      .map(cloneJson);
  }

  public async claim(request: RuntimeClaimRequest): Promise<readonly RuntimeClaimedJob[]> {
    const {
      worker,
      maximumJobs,
      now,
      at,
    } = snapshotRuntimeClaimRequest(request);
    const workerId = worker.id;
    const capabilities = worker.capabilities;
    const capabilityProfiles = worker.capabilityProfiles ?? [];
    const queues = worker.queues;

    return this.#journal.transact((snapshot) => {
      const events: RuntimeEventDraft[] = [];
      let changed = reconcileSnapshot(snapshot, workerId, now, events);
      const allowedQueues = queues ? new Set(queues) : null;
      const candidates = Object.values(snapshot.jobs)
        .filter((job) => job.state === "queued")
        .filter((job) => !allowedQueues || allowedQueues.has(job.spec.queue))
        .filter((job) =>
          workerCanRun(job, capabilities, capabilityProfiles),
        )
        .sort(
          (left, right) =>
            right.spec.priority - left.spec.priority ||
            Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
            left.id.localeCompare(right.id),
        )
        .slice(0, maximumJobs);
      const claimed: RuntimeClaimedJob[] = [];

      for (const job of candidates) {
        const token = `lease_${randomUUID().replaceAll("-", "")}`;
        const lease = {
          workerId,
          token,
          leasedAt: at,
          expiresAt: new Date(now.getTime() + job.spec.leaseDurationMs).toISOString(),
        } as const;
        const attempt: RuntimeAttemptRecord = {
          attempt: job.attempts.length + 1,
          workerId,
          leaseToken: token,
          leasedAt: at,
          heartbeatCount: 0,
          outputArtifacts: [],
        };
        const base = withoutNextAttempt(job);
        const updated: RuntimeJobRecord = {
          ...base,
          state: "leased",
          updatedAt: at,
          attempts: [...job.attempts, attempt],
          lease,
        };
        snapshot.jobs[job.id] = updated;
        claimed.push({
          job: cloneJson(updated),
          lease,
          cancellationRequested: false,
        });
        events.push(
          draft("job.leased", workerId, at, job.id, {
            attempt: attempt.attempt,
            leaseExpiresAt: lease.expiresAt,
          }),
        );
        changed = true;
      }
      return { result: claimed, events, changed };
    });
  }

  public async start(
    jobId: string,
    leaseToken: string,
    actorInput: string,
    now = new Date(),
  ): Promise<RuntimeJobRecord> {
    const transitionNow = snapshotRuntimeTransitionClock(now);
    const actor = actorName(actorInput);
    const at = iso(transitionNow);
    return this.#journal.transact((snapshot) => {
      const job = jobOrThrow(snapshot, jobId);
      ensureLease(job, leaseToken, ["leased"], transitionNow);
      assertExecutionAttemptAllowed(job);
      if (job.cancellationRequestedAt || job.pauseRequestedAt) {
        throw new RuntimeError(
          "RUNTIME_JOB_CONTROL_REQUESTED",
          `Job ${jobId} has a cancellation or pause request.`,
        );
      }
      const attempts = replaceLastAttempt(job, {
        startedAt: at,
        lastHeartbeatAt: at,
      });
      const updated: RuntimeJobRecord = {
        ...job,
        state: "running",
        updatedAt: at,
        attempts,
      };
      snapshot.jobs[jobId] = updated;
      return {
        result: cloneJson(updated),
        changed: true,
        events: [draft("job.started", actor, at, jobId, { attempt: attempts.length })],
      };
    });
  }

  public async heartbeat(
    jobId: string,
    leaseToken: string,
    actorInput: string,
    now = new Date(),
  ): Promise<RuntimeHeartbeatResult> {
    const transitionNow = snapshotRuntimeTransitionClock(now);
    const actor = actorName(actorInput);
    const at = iso(transitionNow);
    return this.#journal.transact((snapshot) => {
      const job = jobOrThrow(snapshot, jobId);
      ensureLease(job, leaseToken, ["running"], transitionNow);
      assertExecutionAttemptAllowed(job);
      const attempt = job.attempts.at(-1)!;
      if (job.spec.deadline && Date.parse(job.spec.deadline) <= transitionNow.getTime()) {
        throw new RuntimeError("RUNTIME_JOB_DEADLINE_EXCEEDED", `Deadline elapsed for ${jobId}.`);
      }
      if (
        attempt.startedAt &&
        Date.parse(attempt.startedAt) + job.spec.timeoutMs <= transitionNow.getTime()
      ) {
        throw new RuntimeError("RUNTIME_JOB_TIMEOUT", `Execution timeout elapsed for ${jobId}.`);
      }
      const lease = {
        ...job.lease!,
        expiresAt: new Date(transitionNow.getTime() + job.spec.leaseDurationMs).toISOString(),
      };
      const attempts = replaceLastAttempt(job, {
        lastHeartbeatAt: at,
        heartbeatCount: attempt.heartbeatCount + 1,
      });
      const updated: RuntimeJobRecord = {
        ...job,
        updatedAt: at,
        lease,
        attempts,
      };
      snapshot.jobs[jobId] = updated;
      return {
        result: {
          job: cloneJson(updated),
          cancellationRequested: updated.cancellationRequestedAt !== undefined,
          pauseRequested: updated.pauseRequestedAt !== undefined,
        },
        changed: true,
        events: [
          draft("job.heartbeat", actor, at, jobId, {
            heartbeatCount: attempts.at(-1)!.heartbeatCount,
            leaseExpiresAt: lease.expiresAt,
          }),
        ],
      };
    });
  }

  public async complete(
    jobId: string,
    leaseToken: string,
    outputArtifactsInput: readonly ArtifactId[],
    actorInput: string,
    now = new Date(),
  ): Promise<RuntimeJobRecord> {
    const transitionNow = snapshotRuntimeTransitionClock(now);
    const outputArtifacts = snapshotRuntimeOutputArtifacts(
      outputArtifactsInput,
    );
    const actor = actorName(actorInput);
    const at = iso(transitionNow);
    return this.#journal.transact((snapshot) => {
      const events: RuntimeEventDraft[] = [];
      const job = jobOrThrow(snapshot, jobId);
      ensureLease(job, leaseToken, ["running"], transitionNow);
      assertExecutionAttemptAllowed(job);
      let updated: RuntimeJobRecord;
      if (job.cancellationRequestedAt) {
        updated = finishActiveAttempt(
          job,
          {
            classification: "cancelled",
            code: "RUNTIME_JOB_CANCELLED",
            message: "Cancellation was requested before completion committed.",
          },
          "cancelled",
          at,
        );
        events.push(draft("job.cancelled", actor, at, jobId, { forced: false }));
      } else if (job.pauseRequestedAt) {
        updated = finishActiveAttempt(
          job,
          {
            classification: "cancelled",
            code: "RUNTIME_JOB_PAUSED",
            message: "Pause was requested before completion committed.",
          },
          "paused",
          at,
        );
        events.push(draft("job.paused", actor, at, jobId, { forced: false }));
      } else {
        const attempts = replaceLastAttempt(job, {
          finishedAt: at,
          outcome: "succeeded",
          outputArtifacts,
        });
        const base = withoutExecutionFields(job);
        updated = {
          ...base,
          state: "succeeded",
          updatedAt: at,
          attempts,
          outputArtifacts,
          finishedAt: at,
        };
        events.push(
          draft("job.succeeded", actor, at, jobId, {
            outputArtifacts,
            attempt: attempts.length,
          }),
        );
      }
      snapshot.jobs[jobId] = updated;
      reconcileSnapshot(snapshot, actor, transitionNow, events);
      return { result: cloneJson(updated), events, changed: true };
    });
  }

  public async fail(
    jobId: string,
    leaseToken: string,
    failureInput: RuntimeFailureInput,
    actorInput: string,
    now = new Date(),
  ): Promise<RuntimeJobRecord> {
    const transitionNow = snapshotRuntimeTransitionClock(now);
    const failure = snapshotRuntimeFailureInput(failureInput);
    const actor = actorName(actorInput);
    return this.#journal.transact((snapshot) => {
      const events: RuntimeEventDraft[] = [];
      const job = jobOrThrow(snapshot, jobId);
      ensureLease(job, leaseToken, ["leased", "running"], transitionNow);
      const updated = applyFailure(job, failure, transitionNow);
      snapshot.jobs[jobId] = updated;
      events.push(
        draft(
          updated.state === "retry-wait"
            ? "job.retry-scheduled"
            : updated.state === "dead-letter"
              ? "job.dead-lettered"
              : updated.state === "cancelled"
                ? "job.cancelled"
                : "job.failed",
          actor,
          updated.updatedAt,
          jobId,
          {
            classification: failure.classification,
            code: failure.code,
            state: updated.state,
            ...(updated.nextAttemptAt ? { nextAttemptAt: updated.nextAttemptAt } : {}),
          },
        ),
      );
      reconcileSnapshot(snapshot, actor, transitionNow, events);
      return { result: cloneJson(updated), events, changed: true };
    });
  }

  public async cancel(
    jobId: string,
    actorInput: string,
    options: Readonly<{ force?: boolean; now?: Date }> = {},
  ): Promise<RuntimeJobRecord> {
    const actor = actorName(actorInput);
    const { force, now, at } = snapshotRuntimeControlOptions(options);
    return this.#journal.transact((snapshot) => {
      const events: RuntimeEventDraft[] = [];
      const job = jobOrThrow(snapshot, jobId);
      if (job.state === "cancelled" || job.state === "succeeded") {
        return { result: cloneJson(job), events, changed: false };
      }
      if (isTerminalState(job.state)) {
        throw new RuntimeError(
          "RUNTIME_JOB_TERMINAL",
          `Terminal job ${jobId} cannot be cancelled from ${job.state}.`,
        );
      }
      if (ACTIVE_STATES.has(job.state) && !force) {
        if (job.cancellationRequestedAt) {
          return { result: cloneJson(job), events, changed: false };
        }
        const updated = { ...job, cancellationRequestedAt: at, updatedAt: at };
        snapshot.jobs[jobId] = updated;
        events.push(draft("job.cancellation-requested", actor, at, jobId, {}));
        return { result: cloneJson(updated), events, changed: true };
      }

      const failure: RuntimeFailure = {
        classification: "cancelled",
        code: "RUNTIME_JOB_CANCELLED",
        message: force
          ? "Job execution was force-cancelled."
          : "Job was cancelled before execution.",
      };
      const updated = ACTIVE_STATES.has(job.state)
        ? finishActiveAttempt(job, failure, "cancelled", at)
        : {
            ...withoutExecutionFields(job),
            state: "cancelled" as const,
            updatedAt: at,
            outputArtifacts: [],
            finishedAt: at,
            failure,
          };
      snapshot.jobs[jobId] = updated;
      events.push(draft("job.cancelled", actor, at, jobId, { forced: force ?? false }));
      reconcileSnapshot(snapshot, actor, now, events);
      return { result: cloneJson(updated), events, changed: true };
    });
  }

  public async pause(
    jobId: string,
    actorInput: string,
    options: Readonly<{ force?: boolean; now?: Date }> = {},
  ): Promise<RuntimeJobRecord> {
    const actor = actorName(actorInput);
    const { force, now, at } = snapshotRuntimeControlOptions(options);
    return this.#journal.transact((snapshot) => {
      const job = jobOrThrow(snapshot, jobId);
      if (job.state === "paused") return { result: cloneJson(job), events: [], changed: false };
      if (isTerminalState(job.state)) {
        throw new RuntimeError(
          "RUNTIME_JOB_TERMINAL",
          `Terminal job ${jobId} cannot be paused from ${job.state}.`,
        );
      }
      if (ACTIVE_STATES.has(job.state) && !force) {
        if (job.pauseRequestedAt) {
          return { result: cloneJson(job), events: [], changed: false };
        }
        const updated = { ...job, pauseRequestedAt: at, updatedAt: at };
        snapshot.jobs[jobId] = updated;
        return {
          result: cloneJson(updated),
          changed: true,
          events: [draft("job.pause-requested", actor, at, jobId, {})],
        };
      }

      const failure: RuntimeFailure = {
        classification: "cancelled",
        code: "RUNTIME_JOB_PAUSED",
        message: force
          ? "Active execution was stopped to pause the job."
          : "Job was paused before execution.",
      };
      let updated: RuntimeJobRecord;
      if (ACTIVE_STATES.has(job.state)) {
        updated = finishActiveAttempt(job, failure, "paused", at);
      } else {
        if (!RESUMABLE_STATES.has(job.state)) {
          throw new RuntimeError("RUNTIME_PAUSE_INVALID", `Job ${jobId} cannot pause from ${job.state}.`);
        }
        updated = {
          ...job,
          state: "paused",
          updatedAt: at,
          pauseRequestedAt: at,
          pausedFromState: job.state as RuntimeResumableState,
          failure,
        };
      }
      snapshot.jobs[jobId] = updated;
      return {
        result: cloneJson(updated),
        changed: true,
        events: [draft("job.paused", actor, at, jobId, { forced: force ?? false })],
      };
    });
  }

  public async resume(
    jobId: string,
    actorInput: string,
    now = new Date(),
  ): Promise<RuntimeJobRecord> {
    const transitionNow = snapshotRuntimeTransitionClock(now);
    const actor = actorName(actorInput);
    const at = iso(transitionNow);
    return this.#journal.transact((snapshot) => {
      const events: RuntimeEventDraft[] = [];
      const job = jobOrThrow(snapshot, jobId);
      if (ACTIVE_STATES.has(job.state) && job.pauseRequestedAt) {
        const { pauseRequestedAt: _pauseRequestedAt, ...base } = job;
        const updated = { ...base, updatedAt: at };
        snapshot.jobs[jobId] = updated;
        return {
          result: cloneJson(updated),
          changed: true,
          events: [draft("job.pause-withdrawn", actor, at, jobId, {})],
        };
      }
      if (job.state !== "paused") {
        throw new RuntimeError("RUNTIME_RESUME_INVALID", `Job ${jobId} is not paused.`);
      }
      const {
        pauseRequestedAt: _pauseRequestedAt,
        pausedFromState: _pausedFromState,
        failure: _failure,
        ...base
      } = job;
      const resumed: RuntimeJobRecord = {
        ...base,
        state: job.pausedFromState ?? "waiting",
        updatedAt: at,
      };
      snapshot.jobs[jobId] = resumed;
      reconcileSnapshot(snapshot, actor, transitionNow, events);
      const updated = jobOrThrow(snapshot, jobId);
      events.unshift(draft("job.resumed", actor, at, jobId, { state: updated.state }));
      return { result: cloneJson(updated), changed: true, events };
    });
  }

  public async redrive(
    jobId: string,
    additionalAttempts: number,
    actorInput: string,
    now = new Date(),
  ): Promise<RuntimeJobRecord> {
    const transitionNow = snapshotRuntimeTransitionClock(now);
    if (!Number.isInteger(additionalAttempts) || additionalAttempts < 1 || additionalAttempts > 50) {
      throw new RuntimeError(
        "RUNTIME_REDRIVE_INVALID",
        "additionalAttempts must be an integer between 1 and 50.",
      );
    }
    const actor = actorName(actorInput);
    const at = iso(transitionNow);
    return this.#journal.transact((snapshot) => {
      const events: RuntimeEventDraft[] = [];
      const job = jobOrThrow(snapshot, jobId);
      if (isGovernedSingleAttemptBookArtJob(job)) {
        throw new RuntimeError(
          "RUNTIME_REDRIVE_POLICY_FORBIDDEN",
          `Governed Book Art provider job ${jobId} is immutable at one provider attempt and cannot be redriven.`,
        );
      }
      if (!isTerminalState(job.state) || job.state === "succeeded") {
        throw new RuntimeError(
          "RUNTIME_REDRIVE_INVALID",
          `Job ${jobId} cannot be redriven from ${job.state}.`,
        );
      }
      for (const dependencyId of job.spec.dependencyJobIds) {
        const dependency = snapshot.jobs[dependencyId];
        if (dependency && isTerminalState(dependency.state) && dependency.state !== "succeeded") {
          throw new RuntimeError(
            "RUNTIME_REDRIVE_DEPENDENCY_FAILED",
            `Dependency ${dependencyId} must succeed before ${jobId} is redriven.`,
          );
        }
      }
      const base = withoutExecutionFields(job);
      const redriven: RuntimeJobRecord = {
        ...base,
        state: "waiting",
        updatedAt: at,
        attemptLimit: job.attemptLimit + additionalAttempts,
        outputArtifacts: [],
        redriveCount: job.redriveCount + 1,
      };
      snapshot.jobs[jobId] = redriven;
      events.push(
        draft("job.redriven", actor, at, jobId, {
          additionalAttempts,
          attemptLimit: redriven.attemptLimit,
          redriveCount: redriven.redriveCount,
        }),
      );
      reconcileSnapshot(snapshot, actor, transitionNow, events);
      return {
        result: cloneJson(jobOrThrow(snapshot, jobId)),
        changed: true,
        events,
      };
    });
  }

  public async recoverExpiredLeases(
    actorInput = "runtime-recovery",
    now = new Date(),
  ): Promise<readonly RuntimeJobRecord[]> {
    const transitionNow = snapshotRuntimeTransitionClock(now);
    const actor = actorName(actorInput);
    const at = iso(transitionNow);
    return this.#journal.transact((snapshot) => {
      const events: RuntimeEventDraft[] = [];
      const recovered: RuntimeJobRecord[] = [];
      let changed = false;
      for (const jobId of Object.keys(snapshot.jobs).sort()) {
        const job = snapshot.jobs[jobId]!;
        if (!ACTIVE_STATES.has(job.state) || !job.lease) continue;
        const attempt = job.attempts.at(-1);
        const deadlineElapsed =
          job.spec.deadline !== undefined &&
          Date.parse(job.spec.deadline) <= transitionNow.getTime();
        const timeoutElapsed =
          attempt?.startedAt !== undefined &&
          Date.parse(attempt.startedAt) + job.spec.timeoutMs <= transitionNow.getTime();
        const leaseElapsed = Date.parse(job.lease.expiresAt) <= transitionNow.getTime();
        if (!deadlineElapsed && !timeoutElapsed && !leaseElapsed) continue;

        let updated: RuntimeJobRecord;
        if (job.cancellationRequestedAt) {
          updated = finishActiveAttempt(
            job,
            {
              classification: "cancelled",
              code: "RUNTIME_JOB_CANCELLED",
              message: "Cancellation was applied while recovering an expired execution.",
            },
            "cancelled",
            at,
          );
        } else if (job.pauseRequestedAt) {
          updated = finishActiveAttempt(
            job,
            {
              classification: "cancelled",
              code: "RUNTIME_JOB_PAUSED",
              message: "Pause was applied while recovering an expired execution.",
            },
            "paused",
            at,
          );
        } else {
          updated = applyFailure(
            job,
            deadlineElapsed
              ? {
                  classification: "deadline-exceeded",
                  code: "RUNTIME_DEADLINE_EXCEEDED",
                  message: "The execution deadline elapsed.",
                }
              : timeoutElapsed
                ? {
                    classification: "timeout",
                    code: "RUNTIME_JOB_TIMEOUT",
                    message: "The execution timeout elapsed without completion.",
                  }
                : {
                    classification: "lease-expired",
                    code: "RUNTIME_LEASE_EXPIRED",
                    message: "The worker lease expired without a heartbeat.",
                  },
            transitionNow,
          );
        }
        snapshot.jobs[jobId] = updated;
        recovered.push(cloneJson(updated));
        changed = true;
        events.push(
          draft("job.execution-recovered", actor, at, jobId, {
            previousState: job.state,
            state: updated.state,
            reason: deadlineElapsed ? "deadline" : timeoutElapsed ? "timeout" : "lease",
          }),
        );
      }
      changed = reconcileSnapshot(snapshot, actor, transitionNow, events) || changed;
      return { result: recovered, events, changed };
    });
  }

  public async cancellationRequested(jobIdInput: string): Promise<boolean> {
    const jobId = snapshotRuntimeJobId(jobIdInput);
    const snapshot = await this.#journal.snapshot();
    return snapshot.jobs[jobId]?.cancellationRequestedAt !== undefined;
  }

  public async snapshot(): Promise<RuntimeSnapshot> {
    return this.#journal.snapshot();
  }

  public async events(afterTransactionSequence = 0) {
    return this.#journal.events(afterTransactionSequence);
  }
}
