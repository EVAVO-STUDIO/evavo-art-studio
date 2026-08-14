import {
  ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
  ART_PRODUCTION_RUNTIME_ASSEMBLY_HANDOFF_KIND,
} from "./art-production-contract.js";
import type { CompiledLayeredAssemblyManifest } from "./layered-production-assembly-types.js";
import type {
  LayeredProductionAlphaPolicy,
  LayeredProductionLayerRole,
} from "./layered-production-types.js";

export interface ArtProductionRuntimeAssemblySourceBinding {
  readonly unitId: string;
  readonly layerId: string;
  readonly layerRole: LayeredProductionLayerRole;
  readonly sourceArtifactId: string;
  readonly sourceSha256: string;
  readonly sourceBytes: number;
  readonly width: number;
  readonly height: number;
  readonly alpha: LayeredProductionAlphaPolicy;
  readonly targetPath: string;
  readonly technicalReviewAttemptSha256: string;
  readonly approvalRequestSha256: string;
  readonly approvalBasisSha256: string;
  readonly approvalReceiptArtifactId: string;
  readonly approvalReceiptSha256: string;
}

export interface ArtProductionRuntimeAssemblyHandoff {
  readonly schemaVersion: "1.0";
  readonly kind: typeof ART_PRODUCTION_RUNTIME_ASSEMBLY_HANDOFF_KIND;
  readonly protocolVersion: typeof ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION;
  readonly plan: Readonly<{
    readonly planId: string;
    readonly planSha256: string;
  }>;
  readonly loop: Readonly<{
    readonly loopSha256: string;
    readonly profileSha256: string;
  }>;
  readonly packaging: Readonly<{
    readonly packagingSha256: string;
  }>;
  readonly assembly: Readonly<{
    readonly assemblyId: string;
    readonly requestSha256: string;
    readonly manifestSha256: string;
    readonly manifest: CompiledLayeredAssemblyManifest;
  }>;
  readonly sourceBindings: readonly ArtProductionRuntimeAssemblySourceBinding[];
  readonly totals: Readonly<{
    readonly sources: number;
    readonly animationSets: number;
    readonly placements: number;
  }>;
  readonly authority: Readonly<{
    readonly planningOnly: true;
    readonly artifactRead: false;
    readonly providerExecution: false;
    readonly imageMutation: false;
    readonly creativeDecision: false;
    readonly packagingExecution: false;
    readonly automaticAssembly: false;
    readonly targetRepositoryMutation: false;
    readonly runtimeActivation: false;
    readonly gitCommit: false;
    readonly gitPush: false;
    readonly deployment: false;
    readonly publication: false;
    readonly forcePush: false;
  }>;
  readonly handoffSha256: string;
}
