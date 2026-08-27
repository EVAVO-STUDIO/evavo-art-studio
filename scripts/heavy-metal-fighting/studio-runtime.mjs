import path from "node:path";
import { fileURLToPath } from "node:url";

import { compileCampaignFile, getCampaignBatch } from "../game-art-campaign/compiler.mjs";
import { loadMechanicalContractFile, mechanicalContractSummary } from "./mechanical-contract.mjs";
import { combatPresentationSummary, loadCombatPresentationContractFile, sha256 as combatPresentationSha256 } from "./combat-presentation-contract.mjs";
import { loadSpriteProductionCensusFile, spriteBankPlan, spriteProductionCensusSummary, verifySpriteProductionCensus } from "./sprite-production-census.mjs";
import { assetAllocationPlan, attractModePlan, frameMoveRoster, introPlan, movePlan, pilotPlan, productionDesignSummary, productionReadinessPlan, screenPlan, sourceCelProductionPlan, superPlan, verifyProductionDesign } from "./production-design.mjs";
import { batchPlan, compileHeavyMetalFightingStudioPlan, framePlan, handoffTemplate, runtimeSlotPlan, sourceCelPlan, studioSummary, styleProofPlan, verifyStudioPlan } from "./studio-core.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = path.resolve(HERE, "../..");
export const DEFAULT_CAMPAIGN_REQUEST_PATH = path.join(REPOSITORY_ROOT, "config", "game-art-campaign.heavy-metal-fighting.v1.json");
export const DEFAULT_MECHANICAL_CONTRACT_PATH = path.join(REPOSITORY_ROOT, "config", "heavy-metal-fighting", "mechanical-sprite-contract.v1.json");
export const DEFAULT_COMBAT_PRESENTATION_CONTRACT_PATH = path.join(REPOSITORY_ROOT, "config", "heavy-metal-fighting", "combat-presentation-contract.v1.json");
export const DEFAULT_SPRITE_PRODUCTION_CENSUS_PATH = path.join(REPOSITORY_ROOT, "config", "heavy-metal-fighting", "sprite-production-census.v1.json");

export async function loadHeavyMetalFightingStudio(options = {}) {
  const campaignRequestPath = path.resolve(options.campaignRequestPath ?? DEFAULT_CAMPAIGN_REQUEST_PATH);
  const mechanicalContractPath = path.resolve(options.mechanicalContractPath ?? DEFAULT_MECHANICAL_CONTRACT_PATH);
  const combatPresentationContractPath = path.resolve(options.combatPresentationContractPath ?? DEFAULT_COMBAT_PRESENTATION_CONTRACT_PATH);
  const spriteProductionCensusPath = path.resolve(options.spriteProductionCensusPath ?? DEFAULT_SPRITE_PRODUCTION_CENSUS_PATH);
  const [campaignPlan, mechanicalContract, combatPresentationContract, spriteProductionCensus] = await Promise.all([
    compileCampaignFile(campaignRequestPath),
    loadMechanicalContractFile(mechanicalContractPath),
    loadCombatPresentationContractFile(combatPresentationContractPath),
    loadSpriteProductionCensusFile(spriteProductionCensusPath),
  ]);
  const studioPlan = compileHeavyMetalFightingStudioPlan(campaignPlan, mechanicalContract);
  if (combatPresentationContract.project.id !== studioPlan.project.id) throw new Error("HEAVY_METAL_FIGHTING_ADAPTER_INVALID: combat presentation project does not match the compiled campaign.");
  if (spriteProductionCensus.project.id !== studioPlan.project.id) throw new Error("HEAVY_METAL_FIGHTING_ADAPTER_INVALID: sprite production census project does not match the compiled campaign.");
  const campaignImages = studioPlan.inventory.observedSourceImages;
  const presentationImages = Object.values(combatPresentationContract.assetAllocation).reduce((sum, family) => sum + family.expectedCount, 0);
  if (campaignImages !== presentationImages) throw new Error(`HEAVY_METAL_FIGHTING_ADAPTER_INVALID: campaign inventory ${campaignImages} does not match production allocation ${presentationImages}.`);
  if (spriteProductionCensus.productionTotals.legacyCampaignSourceImages !== campaignImages) throw new Error(`HEAVY_METAL_FIGHTING_ADAPTER_INVALID: sprite census compatibility inventory ${spriteProductionCensus.productionTotals.legacyCampaignSourceImages} does not match current campaign ${campaignImages}.`);
  if (spriteProductionCensus.productionTotals.legacyFrameBodyCels !== studioPlan.inventory.frameAnimationImages) throw new Error("HEAVY_METAL_FIGHTING_ADAPTER_INVALID: sprite census compatibility body-cel count does not match the current campaign.");
  return Object.freeze({campaignRequestPath,mechanicalContractPath,combatPresentationContractPath,spriteProductionCensusPath,campaignPlan,mechanicalContract,combatPresentationContract,spriteProductionCensus,studioPlan});
}

