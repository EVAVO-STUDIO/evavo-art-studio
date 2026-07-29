import type {
  ArtifactId,
  ArtifactStore,
  JsonValue,
  StoredArtifact,
} from "@evavo/art-artifacts";

export const PROVIDER_PROTOCOL_VERSION = "2026-07-29.1" as const;

export type ProviderOperation = "generate" | "edit" | "inpaint";
export type ProviderAssetKind =
  | "sprite-frame"
  | "sprite-layer"
  | "environment"
  | "effect"
  | "ui"
  | "illustration"
  | "print";
export type ProviderContinuityPhase =
  | "identity-master"
  | "direction-master"
  | "key-pose"
  | "in-between"
  | "repair"
  | "independent";
export type ProviderReferenceRole =
  | "canonical-identity"
  | "direction-master"
  | "previous-key-pose"
  | "next-key-pose"
  | "base-image"
  | "mask"
  | "pose-control"
  | "edge-control"
  | "depth-control"
  | "palette-reference"
  | "line-reference"
  | "material-reference"
  | "layer-context";
export type ProviderBackgroundStrategy =
  | "native-alpha"
  | "chroma-key"
  | "opaque-source"
  | "provider-auto";
export type ProviderTransparencyTarget = "required" | "preferred" | "opaque";
export type ProviderCandidateQuality = "draft" | "standard" | "high";
export type ProviderCapability =
  | "generate"
  | "edit"
  | "inpaint"
  | "reference-images"
  | "multiple-reference-images"
  | "mask"
  | "seed"
  | "native-alpha"
  | "custom-size"
  | "candidate-count"
  | "cancellation";
export type ProviderErrorClassification =
  | "transient"
  | "permanent"
  | "incompatible"
  | "cancelled";

export interface ProviderCandidateReferenceInput {
  readonly artifactId: ArtifactId;
  readonly role: ProviderReferenceRole;
  readonly strength?: number;
  readonly required?: boolean;
  readonly note?: string;
}

export interface ProviderStyleEnvelopeInput {
  readonly styleName: string;
  readonly intent: string;
  readonly mustHave?: readonly string[];
  readonly mustAvoid?: readonly string[];
  readonly identityLocks?: readonly string[];
  readonly palette?: readonly string[];
  readonly lineTreatment?: readonly string[];
  readonly materials?: readonly string[];
  readonly cameraRules?: readonly string[];
  readonly compositionRules?: readonly string[];
  readonly eraRules?: readonly string[];
}

export interface ProviderShotContractInput {
  readonly subject: string;
  readonly action?: string;
  readonly direction?: string;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  readonly separateAssets?: readonly string[];
  readonly framing?: readonly string[];
}

export interface ProviderCandidateRequestInput {
  readonly schemaVersion: "1.0";
  readonly requestId?: string;
  readonly operation: ProviderOperation;
  readonly assetKind: ProviderAssetKind;
  readonly continuityPhase: ProviderContinuityPhase;
  readonly assetId: string;
  readonly candidateFamilyId: string;
  readonly frameId?: string;
  readonly layerId?: string;
  readonly creativeIntent: string;
  readonly negativeIntent?: string;
  readonly style: ProviderStyleEnvelopeInput;
  readonly shot: ProviderShotContractInput;
  readonly target: Readonly<{
    width: number;
    height: number;
    transparency: ProviderTransparencyTarget;
    outputFormat?: "png" | "webp" | "jpeg";
  }>;
  readonly sourceCanvas?: Readonly<{ width: number; height: number }>;
  readonly background?: Readonly<{
    strategy?: ProviderBackgroundStrategy;
    matteColour?: string;
  }>;
  readonly quality?: ProviderCandidateQuality;
  readonly candidateCount?: number;
  readonly seed?: number;
  readonly references?: readonly ProviderCandidateReferenceInput[];
  readonly selection?: Readonly<{
    preferredAdapterId?: string;
    preferredModel?: string;
    allowedAdapterIds?: readonly string[];
    allowFallback?: boolean;
    requireSeed?: boolean;
  }>;
  readonly metadata?: JsonValue;
}

export interface NormalizedProviderCandidateReference {
  readonly artifactId: ArtifactId;
  readonly role: ProviderReferenceRole;
  readonly strength: number;
  readonly required: boolean;
  readonly note?: string;
}

