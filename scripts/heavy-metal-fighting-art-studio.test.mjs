import assert from "node:assert/strict";
import test from "node:test";

import {
  heavyMetalFightingAssetAllocation, heavyMetalFightingAttractModePlan, heavyMetalFightingBatch,
  heavyMetalFightingCombatPresentationContract, heavyMetalFightingFrameMoveRoster, heavyMetalFightingFramePlan,
  heavyMetalFightingHandoffTemplate, heavyMetalFightingIntroPlan, heavyMetalFightingMechanicalContract,
  heavyMetalFightingMovePlan, heavyMetalFightingPilotPlan, heavyMetalFightingProductionReadiness,
  heavyMetalFightingRuntimeSlot, heavyMetalFightingScreenPlan, heavyMetalFightingSourceCel,
  heavyMetalFightingSpriteBank, heavyMetalFightingSpriteCensus,
  heavyMetalFightingStyleProof, heavyMetalFightingSummary, heavyMetalFightingSuperPlan,
  verifyHeavyMetalFightingStudio,
} from "./heavy-metal-fighting/studio-runtime.mjs";
import {
  ASSET_TOOL, ATTRACT_TOOL, BATCH_TOOL, CONTRACT_TOOL, FRAME_MOVES_TOOL, FRAME_TOOL,
  HANDOFF_TOOL, INTRO_TOOL, MOVE_TOOL, PILOT_TOOL, PRESENTATION_CONTRACT_TOOL, READINESS_TOOL,
  RUNTIME_SLOT_TOOL, SCREEN_TOOL, SOURCE_CEL_TOOL, SPRITE_BANK_TOOL, SPRITE_CENSUS_TOOL,
  STYLE_PROOF_TOOL, SUMMARY_TOOL, SUPER_TOOL, VERIFY_TOOL, callTool, toolDefinitions,
} from "./heavy-metal-fighting-art-studio-mcp.mjs";

const FRAME_IDS = ["bastion", "viper", "citadel", "mirage"];
const SHARED_BOUNDARIES = [24, 44, 64, 84];

test("the retained campaign compiles through mechanical, presentation and sprite-production authorities", async () => {
  const [summary, mechanical, presentation, spriteCensus, verification] = await Promise.all([
    heavyMetalFightingSummary(), heavyMetalFightingMechanicalContract(),
    heavyMetalFightingCombatPresentationContract(), heavyMetalFightingSpriteCensus(),
    verifyHeavyMetalFightingStudio(),
  ]);
  assert.equal(summary.campaignId, "heavy-metal-fighting-launch-four");
  assert.equal(summary.project.publicTitle, "HEAVY METAL FIGHTING");
  assert.equal(summary.project.technicalRepositoryId, "steel-dominion");
  assert.equal(summary.inventory.observedFamilies, 11);
  assert.equal(summary.inventory.observedSourceImages, 1157);
  assert.equal(summary.inventory.observedBatches, 119);
  assert.equal(summary.productionDesign.sourceImages, 1157);
  assert.equal(summary.spriteProduction.productionTotals.productionMasterSourceImages, 1573);
  assert.equal(summary.spriteProduction.productionMasterV3.usedBodySlotsPerFrame, 224);
  assert.deepEqual(summary.frames.map((frame) => frame.id), FRAME_IDS);
  assert.ok(summary.frames.every((frame) => frame.authoredSourceCels === 120));
  assert.equal(mechanical.clipBindings.length, 13);
  assert.equal(mechanical.frames.length, 4);
  assert.equal(presentation.frames.length, 4);
  assert.equal(presentation.pilots.length, 4);
  assert.equal(presentation.screens.length, 11);
  assert.equal(summary.productionDesign.pilots.length, 4);
  assert.equal(spriteCensus.productionMasterV3.slotsPerFrame, 256);
  assert.equal(spriteCensus.productionMasterV3.launchBodyCels, 896);
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.every((check) => check.passed));
});

