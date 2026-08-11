import type {
  LayeredProductionAlphaPolicy,
  LayeredProductionLayerRole,
} from "./layered-production-types.js";

export const LAYERED_ASSEMBLY_PROTOCOL_VERSION = "2026-08-11.1" as const;
export const LAYERED_ASSEMBLY_REQUEST_KIND =
  "evavo.layered-production.assembly-request" as const;
export const LAYERED_ASSEMBLY_MANIFEST_KIND =
  "evavo.layered-production.assembly-manifest" as const;

export type LayeredAssemblyScope = "style-proof-review" | "runtime-candidate";
export type LayeredAssemblySourceStatus = "candidate" | "approved";
export type LayeredAssemblyPlacementMode =
  | "baked"
  | "static"
  | "dynamic"
  | "overlay";
export type LayeredAssemblySourceReference =
  | Readonly<{ kind: "unit"; id: string }>
  | Readonly<{ kind: "animation-set"; id: string }>;
export type LayeredAssemblyAnimationCompleteness =
  | "proof-partial"
  | "complete";
export type LayeredAssemblyRouteNodeKind =
  | "path"
  | "junction"
  | "destination"
  | "transition";
export type LayeredAssemblyEdgeDirection = "bidirectional" | "one-way";

export interface LayeredAssemblyRequestInput {
  readonly schemaVersion: "1.0";
  readonly kind: typeof LAYERED_ASSEMBLY_REQUEST_KIND;
  readonly assemblyId: string;
  readonly revision: string;
  readonly scope: LayeredAssemblyScope;
  readonly planId: string;
  readonly district: Readonly<{
    readonly id: string;
    readonly title: string;
    readonly worldOrigin: Readonly<{ x: number; y: number }>;
    readonly dimensions: Readonly<{ width: number; height: number }>;
  }>;
  readonly camera: Readonly<{
    readonly overview: Readonly<{
      readonly zoom: number;
      readonly bounds: Readonly<{
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
      }>;
    }>;
    readonly journeyFollow: Readonly<{
      readonly zoom: number;
      readonly followLayerRoles: readonly LayeredProductionLayerRole[];
      readonly deadZone: Readonly<{ width: number; height: number }>;
      readonly lookAhead: Readonly<{ x: number; y: number }>;
    }>;
    readonly destinationClose: Readonly<{
      readonly zoom: number;
      readonly transitionFrames: number;
    }>;
  }>;
  readonly sources: readonly LayeredAssemblySourceInput[];
  readonly animationSets?: readonly LayeredAssemblyAnimationSetInput[];
  readonly placements: readonly LayeredAssemblyPlacementInput[];
  readonly routeGraph: Readonly<{
    readonly startNodeId: string;
    readonly nodes: readonly LayeredAssemblyRouteNodeInput[];
    readonly edges: readonly LayeredAssemblyRouteEdgeInput[];
    readonly destinations: readonly LayeredAssemblyDestinationInput[];
  }>;
  readonly occlusionGroups?: readonly LayeredAssemblyOcclusionGroupInput[];
  readonly outputs: Readonly<{
    readonly manifestPath: string;
    readonly routeGraphPath: string;
    readonly placementManifestPath: string;
    readonly godotScenePath: string;
    readonly reviewCompositePath: string;
  }>;
  readonly metadata?: unknown;
}

export interface LayeredAssemblySourceInput {
  readonly unitId: string;
  readonly artifactId: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly alpha: LayeredProductionAlphaPolicy;
  readonly status: LayeredAssemblySourceStatus;
  readonly approvalReceiptArtifactId?: string;
  readonly approvalReceiptSha256?: string;
}

export interface LayeredAssemblyAnimationSetInput {
  readonly id: string;
  readonly layerId: string;
  readonly continuityKey: string;
  readonly completeness: LayeredAssemblyAnimationCompleteness;
  readonly unitIds: readonly string[];
}

export interface LayeredAssemblyPlacementInput {
  readonly id: string;
  readonly source: LayeredAssemblySourceReference;
  readonly layerId: string;
  readonly position: Readonly<{ x: number; y: number }>;
  readonly mode: LayeredAssemblyPlacementMode;
  readonly visible: true;
  readonly routeNodeId?: string;
  readonly occlusionGroupId?: string;
  readonly instanceGroup?: string;
}

export interface LayeredAssemblyRouteNodeInput {
  readonly id: string;
  readonly position: Readonly<{ x: number; y: number }>;
  readonly kind: LayeredAssemblyRouteNodeKind;
  readonly destinationId?: string;
}

export interface LayeredAssemblyRouteEdgeInput {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly direction: LayeredAssemblyEdgeDirection;
  readonly travelCost: number;
}

export interface LayeredAssemblyDestinationInput {
  readonly id: string;
  readonly label: string;
  readonly nodeId: string;
  readonly entrance: Readonly<{ x: number; y: number }>;
  readonly interactionId: string;
  readonly targetScenePath: string;
  readonly structurePlacementId?: string;
}

export interface LayeredAssemblyOcclusionGroupInput {
  readonly id: string;
  readonly foregroundPlacementId: string;
  readonly baselineY: number;
  readonly occludedRoles: readonly LayeredProductionLayerRole[];
}

