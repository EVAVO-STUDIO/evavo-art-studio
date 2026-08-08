import type { ArtifactId } from "@evavo/art-artifacts";

import { LocalRuntimeRepository as BaseLocalRuntimeRepository } from "./local-repository.js";
import {
  RuntimeError,
  type LocalRuntimeOptions,
  type RuntimeFailureInput,
  type RuntimeHeartbeatResult,
  type RuntimeJobRecord,
  type RuntimeJobState,
  type RuntimeJobSubmission,
  type RuntimeQuery,
} from "./types.js";

const SAFE_RUNTIME_NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RUNTIME_LEASE_TOKEN = /^lease_[a-f0-9]{32}$/;
const MAX_RUNTIME_SUBMISSION_BATCH = 10_000;
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

type LocalRuntimeOptionsSnapshot = Readonly<{
  root: string;
  lockTimeoutMs?: number;
  staleLockMs?: number;
}>;

type RuntimeQuerySnapshot = Readonly<{
  states?: readonly RuntimeJobState[];
  queues?: readonly string[];
  kinds?: readonly string[];
  limit: number;
}>;

function invalidLocalRuntimeOptions(message: string): never {
  throw new RuntimeError("RUNTIME_OPTIONS_INVALID", message);
}

function invalidRuntimeBatchInput(message: string): never {
  throw new RuntimeError("RUNTIME_BATCH_INVALID", message);
}

function invalidRuntimeQueryInput(message: string): never {
  throw new RuntimeError("RUNTIME_QUERY_INVALID", message);
}

function invalidRuntimeJobId(message: string): never {
  throw new RuntimeError("RUNTIME_JOB_ID_INVALID", message);
}

function invalidRuntimeActor(message: string): never {
  throw new RuntimeError("RUNTIME_ACTOR_INVALID", message);
}

function invalidRuntimeLeaseToken(message: string): never {
  throw new RuntimeError("RUNTIME_LEASE_TOKEN_INVALID", message);
}

function snapshotOptionalRuntimeDuration(
  value: unknown,
  name: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    invalidLocalRuntimeOptions(
      `${name} must be a non-negative safe integer.`,
    );
  }
  return value;
}

function snapshotLocalRuntimeOptions(
  value: unknown,
): LocalRuntimeOptionsSnapshot {
  let recordLike = false;
  try {
    recordLike =
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value);
  } catch {
    invalidLocalRuntimeOptions(
      "Local runtime options could not be inspected safely.",
    );
  }
  if (!recordLike) {
    invalidLocalRuntimeOptions("Local runtime options must be an object.");
  }

  const source = value as Readonly<Record<string, unknown>>;
  let rootInput: unknown;
  let lockTimeoutInput: unknown;
  let staleLockInput: unknown;
  try {
    rootInput = source.root;
    lockTimeoutInput = source.lockTimeoutMs;
    staleLockInput = source.staleLockMs;
  } catch {
    invalidLocalRuntimeOptions(
      "Local runtime option fields could not be read safely.",
    );
  }

  if (
    typeof rootInput !== "string" ||
    rootInput.length > 32_768 ||
    rootInput.includes("\0")
  ) {
    invalidLocalRuntimeOptions(
      "Local runtime root must be a valid filesystem path string.",
    );
  }
  const lockTimeoutMs = snapshotOptionalRuntimeDuration(
    lockTimeoutInput,
    "lockTimeoutMs",
  );
  const staleLockMs = snapshotOptionalRuntimeDuration(
    staleLockInput,
    "staleLockMs",
  );
  return Object.freeze({
    root: rootInput,
    ...(lockTimeoutMs === undefined ? {} : { lockTimeoutMs }),
    ...(staleLockMs === undefined ? {} : { staleLockMs }),
  });
}

function snapshotIndexedArray(
  value: unknown,
  name: string,
  maximum: number,
  invalid: (message: string) => never,
): readonly unknown[] {
  let arrayLike = false;
  try {
    arrayLike = Array.isArray(value);
  } catch {
    invalid(`${name} could not be inspected safely.`);
  }
  if (!arrayLike) invalid(`${name} must be an array.`);

  const source = value as readonly unknown[];
  let length = 0;
  try {
    length = source.length;
  } catch {
    invalid(`${name}.length could not be read safely.`);
  }
  if (!Number.isSafeInteger(length) || length < 0 || length > maximum) {
    invalid(`${name} must contain no more than ${maximum} entries.`);
  }

  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    try {
      snapshot.push(source[index]);
    } catch {
      invalid(`${name}[${index}] could not be read safely.`);
    }
  }
  return Object.freeze(snapshot);
}

