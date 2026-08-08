import type { ArtifactId } from "@evavo/art-artifacts";

import { LocalRuntimeRepository as BaseLocalRuntimeRepository } from "./local-repository.js";
import {
  RuntimeError,
  type LocalRuntimeOptions,
  type RuntimeFailureInput,
  type RuntimeHeartbeatResult,
  type RuntimeJobRecord,
  type RuntimeJobSubmission,
} from "./types.js";

const SAFE_RUNTIME_NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RUNTIME_LEASE_TOKEN = /^lease_[a-f0-9]{32}$/;
const MAX_RUNTIME_SUBMISSION_BATCH = 10_000;

type LocalRuntimeOptionsSnapshot = Readonly<{
  root: string;
  lockTimeoutMs?: number;
  staleLockMs?: number;
}>;

function invalidLocalRuntimeOptions(message: string): never {
  throw new RuntimeError("RUNTIME_OPTIONS_INVALID", message);
}

function invalidRuntimeBatchInput(message: string): never {
  throw new RuntimeError("RUNTIME_BATCH_INVALID", message);
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

function snapshotRuntimeSubmissionBatch(
  value: unknown,
): readonly RuntimeJobSubmission[] {
  let arrayLike = false;
  try {
    arrayLike = Array.isArray(value);
  } catch {
    invalidRuntimeBatchInput(
      "Runtime submission batch could not be inspected safely.",
    );
  }
  if (!arrayLike) {
    invalidRuntimeBatchInput("Runtime submission batch must be an array.");
  }

  const source = value as readonly unknown[];
  let length = 0;
  try {
    length = source.length;
  } catch {
    invalidRuntimeBatchInput(
      "Runtime submission batch length could not be read safely.",
    );
  }
  if (
    !Number.isSafeInteger(length) ||
    length < 1 ||
    length > MAX_RUNTIME_SUBMISSION_BATCH
  ) {
    invalidRuntimeBatchInput(
      "Runtime submission batch must contain 1 to 10000 jobs.",
    );
  }

  const snapshot: RuntimeJobSubmission[] = [];
  for (let index = 0; index < length; index += 1) {
    let entry: unknown;
    try {
      entry = source[index];
    } catch {
      invalidRuntimeBatchInput(
        `Runtime submission batch[${index}] could not be read safely.`,
      );
    }
    if (entry === undefined) {
      invalidRuntimeBatchInput(
        `Runtime submission batch[${index}] may not be undefined or sparse.`,
      );
    }
    snapshot.push(entry as RuntimeJobSubmission);
  }
  return Object.freeze(snapshot);
}

function snapshotRuntimeJobId(value: unknown): string {
  if (typeof value !== "string") {
    invalidRuntimeJobId(
      "Runtime job ID must contain 1 to 128 safe characters.",
    );
  }
  const jobId = value.trim();
  if (!SAFE_RUNTIME_NAME.test(jobId)) {
    invalidRuntimeJobId(
      "Runtime job ID must contain 1 to 128 safe characters.",
    );
  }
  return jobId;
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
