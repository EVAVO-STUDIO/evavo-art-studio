import {
  HMF_STUDIO_PLAN_SCHEMA,
  assert,
  deepFreeze,
  runtimeBindingAt,
} from "./common.mjs";

export function studioSummary(studioPlan) {
  assert(studioPlan?.schema === HMF_STUDIO_PLAN_SCHEMA, "compiled HEAVY METAL FIGHTING studio plan is required.");
  return deepFreeze({
    schema: "evavo.heavy-metal-fighting-art-studio-summary.v1",
    protocolVersion: studioPlan.protocolVersion,
    campaignId: studioPlan.campaignId,
    campaignPlanSha256: studioPlan.campaignPlanSha256,
    mechanicalContractSha256: studioPlan.mechanicalContractSha256,
    studioPlanSha256: studioPlan.studioPlanSha256,
    project: studioPlan.project,
    inventory: studioPlan.inventory,
    atlas: studioPlan.atlas,
    plannedAtlasV2: studioPlan.plannedAtlasV2,
    families: studioPlan.families,
    frames: studioPlan.frames.map((frame) => deepFreeze({
      id: frame.id,
      code: frame.code,
      epithet: frame.epithet,
      pilot: frame.pilot,
      motionIdentity: frame.motionIdentity,
      crewRequirement: frame.crewRequirement,
      targetHeightMeters: frame.targetHeightMeters,
      clips: frame.totals.clips,
      authoredSourceCels: frame.totals.sourceCels,
      heroImpactSourceCels: frame.totals.heroImpactSourceCels,
      currentMappedRuntimeSlots: frame.totals.currentMappedRuntimeSlots,
      currentReservedRuntimeSlots: frame.totals.currentReservedRuntimeSlots,
      currentSharedBoundarySlots: frame.totals.currentSharedBoundarySlots,
      currentSharedBoundarySourceCels: frame.totals.currentSharedBoundarySourceCels,
      plannedMappedRuntimeSlots: frame.totals.plannedMappedRuntimeSlots,
      plannedUtilitySourceCels: frame.totals.plannedUtilitySourceCels,
      landmarks: frame.landmarks.length,
      hardpoints: frame.hardpoints.length,
      mirrorMode: frame.mirrorPolicy.mode,
    })),
    styleProof: deepFreeze({
      id: studioPlan.styleProof.id,
      status: studioPlan.styleProof.status,
      blockers: studioPlan.styleProof.blockers,
      currentSlotCollisions: studioPlan.styleProof.currentSlotCollisions,
      plannedSlotCollisions: studioPlan.styleProof.plannedSlotCollisions,
    }),
    warnings: studioPlan.warnings,
    authority: studioPlan.authority,
  });
}

export function framePlan(studioPlan, frameId) {
  assert(studioPlan?.schema === HMF_STUDIO_PLAN_SCHEMA, "compiled HEAVY METAL FIGHTING studio plan is required.");
  const normalized = String(frameId ?? "").trim().toLowerCase();
  const frame = studioPlan.frames.find((candidate) => candidate.id === normalized);
  assert(frame, `unknown Frame ${frameId}; expected ${studioPlan.frames.map((candidate) => candidate.id).join(", ")}.`);
  return frame;
}

export function sourceCelPlan(studioPlan, frameId, sourceIndex) {
  const frame = framePlan(studioPlan, frameId);
  assert(Number.isInteger(sourceIndex) && sourceIndex >= 0 && sourceIndex < frame.cells.length, `sourceIndex must be between 0 and ${frame.cells.length - 1}.`);
  const cell = frame.cells[sourceIndex];
  return deepFreeze({
    schema: "evavo.heavy-metal-fighting-source-cel-plan.v1",
    projectId: studioPlan.project.id,
    studioPlanSha256: studioPlan.studioPlanSha256,
    frame: deepFreeze({
      id: frame.id,
      code: frame.code,
      epithet: frame.epithet,
      pilot: frame.pilot,
      motionIdentity: frame.motionIdentity,
      silhouetteLocks: frame.silhouetteLocks,
      materialRamps: frame.materialRamps,
      mirrorPolicy: frame.mirrorPolicy,
      bodyEffectBoundary: frame.bodyEffectBoundary,
    }),
    cell,
    currentRuntimeBindings: deepFreeze(
      cell.currentRuntimeSlots.map((slot) => runtimeBindingAt(frame.runtimeMappings.current, slot)),
    ),
    plannedRuntimeBindings: deepFreeze(
      cell.plannedRuntimeSlots.map((slot) => runtimeBindingAt(frame.runtimeMappings.plannedV2, slot)),
    ),
    requiredReviewGates: studioPlan.universalReviewGates,
    authority: deepFreeze({
      providerExecution: false,
      approval: false,
      targetRepositoryMutation: false,
      namedHumanApprovalRequired: true,
    }),
  });
}

export function runtimeSlotPlan(studioPlan, frameId, mapName, slot) {
  const frame = framePlan(studioPlan, frameId);
  assert(Number.isInteger(slot) && slot >= 0 && slot < studioPlan.atlas.slots, `slot must be between 0 and ${studioPlan.atlas.slots - 1}.`);
  const normalizedMapName = String(mapName ?? "").trim().toLowerCase();
  assert(["current", "planned-v2"].includes(normalizedMapName), "mapName must be current or planned-v2.");
  const mapping = normalizedMapName === "current"
    ? frame.runtimeMappings.current
    : frame.runtimeMappings.plannedV2;
  const binding = runtimeBindingAt(mapping, slot);
  return deepFreeze({
    schema: "evavo.heavy-metal-fighting-runtime-slot-plan.v1",
    projectId: studioPlan.project.id,
    studioPlanSha256: studioPlan.studioPlanSha256,
    frameId: frame.id,
    mapName: normalizedMapName,
    slot,
    status: binding ? (binding.collision ? "collision" : "mapped") : "reserved",
    binding,
    plannedUtilitySemantic: normalizedMapName === "planned-v2"
      ? studioPlan.plannedAtlasV2.utilitySlots[String(slot)] ?? null
      : null,
    authority: deepFreeze({
      gameRepositoryOwnsRuntimeSlotManifest: true,
      targetRepositoryMutation: false,
      atlasV2Authoritative: false,
    }),
  });
}

export function batchPlan(studioPlan, batchNumber) {
  assert(studioPlan?.schema === HMF_STUDIO_PLAN_SCHEMA, "compiled HEAVY METAL FIGHTING studio plan is required.");
  assert(Number.isInteger(batchNumber) && batchNumber >= 1 && batchNumber <= studioPlan.inventory.batches, `batchNumber must be between 1 and ${studioPlan.inventory.batches}.`);
  return deepFreeze({
    schema: "evavo.heavy-metal-fighting-batch-pointer.v1",
    campaignId: studioPlan.campaignId,
    gameId: studioPlan.project.id,
    batchNumber,
    sourceCampaignPlanSha256: studioPlan.campaignPlanSha256,
    retrieval: deepFreeze({
      tool: "evavo_heavy_metal_fighting_batch",
      gameId: studioPlan.project.id,
      batchNumber,
    }),
  });
}

export function styleProofPlan(studioPlan) {
  assert(studioPlan?.schema === HMF_STUDIO_PLAN_SCHEMA, "compiled HEAVY METAL FIGHTING studio plan is required.");
  return studioPlan.styleProof;
}

