export const LAYERED_PRODUCTION_PROTOCOL_VERSION = "2026-08-10.1" as const;
export const LAYERED_PRODUCTION_REQUEST_KIND = "evavo.layered-production.request" as const;
export const LAYERED_PRODUCTION_PLAN_KIND = "evavo.layered-production.plan" as const;

export type LayeredProductionIntent = "style-proof" | "runtime-source";
export type LayeredProductionAlphaPolicy = "opaque" | "transparent" | "mixed";
export type LayeredProductionAssemblyMode =
  | "full-canvas"
  | "positioned"
  | "tilemap"
  | "y-sorted";
export type LayeredProductionYSortMode = "none" | "ground-contact" | "runtime";
export type LayeredProductionUnitKind =
  | "full-canvas-layer"
  | "sprite"
  | "animation-frame"
  | "tile"
  | "overlay";
export type LayeredProductionLayerRole =
  | "ground-base"
  | "route-base"
  | "architecture-back"
  | "destination-structure"
  | "world-prop"
  | "crowd-character"
  | "player-character"
  | "foreground-occlusion"
  | "ambient-effect"
  | "route-highlight"
  | "ui"
  | "custom";


export type LayeredProviderAssetKind =
  | "sprite-frame"
  | "sprite-layer"
  | "environment"
  | "effect"
  | "ui";

export type LayeredProviderContinuityPhase =
  | "identity-master"
  | "direction-master"
  | "key-pose"
  | "independent";

export type LayeredProviderReferenceRole =
  | "canonical-identity"
  | "direction-master"
  | "previous-key-pose"
  | "next-key-pose"
  | "palette-reference"
  | "line-reference"
  | "material-reference"
  | "layer-context";

export interface LayeredProviderReferenceInput {
  readonly artifactId: string;
  readonly role: LayeredProviderReferenceRole;
  readonly strength?: number;
  readonly required?: boolean;
  readonly note?: string;
}

export interface LayeredProviderCandidateRequest {
  readonly schemaVersion: "1.0";
  readonly requestId: string;
  readonly operation: "generate";
  readonly assetKind: LayeredProviderAssetKind;
  readonly continuityPhase: LayeredProviderContinuityPhase;
  readonly assetId: string;
  readonly candidateFamilyId: string;
  readonly frameId?: string;
  readonly layerId: string;
  readonly creativeIntent: string;
  readonly negativeIntent: string;
  readonly style: Readonly<{
    readonly styleName: string;
    readonly intent: string;
    readonly mustHave: readonly string[];
    readonly mustAvoid: readonly string[];
    readonly identityLocks: readonly string[];
    readonly palette: readonly string[];
    readonly lineTreatment: readonly string[];
    readonly materials: readonly string[];
    readonly cameraRules: readonly string[];
    readonly compositionRules: readonly string[];
    readonly eraRules: readonly string[];
  }>;
  readonly shot: Readonly<{
    readonly subject: string;
    readonly action?: string;
    readonly include: readonly string[];
    readonly exclude: readonly string[];
    readonly separateAssets: readonly string[];
    readonly framing: readonly string[];
  }>;
  readonly target: Readonly<{
    readonly width: number;
    readonly height: number;
    readonly transparency: "required" | "opaque";
    readonly outputFormat: "png";
  }>;
  readonly background: Readonly<{
    readonly strategy: "native-alpha" | "opaque-source";
  }>;
  readonly quality: "high";
  readonly candidateCount: 1;
  readonly references: readonly LayeredProviderReferenceInput[];
  readonly selection: Readonly<{
    readonly allowedAdapterIds: readonly string[];
    readonly allowFallback: false;
    readonly requireSeed: false;
  }>;
  readonly metadata: Readonly<{
    readonly schema: "evavo.layered-production.provider-metadata.v1";
    readonly planId: string;
    readonly planSha256: string;
    readonly styleFingerprintSha256: string;
    readonly unitId: string;
    readonly unitIdempotencyKey: string;
    readonly continuityKey: string;
    readonly targetPath: string;
    readonly layerRole: LayeredProductionLayerRole;
    readonly candidateOnly: true;
    readonly styleProofStatus: "approval-required" | "approved";
    readonly approvals: Readonly<{
      readonly source: false;
      readonly assembly: false;
      readonly final: false;
    }>;
  }>;
}

export interface CompiledLayeredProviderRequest {
  readonly planId: string;
  readonly planSha256: string;
  readonly unitId: string;
  readonly requiredReferenceRoles: readonly LayeredProviderReferenceRole[];
  readonly request: LayeredProviderCandidateRequest;
  readonly authority: Readonly<{
    readonly providerExecution: false;
    readonly approval: false;
    readonly targetRepositoryMutation: false;
  }>;
}