test("production-master sprite census expands final body animation without pretending the current game already migrated", async () => {
  const census = await heavyMetalFightingSpriteCensus();
  assert.deepEqual(census.productionMasterV3.cell, { width: 160, height: 160 });
  assert.deepEqual(census.productionMasterV3.pivot, { x: 80, y: 152 });
  assert.equal(census.productionMasterV3.slotsPerFrame, 256);
  assert.equal(census.productionMasterV3.usedBodySlotsPerFrame, 224);
  assert.equal(census.productionMasterV3.reservedSlotsPerFrame, 32);
  assert.equal(census.productionMasterV3.migrationRequiredBeforeFinalPromotion, true);
  assert.equal(census.productionTotals.legacyFrameBodyCels, 480);
  assert.equal(census.productionTotals.productionMasterFrameBodyCels, 896);
  assert.equal(census.productionTotals.productionMasterSourceImages, 1573);
  assert.equal(census.banks.reduce((sum, bank) => sum + bank.count, 0), 224);
  const heavy = await heavyMetalFightingSpriteBank("standing-heavy");
  const overdrive = await heavyMetalFightingSpriteBank("overdrive");
  const result = await heavyMetalFightingSpriteBank("victory");
  assert.deepEqual(heavy.bank, { id:"standing-heavy", start:117, count:8, end:124, purpose:heavy.bank.purpose });
  assert.deepEqual(overdrive.bank, { id:"overdrive", start:178, count:14, end:191, purpose:overdrive.bank.purpose });
  assert.equal(result.bank.count, 6);
  assert.equal(heavy.finalPromotionBlockedUntilGameAtlasV3, true);
});

test("every compatibility Frame plan exposes source topology and current/planned runtime maps", async () => {
  for (const frameId of FRAME_IDS) {
    const frame = await heavyMetalFightingFramePlan(frameId);
    assert.equal(frame.id, frameId);
    assert.equal(frame.cells.length, 120);
    assert.deepEqual(frame.cells.map((cell) => cell.sourceIndex), Array.from({ length: 120 }, (_, index) => index));
    assert.equal(frame.clips.length, 13);
    assert.equal(frame.runtimeMappings.current.mappedSlots, 104);
    assert.equal(frame.runtimeMappings.current.reservedSlots.length, 16);
    assert.deepEqual(frame.runtimeMappings.current.collisions.map((collision) => collision.slot), SHARED_BOUNDARIES);
    assert.ok(frame.runtimeMappings.current.collisions.every((collision) => collision.sources.length === 2));
    assert.equal(frame.runtimeMappings.plannedV2.mappedSlots, 120);
    assert.deepEqual(frame.runtimeMappings.plannedV2.reservedSlots, []);
    assert.deepEqual(frame.runtimeMappings.plannedV2.collisions, []);
    assert.equal(frame.cells.filter((cell) => cell.phase === "planned-utility").length, 12);
  }
});

test("named move rosters expose implemented timings and blocked future banks", async () => {
  for (const frameId of FRAME_IDS) {
    const roster = await heavyMetalFightingFrameMoveRoster(frameId);
    assert.equal(roster.moves.length, 11);
    assert.equal(roster.moves.filter((move) => move.category.endsWith("normal")).length, 6);
    assert.equal(roster.moves.filter((move) => move.category === "special").length, 2);
    assert.equal(roster.moves.filter((move) => move.category === "reversal").length, 1);
    assert.equal(roster.moves.filter((move) => move.category === "overdrive").length, 1);
  }
  const current = await heavyMetalFightingMovePlan("viper", "blue-sever");
  const planned = await heavyMetalFightingMovePlan("viper", "switchback");
  assert.equal(current.move.runtimeMoveId, "arc_blade");
  assert.equal(current.move.currentRuntimeTiming.startup, 5);
  assert.equal(planned.move.runtimeMoveId, null);
  assert.ok(planned.blockers.includes("blocked-until-game-move-contract"));
});

test("Pilot identity and compatibility source-cel production enrichment are directly inspectable", async () => {
  const pilot = await heavyMetalFightingPilotPlan("parvaneh-razi");
  assert.equal(pilot.pilot.name, "PARVANEH RAZI");
  assert.equal(pilot.defaultFrame.id, "mirage");
  assert.equal(pilot.requiredPortraitSlots.length, 15);
  assert.equal(pilot.requiredServiceAnimationSlots.length, 18);
  const heavy = await heavyMetalFightingSourceCel("bastion", 25);
  assert.equal(heavy.productionDesign.move.id, "gravebell");
  assert.equal(heavy.productionDesign.productionBinding.sourceBank, "standing-heavy");
  const reversal = await heavyMetalFightingSourceCel("bastion", 97);
  assert.equal(reversal.productionDesign.move.id, "blow-off");
  assert.equal(reversal.productionDesign.productionBinding.currentRuntimeReuse, true);
  assert.ok(reversal.productionDesign.blockers.includes("final-distinct-cels-blocked-until-atlas-v2"));
});

