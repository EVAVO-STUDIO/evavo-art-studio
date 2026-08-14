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
  compileArtProductionHumanApprovalReceipt,
  verifyArtProductionHumanApprovalReceipt,
  verifyArtProductionHumanApprovalReceiptAgainstRequest,
} from "./art-production-human-approval.js";
export { compileArtProductionPackagingPlan } from "./art-production-packaging.js";
export { verifyArtProductionPackagingPlan } from "./art-production-packaging-verification.js";
export {
  compileArtProductionRuntimeAssemblyHandoff,
  verifyArtProductionRuntimeAssemblyHandoff,
} from "./art-production-runtime-assembly.js";

export function artProductionOrchestratorProtocolSummary() {
  return freeze({
    schemaVersion: "1.0" as const,
    protocolVersion: ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
    purpose:
      "Coordinate profile-bound 1990s game-art generation, deterministic technical review, bounded repair, explicit named-human approval receipts, animation continuity, source-preserving packaging and exact runtime-assembly handoff without granting provider execution, creative-decision, assembly or activation authority.",
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
      "compile caller-supplied named-human decisions into exact candidate-bound evidence receipts",
      "retain individual PNGs while planning strips, grids and non-rotating atlases",
      "bind runtime assembly sources to exact packaging, technical-review and approval-receipt lineage",
    ] as const,
    boundaries: freeze({
      artifactRead: false as const,
      providerExecution: false as const,
      automaticCreativeApproval: false as const,
      creativeDecision: false as const,
      imageMutation: false as const,
      packagingExecution: false as const,
      automaticAssembly: false as const,
      targetRepositoryMutation: false as const,
      runtimeActivation: false as const,
      gitCommit: false as const,
      gitPush: false as const,
      deployment: false as const,
      publication: false as const,
      forcePush: false as const,
    }),
  });
}
