import assert from "node:assert/strict";
import test from "node:test";

import {
  heavyMetalFightingBatch,
  heavyMetalFightingFramePlan,
  heavyMetalFightingHandoffTemplate,
  heavyMetalFightingMechanicalContract,
  heavyMetalFightingRuntimeSlot,
  heavyMetalFightingSourceCel,
  heavyMetalFightingStyleProof,
  heavyMetalFightingSummary,
  verifyHeavyMetalFightingStudio,
} from "./heavy-metal-fighting/studio-runtime.mjs";
import {
  BATCH_TOOL,
  CONTRACT_TOOL,
  FRAME_TOOL,
  HANDOFF_TOOL,
  RUNTIME_SLOT_TOOL,
  SOURCE_CEL_TOOL,
  STYLE_PROOF_TOOL,
  SUMMARY_TOOL,
  VERIFY_TOOL,
  callTool,
  toolDefinitions,
} from "./heavy-metal-fighting-art-studio-mcp.mjs";

const FRAME_IDS = ["bastion", "viper", "citadel", "mirage"];
const SHARED_BOUNDARIES = [24, 44, 64, 84];

test("the retained HEAVY METAL FIGHTING campaign compiles through the first-class Art Studio adapter", async () => {
  const [summary, contract, verification] = await Promise.all([
    heavyMetalFightingSummary(),
    heavyMetalFightingMechanicalContract(),
    verifyHeavyMetalFightingStudio(),
  ]);

  assert.equal(summary.campaignId, "heavy-metal-fighting-launch-four");
  assert.equal(summary.project.publicTitle, "HEAVY METAL FIGHTING");
  assert.equal(summary.project.technicalRepositoryId, "steel-dominion");
  assert.equal(summary.inventory.observedFamilies, 11);
  assert.equal(summary.inventory.observedSourceImages, 1157);
  assert.equal(summary.inventory.observedBatches, 119);
  assert.deepEqual(summary.frames.map((frame) => frame.id), FRAME_IDS);
  assert.ok(summary.frames.every((frame) => frame.authoredSourceCels === 120));
  assert.ok(summary.frames.every((frame) => frame.currentMappedRuntimeSlots === 104));
  assert.ok(summary.frames.every((frame) => frame.currentReservedRuntimeSlots === 16));
  assert.ok(summary.frames.every((frame) => frame.currentSharedBoundarySlots === 4));
  assert.ok(summary.frames.every((frame) => frame.plannedMappedRuntimeSlots === 120));
  assert.equal(contract.clipBindings.length, 13);
  assert.equal(contract.frames.length, 4);
  assert.equal(verification.status, "passed");
  assert.ok(verification.checks.every((check) => check.passed));
});

test("every Frame plan exposes source topology, current collisions and collision-free planned bindings", async () => {
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
    assert.ok(frame.cells.every((cell) => cell.neighbourConditioning.canonicalIdentity === `${frameId}:gameplay-identity-master`));
  }
});

test("the governed style proof resolves exact source cels while exposing the current slot-24 conflict", async () => {
  const proof = await heavyMetalFightingStyleProof();
  assert.equal(proof.id, "branka-bastion-foundry-nine");
  assert.equal(proof.pilotId, "branka-kovac");
  assert.equal(proof.frameId, "bastion");
  assert.equal(proof.arenaId, "foundry-nine");
  assert.equal(proof.environmentId, "danube-works-service-cradle");
  assert.equal(proof.status, "blocked-by-current-shared-cell-contract");
  assert.deepEqual(proof.currentSlotCollisions, [{
    slot: 24,
    semantics: ["rivet-driver-recovery", "gravebell-startup"],
  }]);
  assert.deepEqual(proof.plannedSlotCollisions, []);
  assert.equal(proof.frameRequirements.length, 21);
  assert.ok(proof.frameRequirements.every((requirement) => Number.isInteger(requirement.sourceCell.sourceIndex)));
  assert.ok(proof.supportingUnits.pilot.length > 0);
  assert.ok(proof.supportingUnits.title.length > 0);
  assert.ok(proof.supportingUnits.arena.length > 0);
  assert.ok(proof.supportingUnits.serviceBay.length > 0);
});

test("batch retrieval remains family-locked and one-image-per-work-unit", async () => {
  for (const batchNumber of [1, 5, 20, 60, 100, 119]) {
    const batch = await heavyMetalFightingBatch(batchNumber);
    assert.equal(batch.gameId, "heavy-metal-fighting");
    assert.ok(batch.requiredImages >= 1 && batch.requiredImages <= 10);
    assert.equal(batch.requiredImages, batch.units.length);
    assert.equal(new Set(batch.units.map((unit) => unit.familyId)).size, 1);
    assert.ok(batch.units.every((unit) => unit.prompt.includes("Deliver only this one asset/frame as one separate image.")));
    assert.equal(new Set(batch.units.map((unit) => unit.targetPath)).size, batch.units.length);
  }
});

