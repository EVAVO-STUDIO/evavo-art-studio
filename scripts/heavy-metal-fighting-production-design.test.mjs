import assert from "node:assert/strict";
import test from "node:test";

import {
  heavyMetalFightingAssetAllocation,
  heavyMetalFightingAttractModePlan,
  heavyMetalFightingCombatPresentationContract,
  heavyMetalFightingFrameMoveRoster,
  heavyMetalFightingIntroPlan,
  heavyMetalFightingMovePlan,
  heavyMetalFightingPilotPlan,
  heavyMetalFightingProductionReadiness,
  heavyMetalFightingScreenPlan,
  heavyMetalFightingSourceCel,
  heavyMetalFightingSuperPlan,
  heavyMetalFightingSummary,
  verifyHeavyMetalFightingStudio,
} from "./heavy-metal-fighting/studio-runtime.mjs";

test("production design binds the 1,157-image campaign to named launch art", async () => {
  const [summary, contract, allocation, verification] = await Promise.all([
    heavyMetalFightingSummary(),
    heavyMetalFightingCombatPresentationContract(),
    heavyMetalFightingAssetAllocation(),
    verifyHeavyMetalFightingStudio(),
  ]);
  assert.equal(summary.productionDesign.sourceImages, 1157);
  assert.equal(contract.frames.length, 4);
  assert.equal(contract.pilots.length, 4);
  assert.equal(contract.screens.length, 11);
  assert.equal(summary.productionDesign.pilots.length, 4);
  assert.equal(allocation.totalSourceImages, 1157);
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.some((check) => check.id === "production-production-asset-inventory" && check.passed));
});

test("move plans distinguish current runtime facts from blocked production targets", async () => {
  const implemented = await heavyMetalFightingMovePlan("bastion", "rivet-driver");
  const planned = await heavyMetalFightingMovePlan("bastion", "anvil-lock");
  const sharedReversal = await heavyMetalFightingMovePlan("bastion", "blow-off");
  assert.equal(implemented.move.runtimeMoveId, "bastion_piston_jab");
  assert.equal(implemented.productionStatus, "ready-for-bounded-source-cel-planning");
  assert.equal(planned.move.runtimeMoveId, null);
  assert.equal(planned.productionStatus, "blocked-or-conditional");
  assert.ok(planned.blockers.includes("blocked-until-game-move-contract"));
  assert.equal(sharedReversal.move.sourceBank, "high-output-b");
  assert.equal(sharedReversal.move.currentRuntimeBank, "high-output-a");
  assert.equal(sharedReversal.move.plannedProductionBank, "high-output-b");
  assert.ok(sharedReversal.blockers.includes("final-distinct-cels-blocked-until-atlas-v2"));
});

test("all four Frame rosters are complete and mechanically differentiated", async () => {
  for (const frameId of ["bastion", "viper", "citadel", "mirage"]) {
    const roster = await heavyMetalFightingFrameMoveRoster(frameId);
    assert.equal(roster.moves.length, 11);
    assert.equal(roster.moves.filter((move) => move.category.endsWith("normal")).length, 6);
    assert.equal(roster.moves.filter((move) => move.category === "special").length, 2);
    assert.equal(roster.moves.filter((move) => move.category === "overdrive").length, 1);
    assert.equal(roster.moves.filter((move) => move.category === "reversal").length, 1);
    assert.equal(new Set(Object.values(roster.banks)).size, 4);
  }
});

test("Pilot plans and enriched source cels preserve character identity and authored move banks", async () => {
  const branka = await heavyMetalFightingPilotPlan("branka-kovac");
  assert.equal(branka.pilot.name, "BRANKA KOVAC");
  assert.equal(branka.defaultFrame.id, "bastion");
  assert.equal(branka.requiredPortraitSlots.length, 15);
  assert.equal(branka.requiredServiceAnimationSlots.length, 18);
  assert.ok(branka.pilot.faceLocks.includes("broken-nose"));
  const heavyStartup = await heavyMetalFightingSourceCel("bastion", 25);
  assert.equal(heavyStartup.productionDesign.move.id, "gravebell");
  assert.equal(heavyStartup.productionDesign.framePurpose, "initial readable intent and attack lane");
  const reversalStartup = await heavyMetalFightingSourceCel("bastion", 97);
  assert.equal(reversalStartup.productionDesign.move.id, "blow-off");
  assert.equal(reversalStartup.productionDesign.productionBinding.sourceBank, "high-output-b");
  assert.equal(reversalStartup.productionDesign.productionBinding.currentRuntimeBank, "high-output-a");
  assert.equal(reversalStartup.productionDesign.productionBinding.currentRuntimeReuse, true);
});

test("select, HUD, super and intro plans expose exact era-authentic production requirements", async () => {
  const pilotSelect = await heavyMetalFightingScreenPlan("pilot-select");
  const frameSelect = await heavyMetalFightingScreenPlan("frame-select");
  const hud = await heavyMetalFightingScreenPlan("match-hud");
  const cutIn = await heavyMetalFightingScreenPlan("super-cut-in");
  const superPlan = await heavyMetalFightingSuperPlan("mirage");
  const intro = await heavyMetalFightingIntroPlan();
  const attract = await heavyMetalFightingAttractModePlan();
  const readiness = await heavyMetalFightingProductionReadiness();
  assert.equal(pilotSelect.screen.portraitStates.length, 2);
  assert.ok(frameSelect.screen.displayFields.includes("crew requirement"));
  assert.ok(hud.screen.states.includes("system-down"));
  assert.equal(cutIn.screen.timeline.length, 6);
  assert.deepEqual(superPlan.requiredAssetBindings.pilotPortraits, ["super-charge", "super-call", "super-resolve"]);
  assert.equal(superPlan.move.publicName, "BLACK GEOMETRY");
  assert.equal(intro.totalCels, 30);
  assert.equal(intro.totalHoldTicks, 798);
  assert.equal(intro.shots[0].id, "corporate-megacity-rain");
  assert.equal(intro.shots.at(-1).id, "title-lock");
  assert.equal(attract.attractMode.segments.length, 4);
  assert.ok(readiness.blockedUntilGameMigration.includes("separate reversal runtime banks"));
  assert.ok(readiness.readyNow.includes("Pilot identity and portrait planning"));
});

test("asset-family inspection returns exact allocations", async () => {
  const title = await heavyMetalFightingAssetAllocation("title-and-shell");
  const pilots = await heavyMetalFightingAssetAllocation("pilot-portraits");
  const frames = await heavyMetalFightingAssetAllocation("frame-animation");
  const fx = await heavyMetalFightingAssetAllocation("frame-specific-fx");
  assert.equal(title.family.expectedCount, 42);
  assert.equal(title.family.items.length, 42);
  assert.equal(pilots.family.expectedCount, 60);
  assert.equal(pilots.family.perPilot.slots.length, 15);
  assert.equal(frames.family.expectedCount, 480);
  assert.equal(frames.family.perFrame.count, 120);
  assert.equal(fx.family.expectedCount, 160);
  assert.ok(Object.values(fx.family.perFrame).every((groups) => Object.values(groups).reduce((sum, count) => sum + count, 0) === 40));
});
