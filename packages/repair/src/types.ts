import type {
  ArtifactId,
  ArtifactStore,
  JsonValue,
} from "@evavo/art-artifacts";
import type {
  PixelArtProviderCanvasManifest,
  PixelArtProviderCanvasOptions,
  PixelArtProviderCanvasRestorationEvidence,
} from "@evavo/art-provider-canvas";
import type {
  NormalizedProviderCandidateRequest,
  ProviderBackgroundStrategy,
  ProviderRegistryLike,
  ProviderShotContractInput,
  ProviderStyleEnvelopeInput,
} from "@evavo/art-providers";
import type {
  SpriteFamilyConsistencyEvidence,
  SpriteFamilyGateResult,
  SpriteLayerRole,
  SpriteLayerSourcePolicy,
} from "@evavo/art-sprite-family";

export const TARGETED_REPAIR_PROTOCOL_VERSION = "2026-07-30.2" as const;

export type TargetedRepairStrategy =
  | "source-replace"
  | "metadata-adjustment"
  | "layer-transform"
  | "layer-recompose"
  | "alpha-remaster"
  | "masked-provider-inpaint"
  | "manual-review";

export type TargetedRepairDisposition =
  | "ready"
  | "blocked"
  | "manual-source-required";

export type TargetedRepairReferenceRole =
  | "canonical-identity"
  | "direction-master"
  | "previous-key-pose"
  | "next-key-pose"
  | "palette-reference"
  | "line-reference"
  | "material-reference";

export interface TargetedRepairReferenceInput {
  readonly artifactId: ArtifactId;
  readonly role: TargetedRepairReferenceRole;
  readonly strength?: number;
  readonly note?: string;
}

export interface TargetedRepairRequestInput {
  readonly schemaVersion: "1.0";
  readonly repairId: string;
  readonly familyEvidenceArtifactId: ArtifactId;
  readonly target: Readonly<{
    frameId: string;
    layerId?: string;
    gateIds?: readonly string[];
  }>;
  readonly intent: string;
  readonly preserve?: readonly string[];
  readonly maskArtifactId?: ArtifactId;
  readonly references?: readonly TargetedRepairReferenceInput[];
  readonly style?: ProviderStyleEnvelopeInput;
  readonly shot?: ProviderShotContractInput;
  readonly provider?: Readonly<{
    enabled?: boolean;
    backgroundStrategy?: ProviderBackgroundStrategy;
    matteColour?: string;
    candidateCount?: number;
    seed?: number;
    preferredAdapterId?: string;
    preferredModel?: string;
    allowedAdapterIds?: readonly string[];
    allowFallback?: boolean;
  }>;
  readonly policy?: Readonly<{
    requireMaskForPixelRepair?: boolean;
    allowSharedLayerRepair?: boolean;
    allowWholeFramePixelRepair?: boolean;
    maximumImpactedFrames?: number;
  }>;
  readonly metadata?: JsonValue;
}

export interface NormalizedTargetedRepairReference {
  readonly artifactId: ArtifactId;
  readonly role: TargetedRepairReferenceRole;
  readonly strength: number;
  readonly note?: string;
}

export interface NormalizedTargetedRepairRequest {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof TARGETED_REPAIR_PROTOCOL_VERSION;
  readonly repairId: string;
  readonly familyEvidenceArtifactId: ArtifactId;
  readonly target: Readonly<{
    frameId: string;
    layerId?: string;
    gateIds: readonly string[];
  }>;
  readonly intent: string;
  readonly preserve: readonly string[];
  readonly maskArtifactId?: ArtifactId;
  readonly references: readonly NormalizedTargetedRepairReference[];
  readonly style?: ProviderStyleEnvelopeInput;
  readonly shot?: ProviderShotContractInput;
  readonly provider: Readonly<{
    enabled: boolean;
    backgroundStrategy?: ProviderBackgroundStrategy;
    matteColour?: string;
    candidateCount: number;
    seed?: number;
    preferredAdapterId?: string;
    preferredModel?: string;
    allowedAdapterIds: readonly string[];
    allowFallback: boolean;
  }>;
  readonly policy: Readonly<{
    requireMaskForPixelRepair: boolean;
    allowSharedLayerRepair: boolean;
    allowWholeFramePixelRepair: boolean;
    maximumImpactedFrames: number;
  }>;
  readonly metadata?: JsonValue;
}

export interface TargetedRepairFailure {
  readonly frameId: string;
  readonly layerId?: string;
  readonly gate: SpriteFamilyGateResult;
  readonly category:
    | "immutable-source"
    | "alpha"
    | "geometry"
    | "metadata"
    | "composition"
    | "identity"
    | "style-palette"
    | "motion-loop"
    | "quality"
    | "unknown";
}