test("source-cel and runtime-slot inspection return bounded review data without loading a whole Frame plan", async () => {
  const sourceCel = await heavyMetalFightingSourceCel("bastion", 25);
  assert.equal(sourceCel.cell.sourceClipOrdinal, 2);
  assert.equal(sourceCel.cell.frameIndex, 0);
  assert.deepEqual(sourceCel.cell.currentRuntimeSlots, [24]);
  assert.deepEqual(sourceCel.cell.plannedRuntimeSlots, [25]);
  assert.equal(sourceCel.currentRuntimeBindings[0].collision, true);
  assert.equal(sourceCel.plannedRuntimeBindings[0].collision, false);

  const current = await heavyMetalFightingRuntimeSlot("bastion", "current", 24);
  const reserved = await heavyMetalFightingRuntimeSlot("bastion", "current", 34);
  const planned = await heavyMetalFightingRuntimeSlot("bastion", "planned-v2", 34);
  assert.equal(current.status, "collision");
  assert.deepEqual(current.binding.sources.map((source) => source.sourceIndex), [24, 25]);
  assert.equal(reserved.status, "reserved");
  assert.equal(reserved.binding, null);
  assert.equal(planned.status, "mapped");
  assert.equal(planned.plannedUtilitySemantic, "walk-contact-b");
  assert.deepEqual(planned.binding.sources.map((source) => source.sourceIndex), [106]);
});

test("the dedicated MCP is read-only and exposes the full production and review surface", async () => {
  assert.deepEqual(toolDefinitions().map((tool) => tool.name), [
    SUMMARY_TOOL,
    CONTRACT_TOOL,
    FRAME_TOOL,
    SOURCE_CEL_TOOL,
    RUNTIME_SLOT_TOOL,
    BATCH_TOOL,
    STYLE_PROOF_TOOL,
    VERIFY_TOOL,
    HANDOFF_TOOL,
  ]);

  const summary = await callTool(SUMMARY_TOOL);
  const frame = await callTool(FRAME_TOOL, { frameId: "mirage" });
  const sourceCel = await callTool(SOURCE_CEL_TOOL, { frameId: "bastion", sourceIndex: 25 });
  const currentSlot = await callTool(RUNTIME_SLOT_TOOL, { frameId: "bastion", mapName: "current", slot: 24 });
  const plannedSlot = await callTool(RUNTIME_SLOT_TOOL, { frameId: "bastion", mapName: "planned-v2", slot: 25 });
  const batch = await callTool(BATCH_TOOL, { batchNumber: 1 });
  const verification = await callTool(VERIFY_TOOL);
  const handoff = await callTool(HANDOFF_TOOL, {
    gameRevisionSha: "a".repeat(40),
    liveSlotManifestSha256: "b".repeat(64),
  });

  assert.equal(summary.inventory.observedSourceImages, 1157);
  assert.equal(frame.id, "mirage");
  assert.equal(sourceCel.cell.sourceIndex, 25);
  assert.deepEqual(sourceCel.cell.currentRuntimeSlots, [24]);
  assert.equal(currentSlot.status, "collision");
  assert.equal(currentSlot.binding.sources.length, 2);
  assert.equal(plannedSlot.status, "mapped");
  assert.equal(plannedSlot.binding.sources.length, 1);
  assert.ok(batch.units.length <= 10);
  assert.equal(verification.status, "passed");
  assert.equal(handoff.authority.providerExecution, false);
  assert.equal(handoff.authority.targetRepositoryMutation, false);
  assert.equal(handoff.authority.gitCommit, false);
  assert.equal(handoff.authority.gitPush, false);
  await assert.rejects(callTool("evavo_heavy_metal_fighting_generate", {}), /Unknown or prohibited/);
});


test("handoff templates bind exact game and slot-manifest revisions without gaining mutation authority", async () => {
  const handoff = await heavyMetalFightingHandoffTemplate({
    gameRevisionSha: "c".repeat(40),
    liveSlotManifestSha256: "d".repeat(64),
  });
  assert.equal(handoff.requiredAuthoredSourceCelsPerFrame, 120);
  assert.equal(handoff.currentMappedRuntimeSlotsPerFrame, 104);
  assert.equal(handoff.plannedMappedRuntimeSlotsPerFrame, 120);
  assert.deepEqual(handoff.currentSharedBoundarySlots, SHARED_BOUNDARIES);
  assert.match(handoff.handoffTemplateSha256, /^[0-9a-f]{64}$/);
  assert.equal(handoff.authority.candidatePromotion, false);
  assert.equal(handoff.authority.publication, false);
});
