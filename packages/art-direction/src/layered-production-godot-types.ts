import type { CompiledLayeredAssemblyManifest } from "./layered-production-assembly-types.js";
import type { LayeredProductionLayerRole } from "./layered-production-types.js";

export const LAYERED_GODOT_PROTOCOL_VERSION = "2026-08-11.1" as const;
export const LAYERED_GODOT_REQUEST_KIND =
  "evavo.layered-production.godot-integration-request" as const;
export const LAYERED_GODOT_PLAN_KIND =
  "evavo.layered-production.godot-integration-plan" as const;

export type LayeredGodotRenderer =
  | "gl_compatibility"
  | "mobile"
  | "forward_plus";
export type LayeredGodotCameraMode =
  | "overview"
  | "journey-follow"
  | "destination-close";
export type LayeredGodotTravelUnit = "turn" | "tick" | "step";
export type LayeredGodotResourceKind =
  | "scene-draft"
  | "route-graph"
  | "placements"
  | "animations"
  | "cameras"
  | "import-policy"
  | "integration-manifest";
export type LayeredGodotNodeType =
  | "Node2D"
  | "Sprite2D"
  | "AnimatedSprite2D"
  | "Camera2D"
  | "Marker2D";

export interface LayeredGodotIntegrationRequestInput {
  readonly schemaVersion: "1.0";
  readonly kind: typeof LAYERED_GODOT_REQUEST_KIND;
  readonly integrationId: string;
  readonly revision: string;
  readonly assemblyId: string;
  readonly target: Readonly<{
    readonly engine: "Godot";
    readonly engineVersion: "4.6.2";
    readonly renderer: LayeredGodotRenderer;
    readonly runtimeRoot: string;
    readonly rootNodeName: string;
    readonly rootNodeType: "Node2D";
  }>;
  readonly pixelPolicy: Readonly<{
    readonly textureFilter: "nearest";
    readonly textureRepeat: "disabled";
    readonly mipmaps: false;
    readonly compression: "lossless";
    readonly snapTransformsToPixel: true;
    readonly snapVerticesToPixel: false;
    readonly centeredSprites: false;
    readonly integerPositions: true;
  }>;
  readonly runtime: Readonly<{
    readonly rootScriptPath: string;
    readonly routeControllerScriptPath: string;
    readonly cameraControllerScriptPath: string;
    readonly destinationTriggerScriptPath: string;
    readonly actorControllerScriptPath: string;
    readonly actorPlacementId: string;
    readonly defaultCameraMode: LayeredGodotCameraMode;
    readonly routeTravelUnit: LayeredGodotTravelUnit;
  }>;
  readonly outputs: Readonly<{
    readonly scenePath: string;
    readonly integrationManifestPath: string;
    readonly routeResourcePath: string;
    readonly placementResourcePath: string;
    readonly animationResourcePath: string;
    readonly cameraResourcePath: string;
    readonly importPolicyPath: string;
  }>;
  readonly metadata?: unknown;
}

export interface CompiledLayeredGodotExternalResource {
  readonly id: string;
  readonly type: "Script" | "Texture2D";
  readonly path: string;
  readonly sourceUnitId?: string;
  readonly sourceSha256?: string;
}

export interface CompiledLayeredGodotAnimationResource {
  readonly id: string;
  readonly animationSetId: string;
  readonly layerId: string;
  readonly layerRole: LayeredProductionLayerRole;
  readonly clips: readonly Readonly<{
    readonly clipId: string;
    readonly framesPerSecond: number;
    readonly loop: boolean;
    readonly frames: readonly Readonly<{
      readonly frameNumber: number;
      readonly unitId: string;
      readonly textureResourceId: string;
      readonly targetPath: string;
      readonly sourceSha256: string;
    }>[];
  }>[];
}