export async function heavyMetalFightingSummary(options = {}) { const loaded = await loadHeavyMetalFightingStudio(options); return Object.freeze({...studioSummary(loaded.studioPlan),productionDesign:productionDesignSummary(loaded.combatPresentationContract),spriteProduction:spriteProductionCensusSummary(loaded.spriteProductionCensus)}); }
export async function heavyMetalFightingMechanicalContract(options = {}) { const loaded = await loadHeavyMetalFightingStudio(options); return mechanicalContractSummary(loaded.mechanicalContract); }
export async function heavyMetalFightingCombatPresentationContract(options = {}) { const loaded = await loadHeavyMetalFightingStudio(options); return combatPresentationSummary(loaded.combatPresentationContract); }
export async function heavyMetalFightingSpriteCensus(options = {}) { const loaded = await loadHeavyMetalFightingStudio(options); return spriteProductionCensusSummary(loaded.spriteProductionCensus); }
export async function heavyMetalFightingSpriteBank(bankId, options = {}) { const loaded = await loadHeavyMetalFightingStudio(options); return spriteBankPlan(loaded.spriteProductionCensus, bankId); }
export async function heavyMetalFightingPilotPlan(pilotId, options = {}) { const loaded = await loadHeavyMetalFightingStudio(options); return pilotPlan(loaded.combatPresentationContract, pilotId); }
export async function heavyMetalFightingFramePlan(frameId, options = {}) { const loaded = await loadHeavyMetalFightingStudio(options); return framePlan(loaded.studioPlan, frameId); }
export async function heavyMetalFightingFrameMoveRoster(frameId, options = {}) { const loaded = await loadHeavyMetalFightingStudio(options); return frameMoveRoster(loaded.combatPresentationContract, frameId); }
export async function heavyMetalFightingMovePlan(frameId, moveId, options = {}) { const loaded = await loadHeavyMetalFightingStudio(options); return movePlan(loaded.combatPresentationContract, frameId, moveId); }
export async function heavyMetalFightingSourceCel(frameId, sourceIndex, options = {}) { const loaded = await loadHeavyMetalFightingStudio(options); const source = sourceCelPlan(loaded.studioPlan, frameId, sourceIndex); return Object.freeze({...source,productionDesign:sourceCelProductionPlan(loaded.combatPresentationContract, source)}); }
export async function heavyMetalFightingRuntimeSlot(frameId, mapName, slot, options = {}) { const loaded = await loadHeavyMetalFightingStudio(options); return runtimeSlotPlan(loaded.studioPlan, frameId, mapName, slot); }
export async function heavyMetalFightingScreenPlan(screenId, options = {}) { const loaded = await loadHeavyMetalFightingStudio(options); return screenPlan(loaded.combatPresentationContract, screenId); }
export async function heavyMetalFightingSuperPlan(frameId, options = {}) { const loaded = await loadHeavyMetalFightingStudio(options); return superPlan(loaded.combatPresentationContract, frameId); }
export async function heavyMetalFightingIntroPlan(options = {}) { const loaded = await loadHeavyMetalFightingStudio(options); return introPlan(loaded.combatPresentationContract); }
export async function heavyMetalFightingAttractModePlan(options = {}) { const loaded = await loadHeavyMetalFightingStudio(options); return attractModePlan(loaded.combatPresentationContract); }
export async function heavyMetalFightingProductionReadiness(options = {}) { const loaded = await loadHeavyMetalFightingStudio(options); return productionReadinessPlan(loaded.combatPresentationContract); }
export async function heavyMetalFightingAssetAllocation(familyId, options = {}) { const loaded = await loadHeavyMetalFightingStudio(options); return assetAllocationPlan(loaded.combatPresentationContract, familyId); }
export async function heavyMetalFightingStyleProof(options = {}) { const loaded = await loadHeavyMetalFightingStudio(options); return styleProofPlan(loaded.studioPlan); }

