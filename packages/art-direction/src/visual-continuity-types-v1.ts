export const VISUAL_CONTINUITY_PROTOCOL_VERSION = "2026-09-19.1" as const;
export const VISUAL_CONTINUITY_BIBLE_KIND = "evavo.visual-continuity.bible" as const;
export const VISUAL_CONTINUITY_SESSION_KIND = "evavo.visual-continuity.session" as const;
export const VISUAL_CONTINUITY_STATE_KIND = "evavo.visual-continuity.state" as const;
export const VISUAL_CONTINUITY_PACKET_KIND = "evavo.visual-continuity.work-packet" as const;
export const VISUAL_CONTINUITY_REVIEW_KIND = "evavo.visual-continuity.review" as const;
export const VISUAL_CONTINUITY_HANDOFF_KIND = "evavo.visual-continuity.handoff" as const;

export const VISUAL_CONTINUITY_ASSET_KINDS = [
  "character", "creature", "prop", "vehicle", "environment", "interior",
  "world-map", "regional-map", "location-map", "tactical-map", "diagram",
  "tile-set", "terrain", "background", "portrait", "icon", "ui",
  "typography", "logo", "illustration", "storyboard-panel", "video-keyframe",
  "sprite-frame", "animation-cel", "vfx-frame", "texture-set",
  "material-reference", "3d-turnaround", "3d-reference",
] as const;
export type VisualContinuityAssetKind = (typeof VISUAL_CONTINUITY_ASSET_KINDS)[number];

export const VISUAL_CONTINUITY_REFERENCE_ROLES = [
  "identity-master", "palette-master", "silhouette", "proportion", "face",
  "costume", "equipment", "camera", "lighting", "material", "line-language",
  "composition", "historical", "geography", "map-geometry", "motion",
  "typography", "ui-language", "topology", "uv-layout", "texture",
  "storyboard", "video-shot",
] as const;
export type VisualContinuityReferenceRole = (typeof VISUAL_CONTINUITY_REFERENCE_ROLES)[number];

export const VISUAL_CONTINUITY_LOCK_STRENGTHS = ["immutable", "strict", "guided", "advisory"] as const;
export type VisualContinuityLockStrength = (typeof VISUAL_CONTINUITY_LOCK_STRENGTHS)[number];

export const VISUAL_CONTINUITY_OPERATIONS = [
  "generate", "edit", "repair", "extend", "variant", "animate", "storyboard",
  "map", "texture", "turnaround", "handoff",
] as const;
export type VisualContinuityOperation = (typeof VISUAL_CONTINUITY_OPERATIONS)[number];

export const VISUAL_CONTINUITY_STUDIO_TARGETS = [
  "art-studio", "animation-studio", "video-studio", "3d-studio",
  "texture-studio", "godot", "web", "print",
] as const;
export type VisualContinuityStudioTarget = (typeof VISUAL_CONTINUITY_STUDIO_TARGETS)[number];

export type VisualContinuityPaletteMode = "indexed" | "rgb" | "monochrome" | "wide-gamut";
export type VisualContinuityProjection =
  | "front" | "side" | "top-down" | "three-quarter" | "isometric-2:1"
  | "dimetric" | "orthographic" | "perspective" | "screen-space"
  | "equirectangular" | "mercator" | "custom";
export type VisualContinuityAlphaPolicy = "opaque" | "transparent" | "mixed";
export type VisualContinuityDecision = "accepted" | "revise" | "rejected";
export type VisualContinuityTaskStatus = "queued" | "revision-required" | "accepted" | "rejected";

export interface VisualContinuityReferenceInput {
  readonly id: string;
  readonly role: VisualContinuityReferenceRole;
  readonly uri: string;
  readonly sha256: string;
  readonly rights: string;
  readonly note: string;
  readonly assetIds?: readonly string[];
  readonly continuityGroupIds?: readonly string[];
}

export interface VisualContinuityPaletteSwatchInput {
  readonly id: string;
  readonly name: string;
  readonly value: string;
  readonly semanticRoles: readonly string[];
  readonly locked: boolean;
}

