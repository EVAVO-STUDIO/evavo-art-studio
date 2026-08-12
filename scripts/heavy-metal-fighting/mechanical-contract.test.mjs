import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMechanicalContract } from "./mechanical-contract.mjs";
import { loadContract } from "./test-fixtures.mjs";

test("mechanical contract locks all four distinct Frame identities and authority boundaries", async () => {
  const normalized = await loadContract();
  assert.match(normalized.contractSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(normalized.frames.map((frame) => frame.id), ["bastion", "viper", "citadel", "mirage"]);
  assert.equal(new Set(normalized.frames.map((frame) => frame.motionIdentity)).size, 4);
  assert.ok(normalized.frames.every((frame) => frame.landmarks.length >= 18));
  assert.ok(normalized.frames.every((frame) => frame.hardpoints.length >= 5));
  assert.equal(normalized.authority.providerMayDefineCanon, false);
  assert.equal(normalized.authority.providerMayGeneratePackedRuntimeAtlas, false);
  assert.equal(normalized.authority.targetRepositoryMutationForbidden, true);
  assert.equal(normalized.plannedAtlasV2.status, "planned-not-authoritative");
  assert.equal(normalized.clipBindings.length, 13);
  assert.equal(normalized.clipBindings.reduce((sum, binding) => sum + binding.expectedFrames, 0), 120);
  assert.equal(new Set(normalized.clipBindings.flatMap((binding) => binding.plannedRuntimeSlots)).size, 120);
  assert.deepEqual(
    normalized.clipBindings.filter((binding) => binding.currentRuntimeSlots.length === 0).map((binding) => binding.semantic),
    ["utility-v2-planned"],
  );
});

test("unsafe mechanical mutations fail closed", async () => {
  const raw = structuredClone(await loadContract());
  const canonMutation = structuredClone(raw);
  canonMutation.authority.providerMayDefineCanon = true;
  assert.throws(() => normalizeMechanicalContract(canonMutation), /providerMayDefineCanon must remain false/);

  const missingLandmark = structuredClone(raw);
  missingLandmark.frames[0].landmarks.find((landmark) => landmark.id === "left-foot-contact").id = "left-foot-contact-extra";
  assert.throws(() => normalizeMechanicalContract(missingLandmark), /missing required landmark left-foot-contact/);

  const brokenCurrentMap = structuredClone(raw);
  brokenCurrentMap.clipBindings[2].currentRuntimeSlots[0] = 25;
  assert.throws(() => normalizeMechanicalContract(brokenCurrentMap), /duplicate value 25|current clip bindings must collide only at shared boundary slots/);

  const brokenPlannedMap = structuredClone(raw);
  brokenPlannedMap.clipBindings[11].plannedRuntimeSlots[0] = 35;
  assert.throws(() => normalizeMechanicalContract(brokenPlannedMap), /duplicate value 35|one authored source cel to every runtime slot/);

  const bakedEffect = structuredClone(raw);
  bakedEffect.frames[3].bodyEffectBoundary.bodyOwned.push("illegal-baked-field");
  bakedEffect.frames[3].bodyEffectBoundary.effectOwned.push("illegal-baked-field");
  assert.throws(() => normalizeMechanicalContract(bakedEffect), /body\/effect ownership overlaps/);
});
