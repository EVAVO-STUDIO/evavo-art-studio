export const VISUAL_CONTINUITY_PROTOCOL_VERSION = "2026-09-19.1" as const;
export const VISUAL_CONTINUITY_BIBLE_KIND = "evavo.visual-continuity.bible" as const;
export const VISUAL_CONTINUITY_SESSION_KIND = "evavo.visual-continuity.session" as const;
export const VISUAL_CONTINUITY_PACKET_KIND = "evavo.visual-continuity.packet" as const;
export const VISUAL_CONTINUITY_ATTEMPT_KIND = "evavo.visual-continuity.attempt" as const;
export const VISUAL_CONTINUITY_HANDOFF_KIND = "evavo.visual-continuity.handoff" as const;

export const VISUAL_STUDIO_TARGETS = [
  "art-studio",
  "video-studio",
  "animation-studio",
  "3d-studio",
  "texture-studio",
  "godot-runtime",
  "web-runtime",
  "print",
] as const;
export type VisualStudioTarget = (typeof VISUAL_STUDIO_TARGETS)[number];

export const VISUAL_ASSET_TYPES = [
  "character",
  "creature",
  "prop",
  "vehicle",
  "environment",
  "interior",
  "exterior",
  "world-map",
  "regional-map",
  "local-map",
  "tactical-map",
  "minimap",
  "location-card",
  "sprite-frame",
  "sprite-animation",
  "storyboard-frame",
  "cinematic-keyframe",
  "ui",
  "icon",
  "logo",
  "texture",
  "material-reference",
  "model-sheet",
  "orthographic-view",
  "turntable-frame",
  "matte-painting",
  "decal",
  "particle",
  "typography",
  "diagram",
] as const;
export type VisualAssetType = (typeof VISUAL_ASSET_TYPES)[number];

export const VISUAL_REFERENCE_ROLES = [
  "identity-master",
  "style-master",
  "palette-master",
  "camera-master",
  "lighting-master",
  "material-master",
  "scale-master",
  "map-symbol-master",
  "environment-master",
  "prop-master",
  "pose-master",
  "previous-frame",
  "next-frame",
  "approved-exception",
  "negative-reference",
] as const;
export type VisualReferenceRole = (typeof VISUAL_REFERENCE_ROLES)[number];

export const VISUAL_LOCK_KINDS = [
  "identity",
  "silhouette",
  "proportions",
  "anatomy",
  "costume",
  "accessories",
  "handedness",
  "equipment",
  "material",
  "palette",
  "camera",
  "lens",
  "composition",
  "scale",
  "lighting",
  "time-of-day",
  "weather",
  "geography",
  "architecture",
  "typography",
  "line-language",
  "pixel-density",
  "texture-density",
  "anchor",
  "pivot",
  "ground-contact",
  "animation-timing",
  "motion-arc",
  "map-projection",
  "map-symbol",
  "route-grammar",
  "label-grammar",
  "ui-safe-area",
] as const;
export type VisualLockKind = (typeof VISUAL_LOCK_KINDS)[number];

export const VISUAL_CONTINUITY_METRIC_IDS = [
  "identity",
  "style",
  "palette",
  "silhouette",
  "proportions",
  "camera",
  "composition",
  "lighting",
  "material",
  "geography",
  "architecture",
  "typography",
  "map-grammar",
  "anchor",
  "temporal",
  "neighbor-continuity",
  "loop-closure",
  "non-generic",
  "output-readiness",
] as const;
export type VisualContinuityMetricId = (typeof VISUAL_CONTINUITY_METRIC_IDS)[number];

