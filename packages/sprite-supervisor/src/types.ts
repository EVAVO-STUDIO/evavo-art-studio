import type { ArtifactId, JsonValue } from "@evavo/art-artifacts";
import type {
  RuntimeFailureClassification,
  RuntimeJobState,
  RuntimeRetryPolicy,
} from "@evavo/art-runtime";
import type { CompiledSpriteProductionPlan } from "@evavo/art-sprite-planner";

export const SPRITE_SUPERVISOR_PROTOCOL_VERSION = "2026-08-01.1" as const;

export const SPRITE_SUPERVISOR_RUN_STATUSES = [
  "pending",
  "running",
  "review-required",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type SpriteSupervisorRunStatus =
  (typeof SPRITE_SUPERVISOR_RUN_STATUSES)[number];

export const SPRITE_SUPERVISOR_TASK_STATUSES = [
  "pending",
  "waiting",
  "submitted",
  "running",
  "repairing",
  "review-required",
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
] as const;
export type SpriteSupervisorTaskStatus =
  (typeof SPRITE_SUPERVISOR_TASK_STATUSES)[number];

export type SpriteSupervisorBindingCardinality = "one" | "many";
export type SpriteSupervisorBindingSource =
  | "output-artifact-labels"
  | "runtime-result-json"
  | "failure-details";

export interface SpriteSupervisorArtifactBindingInput {
  readonly role: string;
  readonly artifactIds: readonly ArtifactId[];
}

export interface SpriteSupervisorArtifactSelectorInput {
  readonly role: string;
  readonly source: SpriteSupervisorBindingSource;
  readonly labels?: Readonly<Record<string, string>>;
  readonly pointer?: string;
  readonly cardinality?: SpriteSupervisorBindingCardinality;
  readonly required?: boolean;
}

export interface SpriteSupervisorFailurePolicyInput {
  readonly redriveClassifications?: readonly RuntimeFailureClassification[];
  readonly redriveCodePrefixes?: readonly string[];
  readonly maxRedrives?: number;
  readonly repairTaskId?: string;
  readonly maxRepairCycles?: number;
  readonly reviewCodePrefixes?: readonly string[];
  readonly abortCodePrefixes?: readonly string[];
  readonly reviewOnUnclassified?: boolean;
}

export interface SpriteSupervisorTaskInput {
  readonly id: string;
  readonly stage: string;
  readonly title: string;
  readonly queue: string;
  readonly kind: string;
  readonly payloadTemplate: JsonValue;
  readonly requiredCapabilities: readonly string[];
  readonly dependencyTaskIds?: readonly string[];
  readonly requiredArtifactRoles?: readonly string[];
  readonly staticInputArtifacts?: readonly ArtifactId[];
  readonly outputBindings?: readonly SpriteSupervisorArtifactSelectorInput[];
  readonly triggeredByFailureOfTaskId?: string;
  readonly required?: boolean;
  readonly priority?: number;
  readonly maximumAttempts?: number;
  readonly retryPolicy?: RuntimeRetryPolicy;
  readonly leaseDurationMs?: number;
  readonly timeoutMs?: number;
  readonly failurePolicy?: SpriteSupervisorFailurePolicyInput;
}

export interface SpriteSupervisorReviewResolutionInput {
  readonly taskId: string;
  readonly action: "retry" | "skip" | "abort" | "approve-release";
  readonly approver: string;
  readonly reason: string;
  readonly artifactBindings?: readonly SpriteSupervisorArtifactBindingInput[];
}

export interface SpriteSupervisorPolicyInput {
  readonly tickDelayMs?: number;
  readonly maximumTicks?: number;
  readonly maximumActiveChildren?: number;
  readonly defaultMaximumRedrives?: number;
  readonly defaultMaximumRepairCycles?: number;
  readonly cancelChildrenOnAbort?: boolean;
  readonly reviewOnUnclassifiedFailure?: boolean;
  readonly requireAllPlanStagesCovered?: boolean;
  readonly requireFinalHumanApproval?: boolean;
  readonly requiredReleaseArtifactRoles?: readonly string[];
}

export interface SpriteSupervisorCompileRequestInput {
  readonly schemaVersion: "1.0";
  readonly runId: string;
  readonly spritePlan: CompiledSpriteProductionPlan | unknown;
  readonly initialArtifactBindings?: readonly SpriteSupervisorArtifactBindingInput[];
  readonly tasks: readonly SpriteSupervisorTaskInput[];
  readonly policy?: SpriteSupervisorPolicyInput;
  readonly reviewResolutions?: readonly SpriteSupervisorReviewResolutionInput[];
  readonly metadata?: JsonValue;
}

export interface NormalizedSpriteSupervisorArtifactSelector {
  readonly role: string;
  readonly source: SpriteSupervisorBindingSource;
  readonly labels: Readonly<Record<string, string>>;
  readonly pointer: string;
  readonly cardinality: SpriteSupervisorBindingCardinality;
  readonly required: boolean;
}

export interface NormalizedSpriteSupervisorFailurePolicy {
  readonly redriveClassifications: readonly RuntimeFailureClassification[];
  readonly redriveCodePrefixes: readonly string[];
  readonly maxRedrives: number;
  readonly repairTaskId?: string;
  readonly maxRepairCycles: number;
  readonly reviewCodePrefixes: readonly string[];
  readonly abortCodePrefixes: readonly string[];
  readonly reviewOnUnclassified: boolean;
}

export interface NormalizedSpriteSupervisorTask {
  readonly id: string;
  readonly stage: string;
  readonly title: string;
  readonly queue: string;
  readonly kind: string;
  readonly payloadTemplate: JsonValue;
  readonly requiredCapabilities: readonly string[];
  readonly dependencyTaskIds: readonly string[];
  readonly requiredArtifactRoles: readonly string[];
  readonly staticInputArtifacts: readonly ArtifactId[];
  readonly outputBindings: readonly NormalizedSpriteSupervisorArtifactSelector[];
  readonly triggeredByFailureOfTaskId?: string;
  readonly required: boolean;
  readonly priority: number;
  readonly maximumAttempts: number;
  readonly retryPolicy: Readonly<{
    readonly baseDelayMs: number;
    readonly maximumDelayMs: number;
    readonly multiplier: number;
    readonly jitterFraction: number;
  }>;
  readonly leaseDurationMs: number;
  readonly timeoutMs: number;
  readonly failurePolicy: NormalizedSpriteSupervisorFailurePolicy;
}

export interface NormalizedSpriteSupervisorReviewResolution {
  readonly taskId: string;
  readonly action: "retry" | "skip" | "abort" | "approve-release";
  readonly approver: string;
  readonly reason: string;
  readonly artifactBindings: readonly SpriteSupervisorArtifactBindingInput[];
}

export interface NormalizedSpriteSupervisorCompileRequest {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof SPRITE_SUPERVISOR_PROTOCOL_VERSION;
  readonly runId: string;
  readonly spritePlan: CompiledSpriteProductionPlan;
  readonly initialArtifactBindings: readonly SpriteSupervisorArtifactBindingInput[];
  readonly tasks: readonly NormalizedSpriteSupervisorTask[];
  readonly policy: Readonly<{
    readonly tickDelayMs: number;
    readonly maximumTicks: number;
    readonly maximumActiveChildren: number;
    readonly defaultMaximumRedrives: number;
    readonly defaultMaximumRepairCycles: number;
    readonly cancelChildrenOnAbort: boolean;
    readonly reviewOnUnclassifiedFailure: boolean;
    readonly requireAllPlanStagesCovered: boolean;
    readonly requireFinalHumanApproval: boolean;
    readonly requiredReleaseArtifactRoles: readonly string[];
  }>;
  readonly reviewResolutions: readonly NormalizedSpriteSupervisorReviewResolution[];
  readonly metadata?: JsonValue;
}

export interface CompiledSpriteSupervisorWorkflow {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof SPRITE_SUPERVISOR_PROTOCOL_VERSION;
  readonly runId: string;
  readonly requestSha256: string;
  readonly workflowSha256: string;
  readonly request: NormalizedSpriteSupervisorCompileRequest;
  readonly rootJob: Readonly<{
    readonly queue: "control";
    readonly kind: "art.sprite-production.supervise";
    readonly idempotencyKey: string;
    readonly payload: JsonValue;
    readonly inputArtifacts: readonly ArtifactId[];
    readonly requiredCapabilities: readonly [
      "sprite.supervisor.run",
      "runtime.jobs",
      "artifacts.store",
      "evidence.bundle",
    ];
    readonly maximumAttempts: number;
    readonly leaseDurationMs: number;
    readonly timeoutMs: number;
    readonly labels: Readonly<{
      readonly runId: string;
      readonly spritePlanId: string;
      readonly workflowSha256: string;
      readonly supervisorTick: "0";
    }>;
  }>;
}

export interface SpriteSupervisorTaskAttempt {
  readonly cycle: number;
  readonly childJobId: string;
  readonly childState: RuntimeJobState;
  readonly submittedAt: string;
  readonly completedAt?: string;
  readonly outputArtifactIds: readonly ArtifactId[];
  readonly failure?: Readonly<{
    readonly classification: RuntimeFailureClassification;
    readonly code: string;
    readonly message: string;
    readonly details?: JsonValue;
  }>;
}

export interface SpriteSupervisorTaskState {
  readonly taskId: string;
  readonly status: SpriteSupervisorTaskStatus;
  readonly cycle: number;
  readonly redrives: number;
  readonly repairCycles: number;
  readonly currentChildJobId?: string;
  readonly attempts: readonly SpriteSupervisorTaskAttempt[];
  readonly outputArtifactIds: readonly ArtifactId[];
  readonly lastFailure?: Readonly<{
    readonly classification: RuntimeFailureClassification;
    readonly code: string;
    readonly message: string;
    readonly details?: JsonValue;
  }>;
  readonly reviewReason?: string;
}

export interface SpriteSupervisorDecision {
  readonly at: string;
  readonly tick: number;
  readonly taskId?: string;
  readonly action:
    | "initialise"
    | "submit"
    | "observe"
    | "bind-artifacts"
    | "redrive"
    | "route-repair"
    | "retry-after-repair"
    | "require-review"
    | "apply-review"
    | "skip"
    | "abort"
    | "cancel-children"
    | "complete";
  readonly reason: string;
  readonly data?: JsonValue;
}

export interface SpriteSupervisorState {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof SPRITE_SUPERVISOR_PROTOCOL_VERSION;
  readonly runId: string;
  readonly workflowSha256: string;
  readonly spritePlanId: string;
  readonly spritePlanSha256: string;
  readonly status: SpriteSupervisorRunStatus;
  readonly tick: number;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly releaseApprovedBy?: Readonly<{
    readonly approver: string;
    readonly reason: string;
    readonly at: string;
  }>;
  readonly taskStates: Readonly<Record<string, SpriteSupervisorTaskState>>;
  readonly artifactBindings: Readonly<Record<string, readonly ArtifactId[]>>;
  readonly decisions: readonly SpriteSupervisorDecision[];
  readonly releaseEvidenceArtifactId?: ArtifactId;
  readonly metadata?: JsonValue;
}

export type SpriteSupervisorFailureAction =
  | Readonly<{ action: "redrive"; reason: string }>
  | Readonly<{ action: "repair"; repairTaskId: string; reason: string }>
  | Readonly<{ action: "review"; reason: string }>
  | Readonly<{ action: "abort"; reason: string }>;

export class SpriteSupervisorError extends Error {
  public readonly code: string;
  public readonly details?: JsonValue;

  public constructor(code: string, message: string, details?: JsonValue) {
    super(message);
    this.name = "SpriteSupervisorError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
