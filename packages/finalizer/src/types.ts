import type {
  DecodedSpriteFrame,
  NormalizedSpriteFrameQualityExpectations,
  SpriteFrameQualityReport,
  SpriteQualityGateResult,
} from "@evavo/art-quality";

export const SPRITE_FINALIZER_PROTOCOL_VERSION = "2026-08-01.1" as const;

export type SpriteFinalizationDisposition =
  | "ready"
  | "deterministic-repair"
  | "provider-repair"
  | "manual-review"
  | "blocked";

export type SpriteFinalizationActionKind =
  | "transparent-rgb-normalize"
  | "matte-edge-decontaminate"
  | "reextract-matte"
  | "regenerate-with-padding"
  | "regenerate-with-real-alpha"
  | "reencode-contract-output"
  | "manual-review"
  | "abort";

export interface SpriteFinalizationAction {
  readonly kind: SpriteFinalizationActionKind;
  readonly gateIds: readonly string[];
  readonly automatic: boolean;
  readonly description: string;
  readonly preserve: readonly string[];
}

export interface SpriteFinalizationAssessment {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof SPRITE_FINALIZER_PROTOCOL_VERSION;
  readonly disposition: SpriteFinalizationDisposition;
  readonly passed: boolean;
  readonly failedBlockingGateIds: readonly string[];
  readonly repairableGateIds: readonly string[];
  readonly nonRepairableGateIds: readonly string[];
  readonly actions: readonly SpriteFinalizationAction[];
}

export interface SpriteFinalizationRepairOptions {
  readonly maximumPasses?: number;
  readonly transparentBleedRadius?: number;
  readonly matteSearchRadius?: number;
  readonly matteDistanceThreshold?: number;
  readonly visibleAlphaThreshold?: number;
  readonly opaqueAlphaThreshold?: number;
}

export interface NormalizedSpriteFinalizationRepairOptions {
  readonly maximumPasses: number;
  readonly transparentBleedRadius: number;
  readonly matteSearchRadius: number;
  readonly matteDistanceThreshold: number;
  readonly visibleAlphaThreshold: number;
  readonly opaqueAlphaThreshold: number;
}

export interface SpriteFinalizationRepairPass {
  readonly pass: number;
  readonly inputRawRgbaSha256: string;
  readonly outputRawRgbaSha256: string;
  readonly changedPixels: number;
  readonly actions: readonly SpriteFinalizationActionKind[];
  readonly report: SpriteFrameQualityReport;
  readonly assessment: SpriteFinalizationAssessment;
}

export interface SpriteFinalizationResult {
  readonly schemaVersion: "1.0";
  readonly protocolVersion: typeof SPRITE_FINALIZER_PROTOCOL_VERSION;
  readonly ready: boolean;
  readonly changed: boolean;
  readonly frame: DecodedSpriteFrame;
  readonly expectations: NormalizedSpriteFrameQualityExpectations;
  readonly report: SpriteFrameQualityReport;
  readonly assessment: SpriteFinalizationAssessment;
  readonly passes: readonly SpriteFinalizationRepairPass[];
  readonly changedPixels: number;
}

export interface SpriteFinalizationGateClassification {
  readonly gate: SpriteQualityGateResult;
  readonly disposition: Exclude<SpriteFinalizationDisposition, "ready">;
  readonly action: SpriteFinalizationAction;
}

export class SpriteFinalizerError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "SpriteFinalizerError";
    this.code = code;
  }
}