export const VISUAL_CONTINUITY_DETECTIONS = [
  "identity-drift",
  "palette-drift",
  "camera-drift",
  "geometry-drift",
  "map-geography-drift",
  "symbol-drift",
  "lighting-drift",
  "costume-drift",
  "equipment-side-swap",
  "generic-ai-treatment",
  "random-detail",
  "duplicate-frame",
  "frozen-animation",
  "text-corruption",
  "contact-sheet-output",
  "unexpected-object",
  "crop-risk",
  "alpha-failure",
  "inconsistent-line-weight",
  "material-drift",
  "scale-drift",
] as const;
export type VisualContinuityDetection = (typeof VISUAL_CONTINUITY_DETECTIONS)[number];

export interface VisualContinuityReferenceInput {
  readonly id: string;
  readonly role: VisualReferenceRole;
  readonly uri: string;
  readonly sha256: string;
  readonly rights: string;
  readonly note: string;
  readonly weight?: number;
  readonly entityIds?: readonly string[];
  readonly locationIds?: readonly string[];
  readonly mapProfileIds?: readonly string[];
}

export interface VisualContinuityColourTokenInput {
  readonly id: string;
  readonly hex: string;
  readonly role: string;
  readonly usage: readonly string[];
  readonly reservedFor?: readonly string[];
  readonly prohibitedFor?: readonly string[];
  readonly pairWith?: readonly string[];
  readonly toleranceDeltaE?: number;
}

export interface VisualContinuityLockInput {
  readonly id: string;
  readonly kind: VisualLockKind;
  readonly description: string;
  readonly severity: "blocking" | "warning";
  readonly appliesToAssetTypes?: readonly VisualAssetType[];
  readonly entityIds?: readonly string[];
  readonly locationIds?: readonly string[];
  readonly mapProfileIds?: readonly string[];
  readonly referenceIds?: readonly string[];
  readonly mayVary?: readonly string[];
  readonly mustNotVary?: readonly string[];
}

export interface VisualContinuityEntityInput {
  readonly id: string;
  readonly kind: "character" | "creature" | "prop" | "vehicle" | "brand";
  readonly name: string;
  readonly canonicalDescription: string;
  readonly distinctiveFeatures: readonly string[];
  readonly silhouetteRules: readonly string[];
  readonly proportionRules: readonly string[];
  readonly materialRules: readonly string[];
  readonly asymmetryRules?: readonly string[];
  readonly costumeOrVariantRules?: readonly string[];
  readonly forbiddenMutations: readonly string[];
  readonly colourTokenIds: readonly string[];
  readonly referenceIds: readonly string[];
  readonly lockIds: readonly string[];
  readonly scale?: Readonly<{
    readonly unit: "pixels" | "centimetres" | "metres" | "relative";
    readonly value: number;
    readonly note: string;
  }>;
}

export interface VisualContinuityLocationInput {
  readonly id: string;
  readonly name: string;
  readonly canonicalDescription: string;
  readonly geographyRules: readonly string[];
  readonly architectureRules: readonly string[];
  readonly materialRules: readonly string[];
  readonly landmarkRules: readonly string[];
  readonly weatherRules: readonly string[];
  readonly timeOfDayRules: readonly string[];
  readonly forbiddenMutations: readonly string[];
  readonly colourTokenIds: readonly string[];
  readonly referenceIds: readonly string[];
  readonly lockIds: readonly string[];
  readonly mapCoordinates?: Readonly<{ x: number; y: number; coordinateSpace: string }>;
}

export interface VisualContinuityMapSymbolInput {
  readonly id: string;
  readonly meaning: string;
  readonly shapeRules: readonly string[];
  readonly colourTokenIds: readonly string[];
  readonly scaleRules: readonly string[];
  readonly referenceIds: readonly string[];
}

export interface VisualContinuityMapProfileInput {
  readonly id: string;
  readonly kind: "world" | "regional" | "local" | "tactical" | "minimap";
  readonly title: string;
  readonly projection: string;
  readonly orientation: string;
  readonly coordinateSpace: string;
  readonly scalePolicy: string;
  readonly terrainLayers: readonly string[];
  readonly routeGrammar: readonly string[];
  readonly labelGrammar: readonly string[];
  readonly safeAreaRules: readonly string[];
  readonly symbolIds: readonly string[];
  readonly colourTokenIds: readonly string[];
  readonly referenceIds: readonly string[];
  readonly lockIds: readonly string[];
  readonly outputSizes: readonly Readonly<{ width: number; height: number; use: string }>[];
}

