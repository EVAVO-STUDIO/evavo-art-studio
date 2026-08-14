import { freeze } from "./layered-production-internal.js";
import { ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION } from "./art-production-orchestrator-types.js";

export * from "./art-production-orchestrator-types.js";
export {
  validateArtProductionProfile,
  verifyArtProductionProfile,
} from "./art-production-profile.js";
export {
  compileArtProductionLoop,
  evaluateArtProductionAttempt,
  verifyArtProductionLoop,
  verifyArtProductionLoopAgainstProfile,
} from "./art-production-loop.js";
export { compileNextArtProductionBatch } from "./art-production-scheduler.js";
export {
  compileArtProductionPackagingPlan,
  verifyArtProductionPackagingPlan,
} from "./art-production-packaging.js";

export function artProductionOrchestratorProtocolSummary() {
  return freeze({
    schemaVersion: "1.0" as const,
    protocolVersion: ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
    purpose:
      "Coordinate profile-bound 1990s game-art generation, deterministic technical review, bounded repair, animation continuity and source-preserving packaging without granting provider execution or creative approval authority.",
    cameraFamilies: [
      "isometric-life-sim-90s",
      "top-down-sports-90s",
      "side-on-arcade-90s",
      "interior-point-click-90s",
      "world-map-strategy-90s",
      "custom-fixed-90s",
    ] as const,
    loop: [
      "compile exact game, style and camera profile",
      "schedule dependency-safe one-image jobs",
      "ingest exact candidate and measured review evidence",
      "score native pixel, camera, era, identity and runtime quality",
      "compile bounded repair instructions and retry prompts",
      "block after the configured retry budget rather than weakening review",
      "require named-human approval before packaging",
      "retain individual PNGs while planning strips, grids and non-rotating atlases",
    ] as const,
    boundaries: freeze({
      providerExecution: false as const,
      automaticCreativeApproval: false as const,
      imageMutation: false as const,
      packagingExecution: false as const,
      targetRepositoryMutation: false as const,
      gitCommit: false as const,
      gitPush: false as const,
      publication: false as const,
    }),
  });
}