function snapshotRuntimeSubmissionBatch(
  value: unknown,
): readonly RuntimeJobSubmission[] {
  const snapshot = snapshotIndexedArray(
    value,
    "Runtime submission batch",
    MAX_RUNTIME_SUBMISSION_BATCH,
    invalidRuntimeBatchInput,
  );
  if (snapshot.length === 0) {
    invalidRuntimeBatchInput(
      "Runtime submission batch must contain 1 to 10000 jobs.",
    );
  }
  return snapshot as readonly RuntimeJobSubmission[];
}

function snapshotCanonicalRuntimeName(
  value: unknown,
  name: string,
  invalid: (message: string) => never,
): string {
  if (typeof value !== "string") {
    invalid(`${name} must be a string containing 1 to 128 safe characters.`);
  }
  const trimmed = value.trim();
  if (trimmed !== value || !SAFE_RUNTIME_NAME.test(value)) {
    invalid(`${name} must be a canonical runtime name.`);
  }
  return value;
}

function snapshotRuntimeQueryNames(
  value: unknown,
  name: "queues" | "kinds",
): readonly string[] | undefined {
  if (value === undefined) return undefined;
  const snapshot = snapshotIndexedArray(
    value,
    `Runtime query ${name}`,
    MAX_RUNTIME_QUERY_FILTERS,
    invalidRuntimeQueryInput,
  );
  const result: string[] = [];
  for (let index = 0; index < snapshot.length; index += 1) {
    result.push(
      snapshotCanonicalRuntimeName(
        snapshot[index],
        `Runtime query ${name}[${index}]`,
        invalidRuntimeQueryInput,
      ),
    );
  }
  return Object.freeze([...new Set(result)].sort());
}

function snapshotRuntimeQueryStates(
  value: unknown,
): readonly RuntimeJobState[] | undefined {
  if (value === undefined) return undefined;
  const snapshot = snapshotIndexedArray(
    value,
    "Runtime query states",
    MAX_RUNTIME_QUERY_FILTERS,
    invalidRuntimeQueryInput,
  );
  const result: RuntimeJobState[] = [];
  for (let index = 0; index < snapshot.length; index += 1) {
    const state = snapshot[index];
    if (
      typeof state !== "string" ||
      !RUNTIME_JOB_STATES.has(state as RuntimeJobState)
    ) {
      invalidRuntimeQueryInput(
        `Runtime query states[${index}] is not a supported job state.`,
      );
    }
    result.push(state as RuntimeJobState);
  }
  return Object.freeze([...new Set(result)].sort());
}

function snapshotRuntimeQuery(value: unknown): RuntimeQuerySnapshot {
  let recordLike = false;
  try {
    recordLike =
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value);
  } catch {
    invalidRuntimeQueryInput("Runtime query could not be inspected safely.");
  }
  if (!recordLike) invalidRuntimeQueryInput("Runtime query must be an object.");

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
    invalidRuntimeQueryInput("Runtime query fields could not be read safely.");
  }

  const limit = limitInput === undefined ? 1_000 : limitInput;
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100_000
  ) {
    invalidRuntimeQueryInput("Runtime query limit must be 1 to 100000.");
  }

  const states = snapshotRuntimeQueryStates(statesInput);
  const queues = snapshotRuntimeQueryNames(queuesInput, "queues");
  const kinds = snapshotRuntimeQueryNames(kindsInput, "kinds");
  return Object.freeze({
    ...(states === undefined ? {} : { states }),
    ...(queues === undefined ? {} : { queues }),
    ...(kinds === undefined ? {} : { kinds }),
    limit,
  });
}

function snapshotRuntimeJobId(value: unknown): string {
  return snapshotCanonicalRuntimeName(
    value,
    "Runtime job ID",
    invalidRuntimeJobId,
  );
}

function snapshotRuntimeActor(value: unknown): string {
  if (typeof value !== "string") {
    invalidRuntimeActor("Runtime actor must contain 1 to 256 characters.");
  }
  const actor = value.trim();
  if (!actor || actor.length > 256 || actor.includes("\0")) {
    invalidRuntimeActor("Runtime actor must contain 1 to 256 characters.");
  }
  return actor;
}

