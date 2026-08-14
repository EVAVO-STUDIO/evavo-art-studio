import type {
  CompiledLayeredProductionUnit,
  LayeredProductionAlphaPolicy,
} from "./layered-production-types.js";
import type {
  ArtProductionAttemptDecision,
  ArtProductionBlockingDetection,
  ArtProductionMetricId,
  ArtProductionUnitStatus,
} from "./art-production-contract.js";
import {
  ART_PRODUCTION_ATTEMPT_KIND,
  ART_PRODUCTION_BATCH_KIND,
  ART_PRODUCTION_LOOP_KIND,
  ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
} from "./art-production-contract.js";
import type {
  ArtProductionCandidateAdmissionReceipt,
  ArtProductionCandidateEvidence,
} from "./art-production-candidate-admission-types.js";
import type { CompiledArtProductionProfile } from "./art-production-profile-types.js";

export interface ArtProductionMetricEvidence {
  readonly metricId: ArtProductionMetricId;
  readonly score: number;
  readonly evidenceSha256: string;
  readonly note?: string;
}

export interface ArtProductionDetectionEvidence {
  readonly detection: ArtProductionBlockingDetection;
  readonly evidenceSha256: string;
  readonly note?: string;
}

export interface ArtProductionAttemptInput {
  readonly schemaVersion: "1.0";
  readonly kind: typeof ART_PRODUCTION_ATTEMPT_KIND;
  readonly loopSha256: string;
  readonly unitId: string;
  readonly evaluator: string;
  readonly evaluatedAt: string;
  readonly candidateAdmissionReceipt: ArtProductionCandidateAdmissionReceipt;
  readonly metrics: readonly ArtProductionMetricEvidence[];
  readonly detections: readonly ArtProductionDetectionEvidence[];
}

export interface ArtProductionAttemptRecord {
  readonly schemaVersion: "1.0";
  readonly kind: typeof ART_PRODUCTION_ATTEMPT_KIND;
  readonly protocolVersion: typeof ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION;
  readonly priorLoopSha256: string;
  readonly attemptNumber: number;
  readonly unitId: string;
  readonly evaluator: string;
  readonly evaluatedAt: string;
  readonly candidateAdmissionReceipt: ArtProductionCandidateAdmissionReceipt;
  readonly candidate: ArtProductionCandidateEvidence;
  readonly metrics: readonly ArtProductionMetricEvidence[];
  readonly requiredMetricIds: readonly ArtProductionMetricId[];
  readonly detections: readonly ArtProductionDetectionEvidence[];
  readonly weightedScore: number;
  readonly failedMetricIds: readonly ArtProductionMetricId[];
  readonly decision: ArtProductionAttemptDecision;
  readonly repairDirectives: readonly string[];
  readonly retryPrompt?: string;
  readonly authority: Readonly<{
    readonly providerExecution: false;
    readonly candidateAdmission: false;
    readonly creativeApproval: false;
    readonly imageMutation: false;
    readonly targetRepositoryMutation: false;
    readonly gitCommit: false;
    readonly gitPush: false;
    readonly publication: false;
  }>;
  readonly attemptSha256: string;
}

export interface ArtProductionAcceptedCandidate
  extends ArtProductionCandidateEvidence {
  readonly admissionReceiptSha256: string;
  readonly scheduledBatchSha256: string;
  readonly scheduledJobSha256: string;
  readonly providerRequestSha256: string;
  readonly providerResponseSha256: string;
  readonly inspectionEvidenceSha256: string;
  readonly attemptSha256: string;
  readonly weightedScore: number;
}

export interface ArtProductionUnitState {
  readonly sequence: number;
  readonly unitId: string;
  readonly layerId: string;
  readonly continuityKey: string;
  readonly unitKind: CompiledLayeredProductionUnit["kind"];
  readonly alphaPolicy: LayeredProductionAlphaPolicy;
  readonly dimensions: Readonly<{ width: number; height: number }>;
  readonly dependencyUnitIds: readonly string[];
  readonly status: ArtProductionUnitStatus;
  readonly attemptCount: number;
  readonly maximumAttempts: number;
  readonly latestAttemptSha256?: string;
  readonly acceptedCandidate?: ArtProductionAcceptedCandidate;
}

export interface ArtProductionLoop {
  readonly schemaVersion: "1.0";
  readonly kind: typeof ART_PRODUCTION_LOOP_KIND;
  readonly protocolVersion: typeof ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION;
  readonly planId: string;
  readonly planSha256: string;
  readonly profile: CompiledArtProductionProfile;
  readonly profileSha256: string;
  readonly scope: "style-proof" | "full-production";
  readonly unitStates: readonly ArtProductionUnitState[];
  readonly attempts: readonly ArtProductionAttemptRecord[];
  readonly totals: Readonly<{
    readonly units: number;
    readonly gated: number;
    readonly queued: number;
    readonly repairRequired: number;
    readonly reviewPassed: number;
    readonly blocked: number;
    readonly attempts: number;
  }>;
  readonly authority: Readonly<{
    readonly providerExecution: false;
    readonly automaticCreativeApproval: false;
    readonly imageMutation: false;
    readonly packagingExecution: false;
    readonly targetRepositoryMutation: false;
    readonly gitCommit: false;
    readonly gitPush: false;
    readonly publication: false;
  }>;
  readonly loopSha256: string;
}

export interface ArtProductionBatchJob {
  readonly sequence: number;
  readonly unitId: string;
  readonly attemptNumber: number;
  readonly mode: "generate" | "repair";
  readonly prompt: string;
  readonly negativePrompt: string;
  readonly expectedOutput: Readonly<{
    readonly images: 1;
    readonly width: number;
    readonly height: number;
    readonly alphaPolicy: LayeredProductionAlphaPolicy;
    readonly outputFormat: "png";
  }>;
  readonly referenceArtifacts: readonly Readonly<{
    readonly unitId: string;
    readonly artifactId: string;
    readonly sha256: string;
    readonly role: "dependency" | "identity-master" | "previous-frame";
  }>[];
  readonly jobSha256: string;
}

export interface ArtProductionBatch {
  readonly schemaVersion: "1.0";
  readonly kind: typeof ART_PRODUCTION_BATCH_KIND;
  readonly protocolVersion: typeof ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION;
  readonly loopSha256: string;
  readonly status:
    | "jobs-ready"
    | "awaiting-style-proof-approval"
    | "awaiting-human-approval"
    | "blocked";
  readonly jobs: readonly ArtProductionBatchJob[];
  readonly authority: Readonly<{
    readonly providerExecution: false;
    readonly creativeApproval: false;
    readonly imageMutation: false;
    readonly packagingExecution: false;
    readonly targetRepositoryMutation: false;
  }>;
  readonly batchSha256: string;
}