test("the governed style proof retains exact compatibility source cels and the current slot-24 conflict", async () => {
  const proof = await heavyMetalFightingStyleProof();
  assert.equal(proof.id, "branka-bastion-foundry-nine");
  assert.equal(proof.pilotId, "branka-kovac");
  assert.equal(proof.frameId, "bastion");
  assert.equal(proof.status, "blocked-by-current-shared-cell-contract");
  assert.deepEqual(proof.currentSlotCollisions, [{slot:24,semantics:["rivet-driver-recovery","gravebell-startup"]}]);
  assert.deepEqual(proof.plannedSlotCollisions, []);
  assert.equal(proof.frameRequirements.length, 21);
  assert.ok(proof.supportingUnits.pilot.length > 0);
  assert.ok(proof.supportingUnits.title.length > 0);
  assert.ok(proof.supportingUnits.arena.length > 0);
  assert.ok(proof.supportingUnits.serviceBay.length > 0);
});

test("compatibility batch retrieval remains family-locked and one-image-per-work-unit", async () => {
  for (const batchNumber of [1, 5, 20, 60, 100, 119]) {
    const batch = await heavyMetalFightingBatch(batchNumber);
    assert.equal(batch.gameId, "heavy-metal-fighting");
    assert.ok(batch.requiredImages >= 1 && batch.requiredImages <= 10);
    assert.equal(batch.requiredImages, batch.units.length);
    assert.equal(new Set(batch.units.map((unit) => unit.familyId)).size, 1);
    assert.ok(batch.units.every((unit) => unit.prompt.includes("Deliver only this one asset/frame as one separate image.")));
    assert.equal(new Set(batch.units.map((unit) => unit.targetPath)).size, batch.units.length);
    assert.ok(batch.units.every((unit) => unit.productionDesign));
    for (const unit of batch.units.filter((unit) => unit.familyId === "frame-animation")) {
      assert.equal(unit.productionDesign.compatibilityOnly, true);
      assert.equal(unit.productionDesign.productionMasterV3RequiredForFinalBodyArt, true);
    }
  }
});

test("compatibility source-cel and runtime-slot inspection stay bounded", async () => {
  const sourceCel = await heavyMetalFightingSourceCel("bastion", 25);
  assert.equal(sourceCel.cell.sourceClipOrdinal, 2);
  assert.deepEqual(sourceCel.cell.currentRuntimeSlots, [24]);
  assert.deepEqual(sourceCel.cell.plannedRuntimeSlots, [25]);
  assert.equal(sourceCel.currentRuntimeBindings[0].collision, true);
  assert.equal(sourceCel.plannedRuntimeBindings[0].collision, false);
  assert.equal(sourceCel.productionDesign.move.id, "gravebell");
  assert.equal(sourceCel.productionDesign.framePurpose, "initial readable intent and attack lane");
  const current = await heavyMetalFightingRuntimeSlot("bastion", "current", 24);
  const reserved = await heavyMetalFightingRuntimeSlot("bastion", "current", 34);
  const planned = await heavyMetalFightingRuntimeSlot("bastion", "planned-v2", 34);
  assert.equal(current.status, "collision");
  assert.deepEqual(current.binding.sources.map((source) => source.sourceIndex), [24, 25]);
  assert.equal(reserved.status, "reserved");
  assert.equal(planned.status, "mapped");
  assert.equal(planned.plannedUtilitySemantic, "walk-contact-b");
});

test("title, selection, HUD, super, intro and assets are directly inspectable", async () => {
  const pilot = await heavyMetalFightingPilotPlan("branka-kovac");
  const pilotSelect = await heavyMetalFightingScreenPlan("pilot-select");
  const frameSelect = await heavyMetalFightingScreenPlan("frame-select");
  const hud = await heavyMetalFightingScreenPlan("match-hud");
  const superPlan = await heavyMetalFightingSuperPlan("citadel");
  const intro = await heavyMetalFightingIntroPlan();
  const attract = await heavyMetalFightingAttractModePlan();
  const readiness = await heavyMetalFightingProductionReadiness();
  const assets = await heavyMetalFightingAssetAllocation();
  assert.equal(pilot.pilot.name, "BRANKA KOVAC");
  assert.ok(pilotSelect.screen.displayFields.includes("pilot name"));
  assert.ok(frameSelect.screen.displayFields.includes("CORE type"));
  assert.ok(hud.screen.states.includes("reignition"));
  assert.equal(superPlan.move.publicName, "CROWN ENGINE");
  assert.deepEqual(superPlan.requiredAssetBindings.pilotPortraits, ["super-charge", "super-call", "super-resolve"]);
  assert.equal(intro.totalCels, 30);
  assert.equal(intro.totalHoldTicks, 798);
  assert.equal(attract.attractMode.segments.length, 4);
  assert.ok(readiness.blockedUntilGameMigration.includes("separate reversal runtime banks"));
  assert.equal(assets.totalSourceImages, 1157);
});

