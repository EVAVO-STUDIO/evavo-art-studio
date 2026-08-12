import {
  HMF_STUDIO_PLAN_SCHEMA,
  assert,
  deepFreeze,
  sameNumberSet,
  sha256,
} from "./common.mjs";

export function handoffTemplate(studioPlan, input = {}) {
  assert(studioPlan?.schema === HMF_STUDIO_PLAN_SCHEMA, "compiled HEAVY METAL FIGHTING studio plan is required.");
  const gameRevisionSha = String(input.gameRevisionSha ?? "").trim().toLowerCase();
  const liveSlotManifestSha256 = String(input.liveSlotManifestSha256 ?? "").trim().toLowerCase();
  assert(/^[0-9a-f]{40}$/.test(gameRevisionSha), "gameRevisionSha must be a 40-character Git commit SHA.");
  assert(/^[0-9a-f]{64}$/.test(liveSlotManifestSha256), "liveSlotManifestSha256 must be a lowercase SHA-256.");
  const referenceFrame = studioPlan.frames[0];
  const withoutHash = {
    schema: "evavo.heavy-metal-fighting-art-handoff-template.v1",
    projectId: studioPlan.project.id,
    publicTitle: studioPlan.project.publicTitle,
    technicalGameRepositoryId: studioPlan.project.technicalRepositoryId,
    gameRevisionSha,
    liveSlotManifestSha256,
    campaignPlanSha256: studioPlan.campaignPlanSha256,
    mechanicalContractSha256: studioPlan.mechanicalContractSha256,
    studioPlanSha256: studioPlan.studioPlanSha256,
    requiredAuthoredSourceCelsPerFrame: studioPlan.atlas.slots,
    currentMappedRuntimeSlotsPerFrame: referenceFrame.totals.currentMappedRuntimeSlots,
    currentReservedRuntimeSlots: referenceFrame.runtimeMappings.current.reservedSlots,
    currentSharedBoundarySlots: studioPlan.atlas.sharedBoundarySlots,
    plannedMappedRuntimeSlotsPerFrame: referenceFrame.totals.plannedMappedRuntimeSlots,
    requiredFrameIds: studioPlan.frames.map((frame) => frame.id),
    requiredEvidence: [
      "individual-lossless-frame-masters",
      "editable-source-package",
      "exact-frame-durations-and-pivots",
      "authored-source-to-current-runtime-slot-map",
      "authored-source-to-planned-runtime-slot-map",
      "mechanical-landmark-review",
      "mirror-review",
      "body-effect-separation-review",
      "native-cell-and-640x360-evidence",
      "all-four-arena-palette-evidence",
      "live-slot-manifest-audit",
      "named-human-approval-record",
    ],
    authority: {
      providerExecution: false,
      targetRepositoryMutation: false,
      candidatePromotion: false,
      gitCommit: false,
      gitPush: false,
      publication: false,
    },
  };
  return deepFreeze({ ...withoutHash, handoffTemplateSha256: sha256(withoutHash) });
}

export function verifyStudioPlan(studioPlan) {
  assert(studioPlan?.schema === HMF_STUDIO_PLAN_SCHEMA, "compiled HEAVY METAL FIGHTING studio plan is required.");
  const checks = [
    ["campaign-images", studioPlan.inventory.observedSourceImages === 1157],
    ["campaign-batches", studioPlan.inventory.observedBatches === 119],
    ["launch-frames", studioPlan.frames.length === 4],
    ["authored-source-cels", studioPlan.frames.every((frame) => frame.cells.length === 120)],
    ["source-index-coverage", studioPlan.frames.every((frame) => frame.cells.every((cell, index) => cell.sourceIndex === index))],
    ["clip-topology", studioPlan.frames.every((frame) => frame.clips.length === studioPlan.clipBindings.length)],
    ["native-cells", studioPlan.frames.every((frame) => frame.cells.every((cell) => cell.dimensions.width === 128 && cell.dimensions.height === 128))],
    ["origin", studioPlan.frames.every((frame) => frame.cells.every((cell) => cell.pivot.x === 64 && cell.pivot.y === 128))],
    ["current-runtime-mapped-slots", studioPlan.frames.every((frame) => frame.runtimeMappings.current.mappedSlots === 104)],
    ["current-runtime-reserved-slots", studioPlan.frames.every((frame) => frame.runtimeMappings.current.reservedSlots.length === 16)],
    ["current-shared-boundaries", studioPlan.frames.every((frame) => sameNumberSet(frame.runtimeMappings.current.collisions.map((collision) => collision.slot), [24, 44, 64, 84]))],
    ["current-shared-boundary-cardinality", studioPlan.frames.every((frame) => frame.runtimeMappings.current.collisions.every((collision) => collision.sources.length === 2))],
    ["planned-runtime-full-coverage", studioPlan.frames.every((frame) => frame.runtimeMappings.plannedV2.mappedSlots === 120)],
    ["planned-runtime-no-reserved-slots", studioPlan.frames.every((frame) => frame.runtimeMappings.plannedV2.reservedSlots.length === 0)],
    ["planned-runtime-no-collisions", studioPlan.frames.every((frame) => frame.runtimeMappings.plannedV2.collisions.length === 0)],
    ["planned-utility-source-cels", studioPlan.frames.every((frame) => frame.totals.plannedUtilitySourceCels === 12)],
    ["mechanical-landmarks", studioPlan.frames.every((frame) => frame.landmarks.length >= 18)],
    ["hardpoints", studioPlan.frames.every((frame) => frame.hardpoints.length >= 5)],
    ["human-approval", studioPlan.authority.namedHumanApprovalRequired === true],
    ["no-auto-promotion", studioPlan.authority.automaticPromotionForbidden === true],
    ["style-proof-detects-current-shared-cell", studioPlan.styleProof.currentSlotCollisions.some((collision) => collision.slot === 24)],
    ["planned-style-proof-removes-collision", studioPlan.styleProof.plannedSlotCollisions.length === 0],
  ].map(([id, passed]) => deepFreeze({ id, passed }));
  const failed = checks.filter((check) => !check.passed);
  return deepFreeze({
    schema: "evavo.heavy-metal-fighting-art-studio-verification.v1",
    status: failed.length ? "failed" : "passed",
    studioPlanSha256: studioPlan.studioPlanSha256,
    checks: deepFreeze(checks),
    failed: deepFreeze(failed),
    warnings: studioPlan.warnings,
  });
}