export interface TargetedRepairStep {
  readonly order: number;
  readonly strategy: TargetedRepairStrategy;
  readonly blocking: boolean;
  readonly description: string;
  readonly targetFrameIds: readonly string[];
  readonly targetLayerId?: string;
  readonly mutableArtifactIds: readonly ArtifactId[];
  readonly protectedArtifactIds: readonly ArtifactId[];
  readonly gateIds: readonly string[];
  readonly prerequisites: readonly string[];
}

export interface TargetedRepairProviderPlan {
  readonly request: NormalizedProviderCandidateRequest;
  readonly inputArtifacts: readonly ArtifactId[];
  readonly runtimeJob: Readonly<{
    queue: "provider";
    kind: "art.candidate.inpaint";
    idempotencyKey: string;
    payload: NormalizedProviderCandidateRequest;
    inputArtifacts: readonly ArtifactId[];
    requiredCapabilities: readonly string[];
    maximumAttempts: number;
    leaseDurationMs: number;
    timeoutMs: number;
    labels: Readonly<Record<string, string>>;
  }>;
}

export interface TargetedRepairPacket {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof TARGETED_REPAIR_PROTOCOL_VERSION;
  readonly repairId: string;
  readonly requestSha256: string;
  readonly familyEvidenceArtifactId: ArtifactId;
  readonly familyId: string;
  readonly familyManifestSha256: string;
  readonly disposition: TargetedRepairDisposition;
  readonly target: Readonly<{
    frameId: string;
    layerId?: string;
    layerRole?: SpriteLayerRole;
    sourcePolicy?: SpriteLayerSourcePolicy | undefined;
    baseArtifactId?: ArtifactId;
  }>;
  readonly impactedFrameIds: readonly string[];
  readonly failures: readonly TargetedRepairFailure[];
  readonly steps: readonly TargetedRepairStep[];
  readonly mutableArtifactIds: readonly ArtifactId[];
  readonly protectedArtifactIds: readonly ArtifactId[];
  readonly providerPlan?: TargetedRepairProviderPlan;
  readonly blockers: readonly string[];
  readonly continuation: readonly Readonly<{
    stage:
      | "provider-canvas-restore"
      | "alpha-master"
      | "manifest-update"
      | "family-reverify"
      | "candidate-select"
      | "candidate-promote";
    description: string;
    requiredCapabilities: readonly string[];
  }>[];
  readonly sourceEvidence: SpriteFamilyConsistencyEvidence;
  readonly metadata?: JsonValue;
}

export interface TargetedRepairRunResult {
  readonly packetArtifactId: ArtifactId;
  readonly packet: TargetedRepairPacket;
}

export type TargetedRepairProviderCanvasOptions = Omit<
  PixelArtProviderCanvasOptions,
  "matteColour"
>;

export interface TargetedRepairExecutionRequestInput {
  readonly schemaVersion: "1.0";
  readonly repairPacketArtifactId: ArtifactId;
  readonly providerCanvas?: TargetedRepairProviderCanvasOptions;
}

export interface NormalizedTargetedRepairExecutionRequest {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof TARGETED_REPAIR_PROTOCOL_VERSION;
  readonly repairPacketArtifactId: ArtifactId;
  readonly providerCanvas: TargetedRepairProviderCanvasOptions;
}

export interface TargetedRepairRestoredCandidate {
  readonly providerCandidateArtifactId: ArtifactId;
  readonly restoredCandidateArtifactId: ArtifactId;
  readonly restorationEvidenceArtifactId: ArtifactId;
  readonly restoration: PixelArtProviderCanvasRestorationEvidence;
}

export interface TargetedRepairExecutionResult {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof TARGETED_REPAIR_PROTOCOL_VERSION;
  readonly repairId: string;
  readonly repairPacketArtifactId: ArtifactId;
  readonly providerCanvasBaseArtifactId: ArtifactId;
  readonly providerCanvasMaskArtifactId: ArtifactId;
  readonly providerCanvasManifestArtifactId: ArtifactId;
  readonly providerCanvasManifest: PixelArtProviderCanvasManifest;
  readonly providerEvidenceArtifactId: ArtifactId;
  readonly restoredCandidates: readonly TargetedRepairRestoredCandidate[];
  readonly executionEvidenceArtifactId: ArtifactId;
}

export interface PlanTargetedRepairOptions {
  readonly artifacts: ArtifactStore;
  readonly now?: () => Date;
}

export interface ExecuteTargetedRepairOptions {
  readonly artifacts: ArtifactStore;
  readonly registry: ProviderRegistryLike;
  readonly signal: AbortSignal;
  readonly now?: () => Date;
}

export class TargetedRepairError extends Error {
  public readonly code: string;
  public readonly details?: JsonValue;

  public constructor(code: string, message: string, details?: JsonValue) {
    super(message);
    this.name = "TargetedRepairError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