export interface LayeredProductionRequestInput {
  readonly schemaVersion: "1.0";
  readonly kind: typeof LAYERED_PRODUCTION_REQUEST_KIND;
  readonly planId: string;
  readonly revision: string;
  readonly intent: LayeredProductionIntent;
  readonly project: Readonly<{
    readonly projectId: string;
    readonly title: string;
    readonly gameId: string;
    readonly gameTitle: string;
    readonly targetRepository: string;
    readonly engine: string;
    readonly engineVersion: string;
    readonly runtimeRoot: string;
  }>;
  readonly canvas: Readonly<{
    readonly width: number;
    readonly height: number;
    readonly worldWidth: number;
    readonly worldHeight: number;
    readonly coordinateSystem: "top-left-integer";
    readonly pixelAspect: "square" | "dos-vga-4:3-corrected";
    readonly presentationScale: number;
    readonly filtering: "nearest";
  }>;
  readonly style: Readonly<{
    readonly styleId: string;
    readonly title: string;
    readonly authoredEra: string;
    readonly renderingMode: "pixel-art" | "indexed-raster" | "isometric-pixel";
    readonly projection: "front" | "side" | "top-down" | "three-quarter" | "isometric-2:1" | "dimetric";
    readonly camera: Readonly<{
      readonly fixed: true;
      readonly yawDegrees: number;
      readonly pitchDegrees: number;
      readonly rollDegrees: number;
      readonly orthographicScale: number;
    }>;
    readonly lighting: Readonly<{
      readonly fixed: true;
      readonly keyDirectionDegrees: number;
      readonly keyElevationDegrees: number;
      readonly shadowDirectionDegrees: number;
      readonly frameVariation: "forbidden";
    }>;
    readonly palette: Readonly<{
      readonly mode: "indexed" | "rgb";
      readonly maximumSceneColours: number;
      readonly maximumLocalColours: number;
      readonly preserveIndices: boolean;
      readonly colours?: readonly string[];
    }>;
    readonly pixelGrammar: Readonly<{
      readonly deliberateClusters: true;
      readonly fixedPixelDensity: true;
      readonly antialias: "none";
      readonly subpixelMotion: "forbidden";
      readonly gradientPolicy: "forbidden" | "stepped-only";
      readonly textureNoise: "forbidden";
      readonly dithering: "none" | "manual" | "ordered" | "patterned";
      readonly outline: "single-colour" | "selective" | "coloured" | "none";
    }>;
    readonly materialVocabulary: readonly string[];
    readonly lineRules: readonly string[];
    readonly compositionRules: readonly string[];
    readonly distinctiveMotifs: readonly string[];
    readonly forbiddenModernTraits: readonly string[];
    readonly forbiddenGenericTraits: readonly string[];
    readonly references?: readonly Readonly<{
      readonly id: string;
      readonly role: "identity" | "palette" | "camera" | "material" | "composition" | "historical";
      readonly uri: string;
      readonly rights: string;
      readonly note: string;
    }>[];
  }>;
  readonly sourcePolicy: Readonly<{
    readonly oneImagePerProviderJob: true;
    readonly oneLayerRolePerSourceUnit: true;
    readonly conceptArtAsRuntimeSourceForbidden: true;
    readonly collagesAsRuntimeSourceForbidden: true;
    readonly contactSheetsAsRuntimeSourceForbidden: true;
    readonly readableGeneratedTextForbidden: true;
    readonly automaticAssemblyForbidden: true;
    readonly automaticPromotionForbidden: true;
    readonly humanApprovalRequired: true;
    readonly styleProofApprovalRequired: true;
    readonly maximumProviderImagesPerJob: 1;
  }>;
  readonly styleProof: Readonly<{
    readonly required: true;
    readonly approvalBeforeExpansion: true;
    readonly maximumUnitsBeforeApproval: number;
    readonly unitIds: readonly string[];
    readonly approval?: Readonly<{
      readonly approved: true;
      readonly reviewer: string;
      readonly reviewedAt: string;
      readonly evidenceSha256: string;
      readonly approvedUnitIds: readonly string[];
    }>;
  }>;
  readonly layers: readonly LayeredProductionLayerInput[];
  readonly metadata?: unknown;
}

export interface LayeredProductionLayerInput {
  readonly id: string;
  readonly role: LayeredProductionLayerRole;
  readonly zOrder: number;
  readonly alpha: LayeredProductionAlphaPolicy;
  readonly assemblyMode: LayeredProductionAssemblyMode;
  readonly ySortMode: LayeredProductionYSortMode;
  readonly dependsOn?: readonly string[];
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly units: readonly LayeredProductionUnitInput[];
}

export interface LayeredProductionUnitInput {
  readonly id: string;
  readonly kind: LayeredProductionUnitKind;
  readonly purpose: string;
  readonly dimensions: Readonly<{ width: number; height: number }>;
  readonly position?: Readonly<{ x: number; y: number }>;
  readonly pivot?: Readonly<{ x: number; y: number }>;
  readonly ySortOrigin?: Readonly<{ x: number; y: number }>;
  readonly continuityKey: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly fileName: string;
  readonly targetPath: string;
  readonly frame?: Readonly<{
    readonly clipId: string;
    readonly frameNumber: number;
    readonly frameCount: number;
    readonly framesPerSecond: number;
    readonly loop: boolean;
    readonly pose: string;
  }>;
}