export interface VisualContinuityPaletteInput {
  readonly paletteId: string;
  readonly title: string;
  readonly mode: VisualContinuityPaletteMode;
  readonly swatches: readonly VisualContinuityPaletteSwatchInput[];
  readonly maximumColours: number;
  readonly preserveIndices: boolean;
  readonly forbiddenColours: readonly string[];
  readonly contrastRules: readonly string[];
  readonly exportColourSpace: "srgb" | "display-p3" | "linear-srgb";
}

export interface VisualContinuityCameraProfileInput {
  readonly id: string;
  readonly title: string;
  readonly projection: VisualContinuityProjection;
  readonly fixed: boolean;
  readonly yawDegrees: number;
  readonly pitchDegrees: number;
  readonly rollDegrees: number;
  readonly fieldOfViewDegrees?: number;
  readonly orthographicScale?: number;
  readonly horizon: "none" | "low" | "mid" | "high";
  readonly framingRules: readonly string[];
  readonly forbiddenMoves: readonly string[];
}

export interface VisualContinuityLightingProfileInput {
  readonly id: string;
  readonly title: string;
  readonly keyDirectionDegrees: number;
  readonly keyElevationDegrees: number;
  readonly ambientLevel: number;
  readonly shadowDirectionDegrees: number;
  readonly shadowTreatment: "none" | "baked" | "separate" | "dynamic";
  readonly colourTemperature: "cool" | "neutral" | "warm" | "mixed";
  readonly fixedAcrossFamily: boolean;
  readonly rules: readonly string[];
}

export interface VisualContinuityMaterialInput {
  readonly id: string;
  readonly title: string;
  readonly cues: readonly string[];
  readonly prohibitedTreatments: readonly string[];
  readonly paletteSwatchIds: readonly string[];
  readonly textureNotes: readonly string[];
}

export interface VisualContinuityGroupInput {
  readonly id: string;
  readonly title: string;
  readonly purpose: string;
  readonly lockStrength: VisualContinuityLockStrength;
  readonly immutableTraits: readonly string[];
  readonly allowedVariations: readonly string[];
  readonly prohibitedVariations: readonly string[];
  readonly referenceIds: readonly string[];
}

export interface VisualContinuityAssetInput {
  readonly id: string;
  readonly title: string;
  readonly kind: VisualContinuityAssetKind;
  readonly purpose: string;
  readonly continuityGroupIds: readonly string[];
  readonly dimensions?: Readonly<{ width: number; height: number }>;
  readonly aspectRatio?: string;
  readonly alphaPolicy: VisualContinuityAlphaPolicy;
  readonly paletteId: string;
  readonly cameraProfileId?: string;
  readonly lightingProfileId?: string;
  readonly materialIds: readonly string[];
  readonly referenceIds: readonly string[];
  readonly dependencyAssetIds: readonly string[];
  readonly targetStudios: readonly VisualContinuityStudioTarget[];
  readonly mustHave: readonly string[];
  readonly mustAvoid: readonly string[];
  readonly variationAxes: readonly string[];
  readonly outputNotes: readonly string[];
}

export interface VisualContinuityMapDefinitionInput {
  readonly id: string;
  readonly assetId: string;
  readonly projection: VisualContinuityProjection;
  readonly coordinateSystem: string;
  readonly worldUnits: string;
  readonly scaleStatement: string;
  readonly northRule: string;
  readonly coastlineRule: string;
  readonly borderRule: string;
  readonly labelPolicy: "none" | "runtime" | "authored";
  readonly layerIds: readonly string[];
  readonly landmarkAssetIds: readonly string[];
  readonly routeAssetIds: readonly string[];
}

