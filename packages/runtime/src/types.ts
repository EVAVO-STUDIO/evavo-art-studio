import type {
  ArtifactDescriptorInput,
  ArtifactId,
  ArtifactStore,
  JsonValue,
  StoredArtifact,
} from "@evavo/art-artifacts";

export const RUNTIME_PROTOCOL_VERSION = "2026-07-29.1" as const;

export type RuntimeJobState =
  | "waiting"
  | "queued"
  | "leased"
  | "running"
  | "retry-wait"
  | "paused"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "blocked"
  | "dead-letter";

export type RuntimeFailureClassification =
  | "transient"
  | "permanent"
  | "cancelled"
  | "lease-expired"
  | "deadline-exceeded"
  | "dependency-failed"
  | "timeout";

export interface RuntimeRetryPolicy {
  readonly baseDelayMs?: number;
  readonly maximumDelayMs?: number;
  readonly multiplier?: number;
  readonly jitterFraction?: number;
}

export interface RuntimeJobSubmission {
  readonly id?: string;
  readonly queue: string;
  readonly kind: string;
  readonly idempotencyKey: string;
  readonly payload: JsonValue;
  readonly requiredCapabilities?: readonly string[];
  readonly dependencyJobIds?: readonly string[];
  readonly inputArtifacts?: readonly ArtifactId[];
  readonly priority?: number;
  readonly maximumAttempts?: number;
  readonly retryPolicy?: RuntimeRetryPolicy;
  readonly leaseDurationMs?: number;
  readonly timeoutMs?: number;
  readonly notBefore?: string;
  readonly deadline?: string;
  readonly labels?: Readonly<Record<string, string>>;
}

export interface NormalizedRuntimeJobSpec {
  readonly schemaVersion: "1.0";
  readonly id: string;
  readonly queue: string;
  readonly kind: string;
  readonly idempotencyKey: string;
  readonly payload: JsonValue;
  readonly requiredCapabilities: readonly string[];
  readonly dependencyJobIds: readonly string[];
  readonly inputArtifacts: readonly ArtifactId[];
  readonly priority: number;
  readonly maximumAttempts: number;
  readonly retryPolicy: Readonly<{
    baseDelayMs: number;
    maximumDelayMs: number;
    multiplier: number;
    jitterFraction: number;
  }>;
  readonly leaseDurationMs: number;
  readonly timeoutMs: number;
  readonly notBefore?: string;
  readonly deadline?: string;
  readonly labels: Readonly<Record<string, string>>;
}

export interface RuntimeLease {
  readonly workerId: string;
  readonly token: string;
  readonly leasedAt: string;
  readonly expiresAt: string;
}

export interface RuntimeFailure {
  readonly classification: RuntimeFailureClassification;
  readonly code: string;
  readonly message: string;
  readonly details?: JsonValue;
}

export interface RuntimeAttemptRecord {
  readonly attempt: number;
  readonly workerId: string;
  readonly leaseToken: string;
  readonly leasedAt: string;
  readonly startedAt?: string;
  readonly lastHeartbeatAt?: string;
  readonly heartbeatCount: number;
  readonly finishedAt?: string;
  readonly outcome?: "succeeded" | "failed" | "cancelled" | "expired";
  readonly failure?: RuntimeFailure;
  readonly outputArtifacts: readonly ArtifactId[];
}

export interface RuntimeJobRecord {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  readonly id: string;
  readonly specHash: string;
  readonly spec: NormalizedRuntimeJobSpec;
  readonly state: RuntimeJobState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attemptLimit: number;
  readonly attempts: readonly RuntimeAttemptRecord[];
  readonly lease?: RuntimeLease;
  readonly nextAttemptAt?: string;
  readonly cancellationRequestedAt?: string;
  readonly pauseRequestedAt?: string;
  readonly finishedAt?: string;
  readonly outputArtifacts: readonly ArtifactId[];
  readonly failure?: RuntimeFailure;
  readonly redriveCount: number;
}

export interface RuntimeWorkerDescriptor {
  readonly id: string;
  readonly capabilities: readonly string[];
  readonly queues?: readonly string[];
}

export interface RuntimeClaimRequest {
  readonly worker: RuntimeWorkerDescriptor;
  readonly maximumJobs?: number;
  readonly now?: Date;
}

export interface RuntimeClaimedJob {
  readonly job: RuntimeJobRecord;
  readonly lease: RuntimeLease;
  readonly cancellationRequested: boolean;
}

export interface RuntimeFailureInput {
  readonly classification: RuntimeFailureClassification;
  readonly code: string;
  readonly message: string;
  readonly details?: JsonValue;
}

export interface RuntimeEvent {
  readonly schemaVersion: "1.0";
  readonly id: string;
  readonly transactionSequence: number;
  readonly eventIndex: number;
  readonly type: string;
  readonly at: string;
  readonly actor: string;
  readonly jobId?: string;
  readonly data: JsonValue;
}

export interface RuntimeSnapshot {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  readonly sequence: number;
  readonly jobs: Readonly<Record<string, RuntimeJobRecord>>;
  readonly idempotencyIndex: Readonly<Record<string, string>>;
}

