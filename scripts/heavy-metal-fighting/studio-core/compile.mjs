import {
  HMF_STUDIO_PLAN_SCHEMA,
  HMF_STUDIO_PROTOCOL_VERSION,
  assert,
  deepFreeze,
  matchingUnits,
  normalizeCampaignPlan,
  requirementSlotCollisions,
  runtimeBindingAt,
  sameNumberSet,
  sha256,
  unitsForFamily,
} from "./common.mjs";
import { compileFramePlan } from "./frame-plan.mjs";

function compileStyleProof(game, framePlans, contract, allUnits) {
  const proof = contract.styleProof;
  const frame = framePlans.find((candidate) => candidate.id === proof.frameId);
  assert(frame, `style proof Frame ${proof.frameId} is missing.`);
  const requirements = proof.frameRequirements.map((requirement) => {
    const sourceCell = frame.cells.find((cell) => (
      cell.sourceClipOrdinal === requirement.sourceClipOrdinal
        && cell.frameIndex === requirement.sourceFrameIndex
    ));
    assert(sourceCell, `style proof requirement ${requirement.semantic} cannot resolve its authored source cel.`);
    assert(
      sameNumberSet(sourceCell.currentRuntimeSlots, requirement.currentSlots),
      `style proof requirement ${requirement.semantic} current runtime binding drifted.`,
    );
    assert(
      sameNumberSet(sourceCell.plannedRuntimeSlots, requirement.plannedSlots),
      `style proof requirement ${requirement.semantic} planned runtime binding drifted.`,
    );
    return deepFreeze({
      ...requirement,
      sourceCell,
      currentRuntimeBindings: deepFreeze(
        requirement.currentSlots.map((slot) => runtimeBindingAt(frame.runtimeMappings.current, slot)),
      ),
      plannedRuntimeBindings: deepFreeze(
        requirement.plannedSlots.map((slot) => runtimeBindingAt(frame.runtimeMappings.plannedV2, slot)),
      ),
    });
  });
  const currentSlotCollisions = requirementSlotCollisions(requirements, "currentSlots");
  const plannedSlotCollisions = requirementSlotCollisions(requirements, "plannedSlots");
  const familyUnits = Object.fromEntries(game.families.map((family) => [family.id, unitsForFamily(game, family.id)]));
  const supportingUnits = deepFreeze({
    pilot: matchingUnits(familyUnits["pilot-portraits"] ?? [], [proof.pilotId, "branka", "gravebell"]),
    title: matchingUnits(familyUnits["title-and-shell"] ?? [], [proof.titleId, "title", "heavy metal fighting"]),
    arena: matchingUnits(familyUnits["arena-layers"] ?? [], [proof.arenaId, "foundry nine"]),
    serviceBay: matchingUnits(familyUnits["service-bay-crew-upgrades"] ?? [], [proof.environmentId, "danube", "service cradle", "bastion"]),
  });
  const blockers = [
    ...(currentSlotCollisions.length ? ["current-atlas-shared-boundary-collision"] : []),
    ...(supportingUnits.pilot.length ? [] : ["pilot-supporting-units-not-resolved"]),
    ...(supportingUnits.title.length ? [] : ["title-supporting-units-not-resolved"]),
    ...(supportingUnits.arena.length ? [] : ["arena-supporting-units-not-resolved"]),
    ...(supportingUnits.serviceBay.length ? [] : ["service-bay-supporting-units-not-resolved"]),
  ];
  return deepFreeze({
    id: proof.id,
    approvalRequiredBeforeExpansion: proof.approvalRequiredBeforeExpansion,
    pilotId: proof.pilotId,
    frameId: proof.frameId,
    arenaId: proof.arenaId,
    environmentId: proof.environmentId,
    titleId: proof.titleId,
    pilotStates: proof.pilotStates,
    frameRequirements: deepFreeze(requirements),
    reviewContexts: proof.reviewContexts,
    supportingUnits,
    currentSlotCollisions: deepFreeze(currentSlotCollisions),
    plannedSlotCollisions: deepFreeze(plannedSlotCollisions),
    status: blockers.length
      ? (currentSlotCollisions.length ? "blocked-by-current-shared-cell-contract" : "blocked-by-missing-supporting-units")
      : "ready-for-named-human-style-review",
    blockers: deepFreeze(blockers),
    authority: deepFreeze({
      providerExecution: false,
      approval: false,
      targetRepositoryMutation: false,
      namedHumanApprovalRequired: true,
    }),
    inventoryEvidence: deepFreeze({
      totalCampaignUnits: allUnits.length,
      selectedAuthoredSourceCels: requirements.length,
      selectedCurrentRuntimeBindings: requirements.reduce((sum, requirement) => sum + requirement.currentSlots.length, 0),
      selectedPlannedRuntimeBindings: requirements.reduce((sum, requirement) => sum + requirement.plannedSlots.length, 0),
    }),
  });
}