export interface VisualContinuityBibleInput {
  readonly schemaVersion: "1.0";
  readonly kind: typeof VISUAL_CONTINUITY_BIBLE_KIND;
  readonly bibleId: string;
  readonly revision: string;
  readonly project: Readonly<{
    readonly projectId: string;
    readonly title: string;
    readonly rootStyleId: string;
    readonly worldEra: string;
    readonly engine?: string;
    readonly engineVersion?: string;
    readonly targetPlatforms: readonly string[];
    readonly canonicalUnits: string;
  }>;
  readonly direction: Readonly<{
    readonly title: string;
    readonly creativeIntent: string;
    readonly signatureMotifs: readonly string[];
    readonly antiGenericRules: readonly string[];
    readonly forbiddenTraits: readonly string[];
    readonly lineLanguage: readonly string[];
    readonly compositionRules: readonly string[];
    readonly historicalRules: readonly string[];
    readonly typographyRules: readonly string[];
  }>;
  readonly palettes: readonly VisualContinuityPaletteInput[];
  readonly cameraProfiles: readonly VisualContinuityCameraProfileInput[];
  readonly lightingProfiles: readonly VisualContinuityLightingProfileInput[];
  readonly materials: readonly VisualContinuityMaterialInput[];
  readonly continuityGroups: readonly VisualContinuityGroupInput[];
  readonly assets: readonly VisualContinuityAssetInput[];
  readonly maps: readonly VisualContinuityMapDefinitionInput[];
  readonly references: readonly VisualContinuityReferenceInput[];
  readonly governance: Readonly<{
    readonly preserveCanonicalSources: true;
    readonly oneImagePerGenerationJob: true;
    readonly contactSheetsAreReviewOnly: true;
    readonly generatedReadableTextForbidden: true;
    readonly explicitApprovalRequired: true;
    readonly fullResolutionReviewRequired: true;
    readonly provenanceRequired: true;
    readonly maximumOpenVariantsPerAsset: number;
    readonly minimumContinuityScore: number;
    readonly minimumIdentityScore: number;
    readonly minimumPaletteScore: number;
    readonly minimumCompositionScore: number;
    readonly genericPenaltyThreshold: number;
  }>;
  readonly metadata?: unknown;
}

export interface CompiledVisualContinuityBible extends VisualContinuityBibleInput {
  readonly protocolVersion: typeof VISUAL_CONTINUITY_PROTOCOL_VERSION;
  readonly fingerprints: Readonly<{
    readonly paletteSha256: string;
    readonly directionSha256: string;
    readonly assetGraphSha256: string;
    readonly referenceBankSha256: string;
  }>;
  readonly totals: Readonly<{
    readonly palettes: number;
    readonly swatches: number;
    readonly cameraProfiles: number;
    readonly lightingProfiles: number;
    readonly materials: number;
    readonly continuityGroups: number;
    readonly assets: number;
    readonly maps: number;
    readonly references: number;
  }>;
  readonly workspaceLayout: Readonly<{
    readonly biblePath: string;
    readonly sessionsRoot: string;
    readonly referencesRoot: string;
    readonly candidatesRoot: string;
    readonly reviewsRoot: string;
    readonly handoffsRoot: string;
  }>;
  readonly authority: Readonly<{
    readonly providerExecution: false;
    readonly imageMutation: false;
    readonly creativeApproval: false;
    readonly targetRepositoryMutation: false;
    readonly gitCommit: false;
    readonly gitPush: false;
    readonly publication: false;
  }>;
  readonly bibleSha256: string;
}

export const VISUAL_CONTINUITY_METRIC_IDS = [
  "identity", "palette", "camera", "lighting", "material", "composition",
  "map-geometry", "motion", "typography", "historical-plausibility",
  "non-generic-quality", "runtime-usability",
] as const;
export type VisualContinuityMetricId = (typeof VISUAL_CONTINUITY_METRIC_IDS)[number];

export const VISUAL_CONTINUITY_DETECTION_IDS = [
  "identity-drift", "palette-drift", "camera-drift", "lighting-drift",
  "material-drift", "composition-drift", "map-geometry-drift", "motion-drift",
  "typography-drift", "generic-ai-styling", "unrequested-detail",
  "generated-readable-text", "reference-conflict", "crop-risk", "alpha-failure",
  "provenance-missing",
] as const;
export type VisualContinuityDetectionId = (typeof VISUAL_CONTINUITY_DETECTION_IDS)[number];

