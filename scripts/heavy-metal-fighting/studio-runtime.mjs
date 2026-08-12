import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  compileCampaignFile,
  getCampaignBatch,
} from "../game-art-campaign/compiler.mjs";
import {
  loadMechanicalContractFile,
  mechanicalContractSummary,
} from "./mechanical-contract.mjs";
import {
  batchPlan,
  compileHeavyMetalFightingStudioPlan,
  framePlan,
  handoffTemplate,
  runtimeSlotPlan,
  sourceCelPlan,
  studioSummary,
  styleProofPlan,
  verifyStudioPlan,
} from "./studio-core.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = path.resolve(HERE, "../..");
export const DEFAULT_CAMPAIGN_REQUEST_PATH = path.join(
  REPOSITORY_ROOT,
  "config",
  "game-art-campaign.heavy-metal-fighting.v1.json",
);
export const DEFAULT_MECHANICAL_CONTRACT_PATH = path.join(
  REPOSITORY_ROOT,
  "config",
  "heavy-metal-fighting",
  "mechanical-sprite-contract.v1.json",
);

export async function loadHeavyMetalFightingStudio(options = {}) {
  const campaignRequestPath = path.resolve(options.campaignRequestPath ?? DEFAULT_CAMPAIGN_REQUEST_PATH);
  const mechanicalContractPath = path.resolve(options.mechanicalContractPath ?? DEFAULT_MECHANICAL_CONTRACT_PATH);
  const [campaignPlan, mechanicalContract] = await Promise.all([
    compileCampaignFile(campaignRequestPath),
    loadMechanicalContractFile(mechanicalContractPath),
  ]);
  const studioPlan = compileHeavyMetalFightingStudioPlan(campaignPlan, mechanicalContract);
  return Object.freeze({
    campaignRequestPath,
    mechanicalContractPath,
    campaignPlan,
    mechanicalContract,
    studioPlan,
  });
}

export async function heavyMetalFightingSummary(options = {}) {
  const loaded = await loadHeavyMetalFightingStudio(options);
  return studioSummary(loaded.studioPlan);
}

export async function heavyMetalFightingMechanicalContract(options = {}) {
  const loaded = await loadHeavyMetalFightingStudio(options);
  return mechanicalContractSummary(loaded.mechanicalContract);
}

export async function heavyMetalFightingFramePlan(frameId, options = {}) {
  const loaded = await loadHeavyMetalFightingStudio(options);
  return framePlan(loaded.studioPlan, frameId);
}

export async function heavyMetalFightingSourceCel(frameId, sourceIndex, options = {}) {
  const loaded = await loadHeavyMetalFightingStudio(options);
  return sourceCelPlan(loaded.studioPlan, frameId, sourceIndex);
}

export async function heavyMetalFightingRuntimeSlot(frameId, mapName, slot, options = {}) {
  const loaded = await loadHeavyMetalFightingStudio(options);
  return runtimeSlotPlan(loaded.studioPlan, frameId, mapName, slot);
}

export async function heavyMetalFightingStyleProof(options = {}) {
  const loaded = await loadHeavyMetalFightingStudio(options);
  return styleProofPlan(loaded.studioPlan);
}

export async function heavyMetalFightingBatch(batchNumber, options = {}) {
  const loaded = await loadHeavyMetalFightingStudio(options);
  batchPlan(loaded.studioPlan, batchNumber);
  return getCampaignBatch(loaded.campaignPlan, loaded.studioPlan.project.id, batchNumber);
}

export async function heavyMetalFightingHandoffTemplate(input, options = {}) {
  const loaded = await loadHeavyMetalFightingStudio(options);
  return handoffTemplate(loaded.studioPlan, input);
}

export async function verifyHeavyMetalFightingStudio(options = {}) {
  const loaded = await loadHeavyMetalFightingStudio(options);
  return verifyStudioPlan(loaded.studioPlan);
}
