import type {
  CanonicalInstancePolicy,
  SpriteContinuityLock,
  SpriteFrameRole,
  SpriteLayerExportPolicy,
  SpriteLayerFramePolicy,
  SpriteLayerRole,
  SpriteLayerTreatment,
  SpriteProductionMethod,
} from "./constants.js";
import type { Dimensions, Point } from "./models.js";

export interface SpriteLayerSpec {
  readonly id: string;
  readonly role: SpriteLayerRole;
  readonly treatment: SpriteLayerTreatment;
  readonly parentId?: string;
  readonly zIndex?: number;
  readonly framePolicy?: SpriteLayerFramePolicy;
  readonly exportPolicy?: SpriteLayerExportPolicy;
  readonly required?: boolean;
  readonly interchangeable?: boolean;
  readonly allowEmpty?: boolean;
  readonly occludes?: readonly string[];
  readonly reason: string;
  readonly notes?: readonly string[];
}

export interface SpriteShotSpec {
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  readonly safePadding?: number;
  readonly backgroundPolicy?: "transparent" | "opaque-source" | "declared-environment";
  readonly allowCrop?: boolean;
  readonly shadowPolicy?: "none" | "baked" | "separate";
}

export interface SpriteGenerationSpec {
  readonly identityReferenceWeight?: number;
  readonly structureReferenceWeight?: number;
  readonly previousFrameWeight?: number;
  readonly nextFrameWeight?: number;
  readonly seedPolicy?: "family-derived" | "fixed-family";
  readonly requestUnit?: "single-frame" | "single-layer";
  readonly allowIndependentTextOnlyFrames?: false;
  readonly structuralControls?: readonly ("pose-map" | "silhouette-mask" | "edge-map" | "depth-map" | "layout-mask")[];
}

export interface SpriteSourceSpec {
  readonly editableSource?: "aseprite" | "ora" | "psd";
  readonly retainIndividualFrames?: boolean;
  readonly retainLayerFrames?: boolean;
  readonly retainPackedDerivative?: boolean;
  readonly retainLinkedCels?: boolean;
}

export interface SpriteContinuitySpec {
  /** Omit for a self-canonical identity master. */
  readonly canonicalAssetId?: string;
  readonly canonicalInstancePolicy?: CanonicalInstancePolicy;
  readonly productionMethod?: SpriteProductionMethod;
  readonly layers?: readonly SpriteLayerSpec[];
  readonly shot?: SpriteShotSpec;
  readonly continuityLocks?: readonly SpriteContinuityLock[];
  readonly allowedChanges?: readonly string[];
  readonly generation?: SpriteGenerationSpec;
  readonly source?: SpriteSourceSpec;
}

export interface SpriteLayerPlan {
  readonly id: string;
  readonly role: SpriteLayerRole;
  readonly treatment: SpriteLayerTreatment;
  readonly parentId?: string;
  readonly zIndex: number;
  readonly framePolicy: SpriteLayerFramePolicy;
  readonly exportPolicy: SpriteLayerExportPolicy;
  readonly required: boolean;
  readonly interchangeable: boolean;
  readonly allowEmpty: boolean;
  readonly occludes: readonly string[];
  readonly reason: string;
  readonly notes: readonly string[];
}

export interface SpriteShotContract {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly safePadding: number;
  readonly backgroundPolicy: "transparent" | "opaque-source" | "declared-environment";
  readonly allowCrop: boolean;
  readonly shadowPolicy: "none" | "baked" | "separate";
}

export interface SpriteGenerationContract {
  readonly identityReferenceWeight: number;
  readonly structureReferenceWeight: number;
  readonly previousFrameWeight: number;
  readonly nextFrameWeight: number;
  readonly seedPolicy: "family-derived" | "fixed-family";
  readonly requestUnit: "single-frame" | "single-layer";
  readonly allowIndependentTextOnlyFrames: false;
  readonly structuralControls: readonly ("pose-map" | "silhouette-mask" | "edge-map" | "depth-map" | "layout-mask")[];
}

export interface SpriteSourceContract {
  readonly editableSource: "aseprite" | "ora" | "psd";
  readonly retainIndividualFrames: true;
  readonly retainLayerFrames: boolean;
  readonly retainPackedDerivative: true;
  readonly retainLinkedCels: boolean;
}

export interface SpritePackingPolicy {
  readonly padding: number;
  readonly extrusion: number;
  readonly allowRotation: boolean;
  readonly trimFrames: boolean;
  readonly preservePivot: true;
}

export interface SpriteRepairPolicy {
  readonly preferSmallestScope: true;
  readonly neverLowerThresholds: true;
  readonly maximumFrameRetries: number;
  readonly maximumLayerRetries: number;
  readonly escalationReasons: readonly string[];
}

export interface SpriteFrameBlueprint {
  readonly id: string;
  readonly globalFrameIndex: number;
  readonly direction: string;
  readonly directionIndex: number;
  readonly frameIndex: number;
  readonly role: SpriteFrameRole;
  readonly durationMs: number;
  readonly godotRelativeDuration: number;
  readonly pivot: Point;
  readonly baseline?: number;
  readonly identityReferenceId?: string;
  readonly directionReferenceId: string;
  readonly previousKeyPoseId?: string;
  readonly nextKeyPoseId?: string;
  readonly previousApprovedFrameId?: string;
  readonly nextApprovedFrameId?: string;
  readonly layerIds: readonly string[];
  readonly familySeed: string;
  readonly frameSeed: string;
  readonly structuralControls: readonly string[];
}

export interface SpriteContinuityBlueprint {
  readonly schemaVersion: "1.0";
  readonly id: string;
  readonly assetId: string;
  readonly assetInstanceId: string;
  readonly familyId: string;
  readonly canonicalAssetId: string;
  readonly canonicalInstanceId: string;
  readonly isCanonicalMaster: boolean;
  readonly productionMethod: SpriteProductionMethod;
  readonly canvas: Dimensions;
  readonly pivot: Point;
  readonly baseline?: number;
  readonly directions: readonly string[];
  readonly framesPerDirection: number;
  readonly totalFrames: number;
  readonly frameOrder: "direction-major" | "frame-major";
  readonly layers: readonly SpriteLayerPlan[];
  readonly shot: SpriteShotContract;
  readonly continuityLocks: readonly SpriteContinuityLock[];
  readonly allowedChanges: readonly string[];
  readonly generation: SpriteGenerationContract;
  readonly source: SpriteSourceContract;
  readonly packing: SpritePackingPolicy;
  readonly repairPolicy: SpriteRepairPolicy;
  readonly frames: readonly SpriteFrameBlueprint[];
}