test("the dedicated MCP exposes compatibility and production-master sprite planning without write authority", async () => {
  assert.deepEqual(toolDefinitions().map((tool) => tool.name), [SUMMARY_TOOL,CONTRACT_TOOL,PRESENTATION_CONTRACT_TOOL,SPRITE_CENSUS_TOOL,SPRITE_BANK_TOOL,PILOT_TOOL,FRAME_TOOL,FRAME_MOVES_TOOL,MOVE_TOOL,SOURCE_CEL_TOOL,RUNTIME_SLOT_TOOL,SCREEN_TOOL,SUPER_TOOL,INTRO_TOOL,ATTRACT_TOOL,READINESS_TOOL,ASSET_TOOL,BATCH_TOOL,STYLE_PROOF_TOOL,VERIFY_TOOL,HANDOFF_TOOL]);
  const summary = await callTool(SUMMARY_TOOL);
  const presentation = await callTool(PRESENTATION_CONTRACT_TOOL);
  const spriteCensus = await callTool(SPRITE_CENSUS_TOOL);
  const spriteBank = await callTool(SPRITE_BANK_TOOL, { bankId: "overdrive" });
  const pilot = await callTool(PILOT_TOOL, { pilotId: "miho-tagawa" });
  const roster = await callTool(FRAME_MOVES_TOOL, { frameId: "mirage" });
  const move = await callTool(MOVE_TOOL, { frameId: "mirage", moveId: "black-geometry" });
  const screen = await callTool(SCREEN_TOOL, { screenId: "pilot-select" });
  const superPlan = await callTool(SUPER_TOOL, { frameId: "bastion" });
  const intro = await callTool(INTRO_TOOL);
  const attract = await callTool(ATTRACT_TOOL);
  const readiness = await callTool(READINESS_TOOL);
  const assets = await callTool(ASSET_TOOL, { familyId: "pilot-portraits" });
  const verification = await callTool(VERIFY_TOOL);
  assert.equal(summary.inventory.observedSourceImages, 1157);
  assert.equal(summary.spriteProduction.productionTotals.productionMasterSourceImages, 1573);
  assert.equal(presentation.frames.length, 4);
  assert.equal(spriteCensus.productionMasterV3.usedBodySlotsPerFrame, 224);
  assert.equal(spriteBank.bank.count, 14);
  assert.equal(pilot.pilot.name, "MIHO TAGAWA");
  assert.equal(roster.moves.length, 11);
  assert.equal(move.move.publicName, "BLACK GEOMETRY");
  assert.equal(screen.screen.id, "pilot-select");
  assert.equal(superPlan.move.publicName, "KILN VERDICT");
  assert.equal(intro.totalCels, 30);
  assert.equal(attract.attractMode.segments.length, 4);
  assert.ok(readiness.readyNow.length > 0);
  assert.equal(assets.family.expectedCount, 60);
  assert.equal(verification.status, "passed");
  await assert.rejects(callTool("evavo_heavy_metal_fighting_generate", {}), /Unknown or prohibited/);
});

test("handoff templates bind game, slot, presentation and sprite-census revisions without mutation authority", async () => {
  const handoff = await heavyMetalFightingHandoffTemplate({gameRevisionSha:"c".repeat(40),liveSlotManifestSha256:"d".repeat(64)});
  assert.equal(handoff.requiredAuthoredSourceCelsPerFrame, 120);
  assert.equal(handoff.currentMappedRuntimeSlotsPerFrame, 104);
  assert.equal(handoff.plannedMappedRuntimeSlotsPerFrame, 120);
  assert.deepEqual(handoff.currentSharedBoundarySlots, SHARED_BOUNDARIES);
  assert.match(handoff.combatPresentationContractSha256, /^[0-9a-f]{64}$/);
  assert.match(handoff.spriteProductionCensusSha256, /^[0-9a-f]{64}$/);
  assert.equal(handoff.productionMasterBodyCelsPerFrame, 224);
  assert.equal(handoff.productionMasterAtlasSlotsPerFrame, 256);
  assert.equal(handoff.productionMasterFinalPromotionBlocked, true);
  assert.match(handoff.combinedHandoffSha256, /^[0-9a-f]{64}$/);
  assert.equal(handoff.gameRevisionReviewStatus, "requires-fresh-live-game-source-review");
  assert.equal(handoff.authority.candidatePromotion, false);
  assert.equal(handoff.authority.publication, false);
});