export interface VisualContinuityShotTemplateInput {
  readonly id: string;
  readonly title: string;
  readonly assetTypes: readonly VisualAssetType[];
  readonly aspectRatio: string;
  readonly camera: Readonly<{
    readonly projection: string;
    readonly lensOrScale: string;
    readonly height: string;
    readonly angle: string;
    readonly movement: "locked" | "bounded" | "free";
  }>;
  readonly compositionRules: readonly string[];
  readonly lightingRules: readonly string[];
  readonly safeAreaRules: readonly string[];
  readonly referenceIds: readonly string[];
  readonly lockIds: readonly string[];
}

export interface VisualContinuityBibleInput {
  readonly schemaVersion: "1.0";
  readonly kind: typeof VISUAL_CONTINUITY_BIBLE_KIND;
  readonly bibleId: string;
  readonly revision: string;
  readonly project: Readonly<{
    readonly projectId: string;
    readonly title: string;
    readonly description: string;
    readonly engine?: string;
    readonly engineVersion?: string;
    readonly targetPlatforms: readonly string[];
    readonly targetStudios: readonly VisualStudioTarget[];
  }>;
  readonly scope: Readonly<{
    readonly assetTypes: readonly VisualAssetType[];
    readonly preserveCrossStudioContinuity: true;
    readonly supportLongRunningSessions: true;
    readonly noHiddenChatState: true;
  }>;
  readonly style: Readonly<{
    readonly title: string;
    readonly intent: string;
    readonly authoredEra: string;
    readonly renderingLanguage: readonly string[];
    readonly lineLanguage: readonly string[];
    readonly valueStructure: readonly string[];
    readonly materialLanguage: readonly string[];
    readonly lightingLanguage: readonly string[];
    readonly compositionLanguage: readonly string[];
    readonly distinctiveMotifs: readonly string[];
    readonly prohibitedGenericTraits: readonly string[];
    readonly prohibitedModernTraits: readonly string[];
  }>;
  readonly colourTokens: readonly VisualContinuityColourTokenInput[];
  readonly references: readonly VisualContinuityReferenceInput[];
  readonly locks: readonly VisualContinuityLockInput[];
  readonly entities: readonly VisualContinuityEntityInput[];
  readonly locations: readonly VisualContinuityLocationInput[];
  readonly mapSymbols: readonly VisualContinuityMapSymbolInput[];
  readonly mapProfiles: readonly VisualContinuityMapProfileInput[];
  readonly shotTemplates: readonly VisualContinuityShotTemplateInput[];
  readonly quality: Readonly<{
    readonly minimumMetricScores: Readonly<Partial<Record<VisualContinuityMetricId, number>>>;
    readonly technicalPassScore: number;
    readonly maximumUnexpectedColourRatio: number;
    readonly maximumAnchorDriftPixels: number;
    readonly maximumGeometryDriftPixels: number;
    readonly maximumSilhouetteAreaDeltaRatio: number;
    readonly blockingDetections: readonly VisualContinuityDetection[];
  }>;
  readonly policy: Readonly<{
    readonly immutableApprovedReferences: true;
    readonly oneBoundedOutputPerWorkItem: true;
    readonly noSilentCanonMutation: true;
    readonly noGenericFallback: true;
    readonly promptIsNotAuthority: true;
    readonly seedIsNotAuthority: true;
    readonly requireFullResolutionReview: true;
    readonly requireEvidenceBeforePromotion: true;
    readonly preserveApprovedExceptions: true;
    readonly requireNeighborReviewForSequences: true;
    readonly requireLoopClosureReview: true;
  }>;
  readonly metadata?: unknown;
}

