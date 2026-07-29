export const OPERATOR_RUNTIME_STATES = [
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
] as const;

export type OperatorRuntimeState = (typeof OPERATOR_RUNTIME_STATES)[number];

export interface OperatorRuntimeFailure {
  readonly classification: string;
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface OperatorRuntimeAttempt {
  readonly attempt: number;
  readonly workerId: string;
  readonly leasedAt: string;
  readonly startedAt?: string;
  readonly lastHeartbeatAt?: string;
  readonly heartbeatCount: number;
  readonly finishedAt?: string;
  readonly outcome?: "succeeded" | "failed" | "cancelled" | "expired";
  readonly failure?: OperatorRuntimeFailure;
  readonly outputArtifacts: readonly string[];
}

export interface OperatorRuntimeLease {
  readonly workerId: string;
  readonly leasedAt: string;
  readonly expiresAt: string;
}

export interface OperatorRuntimeSpec {
  readonly id: string;
  readonly queue: string;
  readonly kind: string;
  readonly idempotencyKey: string;
  readonly payload: unknown;
  readonly requiredCapabilities: readonly string[];
  readonly dependencyJobIds: readonly string[];
  readonly inputArtifacts: readonly string[];
  readonly priority: number;
  readonly maximumAttempts: number;
  readonly leaseDurationMs: number;
  readonly timeoutMs: number;
  readonly notBefore?: string;
  readonly deadline?: string;
  readonly labels: Readonly<Record<string, string>>;
}

export interface OperatorRuntimeJob {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: string;
  readonly id: string;
  readonly specHash: string;
  readonly spec: OperatorRuntimeSpec;
  readonly state: OperatorRuntimeState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly attemptLimit: number;
  readonly attempts: readonly OperatorRuntimeAttempt[];
  readonly lease?: OperatorRuntimeLease;
  readonly nextAttemptAt?: string;
  readonly cancellationRequestedAt?: string;
  readonly pauseRequestedAt?: string;
  readonly pausedFromState?: string;
  readonly finishedAt?: string;
  readonly outputArtifacts: readonly string[];
  readonly failure?: OperatorRuntimeFailure;
  readonly redriveCount: number;
}

export interface OperatorRuntimeEvent {
  readonly schemaVersion: "1.0";
  readonly id: string;
  readonly transactionSequence: number;
  readonly eventIndex: number;
  readonly type: string;
  readonly at: string;
  readonly actor: string;
  readonly jobId?: string;
  readonly data: unknown;
}

export interface OperatorSessionStatus {
  readonly configured: boolean;
  readonly apiConfigured: boolean;
  readonly authenticated: boolean;
  readonly expiresAt?: string;
  readonly sessionId?: string;
}

export interface OperatorJobsResponse {
  readonly schemaVersion: "1.0";
  readonly jobs: readonly OperatorRuntimeJob[];
}

export interface OperatorEventsResponse {
  readonly schemaVersion: "1.0";
  readonly events: readonly OperatorRuntimeEvent[];
}

export interface OperatorArtifactDescriptor {
  readonly schemaVersion: string;
  readonly artifactId: string;
  readonly contentSha256: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly storageClass: string;
  readonly fileName?: string;
  readonly sourceArtifacts: readonly string[];
  readonly labels: Readonly<Record<string, string>>;
  readonly metadata: unknown;
  readonly createdAt: string;
  readonly descriptorSha256: string;
}

export interface OperatorArtifactVerification {
  readonly artifactId: string;
  readonly descriptorValid: boolean;
  readonly contentValid: boolean;
  readonly descriptorSha256: string;
  readonly contentSha256: string;
}

export type OperatorJobAction = "cancel" | "pause" | "resume" | "redrive";

export const ACTIVE_RUNTIME_STATES = new Set<OperatorRuntimeState>([
  "leased",
  "running",
]);

export const TERMINAL_RUNTIME_STATES = new Set<OperatorRuntimeState>([
  "succeeded",
  "failed",
  "cancelled",
  "blocked",
  "dead-letter",
]);
