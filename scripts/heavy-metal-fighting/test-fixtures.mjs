import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadMechanicalContractFile } from "./mechanical-contract.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CONTRACT_PATH = path.join(ROOT, "config", "heavy-metal-fighting", "mechanical-sprite-contract.v1.json");

export const FAMILY_COUNTS = Object.freeze({
  "title-and-shell": 42,
  "pilot-portraits": 60,
  "frame-construction": 40,
  "frame-animation": 480,
  "frame-damage-overlays": 16,
  "universal-combat-fx": 115,
  "frame-specific-fx": 160,
  "arena-layers": 40,
  "service-bay-crew-upgrades": 102,
  "pilot-service-animation": 72,
  "opening-intro": 30,
});

export const FRAME_CLIPS = Object.freeze([
  ["neutral-and-throws", 16],
  ["standing-light", 9],
  ["standing-heavy", 9],
  ["crouch-light", 9],
  ["crouch-heavy", 9],
  ["jump-light", 9],
  ["jump-heavy", 9],
  ["special-a", 9],
  ["special-b", 9],
  ["high-output-a", 9],
  ["high-output-b", 9],
  ["utility-v2-planned", 12],
  ["victory-defeat", 2],
]);

function frameUnits(frameId) {
  const units = [];
  let global = 0;
  for (const [clipId, frames] of FRAME_CLIPS) {
    for (let frameIndex = 0; frameIndex < frames; frameIndex += 1) {
      units.push({
        id: `heavy-metal-fighting.frame-animation.${frameId}.right.${clipId}.f${String(frameIndex + 1).padStart(3, "0")}`,
        gameId: "heavy-metal-fighting",
        familyId: "frame-animation",
        phase: "primary-production",
        kind: "animation-frame",
        subjectId: frameId,
        clipId,
        direction: "right",
        frameIndex,
        frameNumber: frameIndex + 1,
        framesInClip: frames,
        fps: 12,
        loop: clipId === "neutral-and-throws" ? "linear" : "none",
        pose: `${frameId} ${clipId} pose ${frameIndex + 1}`,
        dimensions: { width: 128, height: 128 },
        authoringCanvas: { width: 512, height: 512 },
        alpha: "transparent",
        pivot: { x: 64, y: 128 },
        ySortOrigin: { x: 64, y: 128 },
        fileName: `${frameId}_${String(global).padStart(3, "0")}.png`,
        targetPath: `assets/game/heavy-metal-fighting/frames/${frameId}/${String(global).padStart(3, "0")}.png`,
        continuityKey: `heavy-metal-fighting:frame-animation:${frameId}`,
        prompt: `${frameId} ${clipId} planned study. Deliver only this one asset/frame as one separate image.`,
        reviewPreset: "hmf-frame-native",
      });
      global += 1;
    }
  }
  assert.equal(global, 120);
  return units;
}

function catalogueUnits(familyId, count) {
  const terms = familyId === "pilot-portraits"
    ? "branka kovac gravebell"
    : familyId === "title-and-shell"
      ? "heavy metal fighting title"
      : familyId === "arena-layers"
        ? "foundry nine"
        : familyId === "service-bay-crew-upgrades"
          ? "danube works service cradle bastion"
          : familyId;
  return Array.from({ length: count }, (_, index) => ({
    id: `heavy-metal-fighting.${familyId}.item-${String(index + 1).padStart(3, "0")}.base`,
    gameId: "heavy-metal-fighting",
    familyId,
    phase: "primary-production",
    kind: "catalogue-asset",
    itemId: `item-${String(index + 1).padStart(3, "0")}`,
    variantId: "base",
    dimensions: { width: 128, height: 128 },
    authoringCanvas: { width: 512, height: 512 },
    alpha: familyId === "arena-layers" ? "opaque" : "transparent",
    fileName: `${familyId}_${String(index + 1).padStart(3, "0")}.png`,
    targetPath: `assets/game/heavy-metal-fighting/${familyId}/${String(index + 1).padStart(3, "0")}.png`,
    continuityKey: `heavy-metal-fighting:${familyId}`,
    prompt: `${terms}. Deliver only this one asset/frame as one separate image.`,
    reviewPreset: `hmf-${familyId}`,
  }));
}

function batchFamily(familyId, units, sequenceStart) {
  const batches = [];
  for (let offset = 0; offset < units.length; offset += 10) {
    const selected = units.slice(offset, offset + 10);
    batches.push({
      id: `heavy-metal-fighting.${familyId}.batch-${String(batches.length + 1).padStart(3, "0")}`,
      sequence: sequenceStart + batches.length,
      gameId: "heavy-metal-fighting",
      familyId,
      familyBatch: batches.length + 1,
      phase: "primary-production",
      requiredImages: selected.length,
      capacity: 10,
      partial: selected.length < 10,
      units: selected,
      providerInstruction: "Generate separate images only.",
    });
  }
  return batches;
}

export function syntheticCampaignPlan() {
  const familyUnits = Object.fromEntries(Object.keys(FAMILY_COUNTS).map((familyId) => {
    if (familyId === "frame-animation") {
      return [familyId, ["bastion", "viper", "citadel", "mirage"].flatMap(frameUnits)];
    }
    return [familyId, catalogueUnits(familyId, FAMILY_COUNTS[familyId])];
  }));
  const families = [];
  const batches = [];
  let sequence = 1;
  for (const [familyId, count] of Object.entries(FAMILY_COUNTS)) {
    const familyBatches = batchFamily(familyId, familyUnits[familyId], sequence);
    sequence += familyBatches.length;
    batches.push(...familyBatches);
    families.push({
      id: familyId,
      label: familyId,
      kind: familyId === "frame-animation" || familyId === "opening-intro" ? "sequence" : "catalogue",
      phase: "primary-production",
      priority: families.length + 1,
      images: count,
      batches: familyBatches.length,
      partialBatches: familyBatches.filter((batch) => batch.partial).length,
      firstBatchId: familyBatches[0].id,
      lastBatchId: familyBatches.at(-1).id,
      batchIds: familyBatches.map((batch) => batch.id),
    });
  }
  assert.equal(batches.length, 119);
  return {
    schema: "evavo.game-art-campaign-plan.v1",
    campaignId: "heavy-metal-fighting-launch-four",
    planSha256: "a".repeat(64),
    games: [{
      id: "heavy-metal-fighting",
      title: "HEAVY METAL FIGHTING",
      families,
      batches,
      totals: {
        families: 11,
        images: 1157,
        batches: 119,
        partialBatches: batches.filter((batch) => batch.partial).length,
        unusedBatchSlots: batches.reduce((sum, batch) => sum + batch.capacity - batch.requiredImages, 0),
      },
    }],
  };
}


export async function loadContract() {
  return loadMechanicalContractFile(CONTRACT_PATH);
}
