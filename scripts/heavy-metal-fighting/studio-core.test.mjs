import assert from "node:assert/strict";
import test from "node:test";

import {
  compileHeavyMetalFightingStudioPlan,
  framePlan,
  handoffTemplate,
  runtimeSlotPlan,
  sourceCelPlan,
  studioSummary,
  styleProofPlan,
  verifyStudioPlan,
} from "./studio-core.mjs";
import { loadContract, syntheticCampaignPlan } from "./test-fixtures.mjs";

test("studio core separates 120 authored source cels from current and planned runtime slots", async () => {
  const studio = compileHeavyMetalFightingStudioPlan(syntheticCampaignPlan(), await loadContract());
  assert.match(studio.studioPlanSha256, /^[0-9a-f]{64}$/);
  assert.equal(studio.frames.length, 4);
  for (const frame of studio.frames) {
    assert.equal(frame.cells.length, 120);
    assert.deepEqual(frame.cells.map((cell) => cell.sourceIndex), Array.from({ length: 120 }, (_, index) => index));
    assert.equal(frame.cells[16].phase, "startup");
    assert.equal(frame.cells[20].heroImpact, true);
    assert.equal(frame.cells[24].phase, "recovery");
    assert.equal(frame.cells[25].phase, "startup");
    assert.equal(frame.cells[16].neighbourConditioning.previousUnitId, null);
    assert.equal(frame.cells[16].neighbourConditioning.nextUnitId, frame.cells[17].unitId);
    assert.deepEqual(frame.cells[24].currentRuntimeSlots, [24]);
    assert.deepEqual(frame.cells[25].currentRuntimeSlots, [24]);
    assert.deepEqual(frame.cells[24].plannedRuntimeSlots, [24]);
    assert.deepEqual(frame.cells[25].plannedRuntimeSlots, [25]);
    assert.equal(frame.cells[24].review.currentSharedBoundary, true);
    assert.equal(frame.cells[25].review.currentSharedBoundary, true);
    assert.equal(frame.cells[106].phase, "planned-utility");
    assert.deepEqual(frame.cells[106].currentRuntimeSlots, []);
    assert.deepEqual(frame.cells[106].plannedRuntimeSlots, [34]);
    assert.equal(frame.runtimeMappings.current.mappedSlots, 104);
    assert.equal(frame.runtimeMappings.current.reservedSlots.length, 16);
    assert.deepEqual(frame.runtimeMappings.current.collisions.map((collision) => collision.slot), [24, 44, 64, 84]);
    assert.ok(frame.runtimeMappings.current.collisions.every((collision) => collision.sources.length === 2));
    assert.equal(frame.runtimeMappings.plannedV2.mappedSlots, 120);
    assert.deepEqual(frame.runtimeMappings.plannedV2.reservedSlots, []);
    assert.deepEqual(frame.runtimeMappings.plannedV2.collisions, []);
  }
});

test("bounded source-cel and runtime-slot inspection exposes collisions and planned utility mappings", async () => {
  const studio = compileHeavyMetalFightingStudioPlan(syntheticCampaignPlan(), await loadContract());
  const sourceCel = sourceCelPlan(studio, "bastion", 25);
  assert.equal(sourceCel.cell.clipSemantic, "standing-heavy");
  assert.deepEqual(sourceCel.cell.currentRuntimeSlots, [24]);
  assert.deepEqual(sourceCel.cell.plannedRuntimeSlots, [25]);
  assert.equal(sourceCel.currentRuntimeBindings[0].collision, true);
  assert.equal(sourceCel.plannedRuntimeBindings[0].collision, false);

  const current = runtimeSlotPlan(studio, "bastion", "current", 24);
  const reserved = runtimeSlotPlan(studio, "bastion", "current", 34);
  const planned = runtimeSlotPlan(studio, "bastion", "planned-v2", 34);
  assert.equal(current.status, "collision");
  assert.deepEqual(current.binding.sources.map((source) => source.sourceIndex), [24, 25]);
  assert.equal(reserved.status, "reserved");
  assert.equal(planned.status, "mapped");
  assert.equal(planned.plannedUtilitySemantic, "walk-contact-b");
  assert.deepEqual(planned.binding.sources.map((source) => source.sourceIndex), [106]);
});

test("style proof exposes the current slot-24 collision and the collision-free planned map", async () => {
  const studio = compileHeavyMetalFightingStudioPlan(syntheticCampaignPlan(), await loadContract());
  const proof = styleProofPlan(studio);
  assert.equal(proof.frameId, "bastion");
  assert.equal(proof.pilotId, "branka-kovac");
  assert.equal(proof.arenaId, "foundry-nine");
  assert.equal(proof.status, "blocked-by-current-shared-cell-contract");
  assert.deepEqual(proof.currentSlotCollisions, [{
    slot: 24,
    semantics: ["rivet-driver-recovery", "gravebell-startup"],
  }]);
  assert.equal(proof.plannedSlotCollisions.length, 0);
  assert.equal(proof.frameRequirements.find((requirement) => requirement.semantic === "rivet-driver-recovery").sourceCell.sourceIndex, 24);
  assert.equal(proof.frameRequirements.find((requirement) => requirement.semantic === "gravebell-startup").sourceCell.sourceIndex, 25);
  assert.equal(proof.frameRequirements.find((requirement) => requirement.semantic === "walk-passing-left").sourceCell.currentRuntimeSlots.length, 0);
  assert.equal(proof.frameRequirements.find((requirement) => requirement.semantic === "walk-passing-left").sourceCell.plannedRuntimeSlot, 34);
  assert.ok(proof.supportingUnits.pilot.length > 0);
  assert.ok(proof.supportingUnits.title.length > 0);
  assert.ok(proof.supportingUnits.arena.length > 0);
  assert.ok(proof.supportingUnits.serviceBay.length > 0);
});

test("verification, summaries and handoff templates remain deterministic and non-mutating", async () => {
  const studio = compileHeavyMetalFightingStudioPlan(syntheticCampaignPlan(), await loadContract());
  const verification = verifyStudioPlan(studio);
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.every((check) => check.passed));
  const summary = studioSummary(studio);
  assert.equal(summary.inventory.observedSourceImages, 1157);
  const mirageSummary = summary.frames.find((frame) => frame.id === "mirage");
  assert.equal(mirageSummary.mirrorMode, "runtime-mirror-with-weapon-side-review");
  assert.equal(mirageSummary.authoredSourceCels, 120);
  assert.equal(mirageSummary.currentMappedRuntimeSlots, 104);
  assert.equal(mirageSummary.plannedMappedRuntimeSlots, 120);
  assert.equal(framePlan(studio, "citadel").pilot.name, "ESI QUARTEY");
  const handoff = handoffTemplate(studio, {
    gameRevisionSha: "b".repeat(40),
    liveSlotManifestSha256: "c".repeat(64),
  });
  assert.match(handoff.handoffTemplateSha256, /^[0-9a-f]{64}$/);
  assert.equal(handoff.requiredAuthoredSourceCelsPerFrame, 120);
  assert.equal(handoff.currentMappedRuntimeSlotsPerFrame, 104);
  assert.equal(handoff.plannedMappedRuntimeSlotsPerFrame, 120);
  assert.deepEqual(handoff.currentSharedBoundarySlots, [24, 44, 64, 84]);
  assert.equal(handoff.authority.targetRepositoryMutation, false);
  assert.equal(handoff.authority.gitPush, false);
});