export interface CompiledLayeredProductionUnit {
  readonly sequence: number;
  readonly id: string;
  readonly layerId: string;
  readonly layerRole: LayeredProductionLayerRole;
  readonly zOrder: number;
  readonly alpha: LayeredProductionAlphaPolicy;
  readonly kind: LayeredProductionUnitKind;
  readonly purpose: string;
  readonly dimensions: Readonly<{ width: number; height: number }>;
  readonly position?: Readonly<{ x: number; y: number }>;
  readonly pivot?: Readonly<{ x: number; y: number }>;
  readonly ySortOrigin?: Readonly<{ x: number; y: number }>;
  readonly continuityKey: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly fileName: string;
  readonly targetPath: string;
  readonly frame?: LayeredProductionUnitInput["frame"];
  readonly providerJob: Readonly<{
    readonly schemaVersion: "1.0";
    readonly kind: "art.image.generate.source-unit";
    readonly sourceIntent: "runtime-source";
    readonly executionUnit: "one-image";
    readonly images: 1;
    readonly width: number;
    readonly height: number;
    readonly transparentBackground: boolean;
    readonly prompt: string;
    readonly negativePrompt: string;
    readonly idempotencyKey: string;
    readonly labels: Readonly<{
      readonly planId: string;
      readonly styleId: string;
      readonly layerId: string;
      readonly unitId: string;
      readonly continuityKey: string;
    }>;
    readonly providerContract: Readonly<{
      readonly assetKind: LayeredProviderAssetKind;
      readonly continuityPhase: LayeredProviderContinuityPhase;
      readonly requiredReferenceRoles: readonly LayeredProviderReferenceRole[];
    }>;
  }>;
  readonly review: Readonly<{
    readonly approvalRequired: true;
    readonly requiredViews: readonly string[];
    readonly blockingGates: readonly string[];
    readonly compareAgainst: readonly string[];
    readonly candidateOnly: true;
  }>;
}

export interface CompiledLayeredProductionPlan {
  readonly schemaVersion: "1.0";
  readonly kind: typeof LAYERED_PRODUCTION_PLAN_KIND;
  readonly protocolVersion: typeof LAYERED_PRODUCTION_PROTOCOL_VERSION;
  readonly planId: string;
  readonly revision: string;
  readonly intent: LayeredProductionIntent;
  readonly requestSha256: string;
  readonly styleFingerprintSha256: string;
  readonly planSha256: string;
  readonly project: LayeredProductionRequestInput["project"];
  readonly canvas: LayeredProductionRequestInput["canvas"];
  readonly style: LayeredProductionRequestInput["style"];
  readonly sourcePolicy: LayeredProductionRequestInput["sourcePolicy"];
  readonly styleProof: Readonly<{
    readonly required: true;
    readonly approvalBeforeExpansion: true;
    readonly maximumUnitsBeforeApproval: number;
    readonly unitIds: readonly string[];
    readonly unitCount: number;
    readonly layerIds: readonly string[];
    readonly status: "approval-required" | "approved";
    readonly approval?: Readonly<{
      readonly reviewer: string;
      readonly reviewedAt: string;
      readonly evidenceSha256: string;
      readonly approvedUnitIds: readonly string[];
    }>;
  }>;
  readonly layers: readonly Readonly<{
    readonly id: string;
    readonly role: LayeredProductionLayerRole;
    readonly zOrder: number;
    readonly alpha: LayeredProductionAlphaPolicy;
    readonly assemblyMode: LayeredProductionAssemblyMode;
    readonly ySortMode: LayeredProductionYSortMode;
    readonly dependsOn: readonly string[];
    readonly include: readonly string[];
    readonly exclude: readonly string[];
    readonly units: readonly CompiledLayeredProductionUnit[];
  }>[];
  readonly assembly: Readonly<{
    readonly sourceAuthority: "approved-individual-source-pngs";
    readonly layerOrder: readonly string[];
    readonly coordinateSystem: "top-left-integer";
    readonly compositePolicy: "approval-gated-derivative-only";
    readonly reviewCompositeIsRuntimeSource: false;
    readonly automaticAssembly: false;
    readonly ySortManifestRequired: boolean;
    readonly manifestPath: string;
  }>;
  readonly totals: Readonly<{
    readonly layers: number;
    readonly units: number;
    readonly providerCalls: number;
    readonly maximumImagesPerProviderCall: 1;
    readonly fullCanvasLayers: number;
    readonly sprites: number;
    readonly animationFrames: number;
    readonly tiles: number;
    readonly overlays: number;
    readonly styleProofUnits: number;
  }>;
  readonly qualityGates: readonly string[];
  readonly authority: Readonly<{
    readonly planningOnly: true;
    readonly providerExecution: false;
    readonly automaticAssembly: false;
    readonly automaticPromotion: false;
    readonly targetRepositoryMutation: false;
    readonly approval: false;
    readonly gitCommit: false;
    readonly gitPush: false;
    readonly publication: false;
  }>;
  readonly metadata?: unknown;
}