export interface CompiledLayeredAssemblyManifest {
  readonly schemaVersion: "1.0";
  readonly kind: typeof LAYERED_ASSEMBLY_MANIFEST_KIND;
  readonly protocolVersion: typeof LAYERED_ASSEMBLY_PROTOCOL_VERSION;
  readonly assemblyId: string;
  readonly revision: string;
  readonly scope: LayeredAssemblyScope;
  readonly requestSha256: string;
  readonly manifestSha256: string;
  readonly plan: Readonly<{
    readonly planId: string;
    readonly planSha256: string;
    readonly styleFingerprintSha256: string;
    readonly styleProofStatus: "approval-required" | "approved";
  }>;
  readonly district: LayeredAssemblyRequestInput["district"];
  readonly camera: LayeredAssemblyRequestInput["camera"];
  readonly sources: readonly Readonly<{
    readonly unitId: string;
    readonly layerId: string;
    readonly layerRole: LayeredProductionLayerRole;
    readonly artifactId: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly width: number;
    readonly height: number;
    readonly alpha: LayeredProductionAlphaPolicy;
    readonly status: LayeredAssemblySourceStatus;
    readonly approvalReceiptArtifactId?: string;
    readonly approvalReceiptSha256?: string;
  }>[];
  readonly animationSets: readonly Readonly<{
    readonly id: string;
    readonly layerId: string;
    readonly layerRole: LayeredProductionLayerRole;
    readonly continuityKey: string;
    readonly completeness: LayeredAssemblyAnimationCompleteness;
    readonly dimensions: Readonly<{ width: number; height: number }>;
    readonly pivot?: Readonly<{ x: number; y: number }>;
    readonly ySortOrigin?: Readonly<{ x: number; y: number }>;
    readonly clips: readonly Readonly<{
      readonly clipId: string;
      readonly frameCount: number;
      readonly framesPerSecond: number;
      readonly loop: boolean;
      readonly suppliedFrameNumbers: readonly number[];
      readonly unitIds: readonly string[];
      readonly complete: boolean;
    }>[];
    readonly unitIds: readonly string[];
  }>[];
  readonly layers: readonly Readonly<{
    readonly id: string;
    readonly role: LayeredProductionLayerRole;
    readonly zOrder: number;
    readonly alpha: LayeredProductionAlphaPolicy;
    readonly assemblyMode: string;
    readonly ySortMode: string;
    readonly placements: readonly CompiledLayeredAssemblyPlacement[];
  }>[];
  readonly routeGraph: Readonly<{
    readonly startNodeId: string;
    readonly nodes: readonly LayeredAssemblyRouteNodeInput[];
    readonly edges: readonly LayeredAssemblyRouteEdgeInput[];
    readonly destinations: readonly LayeredAssemblyDestinationInput[];
    readonly reachableNodeCount: number;
    readonly totalTravelCost: number;
  }>;
  readonly occlusionGroups: readonly LayeredAssemblyOcclusionGroupInput[];
  readonly outputs: LayeredAssemblyRequestInput["outputs"];
  readonly readiness: Readonly<{
    readonly runtimeReady: boolean;
    readonly candidateOnly: boolean;
    readonly reviewCompositeIsRuntimeSource: false;
    readonly blockers: readonly string[];
  }>;
  readonly totals: Readonly<{
    readonly sources: number;
    readonly approvedSources: number;
    readonly candidateSources: number;
    readonly animationSets: number;
    readonly placements: number;
    readonly dynamicPlacements: number;
    readonly routeNodes: number;
    readonly routeEdges: number;
    readonly destinations: number;
    readonly occlusionGroups: number;
  }>;
  readonly qualityGates: readonly string[];
  readonly authority: Readonly<{
    readonly planningOnly: true;
    readonly providerExecution: false;
    readonly creativeApproval: false;
    readonly imageMutation: false;
    readonly automaticAssembly: false;
    readonly automaticPromotion: false;
    readonly targetRepositoryMutation: false;
    readonly gitCommit: false;
    readonly gitPush: false;
    readonly publication: false;
  }>;
  readonly metadata?: unknown;
}

export interface CompiledLayeredAssemblyPlacement {
  readonly id: string;
  readonly source: LayeredAssemblySourceReference;
  readonly sourceUnitIds: readonly string[];
  readonly sourceArtifactIds: readonly string[];
  readonly layerId: string;
  readonly layerRole: LayeredProductionLayerRole;
  readonly zOrder: number;
  readonly position: Readonly<{ x: number; y: number }>;
  readonly worldPosition: Readonly<{ x: number; y: number }>;
  readonly dimensions: Readonly<{ width: number; height: number }>;
  readonly bounds: Readonly<{
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }>;
  readonly worldBounds: Readonly<{
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }>;
  readonly pivot?: Readonly<{ x: number; y: number }>;
  readonly ySortOrigin?: Readonly<{ x: number; y: number }>;
  readonly sortY?: number;
  readonly mode: LayeredAssemblyPlacementMode;
  readonly visible: true;
  readonly routeNodeId?: string;
  readonly occlusionGroupId?: string;
  readonly instanceGroup?: string;
}
