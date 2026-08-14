import type { LayeredProductionRequestInput } from "./layered-production-types.js";
import type {
  ArtProductionBlockingDetection,
  ArtProductionCameraFamily,
  ArtProductionMetricId,
  ArtProductionPackagingOutput,
} from "./art-production-contract.js";
import { ART_PRODUCTION_PROFILE_KIND } from "./art-production-contract.js";

export interface ArtProductionProfileInput {
  readonly schemaVersion: "1.0";
  readonly kind: typeof ART_PRODUCTION_PROFILE_KIND;
  readonly profileId: string;
  readonly revision: string;
  readonly game: Readonly<{
    readonly gameId: string;
    readonly gameTitle: string;
    readonly productionProfileId: string;
    readonly productionProjectId: string;
    readonly genre: string;
    readonly targetEra: string;
    readonly engine: string;
    readonly engineVersion: string;
  }>;
  readonly bindings: Readonly<{
    readonly styleId: string;
    readonly cameraFamily: ArtProductionCameraFamily;
  }>;
  readonly camera: Readonly<{
    readonly family: ArtProductionCameraFamily;
    readonly fixed: true;
    readonly projection: LayeredProductionRequestInput["style"]["projection"];
    readonly yawDegrees: number;
    readonly pitchDegrees: number;
    readonly rollDegrees: number;
    readonly orthographicScale: number;
    readonly facingDirections: readonly string[];
  }>;
  readonly iteration: Readonly<{
    readonly maximumAttemptsPerUnit: number;
    readonly maximumBatchSize: number;
    readonly technicalPassScore: number;
    readonly minimumMetricScore: number;
    readonly metricWeights: Readonly<Record<ArtProductionMetricId, number>>;
    readonly blockingDetections: readonly ArtProductionBlockingDetection[];
  }>;
  readonly animation: Readonly<{
    readonly anchorFirst: true;
    readonly requireIdentityMaster: true;
    readonly requirePreviousFrameContext: true;
    readonly identityMetricMinimum: number;
    readonly pivotMetricMinimum: number;
    readonly groundContactMetricMinimum: number;
  }>;
  readonly packaging: Readonly<{
    readonly retainIndividualPngs: true;
    readonly outputs: readonly ArtProductionPackagingOutput[];
    readonly gridColumns: number;
    readonly atlas: Readonly<{
      readonly maximumWidth: number;
      readonly maximumHeight: number;
      readonly padding: number;
      readonly rotation: false;
      readonly trim: false;
    }>;
  }>;
  readonly authority: Readonly<{
    readonly providerExecution: false;
    readonly automaticCreativeApproval: false;
    readonly imageMutation: false;
    readonly packagingExecution: false;
    readonly targetRepositoryMutation: false;
    readonly gitCommit: false;
    readonly gitPush: false;
    readonly publication: false;
  }>;
}

export interface CompiledArtProductionProfile
  extends ArtProductionProfileInput {
  readonly profileSha256: string;
}