export interface CompiledLayeredGodotNode {
  readonly path: string;
  readonly name: string;
  readonly type: LayeredGodotNodeType;
  readonly parent?: string;
  readonly groups: readonly string[];
  readonly position?: Readonly<{ x: number; y: number }>;
  readonly visualOffset?: Readonly<{ x: number; y: number }>;
  readonly zIndex?: number;
  readonly ySortEnabled?: boolean;
  readonly textureResourceId?: string;
  readonly spriteFramesResourceId?: string;
  readonly scriptResourceId?: string;
  readonly placementId?: string;
  readonly routeNodeId?: string;
  readonly destinationId?: string;
  readonly cameraMode?: LayeredGodotCameraMode;
  readonly layerId?: string;
  readonly layerRole?: LayeredProductionLayerRole;
  readonly routeKind?: "path" | "junction" | "destination" | "transition";
  readonly interactionId?: string;
  readonly targetScenePath?: string;
  readonly occlusionGroupId?: string;
  readonly dataResourcePath?: string;
}

export interface CompiledLayeredGodotResourceDraft {
  readonly kind: LayeredGodotResourceKind;
  readonly path: string;
  readonly mediaType: "text/plain" | "application/json";
  readonly sha256: string;
  readonly bytes: number;
  readonly content: string;
}

export interface CompiledLayeredGodotWriteIntent {
  readonly operation: "create-or-replace";
  readonly path: string;
  readonly mediaType: CompiledLayeredGodotResourceDraft["mediaType"];
  readonly sha256: string;
  readonly bytes: number;
  readonly content: string;
  readonly requiresExplicitRepositoryWriter: true;
  readonly expectedRepository: string;
}

export interface CompiledLayeredGodotIntegrationPlan {
  readonly schemaVersion: "1.0";
  readonly kind: typeof LAYERED_GODOT_PLAN_KIND;
  readonly protocolVersion: typeof LAYERED_GODOT_PROTOCOL_VERSION;
  readonly integrationId: string;
  readonly revision: string;
  readonly requestSha256: string;
  readonly integrationSha256: string;
  readonly productionPlan: Readonly<{
    readonly planId: string;
    readonly planSha256: string;
    readonly targetRepository: string;
    readonly runtimeRoot: string;
    readonly engine: string;
    readonly engineVersion: string;
  }>;
  readonly assembly: Readonly<{
    readonly assemblyId: string;
    readonly manifestSha256: string;
    readonly scope: CompiledLayeredAssemblyManifest["scope"];
    readonly runtimeReady: boolean;
    readonly candidateOnly: boolean;
  }>;
  readonly target: LayeredGodotIntegrationRequestInput["target"];
  readonly pixelPolicy: LayeredGodotIntegrationRequestInput["pixelPolicy"];
  readonly runtime: LayeredGodotIntegrationRequestInput["runtime"];
  readonly outputs: LayeredGodotIntegrationRequestInput["outputs"];
  readonly externalResources: readonly CompiledLayeredGodotExternalResource[];
  readonly animationResources: readonly CompiledLayeredGodotAnimationResource[];
  readonly scene: Readonly<{
    readonly path: string;
    readonly rootNodeName: string;
    readonly nodes: readonly CompiledLayeredGodotNode[];
    readonly tscnSha256: string;
    readonly tscnBytes: number;
    readonly tscnDraft: string;
  }>;
  readonly resources: readonly CompiledLayeredGodotResourceDraft[];
  readonly writeIntents: readonly CompiledLayeredGodotWriteIntent[];
  readonly readiness: Readonly<{
    readonly handoffReady: boolean;
    readonly reviewOnly: boolean;
    readonly requiresExplicitRepositoryWriter: true;
    readonly runtimeActivationRequired: true;
    readonly blockers: readonly string[];
  }>;
  readonly totals: Readonly<{
    readonly externalResources: number;
    readonly textureResources: number;
    readonly scriptResources: number;
    readonly animationResources: number;
    readonly sceneNodes: number;
    readonly placementNodes: number;
    readonly routeMarkerNodes: number;
    readonly destinationNodes: number;
    readonly cameraNodes: number;
    readonly resourceDrafts: number;
    readonly writeIntents: number;
  }>;
  readonly qualityGates: readonly string[];
  readonly authority: Readonly<{
    readonly planningOnly: true;
    readonly artifactRead: false;
    readonly fileWrite: false;
    readonly targetRepositoryMutation: false;
    readonly runtimeActivation: false;
    readonly deployment: false;
    readonly gitCommit: false;
    readonly gitPush: false;
    readonly publication: false;
  }>;
  readonly metadata?: unknown;
}