export async function heavyMetalFightingBatch(batchNumber, options = {}) {
  const loaded = await loadHeavyMetalFightingStudio(options);
  batchPlan(loaded.studioPlan, batchNumber);
  const batch = getCampaignBatch(loaded.campaignPlan, loaded.studioPlan.project.id, batchNumber);
  const units = batch.units.map((unit) => {
    if (unit.familyId === "frame-animation" && unit.subjectId) {
      const owner = framePlan(loaded.studioPlan, unit.subjectId);
      const cell = owner.cells.find((candidate) => candidate.unitId === unit.id);
      if (!cell) throw new Error(`HEAVY_METAL_FIGHTING_ADAPTER_INVALID: frame-animation unit ${unit.id} has no source-cell binding.`);
      const source = sourceCelPlan(loaded.studioPlan, unit.subjectId, cell.sourceIndex);
      const design = sourceCelProductionPlan(loaded.combatPresentationContract, source);
      return Object.freeze({...unit,productionDesign:Object.freeze({sourceIndex:cell.sourceIndex,framePurpose:design.framePurpose,moveId:design.move?.id ?? null,publicMoveName:design.move?.publicName ?? null,implementationStatus:design.move?.implementationStatus ?? "state-or-utility",currentRuntimeSlots:source.cell.currentRuntimeSlots,plannedRuntimeSlots:source.cell.plannedRuntimeSlots,blockers:design.blockers,separateEffects:design.move?.effects ?? [],compatibilityOnly:true,productionMasterV3RequiredForFinalBodyArt:true})});
    }
    return Object.freeze({...unit,productionDesign:Object.freeze({familyAllocation:loaded.combatPresentationContract.assetAllocation[unit.familyId] ?? null})});
  });
  return Object.freeze({...batch,units:Object.freeze(units)});
}

export async function heavyMetalFightingHandoffTemplate(input, options = {}) {
  const loaded = await loadHeavyMetalFightingStudio(options);
  const withoutCombinedHash = {...handoffTemplate(loaded.studioPlan,input),combatPresentationContractSha256:loaded.combatPresentationContract.contractSha256,spriteProductionCensusSha256:loaded.spriteProductionCensus.censusSha256,productionMasterBodyCelsPerFrame:loaded.spriteProductionCensus.productionMasterV3.usedBodySlotsPerFrame,productionMasterAtlasSlotsPerFrame:loaded.spriteProductionCensus.productionMasterV3.slotsPerFrame,productionMasterFinalPromotionBlocked:true,sourceReview:loaded.combatPresentationContract.sourceReview,gameRevisionReviewStatus:input.gameRevisionSha===loaded.combatPresentationContract.sourceReview.lastReviewedGameRevision?"matches-last-reviewed-game-revision":"requires-fresh-live-game-source-review"};
  return Object.freeze({...withoutCombinedHash,combinedHandoffSha256:combatPresentationSha256(withoutCombinedHash)});
}

export async function verifyHeavyMetalFightingStudio(options = {}) {
  const loaded = await loadHeavyMetalFightingStudio(options);
  const studioVerification = verifyStudioPlan(loaded.studioPlan);
  const productionVerification = verifyProductionDesign(loaded.combatPresentationContract);
  const spriteVerification = verifySpriteProductionCensus(loaded.spriteProductionCensus);
  const checks = Object.freeze([
    ...studioVerification.checks,
    ...productionVerification.checks.map((check)=>Object.freeze({id:`production-${check.id}`,passed:check.passed})),
    ...spriteVerification.checks.map((check)=>Object.freeze({id:`sprite-${check.id}`,passed:check.passed})),
  ]);
  const failed = Object.freeze(checks.filter((check)=>!check.passed));
  return Object.freeze({schema:"evavo.heavy-metal-fighting-combined-verification.v2",status:failed.length?"failed":"passed",studioPlanSha256:loaded.studioPlan.studioPlanSha256,combatPresentationContractSha256:loaded.combatPresentationContract.contractSha256,spriteProductionCensusSha256:loaded.spriteProductionCensus.censusSha256,productionVerificationSha256:productionVerification.verificationSha256,checks,failed,warnings:Object.freeze([...loaded.studioPlan.warnings,"Production-master-v3 final Frame body promotion requires named model-sheet approval, complete runtime evidence and exact source-bound admission."])});
}