export interface VisualContinuityTask {
  readonly sequence: number;
  readonly id: string;
  readonly assetId: string;
  readonly operation: VisualContinuityOperation;
  readonly dependencyTaskIds: readonly string[];
  readonly requiredReferenceIds: readonly string[];
  readonly requiredContinuityGroupIds: readonly string[];
  readonly targetStudios: readonly VisualContinuityStudioTarget[];
  readonly output: Readonly<{
    readonly images: 1;
    readonly alphaPolicy: VisualContinuityAlphaPolicy;
    readonly dimensions?: Readonly<{ width: number; height: number }>;
    readonly aspectRatio?: string;
  }>;
  readonly locks: readonly Readonly<{
    readonly category: "identity" | "palette" | "camera" | "lighting" | "material" | "composition" | "map-geometry" | "motion" | "typography";
    readonly strength: VisualContinuityLockStrength;
    readonly rules: readonly string[];
  }>[];
  readonly reviewMetricIds: readonly VisualContinuityMetricId[];
}

export interface VisualContinuitySessionInput {
  readonly schemaVersion: "1.0";
  readonly kind: typeof VISUAL_CONTINUITY_SESSION_KIND;
  readonly sessionId: string;
  readonly revision: string;
  readonly bible: CompiledVisualContinuityBible;
  readonly objective: string;
  readonly operation: VisualContinuityOperation;
  readonly requestedAssetIds: readonly string[];
  readonly targetStudios: readonly VisualContinuityStudioTarget[];
  readonly requestedVariations: readonly string[];
  readonly fixedDecisions: readonly string[];
  readonly prohibitedChanges: readonly string[];
  readonly maximumAttemptsPerTask: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly metadata?: unknown;
}

export interface CompiledVisualContinuitySession extends Omit<VisualContinuitySessionInput, "bible"> {
  readonly protocolVersion: typeof VISUAL_CONTINUITY_PROTOCOL_VERSION;
  readonly bibleId: string;
  readonly bibleRevision: string;
  readonly bibleSha256: string;
  readonly tasks: readonly VisualContinuityTask[];
  readonly workspace: Readonly<{
    readonly root: string;
    readonly sessionPath: string;
    readonly statePath: string;
    readonly packetsRoot: string;
    readonly candidatesRoot: string;
    readonly reviewsRoot: string;
    readonly handoffsRoot: string;
  }>;
  readonly authority: Readonly<{
    readonly providerExecution: false;
    readonly imageMutation: false;
    readonly creativeApproval: false;
    readonly repositoryMutation: false;
    readonly gitCommit: false;
    readonly gitPush: false;
    readonly publication: false;
  }>;
  readonly sessionSha256: string;
}

export interface VisualContinuityMetricEvidence {
  readonly metricId: VisualContinuityMetricId;
  readonly score: number;
  readonly evidenceSha256: string;
  readonly note: string;
}

export interface VisualContinuityDetectionEvidence {
  readonly detectionId: VisualContinuityDetectionId;
  readonly evidenceSha256: string;
  readonly note: string;
}

export interface VisualContinuityReviewInput {
  readonly schemaVersion: "1.0";
  readonly kind: typeof VISUAL_CONTINUITY_REVIEW_KIND;
  readonly stateSha256: string;
  readonly packetSha256: string;
  readonly taskId: string;
  readonly candidate: Readonly<{
    readonly candidateId: string;
    readonly artifactSha256: string;
    readonly provenanceSha256: string;
    readonly providerId: string;
    readonly modelId: string;
  }>;
  readonly evaluator: string;
  readonly evaluatedAt: string;
  readonly metrics: readonly VisualContinuityMetricEvidence[];
  readonly detections: readonly VisualContinuityDetectionEvidence[];
  readonly visualReviewNotes: readonly string[];
}

export interface VisualContinuityReviewRecord extends VisualContinuityReviewInput {
  readonly protocolVersion: typeof VISUAL_CONTINUITY_PROTOCOL_VERSION;
  readonly attemptNumber: number;
  readonly decision: VisualContinuityDecision;
  readonly weightedScore: number;
  readonly failedMetricIds: readonly VisualContinuityMetricId[];
  readonly repairDirectives: readonly string[];
  readonly acceptedArtifactSha256?: string;
  readonly reviewSha256: string;
}

export interface VisualContinuityTaskState {
  readonly taskId: string;
  readonly assetId: string;
  readonly status: VisualContinuityTaskStatus;
  readonly attemptCount: number;
  readonly maximumAttempts: number;
  readonly latestReviewSha256?: string;
  readonly acceptedArtifactSha256?: string;
}