export interface CompiledVisualContinuityBible extends VisualContinuityBibleInput {
  readonly protocolVersion: typeof VISUAL_CONTINUITY_PROTOCOL_VERSION;
  readonly project: VisualContinuityBibleInput["project"] & Readonly<{
    readonly engine: string;
    readonly engineVersion: string;
  }>;
  readonly indexes: Readonly<{
    readonly colourTokenIds: readonly string[];
    readonly referenceIds: readonly string[];
    readonly lockIds: readonly string[];
    readonly entityIds: readonly string[];
    readonly locationIds: readonly string[];
    readonly mapSymbolIds: readonly string[];
    readonly mapProfileIds: readonly string[];
    readonly shotTemplateIds: readonly string[];
  }>;
  readonly authority: Readonly<{
    readonly providerExecution: false;
    readonly imageMutation: false;
    readonly creativeApproval: false;
    readonly canonMutation: false;
    readonly targetRepositoryMutation: false;
    readonly gitCommit: false;
    readonly gitPush: false;
    readonly publication: false;
  }>;
  readonly bibleSha256: string;
}

export interface VisualContinuityWorkItemInput {
  readonly id: string;
  readonly title: string;
  readonly assetType: VisualAssetType;
  readonly targetStudio: VisualStudioTarget;
  readonly purpose: string;
  readonly output: Readonly<{
    readonly width: number;
    readonly height: number;
    readonly format: "png" | "webp" | "svg" | "json" | "glb" | "exr";
    readonly transparency: "required" | "preferred" | "opaque" | "not-applicable";
  }>;
  readonly dependsOn?: readonly string[];
  readonly entityIds?: readonly string[];
  readonly locationIds?: readonly string[];
  readonly mapProfileIds?: readonly string[];
  readonly shotTemplateId?: string;
  readonly referenceIds?: readonly string[];
  readonly lockIds?: readonly string[];
  readonly preserve: readonly string[];
  readonly mayChange: readonly string[];
  readonly mustNotIntroduce: readonly string[];
  readonly sequence?: Readonly<{
    readonly sequenceId: string;
    readonly frameNumber: number;
    readonly frameCount: number;
    readonly framesPerSecond: number;
    readonly loop: boolean;
    readonly previousWorkItemId?: string;
    readonly nextWorkItemId?: string;
  }>;
  readonly metadata?: unknown;
}

export interface VisualContinuitySessionInput {
  readonly schemaVersion: "1.0";
  readonly kind: typeof VISUAL_CONTINUITY_SESSION_KIND;
  readonly sessionId: string;
  readonly bibleSha256: string;
  readonly objective: string;
  readonly mode: "explore" | "production" | "repair" | "conversion" | "handoff";
  readonly revision: string;
  readonly iteration: Readonly<{
    readonly maximumAttemptsPerItem: number;
    readonly maximumBatchSize: number;
    readonly candidateCountPerAttempt: number;
    readonly repairBeforeNewWork: true;
    readonly failClosed: true;
  }>;
  readonly workItems: readonly VisualContinuityWorkItemInput[];
  readonly metadata?: unknown;
}

export interface VisualContinuityMetricEvidence {
  readonly metricId: VisualContinuityMetricId;
  readonly score: number;
  readonly evidenceSha256: string;
  readonly note?: string;
}

export interface VisualContinuityDetectionEvidence {
  readonly detection: VisualContinuityDetection;
  readonly evidenceSha256: string;
  readonly note?: string;
}

export interface VisualContinuityAcceptedCandidate {
  readonly artifactId: string;
  readonly uri: string;
  readonly sha256: string;
  readonly attemptSha256: string;
  readonly weightedScore: number;
  readonly acceptedAt: string;
  readonly acceptedBy: string;
}

