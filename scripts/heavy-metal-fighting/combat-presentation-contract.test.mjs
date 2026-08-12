import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadCombatPresentationContractFile,
  normalizeCombatPresentationContract,
} from "./combat-presentation-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTRACT_PATH = path.join(ROOT, "config", "heavy-metal-fighting", "combat-presentation-contract.v1.json");

test("combat presentation contract locks the launch move, UI, super, intro and asset plan", async () => {
  const contract = await loadCombatPresentationContractFile(CONTRACT_PATH);
  assert.match(contract.contractSha256, /^[0-9a-f]{64}$/);
  assert.equal(contract.project.publicTitle, "HEAVY METAL FIGHTING");
  assert.deepEqual(contract.frames.map((frame) => frame.id), ["bastion", "viper", "citadel", "mirage"]);
  assert.deepEqual(contract.pilotDesign.pilots.map((pilot) => pilot.id), ["branka-kovac", "miho-tagawa", "esi-quartey", "parvaneh-razi"]);
  assert.ok(contract.pilotDesign.pilots.every((pilot) => pilot.portraitSlots.length === 15));
  assert.ok(contract.pilotDesign.pilots.every((pilot) => contract.frames.find((frame) => frame.id === pilot.defaultFrameId)?.pilotId === pilot.id));
  assert.ok(contract.frames.every((frame) => frame.moves.length === 11));
  assert.ok(contract.frames.every((frame) => frame.moves.filter((move) => move.category.endsWith("normal")).length === 6));
  assert.ok(contract.frames.every((frame) => frame.moves.filter((move) => move.category === "special").length === 2));
  assert.ok(contract.frames.every((frame) => frame.moves.filter((move) => move.category === "reversal").length === 1));
  assert.ok(contract.frames.every((frame) => frame.moves.filter((move) => move.category === "overdrive").length === 1));
  assert.ok(contract.frames.every((frame) => frame.moves.filter((move) => move.category === "throw").length === 1));
  assert.deepEqual(contract.screens.map((screen) => screen.id), ["title-attract","main-menu","pilot-select","frame-select","service-bay-loadout","versus","pre-fight-launch","match-hud","super-cut-in","round-result","ending-credits"]);
  assert.equal(contract.openingIntro.shots.length, 30);
  assert.equal(contract.openingIntro.totalHoldTicks, 798);
  assert.equal(contract.attractMode.segments.length, 4);
  assert.equal(contract.attractMode.segments.reduce((sum, segment) => sum + segment.targetSeconds, 0), 40);
  assert.equal(Object.values(contract.assetAllocation).reduce((sum, family) => sum + family.expectedCount, 0), 1157);
  assert.equal(contract.assetAllocation["title-and-shell"].items.length, 42);
  assert.equal(contract.assetAllocation["pilot-portraits"].perPilot.slots.length, 15);
  assert.equal(contract.assetAllocation["frame-construction"].perFrame.slots.length, 10);
  assert.equal(contract.assetAllocation["pilot-service-animation"].perPilot.slots.length, 18);
  assert.equal(contract.authority.providerMayDefineCanon, false);
  assert.equal(contract.authority.providerMayApproveArt, false);
  assert.equal(contract.authority.targetRepositoryMutationForbidden, true);
});

test("implemented runtime moves retain exact live timing while planned secondary specials remain blocked", async () => {
  const contract = await loadCombatPresentationContractFile(CONTRACT_PATH);
  const [bastion,viper,citadel,mirage] = ["bastion","viper","citadel","mirage"].map((id)=>contract.frames.find((frame)=>frame.id===id));
  assert.deepEqual(bastion.moves.find((move) => move.id === "rivet-driver").currentRuntimeTiming, {startup:7,active:4,recovery:15,damage:7});
  assert.deepEqual(viper.moves.find((move) => move.id === "neon-autopsy").currentRuntimeTiming, {startup:4,active:16,recovery:24,damage:25,knockdown:true});
  assert.deepEqual(citadel.moves.find((move) => move.id === "crown-engine").currentRuntimeTiming, {startup:6,active:14,recovery:26,damage:28,knockdown:true});
  assert.deepEqual(mirage.moves.find((move) => move.id === "black-geometry").currentRuntimeTiming, {startup:5,active:15,recovery:25,damage:26,knockdown:true});
  for (const frame of contract.frames) {
    const planned = frame.moves.find((move) => move.implementationStatus === "planned-runtime-not-implemented");
    const reversal = frame.moves.find((move) => move.category === "reversal");
    assert.equal(planned.runtimeMoveId, null);
    assert.ok(planned.productionGates.includes("blocked-until-game-move-contract"));
    assert.equal(reversal.sourceBank, reversal.plannedProductionBank);
    assert.notEqual(reversal.currentRuntimeBank, reversal.plannedProductionBank);
  }
});

test("unsafe presentation mutations fail closed", async () => {
  const contract = await loadCombatPresentationContractFile(CONTRACT_PATH);
  const authorityMutation = structuredClone(contract); delete authorityMutation.contractSha256; authorityMutation.authority.providerMayApproveArt = true;
  assert.throws(() => normalizeCombatPresentationContract(authorityMutation), /providerMayApproveArt must remain false/);
  const inventoryMutation = structuredClone(contract); delete inventoryMutation.contractSha256; inventoryMutation.assetAllocation["universal-combat-fx"].expectedCount = 114;
  assert.throws(() => normalizeCombatPresentationContract(inventoryMutation), /must retain 115 images/);
  const moveMutation = structuredClone(contract); delete moveMutation.contractSha256; moveMutation.frames[0].moves.find((move) => move.id === "anvil-lock").runtimeMoveId = "invented_runtime_move";
  assert.throws(() => normalizeCombatPresentationContract(moveMutation), /planned move must not claim a runtimeMoveId/);
  const pilotMutation = structuredClone(contract); delete pilotMutation.contractSha256; pilotMutation.pilotDesign.pilots[0].portraitSlots.pop();
  assert.throws(() => normalizeCombatPresentationContract(pilotMutation), /portraitSlots must contain at least 15 item|portraitSlots must match the allocated fifteen-slot portrait contract/);
  const sourceBankMutation = structuredClone(contract); delete sourceBankMutation.contractSha256; sourceBankMutation.frames[0].moves.find((move) => move.category === "reversal").sourceBank = "high-output-a";
  assert.throws(() => normalizeCombatPresentationContract(sourceBankMutation), /sourceBank must describe the authored production bank/);
  const introMutation = structuredClone(contract); delete introMutation.contractSha256; introMutation.openingIntro.shots.pop();
  assert.throws(() => normalizeCombatPresentationContract(introMutation), /opening intro must retain 30 full-screen cels/);
});