export interface VisualContinuityState {
  readonly schemaVersion: "1.0";
  readonly kind: typeof VISUAL_CONTINUITY_STATE_KIND;
  readonly protocolVersion: typeof VISUAL_CONTINUITY_PROTOCOL_VERSION;
  readonly sessionSha256: string;
  readonly taskStates: readonly VisualContinuityTaskState[];
  readonly reviews: readonly VisualContinuityReviewRecord[];
  readonly totals: Readonly<{
    readonly queued: number;
    readonly revisionRequired: number;
    readonly accepted: number;
    readonly rejected: number;
    readonly attempts: number;
  }>;
  readonly complete: boolean;
  readonly stateSha256: string;
}

export interface VisualContinuityWorkPacket {
  readonly schemaVersion: "1.0";
  readonly kind: typeof VISUAL_CONTINUITY_PACKET_KIND;
  readonly protocolVersion: typeof VISUAL_CONTINUITY_PROTOCOL_VERSION;
  readonly sessionSha256: string;
  readonly stateSha256: string;
  readonly taskId: string;
  readonly assetId: string;
  readonly attemptNumber: number;
  readonly mode: "create" | "revise";
  readonly prompt: string;
  readonly negativePrompt: string;
  readonly requiredReferences: readonly Readonly<{
    readonly referenceId: string;
    readonly role: VisualContinuityReferenceRole;
    readonly uri: string;
    readonly sha256: string;
    readonly required: true;
  }>[];
  readonly compareAgainstArtifactSha256s: readonly string[];
  readonly output: VisualContinuityTask["output"];
  readonly reviewMetricIds: readonly VisualContinuityMetricId[];
  readonly blockingDetectionIds: readonly VisualContinuityDetectionId[];
  readonly authority: Readonly<{
    readonly providerExecution: false;
    readonly imageMutation: false;
    readonly automaticApproval: false;
    readonly repositoryMutation: false;
  }>;
  readonly packetSha256: string;
}

export interface VisualContinuityStudioHandoffInput {
  readonly schemaVersion: "1.0";
  readonly kind: typeof VISUAL_CONTINUITY_HANDOFF_KIND;
  readonly bible: CompiledVisualContinuityBible;
  readonly session: CompiledVisualContinuitySession;
  readonly state: VisualContinuityState;
  readonly targetStudio: VisualContinuityStudioTarget;
  readonly targetProtocolVersion: string;
  readonly requestedAssetIds?: readonly string[];
  readonly deliveredBy: string;
  readonly deliveredAt: string;
  readonly metadata?: unknown;
}

export interface VisualContinuityStudioHandoff {
  readonly schemaVersion: "1.0";
  readonly kind: typeof VISUAL_CONTINUITY_HANDOFF_KIND;
  readonly protocolVersion: typeof VISUAL_CONTINUITY_PROTOCOL_VERSION;
  readonly targetStudio: VisualContinuityStudioTarget;
  readonly targetProtocolVersion: string;
  readonly bibleSha256: string;
  readonly sessionSha256: string;
  readonly stateSha256: string;
  readonly assets: readonly Readonly<{
    readonly assetId: string;
    readonly kind: VisualContinuityAssetKind;
    readonly acceptedArtifactSha256: string;
    readonly continuityGroupIds: readonly string[];
    readonly referenceIds: readonly string[];
    readonly paletteId: string;
    readonly cameraProfileId?: string;
    readonly lightingProfileId?: string;
    readonly materialIds: readonly string[];
    readonly targetRequirements: readonly string[];
  }>[];
  readonly sharedLocks: Readonly<{
    readonly directionSha256: string;
    readonly paletteSha256: string;
    readonly referenceBankSha256: string;
    readonly antiGenericRules: readonly string[];
    readonly forbiddenTraits: readonly string[];
  }>;
  readonly targetContract: Readonly<{
    readonly requiredInputs: readonly string[];
    readonly preserve: readonly string[];
    readonly validate: readonly string[];
    readonly outputs: readonly string[];
  }>;
  readonly deliveredBy: string;
  readonly deliveredAt: string;
  readonly authority: Readonly<{
    readonly targetExecution: false;
    readonly assetMutation: false;
    readonly repositoryMutation: false;
    readonly runtimeActivation: false;
    readonly publication: false;
  }>;
  readonly handoffSha256: string;
}