export interface VisualContinuityWorkItemState {
  readonly id: string;
  readonly status: "queued" | "repair-required" | "accepted" | "blocked";
  readonly attemptCount: number;
  readonly latestAttemptSha256?: string;
  readonly acceptedCandidate?: VisualContinuityAcceptedCandidate;
}

export interface VisualContinuityAttemptRecord {
  readonly schemaVersion: "1.0";
  readonly kind: typeof VISUAL_CONTINUITY_ATTEMPT_KIND;
  readonly sessionSha256Before: string;
  readonly packetSha256: string;
  readonly workItemId: string;
  readonly attemptNumber: number;
  readonly candidate: Readonly<{
    readonly artifactId: string;
    readonly uri: string;
    readonly sha256: string;
  }>;
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly metrics: readonly VisualContinuityMetricEvidence[];
  readonly detections: readonly VisualContinuityDetectionEvidence[];
  readonly weightedScore: number;
  readonly failedMetricIds: readonly VisualContinuityMetricId[];
  readonly decision: "accepted" | "repair-required" | "blocked";
  readonly repairDirectives: readonly string[];
  readonly nextPromptPatch: readonly string[];
  readonly attemptSha256: string;
}

export interface CompiledVisualContinuitySession extends VisualContinuitySessionInput {
  readonly protocolVersion: typeof VISUAL_CONTINUITY_PROTOCOL_VERSION;
  readonly bibleId: string;
  readonly workItems: readonly (VisualContinuityWorkItemInput & Readonly<{
    readonly dependsOn: readonly string[];
    readonly entityIds: readonly string[];
    readonly locationIds: readonly string[];
    readonly mapProfileIds: readonly string[];
    readonly referenceIds: readonly string[];
    readonly lockIds: readonly string[];
    readonly requiredMetricIds: readonly VisualContinuityMetricId[];
    readonly blockingDetections: readonly VisualContinuityDetection[];
    readonly contextSha256: string;
  }>)[];
  readonly states: readonly VisualContinuityWorkItemState[];
  readonly attempts: readonly VisualContinuityAttemptRecord[];
  readonly totals: Readonly<{
    readonly items: number;
    readonly queued: number;
    readonly repairRequired: number;
    readonly accepted: number;
    readonly blocked: number;
    readonly attempts: number;
  }>;
  readonly agentContract: Readonly<{
    readonly compatibleClients: readonly ["chatgpt", "claude", "codex"];
    readonly explicitContextEveryPacket: true;
    readonly deterministicResume: true;
    readonly noRelianceOnConversationMemory: true;
    readonly oneBoundedOutputPerWorkItem: true;
    readonly approvalIsExternal: true;
  }>;
  readonly authority: Readonly<{
    readonly providerExecution: false;
    readonly imageMutation: false;
    readonly creativeApproval: false;
    readonly canonMutation: false;
    readonly targetRepositoryMutation: false;
    readonly gitCommit: false;
    readonly gitPush: false;
    readonly publication: false;
  }>;
  readonly sessionSha256: string;
}

export interface VisualContinuityPacketJob {
  readonly workItemId: string;
  readonly attemptNumber: number;
  readonly mode: "generate" | "repair";
  readonly targetStudio: VisualStudioTarget;
  readonly assetType: VisualAssetType;
  readonly brief: Readonly<{
    readonly purpose: string;
    readonly preserve: readonly string[];
    readonly mayChange: readonly string[];
    readonly mustNotIntroduce: readonly string[];
    readonly styleRules: readonly string[];
    readonly colourRules: readonly string[];
    readonly entityRules: readonly string[];
    readonly locationRules: readonly string[];
    readonly mapRules: readonly string[];
    readonly shotRules: readonly string[];
    readonly lockRules: readonly string[];
    readonly repairDirectives: readonly string[];
  }>;
  readonly output: VisualContinuityWorkItemInput["output"];
  readonly references: readonly Readonly<{
    readonly id: string;
    readonly role: VisualReferenceRole;
    readonly uri: string;
    readonly sha256: string;
    readonly required: boolean;
  }>[];
  readonly sequenceContext?: VisualContinuityWorkItemInput["sequence"] & Readonly<{
    readonly previousAcceptedSha256?: string;
    readonly nextAcceptedSha256?: string;
  }>;
  readonly requiredMetricIds: readonly VisualContinuityMetricId[];
  readonly blockingDetections: readonly VisualContinuityDetection[];
  readonly contextSha256: string;
  readonly jobSha256: string;
}