export function compileHeavyMetalFightingStudioPlan(campaignPlan, mechanicalContract) {
  const { plan, game } = normalizeCampaignPlan(campaignPlan);
  const contract = mechanicalContract;
  assert(contract?.schema === "evavo.mechanical-sprite-contract.v1", "normalized mechanical contract is required.");
  assert(typeof contract.contractSha256 === "string" && /^[0-9a-f]{64}$/.test(contract.contractSha256), "mechanical contract must expose contractSha256.");
  assert(game.totals?.families === contract.inventory.families, `campaign family count drifted: expected ${contract.inventory.families}, observed ${game.totals?.families}.`);
  assert(game.totals?.images === contract.inventory.sourceImages, `campaign source image count drifted: expected ${contract.inventory.sourceImages}, observed ${game.totals?.images}.`);
  assert(game.totals?.batches === contract.inventory.batches, `campaign batch count drifted: expected ${contract.inventory.batches}, observed ${game.totals?.batches}.`);
  const allUnits = game.batches.flatMap((batch) => batch.units);
  assert(allUnits.length === contract.inventory.sourceImages, "campaign batch units do not match source image inventory.");
  assert(new Set(allUnits.map((unit) => unit.id)).size === allUnits.length, "campaign unit ids must be unique.");
  assert(new Set(allUnits.map((unit) => unit.targetPath)).size === allUnits.length, "campaign target paths must be unique.");
  const framePlans = contract.frames.map((frame) => compileFramePlan(game, frame, contract));
  const styleProof = compileStyleProof(game, framePlans, contract, allUnits);
  const familyInventory = game.families.map((family) => deepFreeze({
    id: family.id,
    label: family.label,
    phase: family.phase,
    images: family.images,
    batches: family.batches,
    firstBatchId: family.firstBatchId,
    lastBatchId: family.lastBatchId,
  }));
  const warnings = [
    "Authored source-cel indexes are not runtime atlas slot numbers; current and planned runtime bindings are represented separately.",
    "The live game repository remains authoritative for combat timing, hitboxes, damage and slot semantics.",
    "Slots 24, 44, 64 and 84 remain shared boundaries until a tested game-repository migration lands.",
    "The current atlas maps 120 authored source cels into 104 unique runtime slots and retains 16 reserved slots.",
    "Atlas-v2 maps all 120 authored source cels one-to-one, but remains a study until the game repository migrates.",
    "Frame effects remain separate from physical body cels, especially Mirage false vectors.",
    "No candidate may move into a game repository without named-human approval and exact source binding.",
  ];
  const withoutHash = {
    schema: HMF_STUDIO_PLAN_SCHEMA,
    protocolVersion: HMF_STUDIO_PROTOCOL_VERSION,
    campaignId: plan.campaignId,
    campaignPlanSha256: plan.planSha256,
    mechanicalContractSha256: contract.contractSha256,
    project: contract.project,
    authority: contract.authority,
    inventory: deepFreeze({
      ...contract.inventory,
      observedFamilies: game.totals.families,
      observedSourceImages: game.totals.images,
      observedBatches: game.totals.batches,
    }),
    atlas: contract.atlas,
    plannedAtlasV2: contract.plannedAtlasV2,
    phaseGrammar: contract.phaseGrammar,
    clipBindings: contract.clipBindings,
    universalReviewGates: contract.universalReviewGates,
    families: deepFreeze(familyInventory),
    frames: deepFreeze(framePlans),
    styleProof,
    warnings: deepFreeze(warnings),
    sourceBindings: deepFreeze({
      campaignRequest: "config/game-art-campaign.heavy-metal-fighting.v1.json",
      mechanicalContract: "config/heavy-metal-fighting/mechanical-sprite-contract.v1.json",
      technicalGameRepositoryId: contract.project.technicalRepositoryId,
      liveSlotManifestRequiredForPromotion: true,
    }),
  };
  return deepFreeze({ ...withoutHash, studioPlanSha256: sha256(withoutHash) });
}