export interface NormalizedProviderCandidateRequest {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof PROVIDER_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly operation: ProviderOperation;
  readonly assetKind: ProviderAssetKind;
  readonly continuityPhase: ProviderContinuityPhase;
  readonly assetId: string;
  readonly candidateFamilyId: string;
  readonly frameId?: string;
  readonly layerId?: string;
  readonly creativeIntent: string;
  readonly negativeIntent?: string;
  readonly style: Readonly<{
    styleName: string;
    intent: string;
    mustHave: readonly string[];
    mustAvoid: readonly string[];
    identityLocks: readonly string[];
    palette: readonly string[];
    lineTreatment: readonly string[];
    materials: readonly string[];
    cameraRules: readonly string[];
    compositionRules: readonly string[];
    eraRules: readonly string[];
  }>;
  readonly shot: Readonly<{
    subject: string;
    action?: string;
    direction?: string;
    include: readonly string[];
    exclude: readonly string[];
    separateAssets: readonly string[];
    framing: readonly string[];
  }>;
  readonly target: Readonly<{
    width: number;
    height: number;
    transparency: ProviderTransparencyTarget;
    outputFormat: "png" | "webp" | "jpeg";
  }>;
  readonly sourceCanvas?: Readonly<{ width: number; height: number }>;
  readonly background: Readonly<{
    strategy: ProviderBackgroundStrategy;
    matteColour?: string;
  }>;
  readonly quality: ProviderCandidateQuality;
  readonly candidateCount: number;
  readonly seed?: number;
  readonly references: readonly NormalizedProviderCandidateReference[];
  readonly selection: Readonly<{
    preferredAdapterId?: string;
    preferredModel?: string;
    allowedAdapterIds: readonly string[];
    allowFallback: boolean;
    requireSeed: boolean;
  }>;
  readonly metadata?: JsonValue;
}

export interface ResolvedProviderReference
  extends NormalizedProviderCandidateReference {
  readonly artifact: StoredArtifact;
  readonly bytes: Uint8Array;
}

export interface ResolvedProviderCandidateRequest {
  readonly request: NormalizedProviderCandidateRequest;
  readonly requestSha256: string;
  readonly compiledPrompt: string;
  readonly compiledPromptSha256: string;
  readonly references: readonly ResolvedProviderReference[];
}

export interface ProviderAdapterDescriptor {
  readonly protocolVersion: typeof PROVIDER_PROTOCOL_VERSION;
  readonly id: string;
  readonly label: string;
  readonly version: string;
  readonly priority: number;
  readonly capabilities: readonly ProviderCapability[];
  readonly models: readonly string[];
  readonly maximumCandidates: number;
  readonly maximumReferenceImages: number;
  readonly maximumSourceBytes: number;
  readonly dataPolicy: Readonly<{
    remote: boolean;
    retainedByProvider: boolean | "provider-dependent";
    usedForTraining: boolean | "provider-dependent";
  }>;
}

export interface ProviderAdapterExecutionContext {
  readonly signal: AbortSignal;
  readonly requestedAt: Date;
}

export interface ProviderAdapterOutput {
  readonly bytes: Uint8Array;
  readonly mediaType: "image/png" | "image/webp" | "image/jpeg";
  readonly fileName?: string;
  readonly revisedPrompt?: string;
  readonly metadata?: JsonValue;
}

export interface ProviderAdapterExecutionResult {
  readonly adapterId: string;
  readonly model: string;
  readonly externalId?: string;
  readonly outputs: readonly ProviderAdapterOutput[];
  readonly usage?: JsonValue;
  readonly metadata?: JsonValue;
}

export interface ProviderAdapter {
  readonly descriptor: ProviderAdapterDescriptor;
  execute(
    request: ResolvedProviderCandidateRequest,
    context: ProviderAdapterExecutionContext,
  ): Promise<ProviderAdapterExecutionResult>;
}

export interface ProviderSelectionDecision {
  readonly adapterId: string;
  readonly eligible: boolean;
  readonly reasons: readonly string[];
  readonly rank: number;
}

export interface ProviderAttemptEvidence {
  readonly adapterId: string;
  readonly model?: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly outcome: "succeeded" | "failed" | "cancelled";
  readonly classification?: ProviderErrorClassification;
  readonly code?: string;
  readonly message?: string;
  readonly externalId?: string;
}

export interface ProviderCandidateRunResult {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof PROVIDER_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly requestSha256: string;
  readonly compiledPromptSha256: string;
  readonly adapterId: string;
  readonly model: string;
  readonly candidateArtifacts: readonly ArtifactId[];
  readonly evidenceArtifact: ArtifactId;
  readonly attempts: readonly ProviderAttemptEvidence[];
  readonly requiresAlphaExtraction: boolean;
}

export interface ExecuteProviderCandidateOptions {
  readonly registry: ProviderRegistryLike;
  readonly artifacts: ArtifactStore;
  readonly signal: AbortSignal;
  readonly now?: () => Date;
  readonly maximumReferenceBytes?: number;
  readonly maximumTotalReferenceBytes?: number;
  readonly maximumOutputBytes?: number;
}

export interface ProviderRegistryLike {
  list(): readonly ProviderAdapterDescriptor[];
  rank(
    request: NormalizedProviderCandidateRequest,
  ): readonly Readonly<{
    adapter: ProviderAdapter;
    decision: ProviderSelectionDecision;
  }>[];
}

export class ProviderError extends Error {
  public readonly code: string;
  public readonly classification: ProviderErrorClassification;
  public readonly status?: number;
  public readonly details?: JsonValue;

  public constructor(
    code: string,
    message: string,
    classification: ProviderErrorClassification,
    options: Readonly<{ status?: number; details?: JsonValue }> = {},
  ) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.classification = classification;
    if (options.status !== undefined) this.status = options.status;
    if (options.details !== undefined) this.details = options.details;
  }
}
