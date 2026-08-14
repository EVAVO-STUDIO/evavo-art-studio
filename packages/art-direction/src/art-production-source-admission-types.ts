import {
  ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
  ART_PRODUCTION_SOURCE_ADMISSION_RECEIPT_KIND,
} from "./art-production-contract.js";
import type {
  LayeredProductionAlphaPolicy,
  LayeredProductionLayerRole,
} from "./layered-production-types.js";

export interface ArtProductionSourceArtifactInput {
  readonly unitId: string;
  readonly bytes: Uint8Array;
}

export interface ArtProductionPngEvidence {
  readonly format: "png";
  readonly bitDepth: 8;
  readonly colorType: 6;
  readonly compressionMethod: 0;
  readonly filterMethod: 0;
  readonly interlaceMethod: 0;
  readonly chunkCount: number;
  readonly idatChunkCount: number;
  readonly compressedBytes: number;
  readonly decodedBytes: number;
  readonly decodedRgbaSha256: string;
  readonly opaquePixels: number;
  readonly translucentPixels: number;
  readonly transparentPixels: number;
  readonly visiblePixels: number;
  readonly unsafeTransparentPixels: 0;
}

export interface ArtProductionSourceAdmission {
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
  readonly png: ArtProductionPngEvidence;
  readonly admissionSha256: string;
}

export interface ArtProductionSourceAdmissionReceipt {
  readonly schemaVersion: "1.0";
  readonly kind: typeof ART_PRODUCTION_SOURCE_ADMISSION_RECEIPT_KIND;
  readonly protocolVersion: typeof ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION;
  readonly handoff: Readonly<{
    readonly planId: string;
    readonly planSha256: string;
    readonly loopSha256: string;
    readonly profileSha256: string;
    readonly packagingSha256: string;
    readonly assemblyId: string;
    readonly assemblyRequestSha256: string;
    readonly assemblyManifestSha256: string;
    readonly handoffSha256: string;
  }>;
  readonly admissions: readonly ArtProductionSourceAdmission[];
  readonly totals: Readonly<{
    readonly sources: number;
    readonly sourceBytes: number;
    readonly decodedBytes: number;
    readonly visiblePixels: number;
    readonly opaquePixels: number;
    readonly translucentPixels: number;
    readonly transparentPixels: number;
    readonly unsafeTransparentPixels: 0;
  }>;
  readonly authority: Readonly<{
    readonly callerSuppliedByteRead: true;
    readonly autonomousArtifactFetch: false;
    readonly artifactWrite: false;
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
  readonly receiptSha256: string;
}
