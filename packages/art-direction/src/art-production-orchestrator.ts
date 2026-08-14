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
  compileArtProductionCandidateAdmissionReceipt,
  verifyArtProductionCandidateAdmissionReceipt,
  verifyArtProductionCandidateAdmissionReceiptAgainstRequest,
} from "./art-production-candidate-admission.js";
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
export {
  compileArtProductionSourceAdmissionReceipt,
  verifyArtProductionSourceAdmissionReceipt,
} from "./art-production-source-admission.js";

export function artProductionOrchestratorProtocolSummary() {
  return freeze({
    schemaVersion: "1.0" as const,
    protocolVersion: ART_PRODUCTION_ORCHESTRATOR_PROTOCOL_VERSION,
    purpose:
      "Coordinate profile-bound 1990s game-art generation, exact scheduled-job candidate admission, deterministic technical review, bounded repair, explicit named-human approval receipts, animation continuity, source-preserving packaging, exact runtime-assembly handoff and read-only caller-supplied PNG admission without granting provider execution, creative-decision, mutation, assembly or activation authority.",
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
      "bind provider request, provider response, retained PNG metadata and inspection evidence to the exact current job",
      "admit each candidate through a deterministic receipt before technical review",
      "score native pixel, camera, era, identity and runtime quality",
      "compile bounded repair instructions and retry prompts",
      "block after the configured retry budget rather than weakening review",
      "compile caller-supplied named-human decisions into exact candidate-bound evidence receipts",
      "retain individual PNGs while planning strips, grids and non-rotating atlases",
      "bind runtime assembly sources to exact packaging, candidate-admission, technical-review and approval-receipt lineage",
      "inspect exact caller-supplied PNG bytes and emit a deterministic read-only source-admission receipt",
    ] as const,
    candidateAdmission: freeze({
      providerExecution: false as const,
      imageInspection: false as const,
      automaticCandidateAdmission: false as const,
      exactScheduledJobBinding: true as const,
      callerSuppliedEvidence: true as const,
    }),
    sourceByteAdmission: freeze({
      callerSuppliedByteRead: true as const,
      autonomousArtifactFetch: false as const,
      artifactWrite: false as const,
      exactPngStructure: true as const,
      decodedRgbaEvidence: true as const,
      sourceMutation: false as const,
    }),
    boundaries: freeze({
      artifactRead: false as const,
      providerExecution: false as const,
      imageInspection: false as const,
      automaticCandidateAdmission: false as const,
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