function snapshotRuntimeLeaseToken(value: unknown): string {
  if (typeof value !== "string" || !RUNTIME_LEASE_TOKEN.test(value)) {
    invalidRuntimeLeaseToken("Runtime lease token is invalid.");
  }
  return value;
}

export class LocalRuntimeRepository extends BaseLocalRuntimeRepository {
  public constructor(options: LocalRuntimeOptions) {
    super(snapshotLocalRuntimeOptions(options));
  }

  public override async submitBatch(
    submissions: readonly RuntimeJobSubmission[],
    actorInput = "system",
    now = new Date(),
  ): Promise<readonly RuntimeJobRecord[]> {
    const batch = snapshotRuntimeSubmissionBatch(submissions);
    const actor = snapshotRuntimeActor(actorInput);
    return super.submitBatch(batch, actor, now);
  }

  public override async get(jobId: string): Promise<RuntimeJobRecord | null> {
    return super.get(snapshotRuntimeJobId(jobId));
  }

  public override async list(
    query: RuntimeQuery = {},
  ): Promise<readonly RuntimeJobRecord[]> {
    return super.list(snapshotRuntimeQuery(query));
  }

  public override async start(
    jobId: string,
    leaseToken: string,
    actorInput: string,
    now = new Date(),
  ): Promise<RuntimeJobRecord> {
    const job = snapshotRuntimeJobId(jobId);
    const lease = snapshotRuntimeLeaseToken(leaseToken);
    const actor = snapshotRuntimeActor(actorInput);
    return super.start(job, lease, actor, now);
  }

  public override async heartbeat(
    jobId: string,
    leaseToken: string,
    actorInput: string,
    now = new Date(),
  ): Promise<RuntimeHeartbeatResult> {
    const job = snapshotRuntimeJobId(jobId);
    const lease = snapshotRuntimeLeaseToken(leaseToken);
    const actor = snapshotRuntimeActor(actorInput);
    return super.heartbeat(job, lease, actor, now);
  }

  public override async complete(
    jobId: string,
    leaseToken: string,
    outputArtifacts: readonly ArtifactId[],
    actorInput: string,
    now = new Date(),
  ): Promise<RuntimeJobRecord> {
    const job = snapshotRuntimeJobId(jobId);
    const lease = snapshotRuntimeLeaseToken(leaseToken);
    const actor = snapshotRuntimeActor(actorInput);
    return super.complete(job, lease, outputArtifacts, actor, now);
  }

  public override async fail(
    jobId: string,
    leaseToken: string,
    failure: RuntimeFailureInput,
    actorInput: string,
    now = new Date(),
  ): Promise<RuntimeJobRecord> {
    const job = snapshotRuntimeJobId(jobId);
    const lease = snapshotRuntimeLeaseToken(leaseToken);
    const actor = snapshotRuntimeActor(actorInput);
    return super.fail(job, lease, failure, actor, now);
  }

  public override async cancel(
    jobId: string,
    actorInput: string,
    options: Readonly<{ force?: boolean; now?: Date }> = {},
  ): Promise<RuntimeJobRecord> {
    const job = snapshotRuntimeJobId(jobId);
    const actor = snapshotRuntimeActor(actorInput);
    return super.cancel(job, actor, options);
  }

  public override async pause(
    jobId: string,
    actorInput: string,
    options: Readonly<{ force?: boolean; now?: Date }> = {},
  ): Promise<RuntimeJobRecord> {
    const job = snapshotRuntimeJobId(jobId);
    const actor = snapshotRuntimeActor(actorInput);
    return super.pause(job, actor, options);
  }

  public override async resume(
    jobId: string,
    actorInput: string,
    now = new Date(),
  ): Promise<RuntimeJobRecord> {
    const job = snapshotRuntimeJobId(jobId);
    const actor = snapshotRuntimeActor(actorInput);
    return super.resume(job, actor, now);
  }

  public override async redrive(
    jobId: string,
    additionalAttempts: number,
    actorInput: string,
    now = new Date(),
  ): Promise<RuntimeJobRecord> {
    const job = snapshotRuntimeJobId(jobId);
    const actor = snapshotRuntimeActor(actorInput);
    return super.redrive(job, additionalAttempts, actor, now);
  }

  public override async recoverExpiredLeases(
    actorInput = "runtime-recovery",
    now = new Date(),
  ): Promise<readonly RuntimeJobRecord[]> {
    return super.recoverExpiredLeases(snapshotRuntimeActor(actorInput), now);
  }
}