export interface RuntimeTransactionRecord {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof RUNTIME_PROTOCOL_VERSION;
  readonly sequence: number;
  readonly previousSequence: number;
  readonly stateSha256: string;
  readonly snapshot: RuntimeSnapshot;
  readonly events: readonly RuntimeEvent[];
}

export interface LocalRuntimeOptions {
  readonly root: string;
  readonly lockTimeoutMs?: number;
  readonly staleLockMs?: number;
}

export interface RuntimeQuery {
  readonly states?: readonly RuntimeJobState[];
  readonly queues?: readonly string[];
  readonly kinds?: readonly string[];
  readonly limit?: number;
}

export interface RuntimeHeartbeatResult {
  readonly job: RuntimeJobRecord;
  readonly cancellationRequested: boolean;
  readonly pauseRequested: boolean;
}

export interface RuntimeRepository {
  submit(
    submission: RuntimeJobSubmission,
    actor?: string,
    now?: Date,
  ): Promise<RuntimeJobRecord>;
  submitBatch(
    submissions: readonly RuntimeJobSubmission[],
    actor?: string,
    now?: Date,
  ): Promise<readonly RuntimeJobRecord[]>;
  get(jobId: string): Promise<RuntimeJobRecord | null>;
  list(query?: RuntimeQuery): Promise<readonly RuntimeJobRecord[]>;
  claim(request: RuntimeClaimRequest): Promise<readonly RuntimeClaimedJob[]>;
  start(
    jobId: string,
    leaseToken: string,
    actor: string,
    now?: Date,
  ): Promise<RuntimeJobRecord>;
  heartbeat(
    jobId: string,
    leaseToken: string,
    actor: string,
    now?: Date,
  ): Promise<RuntimeHeartbeatResult>;
  complete(
    jobId: string,
    leaseToken: string,
    outputArtifacts: readonly ArtifactId[],
    actor: string,
    now?: Date,
  ): Promise<RuntimeJobRecord>;
  fail(
    jobId: string,
    leaseToken: string,
    failure: RuntimeFailureInput,
    actor: string,
    now?: Date,
  ): Promise<RuntimeJobRecord>;
  cancel(
    jobId: string,
    actor: string,
    options?: Readonly<{ force?: boolean; now?: Date }>,
  ): Promise<RuntimeJobRecord>;
  pause(
    jobId: string,
    actor: string,
    options?: Readonly<{ force?: boolean; now?: Date }>,
  ): Promise<RuntimeJobRecord>;
  resume(jobId: string, actor: string, now?: Date): Promise<RuntimeJobRecord>;
  redrive(
    jobId: string,
    additionalAttempts: number,
    actor: string,
    now?: Date,
  ): Promise<RuntimeJobRecord>;
  recoverExpiredLeases(actor?: string, now?: Date): Promise<readonly RuntimeJobRecord[]>;
  cancellationRequested(jobId: string): Promise<boolean>;
  snapshot(): Promise<RuntimeSnapshot>;
  events(afterTransactionSequence?: number): Promise<readonly RuntimeEvent[]>;
}

export interface RuntimeHandlerContext {
  readonly job: RuntimeJobRecord;
  readonly signal: AbortSignal;
  readonly artifacts: ArtifactStore;
  heartbeat(): Promise<RuntimeHeartbeatResult>;
  cancellationRequested(): Promise<boolean>;
  putArtifact(
    content: Uint8Array | string,
    descriptor: ArtifactDescriptorInput,
  ): Promise<StoredArtifact>;
}

export type RuntimeHandlerResult = Readonly<{
  outputArtifacts?: readonly ArtifactId[];
  result?: JsonValue;
}>;

export type RuntimeJobHandler = (
  context: RuntimeHandlerContext,
) => Promise<RuntimeHandlerResult | void>;

export interface RuntimeWorkerOptions {
  readonly runtime: RuntimeRepository;
  readonly artifacts: ArtifactStore;
  readonly worker: RuntimeWorkerDescriptor;
  readonly handlers: Readonly<Record<string, RuntimeJobHandler>>;
  readonly concurrency?: number;
  readonly heartbeatIntervalMs?: number;
}

export interface RuntimeWorkerRunResult {
  readonly claimed: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly cancelled: number;
}

export class RuntimeError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
  }
}

export class TransientRuntimeError extends RuntimeError {
  public readonly details?: JsonValue;

  public constructor(code: string, message: string, details?: JsonValue) {
    super(code, message);
    this.name = "TransientRuntimeError";
    this.details = details;
  }
}

export class PermanentRuntimeError extends RuntimeError {
  public readonly details?: JsonValue;

  public constructor(code: string, message: string, details?: JsonValue) {
    super(code, message);
    this.name = "PermanentRuntimeError";
    this.details = details;
  }
}

export class CancelledRuntimeError extends RuntimeError {
  public constructor(message = "Job execution was cancelled.") {
    super("RUNTIME_JOB_CANCELLED", message);
    this.name = "CancelledRuntimeError";
  }
}
