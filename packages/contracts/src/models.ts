import { ART_STUDIO_PROTOCOL_VERSION } from "./constants.js";
import type {
  AssetKind,
  AutonomyMode,
  OutputFormat,
  OutputPurpose,
  PipelineStageKind,
  QualityGateId,
  TargetKind,
  TransparencyMode,
} from "./constants.js";
import type { SpriteContinuityBlueprint, SpriteContinuitySpec } from "./sprite-models.js";

export interface Dimensions {
  readonly width: number;
  readonly height: number;
  readonly scale?: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface AnimationSpec {
  readonly name: string;
  /** Frames per direction. */
  readonly frameCount: number;
  readonly framesPerSecond: number;
  readonly loop: boolean;
  readonly loopMode?: "none" | "linear" | "ping-pong";
  readonly directions?: number;
  readonly directionNames?: readonly string[];
  readonly pivot?: Point;
  readonly baseline?: number;
  /** Exact per-frame duration in milliseconds, repeated for each direction. */
  readonly frameDurationsMs?: readonly number[];
  /** Zero-based key poses within one direction. */
  readonly keyPoseFrames?: readonly number[];
  readonly frameOrder?: "direction-major" | "frame-major";
  readonly motionNotes?: readonly string[];
}

export interface OutputFormatSpec {
  readonly format: OutputFormat;
  readonly purpose: OutputPurpose;
  readonly lossless: boolean;
  readonly colourSpace?: "srgb" | "display-p3" | "cmyk" | "lab";
  readonly densityDpi?: number;
}

export interface ReferenceAsset {
  readonly id: string;
  readonly uri: string;
  readonly role: "style" | "composition" | "character" | "palette" | "material" | "motion" | "historical";
  readonly weight: number;
  readonly notes?: string;
  readonly rights?: string;
}

export interface ArtDirection {
  readonly styleName: string;
  readonly intent: string;
  readonly mustHave: readonly string[];
  readonly mustAvoid: readonly string[];
  readonly palette?: Readonly<{
    readonly colours: readonly string[];
    readonly maxColours?: number;
    readonly colourSpace?: "srgb" | "display-p3" | "cmyk" | "lab";
  }>;
  readonly era?: string;
  readonly cameraRules?: readonly string[];
  readonly lineTreatment?: string;
  readonly materialLanguage?: readonly string[];
  readonly references?: readonly ReferenceAsset[];
}

export interface TargetProfile {
  readonly kind: TargetKind;
  readonly platform?: string;
  readonly maximumTextureSize?: number;
  readonly powerOfTwo?: "required" | "preferred" | "not-required";
  readonly textureFiltering?: "nearest" | "linear" | "mixed";
  readonly compressionPolicy?: "lossless" | "visually-lossless" | "runtime-optimised";
  readonly notes?: readonly string[];
}

export interface ProjectContext {
  readonly projectName: string;
  readonly repositoryPath?: string;
  readonly gameGenre?: string;
  readonly engine?: string;
  readonly audience?: string;
  readonly targets: readonly TargetProfile[];
}

export interface AssetRequest {
  readonly id: string;
  readonly name: string;
  readonly kind: AssetKind;
  readonly purpose: string;
  readonly quantity: number;
  readonly dimensions: Dimensions;
  readonly transparency: TransparencyMode;
  readonly animation?: AnimationSpec;
  readonly sprite?: SpriteContinuitySpec;
  readonly outputs: readonly OutputFormatSpec[];
  readonly tags?: readonly string[];
  readonly namingPrefix?: string;
  readonly notes?: readonly string[];
}

export interface AutonomyPolicy {
  readonly mode: AutonomyMode;
  readonly candidateCount: number;
  readonly maximumIterations: number;
  readonly autoApproveThreshold: number;
  readonly allowProviderFallback: boolean;
  readonly requireEvidenceBundle: boolean;
}

export interface ArtBrief {
  readonly schemaVersion: "1.0";
  readonly project: ProjectContext;
  readonly artDirection: ArtDirection;
  readonly assets: readonly AssetRequest[];
  readonly autonomy: AutonomyPolicy;
  readonly outputRoot?: string;
}

export interface CapabilityDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly deterministic: boolean;
  readonly workerClass: "control" | "media" | "vision" | "provider" | "engine";
}

export interface QualityGateSpec {
  readonly id: QualityGateId;
  readonly severity: "blocking" | "warning";
  readonly description: string;
  readonly threshold?: number;
  readonly evidence: readonly string[];
}

export interface WorkItem {
  readonly id: string;
  readonly assetInstanceId: string;
  readonly stage: PipelineStageKind;
  readonly title: string;
  readonly dependsOn: readonly string[];
  readonly requiredCapabilities: readonly string[];
  readonly deterministic: boolean;
  readonly maximumAttempts: number;
  readonly approval: "automatic" | "policy-gated" | "human-required";
  readonly produces: readonly string[];
  readonly blueprintId?: string;
  readonly frameIndex?: number;
  readonly direction?: string;
  readonly layerId?: string;
  readonly repairScope?: "asset" | "frame" | "layer" | "derivative";
}

export interface DeliverableSpec {
  readonly id: string;
  readonly assetInstanceId: string;
  readonly relativePath: string;
  readonly format: OutputFormat;
  readonly purpose: OutputPurpose;
  readonly width?: number;
  readonly height?: number;
  readonly transparency: TransparencyMode;
  readonly metadataSidecar: string;
  readonly blueprintId?: string;
  readonly frameIndex?: number;
  readonly direction?: string;
  readonly layerId?: string;
  readonly durationMs?: number;
  readonly sourceOfTruth?: boolean;
  readonly derivativeOf?: readonly string[];
}

export interface ProductionPlan {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof ART_STUDIO_PROTOCOL_VERSION;
  readonly id: string;
  readonly projectName: string;
  readonly createdFromBriefHash: string;
  readonly autonomy: AutonomyPolicy;
  readonly spriteBlueprints: readonly SpriteContinuityBlueprint[];
  readonly workItems: readonly WorkItem[];
  readonly qualityGates: Readonly<Record<string, readonly QualityGateSpec[]>>;
  readonly deliverables: readonly DeliverableSpec[];
  readonly warnings: readonly string[];
}

export interface RepositoryArtFile {
  readonly path: string;
  readonly extension: string;
  readonly sizeBytes: number;
  readonly category: "image" | "animation" | "font" | "engine-resource" | "source-art" | "metadata" | "other";
}

export interface RepositoryArtSnapshot {
  readonly schemaVersion: "1.0";
  readonly root: string;
  readonly projectName: string;
  readonly engine: "godot" | "unity" | "web" | "unknown";
  readonly engineVersionHint?: string;
  readonly viewport?: Readonly<{ width: number; height: number }>;
  readonly filesScanned: number;
  readonly artFiles: readonly RepositoryArtFile[];
  readonly extensionCounts: Readonly<Record<string, number>>;
  readonly categoryCounts: Readonly<Record<RepositoryArtFile["category"], number>>;
  readonly signals: readonly string[];
  readonly gaps: readonly string[];
  readonly truncated: boolean;
}
