import type { CompiledLayeredProductionPlan } from "./layered-production-types.js";
import {
  ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
  ART_PRODUCTION_PACKAGING_PLAN_KIND,
} from "./art-production-contract.js";

export interface ArtProductionHumanApprovalInput {
  readonly unitId: string;
  readonly sourceArtifactId: string;
  readonly sourceSha256: string;
  readonly sourceBytes: number;
  readonly reviewer: string;
  readonly reviewedAt: string;
  readonly approvalReceiptSha256: string;
}

export interface ArtProductionPackagingPlan {
  readonly schemaVersion: "1.0";
  readonly kind: typeof ART_PRODUCTION_PACKAGING_PLAN_KIND;
  readonly protocolVersion: typeof ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION;
  readonly planId: string;
  readonly planSha256: string;
  readonly loopSha256: string;
  readonly profileSha256: string;
  readonly individualSources: readonly Readonly<{
    readonly unitId: string;
    readonly artifactId: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly width: number;
    readonly height: number;
    readonly targetPath: string;
    readonly approvalReceiptSha256: string;
  }>[];
  readonly animationSheets: readonly Readonly<{
    readonly familyId: string;
    readonly clipId: string;
    readonly layout: "horizontal-strip" | "fixed-grid";
    readonly width: number;
    readonly height: number;
    readonly columns: number;
    readonly rows: number;
    readonly frames: readonly Readonly<{
      readonly unitId: string;
      readonly frameNumber: number;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly pivot?: Readonly<{ x: number; y: number }>;
      readonly ySortOrigin?: Readonly<{ x: number; y: number }>;
    }>[];
  }>[];
  readonly atlasPages: readonly Readonly<{
    readonly page: number;
    readonly width: number;
    readonly height: number;
    readonly padding: number;
    readonly rotation: false;
    readonly trim: false;
    readonly placements: readonly Readonly<{
      readonly unitId: string;
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }>[];
  }>[];
  readonly authority: Readonly<{
    readonly imageMutation: false;
    readonly packagingExecution: false;
    readonly creativeApproval: false;
    readonly targetRepositoryMutation: false;
    readonly gitCommit: false;
    readonly gitPush: false;
    readonly publication: false;
  }>;
  readonly packagingSha256: string;
}

export type ArtProductionPlan = CompiledLayeredProductionPlan;