export interface VisualContinuityWorkPacket {
  readonly schemaVersion: "1.0";
  readonly kind: typeof VISUAL_CONTINUITY_PACKET_KIND;
  readonly protocolVersion: typeof VISUAL_CONTINUITY_PROTOCOL_VERSION;
  readonly bibleSha256: string;
  readonly sessionSha256: string;
  readonly status: "jobs-ready" | "complete" | "blocked";
  readonly jobs: readonly VisualContinuityPacketJob[];
  readonly resume: Readonly<{
    readonly token: string;
    readonly instruction: string;
  }>;
  readonly authority: Readonly<{
    readonly providerExecution: false;
    readonly imageMutation: false;
    readonly creativeApproval: false;
    readonly canonMutation: false;
    readonly targetRepositoryMutation: false;
  }>;
  readonly packetSha256: string;
}

export interface VisualContinuityAttemptInput {
  readonly schemaVersion: "1.0";
  readonly packetSha256: string;
  readonly workItemId: string;
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly candidate: Readonly<{
    readonly artifactId: string;
    readonly uri: string;
    readonly sha256: string;
  }>;
  readonly metrics: readonly VisualContinuityMetricEvidence[];
  readonly detections: readonly VisualContinuityDetectionEvidence[];
}

export interface VisualContinuityHandoffInput {
  readonly schemaVersion: "1.0";
  readonly targetStudio: VisualStudioTarget;
  readonly receiverProjectId: string;
  readonly purpose: string;
  readonly workItemIds: readonly string[];
  readonly requestedOutputs: readonly string[];
  readonly notes?: readonly string[];
}

export interface VisualContinuityStudioHandoff {
  readonly schemaVersion: "1.0";
  readonly kind: typeof VISUAL_CONTINUITY_HANDOFF_KIND;
  readonly protocolVersion: typeof VISUAL_CONTINUITY_PROTOCOL_VERSION;
  readonly targetStudio: VisualStudioTarget;
  readonly receiverProjectId: string;
  readonly purpose: string;
  readonly bibleSha256: string;
  readonly sessionSha256: string;
  readonly sources: readonly Readonly<{
    readonly workItemId: string;
    readonly assetType: VisualAssetType;
    readonly artifactId: string;
    readonly uri: string;
    readonly sha256: string;
    readonly contextSha256: string;
  }>[];
  readonly continuity: Readonly<{
    readonly style: VisualContinuityBibleInput["style"];
    readonly colourTokens: readonly VisualContinuityColourTokenInput[];
    readonly references: readonly VisualContinuityReferenceInput[];
    readonly locks: readonly VisualContinuityLockInput[];
    readonly entities: readonly VisualContinuityEntityInput[];
    readonly locations: readonly VisualContinuityLocationInput[];
    readonly mapProfiles: readonly VisualContinuityMapProfileInput[];
    readonly shotTemplates: readonly VisualContinuityShotTemplateInput[];
  }>;
  readonly requestedOutputs: readonly string[];
  readonly receivingChecks: readonly string[];
  readonly notes: readonly string[];
  readonly authority: Readonly<{
    readonly sourceMutation: false;
    readonly canonMutation: false;
    readonly automaticCreativeApproval: false;
    readonly targetRepositoryMutation: false;
    readonly runtimeActivation: false;
    readonly publication: false;
  }>;
  readonly handoffSha256: string;
}
